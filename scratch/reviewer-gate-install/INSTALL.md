# Reviewer gate — install checklist

Every file in this directory is **complete post-install content**. Open it, select
all, copy, paste over the destination. Nothing here is a diff or a fragment, and no
file needs hand-editing after you paste it.

Produced by reading `.claude/` only. Nothing under `.claude/` was written, and no
deny rule is lifted, weakened, or worked around — the two existing files below were
built by copying the real ones and adding to them, so their current content is
preserved byte-for-byte rather than retyped.

---

## Do the hook scripts have to move out of `scratch/`?

**They do not have to move to work. They do have to move to be protected.** Both
halves were measured rather than assumed:

* **Execution — no move needed.** Neither script resolves anything relative to its
  own location: every path they touch comes from the hook payload's `cwd` or from
  `git rev-parse --absolute-git-dir`. Running the same script from
  `scratch/reviewer-gate/` and from an arbitrary nested temp directory produced
  byte-identical output and the same exit code. The settings wiring would work
  pointed at `scratch/`.
* **Protection — move required.** `.claude/settings.json` denies
  `Edit(.claude/hooks/**)` and `Write(.claude/hooks/**)`. There is no equivalent
  rule for `scratch/**`. Left where they are, the two hooks are ordinary
  model-editable repository files, so an agent could switch off the gate that
  constrains it with a single `Edit` call — and that is the ordinary accident this
  gate exists to prevent, not an exotic one. Moved into `.claude/hooks/`, they
  inherit the existing deny rules with **no deny-list change at all**.

So: copy them to `.claude/hooks/`, as steps 1 and 2 below.

---

## Order

Apply in this order. It matters: the settings file is what turns the gate on, so it
goes last, and both scripts must exist before anything references them.

| # | Copy this file | Over this destination | Kind |
|---|---|---|---|
| 1 | `scratch/reviewer-gate-install/record-review-verdict.mjs` | `.claude/hooks/record-review-verdict.mjs` | new file |
| 2 | `scratch/reviewer-gate-install/require-review.mjs` | `.claude/hooks/require-review.mjs` | new file |
| 3 | `scratch/reviewer-gate-install/reviewer.md` | `.claude/agents/reviewer.md` | **replaces** existing |
| 4 | `scratch/reviewer-gate-install/settings.json` | `.claude/settings.json` | **replaces** existing |

Steps 1 and 2 are byte-identical copies of the reviewed scripts in
`scratch/reviewer-gate/`. Step 3 is the current `reviewer.md` plus one new checklist
item. Step 4 is the current `settings.json` with two keys added to `hooks`.

**Two existing files change; two are new.** Nothing else under `.claude/` is
touched — not the other three hooks, not the other three agents, not any skill.

### What step 3 adds, and why it is not optional

A pass is produced by an exact sentinel line and by nothing else. Without item 8 the
Reviewer never emits one, so the gate never releases except through the override.
The added item also tells the Reviewer to write the line **bare** — a backticked or
fenced mention does not count, which is a real failure mode and is exercised in the
adversarial test.

### What step 4 changes

`hooks` gains `SubagentStop` and `Stop`. Everything else is untouched: all 14 deny
rules in their original order, and the whole `PreToolUse` block. See the comparison
below.

---

## The structural comparison

Run it yourself — it re-derives the merged file from the two inputs and asserts over
the **parsed** structure of the bytes it wrote, not over the text:

```
node scratch/reviewer-gate-install/verify-merge.mjs
```

Result at the time of writing — 13/13:

```
  PASS    permissions subtree is deep-equal to the current file
  PASS    all 14 deny rules survive, in the same order
  PASS    hooks.PreToolUse is deep-equal to the current file
  PASS    every currently-wired hook script is still wired
  PASS    top-level keys unchanged
  PASS    hooks keys = current keys + exactly SubagentStop and Stop
  PASS    SubagentStop is deep-equal to the fragment
  PASS    Stop is deep-equal to the fragment
  PASS    the fragment's _comment key is NOT carried into the settings file
  PASS    no BOM, LF line endings, single trailing newline
  PASS    both new hooks use exec form (no shell), matching the three shipped hooks
  PASS    the SubagentStop matcher selects the reviewer agent
  PASS    new hooks are wired under .claude/hooks/, where the deny rules reach them

  deny rules: 14 before -> 14 after
  hooks keys: [PreToolUse] -> [PreToolUse,SubagentStop,Stop]
```

The BOM / LF / trailing-newline row is not cosmetic: `test/hooks/enforcement-wiring.test.js`
asserts no enforcement file carries a BOM, and a strict `JSON.parse` refuses one.
Paste with an editor that will not add one.

---

## The override phrase

```
MOORE-OPS-REVIEW-OVERRIDE
```

Say it in a message and the gate stands down for the rest of that session. It is the
escape hatch for a bug in the hook itself, because the ordinary recovery — editing
the hook — is deny-listed on purpose.

It is honoured **only** in a genuine human prompt: an entry that is `type: "user"`,
is not a sidechain, and carries string content. A subagent prompt is authored by the
model, and a tool result carries array content, so neither can unlock the gate. All
three cases are tested, and steps 8 and 9 of the adversarial test show both sides.

Note that the phrase appears in this file, so pasting this file into a prompt trips
it. That is a human action and is treated as one.

---

## Verify it is live

**1. Wiring, without a session** — asserts both keys are present and both scripts
exist and parse:

```
node -e '
const s=JSON.parse(require("fs").readFileSync(".claude/settings.json","utf8"));
const need=["SubagentStop","Stop"];
for (const k of need) console.log((s.hooks[k]?"wired  ":"MISSING")+"  hooks."+k);
for (const f of ["record-review-verdict.mjs","require-review.mjs"]) {
  const p=".claude/hooks/"+f;
  console.log((require("fs").existsSync(p)?"present":"MISSING")+"  "+p);
}'
```

**2. Behaviour, without a session** — drives the installed scripts through ten
scenarios in a throwaway repository:

```
node scratch/reviewer-gate-install/adversarial-test.mjs --installed
```

Expect `10/10 steps behaved as expected.` Run it without `--installed` to drive the
`scratch/` copies instead; both should give the same result, which is also the
location-independence check.

**3. Live** — see `ADVERSARIAL-TEST.md`. That is the one that proves it fires in a
real session, and it is worth doing before you rely on it.

Claude Code hot-reloads an edited `settings.json`, so the hooks take effect without
restarting a session.

---

## Rollback

Delete the `SubagentStop` and `Stop` keys from `.claude/settings.json` and remove the
two scripts from `.claude/hooks/`. Nothing else was changed, so nothing else needs
undoing. `reviewer.md` item 8 is harmless if left in place — it only asks for one
extra line that nothing then reads.

Verdict records live in `.git/moore-ops-review-gate/`. They are untracked, per
worktree, and inert once nothing reads them; delete at leisure.
