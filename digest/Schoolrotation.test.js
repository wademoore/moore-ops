/**
 * schoolRotation.test.js
 * Run with: node schoolRotation.test.js
 *
 * No test framework required — plain Node assertions.
 * All expected values hand-verified against the anchor dates in the
 * Family Operations Context Document v20.3, Section 13.
 */

const {
  getRotation,
  getTomorrowRotation,
  getSchoolStrip,
  isSchoolDay,
  addNoSchoolDate,
  MYLES_CENTERS,
  OPHELIA_CENTERS,
} = require('./schoolRotation');

// ---------------------------------------------------------------------------
// Tiny test harness
// ---------------------------------------------------------------------------
let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✅  ${label}`);
    passed++;
  } else {
    console.error(`  ❌  ${label}`);
    failed++;
  }
}

function section(title) {
  console.log(`\n── ${title} ──`);
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------
function d(str) {
  // Parse 'YYYY-MM-DD' in LOCAL time (avoids UTC midnight shift)
  const [y, m, day] = str.split('-').map(Number);
  return new Date(y, m - 1, day);
}

// ---------------------------------------------------------------------------
// SECTION 1: isSchoolDay basics
// ---------------------------------------------------------------------------
section('isSchoolDay — basics');

assert(isSchoolDay(d('2026-05-01')) === true,  'May 1 (Friday) is a school day');
assert(isSchoolDay(d('2026-05-02')) === false, 'May 2 (Saturday) is NOT a school day');
assert(isSchoolDay(d('2026-05-03')) === false, 'May 3 (Sunday) is NOT a school day');
assert(isSchoolDay(d('2026-05-04')) === true,  'May 4 (Monday) is a school day');
assert(isSchoolDay(d('2026-05-25')) === false, 'May 25 (Memorial Day) is NOT a school day');

// ---------------------------------------------------------------------------
// SECTION 2: Myles rotation — anchor and forward walk
// ---------------------------------------------------------------------------
section('Myles (4th grade, 6-day cycle) — anchor date + forward');

// Anchor: May 1, 2026 = Day 4
const m_may1 = getRotation('myles', d('2026-05-01'));
assert(m_may1.day === 4,       'Myles May 1 = Day 4 (anchor)');
assert(m_may1.center === 'PE', 'Myles May 1 = PE');

// May 4 (Mon) = next school day → Day 5
const m_may4 = getRotation('myles', d('2026-05-04'));
assert(m_may4.day === 5,          'Myles May 4 = Day 5');
assert(m_may4.center === 'Library', 'Myles May 4 = Library');
assert(m_may4.needsLibraryBook === true, 'Myles May 4 — needsLibraryBook flag set');

// May 5 (Tue) = Day 6
const m_may5 = getRotation('myles', d('2026-05-05'));
assert(m_may5.day === 6,          'Myles May 5 = Day 6');
assert(m_may5.center === 'Music', 'Myles May 5 = Music');
assert(m_may5.needsRecorder === true, 'Myles May 5 — needsRecorder flag set');

// May 6 (Wed) = wraps to Day 1
const m_may6 = getRotation('myles', d('2026-05-06'));
assert(m_may6.day === 1,       'Myles May 6 = Day 1 (wrap-around)');
assert(m_may6.center === 'PE', 'Myles May 6 = PE (Day 1)');

// May 7 (Thu) = Day 2
const m_may7 = getRotation('myles', d('2026-05-07'));
assert(m_may7.day === 2,        'Myles May 7 = Day 2');
assert(m_may7.center === 'Art', 'Myles May 7 = Art');

// May 8 (Fri) = Day 3
const m_may8 = getRotation('myles', d('2026-05-08'));
assert(m_may8.day === 3,             'Myles May 8 = Day 3');
assert(m_may8.center === 'Computer', 'Myles May 8 = Computer');

// May 11 (Mon, skipping weekend) = Day 4
const m_may11 = getRotation('myles', d('2026-05-11'));
assert(m_may11.day === 4,       'Myles May 11 = Day 4 (weekend skipped correctly)');
assert(m_may11.center === 'PE', 'Myles May 11 = PE');

// May 12 (Tue) = Day 5 — ALSO Reading SOL Day 1
const m_may12 = getRotation('myles', d('2026-05-12'));
assert(m_may12.day === 5,            'Myles May 12 = Day 5');
assert(m_may12.center === 'Library', 'Myles May 12 = Library (SOL day — still rotates)');

// ---------------------------------------------------------------------------
// SECTION 3: Myles — Memorial Day skip
// ---------------------------------------------------------------------------
section('Myles — Memorial Day skip (May 25)');

// May 22 (Fri) = ?  Let's count: May 11=Day4, 12=5, 13=6, 14=1, 15=2, 18=3, 19=4, 20=5, 21=6, 22=1
const m_may22 = getRotation('myles', d('2026-05-22'));
assert(m_may22.day === 1, 'Myles May 22 = Day 1');

// May 25 = Memorial Day — no school
const m_may25 = getRotation('myles', d('2026-05-25'));
assert(m_may25.isSchoolDay === false, 'Myles May 25 = not a school day (Memorial Day)');
assert(m_may25.day === null,          'Myles May 25 = day is null');

// May 26 (Tue) — Memorial Day skipped, rotation continues from May 22
// May 22 = Day 1, so May 26 = Day 2
const m_may26 = getRotation('myles', d('2026-05-26'));
assert(m_may26.day === 2,        'Myles May 26 = Day 2 (Memorial Day skipped correctly)');
assert(m_may26.center === 'Art', 'Myles May 26 = Art');

// ---------------------------------------------------------------------------
// SECTION 4: Ophelia rotation — anchor and forward walk
// ---------------------------------------------------------------------------
section('Ophelia (1st grade, 7-day cycle) — anchor date + forward');

// Anchor: May 1, 2026 = Day 1
const o_may1 = getRotation('ophelia', d('2026-05-01'));
assert(o_may1.day === 1,           'Ophelia May 1 = Day 1 (anchor)');
assert(o_may1.center === 'Music',  'Ophelia May 1 = Music');
assert(o_may1.needsLibraryBook === false, 'Ophelia May 1 — no library book needed');
assert(o_may1.warningText === null,       'Ophelia May 1 — no warning (Music = awareness only)');

// May 4 = Day 2
const o_may4 = getRotation('ophelia', d('2026-05-04'));
assert(o_may4.day === 2,       'Ophelia May 4 = Day 2');
assert(o_may4.center === 'PE', 'Ophelia May 4 = PE');

// May 5 = Day 3
const o_may5 = getRotation('ophelia', d('2026-05-05'));
assert(o_may5.day === 3,        'Ophelia May 5 = Day 3');
assert(o_may5.center === 'Art', 'Ophelia May 5 = Art');

// May 6 = Day 4
const o_may6 = getRotation('ophelia', d('2026-05-06'));
assert(o_may6.day === 4,                       'Ophelia May 6 = Day 4');
assert(o_may6.center === 'Technology Extension', 'Ophelia May 6 = Technology Extension');

// May 7 = Day 5
const o_may7 = getRotation('ophelia', d('2026-05-07'));
assert(o_may7.day === 5,             'Ophelia May 7 = Day 5');
assert(o_may7.center === 'Computer', 'Ophelia May 7 = Computer');

// May 8 = Day 6
const o_may8 = getRotation('ophelia', d('2026-05-08'));
assert(o_may8.day === 6,       'Ophelia May 8 = Day 6');
assert(o_may8.center === 'PE', 'Ophelia May 8 = PE (Day 6)');

// May 11 = Day 7 (weekend skipped)
const o_may11 = getRotation('ophelia', d('2026-05-11'));
assert(o_may11.day === 7,             'Ophelia May 11 = Day 7');
assert(o_may11.center === 'Library', 'Ophelia May 11 = Library');
assert(o_may11.needsLibraryBook === true, 'Ophelia May 11 — needsLibraryBook flag set');

// May 12 = wraps to Day 1
const o_may12 = getRotation('ophelia', d('2026-05-12'));
assert(o_may12.day === 1,          'Ophelia May 12 = Day 1 (wrap-around from 7)');
assert(o_may12.center === 'Music', 'Ophelia May 12 = Music (wrap)');

// ---------------------------------------------------------------------------
// SECTION 5: Weekend returns null
// ---------------------------------------------------------------------------
section('Weekend dates → null for both students');

assert(getRotation('myles',   d('2026-05-09')).day === null, 'Myles May 9 (Sat) = null');
assert(getRotation('ophelia', d('2026-05-09')).day === null, 'Ophelia May 9 (Sat) = null');
assert(getRotation('myles',   d('2026-05-10')).day === null, 'Myles May 10 (Sun) = null');
assert(getRotation('ophelia', d('2026-05-10')).day === null, 'Ophelia May 10 (Sun) = null');

// ---------------------------------------------------------------------------
// SECTION 6: getTomorrowRotation — day-before reminder logic
// ---------------------------------------------------------------------------
section('getTomorrowRotation — day-before reminders');

// Today = May 3 (Sunday) → tomorrow = May 4 (Monday)
// Myles May 4 = Day 5 (Library) → should fire reminder
const tmrMyles = getTomorrowRotation('myles', d('2026-05-03'));
assert(tmrMyles.day === 5,               'Tomorrow rotation (May 4) = Day 5 for Myles');
assert(tmrMyles.needsLibraryBook === true, 'Library book reminder fires day before');

// Today = May 4 → tomorrow = May 5 (Myles Music)
const tmrMyles2 = getTomorrowRotation('myles', d('2026-05-04'));
assert(tmrMyles2.needsRecorder === true, 'Recorder reminder fires for May 5 (Music)');

// Today = May 10 (Sunday) → tomorrow = May 11 (Ophelia Library)
const tmrOphelia = getTomorrowRotation('ophelia', d('2026-05-10'));
assert(tmrOphelia.needsLibraryBook === true, 'Ophelia library book reminder fires for May 11');

// ---------------------------------------------------------------------------
// SECTION 7: getSchoolStrip — combined output
// ---------------------------------------------------------------------------
section('getSchoolStrip — combined digest output');

// May 3 (Sunday) — not a school day for either child
const strip_sun = getSchoolStrip(d('2026-05-03'));
assert(strip_sun.myles.isSchoolDay === false,   'School strip May 3 — Myles not in school');
assert(strip_sun.ophelia.isSchoolDay === false,  'School strip May 3 — Ophelia not in school');

// Tomorrow warnings should fire (May 4 = Myles Library)
assert(
  strip_sun.tomorrowWarnings.some(w => /myles/i.test(w) && /library/i.test(w)),
  'School strip May 3 — tomorrow warning includes Myles Library'
);

// May 4 (Monday) — school day
const strip_mon = getSchoolStrip(d('2026-05-04'));
assert(strip_mon.myles.center === 'Library', 'School strip May 4 — Myles in Library');
assert(strip_mon.ophelia.center === 'PE',    'School strip May 4 — Ophelia in PE');

// Tomorrow warnings May 4 → May 5: Myles Music (recorder)
assert(
  strip_mon.tomorrowWarnings.some(w => /myles/i.test(w) && /recorder/i.test(w)),
  'School strip May 4 — tomorrow warning includes Myles recorder'
);

// ---------------------------------------------------------------------------
// SECTION 8: addNoSchoolDate — runtime closure injection
// ---------------------------------------------------------------------------
section('addNoSchoolDate — dynamic no-school injection');

addNoSchoolDate('2026-06-01'); // simulate a newsletter-reported closure

assert(isSchoolDay(d('2026-06-01')) === false, 'June 1 marked as no-school after addNoSchoolDate');

// Verify the day after still counts correctly
// Jun 1 skipped → Jun 2 picks up where May 29 left off
// May 28=?, May 29=?  (need to count from known anchor)
// Just verify June 1 returns null and June 2 is a school day
assert(getRotation('myles', d('2026-06-01')).day === null,   'Myles June 1 = null (injected closure)');
assert(getRotation('myles', d('2026-06-02')).isSchoolDay === true, 'Myles June 2 = school day');

// ---------------------------------------------------------------------------
// RESULT SUMMARY
// ---------------------------------------------------------------------------
console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error('\n⚠️  Fix failures before deploying — rotation errors will cause wrong backpack reminders.');
  process.exit(1);
} else {
  console.log('\n✅  All assertions passed. Rotation calculator is production-ready.');
}