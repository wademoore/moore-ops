import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { renderDashboardV2, renderUpcoming } from './dashboard-v2.js';
import { ACCENT_OCCURRENCES, eventRowAccentSampleData, sampleDashboardV2Data } from './dashboard-v2.sample-data.js';

/**
 * Markup-level proofs for the event-row Accent.
 *
 * The property that matters most here is negative: when no accent resolves,
 * the rendered document must be the document that would have been rendered
 * before this feature existed. Several tests below assert that by comparing
 * whole documents rather than by inspecting a chosen substring.
 */

const readJson = name => JSON.parse(readFileSync(new URL(`../data/${name}`, import.meta.url), 'utf8'));
const REGISTRY = readJson('special-events.json');
const SHARKS = readJson('sharks-soccer.json');

const SWIM_ID = 'ophelia-757swim-catch-em-all-1-2026-09-19';
const OPENER_ID = 'myles-flag-football-week-1-season-opener-2026-09-13';
const GAME_ID = 'myles-flag-football-week-2-first-game-2026-09-20';

const BOTH_STAGED = Date.parse('2026-09-18T12:00:00Z');   // Fri 8:00 AM ET
const SWIM_VISIBLE = Date.parse('2026-09-18T20:00:00Z');  // Fri 4:00 PM ET
const GAME_VISIBLE = Date.parse('2026-09-19T20:00:00Z');  // Sat 4:00 PM ET
const OPENER_VISIBLE = Date.parse('2026-09-12T20:00:00Z'); // Sat 4:00 PM ET, a week earlier
// Before EVERY inclusion window: the season opener's 48h lead opens on
// 2026-09-10T20:00Z, so a Sept 11 probe would already carry it staged.
const BEFORE_ALL = Date.parse('2026-09-08T12:00:00Z');
const AFTER_ALL = Date.parse('2026-09-21T01:00:00Z');     // after the last expiry

// The two timed flag-football expiries are the occurrence's own end plus two
// hours; the swim meet is all-day and expires at 8:00 PM ET on its final day.
const SWIM_EXPIRE = Date.parse('2026-09-21T00:00:00Z');
const GAME_EXPIRE = Date.parse('2026-09-20T19:00:00Z');

/** Registry with all three accents removed — i.e. the Spotlight-only registry. */
const REGISTRY_WITHOUT_ACCENTS = {
  ...REGISTRY,
  treatments: REGISTRY.treatments.filter(t => t.level !== 'accent'),
};

const FLAG_SEASON = readJson('flag-football.json');

const dataAt = (now, overrides = {}) => eventRowAccentSampleData({
  now, specialEventsConfig: REGISTRY, sharksSoccerData: SHARKS, flagFootballData: FLAG_SEASON, ...overrides,
});

const documentAt = (now, overrides) => renderDashboardV2(dataAt(now, overrides));

/**
 * The rendered markup region only — everything between the dashboard element
 * and the browser script. The stylesheet and the controller both legitimately
 * name accent classes and attributes, so a containment assertion has to look
 * at emitted elements rather than at the whole document.
 */
function markupRegion(html) {
  const start = html.indexOf('<main class="dashboard');
  const end = html.indexOf('<script', start);
  assert.ok(start > 0 && end > start, 'could not isolate the markup region');
  return { text: html.slice(start, end), offset: start };
}

