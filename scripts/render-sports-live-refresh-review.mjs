import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { renderDashboardV2 } from '../render/dashboard-v2.js';
import { sampleDashboardV2Data } from '../render/dashboard-v2.sample-data.js';
import { buildSportsSnapshot } from '../sports/model.js';
import { publicResponse } from '../sports/live-refresh.js';
import { resolveBrowserPath } from './render-dashboard-v2-png.mjs';

const output=resolve(process.argv[2]||'preview/sports-live-refresh-review'),now=new Date('2026-08-15T16:00:00Z');
const before=buildSportsSnapshot([],{now});
const event=(organization,sport,league,opponent,extra={})=>({id:organization,organization,sport,league,state:'scheduled',startTime:'2026-08-15T23:05:00.000Z',opponent,opponentAbbreviation:opponent,homeAway:'home',teamScore:0,opponentScore:0,...extra});
const slot=(organization,label,eventValue,extra={})=>({organization,label,logo:organization,affinity:1,event:eventValue,presentationState:'upcoming',score:300,reasonCodes:['STATE_UPCOMING'],dataDelayed:false,feedFailures:[],lastResult:null,record:null,records:null,conference:null,standing:null,...extra});
const after=publicResponse({version:1,generatedAt:now.toISOString(),nextPollSeconds:300,slots:[
  slot('nationals','Nationals',event('nationals','baseball','mlb','PHI'),{lastResult:{id:'last',organization:'nationals',sport:'baseball',league:'mlb',state:'final',startTime:'2026-08-14T23:05:00.000Z',completedAt:'2026-08-14T23:05:00.000Z',opponent:'NYM',opponentAbbreviation:'NYM',homeAway:'away',teamScore:5,opponentScore:2,result:'W'},record:'60-64',records:{overall:'60-64',conference:null,regularSeason:'60-64',preseason:null},standing:'4th NL East'}),
  slot('commanders','Commanders',event('commanders','football','nfl','CIN',{seasonType:'Preseason'}),{record:'1-0',records:{overall:'1-0',conference:null,regularSeason:'0-0',preseason:'1-0'}}),
  slot('wm','W&M',event('wm','football','college-football','RICH'),{record:'1-0',records:{overall:'1-0',conference:'0-0',regularSeason:null,preseason:null},conference:'CAA',standing:'2nd CAA'}),
  slot('tennessee','Tennessee',event('tennessee','football','college-football','SYR',{rank:12}),{record:'2-0',records:{overall:'2-0',conference:'1-0',regularSeason:null,preseason:null},conference:'SEC',standing:'T-2nd SEC'})
]});
await mkdir(output,{recursive:true});const htmlPath=resolve(output,'client-refresh.html');await writeFile(htmlPath,renderDashboardV2({...sampleDashboardV2Data,now,today:now,sportsSnapshot:before,sportsFeedUrl:'https://sports.invalid'}),'utf8');
const browser=await chromium.launch({headless:true,executablePath:resolveBrowserPath(),args:['--no-sandbox']});
try{const page=await browser.newPage({viewport:{width:2560,height:1440},deviceScaleFactor:1});await page.goto(pathToFileURL(htmlPath).href);await page.evaluate(()=>document.fonts.ready);const measure=()=>page.evaluate(()=>{const rect=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height}};const ticker=document.querySelector('.sports-ticker'),slots=[...document.querySelectorAll('.ticker-slot')];return{viewport:[innerWidth,innerHeight],ticker:rect(ticker),slotRects:slots.map(rect),copy:slots.map(n=>[n.querySelector('b').textContent,n.querySelector('span').textContent]),overflow:slots.map(n=>[n.querySelector('b'),n.querySelector('span'),n.querySelector('small')].some(e=>e.scrollWidth>e.clientWidth))}});const beforeMetrics=await measure();await page.screenshot({path:resolve(output,'before.png')});const accepted=await page.evaluate(value=>window.updateSportsTicker(value),after);const afterMetrics=await measure();await page.screenshot({path:resolve(output,'after.png')});const invalid=structuredClone(after);invalid.schemaVersion=2;const invalidAccepted=await page.evaluate(value=>window.updateSportsTicker(value),invalid);const invalidMetrics=await measure();await writeFile(resolve(output,'validation.json'),JSON.stringify({accepted,invalidAccepted,before:beforeMetrics,after:afterMetrics,invalid:invalidMetrics},null,2));}finally{await browser.close()}
console.log(output);
