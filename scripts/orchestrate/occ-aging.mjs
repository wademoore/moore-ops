#!/usr/bin/env node
/**
 * scripts/orchestrate/occ-aging.mjs
 *
 * OCC aging brief. Reads the Weekly Priorities calendar for the last 8 weeks,
 * works out how long each still-open item has been carried, and forces a
 * decision on anything aged 3+ weeks. Writes markdown to
 * analysis/occ-aging-<date>.md.
 *
 * WHY THIS EXISTS
 * ---------------
 * The Weekly Review's Phase 3 OCC sweep has a five-state vocabulary
 * (Done / Still active / Stale / Urgent / Missing owner). "Still active" is a
 * legitimate verdict there, which means an item can be marked still-active
 * every week forever and never trip a review. This script removes that escape
 * hatch: past 3 weeks an item gets BLOCKED, DEMOTE, or DEAD, and nothing else.
 *
 * WHY NOT MCP
 * -----------
 * An earlier design called claude -p with the Google Calendar MCP server. That
 * server is only present in the Claude.ai connector layer — `claude mcp list`
 * reports no servers, and a headless probe for calendar tools comes back empty.
 * A scheduled run would have produced an empty brief and exited 0. This script
 * uses the repo's own OAuth path (auth.js) instead, which works headlessly and
 * is the same credential mechanism the digest already uses.
 *
 * EXIT CODES
 * ----------
 *   0  brief written
 *   2  auth failure          (getAuthClient threw)
 *   3  calendar fetch failure (the API call threw)
 *   4  empty read            (zero events across the whole 8-week window)
 *   5  write failure
 *   1  anything else unexpected
 *
 * Code 4 is the point of the exercise. A silent success on an empty read is
 * the failure this script is built to avoid: it looks like "nothing to do"
 * and is indistinguishable from a revoked token. Pass --allow-empty when the
 * calendar is genuinely expected to be empty.
 *
 * USAGE
 *   node scripts/orchestrate/occ-aging.mjs [--allow-empty] [--out <path>] [--quiet]
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { getAuthClient } from '../../auth.js';
import { fetchCalendarEventsStrict, FAMILY_CALENDARS, dedupeById } from '../../calendar.js';
import { extractAssignee, stripDone } from '../../digest/weeklyPrioritiesParser.js';
import { isRoutineCentersEvent } from '../../digest/centersProfile.js';
import { analyzeEventSemantics } from '../../render/dashboard-v2.js';

// ── Constants ─────────────────────────────────────────────────────────────

export const WEEKLY_PRIORITIES_CALENDAR_ID =
  '6ac1de94baada01a89e5bcf845d71c5d02301b5a62d9406c1069430341e3ccc2@group.calendar.google.com';

export const LOOKBACK_WEEKS = 8;
export const AGED_THRESHOLD_WEEKS = 3;
export const DEAD_THRESHOLD_WEEKS = 6;
export const CONFLICT_HORIZON_DAYS = 14;

export const EXIT = {
  OK: 0,
  UNEXPECTED: 1,
  AUTH: 2,
  FETCH: 3,
  EMPTY: 4,
  WRITE: 5,
};

// ── Date helpers (pure) ───────────────────────────────────────────────────

/** ISO-8601 week key, e.g. "2026-W35". Weeks start Monday. */
export function isoWeekKey(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;           // Sunday → 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);   // shift to the week's Thursday
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

/** Monday of the given date's ISO week, normalized to UTC so week arithmetic is DST-proof. */
function mondayUtc(date) {
  const x = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dow = (x.getUTCDay() + 6) % 7; // Monday → 0
  x.setUTCDate(x.getUTCDate() - dow);
  return x;
}

/**
 * Number of ISO weeks spanned from `from` to `to`, counting both endpoints'
 * weeks. Same week → 1. Consecutive weeks → 2.
 *
 * Deliberately computed from UTC-normalized Mondays: doing this with local
 * Date arithmetic makes a spring-forward week 6d23h long, which floors to zero
 * and silently loses a week from every age that spans a DST boundary.
 */
export function weeksSpanned(from, to) {
  if (!from || !to) return 0;
  const a = mondayUtc(from);
  const b = mondayUtc(to);
  if (b < a) return 1;
  return Math.round((b - a) / (7 * 86400000)) + 1;
}

export function toDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Start instant of a calendar event.
 *
 * All-day events carry `start.date` as a bare Y-M-D, which `new Date(str)`
 * would read as UTC midnight and therefore render as the previous evening in
 * ET. Parsed componentwise into local midnight instead — the same convention
 * dateUtils.parseEventDate uses, and the reason CLAUDE.md warns against
 * running an already-ET-anchored date back through a timezone conversion.
 */
export function eventStart(event) {
  if (event?.start?.date) {
    const [y, m, d] = event.start.date.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  if (event?.start?.dateTime) return new Date(event.start.dateTime);
  return null;
}

export function eventEnd(event) {
  if (event?.end?.date) {
    // Google's all-day end.date is exclusive.
    const [y, m, d] = event.end.date.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  if (event?.end?.dateTime) return new Date(event.end.dateTime);
  return null;
}

export function isAllDay(event) {
  return Boolean(event?.start?.date);
}

// ── Item aggregation (pure) ───────────────────────────────────────────────

/**
 * Collapse a title to a comparison key. Weekly Priorities items are retyped
 * by hand each week, so the same commitment drifts in punctuation, casing and
 * trailing detail. Without normalization a carried item reads as N distinct
 * one-week items and never ages.
 */
export function normalizeTitle(title) {
  return String(title || '')
    .toLowerCase()
    .replace(/\[done\]/gi, '')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function itemKey(owner, title) {
  return `${String(owner || '').toLowerCase().trim()}|${normalizeTitle(title)}`;
}

/**
 * Group raw calendar events into OCC items.
 *
 * An item is "still open" when its MOST RECENT occurrence is not marked
 * [done] — not when any occurrence is undone. Marking week 5 done and never
 * mentioning it again should close the item, and an item reopened after being
 * closed should read as open.
 *
 * AGE IS ELAPSED TIME, NOT OCCURRENCE COUNT. This distinction is the whole
 * ballgame on real data. The Weekly Priorities calendar does not re-list a
 * carried item each week — an item is raised once and simply left undone. So
 * counting the weeks an item *appears* ages a five-week-old commitment at one
 * week and it never crosses the verdict threshold. `weeksCarried` is therefore
 * measured from when the item was first raised to now (for open items) or to
 * its last sighting (for closed ones). `weeksAppeared` is kept alongside it,
 * because the gap between the two is itself informative: appeared 1 / carried 7
 * means "raised once and never looked at again".
 */
export function aggregateOccItems(events, { asOf = new Date() } = {}) {
  const byKey = new Map();

  for (const ev of events) {
    const raw = ev.summary || '';
    if (!raw.trim()) continue;

    const start = eventStart(ev);
    if (!start) continue;

    const owner = extractAssignee(raw);
    const colonIdx = raw.indexOf(':');
    const display = stripDone(colonIdx > 0 ? raw.slice(colonIdx + 1) : raw).trim();
    if (!display) continue;

    const done = /\[done\]/i.test(raw);
    const key = itemKey(owner, display);

    let item = byKey.get(key);
    if (!item) {
      item = {
        key,
        owner: owner || 'Unassigned',
        title: display,
        weeks: new Set(),
        occurrences: [],
        firstSeen: start,
        lastSeen: start,
        lastDone: done,
        text: '',
      };
      byKey.set(key, item);
    }

    item.weeks.add(isoWeekKey(start));
    item.occurrences.push({ date: start, done, raw });
    if (start < item.firstSeen) item.firstSeen = start;
    if (start >= item.lastSeen) {
      item.lastSeen = start;
      item.lastDone = done;          // most recent occurrence wins
      item.title = display;          // and its wording is the current wording
    }
    item.text = `${item.text} ${raw} ${ev.description || ''}`.trim();
  }

  return [...byKey.values()]
    .map(it => {
      const stillOpen = !it.lastDone;
      return {
        ...it,
        weeksAppeared: it.weeks.size,
        weeksCarried: weeksSpanned(it.firstSeen, stillOpen ? asOf : it.lastSeen),
        stillOpen,
      };
    })
    .sort((a, b) => b.weeksCarried - a.weeksCarried || a.title.localeCompare(b.title));
}

// ── Near-duplicate detection (pure) ───────────────────────────────────────

const STOPWORDS = new Set(['the', 'a', 'an', 'and', 'or', 'for', 'to', 'of', 'in', 'on', 'with', 'get', 'new']);

function significantTokens(title) {
  return new Set(
    normalizeTitle(title)
      .split(' ')
      .filter(t => t.length > 2 && !STOPWORDS.has(t))
  );
}

/**
 * Flag pairs of open items that look like the same commitment retyped.
 *
 * Reported, never merged. Identity here is title-based, so a reworded item
 * legitimately starts its age over — that is a real hole, and silently merging
 * on a similarity score would trade it for a worse one (two genuinely distinct
 * errands collapsing into one and half the work vanishing from the brief).
 * Surfacing the candidates lets a human decide, which is the same posture the
 * verdicts take.
 */
export function findNearDuplicates(items, threshold = 0.6) {
  const open = items.filter(i => i.stillOpen);
  const pairs = [];
  for (let i = 0; i < open.length; i++) {
    for (let j = i + 1; j < open.length; j++) {
      if (open[i].owner.toLowerCase() !== open[j].owner.toLowerCase()) continue;
      const a = significantTokens(open[i].title);
      const b = significantTokens(open[j].title);
      if (!a.size || !b.size) continue;
      let shared = 0;
      for (const t of a) if (b.has(t)) shared++;
      const similarity = shared / new Set([...a, ...b]).size;
      if (similarity >= threshold) {
        pairs.push({ a: open[i], b: open[j], similarity: Math.round(similarity * 100) / 100 });
      }
    }
  }
  return pairs.sort((x, y) => y.similarity - x.similarity);
}

// ── Verdicts (pure) ───────────────────────────────────────────────────────

const BLOCKER_PATTERNS = [
  /\bblocked\s+(?:by|on)\s+([^.;,\n\]]+)/i,
  /\bwaiting\s+(?:on|for)\s+([^.;,\n\]]+)/i,
  /\bpending\s+([^.;,\n\]]+)/i,
  /\bdepends\s+on\s+([^.;,\n\]]+)/i,
  /\bneeds?\s+([^.;,\n\]]+?)\s+(?:from|before)\b/i,
];

