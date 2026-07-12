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
$skillsSrc = Join-Path $repoRoot "skills"

$skills = @("moore-ops-updater", "moore-ops-weekly-review", "walmart-cart", "waves-champs-qualifier", "waves-team-record-check", "waves-weekly-check")

foreach ($skill in $skills) {
    $src = Join-Path $skillsSrc $skill
    $dest = Join-Path $skillsDest $skill
    try {
        Copy-Item -Path $src -Destination $dest -Recurse -Force
        Write-Host "OK: $skill"
    } catch {
        Write-Host "FAIL: $skill - $_"
    }
}