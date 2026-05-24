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
         getProcessedMeets,
         listFolderFiles,
         fetchFileAsBuffer,
         updateProcessedMeets,
         writePBRecords }                      from "./drive.js";

// ── Digest pipeline ───────────────────────────────────────────────────────────
import { buildDigest }                         from "./digest/builder.js";
import { fetchNationalsData }                  from "./digest/nationalsParser.js";
import { parseMeetText, mergePBUpdates }       from "./digest/meetResultsParser.js";

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

// ── Meet results processor ────────────────────────────────────────────────────
// Checks for new PDFs in the meet results folder, parses them, and updates
// pb-records.json. Runs between the parallel fetch and buildDigest so the
// digest email reflects newly detected PBs. Never throws — a failed PDF parse
// is logged and skipped; the digest pipeline continues regardless.

async function processMeetResults(currentRecords, currentProcessed) {
  const folderId = process.env.DRIVE_MEET_RESULTS_FOLDER_ID;
  const allFiles = await listFolderFiles(folderId);

  const processedIds = new Set((currentProcessed.processedFiles || []).map(f => f.fileId));
  const unprocessed  = allFiles.filter(f => !processedIds.has(f.id));

  if (unprocessed.length === 0) {
    console.log('[meetResults] No new meet PDFs — skipping');
    return { workingRecords: currentRecords, totalNewPBs: 0 };
  }

  // Oldest first so batch PB comparisons are chronologically ordered
  unprocessed.sort((a, b) => new Date(a.createdTime) - new Date(b.createdTime));

  const workingRecords  = { ...currentRecords, records: [...(currentRecords.records || [])] };
  const originalJSON    = JSON.stringify(workingRecords.records);
  let workingProcessed  = currentProcessed;
  let filesProcessed    = 0;
  let totalNewPBs       = 0;

  // Lazy-load pdf2json only when new files are present (cold-start guard)
  const { default: PDFParser } = await import('pdf2json');

  for (const file of unprocessed) {
    try {
      const buffer = await fetchFileAsBuffer(file.id);
      const text = await new Promise((resolve, reject) => {
        const parser = new PDFParser(null, 1);
        parser.on('pdfParser_dataReady', () => {
          const raw = parser.getRawTextContent();
          const text = raw.replace(/(?<=[A-Za-z]) (?=[A-Za-z])/g, '');
          console.log(`[meetResults] post-collapse sample (${file.name}): ${JSON.stringify(text.slice(0, 300))}`);
          resolve(text);
        });
        parser.on('pdfParser_dataError', reject);
        parser.parseBuffer(buffer);
      });

      const meetData = parseMeetText(text);
      if (!meetData) {
        console.warn(`[meetResults] Failed to parse "${file.name}" — no valid header found — skipping`);
        continue;
      }

      const { updatedRecords, newPBLog } = mergePBUpdates(meetData.results, workingRecords);
      workingRecords.records = updatedRecords;

      const mylesNew   = newPBLog.filter(e => e.startsWith('myles')).length;
      const opheliaNew = newPBLog.filter(e => e.startsWith('ophelia')).length;
      console.log(`[meetResults] Processed "${meetData.meetName}" (${meetData.meetDate}) — Myles: ${mylesNew} new PB(s), Ophelia: ${opheliaNew} new PB(s)`);

      totalNewPBs  += newPBLog.length;
      filesProcessed++;

      const entry = {
        fileId:      file.id,
        fileName:    file.name,
        meetName:    meetData.meetName,
        meetDate:    meetData.meetDate,
        processedAt: new Date().toISOString(),
      };
      await updateProcessedMeets(entry, workingProcessed);
      // Accumulate entries so each subsequent write sees the full list
      workingProcessed = {
        ...workingProcessed,
        processedFiles: [...(workingProcessed.processedFiles || []), entry],
      };
    } catch (err) {
      console.warn(`[meetResults] Failed to parse "${file.name}" — ${err.message} — skipping`);
    }
  }

  if (JSON.stringify(workingRecords.records) !== originalJSON) {
    workingRecords.lastUpdated = new Date().toISOString();
    await writePBRecords(workingRecords);
  }

  console.log(`[meetResults] Batch complete — ${filesProcessed} PDF(s) processed, ${totalNewPBs} new PB(s) total`);
  return { workingRecords, totalNewPBs };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function runDigest() {
  console.log("\n═══════════════════════════════════════");
  console.log("Moore Family Digest — starting run");
  console.log(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
  console.log("═══════════════════════════════════════\n");

  // ── Step 1: Fetch all data in parallel ─────────────────────────────────────
  console.log("Fetching data...");
  const [rawEvents, rawEvents14d, emails, docs, newsletterText, nationalsData, sportsConfig, currentRecords, currentProcessed] = await Promise.all([
    getCalendarEvents(),
    pull14Days(),
    getActivityEmails(),
    getFamilyDocs(),
    fetchNewsletter(),
    fetchNationalsData(),
    getSportsConfig(),
    getPBRecords(),
    getProcessedMeets(),
  ]);

  console.log(`  Calendar 72h: ${rawEvents.length} events`);
  console.log(`  Calendar 14d: ${rawEvents14d.length} events`);
  console.log(`  Gmail:        ${emails.length} activity emails`);
  console.log(`  Docs:         familyContext ${docs.familyContext ? "✓" : "✗"}, athletics ${docs.athletics ? "✓" : "✗"}`);
  console.log(`  Newsletter:   ${newsletterText ? "✓ loaded" : "✗ not available"}`);
  console.log(`  Nationals:    ${nationalsData ? "✓" : "✗ fallback"}`);
  console.log(`  Sports cfg:   ${sportsConfig ? "✓" : "✗"}`);
  console.log(`  PB records:   ${currentRecords?.records?.length ?? 0} record(s)`);
  console.log(`  Processed:    ${currentProcessed?.processedFiles?.length ?? 0} meet(s) already processed`);
  console.log();

  // ── Step 2: Newsletter fallback notice ─────────────────────────────────────
  if (!newsletterText) {
    console.warn("  ⚠  Newsletter not fetched from Drive.");
    console.warn("     Wade: update 'Stonehouse Elementary School.html' in Drive with this week's newsletter.\n");
  }

  // ── Step 2b: Process any new meet result PDFs ──────────────────────────────
  const { workingRecords } = await processMeetResults(currentRecords, currentProcessed).catch(err => {
    console.warn('[meetResults] processMeetResults failed — continuing with unmodified records:', err.message);
    return { workingRecords: currentRecords, totalNewPBs: 0 };
  });

  // ── Step 3: Build digest data model ────────────────────────────────────────
  console.log("Building digest...");
  const digestData = await buildDigest({
    rawEvents,
    rawEvents14d,
    emails,
    docs,
    newsletterText,
    banner:         BANNER,
    config:         sportsConfig,
    currentRecords: workingRecords,
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