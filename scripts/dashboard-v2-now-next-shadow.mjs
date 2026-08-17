import { mkdir, open, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { fetchDashboardV2Data } from '../dashboard-v2-data.js';
import { renderDashboardV2 } from '../render/dashboard-v2.js';

const DEFAULT_OUTPUT_DIR = 'preview/dashboard-v2-shadow';

async function atomicWrite(path, content) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  try {
    await writeFile(temporary, content, 'utf8');
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}

function selectedDiagnostic(nowNext) {
  const diagnostics = nowNext?.diagnostics || {};
  const selected = (diagnostics.candidates || []).find(item =>
    item.occurrenceId === diagnostics.selectedSource?.occurrenceId
  );
  return {
    evaluatedAt: diagnostics.evaluatedAt,
    reasonCodes: nowNext?.reasonCodes || [],
    selected: {
      reasonCode: selected?.reasonCode || nowNext?.reasonCodes?.[0] || null,
      priority: selected?.priority ?? 0,
      sourceType: diagnostics.selectedSource?.type || 'fallback',
    },
    supportingReasonCodes: (nowNext?.supporting || []).map(item => item.reasonCode),
    candidateCount: diagnostics.candidateCount ?? 0,
    rejectedCount: Math.max(0, (diagnostics.candidateCount ?? 0) - 1),
  };
}

function historyRecord(redacted) {
  return {
    at: redacted.evaluatedAt,
    reason: redacted.selected.reasonCode,
    priority: redacted.selected.priority,
    sourceType: redacted.selected.sourceType,
    support: redacted.supportingReasonCodes,
    candidates: redacted.candidateCount,
    rejected: redacted.rejectedCount,
  };
}

async function resolveAuthFiles({ root, env = process.env, fileStat = stat }) {
  const configuredCredentials = env.MOORE_OPS_CREDENTIALS_PATH;
  const configuredToken = env.MOORE_OPS_TOKEN_PATH;
  if (Boolean(configuredCredentials) !== Boolean(configuredToken)) {
    throw new Error('Both MOORE_OPS_CREDENTIALS_PATH and MOORE_OPS_TOKEN_PATH are required together.');
  }
  const external = Boolean(configuredCredentials);
  const paths = external
    ? [resolve(configuredCredentials), resolve(configuredToken)]
    : [resolve(root, 'credentials.json'), resolve(root, 'token.json')];
  for (const path of paths) {
    try {
      if (!(await fileStat(path)).isFile()) throw new Error('not-file');
    } catch {
      throw new Error(external
        ? 'Configured external Moore Ops authentication files are missing or invalid.'
        : 'NOW/NEXT shadow needs existing local Google auth files. No production action was attempted.');
    }
  }
  return { credentialsPath: paths[0], tokenPath: paths[1], external };
}

async function runShadow({
  root,
  outputDir = DEFAULT_OUTPUT_DIR,
  now = new Date(),
  fetchData = fetchDashboardV2Data,
  render = renderDashboardV2,
} = {}) {
  const projectRoot = root || resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const destination = resolve(projectRoot, outputDir);
  await mkdir(destination, { recursive: true });
  const lockPath = resolve(destination, '.run.lock');
  let lock;
  try {
    lock = await open(lockPath, 'wx');
  } catch (error) {
    if (error.code === 'EEXIST') throw new Error(`NOW/NEXT shadow is already running (${lockPath})`);
    throw error;
  }

  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid, startedAt: now.toISOString() }));
    const data = await fetchData({ now });
    const redacted = selectedDiagnostic(data.nowNext);
    const previewPath = resolve(destination, 'latest.html');
    const diagnosticPath = resolve(destination, 'latest.json');
    const historyPath = resolve(destination, 'selection-history.ndjson');
    let history = '';
    try {
      history = await readFile(historyPath, 'utf8');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    const record = `${JSON.stringify(historyRecord(redacted))}\n`;

    await atomicWrite(previewPath, render({
      ...data,
      sportsFeedUrl: process.env.SPORTS_FEED_URL || '',
    }));
    await atomicWrite(diagnosticPath, `${JSON.stringify(redacted, null, 2)}\n`);
    await atomicWrite(historyPath, `${history}${record}`);
    return { previewPath, diagnosticPath, historyPath, redacted };
  } finally {
    await lock.close();
    await rm(lockPath, { force: true });
  }
}

async function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  process.chdir(root);
  process.env.TZ = 'America/New_York';
  process.env.GOOGLE_AUTH_READ_ONLY = '1';
  loadEnv({ path: resolve(root, '.env'), quiet: true });
  const authFiles = await resolveAuthFiles({ root });
  if (authFiles.external) {
    process.env.MOORE_OPS_CREDENTIALS_PATH = authFiles.credentialsPath;
    process.env.MOORE_OPS_TOKEN_PATH = authFiles.tokenPath;
  }
  const result = await runShadow({ root, now: new Date() });
  console.log(`${result.previewPath}\n${result.diagnosticPath}\n${result.historyPath}\n(read-only NOW/NEXT shadow; no email, upload, deployment, or production write)`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) await main();

export { atomicWrite, historyRecord, resolveAuthFiles, runShadow, selectedDiagnostic };
