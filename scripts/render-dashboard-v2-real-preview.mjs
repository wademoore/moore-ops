import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { fetchDashboardV2Data } from '../dashboard-v2-data.js';
import { renderDashboardV2 } from '../render/dashboard-v2.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
loadEnv({ path: resolve(root, '.env'), quiet: true });

if (!process.env.AWS_LAMBDA_FUNCTION_NAME) {
  const missing = ['credentials.json', 'token.json'].filter(name => !existsSync(resolve(root, name)));
  if (missing.length) {
    throw new Error(`Real-data preview needs the existing local Google auth files: ${missing.join(', ')}. No production action was attempted.`);
  }
}

const output = resolve(root, process.argv[2] || 'preview/dashboard-v2-real.html');
const digestData = await fetchDashboardV2Data();
await mkdir(dirname(output), { recursive: true });
await writeFile(output, renderDashboardV2(digestData), 'utf8');
console.log(`${output} (read-only real-data preview; no email or upload)`);
