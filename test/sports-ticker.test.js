import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSportsSnapshot, eventRelevance, normalizeState, selectSportsSlots, validateSportsSnapshot } from '../sports/model.js';
import { normalizeEspnEvent, normalizeEspnStanding } from '../sports/providers/espn.js';
import { normalizeMlbGame } from '../sports/providers/mlb.js';
const NOW = new Date('2026-08-14T16:00:00Z');
const event = (organization, sport, state, hours, extra={}) => ({ id: organization+sport+state+hours, organization, sport, league:'test', state, startTime:new Date(+NOW+hours*3600000).toISOString(), opponent:'Very Long Opponent University Name', opponentAbbreviation:'OPP', homeAway:'home', teamScore:3, opponentScore:2, ...extra });
const feed = (id, organization, sport, events=[], error=false, extra={}) => ({ id, organization, sport, fetchedAt:NOW.toISOString(), events, error, ...extra });
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
import { renderDashboardV2, sportsDisplayDashes, sportsMetadataCopy } from '../render/dashboard-v2.js';
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
test('basketball year rollover uses ending year',async()=>{const urls=[];await fetchEspnFeed({id:'x',organization:'wm',sport:'basketball',league:'mens-college-basketball',teamId:'2729'},{now:new Date('2026-08-14'),fetchImpl:async url=>{urls.push(url);return{ok:true,json:async()=>({events:[]})}}});assert.ok(urls.every(url=>url.includes('season=2027')||url.includes('/seasons/2027/')))});
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

test('slot persists the latest final while selecting the next game',()=>{
  const past=event('tennessee','football','final',-48,{id:'past',result:'W',teamScore:31,opponentScore:17,record:'1-0',standing:'1st SEC East'});
  const next=event('tennessee','football','scheduled',48,{id:'next',record:'1-0',standing:'1st SEC East'});
  const slot=selectSportsSlots([feed('tf','tennessee','football',[past,next])],{now:NOW}).find(s=>s.organization==='tennessee');
  assert.equal(slot.event.id,'next');assert.equal(slot.lastResult.id,'past');assert.equal(slot.record,'1-0');assert.equal(slot.standing,'1st SEC East');
});
test('failed refresh retains only the previous credible result summary',()=>{
  const previous=buildSportsSnapshot([feed('tf','tennessee','football',[event('tennessee','football','final',-2,{result:'W',record:'2-0',standing:'2nd SEC'})])],{now:NOW});
  const next=buildSportsSnapshot([feed('tf','tennessee','football',[],true)],{now:new Date(+NOW+60000),previous});
  const slot=next.slots.find(s=>s.organization==='tennessee');assert.equal(slot.event,null);assert.equal(slot.lastResult.result,'W');assert.equal(slot.record,'2-0');assert.equal(slot.standing,'2nd SEC');
});
test('snapshot validation rejects malformed persisted summaries',()=>{
  const snapshot=buildSportsSnapshot([],{now:NOW});snapshot.slots[0].lastResult={state:'live',result:'W',teamScore:1,opponentScore:0};assert.equal(validateSportsSnapshot(snapshot),false);
});
test('ESPN normalization preserves provider overall and conference records',()=>{
  const raw=espnRaw(1,'2026-09-01T23:00:00Z','pre','Regular Season',[0,0]);raw.competitions[0].competitors[0].records=[{type:'total',summary:'3-1'},{type:'vsconf',summary:'2-0'}];
  const out=normalizeEspnEvent(raw,{id:'x',organization:'wm',sport:'football',league:'college-football',teamId:'2729'});assert.equal(out.record,'3-1');assert.equal(out.records.conference,'2-0');
});
test('MLB standings normalize record and division rank onto feed and events',async()=>{
  const out=await fetchMlbFeed({id:'n',organization:'nationals',teamId:'120'},{now:NOW,fetchImpl:async url=>url.includes('/standings')?{ok:true,json:async()=>({records:[{division:{nameShort:'NL East'},teamRecords:[{team:{id:120},wins:62,losses:59,divisionRank:'3'}]}]})}:{ok:true,json:async()=>({dates:[{games:[mlbGame(1,'2026-08-15T23:00:00Z')]}]})}});
  assert.equal(out.record,'62-59');assert.equal(out.standing,'3rd NL East');assert.equal(out.events[0].standing,'3rd NL East');
});
test('renderer exposes persisted result, record and standing when no current event exists',()=>{
  const base=buildSportsSnapshot([],{now:NOW});const slot=base.slots.find(s=>s.organization==='nationals');slot.lastResult=event('nationals','baseball','final',-30,{result:'W',teamScore:5,opponentScore:2});slot.record='62-59';slot.standing='3rd NL East';
  const html=renderDashboardV2({...sampleDashboardV2Data,now:NOW,today:NOW,sportsSnapshot:base});assert.match(html,/Nationals W 5–2/);assert.match(html,/62–59 · 3rd NL East/);
});

