# AGENTS.md

`CLAUDE.md` is the authoritative reference for this repository. Read it.
This file covers only what is specific to this surface.

## Surface boundaries

Ownership. This surface owns presentation surfaces — Dashboard v2 renderers,
layout, styling, the sports ticker. The Claude Code loop owns digest logic,
parsers, data files, and enforcement config under `.claude/`.

Base discipline. Every branch starts from a freshly fetched `origin/main`,
never from another surface's branch. If a task needs unmerged work from the
other side, that work merges first. Report `pwd`, branch, base SHA, and
`git log --oneline -3` at session start.

Handoff. When this surface needs a field or shape the digest doesn't produce,
stop and raise it with Wade. It gets scoped there, the loop implements it, it
merges, and this surface builds on top. Never reach into the digest layer to
add what you need.

## Merge flow

Feature branch and pull request is the only route to `main`, enforced by a
GitHub ruleset with an empty bypass list. Wade merges. Do not merge.

## What lives elsewhere

Enforcement config, hooks, agent definitions, test baselines, data-file
authority, swim data conventions, and architecture are all in `CLAUDE.md`.
Do not duplicate them here — a second copy drifts and the drift is silent.