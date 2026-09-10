#!/usr/bin/env node
// Reproduces the evidence behind docs/reference/push-hook-resolver-audit.md.
//
// This is an AUDIT harness, not a test and not a fix. It is deliberately not part
// of `npm test`: every case pushes to a throwaway bare remote, and a suite that
// pushes is a suite nobody will trust running. Run it on demand:
//
//     node scripts/audit-push-hook-config.mjs
//     node scripts/audit-push-hook-config.mjs --json
//
// Method -- two INDEPENDENT signals per case, which is the whole point:
//
//   HOOK    the exit code of the real .claude/hooks/block-main-push.mjs, fed a real
//           PreToolUse payload on stdin (2 = BLOCK, 0 = ALLOW).
//   CHANGED whether the watched ref in a real bare remote actually changed after
//           running the command for real.
//
// The command is executed REGARDLESS of the hook's verdict, because the question
// is not "what does the hook say" but "what would have happened if it said
// nothing". A row with HOOK=ALLOW and CHANGED=true is a confirmed under-block. A
// row with HOOK=BLOCK and CHANGED=true is a true positive: the block is real and
// the command really could have reached the ref. A row with CHANGED=false tells
// you the mechanism could not reach the ref in that configuration, which is a
// useful negative result rather than a failure.
//
// Cross-check every verdict against BOTH columns. The reason this harness exists
// is that three review rounds read the hook and missed a hole that a real remote
// would have shown in one command.

import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const HOOK = join(HERE, "..", ".claude", "hooks", "block-main-push.mjs");

const sh = (cmd, cwd) => spawnSync("bash", ["-c", cmd], { cwd, encoding: "utf8" });

function askHook(command, cwd) {
  const r = spawnSync("node", [HOOK], {
    input: JSON.stringify({ cwd, tool_name: "Bash", tool_input: { command } }),
    encoding: "utf8",
  });
  return { code: r.status, why: (r.stderr || "").trim().replace(/^Blocked:\s*/, "") };
}

const refSha = (repo, ref) =>
  sh(`git rev-parse ${ref} 2>/dev/null || echo ABSENT`, repo).stdout.trim();

/**
 * origin/main and origin/feature both exist on `bare`; `other` is a second bare
 * remote. The working tree is on `feature`, which is AHEAD of main -- so a send of
 * feature to main genuinely MOVES refs/heads/main. Getting that wrong is how a
 * "did not move" reads as safe when it only meant "already equal".
 */
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "push-hook-audit-"));
  const bare = join(root, "remote.git");
  const other = join(root, "other.git");
  const work = join(root, "work");
  execFileSync("git", ["init", "--bare", "-q", "-b", "main", bare]);
  execFileSync("git", ["init", "--bare", "-q", "-b", "main", other]);
  execFileSync("git", ["init", "-q", "-b", "main", work]);
  const g = (c) => {
    const r = sh(c, work);
    if (r.status !== 0) throw new Error(`fixture: ${c}\n${r.stderr}`);
  };
  g("git config user.email audit@example.invalid && git config user.name audit");
  g("echo one > f.txt && git add -A && git commit -qm one");
  g(`git remote add origin ${bare} && git remote add other ${other}`);
  g("git push -q origin main && git push -q other main");
  g("git checkout -qb feature && echo two > f.txt && git commit -qam two");
  return { root, bare, other, work };
}

const CASES = [];
const c = (o) => CASES.push(o);

// --- controls ---------------------------------------------------------------
c({ id: "ctl-pos", entry: "control", watch: "bare",
  command: "git push origin feature:main",
  note: "positive control: must BLOCK, and must be able to move main" });
c({ id: "ctl-neg", entry: "control", watch: "bare",
  command: "git push origin feature",
  note: "negative control: must ALLOW, and must not touch main" });
c({ id: "ctl-b5", entry: "B5 remote.<name>.push", watch: "bare",
  setup: (f, g) => g("git config remote.origin.push refs/heads/feature:refs/heads/main"),
  command: "git push origin",
  note: "the round-3 finding, now closed -- proves the harness sees a closed hole" });

