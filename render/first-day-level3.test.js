import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { renderDashboardV2 } from './dashboard-v2.js';
import { schedule, shouldRenderFirstDayLevel3 } from './first-day-level3.js';

const event=(title,start,extra={})=>({title,cardType:'standard',raw:{start:{dateTime:start}},...extra});
const milestone={title:'🏫 First Day of School (Myles and Ophelia)',cardType:'standard',_calName:'Family',raw:{start:{date:'2026-08-24'},end:{date:'2026-08-25'}}};
const base={
  today:new Date('2026-08-24T12:00:00-04:00'),
  now:new Date('2026-08-24T07:35:00-04:00'),
  days:[{events:[milestone]}],
  upcomingEvents:[event('Back to School Picnic','2026-08-25T17:30:00-04:00')],
  weather:{current:{temperature:78,feelsLike:80,summary:'Sunny'}},
  menuEvent:{title:'Tacos'},
};

describe('first day Level-3 takeover',()=>{
  it('advances NOW deterministically from preparation to drop-off',()=>{
    const at=time=>schedule({...base,now:new Date(`2026-08-24T${time}:00-04:00`)});
    assert.deepEqual([at('07:00').now.title,at('07:00').next.title],['School preparation','Leave for Stonehouse']);
    assert.deepEqual([at('07:20').now.title,at('07:20').next.title],['School preparation','Leave for Stonehouse']);
    assert.deepEqual([at('07:35').now.title,at('07:35').next.title],['Leave for Stonehouse','Arrive at Stonehouse']);
    assert.doesNotMatch(renderDashboardV2({...base,now:new Date('2026-08-24T07:35:00-04:00')}),/7:15 AM/);
  });
  it('activates for the same-day school milestone before arrival handoff',()=>{
    assert.equal(shouldRenderFirstDayLevel3(base),true);
    const html=renderDashboardV2(base);
    assert.match(html,/first-day-dashboard/);
    assert.match(html,/FIRST DAY|First Day of School/);
    assert.doesNotMatch(html,/athletics-panel|Weekly priorities|sports-ticker/);
  });
  it('does not depend on the calendar display label',()=>{
    const unlabeled={...milestone,_calName:undefined};
    assert.equal(shouldRenderFirstDayLevel3({...base,days:[{events:[unlabeled]}]}),true);
  });
  it('preserves the digest calendar day when today is UTC midnight',()=>{
    const lambdaToday={...base,today:new Date('2026-08-24T00:00:00.000Z')};
    assert.equal(shouldRenderFirstDayLevel3(lambdaToday),true);
    assert.match(renderDashboardV2(lambdaToday),/first-day-dashboard/);
  });
  it('returns to Level-2 immediately at the configured 7:45 handoff',()=>{
    const data={...base,now:new Date('2026-08-24T07:45:00-04:00')};
    assert.equal(shouldRenderFirstDayLevel3(data),false);
    assert.match(renderDashboardV2(data),/class="dashboard/);
  });
  it('honors explicit departure and handoff configuration without event-derived padding',()=>{
    const configured={...base,firstDayLevel3Departure:'07:25',firstDayLevel3Handoff:'07:40'};
    assert.equal(schedule({...configured,now:new Date('2026-08-24T07:26:00-04:00')}).now.title,'Leave for Stonehouse');
    assert.equal(shouldRenderFirstDayLevel3({...configured,now:new Date('2026-08-24T07:40:00-04:00')}),false);
  });
  it('re-enters for welcome home at 4 PM and ends at the existing 7 PM evening boundary',()=>{
    const at=time=>({...base,now:new Date(`2026-08-24T${time}:00-04:00`)});
    assert.equal(shouldRenderFirstDayLevel3(at('15:59')),false);
    assert.equal(shouldRenderFirstDayLevel3(at('16:00')),true);
    assert.equal(shouldRenderFirstDayLevel3(at('18:59')),true);
    assert.equal(shouldRenderFirstDayLevel3(at('19:00')),false);
    const coda=schedule(at('16:00'));
    assert.equal(coda.now.title,'Welcome home, Myles + Ophelia');
    assert.equal(coda.next.title,'Tacos');
    assert.doesNotMatch(`${coda.now.title} ${coda.now.subtitle} ${coda.next.title} ${coda.next.subtitle}`,/prepar|depart|arriv|rec connect/i);
  });
  it('evaluates the live clock immediately when a stale morning artifact reopens for coda',()=>{
    const html=renderDashboardV2({...base,now:new Date('2026-08-24T07:27:00-04:00')});
    assert.match(html,/window\.updateFirstDayLevel3=update;update\(new Date\(\)\)/);
    assert.doesNotMatch(html,/window\.updateFirstDayLevel3=update;update\(\d+\)/);
  });
  it('kill switch disables both first-day phases',()=>{
    assert.equal(shouldRenderFirstDayLevel3({...base,firstDayLevel3:false,now:new Date('2026-08-24T07:20:00-04:00')}),false);
    assert.equal(shouldRenderFirstDayLevel3({...base,firstDayLevel3:false,now:new Date('2026-08-24T16:00:00-04:00')}),false);
  });
  it('limits Coming Up to three and escapes unusually long live values',()=>{
    const upcomingEvents=Array.from({length:5},(_,i)=>event(`Event ${i} <script>` ,`2026-08-${25+i}T17:30:00-04:00`));
    const html=renderDashboardV2({...base,upcomingEvents,menuEvent:{title:'A very long dinner name '.repeat(20)}});
    assert.equal((html.match(/class="fd-coming-item"/g)||[]).length,3);
    assert.doesNotMatch(html,/<script>Event/);
  });
});
