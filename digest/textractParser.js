/**
 * digest/textractParser.js
 * Moore Family Operations Assistant
 *
 * Pure function for reconstructing plain text from AWS Textract DetectDocumentText output.
 * Accepts the Blocks array from a DetectDocumentTextCommand response and returns a
 * formatted string suitable for parseMeetText.
 */

// ── reconstructTextFromTextract ───────────────────────────────────────────────
// Accepts the Blocks array from a Textract DetectDocumentTextCommand response.
// Returns a single string with all pages joined by \n.
//
// Column reconstruction rules (per row):
//   1 block  → emit block.Text as-is
//   2 blocks → order by Left; if right.Left >= 0.45: pad left to 80 chars + right;
//              if both Left < 0.45: join with single space

export function reconstructTextFromTextract(blocks) {
  const lineBlocks = blocks.filter(b => b.BlockType === 'LINE');

  const pages = new Map();
  for (const block of lineBlocks) {
    const page = block.Page ?? 1;
    if (!pages.has(page)) pages.set(page, []);
    pages.get(page).push(block);
  }

  const pageStrings = [];

  for (const [, pageBlocks] of [...pages.entries()].sort((a, b) => a[0] - b[0])) {
    pageBlocks.sort((a, b) => a.Geometry.BoundingBox.Top - b.Geometry.BoundingBox.Top);

    // Group into logical rows: blocks within 0.02 Top of the first block in the row
    const rows = [];
    for (const block of pageBlocks) {
      const top = block.Geometry.BoundingBox.Top;
      const lastRow = rows[rows.length - 1];
      if (lastRow && Math.abs(top - lastRow[0].Geometry.BoundingBox.Top) <= 0.02) {
        lastRow.push(block);
      } else {
        rows.push([block]);
      }
    }

    const lines = [];
    for (const row of rows) {
      if (row.length === 1) {
        lines.push(row[0].Text);
      } else {
        row.sort((a, b) => a.Geometry.BoundingBox.Left - b.Geometry.BoundingBox.Left);
        if (row.length === 2 && row[1].Geometry.BoundingBox.Left >= 0.45) {
          lines.push(row[0].Text.padEnd(80) + row[1].Text);
        } else if (row.length === 2) {
          lines.push(row[0].Text + ' ' + row[1].Text);
        } else {
          lines.push(row.map(b => b.Text).join(' '));
        }
      }
    }

    pageStrings.push(lines.join('\n'));
  }

  return pageStrings.join('\n');
}
