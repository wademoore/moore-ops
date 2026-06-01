import { drive } from "@googleapis/drive";
import { getAuthClient } from "./auth.js";

// ── Document IDs ──────────────────────────────────────────────────────────────
const DOCS = {
  familyContext: process.env.DRIVE_FAMILY_CONTEXT_FILE_ID,
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

// ── Sports JSON data (removed from Drive) ────────────────────────────────────
// The following six functions were removed in the June 2026 local-data migration.
// Sports JSON files now live in data/ (committed to the repo) and are read
// directly by digest/builder.js via fs.readFile — no Drive fetch required.
//
// Lambda env vars that are NO LONGER NEEDED and can be removed from Lambda config:
//   DRIVE_SPORTS_CONFIG_FILE_ID
//   DRIVE_FLAG_FOOTBALL_FILE_ID
//   DRIVE_PB_RECORDS_FILE_ID
//   DRIVE_SWIM_RESULTS_FILE_ID
//   DRIVE_WAVES_SEASON_FILE_ID
//   DRIVE_VPSU_RANKINGS_FILE_ID

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

