$raw = [Console]::In.ReadToEnd()
try { $j = $raw | ConvertFrom-Json } catch { exit 0 }

$cmd = $j.tool_input.command
if (-not $cmd) { exit 0 }
if ($cmd -notmatch "git\s+push") { exit 0 }

$dir = $j.cwd
if (-not $dir) { $dir = $env:CLAUDE_PROJECT_DIR }
$branch = (git -C "$dir" rev-parse --abbrev-ref HEAD 2>$null)

if ($cmd -match "\bmain\b" -or $branch -eq "main") {
  [Console]::Error.WriteLine("Blocked: pushes to main are not permitted. Commit to a branch and open a PR.")
  exit 2
}
exit 0
