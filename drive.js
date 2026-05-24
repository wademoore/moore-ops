import { drive } from "@googleapis/drive";
import { getAuthClient } from "./auth.js";
import { timeToSeconds } from "./digest/dateUtils.js";

// ── Document IDs ──────────────────────────────────────────────────────────────
const DOCS = {
  familyContext: process.env.DRIVE_FAMILY_CONTEXT_FILE_ID,
  athletics:     process.env.DRIVE_ATHLETICS_FILE_ID,
};

// Stonehouse newsletter — updated by Wade each Sunday with new HTML
const NEWSLETTER_FILE_ID  = process.env.DRIVE_NEWSLETTER_FILE_ID;

// Dashboard upload destination
const DASHBOARD_FOLDER_ID = process.env.DRIVE_DASHBOARD_FOLDER_ID;
const DASHBOARD_FILENAME  = "moore_dashboard.html";


// ── getFamilyDocs (unchanged) ─────────────────────────────────────────────────
export async function getFamilyDocs() {
  const auth = await getAuthClient();
  const drv = drive({ version: "v3", auth });

  const results = {};

  for (const [name, fileId] of Object.entries(DOCS)) {
    try {
      const res = await drv.files.export({
        fileId,
        mimeType: "text/plain",
      });
      results[name] = res.data;
      console.log(`[drive:getFamilyDocs] Loaded "${name}"`);
    } catch (err) {
      console.warn(`[drive:getFamilyDocs] Could not load "${name}" — ${err.message}`);
      results[name] = "";
    }
  }

  return results;
}

// ── fetchNewsletter ───────────────────────────────────────────────────────────
// Fetches the Stonehouse Elementary newsletter HTML that Wade uploads each Sunday.
// Returns the raw text content, or null if the file cannot be fetched.
// Caller (index.js) falls back to Gmail search when null is returned.

export async function fetchNewsletter() {
  const auth = await getAuthClient();
  const drv = drive({ version: "v3", auth });

  try {
    const res = await drv.files.get(
      { fileId: NEWSLETTER_FILE_ID, alt: "media" },
      { responseType: "text" }
    );
    console.log('[drive:fetchNewsletter] Newsletter fetched');
    return res.data;
  } catch (err) {
    console.warn(`[drive:fetchNewsletter] Fetch failed — ${err.message}`);
    return null;
  }
}

// ── uploadDashboard ───────────────────────────────────────────────────────────
// Uploads moore_dashboard.html to the dashboard folder in Drive.
// Per system prompt: use textContent (not base64), disableConversionToGoogleType.
// The Apps Script in Drive handles cleanup of the previous version automatically.

export async function uploadDashboard(htmlContent) {
  const auth = await getAuthClient();
  const drv = drive({ version: "v3", auth });

  try {
    // Create the new file — Apps Script handles deleting the old one
    await drv.files.create({
      requestBody: {
        name:    DASHBOARD_FILENAME,
        mimeType: "text/html",
        parents: [DASHBOARD_FOLDER_ID],
      },
      media: {
        mimeType: "text/html",
        body:     htmlContent,
      },
      fields: "id",
    });

    const now = new Date().toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "America/New_York",
    });

    console.log(`[drive:uploadDashboard] ✓ Updated — ${now} ET`);
    return true;
  } catch (err) {
    console.error(`[drive:uploadDashboard] Upload failed — ${err.message}`);
    return false;
  }
}

// ── getSportsConfig ───────────────────────────────────────────────────────────
// Fetches sports-config.json from Drive and returns the parsed config object.
// Throws loudly on any error — sports config is mandatory, no fallback.
// Accepts optional pre-constructed drv client for unit testing.

export async function getSportsConfig(drv) {
  const fileId = process.env.DRIVE_SPORTS_CONFIG_FILE_ID;
  if (!drv) {
    const auth = await getAuthClient();
    drv = drive({ version: 'v3', auth });
  }
  try {
    const res = await drv.files.get(
      { fileId, alt: 'media' },
      { responseType: 'text' }
    );
    const config = JSON.parse(res.data);
    console.log(`[drive:getSportsConfig] Loaded file ${fileId} (${Object.keys(config).length} top-level keys)`);
    return config;
  } catch (err) {
    throw new Error(`[drive:getSportsConfig] Failed to load sports config (file: ${fileId}) — ${err.message}`);
  }
}

