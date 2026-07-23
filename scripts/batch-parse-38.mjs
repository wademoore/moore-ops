/**
 * Batch runner for 38 unparsed 2026 meets (Div 1, Div 3, friendlies).
 * Runs pdf-reload-parser.mjs one meet at a time, captures stdout,
 * and emits a structured summary JSON to stdout when done.
 *
 * Usage: node scripts/batch-parse-38.mjs [--dry-run]
 */

import { spawnSync } from 'child_process';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const MANIFEST_PATH = resolve(ROOT, 'docs/data-reload/reload-manifest.json');

const dryRun = process.argv.includes('--dry-run');

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
const unparsed = Object.values(manifest).flat().filter(m => !m.parsedIntoV2 && m.pdfAvailable);

console.error(`Found ${unparsed.length} unparsed meets. Starting batch...`);

const results = [];

for (const entry of unparsed) {
  const slug = entry.meetSlug;
  process.stderr.write(`\nParsing ${slug}...`);

  const args = ['scripts/pdf-reload-parser.mjs', slug];
  if (dryRun) args.push('--dry-run');

  const ret = spawnSync('node', args, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
    timeout: 120_000,
  });

  const stdout = (ret.stdout || '').trim();
  const stderr = (ret.stderr || '').trim();
  const exitCode = ret.status;

  // Extract key numbers from stdout
  const indMatch   = stdout.match(/Individual:\s*(\d+)/);
  const relMatch   = stdout.match(/Relay:\s*(\d+)/);
  const flagMatch  = stdout.match(/PLAUSIBILITY FLAGS:\s*(\d+)/);
  const warnLines  = [];
  const flagLines  = [];
  let inFlags = false;

  for (const line of stdout.split('\n')) {
    if (/PLAUSIBILITY FLAGS:/.test(line)) { inFlags = true; continue; }
    if (/PROVENANCE CHECK:/.test(line)) { inFlags = false; }
    if (/PARSE WARNING/.test(line)) warnLines.push(line.trim());
    if (inFlags && /^\s+(INDIVIDUAL|RELAY)/.test(line)) flagLines.push(line.trim());
    if (inFlags && /^\s+(swimmer|team|event|course|time|dq|sourcePdf)/.test(line)) flagLines.push(line.trim());
  }

  results.push({
    slug,
    division: entry.division,
    teams: entry.teams,
    exitCode,
    individual: indMatch  ? parseInt(indMatch[1])  : null,
    relay:      relMatch  ? parseInt(relMatch[1])  : null,
    flags:      flagMatch ? parseInt(flagMatch[1]) : null,
    warnings:   warnLines,
    flagDetails: flagLines,
    stderr: stderr.slice(0, 500),
    rawOutput: stdout,
  });

  process.stderr.write(` ind=${results[results.length-1].individual} relay=${results[results.length-1].relay} flags=${results[results.length-1].flags} exit=${exitCode}`);
}

process.stderr.write('\n\nBatch complete.\n');
console.log(JSON.stringify(results, null, 2));
