import { google } from "googleapis";
import fs from "fs";
import readline from "readline";

const SCOPES = ["https://www.googleapis.com/auth/calendar.readonly"];
const TOKEN_PATH = "token.json";
const CREDENTIALS_PATH = "credentials.json";

const FAMILY_CALENDARS = {
  "Wade Personal": "wademoore@gmail.com",
  "Wade On-Call": "bpe8s3ggfuiv306dlmpdbv5rvk@group.calendar.google.com",
  "Family": "family07878234371362888643@group.calendar.google.com",
  "Myles": "5878c84d8e1a4e075030e7cddffd034fa4d38b52e0bac5cce816ceac6fd1c089@group.calendar.google.com",
  "Ophelia": "06489bc7e533f0f62dd989b34ded54d64c04f5fc5f2a5767bea98d64ce4868e3@group.calendar.google.com",
  "Routine": "384ed3b47848634fdc4c333bf5d2bff1a37ca599d4f39b1a85f37b36c43f1d27@group.calendar.google.com",
  "Menu": "rtd3pm2tqjusgob36vpoi4u85c@group.calendar.google.com",
  "Wellington Waves": "v8unhfav8e0gpb9u6k0dkkgqgrc6fq0j@import.calendar.google.com",
  "WJCC Schools": "o3oasbc616bhijsqn80a58jo7a40lrl2@import.calendar.google.com",
  "Robyn": "robyn.brantley@gmail.com",
};

async function getAuthClient() {
  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
  const { client_secret, client_id, redirect_uris } = credentials.installed;
  const oAuth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris[0]
  );

  if (fs.existsSync(TOKEN_PATH)) {
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH));
    oAuth2Client.setCredentials(token);
  } else {
    await getNewToken(oAuth2Client);
  }

  return oAuth2Client;
}

export async function getCalendarEvents() {
  const auth = await getAuthClient();
  const calendar = google.calendar({ version: "v3", auth });

  const now = new Date();
  const in72Hours = new Date(now.getTime() + 72 * 60 * 60 * 1000);

  // Pull from all calendars simultaneously
  const results = await Promise.all(
    Object.entries(FAMILY_CALENDARS).map(async ([name, id]) => {
      try {
        const res = await calendar.events.list({
          calendarId: id,
          timeMin: now.toISOString(),
          timeMax: in72Hours.toISOString(),
          singleEvents: true,
          orderBy: "startTime",
        });
        return (res.data.items || []).map(event => ({
          ...event,
          calendarName: name,
        }));
      } catch (err) {
        console.warn(`Could not load calendar "${name}": ${err.message}`);
        return [];
      }
    })
  );

  // Merge and sort all events by start time
  const allEvents = results.flat().sort((a, b) => {
    const aTime = a.start.dateTime || a.start.date;
    const bTime = b.start.dateTime || b.start.date;
    return new Date(aTime) - new Date(bTime);
  });

  return allEvents;
}

async function getNewToken(oAuth2Client) {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
  });

  console.log("\nAuthorize this app by visiting this URL:\n");
  console.log(authUrl);
  console.log("\n");

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const code = await new Promise((resolve) => {
    rl.question("Paste the authorization code here: ", (code) => {
      rl.close();
      resolve(code);
    });
  });

  const { tokens } = await oAuth2Client.getToken(code);
  oAuth2Client.setCredentials(tokens);
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
  console.log("Token saved — you won't need to do this again.\n");
}