// --- confirmed under-blocks: incomplete remote-resolution chain -------------
c({ id: "b1", entry: "B1 branch.<name>.pushRemote", watch: "other",
  setup: (f, g) => g("git config branch.feature.remote origin"
    + " && git config branch.feature.pushRemote other"
    + " && git config remote.other.push refs/heads/feature:refs/heads/main"),
  command: "git push",
  note: "pushRemote outranks branch.<name>.remote; the hook reads only the latter" });
c({ id: "b2", entry: "B2 remote.pushDefault", watch: "other",
  setup: (f, g) => g("git config branch.feature.remote origin"
    + " && git config remote.pushDefault other"
    + " && git config remote.other.push refs/heads/feature:refs/heads/main"),
  command: "git push",
  note: "remote.pushDefault outranks branch.<name>.remote for pushes" });
c({ id: "b2b", entry: "B2 remote.pushDefault", watch: "other",
  setup: (f, g) => g("git config remote.pushDefault other"
    + " && git config remote.other.push refs/heads/feature:refs/heads/main"),
  command: "git push",
  note: "no branch.<name>.remote at all; the hook's 'origin' fallback is simply wrong" });
c({ id: "b1-mirror", entry: "B1 + B6 mirror on the wrong remote", watch: "other",
  setup: (f, g) => g("git checkout -q main && echo ahead > f.txt && git commit -qam advance"
    + " && git checkout -q feature"
    + " && git config branch.feature.remote origin"
    + " && git config branch.feature.pushRemote other"
    + " && git config remote.other.mirror true"),
  command: "git push",
  note: "the mirror check runs against remote.origin.mirror, which is unset" });

// --- confirmed under-blocks: remote defined outside git config -------------
c({ id: "c1", entry: "C1 $GIT_DIR/remotes/<name>", watch: "bare",
  setup: (f) => {
    mkdirSync(join(f.work, ".git", "remotes"), { recursive: true });
    writeFileSync(join(f.work, ".git", "remotes", "legacy"),
      `URL: ${f.bare}\nPush: refs/heads/feature:refs/heads/main\n`);
  },
  command: "git push legacy",
  note: "Push: line supplies the refspec; invisible to `git config`" });
c({ id: "c1b", entry: "C1 via branch.<name>.remote", watch: "bare",
  setup: (f, g) => {
    mkdirSync(join(f.work, ".git", "remotes"), { recursive: true });
    writeFileSync(join(f.work, ".git", "remotes", "legacy"),
      `URL: ${f.bare}\nPush: refs/heads/feature:refs/heads/main\n`);
    g("git config branch.feature.remote legacy");
  },
  command: "git push",
  note: "bare `git push`: remote named only by config, refspec only by file" });
c({ id: "c2", entry: "C2 $GIT_DIR/branches/<name>", watch: "bare",
  setup: (f) => {
    mkdirSync(join(f.work, ".git", "branches"), { recursive: true });
    writeFileSync(join(f.work, ".git", "branches", "legacy"), `${f.bare}#main\n`);
  },
  command: "git push legacy",
  note: "push refspec is HEAD:refs/heads/<head>" });

// --- confirmed under-blocks: the hook's environment is not the command's ----
c({ id: "d2-home", entry: "D2 global config via HOME", watch: "bare",
  setup: (f) => {
    const h = join(f.root, "fakehome");
    mkdirSync(h, { recursive: true });
    writeFileSync(join(h, ".gitconfig"),
      `[remote "origin"]\n\tpush = refs/heads/feature:refs/heads/main\n`);
  },
  command: (f) => `HOME=${join(f.root, "fakehome")} git push origin`,
  note: "HOME is not in ENV_RELOCATING" });
