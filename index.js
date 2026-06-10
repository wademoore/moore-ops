/**
 * index.js
 * Moore Family Operations Assistant — Orchestrator
 *
 * Execution order:
 *   1. Fetch data in parallel (calendar 72h, calendar 14d, gmail, drive docs, newsletter, nationals)
 *   2. Build digest data model (buildDigest)
 *   3. Render email HTML (renderEmail) → send to Wade + Robyn
 *   4. Render dashboard HTML (renderDashboard) → upload to Drive
 */

// ── Data fetchers ─────────────────────────────────────────────────────────────
import { getCalendarEvents, pull14Days }       from "./calendar.js";
import { getActivityEmails }                   from "./gmail.js";
import { sendDigestEmail }                     from "./mailer.js";
import { getFamilyDocs,
         uploadDashboard }                     from "./drive.js";

// ── Digest pipeline ───────────────────────────────────────────────────────────
import { buildDigest }                         from "./digest/builder.js";
import { fetchNationalsData }                  from "./digest/nationalsParser.js";

// ── Renderers ─────────────────────────────────────────────────────────────────
import { renderEmail, emailSubject }           from "./render/email.js";
import { renderDashboard }                     from "./render/dashboard.js";

// ── Local env ─────────────────────────────────────────────────────────────────
// Load .env when running locally. Skipped on Lambda (dotenv is not bundled).
if (!process.env.AWS_LAMBDA_FUNCTION_NAME) {
  const { config } = await import('dotenv');
  config();
}

// ── Banner state ──────────────────────────────────────────────────────────────
// Set banner here when Wade requests one for a specific event.
// Clear it (set to null) after the event has passed.
// Shape: { supertitle, headline, subtitle, type, logoUrl }
// Types: 'achievement' | 'celebration' | 'championship' | 'neutral'
//
// Example:
//   const BANNER = {
//     supertitle: 'Tonight',
//     headline:   'Dance Recital!',
//     subtitle:   'Glenn Close Theater · 1:00 PM',
//     type:       'celebration',
//     logoUrl:    null,
//   };

const BANNER = null;

// ── Main ──────────────────────────────────────────────────────────────────────

async function fetchAndBuild() {
  console.log("Fetching data...");
  const [rawEvents, rawEvents14d, emails, docs, nationalsData] = await Promise.all([
    getCalendarEvents(),
    pull14Days(),
    getActivityEmails(),
    getFamilyDocs(),
    fetchNationalsData(),
  ]);

  console.log(`  Calendar 72h: ${rawEvents.length} events`);
  console.log(`  Calendar 14d: ${rawEvents14d.length} events`);
  console.log(`  Gmail:        ${emails.length} activity emails`);
  console.log(`  Docs:         familyContext ${docs.familyContext ? "✓" : "✗"}`);
  console.log(`  Nationals:    ${nationalsData ? "✓" : "✗ fallback"}`);
  console.log(`  Sports data:  read from data/ (local JSON files)`);
  console.log();

  console.log("Building digest...");
  const digestData = await buildDigest({
    rawEvents,
    rawEvents14d,
    emails,
    docs,
    banner: BANNER,
    // Sports data (config, flagFootballData, pbRecords, swimResults,
    // wavesSeasonData, vpsuRankings) is loaded from data/ inside buildDigest().
  });

  // Patch in sports data — builder leaves this null for index.js to fill
  digestData.nationalsData = nationalsData;

  console.log(`  Days:     ${digestData.days.length} (72-hour window)`);
  console.log(`  Flags:    ${digestData.flags.length}`);
  console.log(`  Events:   ${digestData.days.reduce((n, d) => n + d.events.length, 0)} in window`);
  console.log(`  Upcoming: ${digestData.upcomingEvents.length} in 14-day lookahead`);
  console.log();

  return digestData;
}

