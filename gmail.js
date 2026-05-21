import { gmail } from "@googleapis/gmail";
import { getAuthClient } from "./auth.js";

const WATCHED_SENDERS = [
  "no-reply@thestudiodirectr.biz",
  "notifications+va757@gomotionapp.com",
  "perfectperformanceflag.mailer@leagueapps.com",
  "melissa.white@wjccschools.org",
];

export async function getActivityEmails() {
  try {
    const auth = await getAuthClient();
    const gml = gmail({ version: "v1", auth });

    // Build search query for all watched senders in last 3 days
    const senderQuery = WATCHED_SENDERS.map(s => `from:${s}`).join(" OR ");
    const query = `(${senderQuery}) newer_than:3d`;

    const res = await gml.users.messages.list({
      userId: "me",
      q: query,
      maxResults: 20,
    });

    const messages = res.data.messages || [];
    if (messages.length === 0) return [];

    // Fetch full details for each message
    const emails = await Promise.all(
      messages.map(async (msg) => {
        const full = await gml.users.messages.get({
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
  } catch (err) {
    console.warn(`[gmail:getActivityEmails] Fetch failed — ${err.message}`);
    return [];
  }
}