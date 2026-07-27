import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { parseIndividualRow, parseRelayRow, parsePdfText, tryWrapStitch, parseEventHeader, isSkipLine } from '../scripts/pdf-reload-parser.mjs';

describe('parseIndividualRow — DQ handling', () => {
  it('normal DQ row (DQ in official-time column) → dq: true, time: null', () => {
    const result = parseIndividualRow('5   Smith, John   10   WT   NT   DQ');
    assert.ok(result, 'should match');
    assert.equal(result.dq, true);
    assert.equal(result.time, null);
    assert.equal(result.place, null);
    assert.equal(result.swimmer, 'Smith John');
    assert.equal(result.team, 'WT');
    assert.equal(result.age, 10);
  });

  it('DQ row with time column fully omitted → dq: true, time: null', () => {
    const result = parseIndividualRow('5   Smith, John   10   WT   NT');
    assert.ok(result, 'should match');
    assert.equal(result.dq, true);
    assert.equal(result.time, null);
    assert.equal(result.place, null);
    assert.equal(result.swimmer, 'Smith John');
    assert.equal(result.team, 'WT');
    assert.equal(result.age, 10);
  });

  it('line with no time-related content (no NT, no DQ) → null, not a DQ row', () => {
    const result = parseIndividualRow('5   Smith, John   10   WT');
    assert.equal(result, null, 'should not match — falls through to parse warning');
  });

  it('normal timed row → dq: false, time set, place set', () => {
    const result = parseIndividualRow('1   Hunley, Christian   8   WT   1:39.26   1:39.26   7');
    assert.ok(result, 'should match');
    assert.equal(result.dq, false);
    assert.ok(result.time !== null, 'time should be set');
    assert.equal(result.place, 1);
    assert.equal(result.swimmer, 'Hunley Christian');
    assert.equal(result.team, 'WT');
    assert.equal(result.age, 8);
  });
});

describe('parseIndividualRow — same-team fractional-tie points', () => {
  // Regression: two swimmers from the same team tying for a place share the point
  // value fractionally (e.g. 0.5 + 0.5 = 1 pt for 5th). The points group must accept
  // decimal values; previously (EXH|\d+)? rejected "0.5" and dropped the row entirely.
  it('tied-place row with fractional points (0.5) → parsed correctly, not dropped', () => {
    // Simplified reproduction of the failure mode (all-tab separators); Test 2 (Bonnett)
    // is the verbatim PDF line from 2026-06-29-wpd-at-eh with actual space+tab format.
    const result = parseIndividualRow('5*\tCaton, Caroline\t6 EH\t44.96 42.56 0.5');
    assert.ok(result, 'should match — was previously dropped');
    assert.equal(result.dq, false);
    assert.equal(result.swimmer, 'Caton Caroline');
    assert.equal(result.team, 'EH');
    assert.equal(result.age, 6);
    assert.equal(result.place, 5);
    assert.ok(result.time !== null);
  });

  it('same-team tie with tab-separated fields (verbatim PDF format)', () => {
    // Verbatim after parser trim: "5* Bonnett, Noemie \t5 EH \t52.44 42.56 0.5"
    const result = parseIndividualRow('5* Bonnett, Noemie \t5 EH \t52.44 42.56 0.5');
    assert.ok(result, 'should match — was previously dropped');
    assert.equal(result.swimmer, 'Bonnett Noemie');
    assert.equal(result.team, 'EH');
    assert.equal(result.age, 5);
    assert.equal(result.place, 5);
    assert.ok(result.time !== null);
  });

  it('integer points still work after fix', () => {
    const result = parseIndividualRow('3* Wojtan, Oliva \t5 WT \t44.57 41.91 1');
    assert.ok(result, 'should match');
    assert.equal(result.swimmer, 'Wojtan Oliva');
    assert.equal(result.place, 3);
  });

  it('absent points field still works after fix', () => {
    const result = parseIndividualRow('3* Pascoe, Landry \t5 WF \t39.91 41.91');
    assert.ok(result, 'should match');
    assert.equal(result.swimmer, 'Pascoe Landry');
    assert.equal(result.place, 3);
  });
});

describe('parseRelayRow — 1-tab WPD format', () => {
  // Regression: WPD relay rows use 1 tab (team-name | relay-letter+abbr+times) instead
  // of the standard 2 tabs. Previously "last word" of field 1 was the official time,
  // failing the [A-Z]{2,6} team-abbreviation check. Fix: scan for first 2-6 char all-caps
  // token in field 1 as the abbreviation; treat remainder as times.

  it('standard 2-tab relay row still parses correctly', () => {
    const result = parseRelayRow("1 Edgehill Eels \tA EH \tNT 2:32.68 7");
    assert.ok(result, 'should match');
    assert.equal(result.team, 'EH');
    assert.equal(result.place, 1);
    assert.ok(result.time !== null);
  });

  it('1-tab WPD relay row is now parsed (was previously dropped)', () => {
    // Verbatim from 2026-06-29-wpd-at-eh line 589
    const result = parseRelayRow("2 WP Dolphins \tA WPD 3:10.92 3:06.86");
    assert.ok(result, 'should match — was previously dropped');
    assert.equal(result.team, 'WPD');
    assert.equal(result.place, 2);
    assert.ok(result.time !== null);
  });

  it('1-tab WPD relay row with NT seed is now parsed', () => {
    // Hypothetical: WPD row where seed is NT (ensures NT path works in 1-tab mode)
    const result = parseRelayRow("1 WP Dolphins \tA WPD NT 3:05.43");
    assert.ok(result, 'should match');
    assert.equal(result.team, 'WPD');
    assert.equal(result.place, 1);
    assert.ok(result.time !== null);
  });

  it('1-tab relay DQ row sets dq: true, time: null', () => {
    const result = parseRelayRow("2 WP Dolphins \tA WPD NT DQ");
    assert.ok(result, 'should match');
    assert.equal(result.team, 'WPD');
    assert.equal(result.dq, true);
    assert.equal(result.time, null);
  });
});

