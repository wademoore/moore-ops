/**
 * digest/flagFootballIdentity.js
 * Moore Family Operations Assistant
 *
 * Joins calendar occurrences to Myles's flag football season data so that
 * surfaces which receive *events* — Today, NOW/NEXT, the two-week Coming Up
 * panel — can name the league team an occurrence belongs to. The athletics
 * card already had this: parseFlagFootball() hands it a resolved mascot. A
 * calendar event carried nothing, so render/dashboard-v2.js's activityLogo()
 * had no way to select flag football artwork for a row.
 *
 * Internal module. Pure: no I/O, no new Date() of its own, no throwing on
 * malformed input. Every failure resolves to "no identity", and every failure
 * that is *recognisably this sport* is additionally reported as a gap so it
 * cannot be silent.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE ASSOCIATION IS BY DATE ALONE — read this before "fixing" it
 * ─────────────────────────────────────────────────────────────────────────
 * A calendar occurrence is matched to a season row on its ET calendar date,
 * and on nothing else. Not the title, not the declared clock, and never the
 * team id typed into the event description.
 *
 *   Not the title, because a title is a human-retyped description of a
 *   fixture rather than the fixture. Wade edits these by hand and the league
 *   renames weeks; PR #65 exists because a literal title match went stale.
 *
 *   Not the clock, because the clock is the single most volatile field on
 *   the row — the league reschedules within the day and both a practiceTime
 *   and a game time exist for the same occurrence. The failure modes are
 *   asymmetric: a logo missing from a game whose time shifted is invisible,
 *   while a missing logo on a Sunday morning is the thing Wade would
 *   actually notice. So the permissive match is the correct one.
 *
 *   Not the description, because the description does contain the league
 *   team id — but only because it was typed there by hand on six events. A
 *   note is not a source of truth, and reading it would create an obligation
 *   to maintain it forever.
 *
 * DELIBERATE DIVERGENCE FROM PR #65. That PR adds a `seasonMilestone`
 * qualification node in digest/specialEventQualify.js which matches on (date,
 * kind, declared clock). #65 is OPEN, NOT MERGED at the time of writing —
 * `seasonMilestone` does not exist in this tree, so do not go looking for it —
 * and this module matches on date alone. That is not an oversight and not an inconsistency to
 * be tidied away in either direction: a milestone accent that misfires paints
 * an approved decoration onto the wrong row, while a team logo that misfires
 * merely fails to appear. Different costs justify different strictness. Do
 * not tighten this one and do not loosen that one.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * RECOGNITION IS A SEPARATE STEP FROM ASSOCIATION, AND IS REQUIRED
 * ─────────────────────────────────────────────────────────────────────────
 * "Match by date alone" is how an occurrence finds its *row*; it is not a
 * licence to claim every occurrence sharing that date. Measured on the live
 * calendars: every Fall 2026 fixture falls on a Sunday, and the Family
 * calendar's recurring "2nd Sundays (optional drop-in)" lands on two of them
 * (2026-09-13 and 2026-10-11). Date alone, with no sport predicate, would put
 * Cowboys artwork on an art festival.
 *
 * Recognition is deliberately narrow (Wade, 2026-10-21) and reads two signals:
 *   (a) the TITLE BEGINS with the sport token declared by the data file itself
 *       (flagFootballData.sport, "Flag Football") — the league convention is
 *       "Flag Football: Week 2 — vs …" — in either the resolved title or the
 *       raw calendar summary. The token must end the word and must not be
 *       followed by "Club". It may be preceded only by the athlete's owner
 *       prefix ("Myles: …") and/or our own team name, which is what
 *       digest/aliases.js writes ("Cowboys Flag Football Practice"); or
 *   (b) the pre-existing isFlagGame marker set by digest/aliases.js, which
 *       covers the older "Flag Cowboys vs. Raiders" title convention that
 *       contains no "flag football" at all.
 *
 * Either way, an occurrence whose title says it is a placeholder, or a picture
 * day that names no opponent, is NOT a league fixture and is never recognised:
 * it names no fixture the season data could hold, so reporting it as a gap
 * would be a false alarm, and giving it a team identity would dress a non-game
 * as one. That exclusion wins over isFlagGame too. "TBD" alone is not on the
 * list, because "(time TBD)" can sit on a real game; and a title that names an
 * opponent ("vs Ravens (Picture Day)") stays a game, because picture day can
 * fall on a game day.
 *
 * WHY "begins with" AND NOT "contains". The earlier rule recognised any title
 * containing the token. That made "Myles: SHIP Flag Football Club" — a school
 * club, an ordinary calendar activity — look like a league event: it raised a
 * schedule-gap entry every session, and on a date that happened to carry a
 * fixture it would have taken our team's identity and logo. Nothing but a
 * league entry may do that. What keeps the club out is that "SHIP" sits between
 * the owner prefix and the token, and that "Club" may not follow the token.
 *
 * Taking the token from the data rather than hardcoding it keeps the
 * recognition vocabulary in the same file as the fixtures — the file the
 * Updater already maintains — instead of splitting it across two places that
 * can drift.
 *
 * ── THE LIMIT, STATED PLAINLY RATHER THAN GLOSSED ──
 * Recognition still reads the calendar TITLE, so a title edit changes it:
 *   - Retitle a league entry so it no longer begins with the token (after the
 *     optional owner and team prefixes) and it resolves to no identity AND
 *     raises no gap (a silent miss). "Game vs Ravens — Flag Football" is such
 *     a title.
 *   - Prefix a league title with anything but the athlete and team names
 *     ("Myles - Flag Football", an emoji) and it is a silent miss too.
 *   - Word a new placeholder in a way the exclusion does not cover, or name
 *     a game "vs TBD", and it raises a gap (a visible false alarm). That
 *     direction is the safer one, which is why the exclusion is a short wording
 *     list rather than a guess, and why the boundary after the token is wide.
 * (b) is set by a single title regex in aliases.js (/^flag\s+.+?\s+vs\.?\s+/i)
 * and is strictly redundant in production: when it fires the title is
 * rewritten to `Cowboys Flag Football — vs. ${opponent}`, which (a) already
 * matches. Only a hand-built fixture exercises the (b)-only path.
 *
 *   - ASSOCIATION is what must not depend on a title, and it does not. A
 *     renamed league event on a fixture date still resolves, which is the
 *     case that actually matters day to day.
 *   - RECOGNITION has no non-title signal available that is any more durable.
 *     The obvious candidate is the venue: the season declares `location`
 *     ("McReynolds Athletic Complex") and all live occurrences carry it. It
 *     was REJECTED, deliberately. A public athletic complex is shared
 *     infrastructure, so recognising on it would re-open the exact over-match
 *     hole the "2nd Sundays" measurement closed — any event at that venue on a
 *     fixture date would take Cowboys artwork — and the location field is
 *     hand-typed too, so it is not more durable than the title, only broader.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ONLY IMMUTABLE COLUMNS ARE REACHABLE
 * ─────────────────────────────────────────────────────────────────────────
 * The projected identity carries seasonId, seasonLabel, week, the row's own
 * `type`, and the two team records. It does NOT carry `status`, `homeScore`
 * or `awayScore`: an identity that moved when a score was entered would stop
 * being an identity. They are absent from the object rather than merely
 * undocumented, which is the same discipline sportsFixture already follows.
 *
 * `home` / `away` are likewise absent BY DESIGN. Home/away is nominal in this
 * league — every fixture is at the same complex — so it is not a travel cue
 * and must never be rendered or reasoned about as one. Structural absence
 * beats a rule a future reader could talk their way past: there is no field
 * ON THIS IDENTITY in which a renderer could find it. The unqualified form of
 * that sentence stopped being true when `nextFlagGame.homeAway` landed in
 * flagFootballParser.js, which states the side of the NEXT fixture off that
 * row's own ids. What holds here is the absence from this projection.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * IDENTITY IS THE NUMERIC LEAGUE TEAM ID, NEVER THE MASCOT
 * ─────────────────────────────────────────────────────────────────────────
 * The Fall 2026 Yorktown 5th-6th Grade Rec division contains TWO teams whose
 * mascot is "Cowboys" — Moore - Cowboys (8009182, ours) and Watkins -
 * Cowboys. The mascot is not a unique identifier there, so a mascot match,
 * exact or fuzzy, is ambiguous. teamName rides along for artwork selection
 * only; nothing here ever resolves identity from it.
 *
 * This is deliberately the OPPOSITE of digest/sharksParser.js. Sharks fuzzy-
 * matches because its mascot IS unique and only the wording of the team
 * string varies between the schedule and the standings. That is the opposite
 * problem, and copying its approach here would be a bug.
 */

