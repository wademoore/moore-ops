/**
 * test/drive.test.js
 * Moore Family Operations Assistant
 *
 * Unit tests for drive.js functions that remain Drive-backed:
 *   getProcessedMeets(drv)
 *   updateProcessedMeets(newEntry, currentProcessed, drv)
 *
 * Sports JSON functions (getSportsConfig, getPBRecords, etc.) were removed
 * from drive.js in the June 2026 local-data migration — see test/data.test.js
 * for coverage of the replacement filesystem-based loading.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Set env vars before importing drive.js so the functions can read them
process.env.DRIVE_DATA_FOLDER_ID          = 'test-folder-id';
process.env.DRIVE_PROCESSED_MEETS_FILE_ID = 'test-processed-meets-id';

import {
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

