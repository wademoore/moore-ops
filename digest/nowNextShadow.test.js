import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  SHADOW_RELOAD_SECONDS,
  addShadowAutoReload,
  resolveAuthFiles,
  runShadow,
  selectedDiagnostic,
} from '../scripts/dashboard-v2-now-next-shadow.mjs';

function fixtureNowNext(evaluatedAt = '2026-08-17T09:30:00.000Z') {
  return {
    signal: 'This morning',
    subject: 'Private family event',
    reasonCodes: ['NOW_NEXT_THIS_MORNING', 'NOW_NEXT_THEN_LATER'],
    supporting: [{ reasonCode: 'NOW_NEXT_THEN_LATER', label: 'Later today', lines: ['Another private event'] }],
    diagnostics: {
      evaluatedAt,
      candidateCount: 2,
      selectedSource: { type: 'event', id: 'private-series', occurrenceId: 'private-event@time' },
      candidates: [
        { reasonCode: 'NOW_NEXT_THIS_MORNING', priority: 450, sourceType: 'event', sourceId: 'private-series', occurrenceId: 'private-event@time' },
        { reasonCode: 'NOW_NEXT_THEN_LATER', priority: 200, sourceType: 'event', sourceId: 'another-series', occurrenceId: 'another-event@time' },
      ],
    },
  };
}

describe('NOW/NEXT shadow harness', () => {
  it('adds a shadow-only five-minute document reload', () => {
    assert.equal(SHADOW_RELOAD_SECONDS, 300);
    assert.match(addShadowAutoReload('<!doctype html><html><head></head><body></body></html>'), /<meta http-equiv="refresh" content="300">/);
    assert.throws(() => addShadowAutoReload('<html><body></body></html>'), /missing a document head/);
  });
  it('fails closed when default authentication files are missing', async () => {
    const root = await mkdtemp(join(tmpdir(), 'now-next-auth-missing-'));
    await assert.rejects(resolveAuthFiles({ root, env: {} }), /needs existing local Google auth files/);
  });

  it('rejects incomplete and invalid external authentication paths without echoing them', async () => {
    const root = await mkdtemp(join(tmpdir(), 'now-next-auth-invalid-'));
    const secretPath = join(root, 'do-not-echo-this-path.json');
    await assert.rejects(
      resolveAuthFiles({ root, env: { MOORE_OPS_CREDENTIALS_PATH: secretPath } }),
      error => !error.message.includes(secretPath) && /required together/.test(error.message),
    );
    await assert.rejects(
      resolveAuthFiles({ root, env: { MOORE_OPS_CREDENTIALS_PATH: secretPath, MOORE_OPS_TOKEN_PATH: join(root, 'missing.json') } }),
      error => !error.message.includes(root) && /missing or invalid/.test(error.message),
    );
  });

  it('accepts two valid external authentication files without copying them', async () => {
    const root = await mkdtemp(join(tmpdir(), 'now-next-auth-valid-'));
    const credentialsPath = join(root, 'external-credentials.json');
    const tokenPath = join(root, 'external-token.json');
    await writeFile(credentialsPath, '{}');
    await writeFile(tokenPath, '{}');
    const result = await resolveAuthFiles({
      root: join(root, 'worktree'),
      env: { MOORE_OPS_CREDENTIALS_PATH: credentialsPath, MOORE_OPS_TOKEN_PATH: tokenPath },
    });
    assert.equal(result.external, true);
    assert.equal(result.credentialsPath, credentialsPath);
    assert.equal(result.tokenPath, tokenPath);
    await assert.rejects(readFile(join(root, 'worktree', 'credentials.json')), /ENOENT/);
    await assert.rejects(readFile(join(root, 'worktree', 'token.json')), /ENOENT/);
  });

  it('has no production, mail, upload, or deployment imports', async () => {
    const source = await readFile(new URL('../scripts/dashboard-v2-now-next-shadow.mjs', import.meta.url), 'utf8');
    assert.doesNotMatch(source, /from ['"][^'"]*(?:index\.js|mailer\.js|upload|deploy|activate)[^'"]*['"]/);
    assert.doesNotMatch(source, /\b(?:sendDigest|uploadDashboard)\s*\(/);
  });

  it('redacts subjects and occurrence/source identities', () => {
    const json = JSON.stringify(selectedDiagnostic(fixtureNowNext()));
    assert.doesNotMatch(json, /Private family event|private-series|private-event/);
    assert.match(json, /NOW_NEXT_THIS_MORNING/);
  });

  it('atomically writes a private preview, latest diagnostic, and compact history', async () => {
    const root = await mkdtemp(join(tmpdir(), 'now-next-shadow-'));
    const now = new Date('2026-08-17T09:30:00.000Z');
    const seenTimes = [];
    const fetchData = async ({ now: supplied }) => {
      seenTimes.push(supplied.toISOString());
      return { nowNext: fixtureNowNext(supplied.toISOString()) };
    };
    const first = await runShadow({ root, now, fetchData, render: data => `<html><head></head><body>${data.nowNext.signal}</body></html>` });
    await runShadow({ root, now: new Date('2026-08-17T09:31:00.000Z'), fetchData, render: () => '<html><head></head><body>second</body></html>' });
    assert.match(await readFile(first.previewPath, 'utf8'), /<meta http-equiv="refresh" content="300">\n<\/head><body>second/);
    assert.doesNotMatch(await readFile(first.diagnosticPath, 'utf8'), /private-series|Private family event/);
    assert.equal((await readFile(first.historyPath, 'utf8')).trim().split('\n').length, 2);
    assert.deepEqual(seenTimes, ['2026-08-17T09:30:00.000Z', '2026-08-17T09:31:00.000Z']);
  });

  it('fails closed when another run owns the lock', async () => {
    const root = await mkdtemp(join(tmpdir(), 'now-next-shadow-lock-'));
    const output = join(root, 'preview', 'dashboard-v2-shadow');
    await import('node:fs/promises').then(fs => fs.mkdir(output, { recursive: true }));
    await writeFile(join(output, '.run.lock'), 'occupied');
    await assert.rejects(runShadow({ root, fetchData: async () => ({}) }), /already running/);
  });
});