const collegeMetadata = ({ overall=null, conferenceRecord=null, standing=null, conference='CAA' }={}) => sportsMetadataCopy({
  conference, standing, record:overall, records:{overall,conference:conferenceRecord,regularSeason:null,preseason:null},
  event:{league:'college-football',seasonType:'Regular Season'},
});
test('zero-game college metadata uses only the conference short name',()=>assert.equal(collegeMetadata({overall:'0-0',conferenceRecord:'0-0'}),'CAA'));
test('nonconference-only college record omits the zero conference record',()=>assert.equal(collegeMetadata({overall:'3-1',conferenceRecord:'0-0'}),'3–1 · CAA'));
test('active college conference record includes its trustworthy position',()=>assert.equal(collegeMetadata({overall:'6-2',conferenceRecord:'4-1',standing:'2nd CAA'}),'6–2 (4–1) · 2nd CAA'));
test('active college conference record works without a position',()=>assert.equal(collegeMetadata({overall:'6-2',conferenceRecord:'4-1'}),'6–2 (4–1) · CAA'));
test('explicit college position is suppressed before conference play',()=>assert.equal(collegeMetadata({overall:'1-0',conferenceRecord:'0-0',standing:'2nd CAA'}),'1–0 · CAA'));
test('tied college conference position uses an en dash',()=>assert.equal(collegeMetadata({overall:'8-1',conferenceRecord:'5-1',standing:'T-1st SEC',conference:'SEC'}),'8–1 (5–1) · T–1st SEC'));
test('sports display copy consistently converts records scores and tied positions to en dashes',()=>{
  assert.equal(sportsDisplayDashes('Preseason 1-0 · 60-64 · T-2nd · W 20-7 · L 1-4'),'Preseason 1–0 · 60–64 · T–2nd · W 20–7 · L 1–4');
});