describe('FIX 1 — Unicode characters in swimmer names', () => {
  it('Unicode modifier apostrophe (U+02BC) in last name → parsed correctly', () => {
    // Oʼbrien: the apostrophe is U+02BC, a modifier letter, matched by \\p{L}
    const result = parseIndividualRow('3 Oʼbrien, Lucy   10   FTC   1:23.45   1:20.00');
    assert.ok(result, 'should match');
    assert.equal(result.swimmer, 'Oʼbrien Lucy');
    assert.equal(result.team, 'FTC');
    assert.equal(result.age, 10);
    assert.equal(result.dq, false);
  });

  it('Accented character in first name → parsed correctly', () => {
    const result = parseIndividualRow('-- Croly, Sofía   9   QL   NT   NS');
    assert.ok(result, 'should match');
    assert.equal(result.swimmer, 'Croly Sofía');
    assert.equal(result.team, 'QL');
    assert.equal(result.dq, true);
  });

  it('Double-quote nickname in first name → parsed correctly', () => {
    const result = parseIndividualRow('-- Delaney, "Hok"   11   KW   NT   NS');
    assert.ok(result, 'should match');
    assert.equal(result.swimmer, 'Delaney "Hok"');
    assert.equal(result.team, 'KW');
    assert.equal(result.dq, true);
  });
});

describe('FIX 2 — two-line name wrap stitching', () => {
  it('placed wrap: name-only line + data line → stitched and parseable', () => {
    const lines = [
      '5 Romesburg, Anne Marie',
      '',
      '12 KM   NT   1:23.45',
    ];
    const result = tryWrapStitch(lines, 0);
    assert.ok(result, 'should detect wrap');
    assert.equal(result.nextI, 2);
    const parsed = parseIndividualRow(result.stitched);
    assert.ok(parsed, 'stitched line should parse');
    assert.equal(parsed.swimmer, 'Romesburg Anne Marie');
    assert.equal(parsed.age, 12);
    assert.equal(parsed.team, 'KM');
    assert.equal(parsed.dq, false);
  });

  it('silent wrap (-- prefix): name-only line + adjacent data line → stitched and parseable', () => {
    const lines = [
      '-- Dafashy, Elizabeth',
      '9 QL   NT   NS',
    ];
    const result = tryWrapStitch(lines, 0);
    assert.ok(result, 'should detect wrap');
    assert.equal(result.nextI, 1);
    const parsed = parseIndividualRow(result.stitched);
    assert.ok(parsed, 'stitched line should parse');
    assert.equal(parsed.swimmer, 'Dafashy Elizabeth');
    assert.equal(parsed.team, 'QL');
    assert.equal(parsed.dq, true);
  });

  it('full result line is not mistaken for a name-only wrap', () => {
    const lines = ['5 Smith, John   10   WT   NT   DQ'];
    const result = tryWrapStitch(lines, 0);
    assert.equal(result, null, 'full line should not trigger wrap detection');
  });

  it('hyphenated last name wraps correctly', () => {
    const lines = [
      '3 McDonald-Scanlon, Kira',
      '11 KM   2:10.00   2:05.30',
    ];
    const result = tryWrapStitch(lines, 0);
    assert.ok(result, 'should detect wrap');
    const parsed = parseIndividualRow(result.stitched);
    assert.ok(parsed, 'stitched line should parse');
    assert.equal(parsed.swimmer, 'McDonald-Scanlon Kira');
    assert.equal(parsed.team, 'KM');
  });
});

describe('FIX 3 — relay NT official time (team registered but did not swim)', () => {
  it('2-tab relay NT/NT row → dq: true, time: null, place: null', () => {
    const result = parseRelayRow("1 Ford's Colony \tA FDC \tNT\tNT");
    assert.ok(result, 'should match');
    assert.equal(result.team, 'FDC');
    assert.equal(result.dq, true);
    assert.equal(result.time, null);
    assert.equal(result.place, null);
  });

  it('1-tab relay NT/NT row → dq: true, time: null', () => {
    const result = parseRelayRow("1 WP Dolphins \tA WPD NT NT");
    assert.ok(result, 'should match');
    assert.equal(result.team, 'WPD');
    assert.equal(result.dq, true);
    assert.equal(result.time, null);
  });

  it('timed relay row still parses correctly after NT-official fix', () => {
    const result = parseRelayRow("1 Edgehill Eels \tA EH \tNT 2:32.68 7");
    assert.ok(result, 'should match');
    assert.equal(result.dq, false);
    assert.ok(result.time !== null);
  });
});

describe('HIST EXT 1 — null-byte colon preprocessing regex', () => {
  it('digit + null-byte + two-digit.two-digit → colon substituted', () => {
    const raw = '1\x0040.25';
    const fixed = raw.replace(/(\d)\x00(\d{2}\.\d{2})/g, '$1:$2');
    assert.equal(fixed, '1:40.25');
  });

  it('multi-occurrence in one string: all instances corrected', () => {
    const raw = 'swimmer 1\x0040.25 seed 2\x0012.67 official';
    const fixed = raw.replace(/(\d)\x00(\d{2}\.\d{2})/g, '$1:$2');
    assert.equal(fixed, 'swimmer 1:40.25 seed 2:12.67 official');
  });

  it('string with no null bytes is unchanged (2025/2026 PDFs)', () => {
    const raw = 'swimmer 1:40.25 seed 2:12.67 official';
    const fixed = raw.replace(/(\d)\x00(\d{2}\.\d{2})/g, '$1:$2');
    assert.equal(fixed, raw);
  });

  it('lone null byte not in time position is not replaced', () => {
    const raw = 'foo\x00bar';
    const fixed = raw.replace(/(\d)\x00(\d{2}\.\d{2})/g, '$1:$2');
    assert.equal(fixed, raw);
  });
});

