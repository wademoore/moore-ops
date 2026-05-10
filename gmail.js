import { google } from "googleapis";
import fs from "fs";

const CREDENTIALS_PATH = "credentials.json";
const TOKEN_PATH = "token.json";

const WATCHED_SENDERS = [
  "no-reply@thestudiodirectr.biz",
  "notifications+va757@gomotionapp.com",
  "perfectperformanceflag.mailer@leagueapps.com",
  "melissa.white@wjccschools.org",
];

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

export async function getActivityEmails() {
  const auth = await getAuthClient();
  const gmail = google.gmail({ version: "v1", auth });

  // Build search query for all watched senders in last 3 days
  const senderQuery = WATCHED_SENDERS.map(s => `from:${s}`).join(" OR ");
  const query = `(${senderQuery}) newer_than:3d`;

  const res = await gmail.users.messages.list({
    userId: "me",
    q: query,
    maxResults: 20,
  });

  const messages = res.data.messages || [];
  if (messages.length === 0) return [];

  // Fetch full details for each message
  const emails = await Promise.all(
    messages.map(async (msg) => {
      const full = await gmail.users.messages.get({
        userId: "me",
        id: msg.id,
        format: "metadata",
        metadataHeaders: ["From", "Subject", "Date"],
      });

      const headers = full.data.payload.headers;
      const get = (name) =>
        headers.find((h) => h.name === name)?.value || "";

      return {
        from: get("From"),
        subject: get("Subject"),
        date: get("Date"),
        snippet: full.data.snippet,
      };
    })
  );

  return emails;
}