/** Extract a named blocker from an item's accumulated text, or null. */
export function detectBlocker(text) {
  const haystack = String(text || '');
  for (const re of BLOCKER_PATTERNS) {
    const m = haystack.match(re);
    if (m && m[1]) {
      const blocker = m[1].replace(/\s+/g, ' ').trim().replace(/[.\s]+$/, '');
      if (blocker) return blocker;
    }
  }
  return null;
}

/**
 * Assign a verdict. Items under AGED_THRESHOLD_WEEKS get none — they are just
 * reported with their age.
 *
 * For aged items the result is always exactly one of BLOCKED / DEMOTE / DEAD.
 * There is no "still active" branch, by design.
 *
 * These are MECHANICAL PROPOSALS, not judgements. A script cannot know that
 * something is dead. What it can do is refuse to let an item sit unlabelled,
 * which is the behaviour the five-state sweep permits. Every verdict carries
 * the rule that produced it so a reader can overrule it in one glance.
 */
export function assignVerdict(item) {
  if (item.weeksCarried < AGED_THRESHOLD_WEEKS) return null;

  const blocker = detectBlocker(item.text);
  if (blocker) {
    return {
      verdict: 'BLOCKED',
      blocker,
      rationale: `Item text names a blocker: "${blocker}".`,
    };
  }

  if (item.weeksCarried >= DEAD_THRESHOLD_WEEKS) {
    const neglected =
      item.weeksAppeared === 1
        ? ` Raised once and never re-listed since — no one has looked at it.`
        : '';
    return {
      verdict: 'DEAD',
      blocker: null,
      rationale:
        `Open ${item.weeksCarried} weeks with no stated blocker and no completion.` +
        neglected +
        ` At this age the absence of a blocker is itself the finding: nothing is ` +
        `stopping it and it still is not moving.`,
    };
  }

  return {
    verdict: 'DEMOTE',
    blocker: null,
    rationale:
      `Open ${item.weeksCarried} weeks with no stated blocker. Not old enough to ` +
      `call dead; too old to keep occupying a weekly-priority slot.`,
  };
}

