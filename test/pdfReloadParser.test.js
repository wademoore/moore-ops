import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { parseIndividualRow, parseRelayRow, tryWrapStitch } from '../scripts/pdf-reload-parser.mjs';

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
