/**
 * scratch/flag-football-event-identity/mutation-check.mjs
 *
 * Proves the guards in this change have teeth, by breaking the shipped code in
 * one specific way at a time and requiring the suite to go red FOR THAT REASON.
 * A test that passes is not evidence; a test that would still pass against a
 * broken implementation is the defect this harness exists to find.
 *
 * Not part of npm test — package.json's globs are test/**, digest/** and
 * render/**, and nothing under scratch/ is selected.
 *
 *   node scratch/flag-football-event-identity/mutation-check.mjs
 *
 * It overwrites tracked files in place and restores them at both ends, so it
 * refuses to start from a dirty digest/ tree. `git checkout -- digest` is
 * always a complete recovery from an interrupted run.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const IDENTITY = join(REPO, 'digest', 'flagFootballIdentity.js');
const SELECTOR = join(REPO, 'digest', 'nowNextSelector.js');
const FLAGS = join(REPO, 'digest', 'flags.js');
const BUILDER = join(REPO, 'digest', 'builder.js');

const SUITE = [
  'digest/flagFootballIdentity.test.js',
  'digest/nowNextSelector.test.js',
  'digest/flags.test.js',
  'digest/builder.test.js',
];

// ── Clean-tree guard ────────────────────────────────────────────────────────
// `.stdout?.trim()` is undefined when git itself fails, which is falsy — so
// check the exit status explicitly rather than failing open on it.
const status = spawnSync('git', ['status', '--porcelain', '--', 'digest'], { cwd: REPO, encoding: 'utf8' });
if (status.status !== 0) {
  console.error('could not read git status — refusing to run');
  process.exit(1);
}
if (status.stdout.trim()) {
  console.error('digest/ has uncommitted changes. This harness rewrites tracked files in place.');
  console.error('Commit or stash them first (note: plain `git stash` does not include untracked files;');
  console.error('use `git stash -u`, or commit). Then re-run.');
  process.exit(1);
}

const ORIGINAL = new Map([IDENTITY, SELECTOR, FLAGS, BUILDER].map(p => [p, readFileSync(p, 'utf8')]));
const restore = () => { for (const [p, text] of ORIGINAL) writeFileSync(p, text); };

/**
 * Apply an ordered list of exact textual substitutions to a pristine file,
 * failing loudly if any anchor does not match exactly once.
 *
 * Every edit is composed in memory and the file is written once, so nothing
 * intermediate is ever placed on disk. An earlier version stashed half-edited
 * text back into the ORIGINAL map under a synthetic `file::tmp` key — and
 * since restore() writes every key in that map as a path, it created a real
 * `digest/flagFootballIdentity.js::tmp` file, which was committed before the
 * diff review caught it. Composing in memory removes the possibility rather
 * than cleaning up after it.
 */
function mutate(file, edits) {
  let text = ORIGINAL.get(file);
  for (const [from, to] of edits) {
    const count = text.split(from).length - 1;
    if (count !== 1) throw new Error(`mutation anchor matched ${count} times in ${file}:\n${from}`);
    text = text.replace(from, to);
  }
  writeFileSync(file, text);
}

