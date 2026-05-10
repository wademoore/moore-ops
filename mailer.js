import { google } from "googleapis";
import fs from "fs";

const CREDENTIALS_PATH = "credentials.json";
const TOKEN_PATH = "token.json";

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

function makeEmailBody(to, subject, htmlContent) {
  const boundary = "moore_ops_boundary";
  const message = [
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "",
    htmlContent,
    "",
    `--${boundary}--`,
  ].join("\n");

  return Buffer.from(message)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function sendDigestEmail(subject, htmlContent) {
  const auth = await getAuthClient();
  const gmail = google.gmail({ version: "v1", auth });

  const recipients = [
    "wademoore@gmail.com",
    "robyn.brantley@gmail.com",
  ];

  for (const recipient of recipients) {
    const raw = makeEmailBody(recipient, subject, htmlContent);
    await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw },
    });
    console.log(`Digest sent to ${recipient}`);
  }
}