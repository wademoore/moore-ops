/**
 * test/textractParser.test.js
 * Moore Family Operations Assistant
 *
 * Unit tests for digest/textractParser.js:
 *   reconstructTextFromTextract(blocks) — Textract Blocks → formatted string
 *
 * reconstructTextFromTextract is a pure function — no AWS calls are made.
 * All fixtures are hardcoded Textract-shaped block objects.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { reconstructTextFromTextract } from '../digest/textractParser.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function line(text, top, left, page = 1) {
  return {
    BlockType: 'LINE',
    Text: text,
    Page: page,
    Geometry: { BoundingBox: { Top: top, Left: left, Width: 0.3, Height: 0.02 } },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('reconstructTextFromTextract', () => {
  it('1. single LINE block returns its text', () => {
    const result = reconstructTextFromTextract([line('Hello world', 0.10, 0.05)]);
    assert.equal(result, 'Hello world');
  });

  it('2. two blocks same row, right Left >= 0.45 — left padded to 80 chars then right', () => {
    const blocks = [
      line('Left text', 0.10, 0.05),
      line('Right text', 0.11, 0.50),  // Top diff = 0.01 <= 0.02, Left = 0.50 >= 0.45
    ];
    const result = reconstructTextFromTextract(blocks);
    assert.equal(result, 'Left text'.padEnd(80) + 'Right text');
  });

  it('3. two blocks same row, both Left < 0.45 — joined with single space', () => {
    const blocks = [
      line('First', 0.10, 0.05),
      line('Second', 0.11, 0.30),  // Top diff = 0.01 <= 0.02, both Left < 0.45
    ];
    const result = reconstructTextFromTextract(blocks);
    assert.equal(result, 'First Second');
  });

  it('4. two blocks on different rows (Top diff > 0.02) — emitted as separate lines', () => {
    const blocks = [
      line('Line one', 0.10, 0.05),
      line('Line two', 0.15, 0.05),  // Top diff = 0.05 > 0.02
    ];
    const result = reconstructTextFromTextract(blocks);
    assert.equal(result, 'Line one\nLine two');
  });

  it('5. multiple pages — processed independently, joined with newline', () => {
    const blocks = [
      line('Page 1 content', 0.10, 0.05, 1),
      line('Page 2 content', 0.10, 0.05, 2),
    ];
    const result = reconstructTextFromTextract(blocks);
    assert.equal(result, 'Page 1 content\nPage 2 content');
  });

  it('6. non-LINE blocks (PAGE, WORD) are ignored', () => {
    const blocks = [
      { BlockType: 'PAGE', Page: 1 },
      line('Visible line', 0.10, 0.05),
      { BlockType: 'WORD', Text: 'ignored', Page: 1,
        Geometry: { BoundingBox: { Top: 0.10, Left: 0.05, Width: 0.1, Height: 0.02 } } },
    ];
    const result = reconstructTextFromTextract(blocks);
    assert.equal(result, 'Visible line');
  });
});
