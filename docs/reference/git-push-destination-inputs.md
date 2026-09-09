# What decides where a `git push` lands

**Purpose.** An enumeration, derived from git's own documentation, of every
configuration key, environment variable, and mechanism that participates in
deciding **which refs a push sends** and **to which remote**.

**This list is deliberately independent of any implementation.** It was written
before reading `.claude/hooks/block-main-push.mjs`, from `git-push(1)`,
`git-config(1)`, `git(1)` and the files those pages include. It is the list that
exists whether or not anyone implemented against it. The audit of the hook
against this list is a separate document,
[`push-hook-resolver-audit.md`](./push-hook-resolver-audit.md); **do not merge
the two**. The enumeration's value is that it was not derived from the thing it
is used to check.

## Why this document exists

`.claude/hooks/block-main-push.mjs` was rewritten (PR #55) to resolve a push's
destination rather than pattern-match its command text. Three review rounds each
found a real hole in that resolver. The third found that git consults
`remote.<name>.push` **before** `push.default`, and the resolver never read it —
so a plain `git push origin` from any branch could send `main` with no wrapper,
no variable, and no indirection.

That defect was pre-existing and every prior round missed it. The problem it
revealed is not the missing key. It is that **nobody knew whether the resolver
read everything git reads**, because no list of what git reads had ever been
written down. This document is that list.

## Version pinning

Citations are to the documentation source of **git v2.43.0**, which is the
version installed in this environment (`git --version` reports
`git version 2.43.0`), so the citations and the empirical results in the audit
describe the same implementation.

Source: `https://raw.githubusercontent.com/git/git/v2.43.0/Documentation/<file>`

Each entry cites the file and line where the behaviour is stated. `git-push(1)`
and `git-config(1)` are assembled from includes, so a key documented in
`config/remote.txt` is what `git-config(1)` renders, and `git-push.txt:705` is
the `include::config/push.txt[]` directive that pulls the `push.*` block into
`git-push(1)`.

## The load-bearing paragraph

Everything in group B is an elaboration of four sentences in `git-push(1)`
`DESCRIPTION` (`git-push.txt:29-38`):

> When the command line does not specify where to push with the `<repository>`
> argument, `branch.*.remote` configuration for the current branch is consulted
> to determine where to push. If the configuration is missing, it defaults to
> 'origin'.
>
> When the command line does not specify what to push with `<refspec>...`
> arguments or `--all`, `--mirror`, `--tags` options, the command finds the
> default `<refspec>` by consulting `remote.*.push` configuration, and if it is
> not found, honors `push.default` configuration to decide what to push.

Read the second paragraph in order: **`remote.<name>.push` is consulted first,
and `push.default` is only reached "if it is not found"**. A resolver that starts
at `push.default` has skipped the input that outranks it.

---

## A. Command line — explicit destination and refspecs

| # | Mechanism | Effect on destination | Citation |
|---|---|---|---|
| A1 | `<repository>` positional | Names the remote, or a raw URL, directly | `git-push.txt:17,51-55` |
| A2 | `<refspec>...` positional | Names `<src>:<dst>` explicitly; `+` forces; a bare `<dst>` may be an unqualified name resolved against the remote | `git-push.txt:57-95` |
| A3 | `--repo=<repository>` | Equivalent to `<repository>`; the positional wins if both are given | `git-push.txt:369-371` |
| A4 | `--all` / `--branches` | Sends **all** of `refs/heads/` — includes `main` without naming it | `git-push.txt:149-152` |
| A5 | `--mirror` | Sends **all** of `refs/` | `git-push.txt:162-171` |
| A6 | `--tags` | Adds all `refs/tags/` to whatever else is sent | `git-push.txt:187-190` |
| A7 | `--follow-tags` | Adds reachable annotated tags | `git-push.txt:192-198` |
| A8 | `-d` / `--delete` | Turns every listed ref into a deletion — deleting `main` is still a write to `main` | `git-push.txt:182-185` |
| A9 | `--prune` | Removes remote branches with no local counterpart; respects refspecs | `git-push.txt:154-160` |
| A10 | `-u` / `--set-upstream` | Does not change *this* push's destination; sets `branch.<name>.merge`/`.remote`, which decides **later** pushes under `push.default=upstream`/`simple` | `git-push.txt:373-378` |
| A11 | `--recurse-submodules=check\|on-demand\|only\|no` | `on-demand`/`only` push **submodule** refs to submodule remotes — refs and remotes the superproject command line never names | `git-push.txt:402-414` |
| A12 | `-n` / `--dry-run` | Sends nothing; a "push to main" under `--dry-run` updates no ref | `git-push.txt:173-175` |
| A13 | `tag <tag>` refspec form | Shorthand for `refs/tags/<tag>:refs/tags/<tag>` | `git-push.txt:147` |

## B. Default resolution — what is sent when the command line is silent

Ordered as git resolves them.

### B-remote: which remote

| # | Key | Rule | Citation |
|---|---|---|---|
| B1 | `branch.<name>.pushRemote` | Overrides `branch.<name>.remote` **and** `remote.pushDefault`, for pushes from branch `<name>` | `config/branch.txt:49-57` |
| B2 | `remote.pushDefault` | Overrides `branch.<name>.remote` for all branches; overridden by B1 | `config/remote.txt:1-4` |
| B3 | `branch.<name>.remote` | The remote for the current branch, absent B1/B2 | `config/branch.txt:37-48` |
| B4 | literal default `origin` | Used when no configuration supplies a remote | `git-push.txt:31-32`; `config/branch.txt:42-45` |

`branch.<name>.remote` may be `.` (a period), meaning the **current local
repository** — a push whose remote is the repo itself (`config/branch.txt:46-48`).

### B-refspec: which refs

| # | Key | Rule | Citation |
|---|---|---|---|
| B5 | **`remote.<name>.push`** | The default refspec for the resolved remote. **Consulted before `push.default`**, which is reached only "if it is not found". `push = refs/heads/main` sends `main` from any branch. | `git-push.txt:35-38`; `config/remote.txt:27-29`; `git-push.txt:66-72` |
| B6 | **`remote.<name>.mirror`** | If true, the push behaves **as if `--mirror` were given** — all of `refs/`. The config spelling of A5. | `config/remote.txt:31-33`; `git-push.txt:169-171` |
| B7 | `push.default` | Reached only when B5 is absent. Values: `nothing`, `current`, `upstream`, `tracking` (deprecated synonym for `upstream`), `simple` (default since 2.0), `matching`. `matching` sends **every** same-named branch — `main` included — from any branch. | `config/push.txt:12-67` |
| B8 | `branch.<name>.merge` | The upstream ref. Under `push.default=upstream`/`simple` this is the **destination ref**, so a branch whose `merge` is `refs/heads/main` sends `main`. | `config/branch.txt:58-75`; `config/push.txt:30-34` |
| B9 | `push.autoSetupRemote` | Assumes `--set-upstream` when no upstream exists, under `push.default` `simple`/`upstream`/`current` | `config/push.txt:1-10` |
| B10 | `push.followTags` | Enables `--follow-tags` by default | `config/push.txt:69-72` |
| B11 | `push.recurseSubmodules` | Config spelling of A11; defaults from `submodule.recurse` when unset | `config/push.txt:112-116` |
| B12 | Current branch / `HEAD` | Every `push.default` mode except `matching` and `nothing` is defined in terms of "the current branch"; a detached `HEAD` changes the answer | `config/push.txt:22-56` |

## C. Remote definition — where a name resolves, outside `git config`

**This group is the one most likely to be missed**, because two of its members
are not config keys at all.

| # | Mechanism | Effect | Citation |
|---|---|---|---|
| C1 | **`$GIT_DIR/remotes/<name>`** | A *file* naming a remote. Its `Push: <refspec>` lines supply the default refspec when none is given on the command line. Multiple `Push:` lines allowed. Invisible to `git config`. | `urls-remotes.txt:7-11,42-61`, included into `git-push(1)` at `git-push.txt:435` |
| C2 | **`$GIT_DIR/branches/<name>`** | A *file* of the form `<URL>#<head>`. For push, git uses the refspec `HEAD:refs/heads/<head>`, `<head>` defaulting to `master`. A file `.git/branches/x` containing `<url>#main` sends `main`. Invisible to `git config`. | `urls-remotes.txt:7-11,63-96` |
| C3 | `remote.<name>.url` | The remote's URL | `config/remote.txt:6-8` |
| C4 | `remote.<name>.pushurl` | Push-only URL; overrides `url`. **All** defined pushurls are pushed to | `config/remote.txt:10-11`; `urls-remotes.txt:35-39` |
| C5 | `url.<base>.pushInsteadOf` | Rewrites the URL a push is sent to; longest match wins; ignored for a remote with an explicit `pushurl` | `config/url.txt:19-30` |
| C6 | `url.<base>.insteadOf` | Rewrites any URL, push included, when no `pushInsteadOf` applies | `config/url.txt:1-17` |
| C7 | `remote.<name>.vcs` | Routes the remote through the `git-remote-<vcs>` helper, an external program that decides what the transport actually does | `config/remote.txt:61-63`; `gitremote-helpers.txt` |
| C8 | A raw URL as `<repository>` | A URL may be given where a remote name is expected, so no configured remote need exist at all | `git-push.txt:51-55`; `urls.txt` |

## D. Config discovery — which files supply groups B and C

Every key in B and C is only as knowable as the set of files it can be written
in. `git config --get` run in one directory does not necessarily see what
`git push` run in another will.

| # | Mechanism | Citation |
|---|---|---|
| D1 | system `$(prefix)/etc/gitconfig` | `git-config.txt:303-304` |
| D2 | global `$XDG_CONFIG_HOME/git/config` and `~/.gitconfig` — **both** read if both exist | `git-config.txt:306-313` |
| D3 | local `$GIT_DIR/config` | `git-config.txt:315-316` |
| D4 | worktree `$GIT_DIR/config.worktree`, active only when `extensions.worktreeConfig` is set | `git-config.txt:318-320` |
| D5 | `include.path` — inserted inline, relative to the including file, may repeat | `config.txt:83-102` |
| D6 | `includeIf.<cond>.path` with conditions `gitdir:`, `gitdir/i:`, `onbranch:`, `hasconfig:remote.*.url:` — so the **branch you are on** and the **URL of a remote** can each switch in a config file that defines B5 | `config.txt:103-113` plus the four condition headings at `config.txt:114,144,148,162` |
| D7 | `git -c <name>=<value>` — overrides files | `git.txt:76-87` |
| D8 | `git --config-env=<name>=<envvar>` — value taken from an environment variable, so the key's value is not in the command text | `git.txt:88-107` |
| D9 | `GIT_CONFIG_COUNT` + `GIT_CONFIG_KEY_<n>` / `GIT_CONFIG_VALUE_<n>` — arbitrary config injected purely from the environment | `git-config.txt:410-420` |
| D10 | `GIT_CONFIG_GLOBAL`, `GIT_CONFIG_SYSTEM`, `GIT_CONFIG_NOSYSTEM` — replace or suppress whole config scopes | `git-config.txt:399-408` |
| D11 | `alias.*` — `git <alias>` expands to another git command, and a `!`-prefixed alias is an arbitrary shell command. An alias's first word may itself be `-c <config>` | `config/alias.txt:1-28` |

Precedence, stated in `git-config(1)` FILES (`git-config.txt:322-328`): files are read system, then global,
then local, then worktree, with **last value winning**; `GIT_CONFIG_*` env pairs
override files but are themselves overridden by `git -c`
(`git-config.txt:396-420`).

## E. Repository location — *whose* config and refs apply

Groups B, C and D all resolve relative to a repository. Which repository that is
gets decided by inputs that never appear in the push's own arguments.

| # | Mechanism | Citation |
|---|---|---|
| E1 | `GIT_DIR` / `--git-dir=<path>` — also disables discovery | `git.txt:139-157,503-508` |
| E2 | `GIT_WORK_TREE` / `--work-tree=<path>` / `core.worktree` | `git.txt:158-165,509-513`; `config/core.txt:324` |
| E3 | `git -C <path>` and the process working directory | `git.txt:61-75` |
| E4 | `GIT_COMMON_DIR` — refs and config may live in a *different* directory from `GIT_DIR` | `git.txt:543-551` |
| E5 | `GIT_CEILING_DIRECTORIES`, `GIT_DISCOVERY_ACROSS_FILESYSTEM` — bound upward discovery, changing which repo is found | `git.txt:518-542` |
| E6 | `--bare` | `git.txt:171-175` |
| E7 | `GIT_NAMESPACE` / `--namespace=<path>` — documented for `upload-pack`/`receive-pack`, i.e. the **receiving** side | `git.txt:166-169`; `gitnamespaces.txt` |

## Notes on scope

- **Not enumerated:** keys that affect whether a push is *accepted*, or how it is
  *transported*, rather than which refs go where — `receive.denyDeletes`,
  `receive.denyNonFastForwards`, `push.gpgSign`, `push.negotiate`,
  `push.useBitmaps`, `push.useForceIfIncludes`, `push.pushOption`, `transfer.*`,
  `http.*`, `credential.*`, `protocol.*`. `--force`, `--force-with-lease` and
  `--force-if-includes` change permission, not destination.
- **`GIT_CONFIG_PARAMETERS` is deliberately absent from the numbered list.** It
  is git's internal channel for propagating `-c` to subprocesses. It is not
  described in `git-config(1)` or `git(1)`, and this list is
  documentation-derived by construction. It is exercised empirically in the audit
  anyway, as X1.
- Group E entries answer "which repository", not "which ref". They are
  enumerated because every other group's answer is read out of the repository E
  selects.
