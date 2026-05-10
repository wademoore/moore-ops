import { google } from "googleapis";
import fs from "fs";

const CREDENTIALS_PATH = "credentials.json";
const TOKEN_PATH = "token.json";

// Document IDs from your Google Drive URLs
const DOCS = {
  familyContext: "1eXMPEAIMZciwUc8eUQl042Bt0zW0P3Q0d_o8NqYnOx4",
  athletics: "196wHllkytM_p2jnIXpFKGm2EQall8cd2sfuE5jaurJE",
};

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