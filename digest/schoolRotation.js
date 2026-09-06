/**
 * schoolRotation.js
 * Moore Family Operations Assistant
 *
 * Calculates the Centers rotation day for Myles and Ophelia on any given date,
 * and derives the day-before backpack reminders the digest surfaces.
 *
 * ── 2026-27 SCHOOL YEAR ────────────────────────────────────────────────────
 *
 * KEY RULES:
 *   - Rotation advances ONLY on actual school days (Mon–Fri, no holidays)
 *   - The DAY NUMBER (1-6) is school-wide: every child is on the same numbered
 *     cycle and shares the same Day 1 anchor. What differs per child is the
 *     day-number → subject map, because each class group enters the cycle at a
 *     different position. See MYLES_CENTERS / OPHELIA_CENTERS below.
 *   - Both anchors: Aug 24, 2026 (first day of school) = Day 1.
 *       Ophelia Day 1 = PE1;  Myles Day 1 = PE2.
 *
 * DIGEST REMINDER RULES:
 *   - Media day  → warn THE DAY BEFORE → Wade packs the library book.
 *     "Media" is the media centre, i.e. library checkout. It is the 2026-27
 *     label for what earlier years called "Library"; the reminder is the same.
 *   - Music day  → no item needed for Ophelia (awareness only).
 *
 * ── Myles's anchor, and how the phase was confirmed ────────────────────────
 *
 * Myles was deliberately unanchored until 2026-09-06 because his rotation
 * phase was genuinely unknown. Two separate things were settled, and they do
 * NOT rest on the same amount of evidence. Read the distinction before citing
 * either as confirmed.
 *
 * THE SCHOOL-WIDE PHASE (Aug 24 2026 = Day 1) — two independent sources:
 *
 *   (1) Myles had Music on Thu Sep 3, 2026 — the 9th school day of the year;
 *       9 mod 6 = 3, and Day 3 in MYLES_CENTERS is Music.
 *   (2) Mrs. Pitts's teacher-maintained Daily Planner shows Ophelia has PE2
 *       on Tue Sep 8, 2026 — the 10th school day (Sep 4 and Sep 7 are
 *       closures); 10 mod 6 = 4, and Day 4 in OPHELIA_CENTERS is PE2.
 *
 * Both resolve to the same anchor, so the two children share it and differ
 * only in their subject map. A packet-derived alternative phase (cycle
 * starting Aug 26, putting Sep 3 on PE1) was considered and retired; the
 * Sep 8 planner observation decided against it.
 *
 * MYLES_CENTERS — ONE source, and it is a child's verbal report:
 *
 * Observation (2) constrains the phase only. It says nothing about which
 * subject Myles has on a given day number, and the phase it confirms was
 * already established and tested before his anchor was set. So his
 * day-number → subject map rests entirely on observation (1): Myles saying
 * he had Music on Sep 3. Given the packet's cyclic subject order and
 * school-wide day numbering, that one report determines the map uniquely —
 * the derivation is sound — but it is single-sourced, and a second
 * observation on any other date has never been taken. Treat a future
 * contradiction as evidence against this map rather than as an anomaly.
 *
 * schoolRotation.test.js pins all three dates so the arithmetic cannot
 * regress silently.
 *
 * Superseded notes, recorded so they are not reintroduced: this header
 * previously said `myles.centersGroup` was null and that numbered groups were
 * pending assignment the week of 8/31. Both are wrong. His group is 6, and
 * numbered Centers groups are a Grade 5 construct at Stonehouse — lower grades
 * are identified by teacher, so Ophelia has no group number and never will.
 * A null centersGroup is therefore not a signal that a rotation is unconfirmed;
 * data/kids-profile.json carries an explicit `phaseConfirmed` flag for that.
 *
 * ── OPEN ITEM: music-day instrument reminder ───────────────────────────────
 *
 * `needsRecorder` is still hardwired false for both children and nothing sets
 * it true. Myles is in 5th-grade Band on baritone this year, the baritone
 * comes home, and his Music day is now known — so a music-day packing
 * reminder is newly buildable. It is deliberately NOT built here: the field
 * name and the 'pack recorder tonight' string in getSchoolStrip() name the
 * wrong instrument, and changing that string turns three v1 tests red, one of
 * them inside the frozen render/dashboard.js surface. Separate scoped task.
 */