// ── Conflict detection (pure) ─────────────────────────────────────────────

function semanticsFor(event) {
  return analyzeEventSemantics({
    title: event.summary || '',
    subtitle: event.description || '',
    _calName: event.calendarName || '',
  });
}

/** True when the event's title/calendar trip the dashboard's travel heuristics. */
export function isTravelEvent(event) {
  const semantics = semanticsFor(event);
  return Boolean(semantics.travel) || semantics.reasonCodes.includes('TRAVEL_FAMILY');
}

/**
 * True when an event inside a travel window is a genuine conflict for the
 * traveller rather than routine coverage.
 *
 * The distinction matters enormously in practice. A four-day work trip across
 * a school week overlaps every Centers block, every practice and every lesson
 * on both kids' calendars. Reporting all of them as "conflicts" produced 11
 * rows on the first live run, of which exactly one — an orthodontist
 * appointment — was a thing anyone had to act on. The other ten buried it.
 *
 * Two exclusions, both reusing signals the repo already trusts:
 *
 *   1. Routine Centers entries, via `isRoutineCentersEvent` from
 *      centersProfile.js. builder.js already strips these from both the 72-hour
 *      and 14-day dashboard windows for exactly this reason, so following that
 *      convention keeps one definition of "Centers clutter" rather than two.
 *   2. Events the dashboard classifies as routine (recurring practices).
 *
 * Note what is deliberately NOT used: `semantics.audience`. It looks like the
 * right lever and is not. `analyzeEventSemantics` folds the calendar name into
 * its text, so everything on a child's calendar reads as `audience: 'child'` —
 * including the orthodontist appointment that is the one real conflict here.
 * Filtering on audience suppressed all 11 rows including the true positive.
 *
 * Suppressed items are still counted and reported as coverage load, so nothing
 * disappears silently.
 */