// ── getPBRecords ──────────────────────────────────────────────────────────────
// Fetches pb-records.json from Drive and returns the parsed records object.
// On 404, creates the file with an empty structure and returns it (first-run).
// On any other error, throws.
// Accepts optional pre-constructed drv client for unit testing.

const EMPTY_PB_RECORDS = { version: 1, lastUpdated: null, records: [] };

export async function getPBRecords(drv) {
  const fileId   = process.env.DRIVE_PB_RECORDS_FILE_ID;
  const folderId = process.env.DRIVE_DATA_FOLDER_ID;
  if (!drv) {
    const auth = await getAuthClient();
    drv = drive({ version: 'v3', auth });
  }
  try {
    const res = await drv.files.get(
      { fileId, alt: 'media' },
      { responseType: 'text' }
    );
    const records = JSON.parse(res.data);
    console.log(`[drive:getPBRecords] Loaded ${records.records?.length ?? 0} record(s)`);
    return records;
  } catch (err) {
    // 404 → first run: create the empty file and return the empty structure
    if (err.response?.status === 404 || err.code === 404) {
      console.log('[drive:getPBRecords] pb-records.json not found — creating empty file');
      await drv.files.create({
        requestBody: {
          name:     'pb-records.json',
          mimeType: 'text/plain',
          parents:  [folderId],
        },
        media: {
          mimeType: 'text/plain',
          body:     JSON.stringify(EMPTY_PB_RECORDS, null, 2),
        },
        fields: 'id',
      });
      return { ...EMPTY_PB_RECORDS, records: [] };
    }
    throw new Error(`[drive:getPBRecords] Failed to load PB records (file: ${fileId}) — ${err.message}`);
  }
}

// ── updatePBRecords ───────────────────────────────────────────────────────────
// Compares parsed PB rows against stored records. If any new PB is detected,
// upserts the record and writes the file back to Drive.
// Throws on Drive write failure — caller (builder.js) wraps in try/catch.
// Accepts optional pre-constructed drv client for unit testing.
//
// pbData: { myles: PBRow[], ophelia: PBRow[] }
// currentRecords: object returned by getPBRecords()

export async function updatePBRecords(pbData, currentRecords, drv) {
  const fileId = process.env.DRIVE_PB_RECORDS_FILE_ID;
  if (!drv) {
    const auth = await getAuthClient();
    drv = drive({ version: 'v3', auth });
  }

  const { myles: mylesPBRows = [], ophelia: opheliaPBRows = [] } = pbData;

  // Compute run-date and season string once
  const now      = new Date();
  const dateset  = now.toISOString().slice(0, 10);
  const year     = now.getFullYear();
  // month >= 5 (0-indexed) means June or later → season starts this year
  // month <  5 means Jan–May → season started the prior year
  const season   = now.getMonth() >= 5
    ? `${year}-${String(year + 1).slice(2)}`
    : `${year - 1}-${String(year).slice(2)}`;

  const updatedRecords = [...(currentRecords.records || [])];
  const newPBLog = [];

  for (const [swimmer, rows] of [['myles', mylesPBRows], ['ophelia', opheliaPBRows]]) {
    for (const row of rows) {
      if (row.currentBest === '—') continue;

      const course   = row.format;   // SCM or SCY
      const event    = row.event;
      const newSecs  = timeToSeconds(row.currentBest);
      if (newSecs === null) continue;

      const existingIdx = updatedRecords.findIndex(
        r => r.swimmer === swimmer && r.event === event && r.course === course
      );
      const existing = existingIdx >= 0 ? updatedRecords[existingIdx] : null;

      const isNewPB = !existing
        || timeToSeconds(existing.time) === null
        || newSecs < timeToSeconds(existing.time);

      if (!isNewPB) continue;

      const record = { swimmer, event, course, time: row.currentBest, dateset, meet: null, season };
      if (existingIdx >= 0) {
        updatedRecords[existingIdx] = record;
      } else {
        updatedRecords.push(record);
      }
      newPBLog.push(`${swimmer} ${event} ${course}: ${row.currentBest}`);
    }
  }

  if (newPBLog.length === 0) {
    console.log('[drive:updatePBRecords] No new PBs detected — skipping write');
    return;
  }

  const payload = {
    ...currentRecords,
    records:     updatedRecords,
    lastUpdated: now.toISOString(),
  };

  await drv.files.update({
    fileId,
    requestBody: {},
    media: {
      mimeType: 'text/plain',
      body:     JSON.stringify(payload, null, 2),
    },
  });

  console.log(`[drive:updatePBRecords] ✓ Wrote ${newPBLog.length} new PB(s): ${newPBLog.join(', ')}`);
}

