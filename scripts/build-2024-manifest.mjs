/**
 * Build 2024 manifest entries: 8 openers + 45 regular-season = 53 meets.
 * No "vs." files found in 2024 — all use "at" convention.
 * Two "(1)" duplicate-named files are the only copies for those meets and are used as-is.
 * WGPRA = Windsor Great Park Waves (per waves-season.json 2024).
 * Run idempotently: skips slugs already present, sorts 2024 array chronologically.
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');
const MANIFEST_PATH = resolve(ROOT, 'docs/data-reload/reload-manifest.json');

const base = 'data-source-pdfs/2024';

const entries = [
  // ── OPENERS (2024-06-17) — cross-division friendlies, division: null ──────
  { date: '2024-06-17', meetSlug: '2024-06-17-ftc-at-wc',    teams: ['WC','FTC'],    division: null, pdf: '2024_First_Colony_at_WCP_Manta_Rays_06_17_2024___Meet_Maestro™.pdf' },
  { date: '2024-06-17', meetSlug: '2024-06-17-fdc-at-eh',    teams: ['EH','FDC'],    division: null, pdf: "2024_Ford's_Colony_at_Edgehill_Eels_06_17_2024___Meet_Maestro™.pdf" },
  { date: '2024-06-17', meetSlug: '2024-06-17-km-at-ps',     teams: ['PS','KM'],     division: null, pdf: '2024_Kingsmill_Sharks_at_Seastars_06_17_2024___Meet_Maestro™.pdf' },
  { date: '2024-06-17', meetSlug: '2024-06-17-kp-at-ip',     teams: ['IP','KP'],     division: null, pdf: '2024_Kingspoint_at_IP_Stingrays_06_17_2024___Meet_Maestro™.pdf' },
  { date: '2024-06-17', meetSlug: '2024-06-17-ql-at-wgpra',  teams: ['WGPRA','QL'],  division: null, pdf: '2024_Queens_Lake_at_WGP_WAVES_06_17_2024___Meet_Maestro™.pdf' },
  { date: '2024-06-17', meetSlug: '2024-06-17-sh-at-wf',     teams: ['WF','SH'],     division: null, pdf: '2024_Splash_at_Windsor_Forest_06_17_2024___Meet_Maestro™ (1).pdf' },
  { date: '2024-06-17', meetSlug: '2024-06-17-glt-at-gs',    teams: ['GS','GLT'],    division: null, pdf: '2024_Typhoons_at_Gators_06_17_2024___Meet_Maestro™.pdf' },
  { date: '2024-06-17', meetSlug: '2024-06-17-vg-at-kw',     teams: ['KW','VG'],     division: null, pdf: '2024_Village_Green_at_Kingswood_Klams_06_17_2024___Meet_Maestro™.pdf' },

  // ── WEEK 1 (2024-06-24) ───────────────────────────────────────────────────
  // Div 1: KW vs WF, FDC vs GS, FTC vs KM
  { date: '2024-06-24', meetSlug: '2024-06-24-kw-at-wf',     teams: ['WF','KW'],     division: 1,    pdf: '2024_Kingswood_Klams_at_Windsor_Forest_06_24_2024___Meet_Maestro™.pdf' },
  { date: '2024-06-24', meetSlug: '2024-06-24-gs-at-fdc',    teams: ['FDC','GS'],    division: 1,    pdf: "2024_Gators_at_Ford's_Colony_06_24_2024___Meet_Maestro™.pdf" },
  { date: '2024-06-24', meetSlug: '2024-06-24-ftc-at-km',    teams: ['KM','FTC'],    division: 1,    pdf: '2024_First_Colony_at_Kingsmill_Sharks_06_24_2024___Meet_Maestro™.pdf' },
  // Div 2: QL vs PS, WT vs WC, EH vs KP
  { date: '2024-06-24', meetSlug: '2024-06-24-ps-at-ql',     teams: ['QL','PS'],     division: 2,    pdf: '2024_Seastars_at_Queens_Lake_06_24_2024___Meet_Maestro™.pdf' },
  { date: '2024-06-24', meetSlug: '2024-06-24-wc-at-wt',     teams: ['WT','WC'],     division: 2,    pdf: '2024_WCP_Manta_Rays_at_Wellington_Waves_06_24_2024___Meet_Maestro™.pdf' },
  { date: '2024-06-24', meetSlug: '2024-06-24-eh-at-kp',     teams: ['KP','EH'],     division: 2,    pdf: '2024_Edgehill_Eels_at_Kingspoint_06_24_2024___Meet_Maestro™.pdf' },
  // Div 3: GLT vs WGPRA, VG vs VW, IP vs SH
  { date: '2024-06-24', meetSlug: '2024-06-24-wgpra-at-glt', teams: ['GLT','WGPRA'], division: 3,    pdf: '2024_WGP_WAVES_at_Typhoons_06_24_2024___Meet_Maestro™.pdf' },
  { date: '2024-06-24', meetSlug: '2024-06-24-vw-at-vg',     teams: ['VG','VW'],     division: 3,    pdf: '2024_VW_Kraken_at_Village_Green_06_24_2024___Meet_Maestro™.pdf' },
  { date: '2024-06-24', meetSlug: '2024-06-24-ip-at-sh',     teams: ['SH','IP'],     division: 3,    pdf: '2024_IP_Stingrays_at_Splash_06_24_2024___Meet_Maestro™.pdf' },

  // ── WEEK 2 (2024-07-01) ───────────────────────────────────────────────────
  // Div 1: KW vs FDC, FTC vs GS, KM vs WF
  { date: '2024-07-01', meetSlug: '2024-07-01-fdc-at-kw',    teams: ['KW','FDC'],    division: 1,    pdf: "2024_Ford's_Colony_at_Kingswood_Klams_07_01_2024___Meet_Maestro™.pdf" },
  { date: '2024-07-01', meetSlug: '2024-07-01-gs-at-ftc',    teams: ['FTC','GS'],    division: 1,    pdf: '2024_Gators_at_First_Colony_07_01_2024___Meet_Maestro™.pdf' },
  { date: '2024-07-01', meetSlug: '2024-07-01-wf-at-km',     teams: ['KM','WF'],     division: 1,    pdf: '2024_Windsor_Forest_at_Kingsmill_Sharks_07_01_2024___Meet_Maestro™.pdf' },
  // Div 2: QL vs KP, WT vs EH, PS vs WC
  { date: '2024-07-01', meetSlug: '2024-07-01-ql-at-kp',     teams: ['KP','QL'],     division: 2,    pdf: '2024_Queens_Lake_at_Kingspoint_07_01_2024___Meet_Maestro™.pdf' },
  { date: '2024-07-01', meetSlug: '2024-07-01-wt-at-eh',     teams: ['EH','WT'],     division: 2,    pdf: '2024_Wellington_Waves_at_Edgehill_Eels_07_01_2024___Meet_Maestro™.pdf' },
  { date: '2024-07-01', meetSlug: '2024-07-01-ps-at-wc',     teams: ['WC','PS'],     division: 2,    pdf: '2024_Powhatan_Secondary_at_WCP_Manta_Rays_07_01_2024___Meet_Maestro™.pdf' },
  // Div 3: GLT vs IP, VG vs SH, WGPRA vs VW
  { date: '2024-07-01', meetSlug: '2024-07-01-ip-at-glt',    teams: ['GLT','IP'],    division: 3,    pdf: '2024_IP_Stingrays_at_Typhoons_07_01_2024___Meet_Maestro™.pdf' },
  { date: '2024-07-01', meetSlug: '2024-07-01-sh-at-vg',     teams: ['VG','SH'],     division: 3,    pdf: '2024_Splash_at_Village_Green_07_01_2024___Meet_Maestro™.pdf' },
  { date: '2024-07-01', meetSlug: '2024-07-01-wgpra-at-vw',  teams: ['VW','WGPRA'],  division: 3,    pdf: '2024_WGP_WAVES_at_VW_Kraken_07_01_2024___Meet_Maestro™.pdf' },

  // ── WEEK 3 (2024-07-08) ───────────────────────────────────────────────────
  // Div 1: FTC vs FDC, GS vs WF, KW vs KM
  { date: '2024-07-08', meetSlug: '2024-07-08-fdc-at-ftc',   teams: ['FTC','FDC'],   division: 1,    pdf: "2024_Ford's_Colony_at_First_Colony_07_08_2024___Meet_Maestro™.pdf" },
  { date: '2024-07-08', meetSlug: '2024-07-08-wf-at-gs',     teams: ['GS','WF'],     division: 1,    pdf: '2024_Windsor_Forest_at_Gators_07_08_2024___Meet_Maestro™.pdf' },
  { date: '2024-07-08', meetSlug: '2024-07-08-km-at-kw',     teams: ['KW','KM'],     division: 1,    pdf: '2024_Kingsmill_Sharks_at_Kingswood_Klams_07_08_2024___Meet_Maestro™.pdf' },
  // Div 2: QL vs WC, WT vs KP, EH vs PS
  { date: '2024-07-08', meetSlug: '2024-07-08-wc-at-ql',     teams: ['QL','WC'],     division: 2,    pdf: '2024_WCP_Manta_Rays_at_Queens_Lake_07_08_2024___Meet_Maestro™.pdf' },
  { date: '2024-07-08', meetSlug: '2024-07-08-kp-at-wt',     teams: ['WT','KP'],     division: 2,    pdf: '2024_Kingspoint_at_Wellington_Waves_07_08_2024___Meet_Maestro™.pdf' },
  { date: '2024-07-08', meetSlug: '2024-07-08-eh-at-ps',     teams: ['PS','EH'],     division: 2,    pdf: '2024_Edgehill_Eels_at_Seastars_07_08_2024___Meet_Maestro™.pdf' },
  // Div 3: GLT vs SH, VG vs WGPRA, IP vs VW
  { date: '2024-07-08', meetSlug: '2024-07-08-glt-at-sh',    teams: ['SH','GLT'],    division: 3,    pdf: '2024_Typhoons_at_Splash_07_08_2024___Meet_Maestro™.pdf' },
  { date: '2024-07-08', meetSlug: '2024-07-08-vg-at-wgpra',  teams: ['WGPRA','VG'],  division: 3,    pdf: '2024_Village_Green_at_WGP_WAVES_07_08_2024___Meet_Maestro™.pdf' },
  { date: '2024-07-08', meetSlug: '2024-07-08-vw-at-ip',     teams: ['IP','VW'],     division: 3,    pdf: '2024_VW_Kraken_at_IP_Stingrays_07_08_2024___Meet_Maestro™.pdf' },

  // ── WEEK 4 (2024-07-15) ───────────────────────────────────────────────────
  // Div 1: KW vs GS, FDC vs KM, FTC vs WF
  { date: '2024-07-15', meetSlug: '2024-07-15-kw-at-gs',     teams: ['GS','KW'],     division: 1,    pdf: '2024_Kingswood_Klams_at_Gators_07_15_2024___Meet_Maestro™.pdf' },
  { date: '2024-07-15', meetSlug: '2024-07-15-km-at-fdc',    teams: ['FDC','KM'],    division: 1,    pdf: "2024_Kingsmill_Sharks_at_Ford's_Colony_07_15_2024___Meet_Maestro™.pdf" },
  { date: '2024-07-15', meetSlug: '2024-07-15-ftc-at-wf',    teams: ['WF','FTC'],    division: 1,    pdf: '2024_First_Colony_at_Windsor_Forest_07_15_2024___Meet_Maestro™ (1).pdf' },
  // Div 2: QL vs EH, WT vs PS, WC vs KP
  { date: '2024-07-15', meetSlug: '2024-07-15-ql-at-eh',     teams: ['EH','QL'],     division: 2,    pdf: '2024_Queens_Lake_at_Edgehill_Eels_07_15_2024___Meet_Maestro™.pdf' },
  { date: '2024-07-15', meetSlug: '2024-07-15-ps-at-wt',     teams: ['WT','PS'],     division: 2,    pdf: '2024_Seastars_at_Wellington_Waves_07_15_2024___Meet_Maestro™.pdf' },
  { date: '2024-07-15', meetSlug: '2024-07-15-wc-at-kp',     teams: ['KP','WC'],     division: 2,    pdf: '2024_WCP_Manta_Rays_at_Kingspoint_07_15_2024___Meet_Maestro™.pdf' },
  // Div 3: VG vs IP, GLT vs VW, SH vs WGPRA
  { date: '2024-07-15', meetSlug: '2024-07-15-ip-at-vg',     teams: ['VG','IP'],     division: 3,    pdf: '2024_IP_Stingrays_at_Village_Green_07_15_2024___Meet_Maestro™.pdf' },
  { date: '2024-07-15', meetSlug: '2024-07-15-glt-at-vw',    teams: ['VW','GLT'],    division: 3,    pdf: '2024_Typhoons_at_VW_Kraken_07_15_2024___Meet_Maestro™.pdf' },
  { date: '2024-07-15', meetSlug: '2024-07-15-sh-at-wgpra',  teams: ['WGPRA','SH'],  division: 3,    pdf: '2024_Splash_at_WGP_WAVES_07_15_2024___Meet_Maestro™.pdf' },

  // ── WEEK 5 (2024-07-22) ───────────────────────────────────────────────────
  // Div 1: FTC vs KW, KM vs GS, FDC vs WF
  { date: '2024-07-22', meetSlug: '2024-07-22-kw-at-ftc',    teams: ['FTC','KW'],    division: 1,    pdf: '2024_Kingswood_Klams_at_First_Colony_07_22_2024___Meet_Maestro™.pdf' },
  { date: '2024-07-22', meetSlug: '2024-07-22-gs-at-km',     teams: ['KM','GS'],     division: 1,    pdf: '2024_Gators_at_Kingsmill_Sharks_07_22_2024___Meet_Maestro™.pdf' },
  { date: '2024-07-22', meetSlug: '2024-07-22-wf-at-fdc',    teams: ['FDC','WF'],    division: 1,    pdf: "2024_Windsor_Forest_at_Ford's_Colony_07_22_2024___Meet_Maestro™.pdf" },
  // Div 2: WT vs QL, WC vs EH, PS vs KP
  { date: '2024-07-22', meetSlug: '2024-07-22-wt-at-ql',     teams: ['QL','WT'],     division: 2,    pdf: '2024_Wellington_Waves_at_Queens_Lake_07_22_2024___Meet_Maestro™.pdf' },
  { date: '2024-07-22', meetSlug: '2024-07-22-eh-at-wc',     teams: ['WC','EH'],     division: 2,    pdf: '2024_Edgehill_at_WCP_Manta_Rays_07_22_2024___Meet_Maestro™.pdf' },
  { date: '2024-07-22', meetSlug: '2024-07-22-kp-at-ps',     teams: ['PS','KP'],     division: 2,    pdf: '2024_Kingspoint_at_Seastars_07_22_2024___Meet_Maestro™.pdf' },
  // Div 3: VG vs GLT, WGPRA vs IP, SH vs VW
  { date: '2024-07-22', meetSlug: '2024-07-22-vg-at-glt',    teams: ['GLT','VG'],    division: 3,    pdf: '2024_Village_Green_at_Typhoons_07_22_2024___Meet_Maestro™.pdf' },
  { date: '2024-07-22', meetSlug: '2024-07-22-wgpra-at-ip',  teams: ['IP','WGPRA'],  division: 3,    pdf: '2024_WGP_WAVES_at_IP_Stingrays_07_22_2024___Meet_Maestro™.pdf' },
  { date: '2024-07-22', meetSlug: '2024-07-22-vw-at-sh',     teams: ['SH','VW'],     division: 3,    pdf: '2024_VW_Kraken_at_Splash_07_22_2024___Meet_Maestro™.pdf' },
];

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
if (!manifest['2024']) manifest['2024'] = [];

const existingSlugs = new Set(manifest['2024'].map(e => e.meetSlug));
let added = 0;

for (const e of entries) {
  if (existingSlugs.has(e.meetSlug)) continue;
  manifest['2024'].push({
    season: '2024',
    date: e.date,
    meetSlug: e.meetSlug,
    teams: e.teams,
    division: e.division,
    course: 'SCM',
    sourcePdfPath: `${base}/${e.pdf}`,
    pdfAvailable: true,
    parsedIntoV2: false,
    rowCountExpected: null,
    rowCountParsed: null,
    plausibilityFlags: null,
    notes: '',
  });
  added++;
}

// Sort 2024 array chronologically
manifest['2024'].sort((a, b) => a.date.localeCompare(b.date) || a.meetSlug.localeCompare(b.meetSlug));

writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');
console.log(`Added ${added} new 2024 entries. Total 2024 entries: ${manifest['2024'].length}`);
console.log('Breakdown: 8 openers (06-17) + 45 regular season (06-24 through 07-22)');
