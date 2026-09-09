import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { renderDashboardV2 } from '../render/dashboard-v2.js';
import { resolveBrowserPath } from './render-dashboard-v2-png.mjs';

const event=(title,start,subtitle,_calName)=>({title,subtitle,cardType:'standard',_calName,raw:{start:{dateTime:start}}});
const milestone={title:'🏫 First Day of School (Myles and Ophelia)',cardType:'standard',_calName:'Family',raw:{start:{date:'2026-08-24'},end:{date:'2026-08-25'}}};
const data={today:new Date('2026-08-24T12:00:00-04:00'),now:new Date('2026-08-24T07:35:00-04:00'),days:[{events:[milestone]}],upcomingEvents:[event('Back-to-School Picnic','2026-08-25T17:30:00-04:00','Stonehouse playground','Family'),event('Ophelia Dance Class','2026-08-26T16:45:00-04:00','iDance','Ophelia'),event('Myles Sharks Practice','2026-08-27T18:00:00-04:00','Warhill Sports Complex','Myles')],weather:{current:{temperature:78,feelsLike:80,summary:'Sunny'}},menuEvent:{title:'First-day celebration tacos',subtitle:'Myles chooses dessert'}};
const dir=resolve('preview','first-day-level3-readiness');
const states=[['07-00','2026-08-24T07:00:00-04:00'],['07-20','2026-08-24T07:20:00-04:00'],['07-35','2026-08-24T07:35:00-04:00'],['post-handoff','2026-08-24T07:45:01-04:00'],['15-59','2026-08-24T15:59:00-04:00'],['16-00-welcome-home','2026-08-24T16:00:00-04:00'],['19-00-evening','2026-08-24T19:00:00-04:00']];
await mkdir(dir,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:resolveBrowserPath(),args:['--no-sandbox']});
for(const [name,time] of states){const html=resolve(dir,`${name}.html`),png=resolve(dir,`${name}.png`);await writeFile(html,renderDashboardV2({...data,now:new Date(time)}),'utf8');const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});await page.clock.setFixedTime(new Date(time));await page.goto(`file:///${html.replaceAll('\\','/')}`);await page.screenshot({path:png});await page.close();console.log(`${name}: ${html}`);console.log(`${name}: ${png}`)}
await browser.close();
