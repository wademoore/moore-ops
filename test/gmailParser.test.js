import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  SENDER_MAP,
  buildGmailHits,
  buildActivityCommsLines,
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