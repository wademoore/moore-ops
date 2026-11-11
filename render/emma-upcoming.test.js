import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderDashboardMobile } from './dashboard-mobile.js';
import { mobilePreviewStates } from './dashboard-mobile.sample-data.js';
import { renderUpcoming, upcomingItems, collapseUpcomingEvents } from './dashboard-v2.js';

// Decision 2026-11-05: Emma's unavailability blocks are listed in Upcoming.
const base = mobilePreviewStates().everyday;
const key = offset => {
  const d = new Date(base.today.getFullYear(), base.today.getMonth(), base.today.getDate() + offset, 12);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const block = (startOffset, endOffset, type = 'UTA (Reserve)') => ({
  id: `emma-unavail-${key(startOffset)}`, type, startDate: key(startOffset), endDate: key(endOffset),
});
const withBlocks = (...blocks) => ({ ...structuredClone(base), emmaUnavailableBlocks: blocks });
const wall = data => renderUpcoming(data);
const mobile = data => {
  const html = renderDashboardMobile(data);
  return html.split('id="upcoming" aria-label=')[1].split('<section class="page"')[0];
};
const surfaces = { wall, mobile };

for (const [name, render] of Object.entries(surfaces)) {
  describe(`Emma unavailability in Upcoming — ${name}`, () => {
    it('lists a block starting inside the window with its type', () => {
      const html = render(withBlocks(block(3, 4)));
      assert.match(html, /Emma unavailable/);
      assert.match(html, /UTA \(Reserve\)/);
    });

    it('shows the date range', () => {
      const data = withBlocks(block(3, 5));
      const html = render(data);
      const start = new Date(`${key(3)}T12:00:00`);
      const label = `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}–${new Date(`${key(5)}T12:00:00`).getDate()}`;
      assert.ok(html.includes(label), `expected ${label}`);
    });

    it('lists a block that is in progress, with its full range', () => {
      const html = render(withBlocks(block(-3, 4)));
      assert.match(html, /Emma unavailable/);
      const start = new Date(`${key(-3)}T12:00:00`);
      assert.ok(html.includes(start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })));
    });

    it('omits a block that ends today, one that ended earlier, and one starting after the window', () => {
      assert.doesNotMatch(render(withBlocks(block(-3, 0))), /Emma unavailable/);
      assert.doesNotMatch(render(withBlocks(block(-9, -2))), /Emma unavailable/);
      assert.doesNotMatch(render(withBlocks(block(15, 16))), /Emma unavailable/);
    });

    it('lists a block starting on the last day of the window', () => {
      assert.match(render(withBlocks(block(14, 15))), /Emma unavailable/);
    });

    it('lists a block ending tomorrow', () => {
      assert.match(render(withBlocks(block(-2, 1))), /Emma unavailable/);
    });

    it('renders nothing for an absent or empty block list', () => {
      assert.doesNotMatch(render({ ...structuredClone(base), emmaUnavailableBlocks: undefined }), /Emma unavailable/);
      assert.doesNotMatch(render(withBlocks()), /Emma unavailable/);
    });

    it('ignores a block with malformed dates', () => {
      assert.doesNotMatch(render(withBlocks({ id: 'x', type: 'UTA', startDate: 'soon', endDate: key(3) })), /Emma unavailable/);
      assert.doesNotMatch(render(withBlocks({ id: 'y', type: 'UTA', startDate: key(3), endDate: 'later' })), /Emma unavailable/);
    });

    it('keeps the block in Upcoming when the same block is the featured NOW/NEXT item', () => {
      const data = withBlocks(block(1, 2));
      data.flags = [{ id: block(1, 2).id, level: 'amber', title: '🟡 Emma Unavailable', body: 'Emma unavailable', nowNextEligibleFrom: key(0) }];
      data.nowNext = { tone: 'problem', signal: 'Coverage', subject: 'Emma unavailable', diagnostics: { selectedSource: { type: 'flag', id: block(1, 2).id } } };
      assert.match(render(data), /Emma unavailable/);
    });
  });
}

describe('Emma unavailability in Upcoming — row kind and event isolation', () => {
  it('draws a wall row that differs from a family event row', () => {
    const html = wall(withBlocks(block(2, 3)));
    assert.match(html, /class="upcoming-event upcoming-block"/);
    assert.equal((html.match(/class="upcoming-event upcoming-block"/g) || []).length, 1);
  });

  it('draws a mobile row that differs from a family event row', () => {
    const html = mobile(withBlocks(block(2, 3)));
    assert.match(html, /class="event-row unavailability-block"/);
  });

  it('keeps blocks out of the event collapse used by every other consumer', () => {
    const data = withBlocks(block(2, 3));
    assert.deepEqual(collapseUpcomingEvents(data.upcomingEvents, data.today), collapseUpcomingEvents(base.upcomingEvents, base.today));
    assert.ok(upcomingItems(data).some(item => item.kind === 'unavailability'));
  });

  it('keeps day order chronological with blocks and events interleaved', () => {
    const data = withBlocks(block(9, 10));
    const starts = upcomingItems(data).map(item => item.startKey);
    assert.deepEqual(starts, [...starts].sort());
  });

  it('lists an in-progress block on the first day of the window and the same count on both surfaces', () => {
    const data = withBlocks(block(-3, 4));
    assert.equal(upcomingItems(data).find(item => item.kind === 'unavailability').startKey, key(1));
    assert.equal((wall(data).match(/upcoming-block"/g) || []).length, (mobile(data).match(/unavailability-block"/g) || []).length);
  });
});
