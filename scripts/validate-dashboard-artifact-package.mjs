import { createHash } from 'node:crypto';
import { access, readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve('.aws-sam/build/GeneratorFunction');
const inputs = JSON.parse(await readFile(new URL('../dashboard-artifact/package-inputs.json', import.meta.url), 'utf8'));
const failures = [];
async function exists(path) { try { await access(resolve(root, path)); return true; } catch { return false; } }
async function directoryFiles(directory) {
  const files = [];
  async function visit(current, prefix = '') {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await visit(resolve(current, entry.name), relative);
      else if (entry.isFile()) files.push(relative);
    }
  }
  await visit(directory);
  return files.sort();
}
async function checksum(path) {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}

const bundleCandidates = ['dashboard-artifact/generator.js', 'generator.js'];
const bundlePath = (await Promise.all(bundleCandidates.map(async path => [path, await exists(path)]))).find(([, present]) => present)?.[0];
if (!bundlePath) failures.push('built generator bundle is missing');
else {
  const bundle = await readFile(resolve(root, bundlePath), 'utf8');
  for (const marker of ['Emma Unavailable', 'emma_unavailability_calendar_read_succeeded']) {
    if (!bundle.includes(marker)) failures.push(`built generator bundle is missing required marker: ${marker}`);
  }
}
for (const directory of inputs.assetDirectories) {
  const destination = directory.replace(/^render\//, '');
  if (!(await exists(destination))) {
    failures.push(`built asset directory is missing: ${destination}`);
    continue;
  }
  const sourceFiles = await directoryFiles(resolve(directory));
  const builtFiles = await directoryFiles(resolve(root, destination));
  if (JSON.stringify(builtFiles) !== JSON.stringify(sourceFiles)) {
    failures.push(`built asset directory contents differ from source: ${destination}`);
    continue;
  }
  for (const path of sourceFiles) {
    if (await checksum(resolve(directory, path)) !== await checksum(resolve(root, destination, path))) {
      failures.push(`built asset differs from source: ${destination}/${path}`);
    }
  }
}
for (const path of inputs.requiredAssetFiles || []) if (!(await exists(path))) failures.push(`required built asset is missing: ${path}`);
for (const name of inputs.dataFiles) if (!(await exists(`data/${name}`))) failures.push(`built data file is missing: data/${name}`);
for (const forbidden of ['.env', 'credentials.json', 'token.json']) if (await exists(forbidden)) failures.push(`forbidden package file is present: ${forbidden}`);

if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`dashboard artifact package: valid (${inputs.dataFiles.length} data files, complete asset directories, Emma parser/evaluator/builder markers present)`);
}
