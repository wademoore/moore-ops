/**
 * index.js
 * Moore Family Operations Assistant — Orchestrator
 *
 * Execution order:
 *   1. Fetch data in parallel (calendar, gmail, drive docs, newsletter)
 *   2. Fetch Nationals sports data for dashboard ticker
 *   3. Build digest data model (buildDigest)
 *   4. Render email HTML (renderEmail) → send to Wade + Robyn
 *   5. Render dashboard HTML (renderDashboard) → upload to Drive
 */

import "dotenv/config";

// ── Data fetchers ─────────────────────────────────────────────────────────────
import { getCalendarEvents }              from "./calendar.js";
import { getActivityEmails }              from "./gmail.js";
import { sendDigestEmail }                from "./mailer.js";
import { getFamilyDocs,
         fetchNewsletter,
         uploadDashboard }                from "./drive.js";

// ── Digest pipeline ───────────────────────────────────────────────────────────
import { buildDigest }                    from "./digest/builder.js";

// ── Renderers ─────────────────────────────────────────────────────────────────
import { renderEmail, emailSubject }      from "./render/email.js";
import { renderDashboard }                from "./render/dashboard.js";

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

// ── Sports data fetch ─────────────────────────────────────────────────────────
// Fetches Washington Nationals data for the sports ticker.
// Returns null on failure — ticker degrades gracefully.

async function fetchNationalsData() {
  try {
    // Dynamic import keeps this optional — if the sports module isn't wired
    // yet, the rest of the digest still runs cleanly.
    const { default: fetch } = await import("node-fetch");

    // SportRadar API — replace with your actual endpoint + key when available.
    // The fetch_sports_data tool in Claude's interface handles this automatically
    // when running in the chat context; in Node we call the API directly.
    //
    // Expected shape returned:
    // {
    //   lastGame: { result, score, opponent, atHome },
    //   record:   { w, l },
    //   standing: string,
    //   nextGame: { opponent, atHome, day, time },
    // }
    //
    // Until you have a SportRadar key, this returns null and the ticker
    // shows "No recent data" for the Nationals slot.

    console.log("Sports data: SportRadar key not yet configured — ticker will show fallback");
    return null;

  } catch (err) {
    console.warn(`Sports data fetch failed: ${err.message}`);
    return null;
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function runDigest() {
  console.log("\n═══════════════════════════════════════");
  console.log("Moore Family Digest — starting run");
  console.log(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
  console.log("═══════════════════════════════════════\n");

  // ── Step 1: Fetch all data in parallel ─────────────────────────────────────
  console.log("Fetching data...");
  const [rawEvents, emails, docs, newsletterText, nationalsData] = await Promise.all([
    getCalendarEvents(),
    getActivityEmails(),
    getFamilyDocs(),
    fetchNewsletter(),
    fetchNationalsData(),
  ]);

  console.log(`  Calendar: ${rawEvents.length} events`);
  console.log(`  Gmail:    ${emails.length} activity emails`);
  console.log(`  Docs:     familyContext ${docs.familyContext ? "✓" : "✗"}, athletics ${docs.athletics ? "✓" : "✗"}`);
  console.log(`  Newsletter: ${newsletterText ? "✓ loaded" : "✗ not available"}`);
  console.log(`  Nationals: ${nationalsData ? "✓ loaded" : "✗ not available (fallback)"}`);
  console.log();

  // ── Step 2: Newsletter fallback ─────────────────────────────────────────────
  // If Drive fetch failed, log a reminder for Wade to update the file.
  // builder.js handles null newsletterText gracefully.
  if (!newsletterText) {
    console.warn("  ⚠  Newsletter not fetched from Drive.");
    console.warn("     Wade: update 'Stonehouse Elementary School.html' in Drive with this week's newsletter.\n");
  }

  // ── Step 3: Build digest data model ────────────────────────────────────────
  console.log("Building digest...");
  const digestData = await buildDigest({
    rawEvents,
    emails,
    docs,
    newsletterText,
    banner: BANNER,
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
  await uploadDashboard(dashboardHtml);

  // ── Done ───────────────────────────────────────────────────────────────────
  console.log("\n═══════════════════════════════════════");
  console.log("Digest complete");
  console.log("═══════════════════════════════════════\n");
}

// ── Run ───────────────────────────────────────────────────────────────────────
runDigest().catch(err => {
  console.error("\n✗ Digest failed:", err.message);
  console.error(err.stack);
  process.exit(1);
});