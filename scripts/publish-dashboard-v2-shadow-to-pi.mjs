import { createHash, randomBytes } from 'node:crypto';
import { appendFile, mkdir, open, readFile, rm, stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PI_TARGET = 'pi@192.168.1.4';
const PI_IDENTITY = 'C:/Users/wadem/.ssh/moore_ops_pi';
const SHADOW_DIR = '/home/pi/moore-dashboard/shadow';
const SHADOW_FILE = `${SHADOW_DIR}/index.html`;
const SHADOW_SERVICE = 'moore-dashboard-shadow.service';
const SHADOW_URL = 'http://127.0.0.1:4174/index.html';
const PREVIEW_PATH = resolve(ROOT, 'preview/dashboard-v2-shadow/latest.html');
const SERVICE_PATH = resolve(ROOT, 'infrastructure/pi-dashboard/moore-dashboard-shadow.service');
const PUBLISH_LOCK_PATH = resolve(ROOT, 'preview/dashboard-v2-shadow/.publish.lock');
const PUBLISH_LOG_PATH = resolve(ROOT, 'preview/dashboard-v2-shadow/publish.log');
const MIN_BYTES = 1_000_000;
const MAX_BYTES = 8_000_000;
const REQUIRED_MARKERS = ['today-panel', 'upcoming-panel', 'athletics-panel', 'right-rail', 'sports-ticker', 'now-next'];
const FORBIDDEN = [/client_secret/i, /refresh_token/i, /access[_-]?token/i, /credentials\.json/i, /token\.json/i, /selection-history/i, /latest\.json/i];

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function validateShadowHtml(bytes) {
  if (!Buffer.isBuffer(bytes)) bytes = Buffer.from(bytes);
  if (bytes.length < MIN_BYTES || bytes.length > MAX_BYTES) throw new Error('Shadow HTML size is outside the allowed range.');
  const html = bytes.toString('utf8');
  if (!/^\s*<!doctype html>/i.test(html) || !/<html[\s>]/i.test(html) || !/<\/html>\s*$/i.test(html)) {
    throw new Error('Shadow HTML document structure is invalid.');
  }
  for (const marker of REQUIRED_MARKERS) if (!html.includes(marker)) throw new Error(`Shadow HTML is missing required marker: ${marker}`);
  for (const pattern of FORBIDDEN) if (pattern.test(html)) throw new Error(`Shadow HTML contains forbidden material: ${pattern.source}`);
  if (!/data-sports-url=""/.test(html)) throw new Error('Shadow HTML must disable live sports polling.');
  if (/data-sports-url="[^"]+"/.test(html)) throw new Error('Shadow HTML contains an active sports endpoint.');
  if (!/<meta http-equiv="refresh" content="300">/i.test(html)) throw new Error('Shadow HTML must reload every five minutes.');
  if (/(?:src|href)="https?:\/\//i.test(html)) throw new Error('Shadow HTML is not self-contained.');
  return { size: bytes.length, sha256: sha256(bytes) };
}

function runProcess(command, args, { input, env = process.env } = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd: ROOT, env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    const stdout = [];
    const stderr = [];
    child.stdout.on('data', chunk => stdout.push(chunk));
    child.stderr.on('data', chunk => stderr.push(chunk));
    child.on('error', reject);
    child.on('close', code => {
      const result = { code, stdout: Buffer.concat(stdout).toString('utf8'), stderr: Buffer.concat(stderr).toString('utf8') };
      if (code === 0) resolvePromise(result);
      else reject(new Error(`${command} failed with exit code ${code}: ${result.stderr.trim() || result.stdout.trim()}`));
    });
    if (input) child.stdin.end(input);
    else child.stdin.end();
  });
}

function sshArgs(command) {
  return ['-i', PI_IDENTITY, '-o', 'IdentitiesOnly=yes', '-o', 'BatchMode=yes', PI_TARGET, command];
}

