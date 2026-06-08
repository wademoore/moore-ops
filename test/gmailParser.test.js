import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  SENDER_MAP,
  buildGmailHits,
  buildActivityCommsLines,
  classifyFlagFootballEmail,
  extractNewsletterUrl,
} from '../digest/gmailParser.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeEmail(from, subject = 'Subject', snippet = 'Snippet') {
  return { from, subject, snippet };
}

// ── SENDER_MAP pattern matching ───────────────────────────────────────────────

describe('SENDER_MAP pattern matching', () => {
  function findKey(address) {
    for (const { pattern, key } of SENDER_MAP) {
      if (pattern.test(address)) return key;
    }
    return null;
  }

  it("'no-reply@thestudiodirectr.biz' matches key 'dance'", () => {
    assert.equal(findKey('no-reply@thestudiodirectr.biz'), 'dance');
  });

  it("'notifications@gomotionapp.com' matches key 'swim'", () => {
    assert.equal(findKey('notifications@gomotionapp.com'), 'swim');
  });

  it("'melissa.white@wjccschools.org' matches key 'newsletter'", () => {
    assert.equal(findKey('melissa.white@wjccschools.org'), 'newsletter');
  });

  it("'unknown@example.com' matches no key", () => {
    assert.equal(findKey('unknown@example.com'), null);
  });
});

// ── buildGmailHits ────────────────────────────────────────────────────────────

describe('buildGmailHits(emails)', () => {
  it('returns {} for empty array', () => {
    assert.deepEqual(buildGmailHits([]), {});
  });

  it('maps a dance email to hits.dance', () => {
    const email = makeEmail('no-reply@thestudiodirectr.biz', 'Recital Info');
    const hits = buildGmailHits([email]);
    assert.ok(hits.dance, 'expected hits.dance to be set');
    assert.equal(hits.dance.subject, 'Recital Info');
  });

  it('first-match-wins: two dance emails → hits.dance is the first one', () => {
    const first  = makeEmail('no-reply@thestudiodirectr.biz', 'First');
    const second = makeEmail('no-reply@thestudiodirectr.biz', 'Second');
    const hits = buildGmailHits([first, second]);
    assert.equal(hits.dance.subject, 'First');
  });

  it('does not add a key when no pattern matches', () => {
    const email = makeEmail('unknown@example.com', 'Spam');
    const hits = buildGmailHits([email]);
    assert.deepEqual(hits, {});
  });
});

// ── buildActivityCommsLines ───────────────────────────────────────────────────

describe('buildActivityCommsLines(emails)', () => {
  it('returns [] for empty emails array', () => {
    assert.deepEqual(buildActivityCommsLines([]), []);
  });

  it('skips emails with no matching sender', () => {
    const email = makeEmail('unknown@example.com', 'Hello', 'world');
    const lines = buildActivityCommsLines([email]);
    assert.deepEqual(lines, []);
  });

  it("formats matched email as 'Dance Studio: \"subject\" — snippet'", () => {
    const email = makeEmail('no-reply@thestudiodirectr.biz', 'Costume Due', 'Please return by Friday');
    const lines = buildActivityCommsLines([email]);
    assert.equal(lines.length, 1);
    assert.equal(lines[0], 'Dance Studio: "Costume Due" — Please return by Friday');
  });
});

// ── classifyFlagFootballEmail ─────────────────────────────────────────────────

