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
