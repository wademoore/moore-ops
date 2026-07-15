# The Wellington Wave — Architecture Decision Record

This log records decisions that fundamentally shape how the newsroom operates. It changes infrequently. Style choices, palette decisions, and content preferences belong in the numbered docs, not here.

Entries are added when a load-bearing decision is made and do not change unless the decision is superseded or deprecated.

---

# ADR-001: GitHub as Source of Truth for All Editorial Artifacts

**Date:** 2026-07-15
**Status:** Accepted

## Decision
All editorial documentation, handoff artifacts, and working files are version-controlled markdown committed to this repository. No editorial artifact is authoritative until it exists in GitHub.

## Context
The newsroom produces structured findings (Editorial Meeting artifacts, chart data files, validation reports) that must be auditable after publication. If a published claim is challenged, the derivation must be traceable to a specific committed file at a specific commit. A shared document (Google Doc, Notion page, email thread) cannot provide this — it can be edited after the fact without a record.

## Alternatives Considered
Google Drive was the prior home for sports data files in this project (the Lambda pipeline read from Drive before the June 2026 migration to local JSON). Using Drive for editorial artifacts would have continued a familiar pattern, but it lacks immutable commit history and cannot enforce the "artifact committed before handoff" rule that makes findings auditable.

## Consequences
- Every Editorial Meeting artifact must be committed to `docs/editorial/meetings/` before it is passed to ChatGPT.
- The Publisher cannot approve an artifact that has not been committed — approval and distribution always reference a commit, not a draft.
- Future editors can audit any published claim back to the committed artifact that supported it.

---

# ADR-002: Claude Code as Newsroom, ChatGPT as Editor-in-Chief

**Date:** 2026-07-15
**Status:** Accepted

## Decision
The editorial process is divided into two non-overlapping roles by capability: Claude Code (this repo) performs data validation, finding analysis, and structured artifact production; ChatGPT performs narrative writing, layout, and final publication text. Neither role performs the other's function.

## Context
A single tool doing both jobs — querying data and writing prose — would make it impossible to audit where data ends and editorial judgment begins. Mixing the roles also creates a practical risk: a language model that both derives findings and writes prose about them has no external check on whether the prose accurately reflects the findings. Separating the roles enforces a visible seam where Publisher review is required.

The confidence-level system (HIGH / MEDIUM / LOW) and the Editorial Meeting artifact format exist specifically to make the seam auditable: Claude Code states findings at a labeled confidence level, ChatGPT selects framing language appropriate to that level, and the Publisher verifies the mapping before distribution.

## Alternatives Considered
Giving Claude Code full editorial authority (including prose) was implicitly available — Claude Code is capable of generating prose. It was rejected because it removes the Publisher's meaningful review step: if Claude Code produces ready-to-publish text from data it also analyzed, the Publisher is only proofreading, not verifying.

Giving ChatGPT data-access authority (letting it query JSON files directly) was considered and rejected because it would require ChatGPT to understand schema caveats (BOM risk, DQ row handling, `time` vs. `seconds` field names, `course` semantics) that are Newsroom expertise, not editorial expertise.

## Consequences
- Claude Code never writes sentences intended for publication. Any sentence in an Editorial Meeting artifact that reads as publishable prose is a defect.
- ChatGPT never queries raw data files. Data questions route back to Claude Code via the Publisher.
- The artifact is the only interface. What is in the artifact is Claude Code's contribution; what is written from it is ChatGPT's contribution.

---

# ADR-003: The Editorial Meeting Artifact as the Interface Between Roles

**Date:** 2026-07-15
**Status:** Accepted

## Decision
The structured Editorial Meeting artifact (defined in `07-editorial-meeting-spec.md`) is the sole interface between the Newsroom (Claude Code) and the Editor-in-chief (ChatGPT). There is no direct communication channel between the two systems. All information ChatGPT receives about a given edition flows through this artifact, reviewed and approved by the Publisher.

## Context
Without a defined interface, the handoff between data analysis and prose writing is ad hoc — findings get communicated in emails, Slack messages, or conversational prompts, making them unversioned and unauditable. The Editorial Meeting artifact gives the handoff a schema: fixed sections, labeled confidence levels, explicit warnings, and a methodology notes block. This mirrors the pattern already established by the `waves-champs-qualifier` and `waves-team-record-check` skills, which produce structured, labeled output (Block 1 / Block 2 / Block 3; proximity flags; verify-before-posting warnings) rather than free-form prose.

