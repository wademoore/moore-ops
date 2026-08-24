import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium } from 'playwright';
import { renderDashboardV2 } from './dashboard-v2.js';
import { resolveBrowserPath } from '../scripts/render-dashboard-v2-png.mjs';

const event=(title,start,subtitle,_calName)=>({title,subtitle,cardType:'standard',_calName,raw:{start:{dateTime:start}}});
const milestone={title:'🏫 First Day of School (Myles and Ophelia)',cardType:'standard',_calName:'Family',raw:{start:{date:'2026-08-24'},end:{date:'2026-08-25'}}};
const data={today:new Date('2026-08-24T12:00:00-04:00'),now:new Date('2026-08-24T07:35:00-04:00'),days:[{events:[milestone]}],upcomingEvents:[event('Back-to-School Picnic','2026-08-25T17:30:00-04:00','Stonehouse playground','Family'),event('Ophelia Dance Class','2026-08-26T16:45:00-04:00','iDance','Ophelia'),event('Myles Sharks Practice','2026-08-27T18:00:00-04:00','Warhill Sports Complex','Myles')],weather:{current:{temperature:78,feelsLike:80,summary:'Sunny'}},menuEvent:{title:'First-day celebration tacos'}};
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

test('one browser artifact advances at departure and exits at handoff',async()=>{
  const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
  await page.setContent(renderDashboardV2({...data,now:new Date('2026-08-24T07:00:00-04:00')}),{waitUntil:'load'});
  const state=async time=>page.evaluate(value=>({phase:window.updateFirstDayLevel3(new Date(value)),now:document.querySelector('[data-fd-slot="now"] strong')?.textContent,next:document.querySelector('[data-fd-slot="next"] strong')?.textContent}),time);
  assert.deepEqual(await state('2026-08-24T07:20:00-04:00'),{phase:'preparation',now:'School preparation',next:'Leave for Stonehouse'});
  assert.deepEqual(await state('2026-08-24T07:35:00-04:00'),{phase:'departure',now:'Leave for Stonehouse',next:'Arrive at Stonehouse'});
  assert.equal((await state('2026-08-24T07:45:00-04:00')).phase,'level2');
  assert.deepEqual(await state('2026-08-24T16:00:00-04:00'),{phase:'coda',now:'Welcome home, Myles + Ophelia',next:'First-day celebration tacos'});
  assert.equal((await state('2026-08-24T19:00:00-04:00')).phase,'level2');
  await page.close();
});

test('version-pinned Level-2 companion requests coda re-entry only inside the 4–7 PM window',async()=>{
  const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
  const html=renderDashboardV2({...data,firstDayLevel3:false,firstDayLevel3CodaUrl:'index.html',firstDayLevel3CodaStart:'2026-08-24T16:00:00-04:00',firstDayLevel3CodaEnd:'2026-08-24T19:00:00-04:00'});
  await page.setContent(html,{waitUntil:'load'});
  const state=time=>page.evaluate(value=>window.updateFirstDayLevel2Transition(new Date(value)),time);
  assert.equal(await state('2026-08-24T15:59:59-04:00'),'level2');
  assert.equal(await state('2026-08-24T16:00:00-04:00'),'coda');
  assert.equal(await state('2026-08-24T19:00:00-04:00'),'level2');
  await page.close();
});
