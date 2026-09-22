# moore-ops — working rules

Read this file, then read the files relevant to the task. New task = new session.

## Agent roles

### PLANNER (`/plan`)
Read the relevant files, diagnose, and produce a written spec. No code blocks. If you
find yourself writing code, describe it instead.
End with: "Planner complete — awaiting Coder instructions"

### CODER
Implement the spec exactly. Stop and flag ambiguity rather than guessing. Confirm each
file change before moving on. Run `npm run test:baseline`; it must complete with zero
failures once a browser resolves.
End with: "Coder complete — ready for review or push"

### REVIEWER
Evaluate what was produced against the original spec. Check relationships between files,
not just single files. Rate issues BLOCKING / SHOULD FIX / MINOR. Flag issues; never
suggest rewrites.
End with: a pass/fail summary.

### DESIGNER
Visual and content-presentation changes only. Read `digest/builder.js` (its
`OUTPUT — digestData` block is the field-level contract) and `render/dashboard-v2.js`.
Requires a screenshot of the current state. Output a layout/hierarchy/spacing/density
spec — no code.
End with: "Designer complete — ready for Planner"

## Ownership and surfaces

- Codex owns presentation surfaces. This loop owns digest logic, parsers, data, and
  enforcement.
- Every branch on either surface starts from a freshly fetched `origin/main`, never from
  the other surface's branch. Report `pwd`, branch, base SHA and `git log --oneline -3`
  at session start.
- When Codex needs a field the digest does not produce, it stops and the request goes to
  Wade's coordinating chat. Codex never reaches into the digest layer. The bottleneck is
  deliberate.
- **`render/dashboard.js` (v1) is frozen.** Do not iterate, improve, refactor or debug it
  unless Wade asks in that session. One exception: a failing v1 test may be fixed or
  skipped to unblock CI, and nothing further — report it in the session and in the PR.
- The v1 half of `scripts/renderTest.js` is frozen with it. The email half is live.
- Before scoping any change to a rendered surface, confirm it reaches v2
  (`render/dashboard-v2.js`) or the email digest. If the only consumer is v1, say so and
  stop. `digest/builder.js` and the modules it calls serve every surface and are always
  in scope.
- Never infer team identity from a logo or mascot. Mascot lookup selects artwork only;
  the digest's own identity fields say whose row it is. Unknown names keep text with no
  logo.

## Branching

- Feature branch + pull request is the only route to `main`. Never push to `main`.
- Reviewer sign-off is required before the PR is merged. Pushing a branch is not
  delivery; merging is.
- The push hook refuses any `git push` command whose text contains the word `main`. This
  over-blocks by design. Split the command instead of weakening the hook.

## Enforcement

`.claude/settings.json` wires the `permissions.deny` rules, the archived-files hook, the
push hook, the read-only role backstop, and the Reviewer gate's two hooks. They are not
equally strong.

- A deny rule scoped to a **tool** is not scoped to an **outcome**. Any other tool
  reaching the same outcome is an open door. The real enforcement for `main` is
  server-side branch protection, not any local rule.
- The archived-files hook blocks writes to the two archive directories through `Edit`,
  `Write` and Bash. It is an accident gate, not an adversary gate. Never route around it
  by obfuscating a path.
- If an edit to a documentation file is blocked because the text quotes an archived
  path, use the `Edit`/`Write` tool. In-place stream edits and interpreter rewrites are
  blocked; falling back to the dedicated tool is correct, not a workaround.
- `.claude/settings.json`, `.claude/hooks/**` and `.claude/agents/**` are refused by
  `Edit`/`Write`.
- Reviewer and Debugger run under a read-only allowlist. A verdict record is keyed to the
  session and lives outside the working tree, so a review done in another checkout cannot
  be seen — "reviewed elsewhere" and "never reviewed" look identical to the gate.

## Writing to `data/`