describe('HIST EXT 2 — m4: historical EXH individual row (2022–2025)', () => {
  it('standard EXH row → exhibition: true, dq: false, time set', () => {
    const result = parseIndividualRow('X Hobbs, Michaela EXH\t9 WT\tNT 2:12.97');
    assert.ok(result, 'should match m4');
    assert.equal(result.exhibition, true);
    assert.equal(result.dq, false);
    assert.equal(result.swimmer, 'Hobbs Michaela');
    assert.equal(result.age, 9);
    assert.equal(result.team, 'WT');
    assert.equal(result.place, null);
    assert.ok(result.time !== null, 'time should be set from official');
  });

  it('EXH row with DQ official → exhibition: true, dq: true, time: null', () => {
    const result = parseIndividualRow('X Walker, Elliot EXH\t10 EH\t2:09.41 DQ');
    assert.ok(result, 'should match m4');
    assert.equal(result.exhibition, true);
    assert.equal(result.dq, true);
    assert.equal(result.time, null);
    assert.equal(result.swimmer, 'Walker Elliot');
    assert.equal(result.team, 'EH');
  });

  it('EXH row with NS official → exhibition: true, dq: true, time: null', () => {
    const result = parseIndividualRow('X Hood, Allister EXH\t8 QL\tNT NS');
    assert.ok(result, 'should match m4');
    assert.equal(result.exhibition, true);
    assert.equal(result.dq, true);
    assert.equal(result.time, null);
    assert.equal(result.swimmer, 'Hood Allister');
    assert.equal(result.team, 'QL');
  });

  it('EXH row with SCR official → scrSkip: true', () => {
    const result = parseIndividualRow('X Lamb, Junie EXH\t6 EH\t51.84 SCR');
    assert.ok(result, 'should match m4');
    assert.equal(result.scrSkip, true);
    assert.equal(result.swimmer, 'Lamb Junie');
    assert.equal(result.team, 'EH');
  });
});

describe('HIST EXT 3 — m3 SCR extension (scratch with -- prefix)', () => {
  it('-- row with SCR official → scrSkip: true (not dq)', () => {
    const result = parseIndividualRow('-- Broderick, Preston\t17 KW\t28.74 SCR');
    assert.ok(result, 'should match m3 SCR branch');
    assert.equal(result.scrSkip, true);
    assert.equal(result.swimmer, 'Broderick Preston');
    assert.equal(result.team, 'KW');
  });

  it('-- row with NS official still returns dq: true (not scrSkip)', () => {
    const result = parseIndividualRow('-- Croly, Sofia\t9 QL\tNT NS');
    assert.ok(result, 'should match m3');
    assert.equal(result.dq, true);
    assert.ok(!result.scrSkip, 'should not be scrSkip');
  });
});

describe('HIST EXT 4 — m5: non-scoring finisher (-- row with numeric official)', () => {
  it('-- row with numeric official time → nonScoringFinisher: true, dq: false, time set', () => {
    const result = parseIndividualRow('-- Malone, Charlie\t9 KM\tNT 2:03.00');
    assert.ok(result, 'should match m5');
    assert.equal(result.dq, false);
    assert.equal(result.nonScoringFinisher, true);
    assert.equal(result.swimmer, 'Malone Charlie');
    assert.equal(result.team, 'KM');
    assert.equal(result.place, null);
    assert.ok(result.time !== null, 'time should be set');
  });

  it('-- row with DQ official is NOT matched by m5 (falls to m3)', () => {
    const result = parseIndividualRow('-- Smith, John\t10 WT\tNT DQ');
    assert.ok(result, 'should match m3');
    assert.equal(result.dq, true);
    assert.ok(!result.nonScoringFinisher, 'should not be non-scoring-finisher');
  });
});

describe('HIST EXT 5 — relay EXH row and relay -- DQ row', () => {
  it('X <team> EXH relay row → exhibitionRelay: true, place: null, dq: false, time set', () => {
    const result = parseRelayRow('X Queens Lake EXH\tB QL\tNT 2:51.33');
    assert.ok(result, 'should match relay EXH branch');
    assert.equal(result.exhibitionRelay, true);
    assert.equal(result.place, null);
    assert.equal(result.dq, false);
    assert.equal(result.team, 'QL');
    assert.ok(result.time !== null, 'time should be set');
  });

  it('-- <team> relay row with DQ official → dq: true, place: null, team set', () => {
    const result = parseRelayRow('-- Wellington Waves\tB WT\tNT DQ');
    assert.ok(result, 'should match relay -- DQ branch');
    assert.equal(result.dq, true);
    assert.equal(result.place, null);
    assert.equal(result.team, 'WT');
    assert.equal(result.time, null);
    assert.ok(!result.exhibitionRelay, 'should not be exhibitionRelay');
  });
});

