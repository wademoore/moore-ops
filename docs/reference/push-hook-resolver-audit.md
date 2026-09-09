# Audit: does the push hook read everything git reads?

**Subject.** `.claude/hooks/block-main-push.mjs` as of `edd4153` (PR #55).

**Question.** Not "does the hook fail safely when it gives up" — that rule was
already in place and is not what failed. The question is: **when the resolver
answers confidently, has it read the inputs that decide the answer?**

**Method.** Every entry in
[`git-push-destination-inputs.md`](./git-push-destination-inputs.md) is checked
twice, and the two checks are independent:

1. **Where the resolver reads it**, by file and line.
2. **What actually happens**, from
   `scripts/audit-push-hook-config.mjs` — a throwaway repository, a real bare
   remote, the real hook fed a real `PreToolUse` payload, and the command then
   **executed regardless of the hook's verdict** so the remote's refs can be
   compared before and after.

The second signal is the one that matters. Three review rounds read this hook and
missed a hole that one real push would have shown. A verdict in this document that
rests only on reading the code is marked as such.

**Reproduce:** `node scripts/audit-push-hook-config.mjs`
(add `--json` for the raw rows). Environment: git 2.43.0, Node v22. **Every id cited
in this document is a case in that script** — an earlier draft cited ids that lived
only in session scratchpad, which a review caught and which made a third of the
evidence unreproducible. The `--json` rows also carry `hookExit`, the raw exit code,
because folding every non-2 exit into "ALLOW" would report a *crashed* hook as an
under-block; all ten holes below are clean `0` exits with empty stderr.

**Reading the evidence columns.** `HOOK` is the hook's exit code (`BLOCK` = 2,
`ALLOW` = 0). `CHANGED` is whether the watched ref in the bare remote actually
moved. So:

| HOOK | CHANGED | Meaning |
|---|---|---|
| BLOCK | true | **True positive.** The block is real and the command genuinely could have reached the ref. |
| BLOCK | false | Blocked, and the command could not have reached the ref anyway — safe, possibly an over-block. |
| ALLOW | false | Allowed, and it could not reach the ref. Checked; does not matter. |
| **ALLOW** | **true** | **Confirmed under-block** — *when the watched ref is `refs/heads/main`.* The hook said nothing and `main` moved. Two rows (`b10`, `a7`) watch `refs/tags/main` instead, which is deliberately outside `PROTECTED`; the harness lists those separately and they are **not** counted among the eight. |

---

## Result

**Eight distinct mechanisms send `refs/heads/main` to a real remote while the hook
says nothing.** All eight are pre-existing on `edd4153`; none is introduced by this
audit, and **nothing here is fixed** — see *Why nothing is fixed* at the end.

Three numbers appear below and they are not the same number, so to state the
relationship once rather than leave it to be derived: **seven enumeration entries**
are marked "hole" (B1, B2, B6, C1, C2, D2, X1), covering **eight mechanisms**
(D2 counts twice — `HOME` and `XDG_CONFIG_HOME` are separate variables under one
entry), demonstrated by **ten harness rows** (B1/B2 have three between them, and C1
has two spellings).

They fall into **three root causes**, and only the first is the one round 3 already
identified.

| Root cause | Entries | Shape |
|---|---|---|
| **RC1 — incomplete precedence chain when resolving the remote** | B1, B2, B6 | `resolveDefaultPush()` reads `branch.<head>.remote` and nothing else, then reads the *resolved remote's* `push`/`mirror` config. When the remote is wrong, every subsequent lookup is against the wrong remote. |
| **RC2 — remote definitions that are not config at all** | C1, C2 | The resolver asks `git config` what a remote name means. Git also resolves remote names from `$GIT_DIR/remotes/<name>` and `$GIT_DIR/branches/<name>`, which `git config` cannot see. |
| **RC3 — the hook's environment is not the command's environment** | D2 (×2), X1 | `ctx.config` shells out to `git config` in the *hook's* process. The push runs in the *command's* process. `ENV_RELOCATING` enumerates `GIT_*` names and misses three that change the answer. |

RC1 is the round-3 defect repeating one level up. Round 3 fixed *which refspec key*
is read; it did not fix *which remote* those keys are read from. `remote.<name>.push`
is now consulted — on a remote that git may not be using.

