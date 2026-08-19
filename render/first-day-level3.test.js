import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { renderDashboardV2 } from './dashboard-v2.js';
import { schedule, shouldRenderFirstDayLevel3 } from './first-day-level3.js';

const event=(title,start,extra={})=>({title,cardType:'standard',raw:{start:{dateTime:start}},...extra});
const base={
  today:new Date('2026-08-24T12:00:00-04:00'),
  now:new Date('2026-08-24T07:35:00-04:00'),
  days:[{events:[event('Pack backpacks + water bottles','2026-08-24T07:15:00-04:00',{_calName:'Myles + Ophelia'}),event('Stonehouse Elementary drop-off','2026-08-24T08:10:00-04:00',{_calName:'Myles + Ophelia',subtitle:'First Day of School'})]}],
  upcomingEvents:[event('Back to School Picnic','2026-08-25T17:30:00-04:00')],
  weather:{current:{temperature:78,feelsLike:80,summary:'Sunny'}},
  menuEvent:{title:'Tacos'},
};

describe('first day Level-3 takeover',()=>{
  it('advances NOW deterministically from preparation to drop-off',()=>{
    const at=time=>schedule({...base,now:new Date(`2026-08-24T${time}:00-04:00`)});
    assert.deepEqual([at('07:00').now.title,at('07:00').next.title],['Pack backpacks + water bottles','Stonehouse Elementary drop-off']);
    assert.deepEqual([at('07:20').now.title,at('07:20').next],['Stonehouse Elementary drop-off',null]);
    assert.deepEqual([at('07:35').now.title,at('07:35').next],['Stonehouse Elementary drop-off',null]);
    assert.doesNotMatch(renderDashboardV2({...base,now:new Date('2026-08-24T07:35:00-04:00')}),/7:15 AM/);
  });
  it('activates for the same-day school milestone before arrival handoff',()=>{
    assert.equal(shouldRenderFirstDayLevel3(base),true);
    const html=renderDashboardV2(base);
    assert.match(html,/first-day-dashboard/);
    assert.match(html,/FIRST DAY|First Day of School/);
    assert.doesNotMatch(html,/athletics-panel|Weekly priorities|sports-ticker/);
  });
  it('returns to Level-2 thirty minutes after the timed school handoff',()=>{
    const data={...base,now:new Date('2026-08-24T08:40:01-04:00')};
    assert.equal(shouldRenderFirstDayLevel3(data),false);
    assert.match(renderDashboardV2(data),/class="dashboard/);
  });
  it('limits Coming Up to three and escapes unusually long live values',()=>{
    const upcomingEvents=Array.from({length:5},(_,i)=>event(`Event ${i} <script>` ,`2026-08-${25+i}T17:30:00-04:00`));
    const html=renderDashboardV2({...base,upcomingEvents,menuEvent:{title:'A very long dinner name '.repeat(20)}});
    assert.equal((html.match(/class="fd-coming-item"/g)||[]).length,3);
    assert.doesNotMatch(html,/<script>Event/);
  });
});