describe('HIST EXT 6 — tryWrapStitch X-prefix wrap', () => {
  it('X-prefix name-only + EXH-alone + data line → stitched and parseable as EXH row', () => {
    const lines = [
      'X Waldron-Kolloff, Ella Rea',
      'EXH',
      '14 QL \t1:38.50 1:40.45',
    ];
    const result = tryWrapStitch(lines, 0);
    assert.ok(result, 'should detect X-prefix wrap');
    assert.equal(result.nextI, 2);
    const parsed = parseIndividualRow(result.stitched);
    assert.ok(parsed, 'stitched X EXH line should parse via m4');
    assert.equal(parsed.exhibition, true);
    assert.equal(parsed.swimmer, 'Waldron-Kolloff Ella Rea');
    assert.equal(parsed.team, 'QL');
    assert.equal(parsed.age, 14);
    assert.equal(parsed.dq, false);
    assert.ok(parsed.time !== null, 'time should be set');
  });
});

describe('HIST EXT 7 — m4: EXH row with NT official (no time recorded)', () => {
  it('EXH row with NT seed and NT official → exhibition: true, dq: false, time: null', () => {
    const result = parseIndividualRow('X Holley, Moriyah EXH\t7 VG\tNT NT');
    assert.ok(result, 'should match m4 with NT official');
    assert.equal(result.exhibition, true);
    assert.equal(result.dq, false);
    assert.equal(result.time, null);
    assert.equal(result.swimmer, 'Holley Moriyah');
    assert.equal(result.age, 7);
    assert.equal(result.team, 'VG');
    assert.equal(result.place, null);
  });

  it('EXH row with seed time and NT official → exhibition: true, dq: false, time: null', () => {
    const result = parseIndividualRow('X Moriah, Brinley EXH\t8 WGP\t1:11.55 NT');
    assert.ok(result, 'should match m4 with seed time but NT official');
    assert.equal(result.exhibition, true);
    assert.equal(result.dq, false);
    assert.equal(result.time, null);
    assert.equal(result.swimmer, 'Moriah Brinley');
    assert.equal(result.age, 8);
    assert.equal(result.team, 'WGP');
  });
});

describe('HIST EXT 8 — m4: EXH row with parenthetical nickname in first name', () => {
  it('parenthetical nickname in first name → parses correctly, nickname included in swimmer field', () => {
    const result = parseIndividualRow('X Holt, Isla (Eye- La) EXH 9 KM NT 1:07.14');
    assert.ok(result, 'should match m4 with parenthetical first name');
    assert.equal(result.exhibition, true);
    assert.equal(result.dq, false);
    assert.equal(result.swimmer, 'Holt Isla (Eye- La)');
    assert.equal(result.age, 9);
    assert.equal(result.team, 'KM');
    assert.ok(result.time !== null, 'time should be set from official column');
    assert.equal(result.place, null);
  });

  it('parenthetical nickname with DQ official → dq: true, time: null', () => {
    const result = parseIndividualRow('X Holt, Isla (Eye- La) EXH 9 KM NT DQ');
    assert.ok(result, 'should match m4 with parenthetical first name and DQ');
    assert.equal(result.exhibition, true);
    assert.equal(result.dq, true);
    assert.equal(result.time, null);
    assert.equal(result.swimmer, 'Holt Isla (Eye- La)');
    assert.equal(result.age, 9);
    assert.equal(result.team, 'KM');
  });
});

describe('HIST EXT 9 — ordinal-suffix token in swimmer name (e.g. "Kun 3rd")', () => {
  it('scored row with ordinal-suffix last name → parses correctly', () => {
    const result = parseIndividualRow('4 Kun 3rd, Kube 10 VG NT 1:24.69');
    assert.ok(result, 'should match m pattern with ordinal-suffix last name');
    assert.equal(result.swimmer, 'Kun 3rd Kube');
    assert.equal(result.age, 10);
    assert.equal(result.team, 'VG');
    assert.equal(result.place, 4);
    assert.equal(result.dq, false);
    assert.equal(result.exhibition, false);
    assert.ok(result.time !== null, 'time should be set from official column');
  });

  it('EXH row with ordinal-suffix last name → parses correctly via m4', () => {
    const result = parseIndividualRow('X Kun 3rd, Kube EXH 10 VG NT 1:24.69');
    assert.ok(result, 'should match m4 pattern with ordinal-suffix last name');
    assert.equal(result.swimmer, 'Kun 3rd Kube');
    assert.equal(result.age, 10);
    assert.equal(result.team, 'VG');
    assert.equal(result.place, null);
    assert.equal(result.dq, false);
    assert.equal(result.exhibition, true);
    assert.ok(result.time !== null, 'time should be set from official column');
  });
});

describe('HIST EXT 10 — tied relay place marker (e.g. "2*")', () => {
  it('2* tied relay place → place parsed as 2, time set', () => {
    const result = parseRelayRow('2* Kingsmill Swim Team\tA KW\tNT 2:24.55');
    assert.ok(result, 'should match relay with tied place marker');
    assert.equal(result.place, 2);
    assert.equal(result.team, 'KW');
    assert.equal(result.dq, false);
    assert.ok(result.time !== null, 'time should be set');
  });
});

