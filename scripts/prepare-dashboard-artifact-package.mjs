import { cp, mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const target = resolve('.aws-sam/build/GeneratorFunction');
const inputs = JSON.parse(await readFile(new URL('../dashboard-artifact/package-inputs.json', import.meta.url), 'utf8'));
for (const directory of inputs.assetDirectories) {
  const destination = directory.replace(/^render\//, '');
  await mkdir(resolve(target, destination), { recursive: true });
  await cp(resolve(directory), resolve(target, destination), { recursive: true });
}
await mkdir(resolve(target, 'data'), { recursive: true });
for (const name of inputs.dataFiles) await cp(resolve('data', name), resolve(target, 'data', name));
console.log(`dashboard artifact package assets: ${inputs.dataFiles.length} data files and ${inputs.assetDirectories.length} asset directory copied`);
