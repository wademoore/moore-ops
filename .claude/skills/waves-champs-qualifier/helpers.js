export const standards = {
  'Boys 6&Under|25m Freestyle': 36,   'Girls 6&Under|25m Freestyle': 36,
  'Boys 6&Under|25m Backstroke': 42,  'Girls 6&Under|25m Backstroke': 41,
  'Boys 7-8|25m Freestyle': 22,       'Girls 7-8|25m Freestyle': 23,
  'Boys 7-8|25m Backstroke': 29,      'Girls 7-8|25m Backstroke': 29,
  'Boys 8&Under|25m Breaststroke': 35,'Girls 8&Under|25m Breaststroke': 34,
  'Boys 8&Under|25m Butterfly': 37,   'Girls 8&Under|25m Butterfly': 37,
  'Boys 10&Under|100m Individual Medley': 118, 'Girls 10&Under|100m Individual Medley': 115,
  'Boys 9-10|50m Freestyle': 43,      'Girls 9-10|50m Freestyle': 43,
  'Boys 9-10|50m Breaststroke': 65,   'Girls 9-10|50m Breaststroke': 60,
  'Boys 9-10|50m Backstroke': 57,     'Girls 9-10|50m Backstroke': 53,
  'Boys 9-10|50m Butterfly': 60,      'Girls 9-10|50m Butterfly': 58,
  'Boys 11-12|100m Individual Medley': 100, 'Girls 11-12|100m Individual Medley': 100,
  'Boys 11-12|50m Freestyle': 37,     'Girls 11-12|50m Freestyle': 38,
  'Boys 11-12|50m Breaststroke': 52,  'Girls 11-12|50m Breaststroke': 52,
  'Boys 11-12|50m Backstroke': 48,    'Girls 11-12|50m Backstroke': 48,
  'Boys 11-12|50m Butterfly': 48,     'Girls 11-12|50m Butterfly': 47,
  'Boys 13-14|100m Individual Medley': 90, 'Girls 13-14|100m Individual Medley': 90,
  'Boys 13-14|50m Freestyle': 33,     'Girls 13-14|50m Freestyle': 35,
  'Boys 13-14|50m Breaststroke': 48,  'Girls 13-14|50m Breaststroke': 48,
  'Boys 13-14|50m Backstroke': 45,    'Girls 13-14|50m Backstroke': 43,
  'Boys 13-14|50m Butterfly': 42,     'Girls 13-14|50m Butterfly': 40,
  'Boys 15-18|100m Individual Medley': 80, 'Girls 15-18|100m Individual Medley': 86,
  'Boys 15-18|50m Freestyle': 30,     'Girls 15-18|50m Freestyle': 33,
  'Boys 15-18|50m Breaststroke': 42,  'Girls 15-18|50m Breaststroke': 47,
  'Boys 15-18|50m Backstroke': 39,    'Girls 15-18|50m Backstroke': 43,
  'Boys 15-18|50m Butterfly': 34,     'Girls 15-18|50m Butterfly': 38,
};

export function getLookupKey(gender, ageGroup, event) {
  if (event === '100m Individual Medley') {
    const ag = ageGroup.replace('9-10', '10&Under');
    return gender + ' ' + ag + '|' + event;
  }
  return gender + ' ' + ageGroup + '|' + event;
}

/**
 * Returns true if the swimmer has any qualifying swim in ANY event, across all
 * rows in historyRows, dated strictly before beforeDate (ISO 'YYYY-MM-DD').
 *
 * "First time ever" means no prior champs-standard swim in any event — not just
 * the same event being evaluated. Same-day rows are excluded (r.date >= beforeDate
 * fails), so two qualifying swims at the same meet do not suppress each other.
 *
 * Each row's standard is looked up using that row's OWN ageGroup and event, not
 * the swimmer's current-season bracket — important because standards are bracket-
 * specific and swimmers age up yearly.
 *
 * Row shape required: { swimmer, event, dq, seconds, ageGroup, date }
 * - swimmer: "Last First" format (normalized from display name internally)
 * - seconds: numeric time in seconds (callers must map r.time → seconds for
 *   league-results*.json sources, which store time under r.time not r.seconds)
 * - ageGroup: full bracket string e.g. 'Boys 9-10', 'Girls 8&Under'
 * - date: ISO date string 'YYYY-MM-DD'
 *
 * @param {string} displayName - "First Last" display name
 * @param {Array<{swimmer:string,event:string,dq:boolean,seconds:number,ageGroup:string,date:string}>} historyRows
 * @param {string} beforeDate - ISO date string; rows on or after this date are excluded
 * @returns {boolean}
 */
export function hasAnyPriorQual(displayName, historyRows, beforeDate) {
  const nameParts = displayName.split(' ');
  const histKey = nameParts[nameParts.length - 1] + ' ' + nameParts.slice(0, -1).join(' ');
  return historyRows.some(r => {
    if (r.swimmer !== histKey) return false;
    if (r.date >= beforeDate) return false;
    if (r.dq === true) return false;
    if (r.seconds == null || isNaN(r.seconds)) return false;
    if (!r.ageGroup) return false;
    const agParts = r.ageGroup.split(' ');
    const gender  = agParts[0];
    const ag      = agParts.slice(1).join(' ');
    const std     = standards[getLookupKey(gender, ag, r.event)];
    if (std == null) return false;
    return r.seconds <= std;
  });
}
