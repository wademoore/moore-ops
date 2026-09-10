// Does #69's flag-football logo (now attached in production by #68) shift the
// accented row's title? #65's contrast and doodle-clearance arguments both
// depend on the title's x-position, and the accent fixtures carry no
// `flagFootball` key, so preview/measurement render a row production will not.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { renderDashboardV2 } from '../../render/dashboard-v2.js';
import { eventRowAccentSampleData } from '../../render/dashboard-v2.sample-data.js';
import { resolveBrowserPath } from '../../scripts/render-dashboard-v2-png.mjs';

const registry = JSON.parse(readFileSync(new URL('../../data/special-events.json', import.meta.url), 'utf8'));
const sharks   = JSON.parse(readFileSync(new URL('../../data/sharks-soccer.json', import.meta.url), 'utf8'));
const flag     = JSON.parse(readFileSync(new URL('../../data/flag-football.json', import.meta.url), 'utf8'));

const ID = 'Cowboys';
function build(withIdentity) {
  const d = eventRowAccentSampleData({ now: '2026-09-19T20:30:00-04:00', specialEventsConfig: registry, sharksSoccerData: sharks, flagFootballData: flag });
  if (!withIdentity) return d;
  const tag = ev => (/Flag Football/i.test(ev.title || '')
    ? { ...ev, flagFootball: { seasonId: 'fall-2026', week: 2, team: { teamId: 8009182, teamName: ID }, opponent: null } }
    : ev);
  return { ...d, upcomingEvents: (d.upcomingEvents || []).map(tag),
           days: (d.days || []).map(day => ({ ...day, events: (day.events || []).map(tag) })) };
}

const browser = await chromium.launch({ headless: true, executablePath: resolveBrowserPath(process.env.DASHBOARD_BROWSER_PATH), args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 2560, height: 1440 } });

async function measure(withIdentity) {
  await page.setContent(renderDashboardV2(build(withIdentity)));
  await page.evaluate(at => window.updateEventRowAccents?.(at), Date.parse('2026-09-20T00:00:00Z'));
  return page.evaluate(() => [...document.querySelectorAll('.upcoming-event')].map(row => {
    const strong = row.querySelector('strong');
    const icon = row.querySelector('.semantic-icon, .upcoming-logo, .activity-mark');
    const r = strong?.getBoundingClientRect();
    return {
      text: (strong?.textContent || '').slice(0, 34),
      titleLeft: r ? +r.left.toFixed(2) : null,
      titleRight: r ? +r.right.toFixed(2) : null,
      rowH: +row.getBoundingClientRect().height.toFixed(2),
      iconW: icon ? +icon.getBoundingClientRect().width.toFixed(2) : null,
      hasImg: !!row.querySelector('.semantic-icon img'),
      accent: row.getAttribute('data-accent-id'),
    };
  }));
}

const without = await measure(false);
const with_   = await measure(true);
await browser.close();

const flagRows = i => i.filter(r => /Flag Football/i.test(r.text));
console.log('--- WITHOUT flagFootball (what the fixtures render today) ---');
for (const r of flagRows(without)) console.log(' ', JSON.stringify(r));
console.log('--- WITH flagFootball (what production renders after #68/#69) ---');
for (const r of flagRows(with_)) console.log(' ', JSON.stringify(r));

const geom = i => i.map(r => [r.titleLeft, r.titleRight, r.rowH]);
console.log('\ntitle/row geometry identical across the two?',
  JSON.stringify(geom(without)) === JSON.stringify(geom(with_)) ? 'YES' : 'NO');
console.log('logo actually rendered in the WITH case?',
  flagRows(with_).some(r => r.hasImg) ? 'YES (positive control holds)' : 'NO — control failed, result means nothing');
