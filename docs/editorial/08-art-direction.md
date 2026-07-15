# The Wellington Wave — Art Direction

This document defines the visual identity and graphic standards for The Wellington Wave. Implementation decisions belong to the Publisher and ChatGPT. This document records the principles so they are decided once and applied consistently.

---

## Magazine Inspiration

The Wellington Wave should read as a serious community sports publication — not a parent newsletter, not a school flyer. Visual references to draw from:

- Regional sports magazines (clean layouts, strong hierarchy, generous whitespace)
- Sports Illustrated's data-driven sidebars (stat cards, pull quotes grounded in numbers)
- The Athletic's digital edition (editorial confidence, minimal ornamentation)

The visual tone should convey: *we take this team seriously, and the data backs it up.*

---

## Graphic Language

**Principles:**
- Data graphics carry editorial weight. Every chart must make a point, not just display numbers.
- Simplicity over decoration. Remove any element that does not serve the reader's understanding.
- Consistency within an edition. All charts in a single publication use the same type scale, color system, and label style.
- Accessibility. Color alone must not be the only differentiator in any chart. Use labels, patterns, or annotations to support colorblind readers.

**Chart types by use case:**

| Use case | Preferred chart type |
|----------|---------------------|
| Season record progression | Horizontal bar or table |
| Individual time over meets | Line chart (time on Y, date on X) |
| Qualifier count by age group | Grouped or stacked bar |
| Team record: broken vs. standing | Annotated table or horizontal bullet chart |
| VPSU ranking position | Ranked table with conditional emphasis |
| Meet score | Single-stat card or split scoreboard layout |

---

## Recurring Page Elements

**Stat card:** A small boxed element containing one key number with a label and optional context line. Used for meet scores, qualifier counts, records broken. Consistent styling across all editions.

Example:
```
┌─────────────────────┐
│  3                  │
│  New qualifiers     │
│  this week          │
└─────────────────────┘
```

**Records broken callout:** A visually distinct element (border or background) that lists team records broken in the meet or season. Should include swimmer name, event, new time, prior record holder, and year. Used in Weekly Edition and Championship Edition.

**Near-miss flag:** A lighter visual treatment (e.g., dashed border) that marks notable proximity to a qualifying standard or team record without asserting the threshold was crossed. Should not read as a pressure statement — it is informational.

**Age-group divider:** A consistent visual separator for content organized by age group, enabling readers to navigate to their swimmer's section.

---

## Stat Card Templates

Three standard stat card sizes:

1. **Single-stat card** — one number, one label, optional context. Used for meet score, qualifier count, records broken.
2. **Comparison card** — two numbers side by side (e.g., this week vs. prior week). Used for qualifier tracker, win-loss.
3. **List card** — a short bulleted list in a bordered box. Used for records broken, new qualifiers, relay highlights.

Specific dimensions and font sizes are a Publisher decision. The template structures are defined here so ChatGPT applies them consistently.

---

## Timeline Concepts

**Season qualifier timeline:** A horizontal timeline showing the full season window (e.g., May 28 – Jul 27) with new qualifiers marked by week. Suitable for Midseason Report and Annual.

**Records history timeline:** A vertical or horizontal timeline per event showing the progression of the team record over years. Suitable for Annual use only — requires sufficient historical data in `waves-team-records.json`.

---

## Color Direction

**Open decision:** The Wellington Wave does not yet have an official color palette. The family-dashboard colors (`#E24B4A` Myles red, `#7F77DD` Ophelia purple) are explicitly not the publication palette — see [04-editorial-style-guide.md](04-editorial-style-guide.md#color-palette).

**Recommended process for Publisher:**
1. Confirm whether the Wellington Waves swim team has official colors (check team materials, SwimTopia, uniforms).
2. Select a primary team color and one supporting neutral.
3. Define a three-color palette: primary, supporting neutral, accent (used sparingly for callouts and highlights).
4. Update [04-editorial-style-guide.md](04-editorial-style-guide.md) with the chosen palette.

Until the palette is confirmed, use grayscale for all chart mockups and prototypes. Do not use the dashboard swimmer colors in publication graphics.

---

## Photo Policy

**Coverage scope:** The Wellington Wave may include photography from meets and team events where photos are already in the public domain via SwimTopia, meet programs, or team-authorized sources. The publication does not commission or solicit photography.

**Minors — explicit policy:**

Every swimmer is a minor. The following rules apply to all photo use:

1. **No photo of a swimmer may be used without explicit consent from their parent or guardian.** General community-event consent (being present at a public meet) is not sufficient for named publication use.
2. **Photo captions must not include identifying details beyond what already appears in official meet programs** (first name, last name, age group, team). Home address, school, or family context is not included in captions.
3. **Photos of younger age groups (6 & Under, 8 & Under)** are subject to heightened care. Publisher reviews all such photos before inclusion regardless of other consent status.
4. **Photos of Moore family swimmers (Myles and Ophelia)** are subject to the same rules as all other swimmers. The fact that the publisher built this system does not imply standing consent for publication-level photo use — Publisher obtains explicit consent as a separate step.
5. **No photo may be used that primarily identifies a swimmer by physical characteristics** unrelated to their athletic performance (e.g., a photo emphasizing a disability, injury, or emotional distress).

When in doubt, omit the photo. A strong data graphic is a better publication element than a questionable photograph.

---

## Infographic Principles

Infographics in The Wellington Wave are data-driven, not decorative. Every infographic must:

1. Have a clear headline that states the point the graphic makes
2. Cite the data source in small type (e.g., "Source: VPSU meet results, 2026 season")
3. Include a season year in any graphic that could be reused in future editions
4. Be reproducible from the data layer — no hand-drawn or estimated values

**Examples of appropriate infographics:**
- "Wellington Waves Championship Qualifiers by Week — 2026 Season"
- "Team Records Broken: 2026 vs. All-Time"
- "Age-Group Qualifier Count: 2024–2026"

**Examples of inappropriate infographics:**
- Stylized swimmer silhouettes with no data
- "Top 5 Most Exciting Swims" (subjective ranking without an evidence basis)
- Any graphic that names a non-qualifying swimmer as "almost there"
