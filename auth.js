/**
 * auth.js
 * Shared Google OAuth client for moore-ops.
 *
 * - Locally:    reads credentials.json + token.json from disk (unchanged workflow)
 * - On Lambda:  reads from AWS Secrets Manager, persists refreshed tokens back
 *
 * All three API modules (calendar.js, drive.js, gmail.js) import getAuthClient()
 * from here instead of maintaining their own copies.
 */

import { OAuth2Client } from "google-auth-library";
import fs from "fs";

// AWS_LAMBDA_FUNCTION_NAME is set automatically by the Lambda runtime.
// Using it as the environment switch means zero extra config locally.
const IS_LAMBDA = !!process.env.AWS_LAMBDA_FUNCTION_NAME;

const SECRET_CREDENTIALS = process.env.GOOGLE_CREDENTIALS_SECRET || "moore-ops/google-credentials";
const SECRET_TOKEN        = process.env.GOOGLE_TOKEN_SECRET        || "moore-ops/google-oauth-token";
const ENV_CREDENTIALS     = process.env.GOOGLE_CREDENTIALS_JSON;
const ENV_TOKEN           = process.env.GOOGLE_TOKEN_JSON;
const READ_ONLY_AUTH      = process.env.GOOGLE_AUTH_READ_ONLY === "1";
const EXTERNAL_CREDENTIALS_PATH = process.env.MOORE_OPS_CREDENTIALS_PATH;
const EXTERNAL_TOKEN_PATH = process.env.MOORE_OPS_TOKEN_PATH;

// ── Secrets Manager client (lazy — only instantiated in Lambda) ───────────────

let _smClient = null;

async function getSmClient() {
  if (_smClient) return _smClient;
  const { SecretsManagerClient } = await import("@aws-sdk/client-secrets-manager");
  _smClient = new SecretsManagerClient({
    region: process.env.AWS_REGION || "us-east-2",
  });
  return _smClient;
}

async function getSecret(secretName) {
  const { GetSecretValueCommand } = await import("@aws-sdk/client-secrets-manager");
  const client = await getSmClient();
  const res = await client.send(new GetSecretValueCommand({ SecretId: secretName }));
  return JSON.parse(res.SecretString);
}

async function putSecret(secretName, value) {
  const { PutSecretValueCommand } = await import("@aws-sdk/client-secrets-manager");
  const client = await getSmClient();
  await client.send(
    new PutSecretValueCommand({
      SecretId: secretName,
      SecretString: JSON.stringify(value),
    })
  );
}

// ── Credential + token loaders ────────────────────────────────────────────────

async function loadCredentials() {
  if (ENV_CREDENTIALS) return JSON.parse(ENV_CREDENTIALS);
  if (IS_LAMBDA) {
    return getSecret(SECRET_CREDENTIALS);
  }
  return JSON.parse(fs.readFileSync(EXTERNAL_CREDENTIALS_PATH || "credentials.json"));
}

async function loadToken() {
  if (ENV_TOKEN) return JSON.parse(ENV_TOKEN);
  if (IS_LAMBDA) {
    return getSecret(SECRET_TOKEN);
  }
  return JSON.parse(fs.readFileSync(EXTERNAL_TOKEN_PATH || "token.json"));
}

async function persistToken(token) {
  if (READ_ONLY_AUTH || EXTERNAL_TOKEN_PATH) return;
  if (IS_LAMBDA) {
    await putSecret(SECRET_TOKEN, token);
    console.log("  Token refreshed → saved to Secrets Manager");
  } else {
    fs.writeFileSync("token.json", JSON.stringify(token, null, 2));
    console.log("  Token refreshed → saved to token.json");
  }
}

// ── Shared auth client ────────────────────────────────────────────────────────
// Cached for the lifetime of the process / Lambda invocation.
// All three API modules call getAuthClient() — they all get the same instance.

let _cachedClient = null;

export async function getAuthClient() {
  if (_cachedClient) return _cachedClient;

  const credentials = await loadCredentials();
  const { client_secret, client_id, redirect_uris } = credentials.installed;

  const oAuth2Client = new OAuth2Client(client_id, client_secret, redirect_uris[0]);

  const token = await loadToken();
  oAuth2Client.setCredentials(token);

  // Whenever googleapis silently refreshes the access token, persist the
  // updated credentials so the next invocation starts with a valid token.
  oAuth2Client.on("tokens", async (newTokens) => {
    try {
      const current = await loadToken();
      await persistToken({ ...current, ...newTokens });
    } catch (err) {
      console.warn("  Warning: could not persist refreshed token:", err.message);
    }
  });

  _cachedClient = oAuth2Client;
  return oAuth2Client;
}
