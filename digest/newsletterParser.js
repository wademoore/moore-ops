/**
 * digest/newsletterParser.js
 * Moore Family Operations Assistant
 *
 * Parses Smore newsletter HTML/text fetched from Google Drive into
 * actionable school-item strings.
 * Extracted from digest/builder.js (section 5).
 */

export function parseNewsletterItems(newsletterText) {
  if (!newsletterText) return [];

  // The newsletter file from Drive is raw Smore HTML/JS — strip all tags and
  // script content before trying to extract readable lines.
  let text = newsletterText;

  // Remove <script>...</script> blocks first (Smore embeds large JS payloads)
  text = text.replace(/<script[\s\S]*?<\/script>/gi, ' ');

  // Remove <style>...</style> blocks
  text = text.replace(/<style[\s\S]*?<\/style>/gi, ' ');

  // Strip remaining HTML tags
  text = text.replace(/<[^>]+>/g, ' ');

  // Decode common HTML entities
  text = text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\u003C/g, '<')
    .replace(/\u003E/g, '>')
    .replace(/\\u[0-9a-f]{4}/gi, ' ');  // remove remaining unicode escapes

  // Drop lines that look like JSON or JavaScript (Smore data blobs)
  const lines = text.split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 10)          // skip very short fragments
    .filter(l => !l.startsWith('{'))      // skip JSON objects
    .filter(l => !l.startsWith('['))      // skip JSON arrays
    .filter(l => !l.startsWith('data:'))  // skip data URIs
    .filter(l => !/^[a-z]+:[{\["]/.test(l)); // skip key:value JSON

  // Heuristic: pull lines that look like actionable school items.
  const actionPatterns = [
    /spirit\s+day/i,
    /early\s+dismiss/i,
    /field\s+trip/i,
    /permission\s+slip/i,
    /volunteer/i,
    /pta/i,
    /picture\s+day/i,
    /maguire|watkins/i,
    /\b(mon|tue|wed|thu|fri|sat|sun)\b.*\b(may|jun|jul|aug|sep|oct|nov|dec)\b/i,
    /\b5\/\d+\b.*\b(monday|tuesday|wednesday|thursday|friday)\b/i,
    /centers\s+day/i,
    /honor\s+roll/i,
    /no\s+school/i,
    /redistrict/i,
    /sol\s+test/i,
    /family\s+life/i,
  ];

  const items = [];
  for (const line of lines) {
    // Skip lines that are still clearly code/data
    if (line.includes('svelte-') || line.includes('u003C') || line.length > 300) continue;
    if (actionPatterns.some(p => p.test(line))) {
      // Clean up whitespace before storing
      items.push(line.replace(/\s+/g, ' ').trim());
    }
  }

  // Deduplicate and cap at 8 items
  return [...new Set(items)].slice(0, 8);
}   