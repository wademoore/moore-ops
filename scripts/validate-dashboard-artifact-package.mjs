import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve('.aws-sam/build/GeneratorFunction');
const inputs = JSON.parse(await readFile(new URL('../dashboard-artifact/package-inputs.json', import.meta.url), 'utf8'));
const failures = [];
async function exists(path) { try { await access(resolve(root, path)); return true; } catch { return false; } }

const bundleCandidates = ['dashboard-artifact/generator.js', 'generator.js'];
const bundlePath = (await Promise.all(bundleCandidates.map(async path => [path, await exists(path)]))).find(([, present]) => present)?.[0];
if (!bundlePath) failures.push('built generator bundle is missing');
else {
  const bundle = await readFile(resolve(root, bundlePath), 'utf8');
  for (const marker of ['Emma Unavailable', 'emma_unavailability_calendar_read_succeeded']) {
    if (!bundle.includes(marker)) failures.push(`built generator bundle is missing required marker: ${marker}`);
  }
  const load = spawnSync(process.execPath, ['-e', `require('./${bundlePath.replaceAll('\\', '/')}')`], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      DASHBOARD_ASSET_DIR: resolve(root, 'assets-v2'),
      DASHBOARD_FIRST_DAY_ASSET_DIR: resolve(root, 'assets-first-day'),
      DASHBOARD_DATA_DIR: resolve(root, 'data'),
    },
  });
  if (load.status !== 0) failures.push(`built generator bundle cannot initialize: ${load.stderr.trim() || `exit ${load.status}`}`);
}
for (const directory of inputs.assetDirectories) {
  const destination = directory.replace(/^render\//, '');
  if (!(await exists(destination))) failures.push(`built asset directory is missing: ${destination}`);
}
for (const path of inputs.requiredAssetFiles || []) if (!(await exists(path))) failures.push(`required built asset is missing: ${path}`);
for (const name of inputs.dataFiles) if (!(await exists(`data/${name}`))) failures.push(`built data file is missing: data/${name}`);
for (const forbidden of ['.env', 'credentials.json', 'token.json']) if (await exists(forbidden)) failures.push(`forbidden package file is present: ${forbidden}`);

if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`dashboard artifact package: valid (${inputs.dataFiles.length} data files, Emma parser/evaluator/builder markers present)`);
}
