import { resolve } from 'node:path';
import { sampleDashboardV2Data } from '../render/dashboard-v2.sample-data.js';
import { buildSportsSnapshot } from '../sports/model.js';
import { renderDashboardV2Png } from './render-dashboard-v2-png.mjs';
const now=new Date('2026-09-12T17:00:00Z'), at=h=>new Date(+now+h*3600000).toISOString();
const game=(id,organization,sport,state,h,extra={})=>({id,organization,sport,league:'fixture',state,startTime:at(h),opponent:'Long Opponent University Name',opponentAbbreviation:'OPP',homeAway:'home',teamScore:4,opponentScore:2,statusText:state==='live'?'3rd Quarter':'',clock:state==='live'?'6:42':null,...extra});
const feed=(id,organization,sport,events=[],error=false)=>({id,organization,sport,fetchedAt:now.toISOString(),events,error});
const base=[feed('wf','wm','football'),feed('wb','wm','basketball'),feed('tf','tennessee','football'),feed('cf','commanders','football'),feed('nb','nationals','baseball')];
const snapshots={
  'mixed-upcoming':buildSportsSnapshot(base.map((f,i)=>({...f,events:i===0?[game('a','wm','football','scheduled',48)]:i===2?[game('b','tennessee','football','scheduled',72,{rank:12})]:i===3?[game('c','commanders','football','scheduled',96)]:i===4?[game('d','nationals','baseball','scheduled',24)]:[]})),{now}),
  'live-nationals':buildSportsSnapshot(base.map((f,i)=>({...f,events:i===4?[game('d','nationals','baseball','live',0)]:i===0?[game('a','wm','football','scheduled',48)]:[]})),{now}),
  'live-wm-basketball':buildSportsSnapshot(base.map((f,i)=>({...f,events:i===1?[game('e','wm','basketball','live',0)]:i===0?[game('a','wm','football','scheduled',48)]:[]})),{now}),
  'recent-football-final':buildSportsSnapshot(base.map((f,i)=>({...f,events:i===0?[game('a','wm','football','final',-2,{result:'W',record:'2-0'})]:[]})),{now}),
  'partial-provider-failure':buildSportsSnapshot(base.map((f,i)=>({...f,error:i===2,events:i===2?[]:i===3?[game('c','commanders','football','scheduled',96)]:[]})),{now}),
  'full-offseason':buildSportsSnapshot(base,{now}),
};
for(const [name,sportsSnapshot] of Object.entries(snapshots)){
  const result=await renderDashboardV2Png({data:{...sampleDashboardV2Data,today:now,now,paletteMode:'day',sportsSnapshot},outputPath:resolve('preview/sports-ticker',name+'.png'),htmlPath:resolve('preview/sports-ticker',name+'.html')});
  console.log(`${name}: ${result.width}x${result.height}`);
}
