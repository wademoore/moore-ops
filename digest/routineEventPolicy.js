/**
 * Household routines whose normal ownership and coverage are already settled.
 * They remain calendar-visible, but ordinary occurrences do not need an
 * operational warning or NOW/NEXT promotion. Explicit changes still do.
 */
function isStandardCoverageRoutine(event) {
  const text = `${event?.title || event?.summary || ''} ${event?.subtitle || ''}`;
  return /\b(?:gk|goalkeeper)(?:\s+skills?)?\s+training\b/i.test(text);
}

export { isStandardCoverageRoutine };
