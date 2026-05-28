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
         fetchNewsletter,
         uploadDashboard,
         getSportsConfig,
         getPBRecords,
         getFlagFootballData,
         getSwimResults,
         getWavesSeasonData }                  from "./drive.js";

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

async function runDigest() {
  console.log("\n═══════════════════════════════════════");
  console.log("Moore Family Digest — starting run");
  console.log(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
  console.log("═══════════════════════════════════════\n");

  // ── Step 1: Fetch all data in parallel ─────────────────────────────────────
  console.log("Fetching data...");
  const [rawEvents, rawEvents14d, emails, docs, newsletterText, nationalsData, sportsConfig, pbRecords, flagFootballData, swimResults, wavesSeasonData] = await Promise.all([
    getCalendarEvents(),
    pull14Days(),
    getActivityEmails(),
    getFamilyDocs(),
    fetchNewsletter(),
    fetchNationalsData(),
    getSportsConfig(),
    getPBRecords(),
    getFlagFootballData(),
    getSwimResults(),
    getWavesSeasonData(),
  ]);

  console.log(`  Calendar 72h: ${rawEvents.length} events`);
  console.log(`  Calendar 14d: ${rawEvents14d.length} events`);
  console.log(`  Gmail:        ${emails.length} activity emails`);
  console.log(`  Docs:         familyContext ${docs.familyContext ? "✓" : "✗"}`);
  console.log(`  Newsletter:   ${newsletterText ? "✓ loaded" : "✗ not available"}`);
  console.log(`  Nationals:    ${nationalsData ? "✓" : "✗ fallback"}`);
  console.log(`  Sports cfg:   ${sportsConfig ? "✓" : "✗"}`);
  console.log(`  Flag football: ${flagFootballData ? '✓' : '✗'}`);
  console.log(`  Swim results:  ${swimResults?.length ?? 0} result(s)`);
  console.log(`  PB records:    ${Object.keys(pbRecords || {}).length} key(s)`);
  console.log(`  Waves season:  ${wavesSeasonData ? '✓' : '✗'}`);
  console.log();

  // ── Step 2: Newsletter fallback notice ─────────────────────────────────────
  if (!newsletterText) {
    console.warn("  ⚠  Newsletter not fetched from Drive.");
    console.warn("     Wade: update 'Stonehouse Elementary School.html' in Drive with this week's newsletter.\n");
  }

  // ── Step 3: Build digest data model ────────────────────────────────────────
  console.log("Building digest...");
  const digestData = await buildDigest({
    rawEvents,
    rawEvents14d,
    emails,
    docs,
    newsletterText,
    banner:          BANNER,
    config:          sportsConfig,
    flagFootballData,
    pbRecords,
    swimResults,
    wavesSeasonData,
  });

  // Patch in sports data — builder leaves this null for index.js to fill
  digestData.nationalsData = nationalsData;

  console.log(`  Days:     ${digestData.days.length} (72-hour window)`);
  console.log(`  Flags:    ${digestData.flags.length}`);
  console.log(`  Events:   ${digestData.days.reduce((n, d) => n + d.events.length, 0)} in window`);
  console.log(`  Upcoming: ${digestData.upcomingEvents.length} in 14-day lookahead`);
  console.log();

  // ── Step 4: Render + send email ─────────────────────────────────────────────
  console.log("Rendering email...");
  const { subject, html: emailHtml } = renderEmail(digestData, "all");
  console.log(`  Subject: ${subject}`);

  console.log("Sending email...");
  await sendDigestEmail(subject, emailHtml);
  console.log("  ✓ Email sent to wademoore@gmail.com + robyn.brantley@gmail.com\n");

  // ── Step 5: Render + upload dashboard ──────────────────────────────────────
  console.log("Rendering dashboard...");
  const dashboardHtml = renderDashboard(digestData);
  console.log(`  Size: ${(Buffer.byteLength(dashboardHtml, "utf8") / 1024).toFixed(1)}KB`);

  console.log("Uploading dashboard to Drive...");
  const uploaded = await uploadDashboard(dashboardHtml);
  if (!uploaded) {
    console.warn('[handler] Dashboard upload failed — check Drive permissions');
  }

  // ── Done ───────────────────────────────────────────────────────────────────
  console.log("\n═══════════════════════════════════════");
  console.log("Digest complete");
  console.log("═══════════════════════════════════════\n");
}

// ── Run ───────────────────────────────────────────────────────────────────────
// ── Lambda entry point ────────────────────────────────────────────────────────
export const handler = async (event) => {
  try {
    await runDigest();
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
  runDigest().catch(err => {
    console.error("\n✗ Digest failed:", err.message);
    console.error(err.stack);
    process.exit(1);
  });
}