import { parseEventDate, toDateKey } from './dateUtils.js';
import { occurrenceId } from './specialEventOccurrences.js';

/** Why an occurrence that presents as flag football carries no identity. */
const GAP_REASON = Object.freeze({
  NO_FIXTURE: 'no-fixture-on-date',
  AMBIGUOUS_DATE: 'multiple-fixtures-on-date',
  // A row for our team exists on the date, but season.myTeamId is not in
  // season.teams[]. Distinct from NO_FIXTURE because the remedy is different
  // and the flag says so: the schedule is fine, the roster is wrong.
  TEAM_UNRESOLVED: 'team-not-in-season-roster',
});

const isNumericTeamId = value => typeof value === 'number' && Number.isFinite(value);

/** Fold to a comparable form: lowercase, whitespace collapsed. */
function norm(value) {
  return String(value ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Titles that name no fixture the season data could hold. Matched on normalised text. */
const PLACEHOLDER = /\bplaceholder\b/;
const PICTURE_DAY = /\bpicture\s+day\b/;
/** A title that names an opponent ("… vs Ravens") is a game, whatever else it mentions. */
const NAMES_OPPONENT = /\bvs\.?(?![a-z0-9])/;

function isNotAFixture(text) {
  return PLACEHOLDER.test(text) || (PICTURE_DAY.test(text) && !NAMES_OPPONENT.test(text));
}

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Seasons that can express this contract: those keyed on a numeric league
 * team id. Legacy abbr-keyed seasons (fall-2025, spring-2026) are skipped
 * rather than half-supported — the whole point of this join is the numeric
 * id, and flagFootballParser.js already documents that a season carries ids
 * on every team or on none, so the two never mix.
 */
/*
 * Known narrowing, recorded rather than left implicit: a recognised occurrence
 * whose only candidate season is abbr-keyed reports NO_FIXTURE, and the flag
 * body for that reason says the fixture is absent from the record and the
 * standings — which would be false, because an abbr-keyed season's rows are
 * read by flagFootballParser.js perfectly well. Unreachable in practice: both
 * legacy seasons ended in June 2026, far outside any calendar pull window. If
 * an abbr-keyed season is ever revived, this needs its own reason code.
 */
function idKeyedSeasons(flagFootballData) {
  const seasons = Array.isArray(flagFootballData?.seasons) ? flagFootballData.seasons : [];
  return seasons.filter(season => isNumericTeamId(season?.myTeamId) && Array.isArray(season?.games));
}

/** The event's ET calendar date key, or null. */
function eventDateKey(event) {
  const date = parseEventDate(event?.raw || {});
  return date ? toDateKey(date) : null;
}

/**
 * Does this occurrence present as this sport at all?
 *
 * The gap report calls this directly and needs no export; it is exported for
 * the test matrix and for scratch/flag-football-event-identity/measure-live-join.mjs,
 * which reports the recognised-occurrence count against the live calendars.
 * The distinction it draws is the one the gap report turns on: an occurrence
 * that is not recognisably flag football and finds no fixture is simply an
 * ordinary unrelated event, not a gap.
 */
function isFlagFootballOccurrence(event, flagFootballData) {
  if (!event) return false;

  // The two places a calendar title lives: the resolved title and the raw
  // summary. The subtitle is deliberately not read — it carries times and
  // venue, never the league's title convention.
  const titles = [event.title, event.raw?.summary]
    .filter(text => typeof text === 'string' && text.trim())
    .map(norm);

  // A placeholder, or a picture day that names no opponent, is not a fixture.
  // "TBD" alone is deliberately NOT in that list: "(time TBD)" can sit on a
  // real game, and missing a real game silently is the worse error. A title
  // that names an opponent ("… vs Ravens (Picture Day)") stays a game, for the
  // same reason: picture day can fall on a game day.
  if (titles.some(isNotAFixture)) return false;

  if (event.isFlagGame === true) return true;

  const token = norm(flagFootballData?.sport);
  if (!token) return false;

  // Our own team name may precede the token (aliases.js writes
  // "Cowboys Flag Football Practice"), and so may the athlete's owner prefix
  // ("Myles: Flag Football: Week 3"); nothing else may.
  const teamNames = (Array.isArray(flagFootballData?.seasons) ? flagFootballData.seasons : [])
    .map(season => norm(season?.teamName))
    .filter(Boolean);
  const athlete = norm(flagFootballData?.athlete);
  const athletePrefix = athlete ? `(?:${escapeRegExp(athlete)}:\\s*)?` : '';
  const teamPrefix = teamNames.length ? `(?:(?:${teamNames.map(escapeRegExp).join('|')})\\s+)?` : '';
  // The token must end the word (so "Flag Footballs" is not it) and must not be
  // followed by "Club" — the SHIP school club, retitled however it is.
  const leagueTitle = new RegExp(`^${athletePrefix}${teamPrefix}${escapeRegExp(token)}(?![a-z0-9])(?!\\s+club\\b)`);

  return titles.some(text => leagueTitle.test(text));
}

/** Project a team row to the display identity. teamName is for artwork only. */
function projectTeam(team) {
  if (!team || !isNumericTeamId(team.teamId)) return null;
  return {
    teamId: team.teamId,
    teamName: typeof team.teamName === 'string' ? team.teamName : null,
    leagueName: typeof team.leagueName === 'string' ? team.leagueName : null,
  };
}

/** Is this row one OUR team plays in? Compared by id, never by mascot. */
function involvesMyTeam(fixture, season) {
  return fixture.home === season.myTeamId || fixture.away === season.myTeamId;
}

/**
 * Find the season row for a date key, across every id-keyed season.
 *
 * Candidates are restricted to rows OUR TEAM PLAYS IN before ambiguity is
 * judged, and that ordering is load-bearing in both directions:
 *
 *   - Without the restriction, a row on our date between two OTHER teams
 *     returns a full identity naming our team, with `opponent: null` — which
 *     is indistinguishable from the legitimate shape of a bye or a practice.
 *     Unreachable while `fall-2026.games` holds only our six fixtures, but
 *     `fall-2025` in the same file already stores the whole division schedule,
 *     and a Known open item contemplates loading one for this season too.
 *
 *   - Judging ambiguity first would then break that same case the other way:
 *     a full division schedule puts several rows on every date, so every
 *     occurrence would resolve as AMBIGUOUS_DATE even though exactly one of
 *     those rows is ours. Filtering first makes the full-schedule shape
 *     resolve correctly rather than failing closed on a crowd.
 *
 * Returns { season, fixture } on a unique hit, { ambiguous: true } when a date
 * carries more than one row we play in (a real doubleheader — picking one
 * would be an array-order decision), and null when nothing matches.
 */
function findFixtureByDate(flagFootballData, dateKey) {
  if (!dateKey) return null;
  const hits = [];
  for (const season of idKeyedSeasons(flagFootballData)) {
    for (const fixture of season.games) {
      if (typeof fixture?.date !== 'string' || fixture.date !== dateKey) continue;
      if (!involvesMyTeam(fixture, season)) continue;
      hits.push({ season, fixture });
    }
  }
  if (hits.length === 0) return null;
  if (hits.length > 1) return { ambiguous: true };
  return hits[0];
}

/**
 * Resolve the display identity for one already-resolved calendar event.
 *
 * @returns {{identity: object|null, gapReason: string|null}}
 *   gapReason is non-null only when the occurrence is recognisably flag
 *   football AND no identity could be resolved. An unrelated event yields
 *   {identity: null, gapReason: null} — silence is correct for those.
 */
function resolveFlagFootballIdentity(event, flagFootballData) {
  const recognised = isFlagFootballOccurrence(event, flagFootballData);
  const match = findFixtureByDate(flagFootballData, eventDateKey(event));

  if (!match) {
    return { identity: null, gapReason: recognised ? GAP_REASON.NO_FIXTURE : null };
  }
  if (match.ambiguous) {
    return { identity: null, gapReason: recognised ? GAP_REASON.AMBIGUOUS_DATE : null };
  }
  // A fixture exists on this date, but the occupant of the date is not this
  // sport (the measured "2nd Sundays" case). Not an identity, and not a gap.
  if (!recognised) return { identity: null, gapReason: null };

  const { season, fixture } = match;
  const teamsById = new Map(
    (Array.isArray(season.teams) ? season.teams : [])
      .filter(team => isNumericTeamId(team?.teamId))
      .map(team => [team.teamId, team]),
  );

  const mine = projectTeam(teamsById.get(season.myTeamId));
  // A fixture we play in exists, but our own id is missing from teams[]. That
  // is a roster problem, not a schedule problem, so it gets its own reason
  // rather than being reported as "no fixture on that date", which would send
  // the reader to the wrong half of the file.
  // `recognised` is provably true here — the !recognised case returned above —
  // so this is unconditional rather than a ternary whose null branch cannot run.
  if (!mine) return { identity: null, gapReason: GAP_REASON.TEAM_UNRESOLVED };

  // The opponent is whichever side of the fixture is not us, looked up by id.
  // Never by mascot: this division contains a second "Cowboys". findFixtureByDate
  // has already guaranteed one of the two sides is us, so the remaining null
  // case is a genuine no-opponent row (the Sept 13 Meet & Greet practice).
  //
  // The self-fixture guard is the one place this module could have failed OPEN
  // rather than closed: a malformed row naming us on BOTH sides satisfies
  // involvesMyTeam, and the expression below would then hand back our own team
  // as the opponent — a plausible-looking identity for a fixture that cannot
  // exist. Unreachable in real data; guarded because "fails open" is the wrong
  // direction for the one case, not because the case is expected.
  const selfFixture = fixture.home === season.myTeamId && fixture.away === season.myTeamId;
  const opponentId = selfFixture ? null
    : fixture.home === season.myTeamId ? fixture.away
    : fixture.home;
  const opponent = isNumericTeamId(opponentId) ? projectTeam(teamsById.get(opponentId)) : null;

  return {
    identity: {
      seasonId: typeof season.seasonId === 'string' ? season.seasonId : null,
      seasonLabel: typeof season.label === 'string' ? season.label : null,
      week: typeof fixture.week === 'number' ? fixture.week : null,
      // The row's own `type`, verbatim. This REPORTS the classification the
      // data already carries; it does not compute one. Nothing here may
      // reclassify a practice as a game — the record, the standings and
      // nextFlagGame all read digest/flagFootballParser.js, which this module
      // does not touch and does not import.
      fixtureType: typeof fixture.type === 'string' ? fixture.type : null,
      team: mine,
      opponent,
    },
    gapReason: null,
  };
}

/**
 * Attach `flagFootball` to every event in a resolved array.
 *
 * Additive and non-mutating: returns new objects carrying exactly one extra
 * key. The key is always present so a consumer has one shape to branch on,
 * and is null on every event that is not an associated flag football
 * occurrence.
 */
function attachFlagFootballIdentity(resolvedEvents, flagFootballData) {
  if (!Array.isArray(resolvedEvents)) return [];
  return resolvedEvents.map(event => ({
    ...event,
    flagFootball: resolveFlagFootballIdentity(event, flagFootballData).identity,
  }));
}

/**
 * Collect the occurrences that present as flag football and resolved to no
 * identity, deduplicated by calendar occurrence.
 *
 * This is the visible-gap half of the contract. Two features now depend on
 * the calendar/season join, and without this the only signal that it broke
 * would be something quietly absent on a Sunday morning. builder.js hands the
 * result to digest/flags.js, which is the same route digest-level breakage
 * already takes (see the calendar-fetch-failure evaluator).
 *
 * Its reach is the CALENDAR PULL'S own reach, not an independent window:
 * getCalendarEvents() is 72 hours ahead and pull14Days() is 14 days ahead plus
 * SEVEN DAYS OF HISTORY. So a gap is reported from the moment the occurrence
 * enters the 14-day pull, and keeps being reported for up to a week after it
 * has passed — deliberately, because entering a result for a fixture that is
 * not in the file is as actionable as entering the fixture was.
 *
 * @returns {{date: string|null, title: string, calendar: string, reason: string}[]}
 *   sorted by date then title, so the flag body is stable run to run.
 */
function collectFlagFootballGaps(resolvedEventGroups, flagFootballData) {
  const groups = Array.isArray(resolvedEventGroups) ? resolvedEventGroups : [];
  const seen = new Set();
  const gaps = [];

  for (const group of groups) {
    for (const event of Array.isArray(group) ? group : []) {
      const { gapReason } = resolveFlagFootballIdentity(event, flagFootballData);
      if (!gapReason) continue;

      const dateKey = eventDateKey(event);
      // occurrenceId() is the identity the accent renderer already joins on;
      // reusing it keeps one notion of "the same occurrence" in the codebase.
      // It is null for an event with no calendar id, so fall back to the
      // fields that do identify it rather than dropping the gap.
      const key = occurrenceId(event) || `${dateKey}|${norm(event?.title)}|${norm(event?._calName)}`;
      if (seen.has(key)) continue;
      seen.add(key);

      gaps.push({
        date: dateKey,
        title: typeof event?.title === 'string' && event.title ? event.title : '(untitled event)',
        calendar: typeof event?._calName === 'string' ? event._calName : '',
        reason: gapReason,
      });
    }
  }

  return gaps.sort((a, b) =>
    String(a.date).localeCompare(String(b.date)) || a.title.localeCompare(b.title));
}

export {
  GAP_REASON,
  attachFlagFootballIdentity,
  collectFlagFootballGaps,
  isFlagFootballOccurrence,
  resolveFlagFootballIdentity,
};
