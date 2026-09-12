# Copies this repo's skills into the Claude Code plugin path.
# Source of truth for skill content: .claude/skills/ (one directory per skill).
# See CLAUDE.md, "Skills". Windows/PowerShell only: $env:LOCALAPPDATA below.
#
# The plugin directory in the $pluginParent assignment below is hardcoded, INCLUDING
# its UUID. Only the session folder immediately beneath it is auto-detected. If the
# UUID rotates, edit $pluginParent by hand -- nothing detects that. (Named by variable
# rather than by position: CLAUDE.md's copy of this note used a line number and was
# falsified by the commit that added these very comment lines.)
$pluginParent = "$env:LOCALAPPDATA\Packages\Claude_pzs8sxrjxfjjc\LocalCache\Roaming\Claude\local-agent-mode-sessions\skills-plugin\601d1d47-d06e-4844-acb0-ca9a54af5b64"

if (-not (Test-Path $pluginParent)) {
    Write-Error "Claude skills plugin path not found: $pluginParent"
    exit 1
}

$sessionFolders = @(Get-ChildItem -Path $pluginParent -Directory)

if ($sessionFolders.Count -eq 0) {
    Write-Error "No session folder found under $pluginParent"
    exit 1
}

if ($sessionFolders.Count -gt 1) {
    Write-Error "Expected exactly one session folder but found $($sessionFolders.Count): $($sessionFolders.Name -join ', ')"
    exit 1
}

$skillsDest = Join-Path $sessionFolders[0].FullName "skills"
$repoRoot = $PSScriptRoot
$skillsSrc = Join-Path (Join-Path $repoRoot ".claude") "skills"

# Fail loudly rather than reporting OK for a copy that did nothing. Copy-Item's
# "cannot find path" is a NON-TERMINATING error, so an absent source used to sail
# past try/catch and still print OK for every name in the hardcoded list; these two
# guards, the per-skill empty-directory check in the loop, and -ErrorAction Stop are
# together what make a failure actually fail.
if (-not (Test-Path $skillsSrc)) {
    Write-Error "Skill source directory not found: $skillsSrc"
    exit 1
}

# Enumerated, never hardcoded: a literal list is a second copy of the directory
# listing and drifts from it. The previous hardcoded list had gone stale by four
# skills.
$skills = @(Get-ChildItem -Path $skillsSrc -Directory | Select-Object -ExpandProperty Name | Sort-Object)

if ($skills.Count -eq 0) {
    Write-Error "No skill directories found under $skillsSrc"
    exit 1
}

$failed = 0

foreach ($skill in $skills) {
    $src = Join-Path $skillsSrc $skill
    $dest = Join-Path $skillsDest $skill
    try {
        # An EMPTY source directory is the one residual of the silent-success bug: the
        # wildcard below matches nothing, which is not an ItemNotFound error, so
        # -ErrorAction Stop does not fire and the loop would print OK having copied
        # nothing. Verified under PowerShell 7.4.6. Check explicitly instead.
        if (-not (Get-ChildItem -Path $src -Force)) {
            throw "source directory is empty"
        }
        # Copy the CONTENTS into $dest, not $dest's parent. "Copy-Item $src -Destination
        # $dest -Recurse" nests <skill>/<skill>/ on any run where $dest already exists.
        New-Item -ItemType Directory -Force -Path $dest -ErrorAction Stop | Out-Null
        Copy-Item -Path (Join-Path $src '*') -Destination $dest -Recurse -Force -ErrorAction Stop
        Write-Host "OK: $skill"
    } catch {
        Write-Host "FAIL: $skill - $_"
        $failed++
    }
}

if ($failed -gt 0) {
    Write-Error "$failed of $($skills.Count) skill(s) failed to copy to $skillsDest"
    exit 1
}

Write-Host "Copied $($skills.Count) skill(s) to $skillsDest"
