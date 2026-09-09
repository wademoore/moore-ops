// Reproduces the measurement behind the "they do not need to move to WORK" claim in
// INSTALL.md. Review flagged that the claim rested on an ad-hoc run with nothing
// committed to reproduce it; this is that run, committed.
//
// It copies require-review.mjs to an unrelated nested temp directory, drives BOTH
// copies with the identical payload against one throwaway repository, and compares
// exit code and stderr byte-for-byte. stdout is not compared: it carries the
// non-blocking additionalContext only, and neither copy emits it on this path.
//
// Run: node scratch/reviewer-gate-install/location-independence.mjs
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
const ORIGIN = join(REPO, 'scratch', 'reviewer-gate', 'require-review.mjs');

const tmp = mkdtempSync(join(tmpdir(), 'reviewer-gate-location-'));
const repo = join(tmp, 'repo');
mkdirSync(repo);
const git = (...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
git('init', '--quiet');
git('symbolic-ref', 'HEAD', 'refs/heads/main');
git('config', 'user.email', 'loc@example.com');
git('config', 'user.name', 'Loc');
git('config', 'commit.gpgsign', 'false');
writeFileSync(join(repo, 'a.txt'), 'a\n');
git('add', '-A'); git('commit', '--quiet', '-m', 'base');
git('update-ref', 'refs/remotes/origin/main', git('rev-parse', 'HEAD'));
git('checkout', '--quiet', '-b', 'feature');
writeFileSync(join(repo, 'b.txt'), 'b\n');
git('add', '-A'); git('commit', '--quiet', '-m', 'work');

const far = join(tmp, 'unrelated', 'deeply', 'nested');
mkdirSync(far, { recursive: true });
const copy = join(far, 'require-review.mjs');
copyFileSync(ORIGIN, copy);

const payload = JSON.stringify({
  session_id: 'loc-test', transcript_path: '', cwd: repo,
  hook_event_name: 'Stop', stop_hook_active: false,
});
const drive = (script) => {
  const r = spawnSync(process.execPath, [script], { input: payload, encoding: 'utf8', cwd: repo });
  return { code: r.status, stderr: r.stderr || '' };
};

const a = drive(ORIGIN);
const b = drive(copy);
const same = a.code === b.code && a.stderr === b.stderr;

console.log(`in-repo copy : ${ORIGIN.replace(REPO + '/', '')}`);
console.log(`far copy     : ${copy.replace(tmp, '<tmp>')}`);
console.log(`exit codes   : ${a.code} / ${b.code}`);
console.log(`stderr bytes : ${Buffer.byteLength(a.stderr)} / ${Buffer.byteLength(b.stderr)}`);
console.log(`identical    : ${same ? 'YES — location-independent' : 'NO — location-DEPENDENT'}`);
if (same) console.log(`\n${a.stderr.trimEnd().split('\n').map((l) => `  | ${l}`).join('\n')}`);
rmSync(tmp, { recursive: true, force: true });
process.exit(same ? 0 : 1);
