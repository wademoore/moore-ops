import { drive } from "@googleapis/drive";
import { getAuthClient } from "./auth.js";

// ── Document IDs ──────────────────────────────────────────────────────────────
const DOCS = {
  familyContext: process.env.DRIVE_FAMILY_CONTEXT_FILE_ID,
};

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

