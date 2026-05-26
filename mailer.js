import { gmail } from "@googleapis/gmail";
import { getAuthClient } from "./auth.js";
import fs from "fs";

const CREDENTIALS_PATH = "credentials.json";
const TOKEN_PATH = "token.json";


/**
 * MIME-encodes a header value (e.g. subject line) using RFC 2047 base64 encoding.
 * This correctly handles em-dashes, curly quotes, and any other non-ASCII characters
 * so Gmail renders them properly instead of showing garbled Ã¢Â€Â" sequences.
 */
function encodeMimeHeader(value) {
  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

function makeEmailBody(to, subject, htmlContent) {
  const boundary = "moore_ops_boundary";
  const message = [
    `To: ${to}`,
    `Subject: ${encodeMimeHeader(subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(htmlContent, 'utf8').toString('base64'),
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
  const gml = gmail({ version: "v1", auth });
  
  const recipients = [
    "wademoore@gmail.com",
    "robyn.brantley@gmail.com",
  ];

  for (const recipient of recipients) {
    const raw = makeEmailBody(recipient, subject, htmlContent);
    await gml.users.messages.send({
      userId: "me",
      requestBody: { raw },
    });
    console.log(`Digest sent to ${recipient}`);
  }
}