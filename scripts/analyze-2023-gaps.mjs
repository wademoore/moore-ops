/**
 * Post-parse analysis: for each 2023 meet in the history files, report
 * - which sourceEventNumbers are present (individual only)
 * - max event number
 * - missing event numbers 1-52
 * - total row counts by meet
 *
 * Rows use `sourcePdf` to identify their source; we join against manifest's `sourcePdfPath`.
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');

const ind = JSON.parse(readFileSync(resolve(ROOT, 'data/league-results-history-v2.json'), 'utf8'));
const rel = JSON.parse(readFileSync(resolve(ROOT, 'data/relay-results-history-v2.json'), 'utf8'));
const manifest = JSON.parse(readFileSync(resolve(ROOT, 'docs/data-reload/reload-manifest.json'), 'utf8'));

const entries2023 = manifest['2023'].filter(e => e.parsedIntoV2);
const newEntries = entries2023.filter(e => e.meetSlug !== '2023-07-17-eh-at-glt');

// Sort by date then slug for consistent output
newEntries.sort((a, b) => a.date.localeCompare(b.date) || a.meetSlug.localeCompare(b.meetSlug));

console.log('Analyzing event gaps for 2023 meets...\n');

const summaryRows = [];

for (const entry of newEntries) {
  const pdfPath = entry.sourcePdfPath;
  const indRows = ind.filter(r => r.sourcePdf === pdfPath);
  const relRows = rel.filter(r => r.sourcePdf === pdfPath);
  const eventNums = [...new Set(indRows.map(r => r.sourceEventNumber))].sort((a, b) => a - b);
  const maxEvt = eventNums.length ? Math.max(...eventNums) : 0;

  // Missing event numbers between 1 and maxEvt
  const missingUpToMax = [];
  for (let i = 1; i <= maxEvt; i++) {
    if (!eventNums.includes(i)) missingUpToMax.push(i);
  }

  const slug = entry.meetSlug;
  summaryRows.push({ slug, ind: indRows.length, rel: relRows.length, maxEvt, zeros: missingUpToMax });

  console.log(`${slug}: ind=${indRows.length} rel=${relRows.length} maxEvt=${maxEvt}` +
    (missingUpToMax.length ? ` ZERO-ROW=[${missingUpToMax.join(',')}]` : ' gaps=none'));
}

// Relay event numbers summary
console.log('\n--- Relay event numbers by meet ---');
for (const entry of newEntries) {
  const pdfPath = entry.sourcePdfPath;
  const relRows = rel.filter(r => r.sourcePdf === pdfPath);
  if (relRows.length > 0) {
    const evts = [...new Set(relRows.map(r => r.sourceEventNumber))].sort((a, b) => a - b);
    console.log(`${entry.meetSlug}: relay events=[${evts.join(',')}]`);
  }
}

// Grand totals
const totalInd = summaryRows.reduce((s, r) => s + r.ind, 0);
const totalRel = summaryRows.reduce((s, r) => s + r.rel, 0);
const meetsWithZeros = summaryRows.filter(r => r.zeros.length > 0);
console.log(`\nTotals: ${totalInd} individual rows, ${totalRel} relay rows across ${summaryRows.length} meets`);
console.log(`Meets with zero-row events: ${meetsWithZeros.length}`);
if (meetsWithZeros.length) {
  meetsWithZeros.forEach(r => console.log(`  ${r.slug}: [${r.zeros.join(',')}]`));
}