c({ id: "d2-xdg", entry: "D2 global config via XDG_CONFIG_HOME", watch: "bare",
  setup: (f) => {
    const h = join(f.root, "xdg", "git");
    mkdirSync(h, { recursive: true });
    writeFileSync(join(h, "config"),
      `[remote "origin"]\n\tpush = refs/heads/feature:refs/heads/main\n`);
  },
  command: (f) => `XDG_CONFIG_HOME=${join(f.root, "xdg")} git push origin`,
  note: "XDG_CONFIG_HOME is not in ENV_RELOCATING" });
c({ id: "x1", entry: "X1 GIT_CONFIG_PARAMETERS", watch: "bare",
  command: `GIT_CONFIG_PARAMETERS="'remote.origin.push=refs/heads/feature:refs/heads/main'" git push origin`,
  note: "git's internal -c channel; undocumented, and not in ENV_RELOCATING" });

// --- entries the resolver DOES read, kept as regression evidence -----------
c({ id: "d4", entry: "D4 config.worktree", watch: "bare",
  setup: (f, g) => {
    g("git config extensions.worktreeConfig true");
    writeFileSync(join(f.work, ".git", "config.worktree"),
      `[remote "origin"]\n\tpush = refs/heads/feature:refs/heads/main\n`);
  },
  command: "git push origin", note: "reached because ctx.config shells out to real git" });
c({ id: "d5", entry: "D5 include.path", watch: "bare",
  setup: (f, g) => {
    writeFileSync(join(f.root, "extra.cfg"),
      `[remote "origin"]\n\tpush = refs/heads/feature:refs/heads/main\n`);
    g(`git config include.path ${join(f.root, "extra.cfg")}`);
  },
  command: "git push origin", note: "same reason" });
c({ id: "d6", entry: "D6 includeIf onbranch", watch: "bare",
  setup: (f, g) => {
    writeFileSync(join(f.root, "onb.cfg"),
      `[remote "origin"]\n\tpush = refs/heads/feature:refs/heads/main\n`);
    g(`git config includeIf.onbranch:feature.path ${join(f.root, "onb.cfg")}`);
  },
  command: "git push origin", note: "same reason" });
c({ id: "d7", entry: "D7 git -c", watch: "bare",
  command: "git -c remote.origin.push=refs/heads/feature:refs/heads/main push origin", note: "" });
c({ id: "d9", entry: "D9 GIT_CONFIG_COUNT", watch: "bare",
  command: "GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=remote.origin.push"
    + " GIT_CONFIG_VALUE_0=refs/heads/feature:refs/heads/main git push origin",
  note: "caught by ENV_RELOCATING" });
c({ id: "d11", entry: "D11 alias.*", watch: "bare",
  setup: (f, g) => g("git config alias.deploy 'push origin feature:main'"),
  command: "git deploy", note: "" });
c({ id: "e4", entry: "E4 GIT_COMMON_DIR", watch: "bare",
  setup: (f, g) => g("git config remote.origin.push refs/heads/feature:refs/heads/main"),
  command: "GIT_COMMON_DIR=.git git push origin", note: "caught by ENV_RELOCATING" });
c({ id: "b4", entry: "B4 default origin", watch: "bare",
  setup: (f, g) => g("git config remote.origin.push refs/heads/feature:refs/heads/main"),
  command: "git push", note: "" });
c({ id: "b7-matching", entry: "B7 push.default=matching", watch: "bare",
  setup: (f, g) => g("git config push.default matching"), command: "git push origin", note: "" });
// The `simple` arm is the DEFAULT push.default and governs the commonest real
// case, so its "cannot reach a differently-named branch" property is the one that
// most deserves a measurement rather than a reading of the code. The mismatched
// upstream is the whole point: `simple` must refuse rather than send feature->main.
c({ id: "b7-simple-mismatch", entry: "B7 push.default=simple, upstream named differently", watch: "bare",
  setup: (f, g) => g("git config push.default simple"
    + " && git config branch.feature.remote origin"
    + " && git config branch.feature.merge refs/heads/main"),
  command: "git push",
  note: "git must refuse outright; the hook allows because the destination is same-name" });
