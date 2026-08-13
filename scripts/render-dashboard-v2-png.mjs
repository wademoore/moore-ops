import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { renderDashboardV2 } from '../render/dashboard-v2.js';
import { sampleDashboardV2Data } from '../render/dashboard-v2.sample-data.js';

const WIDTH = 2560;
const HEIGHT = 1440;
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function option(args, name, fallback = undefined) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
}

function firstPositional(args) {
  for (let index = 0; index < args.length; index += 1) {
    if (args[index].startsWith('--')) {
      index += 1;
      continue;
    }
    return args[index];
  }
  return undefined;
}

function pngDimensions(bytes) {
  const signature = bytes.subarray(0, 8).toString('hex');
  if (signature !== '89504e470d0a1a0a' || bytes.subarray(12, 16).toString('ascii') !== 'IHDR') {
    throw new Error('Screenshot output is not a valid PNG.');
  }
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

function resolveBrowserPath(explicitPath) {
  const candidates = [
    explicitPath,
    chromium.executablePath(),
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    process.env.PROGRAMFILES && `${process.env.PROGRAMFILES}\\Google\\Chrome\\Application\\chrome.exe`,
    process.env['PROGRAMFILES(X86)'] && `${process.env['PROGRAMFILES(X86)']}\\Google\\Chrome\\Application\\chrome.exe`,
  ].filter(Boolean);

  const browserPath = candidates.find(candidate => existsSync(candidate));
  if (!browserPath) {
    throw new Error('No Chromium executable found. Install Chromium, run `npx playwright install chromium`, or set DASHBOARD_BROWSER_PATH.');
  }
  return browserPath;
}

async function waitForVisualAssets(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    const images = [...document.images];
    await Promise.race([
      Promise.all(images.map(image => {
        if (image.complete) return Promise.resolve();
        return new Promise(resolveImage => {
          image.addEventListener('load', resolveImage, { once: true });
          image.addEventListener('error', resolveImage, { once: true });
        });
      })),
      new Promise(resolveTimeout => setTimeout(resolveTimeout, 5000)),
    ]);
    await new Promise(resolveFrame => requestAnimationFrame(() => requestAnimationFrame(resolveFrame)));
  });
}

async function renderDashboardV2Png({
  outputPath = resolve(root, 'preview/dashboard-v2.png'),
  htmlPath = resolve(root, 'preview/dashboard-v2.html'),
  browserPath,
} = {}) {
  const output = resolve(outputPath);
  const html = resolve(htmlPath);

  await mkdir(dirname(output), { recursive: true });
  await mkdir(dirname(html), { recursive: true });
  await writeFile(html, renderDashboardV2(sampleDashboardV2Data), 'utf8');

  const executablePath = resolveBrowserPath(browserPath);
  const browser = await chromium.launch({
    headless: true,
    executablePath,
    args: [
      '--disable-dev-shm-usage',
      '--disable-setuid-sandbox',
      '--disable-site-isolation-trials',
      '--disable-web-security',
      '--no-sandbox',
      '--no-zygote',
      '--single-process',
    ],
  });

  try {
    const context = await browser.newContext({
      viewport: { width: WIDTH, height: HEIGHT },
      screen: { width: WIDTH, height: HEIGHT },
      deviceScaleFactor: 1,
      colorScheme: 'light',
    });
    const page = await context.newPage();
    await page.goto(pathToFileURL(html).href, { waitUntil: 'load' });
    await waitForVisualAssets(page);

    const canvas = await page.locator('.dashboard').boundingBox();
    if (!canvas || Math.round(canvas.width) !== WIDTH || Math.round(canvas.height) !== HEIGHT) {
      throw new Error(`Dashboard canvas is ${canvas?.width ?? 0}x${canvas?.height ?? 0}; expected ${WIDTH}x${HEIGHT}.`);
    }

    await page.screenshot({
      path: output,
      type: 'png',
      fullPage: false,
      animations: 'disabled',
    });
    await context.close();
  } finally {
    await browser.close();
  }

  const dimensions = pngDimensions(await readFile(output));
  if (dimensions.width !== WIDTH || dimensions.height !== HEIGHT) {
    throw new Error(`PNG is ${dimensions.width}x${dimensions.height}; expected ${WIDTH}x${HEIGHT}.`);
  }

  return { output, html, ...dimensions };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const result = await renderDashboardV2Png({
    outputPath: resolve(root, firstPositional(args) || 'preview/dashboard-v2.png'),
    htmlPath: resolve(root, option(args, '--html', 'preview/dashboard-v2.html')),
    browserPath: option(args, '--browser-path', process.env.DASHBOARD_BROWSER_PATH),
  });
  console.log(`${result.output} (${result.width}x${result.height})`);
}

export { HEIGHT, WIDTH, pngDimensions, renderDashboardV2Png, resolveBrowserPath };