describe('event-row accent — ordinary output is unchanged when no accent resolves', () => {
  for (const [label, now] of [
    ['before any accent is included', BEFORE_ALL],
    ['after every accent has expired', AFTER_ALL],
  ]) {
    it(`renders byte-identically to a registry with no accents ${label}`, () => {
      assert.equal(
        documentAt(now),
        documentAt(now, { specialEventsConfig: REGISTRY_WITHOUT_ACCENTS }),
      );
    });
  }

  it('renders byte-identically with the kill switch off, on a date both accents would cover', () => {
    assert.equal(
      documentAt(GAME_VISIBLE, { familySpotlight: false }),
      documentAt(GAME_VISIBLE, { familySpotlight: false, specialEventsConfig: REGISTRY_WITHOUT_ACCENTS }),
    );
  });

  it('emits no accent element when the switch is off, even while both would otherwise qualify', () => {
    const { text } = markupRegion(documentAt(GAME_VISIBLE, { familySpotlight: false }));
    for (const marker of ['data-accent-id', 'has-accent', 'accent-wash', 'accent-doodle', 'accent-label', 'FIRST GAME']) {
      assert.ok(!text.includes(marker), `switch-off output leaked ${marker}`);
    }
  });

  it('leaves an unrelated ordinary dashboard untouched', () => {
    const { text } = markupRegion(renderDashboardV2(sampleDashboardV2Data));
    assert.ok(!text.includes('data-accent-id'));
    assert.ok(!text.includes('has-accent'));
  });

  it('differs from the ordinary document only by the accent additions', () => {
    const accented = documentAt(SWIM_VISIBLE);
    const ordinary = documentAt(SWIM_VISIBLE, { specialEventsConfig: REGISTRY_WITHOUT_ACCENTS });
    // Strip exactly what an accent adds: the row's state attributes and the
    // three decorations. What remains must be the ordinary document, which
    // proves no existing byte — text, mark, order, class or whitespace — was
    // rewritten to make room for the accent.
    const stripped = accented
      .replaceAll(/ has-accent accent-tone-\w+" data-accent-id="[^"]*" data-accent-state="ordinary" data-accent-activate-at="\d+" data-accent-expire-at="\d+"/g, '"')
      .replaceAll(/\n      <i class="accent-wash" aria-hidden="true"><\/i><i class="accent-doodle accent-doodle-[\w-]+" aria-hidden="true"><\/i>(?:<b class="accent-label">[^<]*<\/b>)?/g, '');
    assert.equal(stripped, ordinary);
  });
});

describe('event-row accent — decorated rows', () => {
  it('decorates each real row and introduces none', () => {
    const html = documentAt(SWIM_VISIBLE);
    assert.equal((html.match(/data-accent-id="/g) || []).length, 2);
    assert.ok(html.includes(`data-accent-id="${SWIM_ID}"`));
    assert.ok(html.includes(`data-accent-id="${GAME_ID}"`));
    // One accented row per accent, and the same number of Upcoming rows as the
    // ordinary render produces.
    const ordinary = documentAt(SWIM_VISIBLE, { specialEventsConfig: REGISTRY_WITHOUT_ACCENTS });
    const rows = text => (text.match(/<div class="upcoming-event/g) || []).length;
    assert.equal(rows(html), rows(ordinary));
  });

  it('accents only rows the Upcoming panel actually draws', () => {
    // The Upcoming panel is a lookahead: builder.js excludes today, so an
    // occurrence's row leaves the panel the moment its own date arrives and
    // moves to the Today panel. On Saturday the 19th the swim meet is today,
    // so its row is gone and only the flag-football row remains to accent —
    // even though the swim accent is still `live` and still in the artifact.
    // An accent decorates rows that exist; it never re-creates a departed one.
    const html = documentAt(GAME_VISIBLE);
    assert.equal((html.match(/data-accent-id="/g) || []).length, 1);
    assert.ok(html.includes(`data-accent-id="${GAME_ID}"`));
    assert.ok(!html.includes(`data-accent-id="${SWIM_ID}"`));
    assert.ok(!html.includes('Catch &#39;Em All Series'), 'the meet is today, so it is not in the lookahead');
  });

  it('never synthesises a second row for the two-day swim meet', () => {
    const html = renderUpcoming(dataAt(SWIM_VISIBLE));
    // The meet is one Google occurrence, so the ordinary renderer draws one
    // row for it, grouped under its start date. The accent must not add a
    // Sunday copy — Sunday's group carries the flag-football row only.
    assert.equal((html.match(/Catch &#39;Em All Series/g) || []).length, 1);
    const sunday = html.slice(html.indexOf('<b>20</b>'), html.indexOf('<b>21</b>'));
    assert.ok(sunday.includes('Flag Football: Week 2'));
    assert.ok(!sunday.includes('Catch &#39;Em All Series'));
    assert.equal((html.match(/data-accent-id="ophelia-757swim[^"]*"/g) || []).length, 1);
  });

  it('keeps the row text, detail line and semantic mark exactly as ordinary', () => {
    const html = renderUpcoming(dataAt(SWIM_VISIBLE));
    const row = html.slice(html.indexOf(`data-accent-id="${GAME_ID}"`));
    assert.ok(row.includes('<strong>Flag Football: Week 2 — vs Langston-Ravens (Home)</strong>'));
    assert.ok(row.includes('<span>11:00 AM</span>'));
    // The doodle is decoration; the row keeps the semantic sports mark the
    // ordinary renderer gave it, and gains no logo.
    assert.ok(row.includes('class="upcoming-logo semantic-icon category-sports"'));
  });

  it('applies the established ownership tones and no other palette', () => {
    const html = documentAt(SWIM_VISIBLE);
    assert.ok(html.includes(`data-accent-id="${SWIM_ID}"`));
    const rowClass = id => new RegExp(`class="upcoming-event has-accent accent-tone-(\\w+)" data-accent-id="${id}"`).exec(html)?.[1];
    assert.equal(rowClass(SWIM_ID), 'purple');
    assert.equal(rowClass(GAME_ID), 'red');
    // The v1 champs-banner lineage must not appear in accent markup.
    assert.doesNotMatch(html, /#7F77DD|#E24B4A/i);
  });

  it('labels only the first game, and never adds an information line', () => {
    const html = documentAt(SWIM_VISIBLE);
    assert.equal((html.match(/<b class="accent-label">/g) || []).length, 1);
    assert.ok(html.includes('<b class="accent-label">FIRST GAME</b>'));
    assert.ok(!html.includes('MEET WEEKEND'));
    assert.ok(!html.includes('SEASON OPENER'), 'the opener is a week earlier and is not in this artifact');
    // No celebration vocabulary, animation, or flashing anywhere in the CSS or
    // markup this feature added.
    for (const banned of ['confetti', '@keyframes accent', 'animation:accent', 'blink']) {
      assert.ok(!html.includes(banned), `accent output contains ${banned}`);
    }
  });

  it('ships every accented row in the ordinary state so a failed script fails closed', () => {
    const html = documentAt(SWIM_VISIBLE);
    assert.equal((html.match(/data-accent-state="ordinary"/g) || []).length, 2);
    assert.ok(html.includes('updateEventRowAccents'));
  });

  it('emits the absolute instants the controller compares, and nothing timezone-shaped', () => {
    const html = documentAt(SWIM_VISIBLE);
    assert.ok(html.includes(`data-accent-activate-at="${SWIM_VISIBLE}"`));
    assert.ok(html.includes(`data-accent-activate-at="${GAME_VISIBLE}"`));
    // UPDATED (2026-09-10): the two accents no longer share one expiry. The
    // flag-football occurrence is timed on the live calendar, so its treatment
    // takes the framework's timed expiry (its own end plus two hours) where
    // its all-day predecessor took the 8:00 PM ET one. Both are still emitted
    // as bare integers, which is the property this case exists for.
    assert.ok(html.includes(`data-accent-expire-at="${SWIM_EXPIRE}"`));
    assert.ok(html.includes(`data-accent-expire-at="${GAME_EXPIRE}"`));
    assert.doesNotMatch(html, /data-accent-(activate|expire)-at="[^"]*[^0-9"][^"]*"/,
      'every instant must be a bare integer, with no timezone text');
  });

  it('renders the season opener a week earlier, distinguishable by its chip', () => {
    // The two flag-football treatments never appear in the same artifact, so
    // the chip is what tells a reader which moment is being marked.
    const html = documentAt(OPENER_VISIBLE);
    assert.equal((html.match(/data-accent-id="/g) || []).length, 1);
    assert.ok(html.includes(`data-accent-id="${OPENER_ID}"`));
    assert.ok(html.includes('<b class="accent-label">SEASON OPENER</b>'));
    assert.ok(!html.includes('FIRST GAME'));
    assert.ok(html.includes('accent-doodle accent-doodle-football-laces'));
  });

  it('stages both accents in one artifact well before either becomes visible', () => {
    // The 48-hour inclusion lead comfortably exceeds the largest real gap
    // between scheduled generations, so no visible boundary can fall between
    // two pulls with the treatment absent from the artifact.
    const html = documentAt(BOTH_STAGED);
    assert.equal((html.match(/data-accent-id="/g) || []).length, 2);
    assert.equal((html.match(/data-accent-state="ordinary"/g) || []).length, 2);
  });
});

describe('event-row accent — containment and fail-closed', () => {
  it('emits accent markup only inside the Upcoming panel', () => {
    const html = documentAt(SWIM_VISIBLE);
    const { text } = markupRegion(html);
    const panelStart = text.indexOf('<section class="paper-panel upcoming-panel');
    const panelEnd = text.indexOf('<section', panelStart + 1);
    assert.ok(panelStart > 0 && panelEnd > panelStart);
    for (const marker of ['data-accent-id="', 'has-accent', 'accent-wash', 'accent-doodle', 'accent-label']) {
      for (const match of text.matchAll(new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'))) {
        assert.ok(match.index > panelStart && match.index < panelEnd,
          `${marker} at ${match.index} is outside the Upcoming panel (${panelStart}..${panelEnd})`);
      }
    }
  });

  it('leaves every protected region free of accent markup', () => {
    const { text } = markupRegion(documentAt(SWIM_VISIBLE));
    // Split the page into its top-level regions by their own opening tags,
    // then assert on each region's whole extent. Matching on a class *prefix*
    // matters: the right rail ships as `right-rail horizon-count-3`, so an
    // exact `class="right-rail"` probe silently finds nothing and the
    // assertion becomes vacuous.
    const regions = [...text.matchAll(/<(?:section|aside|header|footer) class="((?:paper-panel )?[a-z0-9-]+)/g)]
      .map(match => ({ name: match[1].replace(/^paper-panel /, ''), index: match.index }))
      .filter(region => ['today-panel', 'upcoming-panel', 'athletics-panel', 'alerts-panel', 'right-rail', 'sports-ticker', 'masthead'].includes(region.name));

    const protectedRegions = regions.filter(region => region.name !== 'upcoming-panel');
    // The masthead is optional (this fixture renders `no-masthead`), so five
    // is the full set here: today, athletics, alerts, right rail and ticker.
    for (const required of ['today-panel', 'athletics-panel', 'alerts-panel', 'right-rail', 'sports-ticker']) {
      assert.ok(protectedRegions.some(region => region.name === required),
        `could not locate ${required}; found ${JSON.stringify(regions.map(r => r.name))}`);
    }

    const starts = [...regions.map(region => region.index), text.length].sort((a, b) => a - b);
    for (const region of protectedRegions) {
      const end = starts.find(index => index > region.index) ?? text.length;
      const slice = text.slice(region.index, end);
      assert.ok(!slice.includes('accent-'), `${region.name} contains accent markup`);
      assert.ok(!slice.includes('data-accent'), `${region.name} contains accent state`);
    }
  });

  it('falls back to an ordinary row when the selector throws', () => {
    // A getter that throws stands in for any unexpected failure inside
    // resolution. The panel must still render, unaccented.
    const data = dataAt(GAME_VISIBLE);
    Object.defineProperty(data, 'specialEventsConfig', {
      get() { throw new Error('registry exploded'); },
      configurable: true,
    });
    const html = renderUpcoming(data);
    assert.ok(html.includes('Flag Football: Week 2'));
    assert.ok(!html.includes('data-accent-id'));
  });

  it('falls back to an ordinary row when the doodle artwork is unknown', () => {
    const badDoodle = {
      ...REGISTRY,
      treatments: REGISTRY.treatments.map(t => (t.id === GAME_ID
        ? { ...t, presentation: { ...t.presentation, doodle: 'nonexistent-doodle' } }
        : t)),
    };
    const html = renderUpcoming(dataAt(SWIM_VISIBLE, { specialEventsConfig: badDoodle }));
    assert.ok(html.includes('Flag Football: Week 2'));
    assert.ok(!html.includes(`data-accent-id="${GAME_ID}"`));
    assert.ok(html.includes(`data-accent-id="${SWIM_ID}"`), 'one invalid accent must not disable the other');
  });

  it('falls back to an ordinary row when the SWIM title grows past the approved one', () => {
    // UPDATED (2026-09-10): retargeted from the flag-football accent to the
    // swim accent, which is the one still anchored on a calendar title. The
    // probe is unchanged in kind — the same event, still on the same calendar
    // and date, with the venue spelled out — and `literal` still fails it
    // closed. The sibling case below is the deliberate opposite for the
    // flag-football accents, and says why.
    const longer = {
      ...ACCENT_OCCURRENCES.swim,
      title: "757swim: Catch 'Em All Series #1 - 200 Back (Christiansburg Aquatic Center, Session 2)",
    };
    const html = renderUpcoming(dataAt(SWIM_VISIBLE, { occurrences: [longer, ACCENT_OCCURRENCES.flagFootballFirstGame] }));
    assert.ok(html.includes('Christiansburg Aquatic Center'), 'the ordinary row must still be drawn');
    assert.ok(!html.includes(`data-accent-id="${SWIM_ID}"`), 'the longer title must not be accented');
    assert.ok(html.includes(`data-accent-id="${GAME_ID}"`), 'the unrelated accent is unaffected');
  });

  it('still accents a flag-football row whose title grew, and that is the trade', () => {
    // The deliberate inverse of the case above, recorded as a test rather than
    // as a caveat. `literal` matching bought a rendered-width guarantee at the
    // cost of a treatment that died on every rename; the season-derived nodes
    // take the opposite side of that trade.
    //
    // The cost was measured rather than argued
    // (scratch/flag-football-season-markers/measure-contrast.mjs): the wash is
    // fully transparent across the left 46% of the row and ramps rightwards, so
    // a title reaching past that boundary sits over tinted paper. The sweep
    // grows a title a word at a time and records the lowest contrast anywhere
    // along it; the minimum is BOUNDED rather than open-ended, bottoming out at
    // 6.41:1 near 109 characters and plateauing at 6.52:1 (beyond ~114 the
    // title wraps instead of extending). Ordinary is 9.23:1 and WCAG AAA for
    // normal text is 7:1 — so the worst REACHABLE title is BELOW AAA and above
    // AA (4.5:1). The realistic cases measure 9.00:1 and 8.64:1, and both real
    // titles (36 and 49 characters) measure 9.23:1, identical to an unaccented
    // row: at the shipped titles the accent costs nothing at all.
    //
    // Read that carefully, because an earlier version of this very comment drew
    // the opposite conclusion. It said "what `literal` was protecting is
    // contrast headroom, not legibility", on figures of 7.32:1 and 10.80:1 that
    // the shipped script has never produced — on this tree or on the pre-rebase
    // commit 3eee432. At 6.41:1 the worst reachable title crosses the AAA bar
    // the project asserted it cleared, so `literal` was protecting the
    // THRESHOLD, not merely headroom. Whether that is an acceptable price for a
    // treatment a rename cannot kill is Wade's call; this comment must not
    // foreclose it again. Nothing here asserts a contrast ratio, so no test can
    // go red on a wrong number — which is exactly why it has to be re-derived
    // from a run rather than carried forward.
    const longer = {
      ...ACCENT_OCCURRENCES.flagFootballFirstGame,
      title: 'Flag Football: Week 2 — Practice + Game (Yorktown, McReynolds Athletic Complex, Field 3)',
    };
    const html = renderUpcoming(dataAt(SWIM_VISIBLE, { occurrences: [ACCENT_OCCURRENCES.swim, longer] }));
    assert.ok(html.includes('McReynolds Athletic Complex'), 'the ordinary row text is untouched');
    assert.ok(html.includes(`data-accent-id="${GAME_ID}"`), 'the renamed row is still accented');
    assert.ok(html.includes('FIRST GAME'));
  });

  it('falls back to an ordinary row when the occurrence is simply absent', () => {
    const html = renderUpcoming(dataAt(SWIM_VISIBLE, { occurrences: [ACCENT_OCCURRENCES.swim] }));
    assert.ok(!html.includes(`data-accent-id="${GAME_ID}"`));
    assert.ok(html.includes(`data-accent-id="${SWIM_ID}"`));
  });
});
