# The Wellington Wave — Editorial Documentation Index

This directory contains the operating manual for The Wellington Wave, a publication covering the Wellington Waves swim team. It is maintained in the moore-ops repository and is version-controlled in GitHub.

This documentation is for the newsroom and editorial team only. It is not the publication itself.

---

## Purpose

The Wellington Wave is built on the moore-ops data layer (`league-results.json`, `relay-results.json`, `swim-results.json`, `pb-records.json`, `waves-team-records.json`, `vpsu-rankings.json`, `waves-season.json`). This documentation defines how that data is used editorially: what it can prove, how findings are surfaced and communicated, what each publication type contains, and where the boundary lies between data work (Claude Code) and editorial work (ChatGPT).

---

## Document Index

### Foundational Documents

Read these first. They define the principles that govern every other document.

| Document | Description |
|----------|-------------|
| [01-editorial-charter.md](01-editorial-charter.md) | Mission, audience, editorial philosophy, ethics, tone, and evidence standards. The governing document for the publication. |
| [03-editorial-workflow.md](03-editorial-workflow.md) | Full workflow from data entry to distribution. Defines role responsibilities and the critical dependency (data first, editorial second). |
| [07-editorial-meeting-spec.md](07-editorial-meeting-spec.md) | The contract between Claude Code and ChatGPT. Defines the structure of the Editorial Meeting artifact — the primary handoff document. Read before producing any handoff. |
| [12-claude-deliverables.md](12-claude-deliverables.md) | Exactly what Claude Code produces and the explicit boundary between Newsroom and Editor-in-chief work. |

### Operational Documents

Reference these while doing active editorial work.

| Document | Description |
|----------|-------------|
| [05-editorial-evidence-guide.md](05-editorial-evidence-guide.md) | What each dataset can and cannot prove. Known caveats, confidence levels, and cross-file analysis patterns. Consult before making any data-backed claim. |
| [06-story-discovery-playbook.md](06-story-discovery-playbook.md) | Repeatable story categories with discovery method and supporting datasets. Use this to structure Newsroom analysis after each meet. |
| [09-production-calendar.md](09-production-calendar.md) | Weekly, midseason, championship, and annual production schedules with milestones and owners. |
| [10-story-backlog.md](10-story-backlog.md) | Active and archived story candidates. Maintained by the Newsroom; reviewed by Publisher each week. |

### Reference Documents

Consult these when designing, writing, or planning.

| Document | Description |
|----------|-------------|
| [02-publication-blueprint.md](02-publication-blueprint.md) | Every publication type: purpose, length, recurring sections, required graphics, timing. |
| [04-editorial-style-guide.md](04-editorial-style-guide.md) | Headline styles, naming conventions, stat box formats, typography, and color palette (including open decisions). |
| [08-art-direction.md](08-art-direction.md) | Visual identity, chart philosophy, stat card templates, photo policy (minors), and infographic principles. |
| [11-annual-blueprint.md](11-annual-blueprint.md) | Working table of contents for the Annual edition. Living document — update at the start of Annual production each year. |

---

## Recommended Reading Order

### For a new contributor joining the editorial team

1. [01-editorial-charter.md](01-editorial-charter.md) — understand the mission and ethics first
2. [03-editorial-workflow.md](03-editorial-workflow.md) — understand how the process works and your role in it
3. [07-editorial-meeting-spec.md](07-editorial-meeting-spec.md) — understand what the handoff artifact looks like
4. [05-editorial-evidence-guide.md](05-editorial-evidence-guide.md) — understand what the data can and cannot support
5. [02-publication-blueprint.md](02-publication-blueprint.md) — understand what each edition contains
6. Remaining documents as needed for your specific role

### For Claude Code (Newsroom) producing an Editorial Meeting artifact

1. [07-editorial-meeting-spec.md](07-editorial-meeting-spec.md) — structure of the artifact
2. [05-editorial-evidence-guide.md](05-editorial-evidence-guide.md) — confidence levels and caveats
3. [06-story-discovery-playbook.md](06-story-discovery-playbook.md) — what categories to look for
4. [12-claude-deliverables.md](12-claude-deliverables.md) — boundary check before finalizing

### For ChatGPT (Editor-in-chief) writing a publication

1. [01-editorial-charter.md](01-editorial-charter.md) — tone, ethics, what to celebrate and avoid
2. [04-editorial-style-guide.md](04-editorial-style-guide.md) — naming, headlines, stat boxes
3. [08-art-direction.md](08-art-direction.md) — visual conventions and photo policy
4. The approved Editorial Meeting artifact for the current edition

---

## Open Decisions

The following decisions have been flagged as open in this documentation and require Publisher resolution:

| Decision | Where flagged |
|----------|--------------|
| Official Wellington Wave color palette (current docs use family-dashboard placeholder colors) | [04-editorial-style-guide.md](04-editorial-style-guide.md), [08-art-direction.md](08-art-direction.md) |
| Whether historical `vpsu-rankings.json` snapshots are retained for year-over-year comparison | [05-editorial-evidence-guide.md](05-editorial-evidence-guide.md) |
| Exact field name for opponent in `waves-season.json` meets array (confirm before publishing meet scores) | [05-editorial-evidence-guide.md](05-editorial-evidence-guide.md) |
| Season window dates for years other than 2026 (update [09-production-calendar.md](09-production-calendar.md) each season) | [09-production-calendar.md](09-production-calendar.md) |
