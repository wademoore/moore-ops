import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSportsSnapshot, eventRelevance, normalizeState, selectSportsSlots, validateSportsSnapshot } from '../sports/model.js';
import { normalizeEspnEvent } from '../sports/providers/espn.js';
import { normalizeMlbGame } from '../sports/providers/mlb.js';
const NOW = new Date('2026-08-14T16:00:00Z');
const event = (organization, sport, state, hours, extra={}) => ({ id: organization+sport+state+hours, organization, sport, league:'test', state, startTime:new Date(+NOW+hours*3600000).toISOString(), opponent:'Very Long Opponent University Name', opponentAbbreviation:'OPP', homeAway:'home', teamScore:3, opponentScore:2, ...extra });
const feed = (id, organization, sport, events=[], error=false) => ({ id, organization, sport, fetchedAt:NOW.toISOString(), events, error });
test('normalizes every provider state distinctly',()=>{
  assert.deepEqual(['cancelled','postponed','suspended','delayed','final','live','scheduled'],[
    normalizeState({description:'Canceled'}),normalizeState({description:'Postponed'}),normalizeState({description:'Suspended'}),normalizeState({description:'Delayed'}),normalizeState({completed:true}),normalizeState({state:'in'}),normalizeState({state:'pre'})]);
});
test('approved recent and upcoming windows expire deterministically',()=>{
  assert.equal(eventRelevance(event('nationals','baseball','final',-5),NOW).relevant,true);
  assert.equal(eventRelevance(event('nationals','baseball','final',-7),NOW).relevant,false);
  assert.equal(eventRelevance(event('wm','basketball','scheduled',71),NOW).relevant,true);
  assert.equal(eventRelevance(event('wm','basketball','scheduled',73),NOW).relevant,false);
  assert.equal(eventRelevance(event('wm','football','scheduled',7*24-1),NOW).relevant,true);
});
test('opener requires a sourced date inside 21 days',()=>{
  assert.equal(eventRelevance(event('wm','football','scheduled',20*24,{isSeasonOpener:true}),NOW).relevant,true);
  assert.equal(eventRelevance(event('wm','football','scheduled',22*24,{isSeasonOpener:true}),NOW).relevant,false);
});
test('five feeds become four organizational slots and W&M sports compete',()=>{
  const slots=selectSportsSlots([feed('wf','wm','football',[event('wm','football','scheduled',120)]),feed('wb','wm','basketball',[event('wm','basketball','live',0)]),feed('tf','tennessee','football',[]),feed('cf','commanders','football',[]),feed('nb','nationals','baseball',[])] ,{now:NOW});
  assert.equal(slots.length,4);assert.equal(slots[0].organization,'wm');assert.equal(slots[0].event.sport,'basketball');
});
test('live Nationals temporarily lead while remaining organizations keep affinity order',()=>{
  const slots=selectSportsSlots([feed('wf','wm','football',[event('wm','football','scheduled',48)]),feed('wb','wm','basketball',[]),feed('tf','tennessee','football',[]),feed('cf','commanders','football',[]),feed('nb','nationals','baseball',[event('nationals','baseball','live',0)])],{now:NOW});
  assert.deepEqual(slots.map(s=>s.organization),['nationals','wm','tennessee','commanders']);
});
test('placement lock prevents ordinary reshuffle but never blocks live',()=>{
  const previous={generatedAt:new Date(+NOW-5*60000).toISOString(),slots:[{organization:'wm'}]};
  const feeds=[feed('wf','wm','football',[event('wm','football','scheduled',49)]),feed('tf','tennessee','football',[event('tennessee','football','scheduled',48)]),feed('cf','commanders','football',[]),feed('nb','nationals','baseball',[])];
  assert.equal(selectSportsSlots(feeds,{now:NOW,previous})[0].organization,'wm');
  feeds[3].events=[event('nationals','baseball','live',0)];assert.equal(selectSportsSlots(feeds,{now:NOW,previous})[0].organization,'nationals');
});
test('partial and complete failure degrade independently',()=>{
  const snapshot=buildSportsSnapshot([feed('wf','wm','football',[],true),feed('wb','wm','basketball',[]),feed('tf','tennessee','football',[],true),feed('cf','commanders','football',[]),feed('nb','nationals','baseball',[])],{now:NOW});
  assert.equal(snapshot.slots.find(s=>s.organization==='wm').presentationState,'offseason');
  assert.equal(snapshot.slots.find(s=>s.organization==='tennessee').presentationState,'unavailable');
});
test('fresh/stale snapshots never label stale events live',()=>{
  const stale=feed('nb','nationals','baseball',[event('nationals','baseball','scheduled',2)]);stale.fetchedAt=new Date(+NOW-20*60000).toISOString();
  const slot=selectSportsSlots([stale],{now:NOW}).find(s=>s.organization==='nationals');assert.equal(slot.dataDelayed,true);
  stale.events=[event('nationals','baseball','live',0)];assert.equal(selectSportsSlots([stale],{now:NOW}).find(s=>s.organization==='nationals').dataDelayed,false);
});
test('snapshot schema rejects external logo references',()=>{
  const good=buildSportsSnapshot([],{now:NOW});assert.equal(validateSportsSnapshot(good),true);good.slots[0].logo='https://example.com/logo.png';assert.equal(validateSportsSnapshot(good),false);
});
test('ESPN fixture normalizes score, record, rank and status',()=>{
  const raw={id:'1',date:'2026-09-05T19:30:00Z',seasonType:{name:'Regular Season'},competitions:[{competitors:[{team:{id:'2633'},homeAway:'home',score:'21',records:[{type:'total',summary:'1-0'}],curatedRank:{current:12}},{team:{id:'9',shortDisplayName:'Furman',abbreviation:'FUR'},homeAway:'away',score:'7'}],status:{period:4,displayClock:'0:00',type:{state:'post',completed:true,description:'Final'}}}]};
  const out=normalizeEspnEvent(raw,{id:'tf',organization:'tennessee',sport:'football',league:'college-football',teamId:'2633'});assert.equal(out.state,'final');assert.equal(out.result,'W');assert.equal(out.record,'1-0');assert.equal(out.rank,12);
});
test('MLB fixture normalizes postponed and home/away',()=>{
  const raw={gamePk:1,gameDate:'2026-08-15T23:05:00Z',gameType:'R',status:{detailedState:'Postponed'},teams:{home:{team:{id:120},score:0},away:{team:{id:121,name:'Opponent',abbreviation:'OPP'},score:0}}};
  const out=normalizeMlbGame(raw,{id:'nb',organization:'nationals',teamId:'120'});assert.equal(out.state,'postponed');assert.equal(out.homeAway,'home');
});

