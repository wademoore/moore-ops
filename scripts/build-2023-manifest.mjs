/**
 * One-time script: insert 47 new 2023 meet entries into reload-manifest.json.
 * Run: node scripts/build-2023-manifest.mjs
 * Idempotent: skips any slug already present in the 2023 array.
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');
const MANIFEST_PATH = resolve(ROOT, 'docs/data-reload/reload-manifest.json');

const newEntries = [
  // --- OPENERS ---
  {
    season: '2023', date: '2023-06-12', meetSlug: '2023-06-12-ip-at-fdc',
    teams: ['FDC', 'IP'], division: null, course: 'SCM',
    sourcePdfPath: "data-source-pdfs/2023/2023_IP_Stingrays_at_Ford's_Colony_06_12_2023___Meet_Maestro™.pdf",
    pdfAvailable: true, parsedIntoV2: false,
    rowCountExpected: null, rowCountParsed: null, plausibilityFlags: null,
    notes: "Opener (Monday); waves-season.json shows 06/16 — PDF header confirms 06/12. Cross-div friendly: IP (Div 3) at FDC (Div 1).",
  },
  {
    season: '2023', date: '2023-06-12', meetSlug: '2023-06-12-wt-at-vg',
    teams: ['VG', 'WT'], division: null, course: 'SCM',
    sourcePdfPath: "data-source-pdfs/2023/2023_Wellington_Waves_at_Village_Green_06_12_2023___Meet_Maestro™.pdf",
    pdfAvailable: true, parsedIntoV2: false,
    rowCountExpected: null, rowCountParsed: null, plausibilityFlags: null,
    notes: "Opener (Monday); waves-season.json shows 06/16 — PDF header confirms 06/12. Cross-div friendly: WT (Div 2) at VG (Div 3).",
  },
  {
    season: '2023', date: '2023-06-15', meetSlug: '2023-06-15-wgp-at-eh',
    teams: ['EH', 'WGP'], division: null, course: 'SCM',
    sourcePdfPath: "data-source-pdfs/2023/2023_WGP_WAVES_at_Edgehill_Eels_06_15_2023___Meet_Maestro™.pdf",
    pdfAvailable: true, parsedIntoV2: false,
    rowCountExpected: null, rowCountParsed: null, plausibilityFlags: null,
    notes: "Opener (Thursday); waves-season.json shows 06/16 — PDF header confirms 06/15. Cross-div friendly: WGP (Div 3) at EH (Div 2).",
  },
  // --- WEEK 1 (2023-06-19) ---
  {
    season: '2023', date: '2023-06-19', meetSlug: '2023-06-19-ftc-at-gs',
    teams: ['GS', 'FTC'], division: 1, course: 'SCM',
    sourcePdfPath: 'data-source-pdfs/2023/2023_First_Colony_at_Gators_06_19_2023___Meet_Maestro™.pdf',
    pdfAvailable: true, parsedIntoV2: false,
    rowCountExpected: null, rowCountParsed: null, plausibilityFlags: null,
    notes: '',
  },
  {
    season: '2023', date: '2023-06-19', meetSlug: '2023-06-19-kw-at-fdc',
    teams: ['FDC', 'KW'], division: 1, course: 'SCM',
    sourcePdfPath: "data-source-pdfs/2023/2023_Kingswood_Klams_at_Ford's_Colony_06_19_2023___Meet_Maestro™.pdf",
    pdfAvailable: true, parsedIntoV2: false,
    rowCountExpected: null, rowCountParsed: null, plausibilityFlags: null,
    notes: '',
  },
  {
    season: '2023', date: '2023-06-19', meetSlug: '2023-06-19-ql-at-km',
    teams: ['KM', 'QL'], division: 1, course: 'SCM',
    sourcePdfPath: 'data-source-pdfs/2023/2023_Queens_Lake_at_Kingsmill_Sharks_06_19_2023___Meet_Maestro™.pdf',
    pdfAvailable: true, parsedIntoV2: false,
    rowCountExpected: null, rowCountParsed: null, plausibilityFlags: null,
    notes: '',
  },
  {
    season: '2023', date: '2023-06-19', meetSlug: '2023-06-19-eh-at-wt',
    teams: ['WT', 'EH'], division: 2, course: 'SCM',
    sourcePdfPath: 'data-source-pdfs/2023/2023_Edgehill_at_Wellington_Waves_06_19_2023___Meet_Maestro™.pdf',
    pdfAvailable: true, parsedIntoV2: false,
    rowCountExpected: null, rowCountParsed: null, plausibilityFlags: null,
    notes: '',
  },
  {
    season: '2023', date: '2023-06-19', meetSlug: '2023-06-19-kp-at-wc',
    teams: ['WC', 'KP'], division: 2, course: 'SCM',
    sourcePdfPath: 'data-source-pdfs/2023/2023_Kingspoint_at_WCP_Manta_Rays_06_19_2023___Meet_Maestro™.pdf',
    pdfAvailable: true, parsedIntoV2: false,
    rowCountExpected: null, rowCountParsed: null, plausibilityFlags: null,
    notes: 'WCP = WC.',
  },
  {
    season: '2023', date: '2023-06-19', meetSlug: '2023-06-19-wf-at-glt',
    teams: ['GLT', 'WF'], division: 2, course: 'SCM',
    sourcePdfPath: 'data-source-pdfs/2023/2023_Windsor_Forest_at_Typhoons_06_19_2023___Meet_Maestro™.pdf',
    pdfAvailable: true, parsedIntoV2: false,
    rowCountExpected: null, rowCountParsed: null, plausibilityFlags: null,
    notes: 'Typhoons = GLT.',
  },
  {
    season: '2023', date: '2023-06-19', meetSlug: '2023-06-19-ip-at-wgp',
    teams: ['WGP', 'IP'], division: 3, course: 'SCM',
    sourcePdfPath: 'data-source-pdfs/2023/2023_IP_Stingrays_at_WGP_WAVES_06_19_2023___Meet_Maestro™.pdf',
    pdfAvailable: true, parsedIntoV2: false,
    rowCountExpected: null, rowCountParsed: null, plausibilityFlags: null,
    notes: '',
  },
  {
    season: '2023', date: '2023-06-19', meetSlug: '2023-06-19-ps-at-vg',
    teams: ['VG', 'PS'], division: 3, course: 'SCM',
    sourcePdfPath: 'data-source-pdfs/2023/2023_Seastars_at_Village_Green_06_19_2023___Meet_Maestro™.pdf',
    pdfAvailable: true, parsedIntoV2: false,
    rowCountExpected: null, rowCountParsed: null, plausibilityFlags: null,
    notes: 'Seastars = PS.',
  },
  {
    season: '2023', date: '2023-06-19', meetSlug: '2023-06-19-sh-at-vw',
    teams: ['VW', 'SH'], division: 3, course: 'SCM',
    sourcePdfPath: 'data-source-pdfs/2023/2023_Splash_at_VW_Kraken_06_19_2023___Meet_Maestro™.pdf',
    pdfAvailable: true, parsedIntoV2: false,
    rowCountExpected: null, rowCountParsed: null, plausibilityFlags: null,
    notes: 'Splash = SH.',
  },
  // --- WEEK 2 (2023-06-26) ---
  {
    season: '2023', date: '2023-06-26', meetSlug: '2023-06-26-fdc-at-gs',
    teams: ['GS', 'FDC'], division: 1, course: 'SCM',
    sourcePdfPath: "data-source-pdfs/2023/2023_Ford's_Colony_at_Gators_06_26_2023___Meet_Maestro™.pdf",
    pdfAvailable: true, parsedIntoV2: false,
    rowCountExpected: null, rowCountParsed: null, plausibilityFlags: null,
    notes: '',
  },
  {
    season: '2023', date: '2023-06-26', meetSlug: '2023-06-26-km-at-ftc',
    teams: ['FTC', 'KM'], division: 1, course: 'SCM',
    sourcePdfPath: 'data-source-pdfs/2023/2023_Kingsmill_Sharks_at_First_Colony_06_26_2023___Meet_Maestro™.pdf',
    pdfAvailable: true, parsedIntoV2: false,
    rowCountExpected: null, rowCountParsed: null, plausibilityFlags: null,
    notes: '',
  },
  {
    season: '2023', date: '2023-06-26', meetSlug: '2023-06-26-kw-at-ql',
    teams: ['QL', 'KW'], division: 1, course: 'SCM',
    sourcePdfPath: 'data-source-pdfs/2023/2023_Kingswood_Klams_at_Queens_Lake_06_26_2023___Meet_Maestro™.pdf',
    pdfAvailable: true, parsedIntoV2: false,
    rowCountExpected: null, rowCountParsed: null, plausibilityFlags: null,
    notes: '',
  },
  {
    season: '2023', date: '2023-06-26', meetSlug: '2023-06-26-eh-at-wf',
    teams: ['WF', 'EH'], division: 2, course: 'SCM',
    sourcePdfPath: 'data-source-pdfs/2023/2023_Edgehill_Eels_at_Windsor_Forest_06_26_2023___Meet_Maestro™.pdf',
    pdfAvailable: true, parsedIntoV2: false,
    rowCountExpected: null, rowCountParsed: null, plausibilityFlags: null,
    notes: '',
  },
  {
    season: '2023', date: '2023-06-26', meetSlug: '2023-06-26-glt-at-kp',
    teams: ['KP', 'GLT'], division: 2, course: 'SCM',
    sourcePdfPath: 'data-source-pdfs/2023/2023_Typhoons_at_Kingspoint_06_26_2023___Meet_Maestro™.pdf',
    pdfAvailable: true, parsedIntoV2: false,
    rowCountExpected: null, rowCountParsed: null, plausibilityFlags: null,
    notes: 'Typhoons = GLT.',
  },
  {
    season: '2023', date: '2023-06-26', meetSlug: '2023-06-26-wt-at-wc',
    teams: ['WC', 'WT'], division: 2, course: 'SCM',
    sourcePdfPath: 'data-source-pdfs/2023/2023_Wellington_Waves_at_WCP_Manta_Rays_06_26_2023___Meet_Maestro™.pdf',
    pdfAvailable: true, parsedIntoV2: false,
    rowCountExpected: null, rowCountParsed: null, plausibilityFlags: null,
    notes: 'WCP = WC.',
  },
  {
    season: '2023', date: '2023-06-26', meetSlug: '2023-06-26-vg-at-ip',
    teams: ['IP', 'VG'], division: 3, course: 'SCM',
    sourcePdfPath: 'data-source-pdfs/2023/2023_Village_Green_at_IP_Stingrays_06_26_2023___Meet_Maestro™.pdf',
    pdfAvailable: true, parsedIntoV2: false,
    rowCountExpected: null, rowCountParsed: null, plausibilityFlags: null,
    notes: '',
  },
  {
    season: '2023', date: '2023-06-26', meetSlug: '2023-06-26-vw-at-ps',
    teams: ['PS', 'VW'], division: 3, course: 'SCM',
    sourcePdfPath: 'data-source-pdfs/2023/2023_VW_Kraken_at_Seastars_06_26_2023___Meet_Maestro™.pdf',
    pdfAvailable: true, parsedIntoV2: false,
    rowCountExpected: null, rowCountParsed: null, plausibilityFlags: null,
    notes: 'Seastars = PS.',
  },
  {
    season: '2023', date: '2023-06-26', meetSlug: '2023-06-26-wgp-at-sh',
    teams: ['SH', 'WGP'], division: 3, course: 'SCM',
    sourcePdfPath: 'data-source-pdfs/2023/2023_Splash_vs._Windsor_Great_Park_06_26_2023___Meet_Maestro™.pdf',
    pdfAvailable: true, parsedIntoV2: false,
    rowCountExpected: null, rowCountParsed: null, plausibilityFlags: null,
    notes: "Direction: SH home per 'vs.' naming convention (left team = host; same pattern as 2022 KP_vs._WCP and KP_vs._WT). Splash = SH; Windsor Great Park = WGP.",
  },
  // --- WEEK 3 (2023-07-03 main + 07-05 and 07-06 makeups) ---
  {
    season: '2023', date: '2023-07-03', meetSlug: '2023-07-03-fdc-at-km',
    teams: ['KM', 'FDC'], division: 1, course: 'SCM',
    sourcePdfPath: "data-source-pdfs/2023/2023_Ford's_Colony_at_Kingsmill_Sharks_07_03_2023___Meet_Maestro™.pdf",
    pdfAvailable: true, parsedIntoV2: false,
    rowCountExpected: null, rowCountParsed: null, plausibilityFlags: null,
    notes: '',
  },
  {
    season: '2023', date: '2023-07-03', meetSlug: '2023-07-03-gs-at-kw',
    teams: ['KW', 'GS'], division: 1, course: 'SCM',
    sourcePdfPath: 'data-source-pdfs/2023/2023_Gators_at_Kingswood_Klams_07_03_2023___Meet_Maestro™.pdf',
    pdfAvailable: true, parsedIntoV2: false,
    rowCountExpected: null, rowCountParsed: null, plausibilityFlags: null,
    notes: '',
  },
  {
    season: '2023', date: '2023-07-03', meetSlug: '2023-07-03-ql-at-ftc',
    teams: ['FTC', 'QL'], division: 1, course: 'SCM',
    sourcePdfPath: 'data-source-pdfs/2023/2023_Queens_Lake_at_First_Colony_07_03_2023___Meet_Maestro™.pdf',
    pdfAvailable: true, parsedIntoV2: false,
    rowCountExpected: null, rowCountParsed: null, plausibilityFlags: null,
    notes: '',
  },
  {
    season: '2023', date: '2023-07-03', meetSlug: '2023-07-03-wf-at-kp',
    teams: ['KP', 'WF'], division: 2, course: 'SCM',
    sourcePdfPath: 'data-source-pdfs/2023/2023_Windsor_Forest_at_Kingspoint_07_03_2023___Meet_Maestro™.pdf',
    pdfAvailable: true, parsedIntoV2: false,
    rowCountExpected: null, rowCountParsed: null, plausibilityFlags: null,
    notes: '',
  },
  {
    season: '2023', date: '2023-07-03', meetSlug: '2023-07-03-ps-at-wgp',
    teams: ['WGP', 'PS'], division: 3, course: 'SCM',
    sourcePdfPath: 'data-source-pdfs/2023/2023_Seastars_at_WGP_WAVES_07_03_2023___Meet_Maestro™.pdf',
    pdfAvailable: true, parsedIntoV2: false,
    rowCountExpected: null, rowCountParsed: null, plausibilityFlags: null,
    notes: 'Seastars = PS.',
  },
  {
    season: '2023', date: '2023-07-03', meetSlug: '2023-07-03-vg-at-vw',
    teams: ['VW', 'VG'], division: 3, course: 'SCM',
    sourcePdfPath: 'data-source-pdfs/2023/2023_Village_Green_at_VW_Kraken_07_03_2023___Meet_Maestro™.pdf',
    pdfAvailable: true, parsedIntoV2: false,
    rowCountExpected: null, rowCountParsed: null, plausibilityFlags: null,
    notes: '',
  },
  {
    season: '2023', date: '2023-07-05', meetSlug: '2023-07-05-sh-at-ip',
    teams: ['IP', 'SH'], division: 3, course: 'SCM',
    sourcePdfPath: 'data-source-pdfs/2023/2023_SH_Splash_at_IP_Stingrays_07_05_2023___Meet_Maestro™.pdf',
    pdfAvailable: true, parsedIntoV2: false,
    rowCountExpected: null, rowCountParsed: null, plausibilityFlags: null,
    notes: "Wednesday makeup; waves-season.json records under 2023-07-03. PDF confirms 07/05. Splash = SH.",
  },
  {
    season: '2023', date: '2023-07-06', meetSlug: '2023-07-06-glt-at-wt',
    teams: ['WT', 'GLT'], division: 2, course: 'SCM',
    sourcePdfPath: "data-source-pdfs/2023/2023_Governor's_Land_at_Wellington_Waves_07_06_2023___Meet_Maestro™.pdf",
    pdfAvailable: true, parsedIntoV2: false,
    rowCountExpected: null, rowCountParsed: null, plausibilityFlags: null,
    notes: "Thursday makeup; waves-season.json records under 2023-07-03. PDF confirms 07/06. Governor's Land = GLT.",
  },
  {
    season: '2023', date: '2023-07-06', meetSlug: '2023-07-06-wc-at-eh',
    teams: ['EH', 'WC'], division: 2, course: 'SCM',
    sourcePdfPath: 'data-source-pdfs/2023/2023_WCP_Manta_Rays_at_Edgehill_Eels_07_06_2023___Meet_Maestro™.pdf',
    pdfAvailable: true, parsedIntoV2: false,
    rowCountExpected: null, rowCountParsed: null, plausibilityFlags: null,
    notes: "Thursday makeup; waves-season.json records under 2023-07-03. PDF confirms 07/06. WCP = WC.",
  },
  // --- WEEK 4 (2023-07-10) ---
  {
    season: '2023', date: '2023-07-10', meetSlug: '2023-07-10-ftc-at-fdc',
    teams: ['FDC', 'FTC'], division: 1, course: 'SCM',
    sourcePdfPath: "data-source-pdfs/2023/2023_First_Colony_at_Ford's_Colony_07_10_2023___Meet_Maestro™.pdf",
    pdfAvailable: true, parsedIntoV2: false,
    rowCountExpected: null, rowCountParsed: null, plausibilityFlags: null,
    notes: '',
  },
  {
    season: '2023', date: '2023-07-10', meetSlug: '2023-07-10-gs-at-ql',
    teams: ['QL', 'GS'], division: 1, course: 'SCM',
    sourcePdfPath: 'data-source-pdfs/2023/2023_Gators_at_Queens_Lake_07_10_2023___Meet_Maestro™.pdf',
    pdfAvailable: true, parsedIntoV2: false,
    rowCountExpected: null, rowCountParsed: null, plausibilityFlags: null,
    notes: '',
  },
  {
    season: '2023', date: '2023-07-10', meetSlug: '2023-07-10-kw-at-km',
    teams: ['KM', 'KW'], division: 1, course: 'SCM',
    sourcePdfPath: 'data-source-pdfs/2023/2023_Kingswood_Klams_at_Kingsmill_Sharks_07_10_2023___Meet_Maestro™.pdf',
    pdfAvailable: true, parsedIntoV2: false,
    rowCountExpected: null, rowCountParsed: null, plausibilityFlags: null,
    notes: '',
  },
  {
    season: '2023', date: '2023-07-10', meetSlug: '2023-07-10-kp-at-eh',
    teams: ['EH', 'KP'], division: 2, course: 'SCM',
    sourcePdfPath: 'data-source-pdfs/2023/2023_Kingspoint_at_Edgehill_Eels_07_10_2023___Meet_Maestro™.pdf',
    pdfAvailable: true, parsedIntoV2: false,
    rowCountExpected: null, rowCountParsed: null, plausibilityFlags: null,
    notes: '',
  },
  {
    season: '2023', date: '2023-07-10', meetSlug: '2023-07-10-glt-at-wc',
    teams: ['WC', 'GLT'], division: 2, course: 'SCM',
    sourcePdfPath: 'data-source-pdfs/2023/2023_Typhoons_at_WCP_Manta_Rays_07_10_2023___Meet_Maestro™.pdf',
    pdfAvailable: true, parsedIntoV2: false,
    rowCountExpected: null, rowCountParsed: null, plausibilityFlags: null,
    notes: 'Typhoons = GLT; WCP = WC.',
  },
  {
    season: '2023', date: '2023-07-10', meetSlug: '2023-07-10-wf-at-wt',
    teams: ['WT', 'WF'], division: 2, course: 'SCM',
    sourcePdfPath: 'data-source-pdfs/2023/2023_Windsor_Forest_at_Wellington_Waves_07_10_2023___Meet_Maestro™.pdf',
    pdfAvailable: true, parsedIntoV2: false,
    rowCountExpected: null, rowCountParsed: null, plausibilityFlags: null,
    notes: '',
  },
  {
    season: '2023', date: '2023-07-10', meetSlug: '2023-07-10-ip-at-vw',
    teams: ['VW', 'IP'], division: 3, course: 'SCM',
    sourcePdfPath: 'data-source-pdfs/2023/2023_IP_Stingrays_at_VW_Kraken_07_10_2023___Meet_Maestro™.pdf',
    pdfAvailable: true, parsedIntoV2: false,
    rowCountExpected: null, rowCountParsed: null, plausibilityFlags: null,
    notes: '',
  },
  {
    season: '2023', date: '2023-07-10', meetSlug: '2023-07-10-ps-at-sh',
    teams: ['SH', 'PS'], division: 3, course: 'SCM',
    sourcePdfPath: 'data-source-pdfs/2023/2023_Splash_vs._Powhatan_Secondary_07_10_2023___Meet_Maestro™.pdf',
    pdfAvailable: true, parsedIntoV2: false,
    rowCountExpected: null, rowCountParsed: null, plausibilityFlags: null,
    notes: "Direction: SH home per 'vs.' naming convention (left team = host; same pattern as 2022 KP_vs._WCP). Splash = SH; Powhatan Secondary = PS.",
  },
  {
    season: '2023', date: '2023-07-10', meetSlug: '2023-07-10-wgp-at-vg',
    teams: ['VG', 'WGP'], division: 3, course: 'SCM',
    sourcePdfPath: 'data-source-pdfs/2023/2023_WGP_WAVES_at_Village_Green_07_10_2023___Meet_Maestro™.pdf',
    pdfAvailable: true, parsedIntoV2: false,
    rowCountExpected: null, rowCountParsed: null, plausibilityFlags: null,
    notes: '',
  },
  // --- WEEK 5 (2023-07-17) — eh-at-glt already in manifest ---
  {
    season: '2023', date: '2023-07-17', meetSlug: '2023-07-17-ftc-at-kw',
    teams: ['KW', 'FTC'], division: 1, course: 'SCM',
    sourcePdfPath: 'data-source-pdfs/2023/2023_First_Colony_at_Kingswood_Klams_07_17_2023___Meet_Maestro™.pdf',
    pdfAvailable: true, parsedIntoV2: false,
    rowCountExpected: null, rowCountParsed: null, plausibilityFlags: null,
    notes: '',
  },
  {
    season: '2023', date: '2023-07-17', meetSlug: '2023-07-17-km-at-gs',
    teams: ['GS', 'KM'], division: 1, course: 'SCM',
    sourcePdfPath: 'data-source-pdfs/2023/2023_Kingsmill_Sharks_at_Gators_07_17_2023___Meet_Maestro™.pdf',
    pdfAvailable: true, parsedIntoV2: false,
    rowCountExpected: null, rowCountParsed: null, plausibilityFlags: null,
    notes: '',
  },
  {
    season: '2023', date: '2023-07-17', meetSlug: '2023-07-17-ql-at-fdc',
    teams: ['FDC', 'QL'], division: 1, course: 'SCM',
    sourcePdfPath: "data-source-pdfs/2023/2023_Queens_Lake_at_Ford's_Colony_07_17_2023___Meet_Maestro™.pdf",
    pdfAvailable: true, parsedIntoV2: false,
    rowCountExpected: null, rowCountParsed: null, plausibilityFlags: null,
    notes: '',
  },
  {
    season: '2023', date: '2023-07-17', meetSlug: '2023-07-17-wt-at-kp',
    teams: ['KP', 'WT'], division: 2, course: 'SCM',
    sourcePdfPath: 'data-source-pdfs/2023/2023_Wellington_Waves_at_Kingspoint_07_17_2023___Meet_Maestro™.pdf',
    pdfAvailable: true, parsedIntoV2: false,
    rowCountExpected: null, rowCountParsed: null, plausibilityFlags: null,
    notes: '',
  },
  {
    season: '2023', date: '2023-07-17', meetSlug: '2023-07-17-wc-at-wf',
    teams: ['WF', 'WC'], division: 2, course: 'SCM',
    sourcePdfPath: 'data-source-pdfs/2023/2023_WCP_Manta_Rays_at_Windsor_Forest_07_17_2023___Meet_Maestro™.pdf',
    pdfAvailable: true, parsedIntoV2: false,
    rowCountExpected: null, rowCountParsed: null, plausibilityFlags: null,
    notes: 'WCP = WC.',
  },
  {
    season: '2023', date: '2023-07-17', meetSlug: '2023-07-17-ip-at-ps',
    teams: ['PS', 'IP'], division: 3, course: 'SCM',
    sourcePdfPath: 'data-source-pdfs/2023/2023_IP_Stingrays_at_Seastars_07_17_2023___Meet_Maestro™.pdf',
    pdfAvailable: true, parsedIntoV2: false,
    rowCountExpected: null, rowCountParsed: null, plausibilityFlags: null,
    notes: 'Seastars = PS.',
  },
  {
    season: '2023', date: '2023-07-17', meetSlug: '2023-07-17-vg-at-sh',
    teams: ['SH', 'VG'], division: 3, course: 'SCM',
    sourcePdfPath: 'data-source-pdfs/2023/2023_Splash_vs._Village_Green_07_17_2023___Meet_Maestro™.pdf',
    pdfAvailable: true, parsedIntoV2: false,
    rowCountExpected: null, rowCountParsed: null, plausibilityFlags: null,
    notes: "Direction: SH home per 'vs.' naming convention (left team = host; same pattern as 2022 KP_vs._WCP). Splash = SH.",
  },
  {
    season: '2023', date: '2023-07-17', meetSlug: '2023-07-17-vw-at-wgp',
    teams: ['WGP', 'VW'], division: 3, course: 'SCM',
    sourcePdfPath: 'data-source-pdfs/2023/2023_VW_Kraken_at_WGP_WAVES_07_17_2023___Meet_Maestro™.pdf',
    pdfAvailable: true, parsedIntoV2: false,
    rowCountExpected: null, rowCountParsed: null, plausibilityFlags: null,
    notes: '',
  },
];

// Read manifest
const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
const existing2023 = manifest['2023'];
const existingSlugs = new Set(existing2023.map(e => e.meetSlug));

let added = 0;
for (const entry of newEntries) {
  if (existingSlugs.has(entry.meetSlug)) {
    console.log(`SKIP (already exists): ${entry.meetSlug}`);
    continue;
  }
  existing2023.push(entry);
  existingSlugs.add(entry.meetSlug);
  added++;
}

// Sort 2023 array chronologically by date, then meetSlug
manifest['2023'].sort((a, b) => a.date.localeCompare(b.date) || a.meetSlug.localeCompare(b.meetSlug));

// Write back
writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
console.log(`\nAdded ${added} new 2023 entries. Total 2023 entries: ${manifest['2023'].length}`);
console.log('Manifest written successfully.');
