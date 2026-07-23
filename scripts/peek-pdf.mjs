import { readFileSync } from 'fs';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');

const req = createRequire(import.meta.url);
const { PDFParse } = req('pdf-parse');

const slug = process.argv[2];
const maxLines = parseInt(process.argv[3] || '100', 10);
if (!slug) { console.error('Usage: node scripts/peek-pdf.mjs <meetSlug> [maxLines]'); process.exit(1); }

const manifest = JSON.parse(readFileSync(resolve(ROOT, 'docs/data-reload/reload-manifest.json'), 'utf8'));
const entry = Object.values(manifest).flat().find(e => e.meetSlug === slug);
if (!entry) { console.error('No entry for slug:', slug); process.exit(1); }

const pdfPath = resolve(ROOT, entry.sourcePdfPath);
const buf = readFileSync(pdfPath);
const parser = new PDFParse({ data: buf });
const result = await parser.getText();
await parser.destroy();

const lines = result.text.split('\n');
console.log(`Total lines: ${lines.length}`);
lines.slice(0, maxLines).forEach((l, i) => console.log(`${String(i+1).padStart(3)}: ${JSON.stringify(l)}`));
