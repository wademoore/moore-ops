import { google } from "googleapis";
import fs from "fs";

const CREDENTIALS_PATH = "credentials.json";
const TOKEN_PATH = "token.json";

// ── Document IDs ──────────────────────────────────────────────────────────────
const DOCS = {
  familyContext: "1eXMPEAIMZciwUc8eUQl042Bt0zW0P3Q0d_o8NqYnOx4",
  athletics:     "196wHllkytM_p2jnIXpFKGm2EQall8cd2sfuE5jaurJE",
};

// Stonehouse newsletter — updated by Wade each Sunday with new HTML
const NEWSLETTER_FILE_ID = "15bDYqGCuaBEvnu4BPeAeOr6r2A2EV1XY";

// Dashboard upload destination
const DASHBOARD_FOLDER_ID = "1jgkjO1_CKFzUlKzhvNCSKrf58ZaF0HSB";
const DASHBOARD_FILENAME  = "moore_dashboard.html";

// ── Auth ──────────────────────────────────────────────────────────────────────
async function getAuthClient() {
  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
  const { client_secret, client_id, redirect_uris } = credentials.installed;
  const oAuth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris[0]
  );
  const token = JSON.parse(fs.readFileSync(TOKEN_PATH));
  oAuth2Client.setCredentials(token);
  return oAuth2Client;
}

// ── getFamilyDocs (unchanged) ─────────────────────────────────────────────────
export async function getFamilyDocs() {
  const auth = await getAuthClient();
  const drive = google.drive({ version: "v3", auth });

  const results = {};

  for (const [name, fileId] of Object.entries(DOCS)) {
    try {
      const res = await drive.files.export({
        fileId,
        mimeType: "text/plain",
      });
      results[name] = res.data;
      console.log(`Loaded document: ${name}`);
    } catch (err) {
      console.warn(`Could not load document "${name}": ${err.message}`);
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
  const drive = google.drive({ version: "v3", auth });

  try {
    const res = await drive.files.get(
      { fileId: NEWSLETTER_FILE_ID, alt: "media" },
      { responseType: "text" }
    );
    console.log("Newsletter fetched from Drive");
    return res.data;
  } catch (err) {
    console.warn(`Could not fetch newsletter: ${err.message}`);
    return null;
  }
}

// ── uploadDashboard ───────────────────────────────────────────────────────────
// Uploads moore_dashboard.html to the dashboard folder in Drive.
// Per system prompt: use textContent (not base64), disableConversionToGoogleType.
// The Apps Script in Drive handles cleanup of the previous version automatically.

export async function uploadDashboard(htmlContent) {
  const auth = await getAuthClient();
  const drive = google.drive({ version: "v3", auth });

  try {
    // Create the new file — Apps Script handles deleting the old one
    await drive.files.create({
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

    console.log(`✓ Dashboard updated · ${new Date().toLocaleDateString("en-US", { weekday: "long" })} ${now} ET`);
    return true;
  } catch (err) {
    console.error(`Dashboard upload failed: ${err.message}`);
    return false;
  }
}