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
  { pattern: /swimtopia\.net/i,              key: 'swimtopia'    },
];

// ---------------------------------------------------------------------------
// 2. FLAG FOOTBALL EMAIL CLASSIFICATION
// ---------------------------------------------------------------------------
// Pure function — no side effects, exported for testing.
// Boilerplate: weekly league emails with no actionable content (Week N).
// Actionable: cancellations, reschedules, playoffs, or anything else unknown.
// Default is 'actionable' — fail open rather than silently suppress.

export function classifyFlagFootballEmail(subject) {
  if (/\bweek\s+\d+\b/i.test(subject)) return 'boilerplate';
  return 'actionable';
}

// ---------------------------------------------------------------------------
// 3. NEWSLETTER URL EXTRACTION
// ---------------------------------------------------------------------------
// Extracts the Smore newsletter link from a quoted-printable Gmail body.
// Looks for an <a> tag with a relative-link attribute whose href is the
// canonical Smore/SendGrid URL for the newsletter.

export function extractNewsletterUrl(emailBody) {
  if (!emailBody) return null;
  // Strip quoted-printable soft line breaks
  const decoded = emailBody.replace(/=\n/g, '');
  // Match href on an <a> tag that also contains relative-link attribute
  const match = decoded.match(/href=3D["']?(https:\/\/[^"'\s>]+)["']?[^>]*relative-link|relative-link[^>]*href=3D["']?(https:\/\/[^"'\s>]+)["']?/i);
  if (!match) return null;
  return (match[1] || match[2]) || null;
}

// ---------------------------------------------------------------------------
// 4. GMAIL → gmailHits
// ---------------------------------------------------------------------------

export function buildGmailHits(emails) {
  const hits = {};
  for (const email of (emails || [])) {
    const from = email.from || '';
    for (const { pattern, key } of SENDER_MAP) {
      if (pattern.test(from) && !hits[key]) {
        // Flag football: skip boilerplate weekly emails — only store actionable ones
        if (key === 'flagFootball' && classifyFlagFootballEmail(email.subject || '') === 'boilerplate') {
          break;
        }
        if (key === 'newsletter') {
          hits[key] = { ...email, newsletterUrl: extractNewsletterUrl(email.body || '') };
        } else {
          hits[key] = email; // store first match per key
        }
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

export function buildActivityCommsLines(emails, gmailHits = {}) {
  const lines = [];

  for (const email of (emails || [])) {
    const from    = email.from    || '';
    const subject = email.subject || '';
    const snippet = email.snippet || '';

    // Identify source
    let source = '';
    let matchedKey = '';
    for (const { pattern, key } of SENDER_MAP) {
      if (pattern.test(from)) {
        matchedKey = key;
        source = {
          dance:       'Dance Studio',
          swim:        '757 Swim',
          flagFootball:'Flag Football League',
          sharks:      'Tidewater Sharks',
          newsletter:  'Stonehouse Elementary',
          waves:       'Wellington Waves',
          swimtopia:   'Wellington Waves',
        }[key] || key;
        break;
      }
    }
    if (!source) continue;

    // Flag football: skip boilerplate weekly emails — only surface actionable ones
    if (matchedKey === 'flagFootball' && classifyFlagFootballEmail(subject) === 'boilerplate') continue;

    // Newsletter: emit link format if URL is present
    if (matchedKey === 'newsletter') {
      const url = gmailHits.newsletter?.newsletterUrl;
      const line = url
        ? `📋 Stonehouse Newsletter — "${subject}" · ${url}`
        : `Stonehouse Elementary: "${subject}"${snippet ? ` — ${snippet.slice(0, 80)}` : ''}`;
      lines.push(line);
      continue;
    }

    // SwimTopia (Wellington Waves): render with 📣 Waves: prefix
    if (matchedKey === 'swimtopia') {
      const line = `📣 Waves: "${subject}"${snippet ? ` — ${snippet.slice(0, 80)}` : ''}`;
      lines.push(line);
      continue;
    }

    // Build a concise line — flagFootball actionable gets 120-char snippet for more context
    const snippetLimit = matchedKey === 'flagFootball' ? 120 : 80;
    const line = `${source}: "${subject}"${snippet ? ` — ${snippet.slice(0, snippetLimit)}` : ''}`;
    lines.push(line);
  }

  return lines;
}