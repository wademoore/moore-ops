$raw = [Console]::In.ReadToEnd()
try { $j = $raw | ConvertFrom-Json } catch { exit 2 }
$cmd = ($j.tool_input.command).Trim()
if (-not $cmd) { exit 2 }

if ($cmd -match '[;&|><`]' -or $cmd -match '\$\(') {
  [Console]::Error.WriteLine("Debugger is read-only. Shell composition is not permitted. Run one plain command at a time.")
  exit 2
}

$allowed = @(
  "^npm (test|run [a-z:-]+)$",
  "^node( --[a-z-]+)* --test",
  "^node -e ",
  "^git (diff|log|show|status|rev-parse|ls-files|ls-tree|branch|blame)\b",
  "^(grep|rg|findstr)\b",
  "^(cat|head|tail|wc|ls|dir)\b",
  "^(Get-Content|Get-ChildItem|Select-String|Measure-Object|Test-Path)\b",
  "^aws (logs|lambda) (describe|get|list|tail|filter)"
)

foreach ($p in $allowed) { if ($cmd -match $p) { exit 0 } }

[Console]::Error.WriteLine("Debugger is read-only. Not on the allowlist: $cmd`nReport the limitation instead of working around it.")
exit 2
