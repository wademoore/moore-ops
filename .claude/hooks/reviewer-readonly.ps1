$raw = [Console]::In.ReadToEnd()
try { $j = $raw | ConvertFrom-Json } catch { exit 2 }

$cmd = ($j.tool_input.command).Trim()
if (-not $cmd) { exit 2 }

# Allowlist is prefix-anchored: without this, a permitted prefix carries any payload.
if ($cmd -match '[;&|><`]' -or $cmd -match '\$\(') {
  [Console]::Error.WriteLine("Reviewer is read-only. Shell composition (; && || | > >> backtick and command substitution) is not permitted. Run one plain command at a time, or use the Read/Grep/Glob tools.")
  exit 2
}

$allowed = @(
  "^npm (test|run [a-z:-]+)$",
  "^node( --[a-z-]+)* --test",
  "^git (diff|log|show|status|rev-parse|ls-files|branch)\b",
  "^(grep|rg|findstr)\b",
  "^(cat|head|tail|wc|ls|dir)\b",
  "^(Get-Content|Get-ChildItem|Select-String|Measure-Object)\b"
)

foreach ($p in $allowed) {
  if ($cmd -match $p) { exit 0 }
}

[Console]::Error.WriteLine("Reviewer is read-only. Command not on the allowlist: $cmd`nAllowed: npm test/run, node --test, git diff/log/show/status/rev-parse/ls-files/branch, grep/rg/findstr, cat/head/tail/wc/ls/dir, Get-Content/Get-ChildItem/Select-String. Report the limitation instead of working around it.")
exit 2