import { fetchEspnFeed } from '../sports/providers/espn.js';
import { fetchMlbFeed } from '../sports/providers/mlb.js';
import { formatSportsEventWhen } from '../sports/model.js';
import { renderDashboardV2 } from '../render/dashboard-v2.js';
import { sampleDashboardV2Data } from '../render/dashboard-v2.sample-data.js';

const mlbGame=(id,date,status='Scheduled',homeScore=0,awayScore=0,type='R')=>({gamePk:id,gameDate:date,gameType:type,status:{detailedState:status,abstractGameState:status==='Final'?'Final':status==='In Progress'?'Live':'Preview',abstractGameCode:status==='Final'?'F':'P'},teams:{home:{team:{id:120,name:'Nationals',abbreviation:'WSH'},score:homeScore},away:{team:{id:121,name:'Long Opponent Name',abbreviation:'OPP'},score:awayScore}},linescore:{currentInning:7,inningState:'Top'}});
const espnRaw=(id,date,state='pre',season='Regular Season',scores=[0,0],extra={})=>({id:String(id),date,seasonType:{name:season},unexpected:'ignored',competitions:[{competitors:[{team:{id:'2729'},homeAway:'home',score:String(scores[0])},{team:{id:'9',shortDisplayName:'Opponent',abbreviation:'OPP'},homeAway:'away',score:String(scores[1])}],status:{type:{state,completed:state==='post',description:state==='post'?'Final':state==='in'?'In Progress':'Scheduled'}},...extra}]});

