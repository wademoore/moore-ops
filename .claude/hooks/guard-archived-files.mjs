// PreToolUse hook (Edit|Write|Bash|PowerShell): refuse writes to archived data/script files.
//
// Node port of scripts/hooks/guard-archived-files.sh (retired), so the gate runs
// on Windows as well as Linux: no jq, no bash, and CRLF line endings are tolerated.
// Same five rule classes, same scoped-redirect approach (reads FROM the archive
// stay allowed), same known holes. See CLAUDE.md "The gate" for what this covers
// and -- more importantly -- what it does not: the Bash arm is pattern matching
// over a shell string and is best-effort by construction.
//
// Claude Code passes the hook payload on stdin; exit 2 blocks the tool call and
// surfaces stderr to the model. Two payload shapes are handled:
//   Edit|Write       -> .tool_input.file_path, an exact path. Reliable.
//   Bash|PowerShell  -> .tool_input.command, a shell string. Best-effort.
//
// Windows accommodations, both deliberate over-blocks (a false block is
// recoverable; a false allow is the incident):
//   - backslashes are normalized to "/" before matching in both arms, so
//     data\archive\x.json is caught the same as data/archive/x.json;
//   - the path arm is case-insensitive, because NTFS is;
//   - CRLF and LF line breaks are both collapsed to a space.

const chunks = [];
for await (const c of process.stdin) chunks.push(c);

let input;
try {
  input = JSON.parse(Buffer.concat(chunks).toString('utf8').replace(/^﻿/, ''));
} catch {
  process.exit(0); // not a hook payload we understand; never block on our own parse error
}

const toolInput = input?.tool_input ?? {};
const file = typeof toolInput.file_path === 'string' ? toolInput.file_path : '';
const cmd = typeof toolInput.command === 'string' ? toolInput.command : '';

function deny(what) {
  process.stderr.write(`BLOCKED: ${what} targets an archived path (data/archive/ or scripts/archive/).\n`);
  process.stderr.write('Archived files are a read-only audit record. Use the -v2 file. See CLAUDE.md.\n');
  process.exit(2);
}

// --- Edit / Write: exact path check ----------------------------------------
// Equivalent of the shell case: */data/archive/* | */scripts/archive/* |
// data/archive/* | scripts/archive/*
if (file) {
  const normalized = file.replace(/\\/g, '/');
  if (/(^|\/)(data|scripts)\/archive\//i.test(normalized)) deny(file);
}

if (!cmd) process.exit(0);

// --- Bash / PowerShell: textual check on the command string -----------------
// Newlines (LF or CRLF) are collapsed so heredocs and multi-line commands scan
// as one string; backslashes become "/" so Windows-style paths match too.
const cmd1l = cmd.replace(/\r?\n/g, ' ').replace(/\\/g, '/');

// Tolerate redundant separators: data/archive, data//archive, data/./archive
const ARCHIVE = /(data|scripts)(\/+\.)*\/+archive/;
// A redirect operator (> >> >| 1> 2> &>) plus optional space/quote.
const REDIR = String.raw`[0-9&]*>>?\|?\s*["']?`;
// Characters that can appear inside an unquoted redirect target.
const TARGET = String.raw`[^\s;|&"']*`;
// Utilities capable of writing. Deliberately over-broad: archive-as-source
// reads through these utilities are blocked too. The PowerShell cmdlets are the
// Windows-side equivalents (Set-Content/Out-File/... write; Copy-/Move-/
// Remove-/New-/Rename-Item mutate the tree).
const WRITERS = String.raw`tee|cp|mv|rsync|install|ln|rm|rmdir|unlink|shred|truncate|touch|mkdir|chmod|chown|chgrp|patch|dd|find|python|python3|node|perl|ruby|Set-Content|Add-Content|Clear-Content|Out-File|Copy-Item|Move-Item|Remove-Item|New-Item|Rename-Item`;
// Subset used by rule (e): file-tree writers only, not the interpreters.
const TREE_WRITERS = String.raw`tee|cp|mv|rsync|install|ln|rm|rmdir|unlink|shred|truncate|touch|mkdir|chmod|chown|chgrp|patch|dd|find|Set-Content|Add-Content|Clear-Content|Out-File|Copy-Item|Move-Item|Remove-Item|New-Item|Rename-Item`;
// A command word boundary: start of string, a shell separator, or whitespace.
const WORD_START = String.raw`(^|[|;&(]|\s)`;

// (a) An archived path is the target of a redirect. Scoped to the redirect
//     target, so a read piped elsewhere still works:
//     `grep x data/archive/f > /tmp/out` is allowed.
//     Two arms: an "archive/" path segment anywhere in the target, and a
//     target that begins with "archive/" (covers `cd data && cat > archive/f`).
if (new RegExp(`${REDIR}${TARGET}/archive/`).test(cmd1l)
  || new RegExp(`${REDIR}archive/`).test(cmd1l)) {
  deny('shell redirect');
}

if (ARCHIVE.test(cmd1l)) {
  // (b) An archived path appears anywhere in a command that runs a utility
  //     capable of writing.
  if (new RegExp(`${WORD_START}(${WRITERS})(\\s|$)`, 'i').test(cmd1l)) {
    deny('mutating command');
  }
  // (c) In-place stream editors.
  if (new RegExp(`${WORD_START}(sed|perl|awk|gawk)(\\s|$).*(-i|--in-place|inplace)`).test(cmd1l)) {
    deny('in-place edit');
  }
  // (d) Mutating git subcommands. Read-only git (log, show, diff) stays allowed
  //     so the archive remains queryable as the audit record it exists to be.
  if (new RegExp(`${WORD_START}git\\s+(-\\S+\\s+)*(checkout|restore|rm|mv|apply|clean|stash)(\\s|$)`).test(cmd1l)) {
    deny('mutating git subcommand');
  }
}

// (e) `cd` into an archive directory followed by any write indicator, which
//     defeats rules (a)-(d) because the archived path never appears in the
//     write itself: `cd data/archive && cat > league-results.json`.
//     The cd argument is bounded to ONE whitespace-free token -- a bare word
//     "archive" later in the line (a trailing comment, say) must not match.
if (new RegExp(`${WORD_START}(cd|Set-Location)\\s+["']?[^\\s;|&"']*archive`, 'i').test(cmd1l)) {
  if (/>/.test(cmd1l) || new RegExp(`${WORD_START}(${TREE_WRITERS})(\\s|$)`, 'i').test(cmd1l)) {
    deny('write after cd into an archive directory');
  }
}

process.exit(0);
