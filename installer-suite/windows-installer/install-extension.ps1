param(
  [string]$ExtensionPath
)

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$panel = Join-Path $scriptRoot 'control-panel.ps1'

if (Test-Path $panel) {
  powershell -ExecutionPolicy Bypass -File $panel -ExtensionPath $ExtensionPath
  exit $LASTEXITCODE
}

if (-not (Test-Path $ExtensionPath)) {
  Write-Host "Extension folder not found: $ExtensionPath"
  exit 1
}

Write-Host "Control panel script missing, fallback mode: open extension setup pages"
Start-Process "chrome://extensions/"
Start-Process "edge://extensions/"
Start-Process $ExtensionPath