describe('classifyFlagFootballEmail(subject)', () => {
  it("'Williamsburg NFL Flag League Spring 2026 - Week 3' → 'boilerplate'", () => {
    assert.equal(classifyFlagFootballEmail('Williamsburg NFL Flag League Spring 2026 - Week 3'), 'boilerplate');
  });

  it("'Williamsburg NFL Flag League - Week 12 Reminders' → 'boilerplate'", () => {
    assert.equal(classifyFlagFootballEmail('Williamsburg NFL Flag League - Week 12 Reminders'), 'boilerplate');
  });

  it("'week 5' (lowercase) → 'boilerplate'", () => {
    assert.equal(classifyFlagFootballEmail('week 5'), 'boilerplate');
  });

  it("'Williamsburg NFL Flag League Games CANCELLED - May 17th' → 'actionable'", () => {
    assert.equal(classifyFlagFootballEmail('Williamsburg NFL Flag League Games CANCELLED - May 17th'), 'actionable');
  });

  it("'Williamsburg Rescheduled Game Update' → 'actionable'", () => {
    assert.equal(classifyFlagFootballEmail('Williamsburg Rescheduled Game Update'), 'actionable');
  });

  it("'Playoff Placeholder Schedule Update' → 'actionable'", () => {
    assert.equal(classifyFlagFootballEmail('Playoff Placeholder Schedule Update'), 'actionable');
  });

  it("unknown subject → 'actionable' (fail open)", () => {
    assert.equal(classifyFlagFootballEmail('Something completely new and different'), 'actionable');
  });

  it("empty string → 'actionable' (fail open)", () => {
    assert.equal(classifyFlagFootballEmail(''), 'actionable');
  });
});

// ── buildGmailHits — flagFootball classification ──────────────────────────────

describe('buildGmailHits — flagFootball classification', () => {
  const FF_FROM = 'perfectperformanceflag.mailer@leagueapps.com';

  it('boilerplate flagFootball email → hits.flagFootball is absent', () => {
    const email = makeEmail(FF_FROM, 'Williamsburg NFL Flag League Spring 2026 - Week 3');
    const hits = buildGmailHits([email]);
    assert.equal(hits.flagFootball, undefined);
    assert.ok(!('flagFootball' in hits), 'hits.flagFootball key must be absent');
  });

  it('actionable flagFootball email → hits.flagFootball is set', () => {
    const email = makeEmail(FF_FROM, 'Williamsburg NFL Flag League Games CANCELLED - May 17th');
    const hits = buildGmailHits([email]);
    assert.ok(hits.flagFootball, 'expected hits.flagFootball to be set');
    assert.equal(hits.flagFootball.subject, 'Williamsburg NFL Flag League Games CANCELLED - May 17th');
  });

  it('boilerplate first, actionable second → hits.flagFootball set to actionable email', () => {
    const boilerplate = makeEmail(FF_FROM, 'Williamsburg NFL Flag League Spring 2026 - Week 3');
    const actionable  = makeEmail(FF_FROM, 'Williamsburg Rescheduled Game Update');
    const hits = buildGmailHits([boilerplate, actionable]);
    assert.ok(hits.flagFootball, 'expected hits.flagFootball to be set');
    assert.equal(hits.flagFootball.subject, 'Williamsburg Rescheduled Game Update');
  });
});

// ── buildActivityCommsLines — flagFootball classification ─────────────────────

describe('buildActivityCommsLines — flagFootball classification', () => {
  const FF_FROM = 'perfectperformanceflag.mailer@leagueapps.com';

  it('actionable flagFootball email → line emitted with 120-char snippet truncation', () => {
    const longSnippet = 'A'.repeat(150);
    const email = makeEmail(FF_FROM, 'Games CANCELLED - May 17th', longSnippet);
    const lines = buildActivityCommsLines([email]);
    assert.equal(lines.length, 1);
    assert.ok(lines[0].startsWith('Flag Football League: "Games CANCELLED - May 17th"'));
    assert.ok(lines[0].includes('A'.repeat(120)), 'snippet should be truncated at 120 chars');
    assert.ok(!lines[0].includes('A'.repeat(121)), 'snippet must not exceed 120 chars');
  });

  it('boilerplate flagFootball email → no line emitted', () => {
    const email = makeEmail(FF_FROM, 'Williamsburg NFL Flag League Spring 2026 - Week 3', 'Weekly reminders');
    const lines = buildActivityCommsLines([email]);
    assert.deepEqual(lines, []);
  });
});

// ── extractNewsletterUrl ──────────────────────────────────────────────────────

