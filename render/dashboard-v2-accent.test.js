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
const FLAG_ID = 'myles-flag-football-week1-2026-09-20';

const BOTH_STAGED = Date.parse('2026-09-18T12:00:00Z');   // Fri 8:00 AM ET
const SWIM_VISIBLE = Date.parse('2026-09-18T20:00:00Z');  // Fri 4:00 PM ET
const FLAG_VISIBLE = Date.parse('2026-09-19T20:00:00Z');  // Sat 4:00 PM ET
const BEFORE_ALL = Date.parse('2026-09-10T12:00:00Z');    // outside both inclusion windows
const AFTER_ALL = Date.parse('2026-09-21T01:00:00Z');     // after the shared 8:00 PM ET expiry

/** Registry with the two accents removed — i.e. the registry before this work. */
const REGISTRY_WITHOUT_ACCENTS = {
  ...REGISTRY,
  treatments: REGISTRY.treatments.filter(t => t.level !== 'accent'),
};

const dataAt = (now, overrides = {}) => eventRowAccentSampleData({
  now, specialEventsConfig: REGISTRY, sharksSoccerData: SHARKS, ...overrides,
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
    ['before either accent is included', BEFORE_ALL],
    ['after both accents have expired', AFTER_ALL],
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
      documentAt(FLAG_VISIBLE, { familySpotlight: false }),
      documentAt(FLAG_VISIBLE, { familySpotlight: false, specialEventsConfig: REGISTRY_WITHOUT_ACCENTS }),
    );
  });

  it('emits no accent element when the switch is off, even while both would otherwise qualify', () => {
    const { text } = markupRegion(documentAt(FLAG_VISIBLE, { familySpotlight: false }));
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
    assert.ok(html.includes(`data-accent-id="${FLAG_ID}"`));
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
    const html = documentAt(FLAG_VISIBLE);
    assert.equal((html.match(/data-accent-id="/g) || []).length, 1);
    assert.ok(html.includes(`data-accent-id="${FLAG_ID}"`));
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
    assert.ok(sunday.includes('Flag Football: Week 1'));
    assert.ok(!sunday.includes('Catch &#39;Em All Series'));
    assert.equal((html.match(/data-accent-id="ophelia-757swim[^"]*"/g) || []).length, 1);
  });

  it('keeps the row text, detail line and semantic mark exactly as ordinary', () => {
    const html = renderUpcoming(dataAt(SWIM_VISIBLE));
    const row = html.slice(html.indexOf(`data-accent-id="${FLAG_ID}"`));
    assert.ok(row.includes('<strong>Flag Football: Week 1 — Practice + Game (Yorktown)</strong>'));
    assert.ok(row.includes('<span>All day</span>'));
    // The doodle is decoration; the row keeps the semantic sports mark the
    // ordinary renderer gave it, and gains no logo.
    assert.ok(row.includes('class="upcoming-logo semantic-icon category-sports"'));
  });

  it('applies the established ownership tones and no other palette', () => {
    const html = documentAt(SWIM_VISIBLE);
    assert.ok(html.includes(`data-accent-id="${SWIM_ID}"`));
    const rowClass = id => new RegExp(`class="upcoming-event has-accent accent-tone-(\\w+)" data-accent-id="${id}"`).exec(html)?.[1];
    assert.equal(rowClass(SWIM_ID), 'purple');
    assert.equal(rowClass(FLAG_ID), 'red');
    // The v1 champs-banner lineage must not appear in accent markup.
    assert.doesNotMatch(html, /#7F77DD|#E24B4A/i);
  });

  it('labels only the first game, and never adds an information line', () => {
    const html = documentAt(SWIM_VISIBLE);
    assert.equal((html.match(/<b class="accent-label">/g) || []).length, 1);
    assert.ok(html.includes('<b class="accent-label">FIRST GAME</b>'));
    assert.ok(!html.includes('MEET WEEKEND'));
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
    assert.ok(html.includes(`data-accent-activate-at="${Date.parse('2026-09-18T20:00:00Z')}"`));
    assert.ok(html.includes(`data-accent-activate-at="${Date.parse('2026-09-19T20:00:00Z')}"`));
    assert.equal((html.match(new RegExp(`data-accent-expire-at="${Date.parse('2026-09-21T00:00:00Z')}"`, 'g')) || []).length, 2);
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
    const data = dataAt(FLAG_VISIBLE);
    Object.defineProperty(data, 'specialEventsConfig', {
      get() { throw new Error('registry exploded'); },
      configurable: true,
    });
    const html = renderUpcoming(data);
    assert.ok(html.includes('Flag Football: Week 1'));
    assert.ok(!html.includes('data-accent-id'));
  });

  it('falls back to an ordinary row when the doodle artwork is unknown', () => {
    const badDoodle = {
      ...REGISTRY,
      treatments: REGISTRY.treatments.map(t => (t.id === FLAG_ID
        ? { ...t, presentation: { ...t.presentation, doodle: 'nonexistent-doodle' } }
        : t)),
    };
    const html = renderUpcoming(dataAt(SWIM_VISIBLE, { specialEventsConfig: badDoodle }));
    assert.ok(html.includes('Flag Football: Week 1'));
    assert.ok(!html.includes(`data-accent-id="${FLAG_ID}"`));
    assert.ok(html.includes(`data-accent-id="${SWIM_ID}"`), 'one invalid accent must not disable the other');
  });

  it('falls back to an ordinary row when the title grows past the approved one', () => {
    // The exact probe from the review: the same event, still on the same
    // calendar and date, with the venue spelled out. Under `prefix` matching
    // this still qualified and drew text over the wash; under `literal` it
    // fails closed and the row renders ordinary until someone revalidates the
    // treatment against the new title.
    const longer = {
      ...ACCENT_OCCURRENCES.flagFootball,
      title: 'Flag Football: Week 1 — Practice + Game (Yorktown, McReynolds Athletic Complex, Field 3)',
    };
    const html = renderUpcoming(dataAt(SWIM_VISIBLE, { occurrences: [ACCENT_OCCURRENCES.swim, longer] }));
    assert.ok(html.includes('McReynolds Athletic Complex'), 'the ordinary row must still be drawn');
    assert.ok(!html.includes(`data-accent-id="${FLAG_ID}"`), 'the longer title must not be accented');
    assert.ok(!html.includes('FIRST GAME'));
    assert.ok(html.includes(`data-accent-id="${SWIM_ID}"`), 'the unrelated accent is unaffected');
  });

  it('falls back to an ordinary row when the occurrence is simply absent', () => {
    const html = renderUpcoming(dataAt(SWIM_VISIBLE, { occurrences: [ACCENT_OCCURRENCES.swim] }));
    assert.ok(!html.includes(`data-accent-id="${FLAG_ID}"`));
    assert.ok(html.includes(`data-accent-id="${SWIM_ID}"`));
  });
});
