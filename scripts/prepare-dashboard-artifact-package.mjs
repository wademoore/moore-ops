import { cp, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const target = resolve('.aws-sam/build/GeneratorFunction');
const dataFiles = [
  'sports-config.json', 'flag-football.json', 'pb-records.json', 'swim-results.json',
  'waves-season.json', 'sharks-soccer.json', 'vpsu-rankings.json',
  'league-results-v2.json', 'swim-annotations.json',
];
await mkdir(resolve(target, 'assets-v2'), { recursive: true });
await cp(resolve('render/assets-v2'), resolve(target, 'assets-v2'), { recursive: true });
await mkdir(resolve(target, 'data'), { recursive: true });
for (const name of dataFiles) await cp(resolve('data', name), resolve(target, 'data', name));
console.log(`dashboard artifact package assets: ${dataFiles.length} data files and render/assets-v2 copied`);
