# The Wellington Wave — Editorial Documentation Index

This directory contains the operating manual for The Wellington Wave, a publication covering the Wellington Waves swim team. It is maintained in the moore-ops repository and is version-controlled in GitHub.

This documentation is for the newsroom and editorial team only. It is not the publication itself.

---

## Purpose

The Wellington Wave is built on the moore-ops data layer (`league-results.json`, `relay-results.json`, `swim-results.json`, `pb-records.json`, `waves-team-records.json`, `vpsu-rankings.json`, `waves-season.json`). This documentation defines how that data is used editorially: what it can prove, how findings are surfaced and communicated, what each publication type contains, and where the boundary lies between data work (Claude Code) and editorial work (ChatGPT).

---

## Document Index

### Living Documents — Read First, Updated Continuously

These are not reference docs. They record durable beliefs, load-bearing architectural decisions, and a chronological working journal. They are updated as the project evolves, not rewritten.

| Document | Description |
|----------|-------------|
| [PRINCIPLES.md](PRINCIPLES.md) | Six editorial beliefs, in priority order, as a terse testable checklist. Settles "does this belong" arguments. Read before making any editorial judgment call. |
| [DECISIONS.md](DECISIONS.md) | Architecture Decision Record. Records the load-bearing structural decisions (role split, GitHub as source of truth, Editorial Meeting as interface, etc.) and the reasoning behind them. Near-sacred — changes infrequently. |
| [PROJECT_LOG.md](PROJECT_LOG.md) | Chronological working journal. Records what was done each session and why. Append-only. Not a reference document — read it for project history, not operational guidance. |

### Foundational Documents

Read these after the living documents. They define the operational principles that govern every numbered doc.

| Document | Description |
|----------|-------------|
| [01-editorial-charter.md](01-editorial-charter.md) | Mission, audience, editorial philosophy, ethics, tone, and evidence standards. Points to PRINCIPLES.md for the canonical principles checklist. |
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

1. [PRINCIPLES.md](PRINCIPLES.md) — six beliefs that settle argument before any process question arises
2. [DECISIONS.md](DECISIONS.md) — why the architecture is the way it is
3. [01-editorial-charter.md](01-editorial-charter.md) — mission, ethics, tone, evidence standards
4. [03-editorial-workflow.md](03-editorial-workflow.md) — how the process works and your role in it
5. [07-editorial-meeting-spec.md](07-editorial-meeting-spec.md) — what the handoff artifact looks like
6. [05-editorial-evidence-guide.md](05-editorial-evidence-guide.md) — what the data can and cannot support
7. [02-publication-blueprint.md](02-publication-blueprint.md) — what each edition contains
8. Remaining documents as needed for your specific role

### For Claude Code (Newsroom) producing an Editorial Meeting artifact

1. [PRINCIPLES.md](PRINCIPLES.md) — confirm the finding serves the publication's values
2. [07-editorial-meeting-spec.md](07-editorial-meeting-spec.md) — structure of the artifact
3. [05-editorial-evidence-guide.md](05-editorial-evidence-guide.md) — confidence levels and caveats
4. [06-story-discovery-playbook.md](06-story-discovery-playbook.md) — what categories to look for
5. [12-claude-deliverables.md](12-claude-deliverables.md) — boundary check before finalizing

### For ChatGPT (Editor-in-chief) writing a publication

1. [PRINCIPLES.md](PRINCIPLES.md) — the six tests to apply to every editorial judgment
2. [01-editorial-charter.md](01-editorial-charter.md) — tone, ethics, what to celebrate and avoid
3. [04-editorial-style-guide.md](04-editorial-style-guide.md) — naming, headlines, stat boxes
4. [08-art-direction.md](08-art-direction.md) — visual conventions and photo policy
5. The approved Editorial Meeting artifact for the current edition

---

## Open Decisions

The following decisions have been flagged as open in this documentation and require Publisher resolution:

| Decision | Where flagged |
|----------|--------------|
| Official Wellington Wave color palette (current docs use family-dashboard placeholder colors) | [04-editorial-style-guide.md](04-editorial-style-guide.md), [08-art-direction.md](08-art-direction.md) |
| Whether historical `vpsu-rankings.json` snapshots are retained for year-over-year comparison | [05-editorial-evidence-guide.md](05-editorial-evidence-guide.md) |
| Exact field name for opponent in `waves-season.json` meets array (confirm before publishing meet scores) | [05-editorial-evidence-guide.md](05-editorial-evidence-guide.md) |
| Season window dates for years other than 2026 (update [09-production-calendar.md](09-production-calendar.md) each season) | [09-production-calendar.md](09-production-calendar.md) |
