import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { resolveBrowserPath } from './render-dashboard-v2-png.mjs';
import { renderDashboardV2 } from '../render/dashboard-v2.js';
import { sampleDashboardV2Data } from '../render/dashboard-v2.sample-data.js';
import { fetchSportsSnapshot } from '../sports/index.js';
import { validateSportsSnapshot } from '../sports/model.js';

const output = resolve(process.argv[2] || 'preview/sports-ticker-review');
const NOW = new Date('2026-08-14T16:00:00Z');
const event = (id, organization, sport, state, startTime, extra = {}) => ({ id, organization, sport, league: sport === 'baseball' ? 'mlb' : organization === 'commanders' ? 'nfl' : sport === 'basketball' ? 'mens-college-basketball' : 'college-football', state, startTime, opponent: 'Opponent', opponentAbbreviation: 'OPP', homeAway: 'home', teamScore: 0, opponentScore: 0, ...extra });
const slot = (organization, label, eventValue, extra = {}) => ({ organization, label, logo: organization, affinity: 1, event: eventValue, presentationState: eventValue?.state === 'scheduled' ? 'upcoming' : eventValue?.state || 'offseason', score: 0, reasonCodes: [], dataDelayed: false, feedFailures: [], lastResult: null, record: null, records: null, conference: null, standing: null, ...extra });

function baseSnapshot() {
  return { version: 1, generatedAt: NOW.toISOString(), nextPollSeconds: 1800, slots: [
    slot('nationals', 'Nationals', event('n-next','nationals','baseball','scheduled','2026-08-15T23:05:00Z',{ opponent:'Philadelphia Phillies', opponentAbbreviation:'PHI', homeAway:'home' }), { lastResult:event('n-last','nationals','baseball','final','2026-08-13T23:05:00Z',{ opponent:'New York Mets', opponentAbbreviation:'NYM', homeAway:'away', teamScore:5, opponentScore:2, result:'W' }), record:'60-64', records:{overall:'60-64',conference:null,regularSeason:'60-64',preseason:null}, standing:'4th NL East' }),
    slot('commanders', 'Commanders', event('c-next','commanders','football','scheduled','2026-08-18T00:00:00Z',{ opponent:'Cincinnati Bengals', opponentAbbreviation:'CIN', seasonType:'Preseason' }), { record:'1-0', records:{overall:'1-0',conference:null,regularSeason:'0-0',preseason:'1-0'} }),
    slot('wm', 'W&M', event('w-next','wm','football','scheduled','2026-08-20T23:00:00Z',{ opponent:'Richmond Spiders', opponentAbbreviation:'RICH', records:{overall:'1-0',conference:'0-0'} }), { record:'1-0', records:{overall:'1-0',conference:'0-0',regularSeason:null,preseason:null}, conference:'CAA', standing:'2nd CAA' }),
    slot('tennessee', 'Tennessee', event('t-next','tennessee','football','scheduled','2026-08-22T19:30:00Z',{ opponent:'Syracuse Orange', opponentAbbreviation:'SYR', rank:12, records:{overall:'2-0',conference:'1-0'} }), { record:'2-0', records:{overall:'2-0',conference:'1-0',regularSeason:null,preseason:null}, conference:'SEC', standing:'T-2nd SEC' }),
  ] };
}

function stateSnapshot(name) {
  const snapshot = baseSnapshot();
  if (name === 'basketball') snapshot.slots[2] = slot('wm','W&M',event('wb','wm','basketball','scheduled','2026-08-16T20:00:00Z',{opponent:'Towson Tigers',opponentAbbreviation:'TOW',records:{overall:'10-2',conference:'2-0'}}),{record:'10-2',records:{overall:'10-2',conference:'2-0',regularSeason:null,preseason:null},conference:'CAA',standing:'1st CAA'});
  if (name === 'live') { snapshot.slots[0].event = event('n-live','nationals','baseball','live','2026-08-14T23:05:00Z',{opponent:'Philadelphia Phillies',opponentAbbreviation:'PHI',teamScore:4,opponentScore:3,statusText:'Top 7th',clock:'Top'}); snapshot.slots[0].lastResult = null; snapshot.slots[0].presentationState = 'live'; }
  if (name === 'partial') snapshot.slots[0].standing = null;
  if (name === 'long-name') { snapshot.slots[0].event.opponent='Philadelphia Phillies Extremely Long Display Name'; snapshot.slots[0].event.opponentAbbreviation=''; snapshot.slots[2].event.opponent='Very Long Opponent University and Athletic Association'; snapshot.slots[2].event.opponentAbbreviation=''; }
  return snapshot;
}

