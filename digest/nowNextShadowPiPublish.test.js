import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  PRODUCTION_SNAPSHOT_COMMAND,
  PI_IDENTITY,
  SHADOW_DIR,
  SHADOW_FILE,
  SHADOW_URL,
  remoteInstallCommand,
  remotePublishCommand,
  remoteVerifyCommand,
  scpArgs,
  sshArgs,
  validateShadowHtml,
} from '../scripts/publish-dashboard-v2-shadow-to-pi.mjs';

function validHtml() {
  const markers = ['today-panel', 'upcoming-panel', 'athletics-panel', 'right-rail', 'sports-ticker', 'now-next'].join(' ');
  return Buffer.from(`<!doctype html><html><head><meta http-equiv="refresh" content="300"></head><body><main data-sports-url="">${markers}${'x'.repeat(1_000_000)}</main></body></html>`);
}

describe('NOW/NEXT Pi shadow publisher', () => {
  it('accepts only a substantial self-contained render with live sports disabled', () => {
    const result = validateShadowHtml(validHtml());
    assert.ok(result.size > 1_000_000);
    assert.match(result.sha256, /^[a-f0-9]{64}$/);
  });

  it('fails closed for empty, malformed, incomplete, remote, secret-bearing, or live-sports HTML', () => {
    for (const value of [
      Buffer.alloc(0),
      Buffer.alloc(1_000_001, 'x'),
      Buffer.from(validHtml().toString().replace('now-next', 'missing')),
      Buffer.from(validHtml().toString().replace('data-sports-url=""', 'data-sports-url="https://sports.example"')),
      Buffer.from(validHtml().toString().replace('<meta http-equiv="refresh" content="300">', '')),
      Buffer.from(validHtml().toString().replace('</body>', '<img src="https://example.test/a.png"></body>')),
      Buffer.from(validHtml().toString().replace('</body>', 'refresh_token</body>')),
    ]) assert.throws(() => validateShadowHtml(value));
  });

  it('hard-codes a destination isolated from production current and releases', () => {
    assert.equal(SHADOW_DIR, '/home/pi/moore-dashboard/shadow');
    assert.equal(SHADOW_FILE, '/home/pi/moore-dashboard/shadow/index.html');
    assert.equal(SHADOW_URL, 'http://127.0.0.1:4174/index.html');
    assert.equal(PI_IDENTITY, 'C:/Users/wadem/.ssh/moore_ops_pi');
    for (const command of [remoteInstallCommand(), remoteVerifyCommand('a'.repeat(64))]) {
      assert.doesNotMatch(command, /systemctl (?:restart|stop|disable|enable --now) moore-dashboard\.service/);
      assert.doesNotMatch(command, /moore-dashboard-refresh\.service|activate-dashboard-release|\/current\/|\/releases\//);
    }
  });

  it('uses the dedicated identity noninteractively for SSH and SCP', () => {
    for (const args of [sshArgs('true'), scpArgs('local.html', `${SHADOW_DIR}/.index.html.test.tmp`)]) {
      assert.deepEqual(args.slice(0, 6), ['-i', PI_IDENTITY, '-o', 'IdentitiesOnly=yes', '-o', 'BatchMode=yes']);
      assert.ok(args.some(value => value === 'pi@192.168.1.4' || value.startsWith('pi@192.168.1.4:')));
    }
  });

  it('uses a same-directory temporary file and atomic rename only after validation', () => {
    const temporaryPath = `${SHADOW_DIR}/.index.html.1234.tmp`;
    const command = remotePublishCommand({ temporaryPath, expectedSize: 1_200_000, expectedSha256: 'a'.repeat(64) });
    assert.match(command, /test "\$\(dirname -- "\$tmp"\)" = "\$\(dirname -- "\$dest"\)"/);
    assert.match(command, /sha256sum "\$tmp"/);
    assert.match(command, /http-equiv="refresh" content="300"/);
    assert.match(command, /mv -f -- "\$tmp" "\$dest"/);
    assert.ok(command.indexOf('sha256sum') < command.indexOf('mv -f'));
    assert.throws(() => remotePublishCommand({ temporaryPath: '/home/pi/moore-dashboard/current/.tmp', expectedSize: 1_200_000, expectedSha256: 'a'.repeat(64) }), /Unsafe/);
  });

  it('captures and verifies production invariants without writing production paths', () => {
    assert.match(PRODUCTION_SNAPSHOT_COMMAND, /readlink -f \/home\/pi\/moore-dashboard\/current/);
    assert.match(PRODUCTION_SNAPSHOT_COMMAND, /moore-dashboard-refresh\.timer/);
    assert.match(PRODUCTION_SNAPSHOT_COMMAND, /127\\\.0\\\.0\\\.1:4173/);
    const verify = remoteVerifyCommand('b'.repeat(64));
    assert.match(verify, /127\\\.0\\\.0\\\.1:4174/);
    assert.match(verify, /curl -fsS http:\/\/127\.0\.0\.1:4173\/index\.html >\/dev\/null/);
  });
});