// ---------------------------------------------------------------------------
// 1. SCHOOL YEAR BOUNDS
// ---------------------------------------------------------------------------
//
// Both derived from the 🏫-prefixed all-day events on the Family calendar,
// entered 2026-08-17 from the WJCC 2026-27 Academic Calendar (adopted 3/24/26).
//
// These are constructed as LOCAL midnight (new Date(y, m, d)), never parsed
// from a 'YYYY-MM-DD' string — a string parses as UTC and lands on the wrong
// local calendar day west of Greenwich. Same convention as ANCHORS below.
//
// ⚠ These constants switch the entire feature off once they go stale: past
// SCHOOL_YEAR_END, isSchoolDay() returns false for every date and no rotation
// or backpack reminder can fire. That is exactly what happened to the 2025-26
// value through the whole of this school year. schoolRotation.test.js has a
// regression guard that fails as soon as SCHOOL_YEAR_END is in the past.

const SCHOOL_YEAR_START = new Date(2026, 7, 24);  // Mon Aug 24, 2026 — 🏫 First Day of School
const SCHOOL_YEAR_END   = new Date(2027, 5, 9);   // Wed Jun  9, 2027 — 🏫 Last Day of School

// ---------------------------------------------------------------------------
// 2. NO-SCHOOL DATES
// ---------------------------------------------------------------------------
//
// Weekdays only — weekends are excluded by isSchoolDay() before this set is
// consulted, so listing them would be noise.
//
// Derived by expanding each 🏫 closure event's [start.date, end.date) range;
// Google's all-day end.date is EXCLUSIVE, so a break shown as ending Nov 28
// has Nov 27 as its last real day.
//
// NOT included, deliberately: the three "Early Release" 🏫 events
// (2027-04-02, 2027-06-08, 2027-06-09). Early release is still a school day —
// the kids attend and the rotation advances. 2027-04-02 is a holiday for PK
// only; Myles and Ophelia are both K-5.

const NO_SCHOOL_DATES = new Set([
  '2026-09-04',                                // Student & Teacher Holiday
  '2026-09-07',                                // Labor Day
  '2026-09-25',                                // PK-5 Student Holiday / Staff CLP
  '2026-10-12',                                // Student Holiday / Staff CLP
  '2026-11-02', '2026-11-03',                  // Family Conferences
  '2026-11-25', '2026-11-26', '2026-11-27',    // Thanksgiving Break
  '2026-12-11',                                // PK-5 Student Holiday / Staff CLP
  '2026-12-21', '2026-12-22', '2026-12-23',    // Winter Break
  '2026-12-24', '2026-12-25', '2026-12-28',
  '2026-12-29', '2026-12-30',
  '2026-12-31',                                // Winter Break — see note below
  '2027-01-01',                                // New Year's Day
  '2027-01-18',                                // MLK Day
  '2027-01-25',                                // Student Holiday / Staff CLP
  '2027-02-15',                                // Presidents' Day
  '2027-03-05',                                // Student Holiday / Staff CLP
  '2027-04-05', '2027-04-06', '2027-04-07',    // Spring Break
  '2027-04-08', '2027-04-09',
  '2027-05-31',                                // Memorial Day
]);

// 2026-12-31 note: the Winter Break calendar event disagrees with itself —
// its end.date is 2026-12-31 (exclusive, so the break would end Dec 30) while
// its own description reads "Dec 21-31". Confirmed with Wade on 2026-08-28
// that Dec 31 is a no-school day, so it is listed above. This mattered more
// than one date normally would: a single wrong closure shifts every rotation
// day after it for the remainder of the year.

/**
 * Returns true if the given Date is a school day for Stonehouse Elementary.
 *
 * @param {Date} date
 * @returns {boolean}
 */
function isSchoolDay(date) {
  const dow = date.getDay(); // 0=Sun, 6=Sat
  if (dow === 0 || dow === 6) return false;

  const key = toDateKey(date);
  if (NO_SCHOOL_DATES.has(key)) return false;

  // School year boundary — both ends. The start bound matters as much as the
  // end: without it every summer weekday would read as a school day.
  const norm = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  if (norm < SCHOOL_YEAR_START) return false;
  if (norm > SCHOOL_YEAR_END) return false;

  return true;
}

/**
 * Formats a Date as 'YYYY-MM-DD' using local time.
 */
function toDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ---------------------------------------------------------------------------
// 3. ANCHOR CONFIGURATION
// ---------------------------------------------------------------------------
//
// Ophelia: her calendar entries for Aug 24 – Sep 8 are each captioned
// "Day N of 6-day rotation", sourced from Mrs. Pitts' Open House "Daily
// Schedule 2026-2027" sheet, and Wade confirmed the Day 1 = Aug 24 anchor
// against her Daily Planner on 2026-08-28.
//
// Myles: same school-wide anchor, confirmed 2026-09-06 from his own Sep 3
// Music day cross-checked against Ophelia's Sep 8 planner entry — see the
// header comment. He differs from Ophelia in MYLES_CENTERS, not here.

