import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium } from 'playwright';
import { renderDashboardV2 } from './dashboard-v2.js';
import { resolveBrowserPath } from '../scripts/render-dashboard-v2-png.mjs';

const event=(title,start,subtitle,_calName)=>({title,subtitle,cardType:'standard',_calName,raw:{start:{dateTime:start}}});
const data={today:new Date('2026-08-24T12:00:00-04:00'),now:new Date('2026-08-24T07:35:00-04:00'),firstDayLevel3Until:'2026-08-24T08:40:00-04:00',days:[{events:[event('Pack backpacks + water bottles','2026-08-24T07:15:00-04:00','Kitchen counter','Myles + Ophelia'),event('Stonehouse Elementary drop-off','2026-08-24T08:10:00-04:00','First Day of School','Myles + Ophelia')]}],upcomingEvents:[event('First Day of School','2026-08-24T08:10:00-04:00','Stonehouse Elementary','Myles + Ophelia'),event('Back-to-School Picnic','2026-08-25T17:30:00-04:00','Stonehouse playground','Family'),event('Ophelia Dance Class','2026-08-26T16:45:00-04:00','iDance','Ophelia'),event('Myles Sharks Practice','2026-08-27T18:00:00-04:00','Warhill Sports Complex','Myles')],weather:{current:{temperature:78,feelsLike:80,summary:'Sunny'}},menuEvent:{title:'First-day celebration tacos'}};
let browser;
before(async()=>{browser=await chromium.launch({headless:true,executablePath:resolveBrowserPath(),args:['--no-sandbox']});});
after(async()=>{await browser?.close();});

test('three Coming Up entries fit inside the locked card at 1920x1080',async()=>{
  const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
  await page.setContent(renderDashboardV2(data),{waitUntil:'load'});
  const geometry=await page.evaluate(()=>{
    const card=document.querySelector('.fd-coming').getBoundingClientRect();
    const rows=[...document.querySelectorAll('.fd-coming-item')].map(row=>{const box=row.getBoundingClientRect();return {top:box.top,bottom:box.bottom,clientHeight:row.clientHeight,scrollHeight:row.scrollHeight};});
    return {card:{top:card.top,bottom:card.bottom},rows};
  });
  assert.equal(geometry.rows.length,3);
  assert.ok(geometry.rows[0].top>=geometry.card.top);
  assert.ok(geometry.rows[2].bottom<=geometry.card.bottom-4,`third row bottom ${geometry.rows[2].bottom} exceeds card ${geometry.card.bottom}`);
  assert.ok(geometry.rows.every((row,index)=>row.scrollHeight<=row.clientHeight&&(!index||row.top>=geometry.rows[index-1].bottom)),JSON.stringify(geometry));
  await page.close();
});