c({ id: "b7-current", entry: "B7 push.default=current", watch: "bare",
  setup: (f, g) => g("git config push.default current"), command: "git push origin",
  note: "sends feature to a same-named ref" });
c({ id: "b7-nothing", entry: "B7 push.default=nothing", watch: "bare",
  setup: (f, g) => g("git config push.default nothing"), command: "git push origin",
  note: "git refuses; nothing reaches the remote" });
c({ id: "b8", entry: "B8 branch.<name>.merge", watch: "bare",
  setup: (f, g) => g("git config push.default upstream"
    + " && git config branch.feature.remote origin"
    + " && git config branch.feature.merge refs/heads/main"),
  command: "git push", note: "" });
c({ id: "a4", entry: "A4 --all", watch: "bare", command: "git push --all origin", note: "" });
c({ id: "a5", entry: "A5 --mirror", watch: "bare", command: "git push --mirror origin", note: "" });
c({ id: "a8", entry: "A8 --delete", watch: "bare", command: "git push origin --delete main", note: "" });
c({ id: "c5", entry: "C5 url.<base>.pushInsteadOf", watch: "bare",
  setup: (f, g) => g(`git config url.${f.bare}.pushInsteadOf https://example.invalid/r`
    + " && git config remote.rw.url https://example.invalid/r"
    + " && git config remote.rw.push refs/heads/feature:refs/heads/main"),
  command: "git push rw", note: "URL rewriting does not change the ref NAME" });

// --- entries the resolver ignores, where that turns out not to matter ------
c({ id: "a9", entry: "A9 --prune", watch: "bare",
  setup: (f, g) => g("git branch -D main"),
  command: "git push --prune origin +refs/heads/feature:refs/heads/feature",
  note: "prune is scoped by the refspec; main has no local counterpart" });
c({ id: "b9", entry: "B9 push.autoSetupRemote", watch: "bare",
  setup: (f, g) => g("git config push.autoSetupRemote true && git config push.default simple"),
  command: "git push", note: "destination is still same-name" });
c({ id: "b10", entry: "B10 push.followTags", watch: "tag", protectedRef: false,
  setup: (f, g) => g("git config push.followTags true && git tag -a main -m t"),
  command: "git push origin feature",
  note: "reaches refs/tags/main, which is NOT the protected branch" });
c({ id: "c8", entry: "C8 raw URL, no refspec", watch: "bare",
  command: (f) => `git push ${f.bare}`, note: "" });

// --- explicit refspec forms (A2), so the "refspec rule is correct" claim is
// --- a measurement rather than a reading -----------------------------------
c({ id: "a2-1", entry: "A2 refspec src:dst", watch: "bare",
  command: "git push origin feature:main", note: "" });
c({ id: "a2-2", entry: "A2 refspec fully qualified dst", watch: "bare",
  command: "git push origin feature:refs/heads/main", note: "" });
c({ id: "a2-3", entry: "A2 refspec forced", watch: "bare",
  command: "git push origin +feature:main", note: "" });
c({ id: "a2-4", entry: "A2 refspec HEAD:main", watch: "bare",
  command: "git push origin HEAD:main", note: "" });

// --- the remaining A entries the audit gives verdicts for -------------------
c({ id: "a6", entry: "A6 --tags", watch: "bare",
  setup: (f, g) => g("git config remote.origin.push refs/heads/feature:refs/heads/main"),
  command: "git push --tags origin",
  note: "--tags with no refspec pushes tags ONLY, suppressing the default refspec" });
c({ id: "a7", entry: "A7 --follow-tags", watch: "tag", protectedRef: false,
  setup: (f, g) => g("git tag -a main -m t"),
  command: "git push --follow-tags origin feature",
  note: "reaches refs/tags/main only" });
c({ id: "a9-cfg", entry: "A9 --prune with a configured wildcard", watch: "bare",
  setup: (f, g) => g("git branch -D main && git config remote.origin.push 'refs/heads/*:refs/heads/*'"),
  command: "git push --prune origin", note: "wildcard refspec is caught separately" });