const ANCHORS = {
  myles: {
    date: new Date(2026, 7, 24),  // local midnight Aug 24 — avoid UTC string parsing
    day: 1,                       // anchor = Day 1 (PE2 for Myles)
    cycleLength: 6,
  },
  ophelia: {
    date: new Date(2026, 7, 24),  // local midnight Aug 24 — avoid UTC string parsing
    day: 1,                       // anchor = Day 1 (PE1)
    cycleLength: 6,
  },
};

// ---------------------------------------------------------------------------
// 4. ROTATION LABELS
// ---------------------------------------------------------------------------
//
// One school-wide 6-day cycle, entered at a different position by each class
// group. The day NUMBER is shared; the day-number → subject map is not, which
// is why these are two separate maps rather than two copies of one.
//
// ⚠ THESE DUPLICATE data/kids-profile.json.
// Each child's `centersRotation.sequence` there holds the same ordering, and
// nothing keeps the two files in sync — they can drift. For anything that
// RENDERS, THIS FILE IS AUTHORITATIVE: kids-profile.json is not in
// dashboard-artifact/package-inputs.json, so it is absent from the artifact
// Lambda and resolves to null there, while this module is bundled and reaches
// both the artifact and the email digest. Treat kids-profile.json as the
// documentary record (it carries the provenance notes and `phaseConfirmed`)
// and this map as the rendering source. If you change one, change both.

const CENTERS_6DAY = {
  1: 'PE1',
  2: 'Art',
  3: 'Computer',
  4: 'PE2',
  5: 'Media',     // ⚠️ Library checkout — pack book the day before
  6: 'Music',
};

// Myles enters the cycle at PE2 — three positions ahead of Ophelia. Before
// 2026-09-06 this was a copy of CENTERS_6DAY, which was Ophelia's mapping
// showing under his name; with his anchor set that would have printed the
// wrong centre for him every day, and moved his library-book reminder to the
// wrong date. Mirrors myles.centersRotation.sequence in data/kids-profile.json.
const MYLES_CENTERS = {
  1: 'PE2',
  2: 'Media',     // ⚠️ Library checkout — pack book the day before
  3: 'Music',
  4: 'PE1',
  5: 'Art',
  6: 'Computer',
};

// Ophelia enters at PE1, which is the school-wide cycle as written above.
// Mirrors ophelia.centersRotation.sequence in data/kids-profile.json.
const OPHELIA_CENTERS = { ...CENTERS_6DAY };

// The centre label that triggers the pack-a-library-book reminder.
const LIBRARY_CENTER = 'Media';

// ---------------------------------------------------------------------------
// 5. CORE CALCULATOR
// ---------------------------------------------------------------------------

/**
 * Counts school days between two dates (exclusive of start, inclusive of target).
 * Positive = target is after start; negative = target is before start.
 *
 * @param {Date} from  - anchor date (included in count baseline)
 * @param {Date} to    - target date
 * @returns {number}   - signed school-day delta
 */
function schoolDayDelta(from, to) {
  const fromNorm = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const toNorm   = new Date(to.getFullYear(),   to.getMonth(),   to.getDate());

  if (fromNorm.getTime() === toNorm.getTime()) return 0;

  const forward = toNorm > fromNorm;
  let cursor = new Date(fromNorm);
  let delta = 0;

  while (true) {
    // Move one day in the direction of travel
    cursor.setDate(cursor.getDate() + (forward ? 1 : -1));

    const cursorNorm = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate());

    if (isSchoolDay(cursorNorm)) {
      delta += forward ? 1 : -1;
    }

    if (cursorNorm.getTime() === toNorm.getTime()) break;
  }

  return delta;
}

/**
 * Returns the rotation day number (1-based) for a student on a given date.
 *
 * @param {'myles'|'ophelia'} student
 * @param {Date} targetDate
 * @returns {number|null}  - day number, or null if not a school day OR if the
 *                           student has no anchor configured yet
 */
function getRotationDay(student, targetDate) {
  const anchor = ANCHORS[student];
  if (!anchor) return null;

  const targetNorm = new Date(
    targetDate.getFullYear(),
    targetDate.getMonth(),
    targetDate.getDate()
  );

  if (!isSchoolDay(targetNorm)) return null;

  const { date: anchorDate, day: anchorDay, cycleLength } = anchor;
  const delta = schoolDayDelta(anchorDate, targetNorm);

  // Shift from anchor, wrap into [0, cycleLength), then convert to 1-based
  const dayIndex = ((anchorDay - 1 + delta) % cycleLength + cycleLength) % cycleLength;
  return dayIndex + 1;
}

