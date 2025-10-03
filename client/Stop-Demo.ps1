<#
  Stop-Demo.ps1
  - Kills the processes recorded by Start-Demo.ps1
#>

function Write-Info($msg){ Write-Host $msg -ForegroundColor Cyan }
function Write-Ok($msg){ Write-Host $msg -ForegroundColor Green }
function Write-Warn($msg){ Write-Host $msg -ForegroundColor Yellow }

$stateFile = Join-Path $env:TEMP "taedal-demo-state.json"
if (-not (Test-Path $stateFile)) {
  Write-Warn "No state file found. You may need to close windows manually."
  exit 0
}

try {
  $st = Get-Content $stateFile -Raw | ConvertFrom-Json
} catch {
  Write-Warn "Could not read state file. You may need to close windows manually."
  exit 0
}

foreach ($pid in @($st.serverPid, $st.tunnelPid, $st.clientPid)) {
  if ($pid -and (Get-Process -Id $pid -ErrorAction SilentlyContinue)) {
    try { Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue } catch {}
  }
}
Remove-Item $stateFile -Force -ErrorAction SilentlyContinue | Out-Null
Write-Ok "Stopped server, tunnel, and client."
