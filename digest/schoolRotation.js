/**
 * schoolRotation.js
 * Moore Family Operations Assistant
 *
 * Calculates the Centers rotation day for Myles (4th grade, 6-day cycle)
 * and Ophelia (1st grade, 7-day cycle) for any given date.
 *
 * KEY RULES:
 *   - Rotation advances ONLY on actual school days (Mon–Fri, no holidays/closures)
 *   - Anchor dates are confirmed in the Family Operations Context Document v20.3
 *   - Myles anchor:   May 1, 2026 = Day 4  (6-day rotation)
 *   - Ophelia anchor: May 1, 2026 = Day 1  (7-day rotation)
 *
 * DIGEST REMINDER RULES (from Section 13):
 *   - Library day (Myles Day 5, Ophelia Day 7): warn THE DAY BEFORE → Wade packs book
 *   - Music day (Myles Day 6 only):             warn THE DAY BEFORE → Wade packs recorder
 *   - Ophelia Music (Day 1): awareness only — no item needed
 */

// ---------------------------------------------------------------------------
// 1. KNOWN NO-SCHOOL DATES  (extend as needed each school year)
// ---------------------------------------------------------------------------
// Format: 'YYYY-MM-DD'
const NO_SCHOOL_DATES = new Set([
  // Memorial Day 2026
  '2026-05-25',
  // Add additional holidays/teacher workdays here
  // e.g. '2026-06-06'  (last day of school TBD — remove once confirmed)
]);

/**
 * Returns true if the given Date is a school day for Stonehouse Elementary.
 * School year assumed to run through mid-June 2026.
 * Extend NO_SCHOOL_DATES for any additional closures.
 *
 * @param {Date} date
 * @returns {boolean}
 */
function isSchoolDay(date) {
  const dow = date.getDay(); // 0=Sun, 6=Sat
  if (dow === 0 || dow === 6) return false;

  const key = toDateKey(date);
  if (NO_SCHOOL_DATES.has(key)) return false;

  // School year boundary — adjust end date when confirmed
  const schoolYearEnd = new Date('2026-06-15');
  if (date > schoolYearEnd) return false;

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
// 2. ANCHOR CONFIGURATION
// ---------------------------------------------------------------------------
const ANCHORS = {
  myles: {
    date: new Date(2026, 4, 1),  // local midnight May 1 — avoid UTC string parsing
    day: 4,           // anchor = Day 4
    cycleLength: 6,
  },
  ophelia: {
    date: new Date(2026, 4, 1),  // local midnight May 1 — avoid UTC string parsing
    day: 1,           // anchor = Day 1
    cycleLength: 7,
  },
};

// ---------------------------------------------------------------------------
// 3. ROTATION LABELS
// ---------------------------------------------------------------------------
const MYLES_CENTERS = {
  1: 'PE',
  2: 'Art',
  3: 'Computer',
  4: 'PE',
  5: 'Library',   // ⚠️ Pack library book day before
  6: 'Music',     // ⚠️ Pack recorder day before
};

const OPHELIA_CENTERS = {
  1: 'Music',              // Awareness only — no item needed
  2: 'PE',
  3: 'Art',
  4: 'Technology Extension',
  5: 'Computer',
  6: 'PE',
  7: 'Library',            // ⚠️ Pack library book day before
};

// ---------------------------------------------------------------------------
// 4. CORE CALCULATOR
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
 * @returns {number|null}  - day number, or null if not a school day
 */
function getRotationDay(student, targetDate) {
  const targetNorm = new Date(
    targetDate.getFullYear(),
    targetDate.getMonth(),
    targetDate.getDate()
  );

  if (!isSchoolDay(targetNorm)) return null;

  const { date: anchorDate, day: anchorDay, cycleLength } = ANCHORS[student];
  const delta = schoolDayDelta(anchorDate, targetNorm);

  // Shift from anchor, wrap into [0, cycleLength), then convert to 1-based
  const dayIndex = ((anchorDay - 1 + delta) % cycleLength + cycleLength) % cycleLength;
  return dayIndex + 1;
}

// ---------------------------------------------------------------------------
// 5. PUBLIC API
// ---------------------------------------------------------------------------

/**
 * Full rotation result for a single student on a given date.
 *
 * @typedef {Object} RotationResult
 * @property {number|null} day          - rotation day number (null if no school)
 * @property {string|null} center       - center label (null if no school)
 * @property {boolean}     isSchoolDay  - whether school is in session
 * @property {boolean}     needsLibraryBook - true if Wade must pack library book TODAY
 * @property {boolean}     needsRecorder    - true if Wade must pack recorder TODAY (Myles only)
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
      isSchoolDay: false,
      needsLibraryBook: false,
      needsRecorder: false,
      warningText: null,
    };
  }

  const center = centers[day];
  let needsLibraryBook = false;
  let needsRecorder = false;
  let warningText = null;

  if (student === 'myles') {
    if (center === 'Library') {
      needsLibraryBook = true;
      warningText = '⚠ Pack library book this morning (Myles — Library today)';
    } else if (center === 'Music') {
      needsRecorder = true;
      warningText = '⚠ Pack recorder this morning (Myles — Music today)';
    }
  } else if (student === 'ophelia') {
    if (center === 'Library') {
      needsLibraryBook = true;
      warningText = '⚠ Pack library book this morning (Ophelia — Library today)';
    }
    // Music day: awareness only, no item
  }

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
 * Returns an object consumed by both the email renderer and dashboard renderer:
 * {
 *   myles:   RotationResult,
 *   ophelia: RotationResult,
 *   // Pre-built reminders for tomorrow (the day-before trigger)
 *   tomorrowWarnings: string[]   // human-readable, e.g. "Tomorrow: Myles has Library — pack book"
 * }
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
    tomorrowWarnings.push('Tomorrow: Myles has Library — pack book tonight');
  }
  if (mylesTomorrow.needsRecorder) {
    tomorrowWarnings.push('Tomorrow: Myles has Music — pack recorder tonight');
  }
  if (opheliaTomorrow.needsLibraryBook) {
    tomorrowWarnings.push('Tomorrow: Ophelia has Library — pack book tonight');
  }

  return { myles, ophelia, tomorrowWarnings };
}

// ---------------------------------------------------------------------------
// 6. UTILITY: add a no-school date at runtime (e.g. from newsletter parser)
// ---------------------------------------------------------------------------

/**
 * Register an additional no-school date (e.g. parsed from Stonehouse newsletter).
 * Call this before getSchoolStrip() when the newsletter reveals a closure.
 *
 * @param {string} dateString - 'YYYY-MM-DD'
 */
function addNoSchoolDate(dateString) {
  NO_SCHOOL_DATES.add(dateString);
}

// ---------------------------------------------------------------------------
// EXPORTS
// ---------------------------------------------------------------------------
export { getRotation, getTomorrowRotation, getSchoolStrip, addNoSchoolDate, isSchoolDay, MYLES_CENTERS, OPHELIA_CENTERS };