await mkdir(output, { recursive: true });
const htmlPaths = [];
for (const treatment of ['inline','dedicated']) for (const state of ['base','basketball','live','partial','long-name']) {
  const data = { ...sampleDashboardV2Data, now: NOW, today: NOW, sportsMetadataTreatment: treatment, sportsSnapshot: stateSnapshot(state) };
  const html = resolve(output, `${treatment}-${state}.html`); htmlPaths.push(html);
  await writeFile(html, renderDashboardV2(data), 'utf8');
}

if (process.argv.includes('--real')) {
  const sportsSnapshot = await fetchSportsSnapshot({ now: new Date(), logger: console });
  const data = { ...sampleDashboardV2Data, now: new Date(), today: new Date(), sportsMetadataTreatment: 'inline', sportsSnapshot };
  const html = resolve(output, 'real.html'); htmlPaths.push(html);
  await writeFile(html, renderDashboardV2(data), 'utf8');
  await writeFile(resolve(output, 'real-snapshot.json'), JSON.stringify(sportsSnapshot, null, 2), 'utf8');
}
const browser = await chromium.launch({ headless: true, executablePath: resolveBrowserPath(), args: ['--no-sandbox'] });
const metrics = {};
try {
  const context = await browser.newContext({ viewport:{width:2560,height:1440}, screen:{width:2560,height:1440}, deviceScaleFactor:1, colorScheme:'light' });
  for (const html of htmlPaths) {
    const page = await context.newPage(); await page.goto(pathToFileURL(html).href, { waitUntil:'load' }); await page.evaluate(() => document.fonts.ready);
    const name = html.split(/[\\/]/).at(-1).replace('.html','');
    metrics[name] = await page.evaluate(() => { const rect=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height}};const ticker=document.querySelector('.sports-ticker'),slots=[...document.querySelectorAll('.ticker-slot')];return{viewport:{width:innerWidth,height:innerHeight},dashboard:rect(document.querySelector('.dashboard')),ticker:rect(ticker),slots:slots.map(node=>({organization:node.dataset.sportsOrg,line1:node.querySelector('b').textContent,line2:node.querySelector('span').textContent,meta:node.querySelector('.ticker-meta').textContent,rect:rect(node),line1Overflow:node.querySelector('b').scrollWidth>node.querySelector('b').clientWidth,line2Overflow:node.querySelector('span').scrollWidth>node.querySelector('span').clientWidth,metaOverflow:node.querySelector('.ticker-meta').scrollWidth>node.querySelector('.ticker-meta').clientWidth,logo:rect(node.querySelector('img'))}))}});
    await page.screenshot({ path:resolve(output,`${name}.png`), type:'png', fullPage:false, animations:'disabled' });
    const validationSlot = organization => ({ organization, label:organization, logo:organization === 'nationals' ? 'nationals' : organization, event:null, lastResult:null, record:null, records:null, conference:null, standing:null });
    const valid = { version:1, generatedAt:NOW.toISOString(), nextPollSeconds:1800, slots:['wm','tennessee','commanders','nationals'].map(validationSlot) };
    const invalid = structuredClone(valid); invalid.slots[0].lastResult={state:'live',result:'W',teamScore:1,opponentScore:0};
    const browserValidation = await page.evaluate(({valid,invalid}) => ({valid:window.updateSportsTicker(valid),invalid:window.updateSportsTicker(invalid)}), {valid,invalid});
    metrics[name].validation = { browser:browserValidation, server:{valid:validateSportsSnapshot(valid),invalid:validateSportsSnapshot(invalid)} };
    await page.close();
  }
  await context.close();
} finally { await browser.close(); }
await writeFile(resolve(output,'geometry.json'),JSON.stringify(metrics,null,2),'utf8');
console.log(output);
