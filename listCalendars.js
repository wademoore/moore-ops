import { calendar } from "@googleapis/calendar";
import { OAuth2Client } from "google-auth-library";
import fs from "fs";
import "dotenv/config";

const credentials = JSON.parse(fs.readFileSync("credentials.json"));
const { client_secret, client_id, redirect_uris } = credentials.installed;
const oAuth2Client = new OAuth2Client(client_id, client_secret, redirect_uris[0]);


const token = JSON.parse(fs.readFileSync("token.json"));
oAuth2Client.setCredentials(token);

const cal = calendar({ version: "v3", auth });
const res = await cal.calendarList.list();

res.data.items.forEach(cal => {
  console.log(`${cal.summary}: ${cal.id}`);
});