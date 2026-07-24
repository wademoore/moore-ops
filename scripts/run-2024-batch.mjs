/**
 * Batch runner for 2024 season parse.
 * Run: node scripts/run-2024-batch.mjs
 * Same logic as run-2023-batch.mjs; 2500ms delay for Windows file-lock avoidance.
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');
const MANIFEST_PATH = resolve(ROOT, 'docs/data-reload/reload-manifest.json');

function getUnparsed2024Slugs() {
  const m = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
  return (m['2024'] || []).filter(e => !e.parsedIntoV2).map(e => e.meetSlug);
}

function parseMeetOutput(output) {
  const warnSection = output.match(/PARSE WARNINGS \((\d+)\):([\s\S]*?)(?=====|ROWS WRITTEN)/);
  const totalWarn = warnSection ? parseInt(warnSection[1]) : 0;
  const warnBody = warnSection ? warnSection[2] : '';
  const warnLines = warnBody.split('\n').map(l => l.trim()).filter(l => l.startsWith('⚠'));

  const scrWarn = warnLines.filter(l => l.includes('SCR (scratch') || l.includes('scratch, skipped'));
  const yearWarn = warnLines.filter(l => /digit-start.*\d{4}/.test(l) || l.includes('standalone year'));
  const genuine = warnLines.filter(l => !scrWarn.includes(l) && !yearWarn.includes(l));

  const rowInd = (output.match(/Individual:\s*(\d+)/) || [])[1] || '?';
  const rowRel = (output.match(/Relay:\s*(\d+)/) || [])[1] || '?';
  const rowTot = (output.match(/Total:\s*(\d+)/) || [])[1] || '?';

  const nullByte = (output.match(/Null-byte colon corrections:\s*(\d+)/) || [])[1] || '0';
  const exhInd = (output.match(/EXH individual rows captured:\s*(\d+)/) || [])[1] || '0';
  const nsf = (output.match(/Non-scoring-finisher rows captured:\s*(\d+)/) || [])[1] || '0';
  const flags = (output.match(/PLAUSIBILITY FLAGS:\s*(\d+) flagged/) || [])[1] || '0';

  const eventNums = [...output.matchAll(/#(\d+) [\w ]+ \(?(relay)?\)?:/g)].map(m => parseInt(m[1]));
  const maxEvent = eventNums.length ? Math.max(...eventNums) : 0;
  const zeroRows = [];
  for (let i = 1; i <= maxEvent; i++) {
    if (!eventNums.includes(i)) zeroRows.push(i);
  }

  return {
    totalWarn, scrWarn: scrWarn.length, yearWarn: yearWarn.length,
    genuine: genuine.length, genuineLines: genuine,
    rowInd: parseInt(rowInd) || 0, rowRel: parseInt(rowRel) || 0, rowTot: parseInt(rowTot) || 0,
    nullByte: parseInt(nullByte), exhInd: parseInt(exhInd), nsf: parseInt(nsf),
    flags: parseInt(flags), maxEvent, zeroRows,
  };
}

const slugs = getUnparsed2024Slugs();
console.log(`Running ${slugs.length} unparsed 2024 meets...\n`);

const results = [];
let stopped = false;
let stopSlug = null;

for (const slug of slugs) {
  process.stdout.write(`  ${slug} ... `);
  let output = '';
  let success = true;
  try {
    output = execSync(`node scripts/pdf-reload-parser.mjs ${slug}`, {
      cwd: ROOT, encoding: 'utf8', timeout: 60000,
    });
  } catch (e) {
    output = (e.stdout || '') + (e.stderr || '');
    success = false;
  }

  const m = parseMeetOutput(output);
  if (success) {
    process.stdout.write(`${m.rowTot} rows, adj=${m.genuine}\n`);
  } else {
    process.stdout.write(`ERROR\n`);
  }

  results.push({ slug, success, m, rawOutput: output });

  await new Promise(r => setTimeout(r, 2500));

  if (!success || m.genuine > 5) {
    stopped = true;
    stopSlug = slug;
    break;
  }
}

// Summary table
console.log('\n' + '='.repeat(100));
console.log('BATCH 6 SUMMARY — 2024 Full Season');
console.log('='.repeat(100));
console.log(`${'MEET'.padEnd(36)} ${'IND'.padStart(4)} ${'REL'.padStart(4)} ${'TOT'.padStart(4)} ${'NULL'.padStart(5)} ${'EXH'.padStart(4)} ${'NSF'.padStart(4)} ${'FLAGS'.padStart(5)} ${'W'.padStart(3)} ${'ADJ'.padStart(3)} NOTES`);
console.log('-'.repeat(100));

for (const { slug, success, m } of results) {
  const s = slug.replace(/^\d{4}-/, '');
  const zeros = m.zeroRows.length ? `zeros=[${m.zeroRows.join(',')}]` : '';
  console.log(
    `${s.padEnd(36)} ${String(m.rowInd).padStart(4)} ${String(m.rowRel).padStart(4)} ${String(m.rowTot).padStart(4)}` +
    ` ${String(m.nullByte).padStart(5)} ${String(m.exhInd).padStart(4)} ${String(m.nsf).padStart(4)}` +
    ` ${String(m.flags).padStart(5)} ${String(m.totalWarn).padStart(3)} ${String(m.genuine).padStart(3)}` +
    (m.genuine > 0 ? ' *** GENUINE WARNING ***' : '') +
    (zeros ? ' ' + zeros : '') +
    (!success ? ' ERROR' : '')
  );
  if (m.genuine > 0) {
    m.genuineLines.forEach(l => console.log(`   >>> ${l}`));
  }
}

console.log('-'.repeat(100));
console.log(`Completed: ${results.length}/${slugs.length} meets`);
if (stopped) {
  console.log(`\n*** STOPPED at ${stopSlug} (threshold or error) ***`);
  const failing = results.find(r => r.slug === stopSlug);
  if (failing) {
    console.log('\nFailing meet raw output (last 3000 chars):');
    console.log(failing.rawOutput.slice(-3000));
  }
}
