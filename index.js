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

import "dotenv/config";

// ── Data fetchers ─────────────────────────────────────────────────────────────
import { getCalendarEvents, pull14Days }       from "./calendar.js";
import { getActivityEmails }                   from "./gmail.js";
import { sendDigestEmail }                     from "./mailer.js";
import { getFamilyDocs,
         fetchNewsletter,
         uploadDashboard }                     from "./drive.js";

// ── Digest pipeline ───────────────────────────────────────────────────────────
import { buildDigest }                         from "./digest/builder.js";

// ── Renderers ─────────────────────────────────────────────────────────────────
import { renderEmail, emailSubject }           from "./render/email.js";
import { renderDashboard }                     from "./render/dashboard.js";

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

// ── Nationals sports data ─────────────────────────────────────────────────────
// Uses the free MLB Stats API — no key required.
// Returns the nationalsData shape expected by render/dashboard.js.

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

async function fetchNationalsData() {
  try {
    const { default: fetch } = await import("node-fetch");

    // Washington Nationals team ID = 120
    const TEAM_ID = 120;
    const today = new Date().toISOString().slice(0, 10);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000)
      .toISOString().slice(0, 10);
    const in7days = new Date(Date.now() + 7 * 24 * 3600 * 1000)
      .toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 24 * 3600 * 1000)
      .toISOString().slice(0, 10);

    // Fetch recent games, standings, and upcoming games in parallel
    const [schedRes, standingsRes, nextRes] = await Promise.all([
      fetch(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&teamId=${TEAM_ID}&startDate=${sevenDaysAgo}&endDate=${today}&hydrate=linescore,team`),
      fetch(`https://statsapi.mlb.com/api/v1/standings?leagueId=104&season=2026&standingsTypes=regularSeason`),
      fetch(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&teamId=${TEAM_ID}&startDate=${tomorrow}&endDate=${in7days}&hydrate=team`),
    ]);

    const schedData     = await schedRes.json();
    const standingsData = await standingsRes.json();
    const nextData      = await nextRes.json();

    // ── Last completed game ────────────────────────────────────────────────
    const allGames = (schedData.dates || [])
      .flatMap(d => d.games || [])
      .filter(g => g.status?.abstractGameState === 'Final');

    let lastGame = null;
    if (allGames.length) {
      const g        = allGames[allGames.length - 1];
      const home     = g.teams?.home;
      const away     = g.teams?.away;
      const natsHome = home?.team?.id === TEAM_ID;
      const natsTeam = natsHome ? home : away;
      const oppTeam  = natsHome ? away  : home;
      const natsScore = natsTeam?.score ?? 0;
      const oppScore  = oppTeam?.score  ?? 0;
      lastGame = {
        result:   natsScore > oppScore ? 'W' : 'L',
        score:    `${natsScore}–${oppScore}`,
        opponent: oppTeam?.team?.abbreviation || '???',
        atHome:   natsHome,
      };
    }

    // ── Record + division standing ─────────────────────────────────────────
    let record  = null;
    let standing = null;
    for (const league of standingsData.records || []) {
      for (const teamRec of league.teamRecords || []) {
        if (teamRec.team?.id === TEAM_ID) {
          record   = { w: teamRec.wins, l: teamRec.losses };
          const rank = parseInt(teamRec.divisionRank) || 1;
          standing = `${rank}${ordinal(rank)} NL East`;
          break;
        }
      }
      if (record) break;
    }

    // ── Next game ──────────────────────────────────────────────────────────
    let nextGame = null;
    const upcoming = (nextData.dates || [])[0]?.games?.[0];
    if (upcoming) {
      const home     = upcoming.teams?.home;
      const away     = upcoming.teams?.away;
      const natsHome = home?.team?.id === TEAM_ID;
      const oppTeam  = natsHome ? away : home;
      const gameTime = new Date(upcoming.gameDate);
      nextGame = {
        opponent: oppTeam?.team?.abbreviation || '???',
        atHome:   natsHome,
        day:      gameTime.toLocaleDateString('en-US', {
          weekday: 'short', timeZone: 'America/New_York',
        }),
        time: gameTime.toLocaleTimeString('en-US', {
          hour: 'numeric', minute: '2-digit', hour12: true,
          timeZone: 'America/New_York',
        }),
      };
    }

    console.log(`  Nationals: ${lastGame ? `${lastGame.result} ${lastGame.score} vs ${lastGame.opponent}` : 'no recent game'} · ${record ? `${record.w}-${record.l}` : 'no record'}`);
    return { lastGame, record, standing, nextGame };

  } catch (err) {
    console.warn(`  Nationals data fetch failed: ${err.message}`);
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
  const [rawEvents, rawEvents14d, emails, docs, newsletterText, nationalsData] = await Promise.all([
    getCalendarEvents(),
    pull14Days(),
    getActivityEmails(),
    getFamilyDocs(),
    fetchNewsletter(),
    fetchNationalsData(),
  ]);

  console.log(`  Calendar 72h: ${rawEvents.length} events`);
  console.log(`  Calendar 14d: ${rawEvents14d.length} events`);
  console.log(`  Gmail:        ${emails.length} activity emails`);
  console.log(`  Docs:         familyContext ${docs.familyContext ? "✓" : "✗"}, athletics ${docs.athletics ? "✓" : "✗"}`);
  console.log(`  Newsletter:   ${newsletterText ? "✓ loaded" : "✗ not available"}`);
  console.log(`  Nationals:    ${nationalsData ? "✓" : "✗ fallback"}`);
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