// ── listFolderFiles ───────────────────────────────────────────────────────────
// Lists all PDF files in a Drive folder. Handles pagination.
// Non-fatal: returns empty array on any error.

export async function listFolderFiles(folderId, drv) {
  if (!drv) {
    const auth = await getAuthClient();
    drv = drive({ version: 'v3', auth });
  }
  const files = [];
  let pageToken = undefined;
  try {
    do {
      const params = {
        q:         `'${folderId}' in parents and (mimeType = 'application/pdf' or mimeType = 'text/plain') and trashed = false`,
        fields:    'nextPageToken, files(id,name,createdTime)',
        pageSize:  100,
      };
      if (pageToken) params.pageToken = pageToken;
      const res = await drv.files.list(params);
      files.push(...(res.data.files || []));
      pageToken = res.data.nextPageToken;
    } while (pageToken);
    return files;
  } catch (err) {
    console.warn(`[drive:listFolderFiles] Failed to list folder ${folderId} — ${err.message}`);
    return [];
  }
}

// ── fetchFileAsBuffer ─────────────────────────────────────────────────────────
// Downloads a Drive file as a Buffer. Throws on error — caller wraps in try/catch.

export async function fetchFileAsBuffer(fileId, drv) {
  if (!drv) {
    const auth = await getAuthClient();
    drv = drive({ version: 'v3', auth });
  }
  const res = await drv.files.get(
    { fileId, alt: 'media' },
    { responseType: 'arraybuffer' }
  );
  return Buffer.from(res.data);
}

// ── getProcessedMeets ─────────────────────────────────────────────────────────
// Fetches processed-meets.json from Drive. Creates empty file on 404 (first run).
// Throws on non-404 errors.

const EMPTY_PROCESSED_MEETS = { version: 1, processedFiles: [] };

export async function getProcessedMeets(drv) {
  const fileId   = process.env.DRIVE_PROCESSED_MEETS_FILE_ID;
  const folderId = process.env.DRIVE_DATA_FOLDER_ID;
  if (!drv) {
    const auth = await getAuthClient();
    drv = drive({ version: 'v3', auth });
  }
  try {
    const res = await drv.files.get(
      { fileId, alt: 'media' },
      { responseType: 'text' }
    );
    return JSON.parse(res.data);
  } catch (err) {
    if (err.response?.status === 404 || err.code === 404) {
      console.log('[drive:getProcessedMeets] processed-meets.json not found — creating empty file');
      await drv.files.create({
        requestBody: {
          name:     'processed-meets.json',
          mimeType: 'text/plain',
          parents:  [folderId],
        },
        media: {
          mimeType: 'text/plain',
          body:     JSON.stringify(EMPTY_PROCESSED_MEETS, null, 2),
        },
        fields: 'id',
      });
      return { ...EMPTY_PROCESSED_MEETS, processedFiles: [] };
    }
    throw new Error(`[drive:getProcessedMeets] Failed to load (file: ${fileId}) — ${err.message}`);
  }
}

// ── updateProcessedMeets ──────────────────────────────────────────────────────
// Appends a new entry to processed-meets.json and writes it back to Drive.
// Throws on Drive error.

export async function updateProcessedMeets(newEntry, currentProcessed, drv) {
  const fileId = process.env.DRIVE_PROCESSED_MEETS_FILE_ID;
  if (!drv) {
    const auth = await getAuthClient();
    drv = drive({ version: 'v3', auth });
  }
  const updated = {
    ...currentProcessed,
    processedFiles: [...(currentProcessed.processedFiles || []), newEntry],
  };
  await drv.files.update({
    fileId,
    requestBody: {},
    media: {
      mimeType: 'text/plain',
      body:     JSON.stringify(updated, null, 2),
    },
  });
}

// ── writePBRecords ────────────────────────────────────────────────────────────
// Writes a pre-built pb-records envelope to Drive. Used by the PDF batch flow.
// Throws on error.

export async function writePBRecords(payload, drv) {
  const fileId = process.env.DRIVE_PB_RECORDS_FILE_ID;
  if (!drv) {
    const auth = await getAuthClient();
    drv = drive({ version: 'v3', auth });
  }
  await drv.files.update({
    fileId,
    requestBody: {},
    media: {
      mimeType: 'text/plain',
      body:     JSON.stringify(payload, null, 2),
    },
  });
  console.log('[drive:writePBRecords] ✓ pb-records.json updated');
}