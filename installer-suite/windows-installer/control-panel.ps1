param(
  [string]$ExtensionPath = "$PSScriptRoot\extension",
  [string]$AgentExe = "$PSScriptRoot\agent\SBManifestAgent.exe",
  [int]$AgentPort = 17321
)

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

function Test-AgentRunning {
  $p = Get-CimInstance Win32_Process -Filter "Name='SBManifestAgent.exe'" -ErrorAction SilentlyContinue
  if (-not $p) { return $false }
  return $p | Where-Object { $_.ExecutablePath -eq $AgentExe } | Measure-Object | Select-Object -ExpandProperty Count | ForEach-Object { $_ -gt 0 }
}

function Start-Agent {
  if (!(Test-Path $AgentExe)) {
    [System.Windows.Forms.MessageBox]::Show("Agent EXE not found: $AgentExe", "SB Manifest", 'OK', 'Error') | Out-Null
    return
  }

  if (Test-AgentRunning) {
    [System.Windows.Forms.MessageBox]::Show("Agent is already running.", "SB Manifest", 'OK', 'Information') | Out-Null
    return
  }

  Start-Process -FilePath $AgentExe | Out-Null
  Start-Sleep -Milliseconds 800
}

function Stop-Agent {
  $procs = Get-CimInstance Win32_Process -Filter "Name='SBManifestAgent.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.ExecutablePath -eq $AgentExe }

  if (-not $procs) {
    [System.Windows.Forms.MessageBox]::Show("Agent is not running.", "SB Manifest", 'OK', 'Information') | Out-Null
    return
  }

  foreach ($proc in $procs) {
    Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
  }
}

function Install-Extension {
  if (!(Test-Path $ExtensionPath)) {
    [System.Windows.Forms.MessageBox]::Show("Extension folder not found: $ExtensionPath", "SB Manifest", 'OK', 'Error') | Out-Null
    return
  }

  Start-Process "chrome://extensions/" -ErrorAction SilentlyContinue
  Start-Process "edge://extensions/" -ErrorAction SilentlyContinue
  Start-Process "explorer.exe" -ArgumentList $ExtensionPath | Out-Null

  [System.Windows.Forms.MessageBox]::Show(
    "1) Turn on Developer mode.`n2) Click Load unpacked.`n3) Select:`n$ExtensionPath",
    "Install Extension",
    'OK',
    'Information'
  ) | Out-Null
}

function Remove-Extension {
  if (!(Test-Path $ExtensionPath)) {
    [System.Windows.Forms.MessageBox]::Show("Extension folder already missing.", "SB Manifest", 'OK', 'Information') | Out-Null
    return
  }

  $confirm = [System.Windows.Forms.MessageBox]::Show(
    "Remove local extension files?`n`n$ExtensionPath",
    "Confirm Remove",
    'YesNo',
    'Warning'
  )

  if ($confirm -eq [System.Windows.Forms.DialogResult]::Yes) {
    Remove-Item -Path $ExtensionPath -Recurse -Force
    [System.Windows.Forms.MessageBox]::Show("Extension files removed.", "SB Manifest", 'OK', 'Information') | Out-Null
  }
}

function Get-HealthText {
  $extOk = (Test-Path (Join-Path $ExtensionPath 'manifest.json')) -and (Test-Path (Join-Path $ExtensionPath 'content.js'))
  $agentRunning = Test-AgentRunning

  $agentApi = $false
  try {
    $resp = Invoke-RestMethod -Uri "http://localhost:$AgentPort/health" -Method Get -TimeoutSec 2
    $agentApi = $resp.status -eq 'ok'
  } catch {}

  return @(
    "Extension path: $ExtensionPath",
    "Extension files: " + ($(if ($extOk) { 'OK' } else { 'MISSING' })),
    "Agent EXE: $AgentExe",
    "Agent process: " + ($(if ($agentRunning) { 'RUNNING' } else { 'STOPPED' })),
    "Agent API (/health): " + ($(if ($agentApi) { 'OK' } else { 'NO RESPONSE' })),
    "",
    "Working means:",
    "- Extension files OK",
    "- Agent process RUNNING",
    "- Agent API OK"
  ) -join "`r`n"
}

$form = New-Object System.Windows.Forms.Form
$form.Text = 'SB Manifest Control Panel'
$form.StartPosition = 'CenterScreen'
$form.Size = New-Object System.Drawing.Size(760, 520)
$form.MaximizeBox = $false

$title = New-Object System.Windows.Forms.Label
$title.Text = 'SB Manifest Installer Control Panel'
$title.Font = New-Object System.Drawing.Font('Segoe UI', 14, [System.Drawing.FontStyle]::Bold)
$title.AutoSize = $true
$title.Location = New-Object System.Drawing.Point(20, 20)
$form.Controls.Add($title)

$btnInstall = New-Object System.Windows.Forms.Button
$btnInstall.Text = 'Install / Reconnect Extension'
$btnInstall.Size = New-Object System.Drawing.Size(220, 36)
$btnInstall.Location = New-Object System.Drawing.Point(20, 70)
$btnInstall.Add_Click({ Install-Extension; $txtStatus.Text = Get-HealthText })
$form.Controls.Add($btnInstall)

$btnRemove = New-Object System.Windows.Forms.Button
$btnRemove.Text = 'Remove Extension Files'
$btnRemove.Size = New-Object System.Drawing.Size(220, 36)
$btnRemove.Location = New-Object System.Drawing.Point(260, 70)
$btnRemove.Add_Click({ Remove-Extension; $txtStatus.Text = Get-HealthText })
$form.Controls.Add($btnRemove)

$btnStart = New-Object System.Windows.Forms.Button
$btnStart.Text = 'Start Agent'
$btnStart.Size = New-Object System.Drawing.Size(110, 36)
$btnStart.Location = New-Object System.Drawing.Point(500, 70)
$btnStart.Add_Click({ Start-Agent; $txtStatus.Text = Get-HealthText })
$form.Controls.Add($btnStart)

$btnStop = New-Object System.Windows.Forms.Button
$btnStop.Text = 'Stop Agent'
$btnStop.Size = New-Object System.Drawing.Size(110, 36)
$btnStop.Location = New-Object System.Drawing.Point(620, 70)
$btnStop.Add_Click({ Stop-Agent; $txtStatus.Text = Get-HealthText })
$form.Controls.Add($btnStop)

$btnCheck = New-Object System.Windows.Forms.Button
$btnCheck.Text = 'Run Health Check'
$btnCheck.Size = New-Object System.Drawing.Size(180, 34)
$btnCheck.Location = New-Object System.Drawing.Point(20, 120)
$btnCheck.Add_Click({ $txtStatus.Text = Get-HealthText })
$form.Controls.Add($btnCheck)

$txtStatus = New-Object System.Windows.Forms.TextBox
$txtStatus.Multiline = $true
$txtStatus.ScrollBars = 'Vertical'
$txtStatus.ReadOnly = $true
$txtStatus.Font = New-Object System.Drawing.Font('Consolas', 10)
$txtStatus.Location = New-Object System.Drawing.Point(20, 170)
$txtStatus.Size = New-Object System.Drawing.Size(710, 290)
$form.Controls.Add($txtStatus)

$txtStatus.Text = Get-HealthText
[void]$form.ShowDialog()
