import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderDashboardV2 } from '../render/dashboard-v2.js';
import { sampleDashboardV2Data } from '../render/dashboard-v2.sample-data.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, process.argv[2] || 'preview/dashboard-v2.html');
await mkdir(dirname(output), { recursive: true });
await writeFile(output, renderDashboardV2(sampleDashboardV2Data), 'utf8');
console.log(output);