// ---------------------------------------------------------------------------
// 6. PUBLIC API
// ---------------------------------------------------------------------------

/**
 * Full rotation result for a single student on a given date.
 *
 * @typedef {Object} RotationResult
 * @property {number|null} day          - rotation day number (null if no school
 *                                        OR the student is unanchored)
 * @property {string|null} center       - center label (null in the same cases)
 * @property {boolean}     isSchoolDay  - whether school is in session. Answered
 *                                        truthfully even for an unanchored
 *                                        student, so a null centre and a closed
 *                                        school stay distinguishable.
 * @property {boolean}     needsLibraryBook - true if Wade must pack a library book TODAY
 * @property {boolean}     needsRecorder    - true if Wade must pack a recorder TODAY
 * @property {string|null} warningText  - human-readable prep warning, or null
 */

/**
 * Get rotation info for a specific student on a specific date.
 *
 * @param {'myles'|'ophelia'} student
 * @param {Date} date
 * @returns {RotationResult}
 */
function getRotation(student, date) {
  const day = getRotationDay(student, date);
  const centers = student === 'myles' ? MYLES_CENTERS : OPHELIA_CENTERS;

  if (day === null) {
    return {
      day: null,
      center: null,
      // An unanchored student on an open school day still reports true here.
      isSchoolDay: isSchoolDay(date),
      needsLibraryBook: false,
      needsRecorder: false,
      warningText: null,
    };
  }

  const center = centers[day];
  let needsLibraryBook = false;
  let needsRecorder = false;
  let warningText = null;

  const label = student === 'myles' ? 'Myles' : 'Ophelia';

  if (center === LIBRARY_CENTER) {
    needsLibraryBook = true;
    warningText = `⚠ Pack library book this morning (${label} — Media today)`;
  }
  // Music day: awareness only for Ophelia, no item. Whether Myles's Music day
  // needs an instrument packed is a separate open item — see the header
  // comment. It is no longer blocked on his anchor, which is now set.

  return {
    day,
    center,
    isSchoolDay: true,
    needsLibraryBook,
    needsRecorder,
    warningText,
  };
}

/**
 * Get rotation info for TOMORROW — used to generate the day-before reminder
 * in today's digest. The digest runs in the morning, so "tomorrow" is what
 * matters for Wade's backpack-packing trigger.
 *
 * @param {'myles'|'ophelia'} student
 * @param {Date} today
 * @returns {RotationResult}
 */
function getTomorrowRotation(student, today) {
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return getRotation(student, tomorrow);
}

/**
 * Full digest-ready school strip for both kids on a given date.
 *
 * @param {Date} today
 * @returns {Object}
 */
function getSchoolStrip(today) {
  const myles   = getRotation('myles',   today);
  const ophelia = getRotation('ophelia', today);

  // Tomorrow reminders — digest shows these proactively
  const mylesTomorrow   = getTomorrowRotation('myles',   today);
  const opheliaTomorrow = getTomorrowRotation('ophelia', today);

  const tomorrowWarnings = [];

  if (mylesTomorrow.needsLibraryBook) {
    tomorrowWarnings.push('Tomorrow: Myles has Media — pack library book tonight');
  }
  if (mylesTomorrow.needsRecorder) {
    tomorrowWarnings.push('Tomorrow: Myles has Music — pack recorder tonight');
  }
  if (opheliaTomorrow.needsLibraryBook) {
    tomorrowWarnings.push('Tomorrow: Ophelia has Media — pack library book tonight');
  }

  return { myles, ophelia, tomorrowWarnings };
}

// ---------------------------------------------------------------------------
// 7. UTILITY: add a no-school date at runtime
// ---------------------------------------------------------------------------

/**
 * Register an additional no-school date (e.g. parsed from a newsletter, or a
 * snow day). Call this before getSchoolStrip().
 *
 * @param {string} dateString - 'YYYY-MM-DD'
 */
function addNoSchoolDate(dateString) {
  NO_SCHOOL_DATES.add(dateString);
}

// ---------------------------------------------------------------------------
// EXPORTS
// ---------------------------------------------------------------------------
export {
  getRotation,
  getTomorrowRotation,
  getSchoolStrip,
  addNoSchoolDate,
  isSchoolDay,
  MYLES_CENTERS,
  OPHELIA_CENTERS,
  ANCHORS,
  SCHOOL_YEAR_START,
  SCHOOL_YEAR_END,
};