test('MLB result persists beyond the six-hour promotion window',()=>{
  const slot=selectSportsSlots([feed('n','nationals','baseball',[event('nationals','baseball','final',-24,{result:'W'})])],{now:NOW}).find(s=>s.organization==='nationals');
  assert.equal(slot.event,null);assert.equal(slot.lastResult.result,'W');assert.equal(slot.score,0);
});
test('MLB persisted result is replaced when the next game becomes live',()=>{
  const previous=event('nationals','baseball','final',-24,{id:'old',result:'W'}),live=event('nationals','baseball','live',0,{id:'new'});
  const slot=selectSportsSlots([feed('n','nationals','baseball',[previous,live])],{now:NOW}).find(s=>s.organization==='nationals');assert.equal(slot.event.id,'new');assert.equal(slot.lastResult,null);
});
test('MLB persisted result expires at forty-eight hours',()=>{
  const inside=selectSportsSlots([feed('n','nationals','baseball',[event('nationals','baseball','final',-47,{result:'W'})])],{now:NOW}).find(s=>s.organization==='nationals');
  const outside=selectSportsSlots([feed('n','nationals','baseball',[event('nationals','baseball','final',-49,{result:'W'})])],{now:NOW}).find(s=>s.organization==='nationals');assert.ok(inside.lastResult);assert.equal(outside.lastResult,null);
});
test('basketball result persists for four days and then expires',()=>{
  const inside=selectSportsSlots([feed('b','wm','basketball',[event('wm','basketball','final',-95,{result:'W'})])],{now:NOW}).find(s=>s.organization==='wm');
  const outside=selectSportsSlots([feed('b','wm','basketball',[event('wm','basketball','final',-97,{result:'W'})])],{now:NOW}).find(s=>s.organization==='wm');assert.ok(inside.lastResult);assert.equal(outside.lastResult,null);
});
test('football result persists for seven days and then expires',()=>{
  const inside=selectSportsSlots([feed('f','wm','football',[event('wm','football','final',-(7*24-1),{result:'W'})])],{now:NOW}).find(s=>s.organization==='wm');
  const outside=selectSportsSlots([feed('f','wm','football',[event('wm','football','final',-(7*24+1),{result:'W'})])],{now:NOW}).find(s=>s.organization==='wm');assert.ok(inside.lastResult);assert.equal(outside.lastResult,null);
});
test('MLB doubleheader transitions from game-one final to game-two live',()=>{
  const first=event('nationals','baseball','final',-2,{id:'game-1',result:'W'}),second=event('nationals','baseball','scheduled',2,{id:'game-2'});
  let slot=selectSportsSlots([feed('n','nationals','baseball',[first,second])],{now:NOW}).find(s=>s.organization==='nationals');assert.equal(slot.lastResult.id,'game-1');
  second.state='live';slot=selectSportsSlots([feed('n','nationals','baseball',[first,second])],{now:NOW}).find(s=>s.organization==='nationals');assert.equal(slot.event.id,'game-2');assert.equal(slot.lastResult,null);
});
test('delayed postponed suspended and cancelled events take precedence over a persisted final',()=>{
  for(const state of ['delayed','postponed','suspended','cancelled']){const prior=event('nationals','baseball','final',-2,{id:'prior',result:'W'}),current=event('nationals','baseball',state,0,{id:state});const slot=selectSportsSlots([feed('n','nationals','baseball',[prior,current])],{now:NOW}).find(s=>s.organization==='nationals');assert.equal(slot.event.id,state,state)}
});
test('result persistence does not affect organizational slot promotion',()=>{
  const slots=selectSportsSlots([feed('n','nationals','baseball',[event('nationals','baseball','final',-24,{result:'W'})]),feed('f','wm','football',[event('wm','football','scheduled',24)])],{now:NOW});assert.equal(slots[0].organization,'wm');assert.equal(slots.find(s=>s.organization==='nationals').score,0);
});
test('NFL keeps regular-season and preseason records distinct',async()=>{
  const make=(seasonType,summary)=>{const raw=espnRaw(seasonType==='Preseason'?1:2,'2026-09-01T23:00:00Z','pre',seasonType);raw.competitions[0].competitors[0].team.id='28';raw.competitions[0].competitors[0].records=[{type:'total',summary}];return raw};
  const out=await fetchEspnFeed({id:'c',organization:'commanders',sport:'football',league:'nfl',teamId:'wsh',numericTeamId:'28'},{now:NOW,fetchImpl:async url=>({ok:true,json:async()=>url.includes('/standings')?{children:[]}:url.includes('seasontype=1')?{events:[make('Preseason','2-1')]}:url.includes('seasontype=2')?{events:[make('Regular Season','9-8')]}:{events:[]}})});assert.equal(out.records.preseason,'2-1');assert.equal(out.records.regularSeason,'9-8');
});
test('college overall and conference records remain distinct',()=>{const raw=espnRaw(1,'2026-09-01T23:00:00Z');raw.competitions[0].competitors[0].records=[{type:'total',summary:'8-3'},{type:'vsconf',summary:'5-2'}];const out=normalizeEspnEvent(raw,{id:'w',organization:'wm',sport:'football',league:'college-football',teamId:'2729'});assert.deepEqual([out.records.overall,out.records.conference],['8-3','5-2'])});
test('college conference position comes only from a standings rank field',()=>{const raw={children:[{name:'CAA',standings:{entries:[{team:{id:'2729'},stats:[{name:'rank',value:2}]}]}}]};assert.equal(normalizeEspnStanding(raw,'2729'),'2nd CAA')});
test('tied conference position is retained only when the source marks the rank tied',()=>{const raw={children:[{name:'CAA',standings:{entries:[{team:{id:'2729'},stats:[{name:'rank',value:2,isTied:true}]}]}}]};assert.equal(normalizeEspnStanding(raw,'2729'),'T-2nd CAA')});
test('W&M football and basketball metadata switch with the selected feed',()=>{
  const football=feed('wf','wm','football',[event('wm','football','scheduled',48,{records:{overall:'1-0',conference:'0-0'}})],false,{records:{overall:'1-0',conference:'0-0'},standing:'3rd CAA'}),basketball=feed('wb','wm','basketball',[event('wm','basketball','live',0,{records:{overall:'10-2',conference:'2-0'}})],false,{records:{overall:'10-2',conference:'2-0'},standing:'1st CAA'});
  const slot=selectSportsSlots([football,basketball],{now:NOW}).find(s=>s.organization==='wm');assert.equal(slot.event.sport,'basketball');assert.equal(slot.records.overall,'10-2');assert.equal(slot.standing,'1st CAA');
});
test('stale standings are dropped independently of fresh event and record data',()=>{
  const staleAt=new Date(+NOW-25*3600000).toISOString(),slot=selectSportsSlots([feed('wf','wm','football',[event('wm','football','scheduled',24)],false,{record:'1-0',records:{overall:'1-0'},standing:'2nd CAA',standingsFetchedAt:staleAt})],{now:NOW}).find(s=>s.organization==='wm');assert.ok(slot.event);assert.equal(slot.record,'1-0');assert.equal(slot.standing,null);
});
test('browser and server snapshot validators agree on persisted summary requirements',()=>{
  const snapshot=buildSportsSnapshot([],{now:NOW});assert.equal(validateSportsSnapshot(snapshot),true);snapshot.slots[0].records={overall:7};assert.equal(validateSportsSnapshot(snapshot),false);
  const html=renderDashboardV2({...sampleDashboardV2Data,sportsSnapshot:buildSportsSnapshot([],{now:NOW})});assert.match(html,/records\(x\.records\)/);assert.match(html,/result\(x\.lastResult\)/);
});