function scpArgs(source, destination) {
  return ['-i', PI_IDENTITY, '-o', 'IdentitiesOnly=yes', '-o', 'BatchMode=yes', '-q', source, `${PI_TARGET}:${destination}`];
}

async function selectedReasonCode() {
  try {
    const diagnostic = JSON.parse(await readFile(resolve(ROOT, 'preview/dashboard-v2-shadow/latest.json'), 'utf8'));
    return diagnostic?.selected?.reasonCode || null;
  } catch {
    return null;
  }
}

async function writeOperationalLog({ status, reasonCode = null, checksum = null }) {
  await mkdir(dirname(PUBLISH_LOG_PATH), { recursive: true });
  const record = { at: new Date().toISOString(), status, reasonCode, checksum };
  await appendFile(PUBLISH_LOG_PATH, `${JSON.stringify(record)}\n`, 'utf8');
}

const PRODUCTION_SNAPSHOT_COMMAND = [
  'set -eu',
  'printf "current=%s\\n" "$(readlink -f /home/pi/moore-dashboard/current)"',
  'printf "service=%s\\n" "$(systemctl is-active moore-dashboard.service)"',
  'printf "service_enabled=%s\\n" "$(systemctl is-enabled moore-dashboard.service)"',
  'printf "refresh=%s\\n" "$(systemctl is-active moore-dashboard-refresh.timer)"',
  'printf "refresh_enabled=%s\\n" "$(systemctl is-enabled moore-dashboard-refresh.timer)"',
  'printf "port4173=%s\\n" "$(ss -ltnH | awk \'$4 ~ /127\\.0\\.0\\.1:4173$/ {print $4}\')"',
].join('; ');

function remoteInstallCommand() {
  return [
    'set -eu',
    `sudo -n install -d -o pi -g pi -m 0700 ${SHADOW_DIR}`,
    `sudo -n install -o root -g root -m 0644 /dev/stdin /etc/systemd/system/${SHADOW_SERVICE}`,
    'sudo -n systemctl daemon-reload',
    `sudo -n systemctl enable --now ${SHADOW_SERVICE}`,
  ].join('; ');
}

function remotePublishCommand({ temporaryPath, expectedSize, expectedSha256 }) {
  if (!temporaryPath.startsWith(`${SHADOW_DIR}/.index.html.`) || !temporaryPath.endsWith('.tmp')) throw new Error('Unsafe Pi temporary path.');
  if (!Number.isInteger(expectedSize) || !/^[a-f0-9]{64}$/.test(expectedSha256)) throw new Error('Invalid publish evidence.');
  return [
    'set -eu',
    `tmp='${temporaryPath}'`,
    `dest='${SHADOW_FILE}'`,
    'test "$(dirname -- "$tmp")" = "$(dirname -- "$dest")"',
    'test ! -L "$tmp"',
    'test -f "$tmp"',
    `test "$(wc -c < "$tmp")" -eq ${expectedSize}`,
    `test "$(sha256sum "$tmp" | awk '{print $1}')" = '${expectedSha256}'`,
    `test ${expectedSize} -ge ${MIN_BYTES} -a ${expectedSize} -le ${MAX_BYTES}`,
    `grep -qi '<!doctype html>' "$tmp"`,
    ...REQUIRED_MARKERS.map(marker => `grep -q '${marker}' "$tmp"`),
    `grep -q 'data-sports-url=""' "$tmp"`,
    `grep -qi '<meta http-equiv="refresh" content="300">' "$tmp"`,
    `! grep -Eq 'data-sports-url="[^"]+"|client_secret|refresh_token|access[_-]?token|credentials\\.json|token\\.json|selection-history|latest\\.json' "$tmp"`,
    'chmod 0600 "$tmp"',
    'chown pi:pi "$tmp"',
    'mv -f -- "$tmp" "$dest"',
    'test -f "$dest"',
  ].join('; ');
}