describe('HIST EXT 11 — tryWrapStitch: EXH marker on double-quoted-nickname continuation line', () => {
  it('X-prefix with comma-separated nickname wrap + EXH on continuation → stitched and parseable as EXH row', () => {
    const lines = [
      'X Dafashy, Elizabeth, Ellie or"',
      'Ellie D." EXH',
      '11 QL \t50.14 49.15',
    ];
    const result = tryWrapStitch(lines, 0);
    assert.ok(result, 'should detect wrap');
    assert.equal(result.nextI, 2);
    const parsed = parseIndividualRow(result.stitched);
    assert.ok(parsed, 'stitched line should parse via m4');
    assert.equal(parsed.exhibition, true);
    assert.equal(parsed.swimmer, 'Dafashy Elizabeth');
    assert.equal(parsed.team, 'QL');
    assert.equal(parsed.age, 11);
    assert.equal(parsed.dq, false);
    assert.ok(parsed.time !== null, 'official time should be set');
  });

  it('HIST EXT 6 regression: EXH-on-own-line case still works after HIST EXT 11 change', () => {
    const lines = [
      'X Waldron-Kolloff, Ella Rea',
      'EXH',
      '14 QL \t1:38.50 1:40.45',
    ];
    const result = tryWrapStitch(lines, 0);
    assert.ok(result, 'should detect X-prefix wrap');
    assert.equal(result.nextI, 2);
    const parsed = parseIndividualRow(result.stitched);
    assert.ok(parsed, 'stitched X EXH line should parse via m4');
    assert.equal(parsed.exhibition, true);
    assert.equal(parsed.swimmer, 'Waldron-Kolloff Ella Rea');
    assert.equal(parsed.team, 'QL');
    assert.equal(parsed.age, 14);
    assert.equal(parsed.dq, false);
    assert.ok(parsed.time !== null, 'time should be set');
  });
});

// ---------------------------------------------------------------------------
// SA EXT 1 — "Year Olds" event header (Summer Awards / Meet Maestro invitational)
// ---------------------------------------------------------------------------

describe('SA EXT 1 — parseEventHeader Year Olds brackets', () => {
  it('7 Year Olds → Girls 7-8', () => {
    const r = parseEventHeader('#5 Girls 7 Year Olds 25m Freestyle', 'SCM');
    assert.ok(r, 'should parse');
    assert.equal(r.eventNum, 5);
    assert.equal(r.ageGroup, 'Girls 7-8');
    assert.equal(r.eventName, '25m Freestyle');
    assert.equal(r.course, 'SCM');
  });
  it('8 Year Olds → Boys 7-8', () => {
    const r = parseEventHeader('#6 Boys 8 Year Olds 25m Freestyle', 'SCM');
    assert.ok(r, 'should parse');
    assert.equal(r.ageGroup, 'Boys 7-8');
  });
  it('9 Year Olds → Girls 9-10', () => {
    const r = parseEventHeader('#19 Girls 9 Year Olds 25m Backstroke', 'SCM');
    assert.ok(r, 'should parse');
    assert.equal(r.ageGroup, 'Girls 9-10');
  });
  it('10 Year Olds → Boys 9-10', () => {
    const r = parseEventHeader('#20 Boys 10 Year Olds 25m Backstroke', 'SCM');
    assert.ok(r, 'should parse');
    assert.equal(r.ageGroup, 'Boys 9-10');
  });
  it('standard bracket still parses after Year Olds added', () => {
    const r = parseEventHeader('#1 Girls 6&Under 25m Freestyle', 'SCM');
    assert.ok(r, 'should parse');
    assert.equal(r.ageGroup, 'Girls 6&Under');
  });
  it('Year Old (singular) also matches', () => {
    const r = parseEventHeader('#7 Boys 7 Year Old 25m Freestyle', 'SCM');
    assert.ok(r, 'should parse singular form');
    assert.equal(r.ageGroup, 'Boys 7-8');
  });
});

// ---------------------------------------------------------------------------
// SA EXT 2 — achievedChamps flag on m1 rows
// ---------------------------------------------------------------------------

describe('SA EXT 2 — achievedChamps flag', () => {
  it('row with CHMP marker → achievedChamps: true', () => {
    const r = parseIndividualRow('1   Hunley, Christian   8   WT   NT   30.50   7   CHMP');
    assert.ok(r, 'should parse');
    assert.equal(r.achievedChamps, true);
    assert.equal(r.dq, false);
    assert.equal(r.place, 1);
  });
  it('row without CHMP marker → achievedChamps: false', () => {
    const r = parseIndividualRow('1   Hunley, Christian   8   WT   NT   30.50   7');
    assert.ok(r, 'should parse');
    assert.equal(r.achievedChamps, false);
  });
  it('EXH row without CHMP → achievedChamps: false', () => {
    const r = parseIndividualRow('4   Holley, Scarlett   12   WT   1:45.00   1:45.00   EXH');
    assert.ok(r, 'should parse');
    assert.equal(r.achievedChamps, false);
    assert.equal(r.exhibition, true);
  });
  it('DQ row (m1 pattern) → achievedChamps: false', () => {
    const r = parseIndividualRow('5   Smith, John   10   WC   NT   DQ');
    assert.ok(r, 'should parse');
    assert.equal(r.achievedChamps, false);
    assert.equal(r.dq, true);
  });
});

// ---------------------------------------------------------------------------
// SA EXT 3 — CHMP header line skip
// ---------------------------------------------------------------------------

describe('SA EXT 3 — isSkipLine skips CHMP headers', () => {
  it('CHMP\\t... header line is skipped', () => {
    assert.equal(isSkipLine('CHMP\t#5 Girls 7 Year Olds'), true);
  });
  it('CHMP standalone word line is skipped', () => {
    assert.equal(isSkipLine('CHMP standard'), true);
  });
  it('non-CHMP digit-start line is not skipped', () => {
    assert.equal(isSkipLine('1   Smith, John   8   WT   NT   30.50   7'), false);
  });
  it('empty line is skipped (pre-existing)', () => {
    assert.equal(isSkipLine(''), true);
  });
});

// ---------------------------------------------------------------------------
// RELAY DROP FIX — NS/DNF/SCR token recognition + 1-tab fallback DQ (July 2026)
// ---------------------------------------------------------------------------
// Bug 1: officialStr regex in parseRelayRow() previously excluded NS, DNF, SCR,
//        silently dropping those relay rows (no output, no warning).
//        39 NS + 3 DNF drops confirmed across 22 meets (2022–2026) in planner audit.
// Bug 2: 1-tab SA fallback only read parts[1] for time tokens; when seed is in
//        parts[1] and official (DQ) is in parts[2], timeParts0 had length 1 and
//        the guard returned null. Confirmed in exactly 1 row: KW B, Girls 9-10,
//        Summer Awards 2026. Fix: collect times from parts.slice(1) instead.
// ---------------------------------------------------------------------------

