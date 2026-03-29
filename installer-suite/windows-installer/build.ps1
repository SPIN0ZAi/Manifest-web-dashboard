$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$agent = Join-Path $root 'agent'
$ext = Join-Path $root 'extension'
$installer = Join-Path $root 'windows-installer'
$payloadExt = Join-Path $installer 'payload\extension'

Write-Host '1) Building agent exe with pkg...'
Push-Location $agent
npm install
if ($LASTEXITCODE -ne 0) { throw "npm install failed in agent" }
npm run build:exe
if ($LASTEXITCODE -ne 0) { throw "Agent EXE build failed. Ensure pkg target is supported." }
Pop-Location

Write-Host '2) Copying extension payload...'
if (Test-Path $payloadExt) { Remove-Item $payloadExt -Recurse -Force }
New-Item -ItemType Directory -Path $payloadExt | Out-Null
Copy-Item (Join-Path $ext '*') $payloadExt -Recurse -Force

Write-Host '3) Building final one-file installer (Inno Setup)...'
$possible = @(
  "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
  "${env:ProgramFiles}\Inno Setup 6\ISCC.exe"
)

$iscc = $possible | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $iscc) {
  $portable = Join-Path $installer 'portable-package'
  if (Test-Path $portable) { Remove-Item $portable -Recurse -Force }
  New-Item -ItemType Directory -Path $portable | Out-Null
  Copy-Item (Join-Path $installer 'bin') (Join-Path $portable 'bin') -Recurse -Force
  Copy-Item (Join-Path $installer 'payload') (Join-Path $portable 'payload') -Recurse -Force
  Copy-Item (Join-Path $installer 'install-extension.ps1') (Join-Path $portable 'install-extension.ps1') -Force

  Write-Warning 'Inno Setup compiler not found. Skipping setup EXE generation.'
  Write-Host "Portable package created at: $portable"
  Write-Host 'Install Inno Setup 6 to generate SBManifestSetup.exe later.'
  exit 0
}

Push-Location $installer
& $iscc '.\SBManifestInstaller.iss'
if ($LASTEXITCODE -ne 0) { throw "Inno Setup build failed" }
Pop-Location

Write-Host 'Done. Output: windows-installer\SBManifestSetup.exe'
