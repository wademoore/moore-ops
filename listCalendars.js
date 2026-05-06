import { google } from "googleapis";
import fs from "fs";
import "dotenv/config";

const credentials = JSON.parse(fs.readFileSync("credentials.json"));
const { client_secret, client_id, redirect_uris } = credentials.installed;
const oAuth2Client = new google.auth.OAuth2(
  client_id,
  client_secret,
  redirect_uris[0]
);

const token = JSON.parse(fs.readFileSync("token.json"));
oAuth2Client.setCredentials(token);

const calendar = google.calendar({ version: "v3", auth: oAuth2Client });
const res = await calendar.calendarList.list();

res.data.items.forEach(cal => {
  console.log(`${cal.summary}: ${cal.id}`);
});