---

## RC1 — the remote is resolved from an incomplete chain

`resolveDefaultPush()` (`.claude/hooks/block-main-push.mjs:577`):

```js
remoteName = ctx.config(`branch.${head}.remote`) || "origin";
```

`git-config(1)` states the precedence in the opposite direction
(`config/branch.txt:49-57`, `config/remote.txt:1-4`):

> `branch.<name>.pushRemote` — When on branch `<name>`, it overrides
> `branch.<name>.remote` for pushing. It also overrides `remote.pushDefault` …
>
> `remote.pushDefault` — The remote to push to by default. Overrides
> `branch.<name>.remote` for all branches …

So the real order is `branch.<name>.pushRemote` → `remote.pushDefault` →
`branch.<name>.remote` → `origin`. The hook reads only the **third**.

The consequence is not merely "the wrong remote name in an error message". Lines
582 and 585 then read `remote.<remoteName>.mirror` and `remote.<remoteName>.push`
**on that wrong remote**, so the round-3 fix is looking in the wrong place.

| id | Mechanism | HOOK | CHANGED | Command |
|---|---|---|---|---|
| `b1` | `branch.feature.pushRemote = other` | **ALLOW** | **true** | `git push` |
| `b2` | `remote.pushDefault = other` | **ALLOW** | **true** | `git push` |
| `b2b` | `remote.pushDefault`, no `branch.<n>.remote` | **ALLOW** | **true** | `git push` |
| `b1-mirror` | `pushRemote = other` + `remote.other.mirror = true` | **ALLOW** | **true** | `git push` |
| `ctl-b5` | *control:* `remote.origin.push` (round-3 finding) | BLOCK | true | `git push origin` |

`b1-mirror` is the sharpest of the four: the hook checks `remote.origin.mirror`,
which is unset, while git honours `remote.other.mirror`, which is `true`. The
command-line `--mirror` is blocked unconditionally 100 lines above.

## RC2 — remote names that `git config` cannot resolve

`git-push(1)` includes `urls-remotes.txt:7-11`:

> The name of one of the following can be used instead of a URL as `<repository>`
> argument:
> * a remote in the Git configuration file: `$GIT_DIR/config`,
> * a file in the `$GIT_DIR/remotes` directory, or
> * a file in the `$GIT_DIR/branches` directory.
>
> All of these also allow you to omit the refspec from the command line because
> they each contain a refspec which git will use by default.

The hook knows only the first. `ctx.configAll("remote.legacy.push")` returns an
empty array for a remote defined in `$GIT_DIR/remotes/legacy`, so the resolver
falls through to `push.default=simple` and concludes the push is same-name.

| id | Mechanism | HOOK | CHANGED | Command |
|---|---|---|---|---|
| `c1` | `.git/remotes/legacy` with `Push: refs/heads/feature:refs/heads/main` | **ALLOW** | **true** | `git push legacy` |
| `c1b` | same file, remote named by `branch.feature.remote` | **ALLOW** | **true** | `git push` |
| `c2` | `.git/branches/legacy` containing `<url>#main` | **ALLOW** | **true** | `git push legacy` |

`c1b` is worth reading twice: the command is a bare `git push`. The remote is named
only in config, the refspec only in a file, and neither is in the command text.

## RC3 — the hook reads config in its own environment

`ctx.config` (`:1087`) runs `git -C dir config --get <key>` in the **hook's**
process. The push will run in the **command's** process, with whatever environment
the command sets. The hook compensates with `ENV_RELOCATING` (`:655`), an
enumeration of `GIT_*` names — and an enumeration is exactly what the rest of this
file was rewritten to avoid.

Three names that change which config git reads are absent from it.

| id | Mechanism | HOOK | CHANGED | Command |
|---|---|---|---|---|
| `d2-home` | `HOME` → a different `~/.gitconfig` | **ALLOW** | **true** | `HOME=<dir> git push origin` |
| `d2-xdg` | `XDG_CONFIG_HOME` → a different `git/config` | **ALLOW** | **true** | `XDG_CONFIG_HOME=<dir> git push origin` |
| `x1` | `GIT_CONFIG_PARAMETERS` | **ALLOW** | **true** | `GIT_CONFIG_PARAMETERS="'remote.origin.push=…:refs/heads/main'" git push origin` |