function runSuite() {
  const res = spawnSync(process.execPath, ['--test', ...SUITE], { cwd: REPO, encoding: 'utf8' });
  const out = `${res.stdout}${res.stderr}`;
  const pass = Number(out.match(/^# pass (\d+)$/m)?.[1] ?? NaN);
  const fail = Number(out.match(/^# fail (\d+)$/m)?.[1] ?? NaN);
  // A run that produced no summary at all (a syntax error, a crash, a hang)
  // parses the same as a run with no failures. Report it as its own outcome
  // rather than scoring it as a survival or as a kill.
  if (!Number.isFinite(pass) || !Number.isFinite(fail)) return { inconclusive: true, out };
  return { pass, fail, out };
}

const MUTATIONS = [
  {
    name: 'match by date with NO sport recognition',
    why: 'the 2nd Sundays case — an unrelated event on a fixture date must not be claimed',
    file: IDENTITY,
    from: '  if (!recognised) return { identity: null, gapReason: null };',
    to: '  if (!recognised) { /* mutated: claim any event on a fixture date */ }',
  },
  {
    name: 'also require the declared clock to agree',
    why: 'the whole point of the date-alone decision — a rescheduled event must still resolve',
    file: IDENTITY,
    from: '      if (!involvesMyTeam(fixture, season)) continue;',
    to: "      if (!involvesMyTeam(fixture, season)) continue;\n      if (String(event?.raw?.start?.dateTime || '').slice(11, 16) !== (fixture.practiceTime ?? fixture.time)) continue;",
    extraFrom: 'function findFixtureByDate(flagFootballData, dateKey) {',
    extraTo: 'function findFixtureByDate(flagFootballData, dateKey, event) {',
    alsoFrom: '  const match = findFixtureByDate(flagFootballData, eventDateKey(event));',
    alsoTo: '  const match = findFixtureByDate(flagFootballData, eventDateKey(event), event);',
  },
  {
    name: 'require the title to match a literal',
    why: 'association must ignore titles — a renamed event on a fixture date must still resolve',
    file: IDENTITY,
    from: '  const recognised = isFlagFootballOccurrence(event, flagFootballData);',
    to: "  const recognised = isFlagFootballOccurrence(event, flagFootballData)\n    && String(event?.title || '') === 'Flag Football: Week 2 — vs Langston-Ravens (Home)';",
  },
  {
    name: 'resolve OUR team by mascot instead of id',
    why: 'the division contains two Cowboys — a mascot match is ambiguous by construction',
    file: IDENTITY,
    from: '  const mine = projectTeam(teamsById.get(season.myTeamId));',
    to: "  const mine = projectTeam((Array.isArray(season.teams) ? season.teams : []).find(t => t.teamName === season.teamName));",
  },
  {
    name: 'resolve the OPPONENT by mascot instead of id',
    why: 'same ambiguity, on the other side of the fixture',
    file: IDENTITY,
    from: '  const opponent = isNumericTeamId(opponentId) ? projectTeam(teamsById.get(opponentId)) : null;',
    to: "  const oppRow = isNumericTeamId(opponentId) ? teamsById.get(opponentId) : null;\n  const opponent = oppRow ? projectTeam((season.teams || []).find(t => t.teamName === oppRow.teamName)) : null;",
  },
  {
    name: 'stop reporting gaps',
    why: 'an unmatched occurrence must never resolve silently — this is the point of the change',
    file: IDENTITY,
    from: '      if (!gapReason) continue;',
    to: '      if (!gapReason || true) continue;',
  },
  {
    name: 'report unrelated events as gaps too',
    why: 'an ordinary unrelated event is not a gap; over-reporting would make the flag noise',
    file: IDENTITY,
    from: '    return { identity: null, gapReason: recognised ? GAP_REASON.NO_FIXTURE : null };\n  }\n  if (match.ambiguous) {',
    to: '    return { identity: null, gapReason: GAP_REASON.NO_FIXTURE };\n  }\n  if (match.ambiguous) {',
  },
  {
    name: 'expose status and both scores on the identity',
    why: 'identity must stay valid mid-event; a mutable column would move it when a score is entered',
    file: IDENTITY,
    from: '      team: mine,\n      opponent,',
    to: '      status: fixture.status,\n      homeScore: fixture.homeScore,\n      awayScore: fixture.awayScore,\n      team: mine,\n      opponent,',
  },
  {
    name: 'expose home and away on the identity',
    why: 'home/away is nominal here and must not be reachable as a travel cue',
    file: IDENTITY,
    from: '      team: mine,\n      opponent,',
    to: '      home: fixture.home,\n      away: fixture.away,\n      team: mine,\n      opponent,',
  },
  {
    name: 'pick the first fixture on an ambiguous date',
    why: 'two rows on one date must fail closed and be reported, not resolved by array order',
    file: IDENTITY,
    from: '  if (hits.length > 1) return { ambiguous: true };',
    to: '  if (hits.length > 1) return hits[0];',
  },
  {
    name: 'hardcode the sport token instead of reading it from the data file',
    why: 'the recognition vocabulary must live beside the fixtures, not split across two files',
    file: IDENTITY,
    from: "  const token = norm(flagFootballData?.sport);",
    to: "  const token = 'flag football';",
  },
  {
    name: 'read the team id out of the event description',
    why: 'the description carries the id by hand on six events; it is a note, not a source of truth',
    file: IDENTITY,
    from: '  const match = findFixtureByDate(flagFootballData, eventDateKey(event));',
    to: "  const described = String(event?.raw?.description || '').match(/league team id (\\d+)/);\n  const match = findFixtureByDate(flagFootballData, eventDateKey(event))\n    || (described ? { season: idKeyedSeasons(flagFootballData)[0], fixture: { week: null, type: null, home: Number(described[1]), away: null, date: null } } : null);",
  },
  {
    name: 'mutate the event in place instead of copying',
    why: 'attachment must be non-mutating — a shared event object is reachable from several arrays',
    file: IDENTITY,
    from: '  return resolvedEvents.map(event => ({\n    ...event,\n    flagFootball: resolveFlagFootballIdentity(event, flagFootballData).identity,\n  }));',
    to: '  return resolvedEvents.map(event => {\n    event.flagFootball = resolveFlagFootballIdentity(event, flagFootballData).identity;\n    return event;\n  });',
  },
  {
    name: 'drop identity from the NOW/NEXT featured projection',
    why: 'the featured block is a projection; a field only on the candidate never reaches a renderer',
    file: SELECTOR,
    from: '    flagFootball: selected.flagFootball ?? null,\n    supporting,',
    to: '    supporting,',
  },
  {
    name: "drop identity from the NOW/NEXT 'Tonight' supporting projection",
    why: 'supportFrom builds two blocks from separate literals; each needs its own guard',
    file: SELECTOR,
    from: ", flagFootball: tonight.flagFootball ?? null }",
    to: " }",
  },
  {
    name: "drop identity from the NOW/NEXT later supporting projection",
    why: 'the other of the two blocks — this is the one the first harness run left uncovered',
    file: SELECTOR,
    from: ", flagFootball: later.flagFootball ?? null }",
    to: " }",
  },
  {
    name: 'accept a fixture between two OTHER teams on our date',
    why: 'a foreign row would return a full identity naming us, with opponent null',
    file: IDENTITY,
    from: '      if (!involvesMyTeam(fixture, season)) continue;',
    to: '      // mutated: any fixture on the date is a candidate',
  },
  {
    // Attacks the ORDER, not the filter. The previous mutation deletes the
    // filter; this one KEEPS it and moves the ambiguity check in front of it,
    // so the two are behaviourally different programs. An earlier version of
    // this entry deleted the same guard as its neighbour and was therefore a
    // duplicate padding the count — caught by review, not by the harness,
    // because a duplicate mutation still gets killed and still scores.
    name: 'judge ambiguity BEFORE narrowing to our own fixtures',
    why: 'a full division schedule puts several rows on every date; only one is ours',
    file: IDENTITY,
    from: `      if (typeof fixture?.date !== 'string' || fixture.date !== dateKey) continue;
      if (!involvesMyTeam(fixture, season)) continue;
      hits.push({ season, fixture });
    }
  }
  if (hits.length === 0) return null;
  if (hits.length > 1) return { ambiguous: true };
  return hits[0];`,
    to: `      if (typeof fixture?.date !== 'string' || fixture.date !== dateKey) continue;
      hits.push({ season, fixture });
    }
  }
  if (hits.length > 1) return { ambiguous: true };
  const mineOnly = hits.filter(hit => involvesMyTeam(hit.fixture, hit.season));
  if (mineOnly.length === 0) return null;
  return mineOnly[0];`,
  },
  {
    name: 'sweep only the 72-hour window for gaps',
    why: 'a gap can sit anywhere in the 14-day lookahead; the 72h set would miss it',
    file: BUILDER,
    from: 'collectFlagFootballGaps([allResolved, allResolved14d], flagFootballData)',
    to: 'collectFlagFootballGaps([allResolved], flagFootballData)',
  },
  {
    name: 'drop the isFlagGame recognition branch',
    why: 'the older "Flag Cowboys vs. Raiders" convention carries no sport token at all',
    file: IDENTITY,
    from: '  if (event.isFlagGame === true) return true;',
    to: '  // mutated: recognise on the sport token only',
  },
  {
    name: 'report a roster failure as a missing fixture',
    why: 'the two conditions have different remedies and the flag body must say which',
    file: IDENTITY,
    from: '  if (!mine) return { identity: null, gapReason: GAP_REASON.TEAM_UNRESOLVED };',
    to: '  if (!mine) return { identity: null, gapReason: GAP_REASON.NO_FIXTURE };',
  },
  {
    name: 'drop the self-fixture guard',
    why: 'a row naming us on both sides would hand back our own team as the opponent',
    file: IDENTITY,
    from: '  const opponentId = selfFixture ? null\n    : fixture.home === season.myTeamId ? fixture.away\n    : fixture.home;',
    to: '  const opponentId = fixture.home === season.myTeamId ? fixture.away : fixture.home;',
  },
  {
    name: 'claim every gap reason is absent from the record',
    why: 'true only of NO_FIXTURE — a duplicate row still counts, and a roster gap loses only the standings row',
    file: FLAGS,
    from: '    const { cause, consequence, remedy } = WORDING[onlyReason] || MIXED;',
    to: "    const { cause, remedy } = WORDING[onlyReason] || MIXED;\n    const consequence = `so ${carries} no team identity and ${one ? 'is' : 'are'} absent from the record, the standings and next-game selection`;",
  },
  {
    name: 'make the gap flag bannerOnly',
    why: 'bannerOnly flags are not promoted by NOW/NEXT — the gap would stop being prominent',
    file: FLAGS,
    from: "      id: 'flag-football-schedule-gap',\n      level: 'amber',",
    to: "      id: 'flag-football-schedule-gap',\n      level: 'amber',\n      bannerOnly: true,",
  },
  {
    name: 'downgrade the gap flag to blue',
    why: 'NOW/NEXT promotes only red and amber; blue would drop it out of the ranking entirely',
    file: FLAGS,
    from: "      id: 'flag-football-schedule-gap',\n      level: 'amber',",
    to: "      id: 'flag-football-schedule-gap',\n      level: 'blue',",
  },
];

// ── Run ─────────────────────────────────────────────────────────────────────
restore();
const control = runSuite();
if (control.inconclusive || control.fail !== 0) {
  console.error('control run is not green — fix that before trusting any mutation result');
  console.error(control.out.slice(-3000));
  process.exit(1);
}
console.log(`control: ${control.pass} passing, ${control.fail} failing\n`);

let proven = 0;
const survivors = [];
for (const m of MUTATIONS) {
  restore();
  try {
    // Ordered: the signature edit first, then the body, then the call site.
    mutate(m.file, [
      ...(m.extraFrom ? [[m.extraFrom, m.extraTo]] : []),
      [m.from, m.to],
      ...(m.alsoFrom ? [[m.alsoFrom, m.alsoTo]] : []),
    ]);
  } catch (error) {
    console.log(`⚠ ${m.name}\n    could not apply: ${error.message}`);
    survivors.push(m.name);
    continue;
  }
  const result = runSuite();
  restore();
  if (result.inconclusive) {
    console.log(`⚠ ${m.name}\n    INCONCLUSIVE — the run produced no summary (syntax error or crash)`);
    survivors.push(m.name);
  } else if (result.fail > 0) {
    proven++;
    console.log(`✔ ${m.name}\n    ${result.fail} failing — ${m.why}`);
  } else {
    console.log(`✘ ${m.name}\n    SURVIVED — nothing caught it. ${m.why}`);
    survivors.push(m.name);
  }
}

restore();
const after = runSuite();
console.log(`\nrestore run: ${after.pass} passing, ${after.fail} failing`);
console.log(`${proven}/${MUTATIONS.length} mutations proven`);
if (survivors.length) {
  console.log(`survivors: ${survivors.join('; ')}`);
  process.exit(1);
}