for (const [name,status,expected] of [['MLB scheduled today','Scheduled','scheduled'],['MLB live','In Progress','live'],['MLB final','Final','final'],['MLB delayed','Delayed','delayed'],['MLB postponed','Postponed','postponed'],['MLB suspended','Suspended','suspended'],['MLB cancelled','Cancelled','cancelled']]) test(name,()=>assert.equal(normalizeMlbGame(mlbGame(1,'2026-08-14T23:00:00Z',status),{id:'n',organization:'nationals',teamId:'120'}).state,expected));
test('MLB tie-safe handling',()=>assert.equal(normalizeMlbGame(mlbGame(1,'2026-08-14T23:00:00Z','Final',4,4),{id:'n',organization:'nationals',teamId:'120'}).result,'T'));
test('MLB postseason label',()=>assert.equal(normalizeMlbGame(mlbGame(1,'2026-10-10T23:00:00Z','Scheduled',0,0,'P'),{id:'n',organization:'nationals',teamId:'120'}).seasonType,'Postseason'));
test('Eastern/UTC date boundary formatter',()=>assert.equal(formatSportsEventWhen('2026-08-15T02:00:00Z','2026-08-14T12:00:00Z'),'Today · 10:00 PM'));
test('today tomorrow and later labels are unambiguous',()=>{assert.equal(formatSportsEventWhen('2026-08-14T23:00:00Z',NOW),'Today · 7:00 PM');assert.equal(formatSportsEventWhen('2026-08-15T22:00:00Z',NOW),'Tomorrow · 6:00 PM');assert.equal(formatSportsEventWhen('2026-08-28T22:00:00Z',NOW,{opener:true}),'Opener Aug 28 · 6:00 PM')});
test('known distant opener remains factual but scores zero',()=>{const slots=selectSportsSlots([feed('tf','tennessee','football',[event('tennessee','football','scheduled',22*24)])],{now:NOW});const s=slots.find(x=>x.organization==='tennessee');assert.equal(s.presentationState,'distant-opener');assert.equal(s.score,0);assert.ok(s.event)});
test('distant opener cannot displace relevant feed',()=>{const slots=selectSportsSlots([feed('tf','tennessee','football',[event('tennessee','football','scheduled',22*24)]),feed('cf','commanders','football',[event('commanders','football','scheduled',24)])],{now:NOW});assert.equal(slots[0].organization,'commanders')});
test('W&M wins comparable states through affinity',()=>{const slots=selectSportsSlots([feed('wf','wm','football',[event('wm','football','scheduled',24)]),feed('tf','tennessee','football',[event('tennessee','football','scheduled',24)])],{now:NOW});assert.equal(slots[0].organization,'wm')});
test('relevant Tennessee can lead idle W&M',()=>{const slots=selectSportsSlots([feed('wf','wm','football',[]),feed('tf','tennessee','football',[event('tennessee','football','scheduled',24)])],{now:NOW});assert.equal(slots[0].organization,'tennessee')});
test('relevant Commanders can lead idle W&M',()=>{const slots=selectSportsSlots([feed('wf','wm','football',[]),feed('cf','commanders','football',[event('commanders','football','scheduled',24)])],{now:NOW});assert.equal(slots[0].organization,'commanders')});
test('basketball final expires after twelve hours',()=>{assert.equal(eventRelevance(event('wm','basketball','final',-11),NOW).relevant,true);assert.equal(eventRelevance(event('wm','basketball','final',-13),NOW).relevant,false)});
test('football final follows following-morning ceiling',()=>{const e=event('wm','football','final',-8);assert.equal(eventRelevance(e,NOW).relevant,true);assert.equal(eventRelevance(e,new Date('2026-08-15T15:00:00Z')).relevant,false)});
test('identical inputs produce identical slots and reason codes',()=>{const f=[feed('wf','wm','football',[event('wm','football','scheduled',24)])];assert.deepEqual(selectSportsSlots(f,{now:NOW}),selectSportsSlots(f,{now:NOW}))});
test('adaptive polling recommendations are bounded',()=>{assert.equal(buildSportsSnapshot([feed('n','nationals','baseball',[event('nationals','baseball','live',0)])],{now:NOW}).nextPollSeconds,120);assert.equal(buildSportsSnapshot([],{now:NOW}).nextPollSeconds,7200)});

