/**
 * digest/gmailParser.js
 * Moore Family Operations Assistant
 *
 * Gmail sender classification and activity-comms line builder.
 * Extracted from digest/builder.js (sections 1, 4, 9).
 */

// ---------------------------------------------------------------------------
// 1. GMAIL SENDER → gmailHits KEY MAP
// ---------------------------------------------------------------------------
// Maps the from-address pattern to the key flags.js expects in gmailHits.
// Order matters — first match wins.

export const SENDER_MAP = [
  { pattern: /thestudiodirectr\.biz/i,      key: 'dance'        },
  { pattern: /gomotionapp\.com/i,            key: 'swim'         },
  { pattern: /leagueapps\.com/i,             key: 'flagFootball' },
  { pattern: /dash@dashplatform\.com/i,      key: 'sharks'       },
  { pattern: /martinvickerton14@gmail/i,     key: 'sharks'       },
  { pattern: /melissa\.white@wjccschools/i,  key: 'newsletter'   },
  // Wellington Waves — no dedicated sender yet; monitor for assignment emails
  { pattern: /wellingtonwaves/i,             key: 'waves'        },
];

// ---------------------------------------------------------------------------
// 4. GMAIL → gmailHits
// ---------------------------------------------------------------------------

export function buildGmailHits(emails) {
  const hits = {};
  for (const email of (emails || [])) {
    const from = email.from || '';
    for (const { pattern, key } of SENDER_MAP) {
      if (pattern.test(from) && !hits[key]) {
        hits[key] = email; // store first match per key
        break;
      }
    }
  }
  return hits;
}

// ---------------------------------------------------------------------------
// 9. ACTIVITY COMMS LINES
// ---------------------------------------------------------------------------
// Converts raw email objects into human-readable digest lines.

export function buildActivityCommsLines(emails) {
  const lines = [];

  for (const email of (emails || [])) {
    const from    = email.from    || '';
    const subject = email.subject || '';
    const snippet = email.snippet || '';

    // Identify source
    let source = '';
    for (const { pattern, key } of SENDER_MAP) {
      if (pattern.test(from)) {
        source = {
          dance:       'Dance Studio',
          swim:        '757 Swim',
          flagFootball:'Flag Football League',
          sharks:      'Tidewater Sharks',
          newsletter:  'Stonehouse Elementary',
          waves:       'Wellington Waves',
        }[key] || key;
        break;
      }
    }
    if (!source) continue;

    // Build a concise line
    const line = `${source}: "${subject}"${snippet ? ` — ${snippet.slice(0, 80)}` : ''}`;
    lines.push(line);
  }

  return lines;
}