describe('RELAY DROP FIX — NS relay row (4-tab format, NS at parts[3])', () => {
  // Verbatim Summer Awards format: parts = ["-- WP Dolphins ", "B WPD ", "NT ", "NS"]
  it('NS relay row (4-tab) → dq: true, time: null, place: null, team set', () => {
    const r = parseRelayRow("-- WP Dolphins \tB WPD \tNT \tNS");
    assert.ok(r, 'should match — was silently dropped before fix');
    assert.equal(r.team, 'WPD');
    assert.equal(r.dq, true);
    assert.equal(r.time, null);
    assert.equal(r.place, null);
  });
});

describe('RELAY DROP FIX — NS relay row (3-tab format, NS at parts[2])', () => {
  // 2022-era format: parts = ["-- Village Green ", "A VG 2:43.48 ", "NS"]
  // Seed time is folded into parts[1] alongside the relay letter and abbreviation.
  it('NS relay row (3-tab) → dq: true, time: null, place: null, team set', () => {
    const r = parseRelayRow("-- Village Green \tA VG 2:43.48 \tNS");
    assert.ok(r, 'should match — was silently dropped before fix');
    assert.equal(r.team, 'VG');
    assert.equal(r.dq, true);
    assert.equal(r.time, null);
    assert.equal(r.place, null);
  });
});

describe('RELAY DROP FIX — DNF relay row (same root cause as NS)', () => {
  // DNF was excluded from the same officialStr regex as NS.
  // Confirmed in 3 rows across 2 meets in 2025 (vg-at-ql, ps-at-eh).
  it('DNF relay row (4-tab) → dq: true, time: null, team set', () => {
    const r = parseRelayRow("-- Village Green \tA VG \tNT \tDNF");
    assert.ok(r, 'should match — was silently dropped before fix');
    assert.equal(r.team, 'VG');
    assert.equal(r.dq, true);
    assert.equal(r.time, null);
    assert.equal(r.place, null);
  });
});

describe('RELAY DROP FIX — 1-tab fallback DQ with split seed/official (Bug 2)', () => {
  // Exact KW B row from Summer Awards 2026, Girls 9-10 200m Freestyle Relay.
  // parts = ["-- Kingswood Klams B KW", "3:44.19", "DQ"]
  // Team abbr (KW) is at the end of parts[0]; main path teamIdx === -1 → fallback.
  // Old fallback: timeParts0 = parts[1].split() → ["3:44.19"], length 1 → return null.
  // Fixed fallback: timeParts0 = parts.slice(1).join(' ').split() → ["3:44.19", "DQ"] ✓
  it('KW B DQ row (1-tab fallback, DQ at parts[2]) → dq: true, time: null, team KW', () => {
    const r = parseRelayRow("-- Kingswood Klams B KW\t3:44.19\tDQ");
    assert.ok(r, 'should match — was silently dropped before fix');
    assert.equal(r.team, 'KW');
    assert.equal(r.dq, true);
    assert.equal(r.time, null);
    assert.equal(r.place, null);
  });

  it('1-tab fallback NS row (NS at parts[2]) → also fixed by Bug 2 change', () => {
    // Hypothetical: team abbr in parts[0], NS as official in parts[2]
    const r = parseRelayRow("-- Kingswood Klams B KW\tNT\tNS");
    assert.ok(r, 'should match — both fixes required');
    assert.equal(r.team, 'KW');
    assert.equal(r.dq, true);
    assert.equal(r.time, null);
  });
});

describe('RELAY DROP FIX — regression guard: existing rows unchanged after fix', () => {
  it('standard timed relay row still produces correct result', () => {
    const r = parseRelayRow("1 Edgehill Eels \tA EH \tNT 2:32.68 7");
    assert.ok(r, 'should still match');
    assert.equal(r.team, 'EH');
    assert.equal(r.place, 1);
    assert.equal(r.dq, false);
    assert.ok(r.time !== null, 'time should be set');
  });

  it('existing DQ relay row shape unchanged', () => {
    const r = parseRelayRow("-- Wellington Waves\tB WT\tNT DQ");
    assert.ok(r, 'should still match');
    assert.equal(r.team, 'WT');
    assert.equal(r.dq, true);
    assert.equal(r.time, null);
    assert.equal(r.place, null);
  });
});

// ---------------------------------------------------------------------------
// SA EXT 4 — relay 1-tab variant with team abbr in parts[0]
// ---------------------------------------------------------------------------

describe('SA EXT 4 — parseRelayRow parts[0] fallback', () => {
  it('KW abbr at end of parts[0] → team KW, place 2', () => {
    const r = parseRelayRow('2 Kingswood Klams A KW\t1:18.84 1:18.26 26');
    assert.ok(r, 'should parse');
    assert.equal(r.team, 'KW');
    assert.equal(r.place, 2);
    assert.equal(r.dq, false);
    assert.ok(r.time !== null, 'time should be set');
  });
  it('WT abbr at end of parts[0] → team WT, place 5', () => {
    const r = parseRelayRow('5 Wellington Waves A WT\t1:38.50 1:44.10 20');
    assert.ok(r, 'should parse');
    assert.equal(r.team, 'WT');
    assert.equal(r.place, 5);
    assert.equal(r.dq, false);
  });
  it('existing 2-tab variant unaffected', () => {
    const r = parseRelayRow("1 Ford's Colony \tA FDC \tNT 2:23.26");
    assert.ok(r, 'should still parse');
    assert.equal(r.team, 'FDC');
  });
  it('existing 1-tab WPD variant unaffected', () => {
    const r = parseRelayRow('2 WP Dolphins \tA WPD 3:10.92 3:06.86');
    assert.ok(r, 'should still parse');
    assert.equal(r.team, 'WPD');
  });
  it('NT-seed variant (WT): NT in parts[1] not treated as team code', () => {
    const r = parseRelayRow('2 Wellington Waves A WT\tNT 2:14.47 26');
    assert.ok(r, 'should parse');
    assert.equal(r.team, 'WT');
    assert.equal(r.place, 2);
    assert.equal(r.dq, false);
    assert.ok(r.time !== null, 'time should be set');
  });
});

