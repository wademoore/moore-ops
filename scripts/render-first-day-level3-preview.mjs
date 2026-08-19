import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { renderDashboardV2 } from '../render/dashboard-v2.js';
import { resolveBrowserPath } from './render-dashboard-v2-png.mjs';

const event=(title,start,subtitle,_calName)=>({title,subtitle,cardType:'standard',_calName,raw:{start:{dateTime:start}}});
const data={today:new Date('2026-08-24T12:00:00-04:00'),now:new Date('2026-08-24T07:35:00-04:00'),firstDayLevel3Until:'2026-08-24T09:05:00-04:00',days:[{events:[event('Pack backpacks + water bottles','2026-08-24T07:15:00-04:00','Kitchen counter · everything labeled','Myles + Ophelia'),event('Stonehouse Elementary drop-off','2026-08-24T08:10:00-04:00','First Day of School · front entrance','Myles + Ophelia')]}],upcomingEvents:[event('First Day of School','2026-08-24T08:10:00-04:00','Stonehouse Elementary','Myles + Ophelia'),event('Back-to-School Picnic','2026-08-25T17:30:00-04:00','Stonehouse playground','Family'),event('Ophelia Dance Class','2026-08-26T16:45:00-04:00','iDance','Ophelia'),event('Myles Sharks Practice','2026-08-27T18:00:00-04:00','Warhill Sports Complex','Myles')],weather:{current:{temperature:78,feelsLike:80,summary:'Sunny'}},menuEvent:{title:'First-day celebration tacos',subtitle:'Myles chooses dessert'}};
const dir=resolve('preview','first-day-level3'),html=resolve(dir,'preview.html'),png=resolve(dir,'preview.png');
await mkdir(dir,{recursive:true});await writeFile(html,renderDashboardV2(data),'utf8');
const browser=await chromium.launch({headless:true,executablePath:resolveBrowserPath(),args:['--no-sandbox']});const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});await page.goto(`file:///${html.replaceAll('\\','/')}`);await page.screenshot({path:png});await browser.close();console.log(html);console.log(png);