`HOME` and `XDG_CONFIG_HOME` are cited in `git-config(1)` FILES as the source of the
global scope. `GIT_CONFIG_PARAMETERS` is **not** in `git-config(1)` or `git(1)` — it
is git's internal channel for propagating `-c` to subprocesses, which is why the
enumeration document lists it separately as X1 rather than pretending it was
documentation-derived. It was tested anyway, and it works.

---

## Entry-by-entry audit

`read` = the resolver consults it. `parsed` = the token is consumed correctly so
positions do not shift, but the value is never consulted. `not read` = invisible to
the resolver.

### A — command line

| # | Entry | Status | Where | Evidence |
|---|---|---|---|---|
| A1 | `<repository>` | read | `:414` / `:486` / `:493` (`positionals[0]`), `:570` | `ctl-pos` BLOCK/true |
| A2 | `<refspec>...` | read | `evaluateRefspec` `:508-539` | `ctl-pos`, `a2-1`, `a2-2`, `a2-3`, `a2-4` all BLOCK/true |
| A3 | `--repo=` | read | `:424-434`, `:574` | **code reading only** — no harness row; `--repo` is exercised nowhere in the evidence set |
| A4 | `--all` / `--branches` | read | `:478` | `a4` BLOCK |
| A5 | `--mirror` | read | `:479` | `a5` BLOCK |
| A6 | `--tags` | read | `:491` (suppresses default refspec) | `a6` ALLOW/**false** — with `remote.origin.push` set to a main-bound refspec, `--tags` still sends no branch |
| A7 | `--follow-tags` | parsed | `NO_ARG` `:363` | `a7` ALLOW/true against `refs/tags/main` only — outside `PROTECTED`, listed separately by the harness |
| A8 | `-d` / `--delete` | read | `:485`, `:521-523` | `a8` BLOCK |
| A9 | `--prune` | **parsed, not consulted** | `NO_ARG` `:363` | `a9` ALLOW/**false** — prune is scoped by the refspec; a configured wildcard is blocked separately (`a9-cfg` BLOCK/false). **Checked; does not matter.** |
| A10 | `-u` / `--set-upstream` | parsed | `NO_ARG` | `a10` BLOCK/true. Affects later pushes via B8, which *is* read. |
| A11 | `--recurse-submodules` | **parsed, value not consulted** | `VALUE_ARG` `:369` | See *Submodules* below. Not demonstrated to reach `main`. |
| A12 | `-n` / `--dry-run` | parsed | `NO_ARG` `:361` | `a12` BLOCK/false — an over-block, in the safe direction |
| A13 | `tag <tag>` | not special-cased | — | `a13` BLOCK ("`tag` does not resolve to a single ref") — over-blocks, safe |

### B — default resolution

| # | Entry | Status | Where | Evidence |
|---|---|---|---|---|
| B1 | `branch.<name>.pushRemote` | **NOT READ** | — | `b1` **ALLOW/true** — hole |
| B2 | `remote.pushDefault` | **NOT READ** | — | `b2`, `b2b` **ALLOW/true** — hole |
| B3 | `branch.<name>.remote` | read | `:577` | `c1b` reaches it |
| B4 | default `origin` | read | `:577` | `b4` BLOCK/true |
| B5 | `remote.<name>.push` | read | `:585` `configAll` | `ctl-b5` BLOCK/true — but on the remote RC1 resolved |
| B6 | `remote.<name>.mirror` | read | `:582` | `b1-mirror` **ALLOW/true** — hole via RC1 |
| B7 | `push.default` | read | `:596-618` | `b7-matching` BLOCK; `simple`/`current`/`nothing` allow correctly |
| B8 | `branch.<name>.merge` | read | `:607` | `b8` BLOCK/true |
| B9 | `push.autoSetupRemote` | **not read** | — | `b9` ALLOW/**false** — destination stays same-name. **Checked; does not matter.** |
| B10 | `push.followTags` | **not read** | — | `b10` ALLOW/true, but the ref is `refs/tags/main`, deliberately outside `PROTECTED` (`:162`). Not a branch hole; **a policy question, not a resolver defect.** |
| B11 | `push.recurseSubmodules` | **not read** | — | config spelling of A11; see below |
| B12 | current branch / `HEAD` | read | `:548-551`, blocks on detached | code + `simple`/`current` arms |

### C — remote definition

| # | Entry | Status | Where | Evidence |
|---|---|---|---|---|
| C1 | `$GIT_DIR/remotes/<name>` | **NOT READ** | — | `c1`, `c1b` **ALLOW/true** — hole |
| C2 | `$GIT_DIR/branches/<name>` | **NOT READ** | — | `c2` **ALLOW/true** — hole |
| C3 | `remote.<name>.url` | not read | — | irrelevant: `PROTECTED` is a branch **name**, not a destination host |
| C4 | `remote.<name>.pushurl` | not read | — | `c4` BLOCK/true — the refspec still decides |
| C5 | `url.<base>.pushInsteadOf` | not read | — | `c5` BLOCK/true — rewriting the URL does not rewrite the ref name |
| C6 | `url.<base>.insteadOf` | not read | — | same mechanism as C5 |
| C7 | `remote.<name>.vcs` | not read | — | `c7` ALLOW/**false**, `exit 128` (`git: 'remote-weird' is not a git command`). **Not demonstrated either way** — a real helper could do anything, and none was available to test. Recorded as unresolved, not as safe. |
| C8 | raw URL as `<repository>` | partially | `:570` treats the URL as `remoteName` | `c8` ALLOW/false (pushes `feature`→`feature`); `c8-a` BLOCK/true with an explicit refspec |

### D — config discovery

| # | Entry | Status | Where | Evidence |
|---|---|---|---|---|
| D1 | system `/etc/gitconfig` | read **indirectly** | `ctx.config` shells out to real `git config` `:1087` | **code reading only** — no harness row; writing `/etc/gitconfig` is not something this harness will do. Same call as D3-D6, which do have rows. |
| D2 | global `~/.gitconfig`, `$XDG_CONFIG_HOME/git/config` | read indirectly, **but in the hook's environment** | `:1087` | `d2-home`, `d2-xdg` **ALLOW/true** — hole |
| D3 | local `$GIT_DIR/config` | read indirectly | `:1087` | `ctl-b5` BLOCK |
| D4 | `config.worktree` | read indirectly | `:1087` | `d4` BLOCK/true |
| D5 | `include.path` | read indirectly | `:1087` | `d5` BLOCK/true |
| D6 | `includeIf.<cond>.path` | read indirectly | `:1087` | `d6` BLOCK/true (`onbranch:feature`) |
| D7 | `git -c` | read | `:1032-1042` | `d7` BLOCK/true |
| D8 | `git --config-env` | read as the **variable name**, not its value | `:1032`, comment `:1038-1040` | `d8` BLOCK/true — blocks because the recorded value (`"PD"`) fails to resolve. Fails closed for the right reason by accident, and the comment says so. |
| D9 | `GIT_CONFIG_COUNT`/`KEY`/`VALUE` | caught | `ENV_RELOCATING` `:655` | `d9` BLOCK/true |
| D10 | `GIT_CONFIG_GLOBAL`/`SYSTEM`/`NOSYSTEM` | caught | `ENV_RELOCATING` `:655` | `env-GIT_CONFIG_GLOBAL`, `env-GIT_CONFIG_SYSTEM`, `env-GIT_CONFIG_NOSYSTEM` all BLOCK/true |
| D11 | `alias.*` | read | `:1117-1130` | `d11` BLOCK/true |
| X1 | `GIT_CONFIG_PARAMETERS` | **NOT READ, not in `ENV_RELOCATING`** | — | `x1` **ALLOW/true** — hole |

### E — repository location

| # | Entry | Status | Where | Evidence |
|---|---|---|---|---|
| E1 | `GIT_DIR` / `--git-dir` | caught | `GLOBAL_RELOCATING` `:383`, `ENV_RELOCATING` `:655` | `env-GIT_DIR` and `glob-gitdir` both BLOCK/true |
| E2 | `GIT_WORK_TREE` / `--work-tree` / `core.worktree` | env+option caught; `core.worktree` not read | `:383`, `:655` | `env-GIT_WORK_TREE`, `glob-worktree` BLOCK/true; `e2` BLOCK/true — `core.worktree` does not relocate config |
| E3 | `git -C` / cwd | read | `:1022-1030`, `baseCwd` `:183` | over-blocks on a malformed `-C` (hit while writing this document) |
| E4 | `GIT_COMMON_DIR` | caught | `ENV_RELOCATING` `:655` | `e4` BLOCK/true |
| E5 | `GIT_CEILING_DIRECTORIES` | **not read** | — | `e5` and `e5-sub` both BLOCK/true — the ceiling does not stop the hook reading the same config git reads. **Checked; does not matter.** |
| E6 | `--bare` | caught | `GLOBAL_RELOCATING` `:383` | `glob-bare` BLOCK |
| E7 | `GIT_NAMESPACE` / `--namespace` | caught | `:383`, `:655` | `env-GIT_NAMESPACE`, `glob-namespace` both BLOCK; documented as receiving-side (`gitnamespaces(7)`) |

---

## Submodules — one of the two entries this audit could not settle

`--recurse-submodules=on-demand` (A11) and `push.recurseSubmodules` (B11) are
parsed and ignored. Both cause pushes to **other repositories' remotes**, which is
outside everything the resolver models.

Attempting it empirically, git propagated the *superproject's* refspec into the
submodule:

```
fatal: src refspec 'feature' must name a ref
fatal: process for submodule 'sub' failed
```

That is consistent with `git-push(1):402-416`, which describes on-demand as pushing
"all submodules that changed in the revisions to be pushed" without giving the
submodule a refspec of its own. On that reading a superproject push to `feature`
cannot reach a submodule's `main` — but this is **one observation and a reading of
prose, not a proof**, and the fixture needed `protocol.file.allow` juggling to run
at all. Recorded as **unresolved**. It is the honest answer, and it is the same
category of "nobody has checked" that produced this whole exercise.

**C7 (`remote.<name>.vcs`) is the second unresolved entry**, for a related reason:
a remote helper is an arbitrary external program, no such helper was available to
install, and the `c7` row only proves that git fails when the named helper does not
exist. Neither entry should be read as "safe".

## What the audit confirms is sound

Worth stating, because it is the part that is easy to lose in a list of holes:

- **The refspec rule is correct** for every form tested — `src:dst`,
  `+src:dst`, `HEAD:main`, `refs/heads/main`, `--delete main`, wildcards.
- **Reading config by shelling out to real `git config` is the right design**, and
  it is why D3, D4, D5 and D6 are covered for free — each has a BLOCK/true row.
  (D1, the system file, is the same call but has no row: the harness will not write
  `/etc/gitconfig`. That one is an inference, flagged as such in its table cell.) A hand-rolled config parser
  would have had to reimplement include resolution, `onbranch` conditions and
  scope precedence, and would have been a fourth root cause. RC3 is a defect in the
  *environment* that call inherits, not in the decision to make the call.
- **The `push.default` arms are right**, including the non-obvious one: `simple`
  refuses outright when the upstream is named differently, so it cannot reach a
  differently-named branch.
- **`ENV_RELOCATING` and `GLOBAL_RELOCATING` catch what they enumerate — measured,
  not inferred.** An earlier draft asserted this from the shape of the regex after
  testing only two of the names, which a review correctly called an unmarked
  code-reading under a heading that says "confirms". The harness now sets **all
  eleven** `ENV_RELOCATING` names (`env-GIT_*`) and passes **all five**
  `GLOBAL_RELOCATING` options (`glob-*`), each on a command that would otherwise
  reach `main` because `remote.origin.push` is set to a main-bound refspec. All
  sixteen block.

## Two over-blocks found while doing this work

Neither is new, and both are in the safe direction. Recording them because they
cost real time:

1. **Writing this document with a Bash heredoc is refused.** The text contains
   `git -C <path>` as prose, and the hook parses it as a git invocation with a
   missing directory: `Blocked: git -C is missing its directory`. CLAUDE.md already
   prescribes the remedy — use the `Write` tool — and that is what produced these
   two files.
2. `--dry-run` (A12) and the `tag <tag>` form (A13) both block although neither can
   update `refs/heads/main`.

## Why nothing is fixed

Because the brief was to establish what is true, and because **three consecutive
rounds of patching this file each introduced a new defect** — an exponential suffix
sweep that hung for thirty seconds, a `MAX_DEPTH` change that blocked the very
branch-delete the rewrite exists to protect, a dynamic rule that blocked the
session's own tooling.

RC1 and RC3 in particular look like one-line fixes, and that is the strongest
argument for not making them here:

- **RC1** is not "add two `ctx.config` calls". It is a precedence chain whose order
  must match `git-config(1)`, applied *before* the `mirror` and `push` lookups that
  currently consume `remoteName`. Getting the order wrong resolves the wrong remote
  with more confidence than before.
- **RC3** cannot be closed by adding `HOME`, `XDG_CONFIG_HOME` and
  `GIT_CONFIG_PARAMETERS` to `ENV_RELOCATING`. That is a fourth patch to an
  enumeration whose incompleteness is the defect. The general form is that the hook
  resolves config in an environment the command will not run in.
- **RC2** genuinely is additive — read `$GIT_DIR/remotes/<name>` and
  `$GIT_DIR/branches/<name>` — but it needs its own parser for two file formats,
  and it is the same class of change that has broken this hook three times.

None of this is an argument that the hook is worthless. It is an **accident gate**,
and CLAUDE.md already says so. **The real enforcement is server-side branch
protection on `main`**, which binds every route including all eight mechanisms
above. This audit does not change that and should not be read as weakening it: it
changes only how much a green local run is worth as evidence, which is less than it
looked.


## Review record

An independent Reviewer pass was run against this document, the enumeration, and
the harness. It returned **`REVIEW: FAIL`**, and the failures were real. They are
recorded here rather than quietly fixed, because a review whose findings vanish
into a clean document teaches nothing:

| Finding | Disposition |
|---|---|
| A6's evidence cited a "pass-1 row" for `--tags` that **existed in no harness case and no recorded run** | Fixed. `a6` is now a real shipped case, and it changed the verdict's wording from an assertion to a measurement (ALLOW/false). |
| "`ENV_RELOCATING` and `GLOBAL_RELOCATING` catch what they enumerate" asserted 16 names on the strength of 2 tested, unmarked as a code reading | Fixed. All 11 env names and all 5 global options now have rows. All block. |
| C7 cited `config/remote.txt:75-77`, which is `pruneTags`; `vcs` is at 61-63 | Fixed in the enumeration. |
| ~14 cited ids were unreachable from the harness the "Reproduce" line points at | Fixed. The shipped script grew from 31 to 66 cases; every cited id is now one of them. |
| Wrong pass labels on `c7` and `e5`; A1 and the `alias.txt` and `push.txt` line ranges slightly off; "the one entry this audit could not settle" when C7 is a second; the 7/8/10 count relationship never stated; harness folded a non-2 hook exit into ALLOW | All fixed. |

**Two of the reviewer's checks came back unverified rather than passed, and that
limitation stands:** the Reviewer's read-only allowlist refused both
`node scripts/audit-push-hook-config.mjs` and `curl`, so it **could not run the
harness and could not fetch the git documentation independently**. It verified
citations against the fetched doc sources retained in the session scratchpad —
the author's own artifacts. That is weaker than an independent fetch and the
reviewer said so. This is the same gap CLAUDE.md already records under *Known open
items* ("a Reviewer cannot run the browser-enabled suite at all"), showing up in a
second place: the allowlist is start-anchored on `npm test` / `node --test`, so
**no** on-demand script can be executed by a Reviewer, and evidence that is a script
cannot be independently re-run by the role whose job is to distrust it.

The findings that survived review unchanged are the ones that matter: the eight
mechanisms, their ten rows, the hook line references, the git citations including
the load-bearing `remote.<name>.push`-before-`push.default` ordering and the whole
C group, the fixture genuinely leaving `feature` ahead of `main`, and the honest
labelling of the two unresolved entries and the two out-of-scope tag rows.