// ---------------------------------------------------------------------------
// SA FIX 1 — Delaney left-curly-quote nickname regression
// ---------------------------------------------------------------------------

describe('SA FIX 1 — U+201C left curly quote in swimmer nickname', () => {
  // Fixture: exact line L131 from 2026 Summer Awards PDF (meet 2026-07-25).
  // The nickname “Hok” uses U+201C (left curly quote) + U+201D (right curly quote).
  // Before fix: m1 char class contained only U+201D, so U+201C caused a no-match.
  it('row with U+201C/U+201D curly-quote nickname parses (was silent drop before fix)', () => {
    const r = parseIndividualRow('18 Delaney, “Hok” \t7 KW \t43.77 47.61');
    assert.ok(r, 'should match — was null before U+201C fix');
    assert.equal(r.place, 18);
    assert.equal(r.age, 7);
    assert.equal(r.team, 'KW');
    assert.equal(r.dq, false);
    assert.ok(r.time !== null, 'time should be set');
    assert.equal(r.achievedChamps, false);
  });
});

// ---------------------------------------------------------------------------
// SA EXT 5 — relay overallPlace + overallCount from native PDF Pl column
// ---------------------------------------------------------------------------

describe('SA EXT 5 — relay overallPlace and overallCount', () => {
  // The source PDF prints an explicit Pl column for relay events (same format as individual
  // events). parsePdfText must include overallPlace (from the native Pl value) and
  // overallCount (count of non-DQ entries in that event) in every relay row.
  // Prior to this fix the relay row schema had neither field.
  const entry = {
    season: '2026',
    date: '2026-07-25',
    meetSlug: 'test-sa-relay',
    teams: ['GS', 'WT'],
    course: 'SCM',
    sourcePdfPath: 'test.pdf',
  };
  const records = {};

  // Two-event text: one relay with 2 legal + 1 DQ, one with a single entry.
  const text = [
    '#31 Boys 8 & Under 100m Freestyle Relay',
    'Pl Team\tRelay\tSeed Official Pts Achv',
    '1 Gators\tA GS\tNT 1:18.21 32',
    '1) Smith, Bob (8)\t2) Jones, Tom (7)',
    '3) Doe, John (7)\t4) Roe, Mike (8)',
    '2 Wellington Waves\tA WT\tNT 1:44.10 20',
    '1) Mullinax, Walker (8)\t2) Luke, Grayson (8)',
    '3) Fincham, Nolan (8)\t4) Pittman, William (8)',
    '-- Windsor Forest\tA WF\tNT DQ',
    '1) Smith, A (7)\t2) Jones, B (8)',
    '3) Doe, C (7)\t4) Roe, D (8)',
    '#32 Girls 8 & Under 100m Freestyle Relay',
    'Pl Team\tRelay\tSeed Official Pts Achv',
    '1 Queens Lake\tA QL\tNT 1:24.41 32',
    '1) Peters, Aby (7)\t2) Hutto, Gracie (8)',
    '3) Chen, Violet (8)\t4) Bosworth, Carolyn (8)',
  ].join('\n');

  it('non-DQ relay rows carry overallPlace from native Pl column', () => {
    const { relayRows } = parsePdfText(text, entry, records);
    const gs = relayRows.find(r => r.team === 'GS' && r.ageGroup === 'Boys 8&Under');
    assert.ok(gs, 'GS row should exist');
    assert.equal(gs.overallPlace, 1, 'GS placed 1st in PDF');
    const wt = relayRows.find(r => r.team === 'WT');
    assert.ok(wt, 'WT row should exist');
    assert.equal(wt.overallPlace, 2, 'WT placed 2nd in PDF');
  });

  it('overallCount reflects count of non-DQ entries in each event', () => {
    const { relayRows } = parsePdfText(text, entry, records);
    const gs = relayRows.find(r => r.team === 'GS' && r.ageGroup === 'Boys 8&Under');
    assert.equal(gs.overallCount, 2, 'event 31 has 2 non-DQ teams (GS + WT)');
    const wt = relayRows.find(r => r.team === 'WT');
    assert.equal(wt.overallCount, 2);
    const ql = relayRows.find(r => r.team === 'QL');
    assert.ok(ql, 'QL row should exist');
    assert.equal(ql.overallPlace, 1, 'QL is sole legal entry in event 32');
    assert.equal(ql.overallCount, 1, 'event 32 has 1 non-DQ team');
  });

  it('DQ relay row has overallPlace: null and overallCount: null', () => {
    const { relayRows } = parsePdfText(text, entry, records);
    const wf = relayRows.find(r => r.team === 'WF');
    assert.ok(wf, 'WF DQ row should exist');
    assert.equal(wf.dq, true);
    assert.equal(wf.overallPlace, null, 'DQ has no place');
    assert.equal(wf.overallCount, null, 'DQ has no count');
  });
});