for(const [name,sport,league,season,state] of [['ESPN college-football scheduled','football','college-football','Regular Season','pre'],['ESPN college-football live','football','college-football','Regular Season','in'],['ESPN college-football final','football','college-football','Regular Season','post'],["ESPN men's-basketball scheduled",'basketball','mens-college-basketball','Regular Season','pre'],["ESPN men's-basketball live",'basketball','mens-college-basketball','Regular Season','in'],["ESPN men's-basketball final",'basketball','mens-college-basketball','Regular Season','post'],['ESPN NFL preseason','football','nfl','Preseason','pre'],['ESPN NFL regular season','football','nfl','Regular Season','pre'],['ESPN NFL postseason','football','nfl','Postseason','pre']]) test(name,()=>{const out=normalizeEspnEvent(espnRaw(1,'2026-09-01T23:00:00Z',state,season),{id:'x',organization:'wm',sport,league,teamId:'2729'});assert.equal(out.state,state==='pre'?'scheduled':state==='in'?'live':'final');assert.equal(out.seasonType,season)});
test('provider fields unexpectedly added are ignored',()=>assert.equal(normalizeEspnEvent(espnRaw(1,'2026-09-01T23:00:00Z'),{id:'x',organization:'wm',sport:'football',league:'college-football',teamId:'2729'}).unexpected,undefined));
test('provider required fields missing fail closed',()=>assert.throws(()=>normalizeEspnEvent({id:'1',date:'2026-09-01T00:00:00Z'},{id:'x',teamId:'2729'}),/schema/));
test('ESPN non-200 response rejects',async()=>await assert.rejects(fetchEspnFeed({id:'x',organization:'wm',sport:'football',league:'college-football',teamId:'2729'},{fetchImpl:async()=>({ok:false,status:503})}),/503/));
test('ESPN malformed JSON rejects',async()=>await assert.rejects(fetchEspnFeed({id:'x',organization:'wm',sport:'football',league:'college-football',teamId:'2729'},{fetchImpl:async()=>({ok:true,json:async()=>{throw new SyntaxError('bad json')}})}),/bad json/));
test('ESPN timeout aborts',async()=>await assert.rejects(fetchEspnFeed({id:'x',organization:'wm',sport:'football',league:'college-football',teamId:'2729'},{timeoutMs:5,fetchImpl:async(_u,{signal})=>new Promise((_r,reject)=>signal.addEventListener('abort',()=>reject(new Error('aborted'))))}),/aborted/));
test('basketball year rollover uses ending year',async()=>{const urls=[];await fetchEspnFeed({id:'x',organization:'wm',sport:'basketball',league:'mens-college-basketball',teamId:'2729'},{now:new Date('2026-08-14'),fetchImpl:async url=>{urls.push(url);return{ok:true,json:async()=>({events:[]})}}});assert.ok(urls.every(url=>url.includes('season=2027')))});
test('MLB non-200 response rejects',async()=>await assert.rejects(fetchMlbFeed({id:'n',organization:'nationals',teamId:'120'},{fetchImpl:async()=>({ok:false,status:500})}),/500/));
test('MLB malformed JSON rejects',async()=>await assert.rejects(fetchMlbFeed({id:'n',organization:'nationals',teamId:'120'},{fetchImpl:async()=>({ok:true,json:async()=>{throw new SyntaxError('bad mlb')}})}),/bad mlb/));
test('MLB partial standings failure preserves schedule',async()=>{const out=await fetchMlbFeed({id:'n',organization:'nationals',teamId:'120'},{now:NOW,fetchImpl:async url=>url.includes('/standings')?{ok:false,status:503}:{ok:true,json:async()=>({dates:[{games:[mlbGame(1,'2026-08-14T23:00:00Z')]}]})}});assert.equal(out.events.length,1);assert.equal(out.events[0].record,null)});
test('MLB most-recent final and next sorting is deterministic',async()=>{const games=[mlbGame(3,'2026-08-16T23:00:00Z'),mlbGame(1,'2026-08-13T23:00:00Z','Final',3,1),mlbGame(2,'2026-08-14T23:00:00Z','Final',4,1)];const out=await fetchMlbFeed({id:'n',organization:'nationals',teamId:'120'},{now:NOW,fetchImpl:async url=>url.includes('/standings')?{ok:true,json:async()=>({records:[]})}:{ok:true,json:async()=>({dates:[{games}]})}});assert.deepEqual(out.events.map(e=>e.id),['1','2','3'])});
test('doubleheader current and next selection remains time ordered',()=>{const slots=selectSportsSlots([feed('n','nationals','baseball',[event('nationals','baseball','live',0,{id:'live'}),event('nationals','baseball','scheduled',3,{id:'next'})])],{now:NOW});assert.equal(slots[0].event.id,'live')});

