function normalizeDashboardText(value) {
  const cleaned = String(value || '')
    .replace(/^[\p{Extended_Pictographic}\p{Emoji_Presentation}\uFE0F\u200D\s\u2022\u25CF]+/u, '')
    .trim();

  const bothKids = cleaned
    .replace(/^Myles\s*(?:&|and|\+)\s*Ophelia\s*:\s*/i, 'Both kids — ')
    .replace(/^Both kids\s*[—:-]\s*4-H Day Camp(?:\s*\([^)]*\))?$/i, 'Both kids — 4-H Camp');

  const sharks = bothKids.match(/^Myles\s*:\s*Sharks Practice\s*[-—]\s*Warhill\s+(Turf|Grass)\s+(\d+)$/i);
  if (sharks) {
    const surface = sharks[1][0].toUpperCase() + sharks[1].slice(1).toLowerCase();
    return `Myles — Sharks · ${surface}\u00a0${sharks[2]}`;
  }

  const ownerMatch = bothKids.match(/^([RrWw])\s+(.+)$/);
  if (!ownerMatch) return bothKids;
  const owner = ownerMatch[1].toLowerCase() === 'r' ? 'Robyn' : 'Wade';
  return `${owner} · ${ownerMatch[2]}`;
}

export { normalizeDashboardText };