c({ id: "a10", entry: "A10 --set-upstream", watch: "bare",
  setup: (f, g) => g("git config push.default upstream"),
  command: "git push -u origin feature:main", note: "" });
c({ id: "a12", entry: "A12 --dry-run", watch: "bare",
  command: "git push --dry-run origin feature:main",
  note: "over-block: blocked although nothing is sent" });
c({ id: "a13", entry: "A13 `tag <tag>` form", watch: "tag", protectedRef: false,
  setup: (f, g) => g("git tag -a main -m t"),
  command: "git push origin tag main", note: "over-block via rev-parse failure" });

// --- C and E entries the audit gives verdicts for ---------------------------
c({ id: "c4", entry: "C4 remote.<name>.pushurl", watch: "bare",
  setup: (f, g) => g(`git config remote.origin.pushurl ${f.bare}`
    + " && git config remote.origin.push refs/heads/feature:refs/heads/main"),
  command: "git push origin", note: "the refspec still decides" });
c({ id: "c7", entry: "C7 remote.<name>.vcs", watch: "bare",
  setup: (f, g) => g("git config remote.helper.vcs weird && git config remote.helper.url something"),
  command: "git push helper", note: "no such helper exists; result is inconclusive by design" });
c({ id: "c8-a", entry: "C8 raw URL with an explicit refspec", watch: "bare",
  command: (f) => `git push ${f.bare} feature:main`, note: "" });
c({ id: "d8", entry: "D8 --config-env", watch: "bare",
  command: "PD=refs/heads/feature:refs/heads/main"
    + " git --config-env=remote.origin.push=PD push origin",
  note: "the hook records the VARIABLE NAME, so it fails closed" });
c({ id: "e2", entry: "E2 core.worktree", watch: "bare",
  setup: (f, g) => g("git config remote.origin.push refs/heads/feature:refs/heads/main"),
  command: "git push origin", note: "core.worktree does not relocate config" });
c({ id: "e5", entry: "E5 GIT_CEILING_DIRECTORIES", watch: "bare",
  setup: (f, g) => g("git config remote.origin.push refs/heads/feature:refs/heads/main"),
  command: "GIT_CEILING_DIRECTORIES=/ git push origin", note: "" });
c({ id: "e5-sub", entry: "E5 GIT_CEILING_DIRECTORIES from a subdir", watch: "bare",
  setup: (f, g) => { mkdirSync(join(f.work, "deep"), { recursive: true });
    g("git config remote.origin.push refs/heads/feature:refs/heads/main"); },
  command: "cd deep && GIT_CEILING_DIRECTORIES=/ git push origin", note: "" });

// --- ENV_RELOCATING and GLOBAL_RELOCATING, every name, so the claim that they
// --- "catch what they enumerate" is measured rather than inferred from one regex.
// Each command is a real push that WOULD reach main (remote.origin.push is set),
// so a row that does not block is a genuine escape rather than a no-op.
for (const [name, value] of [
  ["GIT_DIR", ".git"], ["GIT_WORK_TREE", "."], ["GIT_COMMON_DIR", ".git"],
  ["GIT_NAMESPACE", "ns"], ["GIT_INDEX_FILE", ".git/index"],
  ["GIT_OBJECT_DIRECTORY", ".git/objects"],
  ["GIT_ALTERNATE_OBJECT_DIRECTORIES", ".git/objects"],
  ["GIT_CONFIG", ".git/config"], ["GIT_CONFIG_GLOBAL", "/dev/null"],
  ["GIT_CONFIG_SYSTEM", "/dev/null"], ["GIT_CONFIG_NOSYSTEM", "1"],
]) {
  c({ id: `env-${name}`, entry: `ENV_RELOCATING ${name}`, watch: "bare",
    setup: (f, g) => g("git config remote.origin.push refs/heads/feature:refs/heads/main"),
    command: `${name}=${value} git push origin`,
    note: "must block: the hook cannot know what config git will read" });
}
for (const [opt, arg] of [
  ["--git-dir", ".git"], ["--work-tree", "."], ["--namespace", "ns"],
  ["--bare", null], ["--exec-path", null],
]) {
  c({ id: `glob-${opt.replace(/-/g, "")}`, entry: `GLOBAL_RELOCATING ${opt}`, watch: "bare",
    setup: (f, g) => g("git config remote.origin.push refs/heads/feature:refs/heads/main"),
    command: `git ${opt}${arg ? ` ${arg}` : ""} push origin`,
    note: "must block: names another repository" });
}