async function runDashboard(digestData) {
  console.log("Rendering dashboard...");
  const dashboardHtml = renderDashboard(digestData);
  console.log(`  Size: ${(Buffer.byteLength(dashboardHtml, "utf8") / 1024).toFixed(1)}KB`);

  console.log("Uploading dashboard to Drive...");
  const uploaded = await uploadDashboard(dashboardHtml);
  if (!uploaded) {
    console.warn('[handler] Dashboard upload failed — check Drive permissions');
  }
}

async function runFull() {
  console.log("\n═══════════════════════════════════════");
  console.log("Moore Family Digest — starting run");
  console.log(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
  console.log("═══════════════════════════════════════\n");

  const digestData = await fetchAndBuild();

  console.log("Rendering email...");
  const { subject, html: emailHtml } = renderEmail(digestData, "all");
  console.log(`  Subject: ${subject}`);

  console.log("Sending email...");
  await sendDigestEmail(subject, emailHtml);
  console.log("  ✓ Email sent to wademoore@gmail.com + robyn.brantley@gmail.com\n");

  await runDashboard(digestData);

  console.log("\n═══════════════════════════════════════");
  console.log("Digest complete");
  console.log("═══════════════════════════════════════\n");
}

async function runDashboardOnly() {
  console.log("\n═══════════════════════════════════════");
  console.log("Moore Family Digest — dashboard refresh");
  console.log(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
  console.log("═══════════════════════════════════════\n");

  const digestData = await fetchAndBuild();
  await runDashboard(digestData);

  console.log("\n═══════════════════════════════════════");
  console.log("Dashboard refresh complete");
  console.log("═══════════════════════════════════════\n");
}

// ── Run ───────────────────────────────────────────────────────────────────────
// ── Lambda entry point ────────────────────────────────────────────────────────
const JSON_HEADERS = { 'Content-Type': 'application/json' };

export const handler = async (event) => {
  console.log('[handler] event:', JSON.stringify(event));
  // HTTP invocation via Function URL
  if (event.requestContext?.http) {
    const expectedToken = process.env.DASHBOARD_REFRESH_TOKEN;
    const providedToken  = event.queryStringParameters?.token;

    if (!expectedToken || !providedToken || providedToken !== expectedToken) {
      return { statusCode: 401, headers: JSON_HEADERS, body: JSON.stringify({ error: 'unauthorized' }) };
    }

    try {
      await runDashboardOnly();
      return { statusCode: 200, headers: JSON_HEADERS, body: JSON.stringify({ status: 'ok' }) };
    } catch (err) {
      console.error('[handler] Dashboard refresh failed —', err.message);
      console.error(err.stack);
      return { statusCode: 500, headers: JSON_HEADERS, body: JSON.stringify({ error: err.message }) };
    }
  }

  // Direct invocation with dashboardOnly flag
  if (event.dashboardOnly === true) {
    try {
      await runDashboardOnly();
      return { statusCode: 200, body: "Dashboard refresh complete" };
    } catch (err) {
      console.error('[handler] Dashboard refresh failed —', err.message);
      console.error(err.stack);
      return { statusCode: 500, body: `Dashboard refresh failed: ${err.message}` };
    }
  }

  // EventBridge (scheduled) invocation
  try {
    await runFull();
    return { statusCode: 200, body: "Digest complete" };
  } catch (err) {
    console.error('[handler] Digest run failed —', err.message);
    console.error(err.stack);
    return { statusCode: 500, body: `Digest failed: ${err.message}` };
  }
};

// ── Local entry point ─────────────────────────────────────────────────────────
// AWS_LAMBDA_FUNCTION_NAME is set automatically by the Lambda runtime.
// When running locally, it's undefined, so this block executes instead.
if (!process.env.AWS_LAMBDA_FUNCTION_NAME) {
  runFull().catch(err => {
    console.error("\n✗ Digest failed:", err.message);
    console.error(err.stack);
    process.exit(1);
  });
}