export function isTravelConflict(timedEvent) {
  if (isRoutineCentersEvent({ title: timedEvent.summary || '' })) return false;
  return !semanticsFor(timedEvent).routine;
}

/** Half-open interval intersection. Touching endpoints do not conflict. */
export function intervalsOverlap(aStart, aEnd, bStart, bEnd) {
  if (!aStart || !aEnd || !bStart || !bEnd) return false;
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Pairwise conflicts among events.
 *
 * Two classes are reported:
 *   TIMED   — two timed events whose intervals intersect. A real double-book.
 *   TRAVEL  — a timed event falling inside an all-day travel window.
 *
 * All-day vs all-day is deliberately NOT reported. Overlapping all-day events
 * are the normal state of a family calendar (a school term, a sports season,
 * and a holiday all span each other) and reporting them buries the real
 * double-bookings in noise.
 */
export function detectConflicts(events) {
  const conflicts = [];

  for (let i = 0; i < events.length; i++) {
    for (let j = i + 1; j < events.length; j++) {
      const a = events[i];
      const b = events[j];
      const aStart = eventStart(a);
      const aEnd = eventEnd(a);
      const bStart = eventStart(b);
      const bEnd = eventEnd(b);
      if (!intervalsOverlap(aStart, aEnd, bStart, bEnd)) continue;

      const aAllDay = isAllDay(a);
      const bAllDay = isAllDay(b);

      if (!aAllDay && !bAllDay) {
        conflicts.push({ type: 'TIMED', a, b });
        continue;
      }
      if (aAllDay && bAllDay) continue;

      const allDay = aAllDay ? a : b;
      const timed = aAllDay ? b : a;
      if (isTravelEvent(allDay) && isTravelConflict(timed)) {
        conflicts.push({ type: 'TRAVEL', a: timed, b: allDay });
      }
    }
  }

  return conflicts;
}

/**
 * Child-audience events falling inside a travel window.
 *
 * These are not conflicts for the traveller — they are the coverage the
 * remaining parent absorbs. Kept separate from detectConflicts() so the
 * conflict table stays actionable, but counted and reported so the load is
 * visible rather than filtered into nothing.
 */
export function findTravelCoverageLoad(events) {
  const load = [];
  for (const timed of events) {
    if (isAllDay(timed) || isTravelConflict(timed)) continue;
    const tStart = eventStart(timed);
    const tEnd = eventEnd(timed);
    for (const window of events) {
      if (window === timed || !isAllDay(window) || !isTravelEvent(window)) continue;
      if (intervalsOverlap(tStart, tEnd, eventStart(window), eventEnd(window))) {
        load.push({ event: timed, window });
        break;
      }
    }
  }
  return load;
}

// ── Rendering (pure) ──────────────────────────────────────────────────────

function fmtDate(date) {
  return date ? toDateKey(date) : '—';
}

function fmtTime(event) {
  if (isAllDay(event)) return 'all-day';
  const s = eventStart(event);
  const e = eventEnd(event);
  const f = d =>
    d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' });
  return `${f(s)}–${f(e)} ET`;
}

function esc(text) {
  return String(text || '').replace(/\|/g, '\\|');
}

export function renderBrief({ asOf, windowStart, windowEnd, items, conflicts, eventCount, calendarCount, calendarErrors = [], travelCoverage = [] }) {
  const open = items.filter(i => i.stillOpen);
  const aged = open.filter(i => i.weeksCarried >= AGED_THRESHOLD_WEEKS);
  const recent = open.filter(i => i.weeksCarried < AGED_THRESHOLD_WEEKS);
  const closed = items.filter(i => !i.stillOpen);
  const duplicates = findNearDuplicates(items);

  const L = [];
  L.push(`# OCC Aging Brief — ${toDateKey(asOf)}`);
  L.push('');
  L.push(
    `Generated by \`scripts/orchestrate/occ-aging.mjs\`. Source: Weekly Priorities ` +
      `calendar, ${fmtDate(windowStart)} → ${fmtDate(windowEnd)} (${LOOKBACK_WEEKS} weeks, ` +
      `${eventCount} events).`
  );
  L.push('');

  // ── Summary ──
  L.push('## Summary');
  L.push('');
  L.push('| | Count |');
  L.push('|---|---|');
  L.push(`| Still-open items | ${open.length} |`);
  L.push(`| — aged ${AGED_THRESHOLD_WEEKS}+ weeks (verdict required) | ${aged.length} |`);
  L.push(`| — under ${AGED_THRESHOLD_WEEKS} weeks | ${recent.length} |`);
  L.push(`| Closed in window | ${closed.length} |`);
  L.push(`| Conflicts, next ${CONFLICT_HORIZON_DAYS} days | ${conflicts.length} |`);
  L.push('');

  // ── Aged items ──
  L.push(`## Aged items — ${AGED_THRESHOLD_WEEKS}+ weeks carried`);
  L.push('');
  if (!aged.length) {
    L.push(`_Nothing has been carried ${AGED_THRESHOLD_WEEKS}+ weeks. Unusual — worth a glance at whether items are being retitled week to week, which would reset their age._`);
  } else {
    L.push(
      'Every row carries **BLOCKED**, **DEMOTE**, or **DEAD**. "Still active" is not ' +
        'available here — that is the whole point of this section.'
    );
    L.push('');
    L.push('| Item | Owner | Weeks open | Times listed | Verdict | Basis |');
    L.push('|---|---|---|---|---|---|');
    for (const item of aged) {
      const v = assignVerdict(item);
      const label = v.verdict === 'BLOCKED' ? `**BLOCKED** — ${esc(v.blocker)}` : `**${v.verdict}**`;
      L.push(
        `| ${esc(item.title)} | ${esc(item.owner)} | ${item.weeksCarried} | ${item.weeksAppeared} | ` +
          `${label} | ${esc(v.rationale)} |`
      );
    }
    L.push('');
    L.push(
      '> These verdicts are derived mechanically from item age and text — a script ' +
        'cannot know that something is dead. Treat them as a forced first proposal to ' +
        'accept or overrule, not a decision already made. The rule for each is in the ' +
        'Basis column.'
    );
  }
  L.push('');

  // ── Recent items ──
  L.push(`## Recent items — under ${AGED_THRESHOLD_WEEKS} weeks`);
  L.push('');
  if (!recent.length) {
    L.push('_None._');
  } else {
    L.push('Reported with age only. No verdict required yet.');
    L.push('');
    L.push('| Item | Owner | Weeks open | First seen | Last seen |');
    L.push('|---|---|---|---|---|');
    for (const item of recent) {
      L.push(
        `| ${esc(item.title)} | ${esc(item.owner)} | ${item.weeksCarried} | ` +
          `${fmtDate(item.firstSeen)} | ${fmtDate(item.lastSeen)} |`
      );
    }
  }
  L.push('');

  // ── Possible duplicates ──
  if (duplicates.length) {
    L.push('## Possible duplicates');
    L.push('');
    L.push(
      'Open items under the same owner with strongly overlapping wording. Reported, ' +
        'not merged — if these are the same commitment retyped, the older one carries ' +
        'the true age and the newer one is resetting the clock on it.'
    );
    L.push('');
    L.push('| Item A | Weeks open | Item B | Weeks open | Overlap |');
    L.push('|---|---|---|---|---|');
    for (const d of duplicates) {
      L.push(
        `| ${esc(d.a.title)} | ${d.a.weeksCarried} | ${esc(d.b.title)} | ${d.b.weeksCarried} | ` +
          `${Math.round(d.similarity * 100)}% |`
      );
    }
    L.push('');
  }

  // ── Conflicts ──
  L.push(`## Calendar conflicts — next ${CONFLICT_HORIZON_DAYS} days`);
  L.push('');
  L.push(`Scanned ${calendarCount - calendarErrors.length} of ${calendarCount} family calendars.`);
  L.push('');
  if (calendarErrors.length) {
    L.push(
      `> **Incomplete.** ${calendarErrors.length} calendar(s) could not be read, so a ` +
        `conflict involving them would not appear below:`
    );
    for (const e of calendarErrors) L.push(`> - \`${esc(e.name)}\` — ${esc(e.message)}`);
    L.push('');
  }
  if (!conflicts.length) {
    L.push('_No conflicts detected._');
  } else {
    L.push('| Type | Event | When | Conflicts with | When |');
    L.push('|---|---|---|---|---|');
    for (const c of conflicts) {
      L.push(
        `| ${c.type} | ${esc(c.a.summary || '(untitled)')} | ${fmtDate(eventStart(c.a))} ${fmtTime(c.a)} ` +
          `| ${esc(c.b.summary || '(untitled)')} | ${fmtDate(eventStart(c.b))} ${fmtTime(c.b)} |`
      );
    }
  }
  L.push('');

  if (travelCoverage.length) {
    const windows = [...new Set(travelCoverage.map(c => c.window.summary))];
    L.push(
      `Additionally, **${travelCoverage.length} child-audience events** (school blocks, ` +
        `practices, lessons) fall inside ${windows.length === 1 ? 'the travel window' : 'travel windows'} ` +
        `${windows.map(w => `_${esc(w)}_`).join(', ')}. These are not listed as conflicts — ` +
        `they are covered by school or by the parent staying home — but they are the ` +
        `coverage load that week, and worth a glance if solo-parenting is the plan.`
    );
    L.push('');
  }

  // ── Limitations ──
  L.push('## What this brief cannot see');
  L.push('');
  L.push(
    '**Travel is detected from event titles only.** There is no travel registry in ' +
      'this repo. `TRAVEL` conflicts above come from the same title regex the ' +
      'dashboard uses (`render/dashboard-v2.js` → `analyzeEventSemantics`, reason code ' +
      '`TRAVEL_FAMILY`), which matches words like *flight, airport, vacation, hotel, ' +
      'train, road trip, departure, travel*. A trip whose calendar entry says ' +
      '"Nashville — Grandma\'s" is invisible to it. Absence of a travel conflict below ' +
      'is not evidence that nobody is away.'
  );
  L.push('');
  L.push(
    '**All-day vs all-day overlaps are not reported.** Family calendars keep several ' +
      'multi-day spans running at once; listing every intersection would bury the real ' +
      'double-bookings. Only timed-vs-timed conflicts and timed-inside-travel are shown.'
  );
  L.push('');
  L.push(
    `**Item identity is title-based.** Items are matched across weeks by owner plus a ` +
      `normalized title. Substantially rewording an item between weeks starts its age ` +
      `over, so an aged item can be reset — accidentally or otherwise — by retyping it. ` +
      `The Possible duplicates section above is the mitigation, not a fix: it surfaces ` +
      `likely retypes for a human to reconcile rather than merging them automatically.`
  );
  L.push('');
  L.push(
    '**"Weeks open" is elapsed time, not attention.** It counts weeks since the item ' +
      'was first raised, whether or not anyone revisited it. "Times listed" is the ' +
      'companion number — a 1 there against a high weeks-open means the item was ' +
      'written down once and has not been looked at since.'
  );
  L.push('');
  L.push(
    '**An item is open if its most recent occurrence is not `[done]`.** An item ' +
      'completed and then re-raised later reads as open, with its full history counted ' +
      'toward the age.'
  );
  L.push('');

  return L.join('\n');
}

// ── Main ──────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { allowEmpty: false, out: null, quiet: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--allow-empty') args.allowEmpty = true;
    else if (argv[i] === '--quiet') args.quiet = true;
    else if (argv[i] === '--out') args.out = argv[++i];
  }
  return args;
}

