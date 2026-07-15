# The Wellington Wave — Editorial Charter

## Mission

The Wellington Wave is a community publication covering the Wellington Waves swim team across a full competitive season. Its purpose is to recognize team achievement, document individual progress, and give the broader Wellington Waves community a coherent record of each season as it unfolds.

This publication is built on a structured data layer maintained in the moore-ops repository. All findings must be grounded in that data — no invented statistics, no reconstructed results, no inferred narratives without evidentiary support.

## Audience

- Wellington Waves swimmers, families, and coaching staff
- VPSU league community (neighboring teams, league organizers)
- Long-term: alumni and historical record

## Editorial Philosophy

The publication celebrates what actually happened. It does not inflate minor results into major ones, does not pressure swimmers to perform, and does not single out individuals for negative attention. Coverage should leave every reader — including the swimmers themselves — feeling respected and accurately represented.

The newsroom (Claude Code) surfaces findings. The editor-in-chief (ChatGPT) shapes them into prose. Neither role invents what the data does not support.

## Core Principles

1. **Evidence-first.** Every published claim must trace to a specific data source. Confidence levels (see §Evidence Standards below) determine how claims are framed.
2. **Accuracy over speed.** Data validation precedes editorial work. See [03-editorial-workflow.md](03-editorial-workflow.md) for the dependency chain.
3. **No invented context.** If the data doesn't say it, the publication doesn't say it. Open questions are flagged, not filled.
4. **Proportional coverage.** Age groups, strokes, and relay contributions all receive attention. Coverage is not weighted toward the fastest swimmers or the highest-profile events.
5. **Version-controlled truth.** All editorial handoff artifacts are committed to GitHub. The repo is the source of record.

## Evidence Standards

Claims published in The Wellington Wave are rated at one of three confidence levels. These levels align with the dataset confidence ratings in [05-editorial-evidence-guide.md](05-editorial-evidence-guide.md).

| Level | Meaning | Framing guidance |
|-------|---------|-----------------|
| **High** | Directly in the data, unambiguous | State as fact |
| **Medium** | Derivable from the data, but dependent on completeness or cross-file matching | Frame as "data shows" or "based on recorded results" |
| **Low** | Inferred, partial data, or historical records with known gaps | Frame with explicit caveat ("records going back to…", "among meets recorded…") |

The newsroom labels every finding with its confidence level in the editorial handoff artifact. ChatGPT selects framing accordingly; the Publisher approves before distribution.

## Ethics Around Youth Athletes

Every swimmer covered in The Wellington Wave is a minor. The following principles are non-negotiable and apply to all coverage decisions.

**Consent and comfort.** Coverage of individual swimmers assumes general community consent for public meet results (times, placements, relay compositions). It does not extend to photographs, personal narratives, or contextual details beyond what appears in the official data. If a family has expressed a preference about their swimmer's coverage, that preference overrides editorial defaults — the Publisher manages this list.

**Avoiding pressure narratives.** Do not frame individual improvement or qualification as obligation or expectation. "Achieved her qualifying standard" is appropriate. "Finally broke through" or "still chasing a qualifier" are not. The publication does not editorialize about what a swimmer should be doing or how close they are to a threshold in a way that could be read as pressure.

**Proportional age-group coverage.** Younger swimmers (6&Under, 8&Under) compete in a smaller set of events and are newer to the sport. Coverage of these age groups should celebrate participation and first-time achievements without creating performance benchmarks in print. Feature-depth coverage should tilt toward older age groups where career context is meaningful; younger groups warrant recognition but not analytical scrutiny.

**Family members of the publisher.** Myles and Ophelia Moore are members of the Wellington Waves roster and are covered as roster swimmers — no more prominently and no less prominently than their results warrant. Their data is richer than most (see `pb-records.json`, `swim-results.json`, `vpsu-rankings.json`) because Wade built this system. That data richness must not translate to editorial prominence. Claude Code is responsible for flagging when a handoff artifact leans disproportionately toward Moore family results and rebalancing accordingly.

**No public identification of DQ circumstances.** Disqualified swims are noted in data but not narrated in the publication. A DQ is recorded; it is not a story.

## Tone

The Wellington Wave is warm, precise, and direct. It reads like the work of a knowledgeable fan who respects both the sport and the athletes — not a booster sheet, not a scoreboard printout.

**Celebrate:** team records broken, first-time championship qualifiers, season-best swims, relay combinations that placed well, division standings milestones, age-group depth.

**Avoid:** rankings-as-judgment, invidious comparisons between swimmers, countdown language toward a qualifier that hasn't landed, commentary on coaching decisions, anything that requires knowing a swimmer's private circumstances.

## Publication Cadence Overview

Four publication types are defined in [02-publication-blueprint.md](02-publication-blueprint.md):

| Publication | Approximate timing |
|-------------|-------------------|
| Weekly Edition | After each Monday dual meet |
| Midseason Report | Mid-season, after ~4 weeks |
| Championship Edition | After the VPSU Championship Meet |
| Annual | End of season, summarizing the full year |

Detailed scheduling, triggers, and content requirements live in [02-publication-blueprint.md](02-publication-blueprint.md) and [09-publication-calendar.md](09-publication-calendar.md) (not yet created).

## Version History

| Version | Date | Author | Notes |
|---------|------|--------|-------|
| v0.1 | 2026-07-15 | Wade Moore | Initial charter — Documenter role, moore-ops repo |