## Alternatives Considered
No serious alternative was considered at the time of this decision. The structured artifact approach was established from the outset as the natural extension of the existing skills' output patterns.

## Consequences
- Every edition of every publication type (Weekly, Midseason, Championship, Annual) must be preceded by a committed Editorial Meeting artifact.
- The Publisher's approval of the artifact is the explicit gate between Newsroom work and editorial work.
- ChatGPT does not receive supplemental data outside the artifact. If ChatGPT identifies a missing data point, it routes the question back through the Publisher.

---

# ADR-004: Editorial Documentation Lives in docs/editorial/, Not in a Separate Repository

**Date:** 2026-07-15
**Status:** Accepted

## Decision
All editorial documentation is maintained in `docs/editorial/` within the moore-ops repository, co-located with the data layer it documents. It is not maintained in a separate repository or external tool.

## Context
The editorial documentation is tightly coupled to the data files in `data/`, the skills in `.claude/skills/`, and the schema conventions documented in CLAUDE.md. Keeping editorial docs in the same repo means that a schema change (e.g., a new field in `league-results.json`, a BOM fix, a DQ row convention update) can be accompanied by a simultaneous update to `05-editorial-evidence-guide.md` in the same commit, keeping technical and editorial knowledge synchronized.

## Alternatives Considered
A separate repository was considered. It would have provided cleaner separation between the Lambda application and the editorial project, and would make access control simpler if the editorial team grows. It was rejected because the coupling between editorial documentation and data-layer schema is too tight — schema changes that affect editorial analysis would require coordinated cross-repo commits, which adds friction and creates drift risk. The `docs/` convention also keeps this documentation well inside GitHub's familiar file-browsing interface, available to anyone with repo access.

## Consequences
- Editorial docs do not belong in `data/`, `.claude/skills/`, or the Lambda application codebase. They live exclusively under `docs/editorial/`.
- Schema changes to data files should include a review of whether `05-editorial-evidence-guide.md` needs updating.
- If the editorial team ever grows beyond the Publisher + two AI roles, access control may require revisiting this decision.

---

# ADR-005: All Published Statistics Must Trace to Reproducible Analyses

**Date:** 2026-07-15
**Status:** Accepted

## Decision
Every statistic, ranking, or record claim published in The Wellington Wave must be derivable from a committed data file and a reproducible analysis process. No statistic is published without an auditable derivation path. Confidence levels (HIGH / MEDIUM / LOW) are applied to every finding in the Editorial Meeting artifact, and the framing of published claims must match the assigned confidence level.

## Context
The `waves-champs-qualifier` and `waves-team-record-check` skills established the foundational pattern for this project: findings are not asserted — they are verified, labeled with a confidence level, and flagged with warnings when verification is incomplete. The "verify before posting" instruction in both skills reflects a hard-won lesson: confident-looking output from data analysis can still be wrong (see CLAUDE.md's account of the three `hasAnyPriorQual` bugs, each of which produced plausible but incorrect results). Publishing a wrong statistic in a community publication — even a minor one — damages trust in ways that are difficult to repair with a correction.

This decision extends that pattern from the skills layer to the publication layer. The confidence-level system in the Editorial Meeting artifact is not optional metadata — it is the mechanism that prevents medium- or low-confidence findings from being stated as facts in print.

## Alternatives Considered
Publishing findings without confidence labels (treating all data-derived claims as equally authoritative) was implicitly available. It was rejected because not all findings are equally authoritative: `overallPlace` is frequently null, some historical records have null `meetDate`, `vpsu-rankings.json` is a point-in-time snapshot with a known `asOf` date. Flattening these differences would produce claims that read as more certain than the data supports.

## Consequences
- Claude Code applies a confidence level to every finding in every Editorial Meeting artifact. A finding with no confidence label is a defect in the artifact.
- ChatGPT's prose framing must match the confidence level: HIGH → state as fact; MEDIUM → "data shows" / "based on recorded results"; LOW → explicit caveat.
- The Publisher's review of the artifact includes verifying that HIGH-confidence claims are actually grounded in unambiguous data, not promoted from MEDIUM.