**Before writing any `data/*.json`, confirm the file is current, not archived.** Files
ending `-v2`, `-757` or the newest suffix are current. The plain legacy names are
archived and must never be written to; that directory's own README carries the mapping.
When in doubt, check before writing.

Current files are read directly by `digest/builder.js` via `fs.readFile`. To change one,
edit it in the repo and redeploy, or use the Updater agent.

Conventions that cause silent bugs if missed:
- `course` records pool length only (`SCM` = 25m, `SCY` = yards). It never tells you which
  league a result came from — check `league`, or which file the row came from.
- Time field names differ by file: the league-results files use `time`;
  `swim-results.json` uses `seconds`. They are not interchangeable.
- JSON data files can carry a UTF-8 BOM. Strip it defensively before parsing anything
  from `data/`.
- Never derive a time by `minutes × 100`. All time arithmetic goes through
  `timeToSeconds()` in `digest/dateUtils.js`.
- A swimmer's age-bracket label is not stable across meets. Any lookup keyed on
  `ageGroup` must expect more than one form for one swimmer in one season.
- Showing or hiding a sport's card is `seasonStart` / `seasonEnd` / `bufferDays` in
  `data/sports-config.json` and nothing else.

## Dates

- Build the dashboard "today" anchor from the **ET calendar date**, via `startOfTodayET()`.
  A plain `new Date(); setHours(0,0,0,0)` is a day ahead at ≥8 PM ET.
- Apply the ET conversion **exactly once**, where a raw UTC instant becomes a calendar
  date. Once a `Date` is ET-anchored, read it with `getMonth()/getDate()/getFullYear()`.
  Passing it through `toLocaleDateString(ET)` again shifts it back a day.
- Anchor date arithmetic at UTC noon so it cannot land on a DST boundary.
- Resolve Eastern wall-clock config to absolute instants server-side, once, via
  `easternInstant()`. Browsers compare integers; they never parse a timezone.

## Skills

Skills live in `.claude/skills/`, one directory per skill. On Windows, run
`.\install-skills.ps1` from the repo root at session start to copy them into the plugin
path; the script is Windows/PowerShell only.

Skills that ship a committed script **must be run via `node <path>/<script>.js`, never
re-derived from SKILL.md** — the script is authoritative. The filename is not uniform
(`check.js`, `project.js`, `standings.js`). Some ship no SKILL.md at all. Every other
skill is re-derived fresh from its SKILL.md each invocation.

## Evidence and claims

- **Any "tests passing" claim must name the invocation that produced it.** A bare number
  is unfalsifiable.
- Take numbers from a run, never from a grep.
- A figure in this repo is rarely in one place. Grep for it before changing one copy, and
  re-derive rather than quoting.
- Prefer a committed, re-runnable harness over a quoted measurement. A measurement that
  cannot be re-derived from the repository is testimony, not evidence.
- A never-run check is not a passing check. Naming a gate is not the same as knowing when
  it fires.
- Do not normalise a red baseline. A standing set of "expected" failures is how the next
  real failure gets waved through.

## Commits

- When a commit touches more than one logical concern, or carries scaffolding for a
  future feature, the message must name both — not just the primary one.
- An explicit no-commit / no-push instruction in a session's own prompt takes precedence
  over the git-check stop hook's nudge.

## Where things live

- Parked work, open items and known defects: `BACKLOG.md`. Do not add them to this file.
- Dashboard v2 architecture and surfaces: `docs/dashboard-v2/`.
- Swim data reload, parsers and specs: `docs/data-reload/`.
- Meal planning and the weekly review flow: `docs/meal-planning.md` and the
  `moore-ops-weekly-review` skill.
- Data-entry rules for `data/`: the `moore-ops-updater` skill.
- Field-level digest contract: `digest/builder.js` → `OUTPUT — digestData`.
- The previous CLAUDE.md, preserved verbatim:
  `docs/reference/claude-md-2026-09-21.md`. Read the relevant section when working in
  that area. It is reference, not current rules, and it is not maintained.

Update the relevant file after any significant change — this one only when a rule changes.