test('renderer shows unambiguous opener, ranking, long opponent and no external images',()=>{const sportsSnapshot=buildSportsSnapshot([feed('wf','wm','football',[event('wm','football','scheduled',14*24,{rank:12,opponentAbbreviation:'',opponent:'Extremely Long Opponent University Name'})])],{now:NOW});const html=renderDashboardV2({...sampleDashboardV2Data,now:NOW,today:NOW,sportsSnapshot});assert.match(html,/Opener Aug 28 · 12:00 PM/);assert.match(html,/#12 W&amp;M/);assert.doesNotMatch(html,/https?:\/\/[^'"<]*\.(?:png|svg|jpg)/i)});
test('renderer includes every status copy without credentials or household sports data',()=>{for(const state of ['live','final','delayed','postponed','suspended','cancelled']){const snapshot={version:1,generatedAt:NOW.toISOString(),nextPollSeconds:300,slots:[{organization:'nationals',label:'Nationals',logo:'nationals',presentationState:state,event:event('nationals','baseball',state,0,{statusText:state})}]};const html=renderDashboardV2({...sampleDashboardV2Data,now:NOW,today:NOW,sportsSnapshot:snapshot});assert.match(html,new RegExp(state,'i'));assert.doesNotMatch(JSON.stringify(snapshot),/credential|token|calendar|dinner|school/i)}});
test('client refresh boundary validates, updates in place, clamps polling and preserves invalid data',()=>{const html=renderDashboardV2(sampleDashboardV2Data);assert.match(html,/window\.updateSportsTicker/);assert.match(html,/nodes\.length!==snapshot\.slots\.length/);assert.match(html,/Math\.max\(120,Math\.min\(7200/);assert.match(html,/if\(!validSports\(snapshot\)\)return false/)});
test('MLB timeout aborts',async()=>await assert.rejects(fetchMlbFeed({id:'n',organization:'nationals',teamId:'120'},{timeoutMs:5,fetchImpl:async(_u,{signal})=>new Promise((_r,reject)=>signal.addEventListener('abort',()=>reject(new Error('mlb aborted'))))}),/mlb aborted/));
test('expired cached event is removed from presentation',()=>{const old=feed('n','nationals','baseball',[event('nationals','baseball','scheduled',2)]);old.fetchedAt=new Date(+NOW-25*3600000).toISOString();const slot=selectSportsSlots([old],{now:NOW}).find(s=>s.organization==='nationals');assert.equal(slot.event,null);assert.equal(slot.dataDelayed,false)});
test('stale cached live event is never presented as live',()=>{const old=feed('n','nationals','baseball',[event('nationals','baseball','live',0)]);old.fetchedAt=new Date(+NOW-16*60000).toISOString();const slot=selectSportsSlots([old],{now:NOW}).find(s=>s.organization==='nationals');assert.equal(slot.event,null)});
test('dynamic ordering keeps each organization logo identity',()=>{const snapshot=buildSportsSnapshot([feed('wf','wm','football',[event('wm','football','scheduled',24)]),feed('n','nationals','baseball',[event('nationals','baseball','live',0)])],{now:NOW});assert.deepEqual(snapshot.slots.map(s=>[s.organization,s.logo]).slice(0,2),[['nationals','nationals'],['wm','wm']])});