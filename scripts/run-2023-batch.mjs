/**
 * Compact batch runner for 2023 season parse.
 * Run: node scripts/run-2023-batch.mjs
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');
const MANIFEST_PATH = resolve(ROOT, 'docs/data-reload/reload-manifest.json');

function getUnparsed2023Slugs() {
  const m = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
  return m['2023'].filter(e => !e.parsedIntoV2).map(e => e.meetSlug);
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
  const scrSkips = (output.match(/SCR \(scratch\) rows skipped:\s*(\d+)/) || [])[1] || '0';
  const exhInd = (output.match(/EXH individual rows captured:\s*(\d+)/) || [])[1] || '0';
  const exhRel = (output.match(/EXH relay rows captured:\s*(\d+)/) || [])[1] || '0';
  const nsf = (output.match(/Non-scoring-finisher rows captured:\s*(\d+)/) || [])[1] || '0';
  const flags = (output.match(/PLAUSIBILITY FLAGS:\s*(\d+) flagged/) || [])[1] || '0';

  // Event numbers present
  const eventNums = [...output.matchAll(/#(\d+) [\w ]+ \(?(relay)?\)?:/g)].map(m => parseInt(m[1]));
  const maxEvent = eventNums.length ? Math.max(...eventNums) : 0;
  const zeroRows = [];
  for (let i = 1; i <= maxEvent; i++) {
    if (!eventNums.includes(i)) zeroRows.push(i);
  }

  const hasNTOfficial = output.includes('NT-official') || output.includes('EXH-IND') && output.includes('dq=false') && output.includes('time=null') && false; // simplified
  const hasNewPattern = output.includes('NEW PATTERN') || output.includes('unexpected');

  return {
    totalWarn, scrWarn: scrWarn.length, yearWarn: yearWarn.length,
    genuine: genuine.length, genuineLines: genuine,
    rowInd: parseInt(rowInd), rowRel: parseInt(rowRel), rowTot: parseInt(rowTot),
    nullByte: parseInt(nullByte), scrSkips: parseInt(scrSkips),
    exhInd: parseInt(exhInd), exhRel: parseInt(exhRel), nsf: parseInt(nsf),
    flags: parseInt(flags), maxEvent, zeroRows, hasNTOfficial, hasNewPattern,
  };
}

const slugs = getUnparsed2023Slugs();
console.log(`Running ${slugs.length} unparsed 2023 meets...\n`);

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
    process.stdout.write(`${m.rowTot} rows, ${m.genuine} genuine warnings\n`);
  } else {
    process.stdout.write(`ERROR\n`);
  }

  results.push({ slug, success, m, rawOutput: output });

  // Delay to release Windows file handles between sequential writes
  // File is now large (~30K rows) and AV/OS holds it longer after each write
  await new Promise(r => setTimeout(r, 2500));

  if (!success || m.genuine > 5) {
    stopped = true;
    stopSlug = slug;
    break;
  }
}

// Summary table
console.log('\n' + '='.repeat(90));
console.log('BATCH 5 SUMMARY — 2023 Full Season');
console.log('='.repeat(90));
console.log(`${'MEET'.padEnd(32)} ${'IND'.padStart(4)} ${'REL'.padStart(4)} ${'TOT'.padStart(4)} ${'NULL'.padStart(5)} ${'EXH'.padStart(4)} ${'NSF'.padStart(4)} ${'FLAGS'.padStart(5)} ${'W'.padStart(3)} ${'ADJ'.padStart(3)} ${'ZEROEVT'}`);
console.log('-'.repeat(90));

for (const { slug, success, m } of results) {
  const s = slug.replace(/^\d{4}-/, '');  // strip year prefix for brevity
  const zeros = m.zeroRows.length ? `[${m.zeroRows.join(',')}]` : '';
  console.log(
    `${s.padEnd(32)} ${String(m.rowInd).padStart(4)} ${String(m.rowRel).padStart(4)} ${String(m.rowTot).padStart(4)}` +
    ` ${String(m.nullByte).padStart(5)} ${String(m.exhInd).padStart(4)} ${String(m.nsf).padStart(4)}` +
    ` ${String(m.flags).padStart(5)} ${String(m.totalWarn).padStart(3)} ${String(m.genuine).padStart(3)}` +
    (m.genuine > 0 ? ' *** GENUINE WARNING ***' : '') +
    (m.zeroRows.length ? ` zeros=${zeros}` : '') +
    (!success ? ' ERROR' : '')
  );
  if (m.genuine > 0) {
    m.genuineLines.forEach(l => console.log(`   >>> ${l}`));
  }
}

console.log('-'.repeat(90));
console.log(`Completed: ${results.length}/${slugs.length} meets`);
if (stopped) {
  console.log(`\n*** STOPPED at ${stopSlug} (threshold or error) ***`);
  // Print raw output for failing meet
  const failing = results.find(r => r.slug === stopSlug);
  if (failing) {
    console.log('\nFailing meet raw output (last 3000 chars):');
    console.log(failing.rawOutput.slice(-3000));
  }
}
