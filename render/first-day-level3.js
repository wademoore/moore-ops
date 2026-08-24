import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ASSET_DIR = resolve(process.env.DASHBOARD_FIRST_DAY_ASSET_DIR || 'render/assets-first-day');
const asset = name => {
  try { return `data:image/png;base64,${readFileSync(resolve(ASSET_DIR, name)).toString('base64')}`; }
  catch { return ''; }
};
const esc = value => String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const dateKey = value => new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
const eventKey = event => event?.raw?.start?.date || (event?.raw?.start?.dateTime ? dateKey(event.raw.start.dateTime) : null);
const eventTime = event => event?.displayTime || (event?.raw?.start?.dateTime ? new Date(event.raw.start.dateTime).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',timeZone:'America/New_York'}) : 'All day');
const eventStamp = event => new Date(event?.raw?.start?.dateTime || `${eventKey(event)}T12:00:00`).getTime();
const clean = value => String(value || '').replace(/^[\p{Extended_Pictographic}\p{Emoji_Presentation}\uFE0F\u200D\s\u2022\u25CF]+/u,'').trim();
const person = event => { const text=`${event?.title||''} ${event?.subtitle||''} ${event?._calName||''}`.toLowerCase(); const m=/myles/.test(text),o=/ophelia/.test(text); return m&&o?'both':m?'myles':o?'ophelia':'family'; };
const todayEvents = data => (data.days?.[0]?.events || []).filter(event => event.cardType !== 'menu');

function milestones(data) {
  const key=dateKey(data.today);
  return [...todayEvents(data),...(data.upcomingEvents||[])].filter(event=>eventKey(event)===key&&event?._calName==='Family'&&clean(event.title)==='First Day of School (Myles and Ophelia)');
}

const hasFirstDayMilestone = data => milestones(data).length > 0;

function easternInstant(day, time) {
  const noon=new Date(`${day}T12:00:00Z`);
  const zone=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',timeZoneName:'longOffset'}).formatToParts(noon).find(part=>part.type==='timeZoneName')?.value||'GMT-05:00';
  const offset=zone.replace('GMT','');
  return new Date(`${day}T${time}:00${offset}`);
}

function timeline(data) {
  const day=dateKey(data.today);
  const configured=(value,fallback)=>/^\d{2}:\d{2}$/.test(value||'')?value:fallback;
  return {
    preparation:easternInstant(day,'07:00'),
    departure:easternInstant(day,configured(data.firstDayLevel3Departure,'07:30')),
    handoff:easternInstant(day,configured(data.firstDayLevel3Handoff,'07:45')),
    coda:easternInstant(day,configured(data.firstDayLevel3Coda,'16:00')),
    evening:easternInstant(day,'19:00'),
  };
}

function shouldRenderFirstDayLevel3(data) {
  if(data.firstDayLevel3===false)return false;
  const hits=milestones(data);
  if(!hits.length&&data.firstDayLevel3!==true)return false;
  if(data.firstDayLevel3ForceArtifact===true)return true;
  const now=new Date(data.now||Date.now()).getTime(),times=timeline(data);
  return now<times.handoff.getTime()||(now>=times.coda.getTime()&&now<times.evening.getTime());
}

function schedule(data) {
  const times=timeline(data),now=new Date(data.now||Date.now()).getTime();
  const make=(title,start,subtitle,displayTime)=>({title,subtitle,displayTime,cardType:'standard',_calName:'Myles + Ophelia',raw:{start:{dateTime:start.toISOString()}}});
  const preparation=make('School preparation',times.preparation,'Backpacks, water bottles, and first-day essentials');
  const departure=make('Leave for Stonehouse',times.departure,'Rec Connect drop-off');
  const arrival=make('Arrive at Rec Connect',times.handoff,'Stonehouse Elementary · by 7:45 AM');
  const welcome=make('Welcome home, Myles + Ophelia',times.coda,'Emma is here — tell her how your first day went','4:00 PM');
  const dinner=data.menuEvent?.title&&data.menuEvent.title!=='Not set'?{...data.menuEvent,title:clean(data.menuEvent.title),subtitle:data.menuEvent.subtitle||'First-day celebration dinner',displayTime:'Tonight',_calName:'Myles + Ophelia',cardType:'standard',raw:{start:{dateTime:times.coda.toISOString()}}}:null;
  const relevant=[...todayEvents(data),...(data.upcomingEvents||[])].filter(event=>event!==milestones(data)[0]&&eventStamp(event)>now&&!/prepar|depart|arriv|rec connect|stonehouse drop[ -]?off/i.test(`${event.title||''} ${event.subtitle||''}`)).sort((a,b)=>eventStamp(a)-eventStamp(b))[0]||null;
  if(now<times.departure.getTime())return {now:preparation,next:departure};
  if(now<times.handoff.getTime())return {now:departure,next:arrival};
  if(now>=times.coda.getTime()&&now<times.evening.getTime())return {now:welcome,next:dinner||relevant};
  return {now:null,next:null};
}

function selectComing(data) {
  const today=dateKey(data.today), seen=new Set();
  return (data.upcomingEvents||[]).filter(event=>event.cardType!=='menu'&&eventKey(event)>today).sort((a,b)=>eventStamp(a)-eventStamp(b)).filter(event=>{const id=`${eventKey(event)}|${clean(event.title).toLowerCase()}`;if(seen.has(id))return false;seen.add(id);return true}).slice(0,3);
}

function card(label,event,tone) {
  const slot=tone==='now'?'now':'next';
  if(!event)return `<section class="fd-card fd-${tone}" data-fd-slot="${slot}"><h2>${label}</h2><div class="fd-muted">Nothing else scheduled.</div></section>`;
  const owner=person(event),ownerLabel=owner==='myles'?'Myles':owner==='ophelia'?'Ophelia':owner==='both'?'Myles + Ophelia':'';
  return `${label==='NOW'?`<style>${COMPOSITION_CSS}</style>`:''}<section class="fd-card fd-${tone} person-${owner}" data-fd-slot="${slot}"><h2>${label}</h2><div class="fd-event"><time>${esc(eventTime(event))}</time><div><strong>${esc(clean(event.title))}</strong>${event.subtitle?`<span>${esc(clean(event.subtitle))}</span>`:''}</div></div>${ownerLabel?`<div class="fd-owner">${ownerLabel}</div>`:''}</section>`;
}

const CSS=`*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden}body{background:#f8efd8;color:#173f78;font-family:"Trebuchet MS",sans-serif}.first-day-dashboard{position:relative;width:100vw;height:100vh;overflow:hidden;background:#f8efd8 var(--paper) center/cover no-repeat}.fd-art{position:absolute;object-fit:contain;pointer-events:none}.fd-title{left:26.3%;top:3.8%;width:47.4%;height:33.5%}.fd-myles{left:4.3%;top:8.2%;width:18.8%;height:45.4%}.fd-ophelia{right:4.1%;top:10.4%;width:18.8%;height:43.4%}.fd-school{left:21.5%;top:34.3%;width:57%;height:21.5%}.fd-clock{position:absolute;right:2.8%;top:2.1%;display:flex;flex-direction:column;align-items:flex-end;text-shadow:0 1px #fff}.fd-clock time{font-family:Georgia,serif;font-size:clamp(25px,2.3vw,48px);font-weight:700;line-height:1}.fd-clock span{font-size:clamp(13px,1.05vw,22px);font-weight:700}.fd-grid{position:absolute;left:2.8%;right:2.8%;top:57.2%;bottom:2.5%;display:grid;grid-template-columns:1.08fr 1fr 1.08fr;grid-template-rows:1.42fr 1fr;gap:1.5% 1.7%}.fd-card{position:relative;min-width:0;min-height:0;padding:5.4% 5% 3%;background-position:center;background-size:100% 100%;background-repeat:no-repeat;display:flex;flex-direction:column;align-items:center;justify-content:center}.fd-card h2{position:absolute;top:4%;left:0;right:0;margin:0;text-align:center;font-size:clamp(21px,1.75vw,36px);font-weight:900;letter-spacing:.04em;line-height:1}.fd-now{grid-column:1/3;background-image:var(--red);color:#d82d2f;padding:8% 7% 4%}.fd-next{grid-column:3;background-image:var(--purple);color:#6c3595;padding-top:14%}.fd-event{width:100%;display:grid;grid-template-columns:auto minmax(0,1fr);gap:4%;align-items:center}.fd-event time{font-family:Georgia,serif;font-size:clamp(22px,2.3vw,47px);font-weight:700;white-space:nowrap}.fd-event div{min-width:0;display:flex;flex-direction:column}.fd-event strong{font-size:clamp(20px,1.9vw,39px);line-height:1.02;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.fd-event span{margin-top:2%;font-size:clamp(13px,1.05vw,22px);line-height:1.05;color:#385c7b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.fd-next .fd-event{grid-template-columns:1fr;text-align:center}.fd-next .fd-event time{font-size:clamp(21px,2vw,40px)}.fd-next .fd-event strong{font-size:clamp(18px,1.55vw,31px)}.fd-owner{position:absolute;left:7%;bottom:5%;padding:1% 6%;color:#fff;font-size:clamp(13px,1vw,20px);font-weight:700;background:var(--owner) center/100% 100% no-repeat}.person-myles{--owner:var(--brush-red)}.person-ophelia{--owner:var(--brush-purple)}.person-both{--owner:linear-gradient(90deg,#d82d2f 0 50%,#6c3595 50%)}.fd-muted{font-size:clamp(16px,1.35vw,27px);color:#536b78;text-align:center}.fd-utility{padding-top:12%;color:#1768b1;background-image:var(--blue)}.fd-utility h2{top:7%;font-size:clamp(19px,1.5vw,31px)}.fd-dinner{color:#e5a919;filter:sepia(.08)}.fd-coming{color:#1594a3}.fd-weather-row{display:grid;grid-template-columns:25% auto 1fr;align-items:center;gap:3%;width:88%}.fd-weather-row img{width:100%;max-height:9vh;object-fit:contain}.fd-weather-row strong{font-family:Georgia,serif;font-size:clamp(30px,3.1vw,63px);line-height:1}.fd-weather-row span{font-size:clamp(14px,1.3vw,26px);font-weight:700;line-height:1}.fd-weather-row small{display:block;margin-top:5%;font-size:.72em;color:#536b78}.fd-dinner-copy{text-align:center;max-width:90%}.fd-dinner-copy strong{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-size:clamp(19px,1.65vw,34px);line-height:1.05}.fd-dinner-copy span{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2%;font-size:clamp(12px,.95vw,19px);color:#6d654c}.fd-coming-list{width:91%;display:grid;gap:.35vh}.fd-coming-item{display:grid;grid-template-columns:24% minmax(0,1fr);gap:3%;align-items:center;border-bottom:1px solid rgba(21,148,163,.23);padding:.25vh 0}.fd-coming-item:last-child{border:0}.fd-coming-item time{font-family:Georgia,serif;font-size:clamp(11px,.8vw,16px);font-weight:700}.fd-coming-item div{min-width:0}.fd-coming-item strong,.fd-coming-item span{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1}.fd-coming-item strong{font-size:clamp(12px,.92vw,19px)}.fd-coming-item span{font-size:clamp(10px,.7vw,14px);color:#536b78;margin-top:2px}`;

const COMPOSITION_CSS=`.first-day-dashboard{background-size:100% 100%}.fd-art{display:none}.fd-title{display:block;position:absolute;inset:0;width:100%;height:100%;object-fit:fill;z-index:0}.fd-grid{left:2.9%;right:4.2%;top:58.1%;bottom:2.4%;grid-template-columns:repeat(6,minmax(0,1fr));grid-template-rows:1.45fr 1fr;column-gap:1.7%;row-gap:2.2%}.fd-card{background-image:none}.fd-card h2{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}.fd-now{grid-column:1/4;padding:8% 7% 4%}.fd-now .fd-event strong{font-size:clamp(20px,1.65vw,32px)}.fd-next{grid-column:4/7;padding:8% 7% 4%}.fd-owner{bottom:4%;padding:1.2% 6.5%;clip-path:polygon(1% 24%,5% 8%,18% 13%,31% 3%,47% 9%,61% 1%,78% 10%,95% 5%,100% 28%,97% 51%,100% 78%,92% 94%,75% 89%,59% 100%,42% 91%,24% 97%,7% 88%,2% 67%);transform:rotate(-.6deg);text-shadow:0 1px 1px rgba(62,25,20,.3)}.fd-weather{grid-column:1/3}.fd-weather-row img{clip-path:inset(13% 0 0 19%);transform:scale(1.12);transform-origin:center}.fd-dinner{grid-column:3/5}.fd-coming{grid-column:5/7;justify-content:stretch}.fd-coming-list{width:100%;height:100%;display:grid;grid-template-rows:repeat(3,minmax(0,1fr));gap:0}.fd-coming-item{min-height:0;padding:0;line-height:.95;grid-template-columns:25% minmax(0,1fr)}.fd-coming-item time{font-size:clamp(13px,.82vw,16px);line-height:.95}.fd-coming-item strong{font-size:clamp(15px,.98vw,19px);line-height:.95}.fd-coming-item span{font-size:clamp(12px,.77vw,15px);line-height:.9;margin-top:1px}.fd-utility{background-image:none;padding-top:12%}.fd-utility.fd-coming{padding:4.5vh 2.8vw .5vh}`;

function renderFirstDayLevel3(data) {
  const s=schedule(data),coming=selectComing(data),weather=data.weather?.current||{},dinner=data.menuEvent||{},now=new Date(data.now||Date.now());
  const times=timeline(data),vars='';
  const weatherHtml=Number.isFinite(Number(weather.temperature))?`<div class="fd-weather-row"><img src="${asset('icon-weather-sun.png')}" alt=""><strong>${esc(weather.temperature)}°</strong><span>${esc(weather.summary||'')}<small>Feels like ${esc(weather.feelsLike??weather.temperature)}°</small></span></div>`:'<div class="fd-muted">Weather unavailable</div>';
  const phaseAt=instant=>{const selected=schedule({...data,now:new Date(instant)});return {now:card('NOW',selected.now,'now'),next:card('NEXT',selected.next,'next')}};
  const phases={preparation:phaseAt(times.preparation.getTime()+1000),departure:phaseAt(times.departure.getTime()+1000),coda:phaseAt(times.coda.getTime()+1000)};
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"><title>Moore Family Dashboard — First Day of School</title><style>${CSS}</style></head><body><main class="first-day-dashboard" data-dashboard-mode="first-day-level3" data-first-day-coda="true" style="${vars}"><img class="fd-art fd-title" src="${asset('composition-reference.png')}" alt="First Day of School!"><div class="fd-clock"><time id="live-clock">${esc(now.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',timeZone:'America/New_York'}))}</time><span id="live-date">${esc(now.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',timeZone:'America/New_York'}))}</span></div><div class="fd-grid">${card('NOW',s.now,'now')}${card('NEXT',s.next,'next')}<section class="fd-card fd-utility fd-weather"><h2>WEATHER</h2>${weatherHtml}</section><section class="fd-card fd-utility fd-dinner"><h2>DINNER</h2><div class="fd-dinner-copy"><strong>${esc(dinner.title||'Not set')}</strong>${dinner.subtitle?`<span>${esc(dinner.subtitle)}</span>`:''}</div></section><section class="fd-card fd-utility fd-coming"><h2>COMING UP</h2><div class="fd-coming-list">${coming.map(event=>`<div class="fd-coming-item"><time>${esc(new Date(`${eventKey(event)}T12:00:00`).toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'}))}</time><div><strong>${esc(clean(event.title))}</strong><span>${esc(eventTime(event))}${event.subtitle?` · ${esc(clean(event.subtitle))}`:''}</span></div></div>`).join('')||'<div class="fd-muted">Nothing coming up.</div>'}</div></section></div></main><script>(()=>{const z='America/New_York',departure=${times.departure.getTime()},handoff=${times.handoff.getTime()},coda=${times.coda.getTime()},evening=${times.evening.getTime()},phases=${JSON.stringify(phases)},clock=document.getElementById('live-clock'),date=document.getElementById('live-date');let phase='';const update=value=>{const n=value instanceof Date?value:new Date(value||Date.now()),stamp=n.getTime();clock.textContent=n.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',timeZone:z});date.textContent=n.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',timeZone:z});if(stamp>=evening||(stamp>=handoff&&stamp<coda)){if(location.protocol!=='about:')location.replace('level2.html');return 'level2'}const nextPhase=stamp>=coda?'coda':stamp>=departure?'departure':'preparation';if(nextPhase!==phase){for(const slot of ['now','next'])document.querySelector('[data-fd-slot="'+slot+'"]').outerHTML=phases[nextPhase][slot];phase=nextPhase}return nextPhase};window.updateFirstDayLevel3=update;update(${now.getTime()});setInterval(()=>update(new Date()),30000)})()</script></body></html>`;
}

export { hasFirstDayMilestone, renderFirstDayLevel3, shouldRenderFirstDayLevel3, schedule, timeline };