describe('extractNewsletterUrl(emailBody)', () => {
  it('returns SendGrid URL when href contains relative-link attribute', () => {
    const body = `<a href=3D"https://u345601.ct.sendgrid.net/ls/click?upn=abc123" relative-link=3D"true">View Newsletter</a>`;
    const result = extractNewsletterUrl(body);
    assert.equal(result, 'https://u345601.ct.sendgrid.net/ls/click?upn=abc123');
  });

  it('handles quoted-printable soft line breaks splitting the URL', () => {
    const body = `<a href=3D"https://u345601.ct.sendgrid.net/ls/click?upn=abc=\n123" relative-link=3D"true">View</a>`;
    const result = extractNewsletterUrl(body);
    assert.equal(result, 'https://u345601.ct.sendgrid.net/ls/click?upn=abc123');
  });

  it('returns null when body has only an unsubscribe link (no relative-link attribute)', () => {
    const body = `<a href=3D"https://u345601.ct.sendgrid.net/ls/click?upn=unsub456">Unsubscribe</a>`;
    const result = extractNewsletterUrl(body);
    assert.equal(result, null);
  });

  it('returns null for null input', () => {
    const result = extractNewsletterUrl(null);
    assert.equal(result, null);
  });

  it('handles =\\n soft break between href value and relative-link attribute', () => {
    const body = `<a href=3D"https://u345601.ct.sendgrid.net/ls/click?upn=abc123" =\nrelative-link=3D"">View</a>`;
    const result = extractNewsletterUrl(body);
    assert.equal(result, 'https://u345601.ct.sendgrid.net/ls/click?upn=abc123');
  });
});

// ── SwimTopia / Wellington Waves sender ──────────────────────────────────────

describe('SENDER_MAP — swimtopia pattern', () => {
  function findKey(address) {
    for (const { pattern, key } of SENDER_MAP) {
      if (pattern.test(address)) return key;
    }
    return null;
  }

  it("'noreply+waves@swimtopia.net' matches key 'swimtopia'", () => {
    assert.equal(findKey('noreply+waves@swimtopia.net'), 'swimtopia');
  });

  it("non-regression: 'no-reply@thestudiodirectr.biz' still matches key 'dance'", () => {
    assert.equal(findKey('no-reply@thestudiodirectr.biz'), 'dance');
  });
});

describe('buildActivityCommsLines — swimtopia 📣 Waves: line format', () => {
  it("formats SwimTopia email as '📣 Waves: \"subject\" — snippet'", () => {
    const email = makeEmail('noreply+waves@swimtopia.net', 'Practice Tuesday 6–8pm', 'See you at the pool!');
    const lines = buildActivityCommsLines([email]);
    assert.equal(lines.length, 1);
    assert.ok(lines[0].startsWith('📣 Waves:'), `line should start with 📣 Waves:, got: ${lines[0]}`);
    assert.ok(lines[0].includes('Practice Tuesday 6–8pm'), `line should include subject, got: ${lines[0]}`);
  });
});

// ── buildActivityCommsLines — newsletter 📋 line format ───────────────────────

describe('buildActivityCommsLines — newsletter 📋 line format', () => {
  it('emits 📋 Stonehouse Newsletter line when gmailHits.newsletter has newsletterUrl', () => {
    const newsletterEmail = {
      from: 'melissa.white@wjccschools.org',
      subject: 'Week 32 Newsletter',
      snippet: 'This week at Stonehouse...',
    };
    const gmailHits = {
      newsletter: {
        ...newsletterEmail,
        newsletterUrl: 'https://u345601.ct.sendgrid.net/ls/click?upn=abc123',
      },
    };
    const lines = buildActivityCommsLines([newsletterEmail], gmailHits);
    assert.equal(lines.length, 1);
    assert.ok(lines[0].startsWith('📋 Stonehouse Newsletter'), `line should start with 📋 Stonehouse Newsletter, got: ${lines[0]}`);
  });
});