// ---------------------------------------------------------------------------
// VPSU CHAMPS EXT — VC achievement-tag handling (2025 Champs PDF format)
// ---------------------------------------------------------------------------
// The 2025 VPSU Champs PDF includes a "VC" (VPSU Championship Record) suffix
// on result rows where a swimmer set a new championship record.  Three related
// issues were fixed together:
//   1. Year+time record lines ("2004 1:08.95") generated spurious warnings —
//      added to isSkipLine to suppress them silently.
//   2. parseIndividualRow regex m: "VC" in the Achv column caused no-match and
//      dropped the row — fixed by extending (?:\s+(CHMP)) to (?:\s+(CHMP|VC)).
//   3. DATA_ONLY_LINE / FULL_RESULT_END: "20 VC" (two trailing tokens) exceeded
//      the single-token allowance — fixed by adding (?:\s+(?:CHMP|VC))? group.
// ---------------------------------------------------------------------------

describe('VPSU CHAMPS EXT — isSkipLine suppresses year+time record lines', () => {
  it('skips "2004 1:08.95" (year + MM:SS.ss time)', () => {
    assert.equal(isSkipLine('2004 1:08.95'), true, 'should be skipped');
  });
  it('skips "2012\t27.97" (year + tab + SS.ss time)', () => {
    assert.equal(isSkipLine('2012\t27.97'), true, 'should be skipped');
  });
  it('skips "2017 30.16" (year + SS.ss time)', () => {
    assert.equal(isSkipLine('2017 30.16'), true, 'should be skipped');
  });
  it('does NOT skip standalone year "2012" (existing rule)', () => {
    // The standalone-year rule already handles this; verify it still fires.
    assert.equal(isSkipLine('2012'), true, 'standalone year still skipped');
  });
  it('does NOT skip a result row that starts with a year-like number (e.g. place 2012 would not be valid)', () => {
    // A result row beginning with "2012" as a place number is implausible in practice,
    // but the year+time pattern requires a time field — "2012 Doe, John" should not skip.
    assert.equal(isSkipLine('2012 Doe, John'), false, 'name line should not be skipped');
  });
});

describe('VPSU CHAMPS EXT — parseIndividualRow accepts VC suffix', () => {
  it('row with "VC" at end (verbatim from 2025 Champs PDF) → parses, achievedChamps false', () => {
    // Verbatim line: "1 Jacobs, Jimmy\t14 FDC\t28.15 28.16 20 VC"
    const r = parseIndividualRow('1 Jacobs, Jimmy\t14 FDC\t28.15 28.16 20 VC');
    assert.ok(r, 'should match — was null before VC fix');
    assert.equal(r.place, 1);
    assert.equal(r.swimmer, 'Jacobs Jimmy');
    assert.equal(r.age, 14);
    assert.equal(r.team, 'FDC');
    assert.equal(r.dq, false);
    assert.ok(r.time !== null, 'time should be set');
    assert.equal(r.achievedChamps, false, 'VC ≠ CHMP; achievedChamps must remain false');
  });

  it('row with "VC" suffix, place 2 → parses correctly', () => {
    // Verbatim: "2 OBrien, Knox\t12 FDC\t30.04 29.85 17 VC"
    const r = parseIndividualRow('2 OBrien, Knox\t12 FDC\t30.04 29.85 17 VC');
    assert.ok(r, 'should match — was null before VC fix');
    assert.equal(r.place, 2);
    assert.equal(r.swimmer, 'OBrien Knox');
    assert.equal(r.team, 'FDC');
    assert.equal(r.dq, false);
    assert.equal(r.achievedChamps, false);
  });

  it('CHMP suffix still recognised → achievedChamps true (no regression)', () => {
    const r = parseIndividualRow('1 Moore, Ophelia\t10 WT\t32.41 31.88 20 CHMP');
    assert.ok(r, 'should match');
    assert.equal(r.achievedChamps, true, 'CHMP must still set achievedChamps');
  });

  it('row without achievement suffix still works (no regression)', () => {
    const r = parseIndividualRow('3 Shnowske, Sam\t12 WT\t1:18.95 1:15.11 20');
    assert.ok(r, 'should match');
    assert.equal(r.achievedChamps, false);
    assert.equal(r.place, 3);
  });
});

describe('VPSU CHAMPS EXT — tryWrapStitch resolves VC-suffixed data line', () => {
  // Verbatim wrap from 2025 Champs PDF:
  //   L7:  "1 Simmons,"
  //   L8:  "Benjamin"
  //   L9:  "12 WGPRA 1:09.07 1:07.81 20 VC"
  // DATA_ONLY_LINE must match line L9 now that (?:\s+(?:CHMP|VC))? is appended.
  it('DATA_ONLY_LINE matches data line ending in "20 VC"', () => {
    // Build a minimal lines array matching the L7/L8/L9 pattern and call tryWrapStitch.
    const lines = [
      '1 Simmons,',
      'Benjamin',
      '12 WGPRA 1:09.07 1:07.81 20 VC',
    ];
    const result = tryWrapStitch(lines, 0);
    assert.ok(result, 'tryWrapStitch should return a stitched result — was null before fix');
    assert.ok(result.stitched, 'stitched string should be non-empty');
    // The stitched string should now be parseable by parseIndividualRow
    const row = parseIndividualRow(result.stitched);
    assert.ok(row, 'parseIndividualRow should succeed on the stitched line');
    assert.equal(row.swimmer, 'Simmons Benjamin');
    assert.equal(row.team, 'WGPRA');
    assert.equal(row.age, 12);
    assert.equal(row.dq, false);
    assert.ok(row.time !== null, 'time should be set');
    assert.equal(row.achievedChamps, false);
  });
});