function main() {
  const json = process.argv.includes("--json");
  const rows = [];
  for (const t of CASES) {
    const fx = fixture();
    try {
      if (t.setup) {
        t.setup(fx, (cmd) => {
          const r = sh(cmd, fx.work);
          if (r.status !== 0) throw new Error(`setup: ${cmd}\n${r.stderr}`);
        });
      }
      const command = typeof t.command === "function" ? t.command(fx) : t.command;
      const repo = t.watch === "other" ? fx.other : fx.bare;
      const ref = t.watch === "tag" ? "refs/tags/main" : "refs/heads/main";
      const before = refSha(repo, ref);
      const hook = askHook(command, fx.work);
      const run = sh(command, fx.work);
      const after = refSha(repo, ref);
      rows.push({
        id: t.id, entry: t.entry, command, note: t.note,
        watching: `${t.watch === "other" ? "other.git" : "remote.git"} ${ref}`,
        // Record the RAW exit code too. Folding every non-2 into "ALLOW" would
        // report a hook that CRASHED (exit 1) as an under-block, which is the one
        // way this harness could manufacture a finding that is not there.
        hookExit: hook.code,
        hook: hook.code === 2 ? "BLOCK" : hook.code === 0 ? "ALLOW" : `EXIT-${hook.code}`,
        why: hook.why,
        changed: before !== after,
        // false marks a case whose watched ref is deliberately outside PROTECTED,
        // so "allowed and changed" is the designed answer rather than a hole.
        protectedRef: t.protectedRef !== false,
        exec: run.status === 0 ? "ok" : `exit ${run.status}`,
      });
    } catch (e) {
      rows.push({ id: t.id, entry: t.entry, hook: "SETUP-ERROR", why: String(e), changed: null });
    } finally {
      rmSync(fx.root, { recursive: true, force: true });
    }
  }

  if (json) { console.log(JSON.stringify(rows, null, 2)); return; }

  const pad = (s, n) => String(s).padEnd(n);
  console.log(pad("ID", 38) + pad("HOOK", 7) + pad("CHANGED", 9) + pad("EXEC", 9) + "ENTRY");
  console.log("-".repeat(120));
  for (const r of rows) {
    console.log(pad(r.id, 38) + pad(r.hook, 7) + pad(r.changed, 9) + pad(r.exec ?? "", 9) + r.entry);
  }
  const allowedAndChanged = rows.filter((r) => r.hook === "ALLOW" && r.changed === true);
  const holes = allowedAndChanged.filter((r) => r.protectedRef);
  const byDesign = allowedAndChanged.filter((r) => !r.protectedRef);
  console.log("\nCONFIRMED UNDER-BLOCKS (hook allowed, and refs/heads/main actually changed):");
  if (!holes.length) console.log("  none");
  for (const h of holes) console.log(`  ${pad(h.id, 14)} ${h.entry}\n      ${h.command}`);
  if (byDesign.length) {
    console.log("\nAllowed and changed, but NOT a hole -- the watched ref is outside PROTECTED:");
    for (const b of byDesign) console.log(`  ${pad(b.id, 14)} ${b.entry} (${b.watching})`);
  }
  const errs = rows.filter((r) => r.hook === "SETUP-ERROR");
  if (errs.length) console.log(`\n${errs.length} case(s) failed to set up -- results incomplete.`);
}

main();
