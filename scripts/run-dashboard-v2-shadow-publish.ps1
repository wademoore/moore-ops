param(
  [Parameter(Mandatory = $true)][string]$CredentialsPath,
  [Parameter(Mandatory = $true)][string]$TokenPath
)

$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$identityPath = 'C:\Users\wadem\.ssh\moore_ops_pi'

foreach ($path in @($CredentialsPath, $TokenPath, $identityPath)) {
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { exit 2 }
}

$env:MOORE_OPS_CREDENTIALS_PATH = [IO.Path]::GetFullPath($CredentialsPath)
$env:MOORE_OPS_TOKEN_PATH = [IO.Path]::GetFullPath($TokenPath)
$env:GOOGLE_AUTH_READ_ONLY = '1'

Push-Location -LiteralPath $root
try {
  & npm.cmd run publish:dashboard-v2:now-next
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