function fail(code, message) {
  console.error(`[occ-aging] FATAL: ${message}`);
  process.exit(code);
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const log = args.quiet ? () => {} : msg => console.log(`[occ-aging] ${msg}`);

  const asOf = new Date();
  const windowEnd = new Date(asOf.getFullYear(), asOf.getMonth(), asOf.getDate());
  const windowStart = new Date(windowEnd);
  windowStart.setDate(windowStart.getDate() - LOOKBACK_WEEKS * 7);

  const horizonEnd = new Date(windowEnd);
  horizonEnd.setDate(horizonEnd.getDate() + CONFLICT_HORIZON_DAYS);

  // ── Auth ──
  let auth;
  try {
    auth = await getAuthClient();
  } catch (err) {
    fail(EXIT.AUTH, `could not obtain Google auth client — ${err.message}`);
  }
  log('auth ok');

  // ── Weekly Priorities, 8 weeks back ──
  let priorityEvents;
  try {
    priorityEvents = await fetchCalendarEventsStrict(
      auth,
      WEEKLY_PRIORITIES_CALENDAR_ID,
      windowStart.toISOString(),
      new Date(windowEnd.getTime() + 86400000).toISOString()
    );
  } catch (err) {
    fail(EXIT.FETCH, `Weekly Priorities fetch failed — ${err.message}`);
  }
  log(`fetched ${priorityEvents.length} Weekly Priorities events`);

  if (priorityEvents.length === 0 && !args.allowEmpty) {
    fail(
      EXIT.EMPTY,
      `Weekly Priorities returned 0 events for ${toDateKey(windowStart)} → ${toDateKey(windowEnd)}. ` +
        `Refusing to write an empty brief: a revoked token, a renamed calendar and a genuinely ` +
        `empty week are indistinguishable here. Re-run with --allow-empty if the calendar really is empty.`
    );
  }

  // ── Family calendars, next 14 days ──
  //
  // Per-calendar failures are COLLECTED, not fatal on the spot. One
  // permanently broken calendar in the map (the WJCC Schools feed is an
  // imported ICS and does go missing) would otherwise kill every run forever,
  // and the conflict scan is still worth having from the eight that answered.
  //
  // This is not a retreat to silent degradation: the failures are printed to
  // stderr, named in the brief itself, and the process still exits non-zero at
  // the end. You get the partial answer AND you find out it was partial.
  const familyEvents = [];
  const calendarErrors = [];
  for (const [name, id] of Object.entries(FAMILY_CALENDARS)) {
    try {
      const items = await fetchCalendarEventsStrict(
        auth,
        id,
        windowEnd.toISOString(),
        horizonEnd.toISOString()
      );
      for (const ev of items) familyEvents.push({ ...ev, calendarName: name });
    } catch (err) {
      console.error(`[occ-aging] WARNING: calendar "${name}" fetch failed — ${err.message}`);
      calendarErrors.push({ name, message: err.message });
    }
  }
  const horizonEvents = dedupeById(familyEvents);
  const reached = Object.keys(FAMILY_CALENDARS).length - calendarErrors.length;
  log(`fetched ${horizonEvents.length} events across ${reached}/${Object.keys(FAMILY_CALENDARS).length} calendars`);

  // ── Analyse ──
  const items = aggregateOccItems(priorityEvents, { asOf });
  const conflicts = detectConflicts(horizonEvents);
  const travelCoverage = findTravelCoverageLoad(horizonEvents);
  log(`${items.filter(i => i.stillOpen).length} open items, ${conflicts.length} conflicts`);

  // ── Write ──
  const outPath = args.out || path.join('analysis', `occ-aging-${toDateKey(asOf)}.md`);
  const brief = renderBrief({
    asOf,
    windowStart,
    windowEnd,
    items,
    conflicts,
    eventCount: priorityEvents.length,
    calendarCount: Object.keys(FAMILY_CALENDARS).length,
    calendarErrors,
    travelCoverage,
  });

  try {
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, brief, 'utf8');
  } catch (err) {
    fail(EXIT.WRITE, `could not write ${outPath} — ${err.message}`);
  }

  log(`wrote ${outPath}`);

  if (calendarErrors.length) {
    console.error(
      `[occ-aging] FATAL: ${calendarErrors.length} calendar(s) unreachable — ` +
        `${calendarErrors.map(e => e.name).join(', ')}. Brief written to ${outPath} but ` +
        `the conflict scan is incomplete.`
    );
    process.exit(EXIT.FETCH);
  }

  return outPath;
}

// Run only when invoked directly, so the module stays importable by tests.
const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);

if (invokedDirectly) {
  main().catch(err => {
    console.error(`[occ-aging] FATAL: unexpected — ${err.stack || err.message}`);
    process.exit(EXIT.UNEXPECTED);
  });
}
