/**
 * test/drive.test.js
 * Moore Family Operations Assistant
 *
 * Unit tests for the three new drive.js functions:
 *   getSportsConfig(drv)
 *   getPBRecords(drv)
 *   updatePBRecords(pbData, currentRecords, drv)
 *
 * Each test passes a stub drv object (the test seam) so no real Drive
 * API calls are made. The optional drv parameter on each function is
 * the same pattern used for referenceDate in athleticsParser.js.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Set env vars before importing drive.js so the functions can read them
process.env.DRIVE_SPORTS_CONFIG_FILE_ID  = 'test-sports-config-id';
process.env.DRIVE_PB_RECORDS_FILE_ID     = 'test-pb-records-id';
process.env.DRIVE_DATA_FOLDER_ID         = 'test-folder-id';
process.env.DRIVE_PROCESSED_MEETS_FILE_ID = 'test-processed-meets-id';

import {
  getSportsConfig,
  getPBRecords,
  getProcessedMeets,
  updateProcessedMeets,
} from '../drive.js';

// ── Helper: make a stub drv with only the methods a given test needs ──────────

function stubDrv(overrides = {}) {
  return {
    files: {
      get:    async () => { throw new Error('stubDrv.files.get not configured'); },
      create: async () => { throw new Error('stubDrv.files.create not configured'); },
      update: async () => { throw new Error('stubDrv.files.update not configured'); },
      ...overrides,
    },
  };
}

// ── getSportsConfig ───────────────────────────────────────────────────────────

describe('getSportsConfig(drv)', () => {
  it('valid JSON response returns parsed object with expected top-level keys', async () => {
    const fakeConfig = {
      flagFootball: { active: true }, wellingtonWaves: {},
      swim757: {}, sharks: {}, swimmers: {},
    };
    const drv = stubDrv({ get: async () => ({ data: JSON.stringify(fakeConfig) }) });

    const result = await getSportsConfig(drv);
    assert.deepEqual(result, fakeConfig);
    assert.ok('flagFootball' in result, 'flagFootball key present');
    assert.ok('swimmers' in result,     'swimmers key present');
  });

  it('invalid JSON response throws with file ID in message', async () => {
    const drv = stubDrv({ get: async () => ({ data: 'not { valid json' }) });

    await assert.rejects(
      () => getSportsConfig(drv),
      (err) => {
        assert.ok(
          err.message.includes('test-sports-config-id'),
          'Error should contain file ID, got: ' + err.message
        );
        return true;
      }
    );
  });

  it('Drive API error throws with file ID in message', async () => {
    const drv = stubDrv({ get: async () => { throw new Error('network timeout'); } });

    await assert.rejects(
      () => getSportsConfig(drv),
      (err) => {
        assert.ok(
          err.message.includes('test-sports-config-id'),
          'Error should contain file ID, got: ' + err.message
        );
        return true;
      }
    );
  });
});

// ── getPBRecords ──────────────────────────────────────────────────────────────

describe('getPBRecords(drv)', () => {
  it('404 response creates file and returns empty flat object', async () => {
    let createCalled = false;
    const notFoundErr = Object.assign(new Error('File not found'), { response: { status: 404 } });

    const drv = stubDrv({
      get:    async () => { throw notFoundErr; },
      create: async () => { createCalled = true; return { data: { id: 'new-id' } }; },
    });

    const result = await getPBRecords(drv);
    assert.ok(createCalled, 'files.create should be called on 404');
    assert.deepEqual(result, {}, 'should return empty flat object');
  });

  it('valid response returns flat key-value object', async () => {
    const stored = {
      'Myles|50m Breast|SCM': { seconds: 58.5, date: '2026-05-01', meet: 'Spring Invite' },
      'Ophelia|25m Back|SCM': { seconds: 31.2, date: '2026-05-01', meet: 'Spring Invite' },
    };
    const drv = stubDrv({ get: async () => ({ data: JSON.stringify(stored) }) });

    const result = await getPBRecords(drv);
    assert.equal(Object.keys(result).length, 2);
    assert.equal(result['Myles|50m Breast|SCM'].seconds, 58.5);
    assert.equal(result['Ophelia|25m Back|SCM'].meet, 'Spring Invite');
  });

  it('non-404 Drive error throws', async () => {
    const serverErr = Object.assign(new Error('internal server error'), { response: { status: 500 } });
    const drv = stubDrv({ get: async () => { throw serverErr; } });

    await assert.rejects(() => getPBRecords(drv), /internal server error/);
  });

  it('404 + create failure — create error propagates', async () => {
    const notFoundErr = Object.assign(new Error('File not found'), { response: { status: 404 } });
    const createErr   = new Error('Drive create failed');
    const drv = stubDrv({
      get:    async () => { throw notFoundErr; },
      create: async () => { throw createErr; },
    });

    await assert.rejects(() => getPBRecords(drv), /Drive create failed/);
  });
});

// ── getProcessedMeets ─────────────────────────────────────────────────────────

describe('getProcessedMeets(drv)', () => {
  it('28. 404 → creates file and returns empty structure', async () => {
    let createCalled = false;
    const notFoundErr = Object.assign(new Error('File not found'), { response: { status: 404 } });
    const drv = stubDrv({
      get:    async () => { throw notFoundErr; },
      create: async () => { createCalled = true; return { data: { id: 'new-pm-id' } }; },
    });

    const result = await getProcessedMeets(drv);
    assert.ok(createCalled, 'files.create should be called on 404');
    assert.equal(result.version, 1, 'version should be 1');
    assert.deepEqual(result.processedFiles, [], 'processedFiles should be empty array');
  });

  it('29. valid response returns parsed object', async () => {
    const stored = {
      version: 1,
      processedFiles: [
        { fileId: 'abc123', fileName: 'meet.pdf', meetName: 'Some Meet',
          meetDate: '2024-06-24', processedAt: '2024-06-25T04:00:00.000Z' },
      ],
    };
    const drv = stubDrv({ get: async () => ({ data: JSON.stringify(stored) }) });

    const result = await getProcessedMeets(drv);
    assert.equal(result.version, 1);
    assert.equal(result.processedFiles.length, 1);
    assert.equal(result.processedFiles[0].fileId, 'abc123');
  });
});

// ── updateProcessedMeets ──────────────────────────────────────────────────────

describe('updateProcessedMeets(newEntry, currentProcessed, drv)', () => {
  it('30. calls files.update with new entry appended to processedFiles', async () => {
    let updatePayload = null;
    const drv = stubDrv({ update: async (params) => { updatePayload = params; } });

    const current = { version: 1, processedFiles: [] };
    const newEntry = {
      fileId: 'xyz789', fileName: 'new-meet.pdf',
      meetName: 'New Meet', meetDate: '2024-08-03',
      processedAt: '2024-08-04T04:00:00.000Z',
    };

    await updateProcessedMeets(newEntry, current, drv);
    assert.ok(updatePayload !== null, 'files.update should have been called');
    assert.equal(updatePayload.fileId, 'test-processed-meets-id');

    const written = JSON.parse(updatePayload.media.body);
    assert.equal(written.processedFiles.length, 1);
    assert.equal(written.processedFiles[0].fileId, 'xyz789');
    assert.equal(written.processedFiles[0].meetName, 'New Meet');
  });
});

