#!/bin/bash
# PreToolUse hook (Edit|Write|Bash): refuse writes to archived data/script files.
#
# Claude Code passes the hook payload on stdin; exit 2 blocks the tool call and
# surfaces stderr to the model. See CLAUDE.md "current vs. archived" guard rail,
# and the "Archived-files gate" section for what this covers and what it does
# not -- the Bash arm is pattern matching over a shell string and is therefore
# best-effort by construction. Its known holes are enumerated there.
#
# Two payload shapes are handled:
#   Edit|Write -> .tool_input.file_path, an exact path. Reliable.
#   Bash       -> .tool_input.command, a shell string. Best-effort.
INPUT=$(cat)

FILE=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // empty')
CMD=$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty')

deny() {
  echo "BLOCKED: $1 targets an archived path (data/archive/ or scripts/archive/)." >&2
  echo "Archived files are a read-only audit record. Use the -v2 file. See CLAUDE.md." >&2
  exit 2
}

# --- Edit / Write: exact path check (unchanged from 4a8cc52) -----------------
case "$FILE" in
  */data/archive/*|*/scripts/archive/*|data/archive/*|scripts/archive/*) deny "$FILE" ;;
esac

[ -n "$CMD" ] || exit 0

# --- Bash: textual check on the command string -------------------------------
# Newlines are collapsed so heredocs and multi-line commands scan as one string.
CMD_1L=$(printf '%s' "$CMD" | tr '\n' ' ')

# Tolerate redundant separators: data/archive, data//archive, data/./archive
ARCHIVE='(data|scripts)(/+\.)*/+archive'
# A redirect operator (> >> >| 1> 2> &>) plus optional space/quote.
REDIR='[0-9&]*>>?\|?[[:space:]]*["'"'"']?'
# Characters that can appear inside an unquoted redirect target.
TARGET='[^[:space:];|&"'"'"']*'

# (a) An archived path is the target of a redirect. Scoped to the redirect
#     target, so a read piped elsewhere still works:
#     `grep x data/archive/f > /tmp/out` is allowed.
#     Two arms: an "archive/" path segment anywhere in the target, and a
#     target that begins with "archive/" (covers `cd data && cat > archive/f`).
if printf '%s' "$CMD_1L" | grep -Eq "${REDIR}${TARGET}/archive/" \
|| printf '%s' "$CMD_1L" | grep -Eq "${REDIR}archive/"; then
  deny "shell redirect"
fi

if printf '%s' "$CMD_1L" | grep -Eq "$ARCHIVE"; then
  # (b) An archived path appears anywhere in a command that runs a utility
  #     capable of writing. Deliberately over-broad: archive-as-source reads
  #     through these utilities are blocked too.
  if printf '%s' "$CMD_1L" | grep -Eq '(^|[|;&(]|[[:space:]])(tee|cp|mv|rsync|install|ln|rm|rmdir|unlink|shred|truncate|touch|mkdir|chmod|chown|chgrp|patch|dd|find|python|python3|node|perl|ruby)([[:space:]]|$)'; then
    deny "mutating command"
  fi
  # (c) In-place stream editors.
  if printf '%s' "$CMD_1L" | grep -Eq '(^|[|;&(]|[[:space:]])(sed|perl|awk|gawk)([[:space:]]|$).*(-i|--in-place|inplace)'; then
    deny "in-place edit"
  fi
  # (d) Mutating git subcommands. Read-only git (log, show, diff) stays allowed
  #     so the archive remains queryable as the audit record it exists to be.
  if printf '%s' "$CMD_1L" | grep -Eq '(^|[|;&(]|[[:space:]])git[[:space:]]+(-[^[:space:]]+[[:space:]]+)*(checkout|restore|rm|mv|apply|clean|stash)([[:space:]]|$)'; then
    deny "mutating git subcommand"
  fi
fi

# (e) `cd` into an archive directory followed by any write indicator, which
#     defeats rules (a)-(d) because the archived path never appears in the
#     write itself: `cd data/archive && cat > league-results.json`.
if printf '%s' "$CMD_1L" | grep -Eq '(^|[|;&(]|[[:space:]])cd[[:space:]]+["'"'"']?[^[:space:];|&"'"'"']*archive'; then
  if printf '%s' "$CMD_1L" | grep -Eq '>' \
  || printf '%s' "$CMD_1L" | grep -Eq '(^|[|;&(]|[[:space:]])(tee|cp|mv|rsync|install|ln|rm|rmdir|unlink|shred|truncate|touch|mkdir|chmod|chown|chgrp|patch|dd|find)([[:space:]]|$)'; then
    deny "write after cd into an archive directory"
  fi
fi

exit 0
