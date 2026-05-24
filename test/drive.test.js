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
  updatePBRecords,
  getProcessedMeets,
  updateProcessedMeets,
  writePBRecords,
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
  it('404 response creates file and returns empty structure', async () => {
    let createCalled = false;
    const notFoundErr = Object.assign(new Error('File not found'), { response: { status: 404 } });

    const drv = stubDrv({
      get:    async () => { throw notFoundErr; },
      create: async () => { createCalled = true; return { data: { id: 'new-id' } }; },
    });

    const result = await getPBRecords(drv);
    assert.ok(createCalled, 'files.create should be called on 404');
    assert.equal(result.version,     1,    'version should be 1');
    assert.equal(result.lastUpdated, null, 'lastUpdated should be null');
    assert.deepEqual(result.records, [],   'records should be empty array');
  });

  it('valid response returns parsed records object', async () => {
    const stored = {
      version: 1,
      lastUpdated: '2026-05-01T00:00:00.000Z',
      records: [{ swimmer: 'myles', event: '50m Breast', course: 'SCM', time: '58.50' }],
    };
    const drv = stubDrv({ get: async () => ({ data: JSON.stringify(stored) }) });

    const result = await getPBRecords(drv);
    assert.equal(result.version, 1);
    assert.equal(result.records.length, 1);
    assert.equal(result.records[0].swimmer, 'myles');
    assert.equal(result.records[0].time, '58.50');
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

// ── updatePBRecords ───────────────────────────────────────────────────────────

describe('updatePBRecords(pbData, currentRecords, drv)', () => {
  const emptyRecords = { version: 1, lastUpdated: null, records: [] };

  it('no new PBs detected (currentBest is dash) — files.update is not called', async () => {
    let updateCalled = false;
    const drv = stubDrv({ update: async () => { updateCalled = true; } });

    const pbData = {
      myles:   [{ event: '50m Breast', format: 'SCM', currentBest: '—' }],
      ophelia: [{ event: '25m Back',   format: 'SCM', currentBest: '—' }],
    };

    await updatePBRecords(pbData, emptyRecords, drv);
    assert.equal(updateCalled, false, 'files.update must not be called when no new PBs');
  });

  it('existing record already faster — files.update is not called', async () => {
    let updateCalled = false;
    const drv = stubDrv({ update: async () => { updateCalled = true; } });

    const existingRecords = {
      version: 1, lastUpdated: null,
      records: [{ swimmer: 'myles', event: '50m Breast', course: 'SCM', time: '55.00' }],
    };

    // 58.50 is slower than 55.00 — not a new PB
    const pbData = {
      myles:   [{ event: '50m Breast', format: 'SCM', currentBest: '58.50' }],
      ophelia: [],
    };

    await updatePBRecords(pbData, existingRecords, drv);
    assert.equal(updateCalled, false, 'files.update must not be called when new time is slower');
  });

  it('one new PB detected — files.update called with record having correct fields', async () => {
    let updatePayload = null;
    const drv = stubDrv({ update: async (params) => { updatePayload = params; } });

    const pbData = {
      myles:   [{ event: '50m Breast', format: 'SCM', currentBest: '58.50' }],
      ophelia: [],
    };

    await updatePBRecords(pbData, emptyRecords, drv);
    assert.ok(updatePayload !== null, 'files.update should have been called');
    assert.equal(updatePayload.fileId, 'test-pb-records-id', 'fileId should match env var');

    const written = JSON.parse(updatePayload.media.body);
    assert.equal(written.records.length, 1, 'one record should be written');

    const rec = written.records[0];
    assert.equal(rec.swimmer, 'myles',      'swimmer field');
    assert.equal(rec.event,   '50m Breast', 'event field');
    assert.equal(rec.course,  'SCM',        'course field (mapped from format)');
    assert.equal(rec.time,    '58.50',      'time field');
    assert.equal(rec.meet,    null,         'meet is null when unknown');
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(rec.dateset), 'dateset is ISO date, got: ' + rec.dateset);
    assert.ok(/^\d{4}-\d{2}$/.test(rec.season),         'season is YYYY-YY, got: ' + rec.season);
    assert.ok(written.lastUpdated, 'lastUpdated should be set on the envelope');
  });

  it('new PB beats existing record — existing record replaced not duplicated', async () => {
    let updatePayload = null;
    const drv = stubDrv({ update: async (params) => { updatePayload = params; } });

    const existingRecords = {
      version: 1, lastUpdated: null,
      records: [
        { swimmer: 'myles', event: '50m Breast', course: 'SCM',
          time: '1:02.00', dateset: '2026-06-01', meet: null, season: '2025-26' },
      ],
    };

    // 58.50s < 62s — this is a new PB
    const pbData = {
      myles:   [{ event: '50m Breast', format: 'SCM', currentBest: '58.50' }],
      ophelia: [],
    };

    await updatePBRecords(pbData, existingRecords, drv);
    assert.ok(updatePayload !== null, 'files.update should have been called');

    const written = JSON.parse(updatePayload.media.body);
    assert.equal(written.records.length, 1,       'still one record (updated, not duplicated)');
    assert.equal(written.records[0].time, '58.50', 'record updated to new PB time');
  });

  it('write error throws — caller is responsible for catching', async () => {
    const drv = stubDrv({ update: async () => { throw new Error('Drive write failed'); } });

    const pbData = {
      myles:   [{ event: '50m Breast', format: 'SCM', currentBest: '58.50' }],
      ophelia: [],
    };

    await assert.rejects(
      () => updatePBRecords(pbData, emptyRecords, drv),
      /Drive write failed/
    );
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

// ── writePBRecords ────────────────────────────────────────────────────────────

describe('writePBRecords(payload, drv)', () => {
  it('31. calls files.update with serialized payload to DRIVE_PB_RECORDS_FILE_ID', async () => {
    let updatePayload = null;
    const drv = stubDrv({ update: async (params) => { updatePayload = params; } });

    const payload = {
      version: 1,
      lastUpdated: '2024-06-25T04:00:00.000Z',
      records: [
        { swimmer: 'myles', event: '50m Free', course: 'SCM', time: '44.29',
          points: 5, dateset: '2024-06-24', meet: 'Some Meet', season: '2024-25' },
      ],
    };

    await writePBRecords(payload, drv);
    assert.ok(updatePayload !== null, 'files.update should have been called');
    assert.equal(updatePayload.fileId, 'test-pb-records-id');

    const written = JSON.parse(updatePayload.media.body);
    assert.equal(written.records.length, 1);
    assert.equal(written.records[0].swimmer, 'myles');
    assert.equal(written.records[0].time,    '44.29');
    assert.equal(written.lastUpdated, '2024-06-25T04:00:00.000Z');
  });
});
