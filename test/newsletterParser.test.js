import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { parseNewsletterItems } from '../digest/newsletterParser.js';

// ── Fixture ───────────────────────────────────────────────────────────────────

const SAMPLE_HTML = `
  <script>var x = {"key":"val"};</script>
  <style>.foo{color:red}</style>
  <p>Spirit Day May 22</p>
  <p>No School June 3 &amp; 4</p>
  <p>{"json":"blob"}</p>
  <p>Field Trip permission slip due Friday</p>
`;

// ── parseNewsletterItems ──────────────────────────────────────────────────────

describe('parseNewsletterItems(text)', () => {
  it('returns [] for null input', () => {
    assert.deepEqual(parseNewsletterItems(null), []);
  });

  it('returns [] for empty string', () => {
    assert.deepEqual(parseNewsletterItems(''), []);
  });

  it('strips <script> and <style> blocks before processing', () => {
    const results = parseNewsletterItems(SAMPLE_HTML);
    // Script and style content must not appear in any result line
    for (const line of results) {
      assert.ok(!line.includes('var x'), `script content leaked into: "${line}"`);
      assert.ok(!line.includes('color:red'), `style content leaked into: "${line}"`);
    }
  });

  it('strips HTML tags from remaining content', () => {
    const results = parseNewsletterItems(SAMPLE_HTML);
    for (const line of results) {
      assert.ok(!/<[^>]+>/.test(line), `HTML tag found in: "${line}"`);
    }
  });

  it('decodes &amp; &nbsp; &lt; &gt; &#39;', () => {
    const input = '<p>No School June 3 &amp; 4</p>';
    const results = parseNewsletterItems(input);
    // The decoded line should contain '&' not '&amp;'
    const found = results.find(l => l.includes('No School'));
    assert.ok(found, 'expected a "No School" line');
    assert.ok(found.includes('&'), `expected decoded '&' in: "${found}"`);
    assert.ok(!found.includes('&amp;'), `expected no '&amp;' in: "${found}"`);
  });

  it("returns a line containing 'Spirit Day' when input contains '<p>Spirit Day May 22</p>'", () => {
    const results = parseNewsletterItems(SAMPLE_HTML);
    const found = results.find(l => l.includes('Spirit Day'));
    assert.ok(found, `expected a Spirit Day line, got: ${JSON.stringify(results)}`);
  });

  it("does NOT return lines starting with '{' or '['", () => {
    const results = parseNewsletterItems(SAMPLE_HTML);
    for (const line of results) {
      assert.ok(!line.startsWith('{'), `line starts with '{': "${line}"`);
      assert.ok(!line.startsWith('['), `line starts with '[': "${line}"`);
    }
  });

  it('deduplicates identical extracted lines', () => {
    // Two identical spirit-day lines in input → only one in output
    const input = '<p>Spirit Day May 22</p>\n<p>Spirit Day May 22</p>';
    const results = parseNewsletterItems(input);
    const spiritLines = results.filter(l => l.includes('Spirit Day'));
    assert.equal(spiritLines.length, 1);
  });

  it('caps results at 8 items even when more match', () => {
    // 10 distinct lines that all match 'no school'
    const lines = Array.from({ length: 10 }, (_, i) =>
      `<p>No School Day ${i + 1}</p>`
    ).join('\n');
    const results = parseNewsletterItems(lines);
    assert.ok(results.length <= 8, `expected ≤ 8 items, got ${results.length}`);
  });
});