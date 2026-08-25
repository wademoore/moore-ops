#!/bin/bash
# PreToolUse hook (Edit|Write): refuse writes to archived data/script files.
# Claude Code passes the hook payload on stdin; exit 2 blocks the tool call and
# surfaces stderr to the model. See CLAUDE.md "current vs. archived" guard rail.
INPUT=$(cat)
FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

case "$FILE" in
  */data/archive/*|*/scripts/archive/*|data/archive/*|scripts/archive/*)
    echo "BLOCKED: $FILE is archived. Use the -v2 file. See CLAUDE.md." >&2
    exit 2
    ;;
esac
exit 0