function remoteVerifyCommand(expectedSha256) {
  return [
    'set -eu',
    `test "$(systemctl is-active ${SHADOW_SERVICE})" = active`,
    `test "$(systemctl is-enabled ${SHADOW_SERVICE})" = enabled`,
    `test "$(ss -ltnH | awk '$4 ~ /127\\.0\\.0\\.1:4174$/ {print $4}')" = '127.0.0.1:4174'`,
    `test -z "$(ss -ltnH | awk '$4 ~ /(^|[^0-9])4174$/ && $4 !~ /127\\.0\\.0\\.1:4174$/ {print $4}')"`,
    `test "$(curl -fsS ${SHADOW_URL} | sha256sum | awk '{print $1}')" = '${expectedSha256}'`,
    `test "$(find ${SHADOW_DIR} -maxdepth 1 -type f -printf '%f\\n' | sort)" = 'index.html'`,
    `test "$(systemctl is-active moore-dashboard.service)" = active`,
    `curl -fsS http://127.0.0.1:4173/index.html >/dev/null`,
  ].join('; ');
}

async function publish({ runner = runProcess } = {}) {
  await mkdir(dirname(PUBLISH_LOCK_PATH), { recursive: true });
  let lock;
  try {
    lock = await open(PUBLISH_LOCK_PATH, 'wx');
  } catch (error) {
    if (error.code === 'EEXIST') throw new Error('A NOW/NEXT shadow publish is already running.');
    throw error;
  }
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
    if (!(await stat(PI_IDENTITY)).isFile()) throw new Error('The dedicated Pi identity is unavailable.');
    const preflight = await runner('ssh', sshArgs(PRODUCTION_SNAPSHOT_COMMAND));
    await runner(process.execPath, [resolve(ROOT, 'scripts/dashboard-v2-now-next-shadow.mjs')], {
      env: { ...process.env, NOW_NEXT_SHADOW_DISABLE_LIVE_SPORTS: '1' },
    });
    const html = await readFile(PREVIEW_PATH);
    const evidence = validateShadowHtml(html);

    await runner('ssh', sshArgs(remoteInstallCommand()), { input: await readFile(SERVICE_PATH) });

    const temporaryPath = `${SHADOW_DIR}/.index.html.${randomBytes(8).toString('hex')}.tmp`;
    try {
      await runner('scp', scpArgs(PREVIEW_PATH, temporaryPath));
      await runner('ssh', sshArgs(remotePublishCommand({ temporaryPath, expectedSize: evidence.size, expectedSha256: evidence.sha256 })));
    } catch (error) {
      await runner('ssh', sshArgs(`rm -f -- '${temporaryPath}'`)).catch(() => {});
      throw error;
    }

    await runner('ssh', sshArgs(remoteVerifyCommand(evidence.sha256)));
    const postflight = await runner('ssh', sshArgs(PRODUCTION_SNAPSHOT_COMMAND));
    if (preflight.stdout !== postflight.stdout) throw new Error('Production Pi state changed during shadow publish.');
    return { ...evidence, reasonCode: await selectedReasonCode(), url: SHADOW_URL };
  } finally {
    try { await lock.close(); } finally { await rm(PUBLISH_LOCK_PATH, { force: true }); }
  }
}

async function main() {
  try {
    const result = await publish();
    await writeOperationalLog({ status: 'success', reasonCode: result.reasonCode, checksum: result.sha256 });
    console.log(`Shadow preview published and verified: ${result.url}`);
  } catch {
    await writeOperationalLog({ status: 'failure', reasonCode: await selectedReasonCode(), checksum: null });
    console.error('Shadow preview publish failed; see the redacted operational log.');
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) await main();

export {
  PI_TARGET,
  PI_IDENTITY,
  PREVIEW_PATH,
  PRODUCTION_SNAPSHOT_COMMAND,
  SHADOW_DIR,
  SHADOW_FILE,
  SHADOW_URL,
  publish,
  scpArgs,
  sshArgs,
  writeOperationalLog,
  remoteInstallCommand,
  remotePublishCommand,
  remoteVerifyCommand,
  validateShadowHtml,
};
