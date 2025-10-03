<# Start-Demo.ps1 — launches API + Cloudflare Tunnel for demo #>

param(
  [string]$ServerPath = "C:\Users\User\Downloads\taedal-project\server",
  [string]$ClientPath = "C:\Users\User\Downloads\taedal-project\client",
  [switch]$FixDNS
)

$ErrorActionPreference = "Stop"

function Write-Info($msg) { Write-Host $msg -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host $msg -ForegroundColor Green }
function Write-Err($msg)  { Write-Host $msg -ForegroundColor Red }

# --- Optional DNS hardening for flaky Wi-Fi ---
if ($FixDNS) {
  try {
    Write-Info "[DNS] Setting Wi-Fi DNS to 1.1.1.1 / 1.0.0.1 ..."
    $wifi = Get-DnsClientServerAddress | Where-Object { $_.InterfaceAlias -match 'Wi-?Fi' -and $_.ServerAddresses }
    if ($wifi) {
      Set-DnsClientServerAddress -InterfaceIndex $wifi.InterfaceIndex -ServerAddresses ("1.1.1.1","1.0.0.1") | Out-Null
      Write-Ok "[DNS] Wi-Fi DNS updated."
    } else {
      Write-Info "[DNS] No Wi-Fi adapter with DNS set found; skipping."
    }
  } catch {
    Write-Err "[DNS] Could not set DNS (need admin?): $($_.Exception.Message)"
  }
}

# --- Paths / temp files ---
$demoDir   = Join-Path $ClientPath ".demo"
$tunnelOut = Join-Path $demoDir "cloudflared-out.txt"
$tunnelErr = Join-Path $demoDir "cloudflared-err.txt"
$serverPid = Join-Path $demoDir "server.pid"
$tunnelPid = Join-Path $demoDir "tunnel.pid"
$urlFile   = Join-Path $demoDir "public-url.txt"

New-Item -ItemType Directory -Force -Path $demoDir | Out-Null
Remove-Item -ErrorAction SilentlyContinue $tunnelOut, $tunnelErr, $serverPid, $tunnelPid, $urlFile

# --- Start API server with tunnel-friendly cookies ---
$env:USE_TUNNEL    = "1"
$env:FRONTEND_BASE = "http://localhost:3000"

Write-Info "[SERVER] Starting API (USE_TUNNEL=$($env:USE_TUNNEL), FRONTEND_BASE=$($env:FRONTEND_BASE)) ..."
$serverPS = Start-Process powershell `
  -ArgumentList @(
    "-NoProfile","-ExecutionPolicy","Bypass","-Command",
    "cd `"$ServerPath`"; npm start"
  ) `
  -PassThru -WindowStyle Minimized
$serverPS.Id | Out-File -Encoding ascii $serverPid

# --- Wait for healthz ---
Write-Info "[SERVER] Waiting for http://localhost:5000/healthz ..."
$healthy = $false
for ($i=1; $i -le 60; $i++) {
  try {
    $res = Invoke-WebRequest -Uri "http://localhost:5000/healthz" -UseBasicParsing -TimeoutSec 2
    if ($res.StatusCode -eq 200) { $healthy = $true; break }
  } catch { Start-Sleep -Seconds 1 }
}
if (-not $healthy) {
  Write-Err "[SERVER] API did not become healthy in time."
  exit 1
}
Write-Ok "[SERVER] API healthy."

# --- Launch cloudflared (NOTE: stdout and stderr go to DIFFERENT files) ---
Write-Info "[TUNNEL] Launching cloudflared quick tunnel to http://localhost:5000 ..."
$tunnelPS = Start-Process cloudflared `
  -ArgumentList @("tunnel","--url","http://localhost:5000") `
  -PassThru -WindowStyle Minimized `
  -RedirectStandardOutput $tunnelOut `
  -RedirectStandardError  $tunnelErr
$tunnelPS.Id | Out-File -Encoding ascii $tunnelPid

# --- Wait for public URL to appear in stdout ---
Write-Info "[TUNNEL] Waiting for public URL ..."
$PublicURL = $null
for ($i=1; $i -le 60; $i++) {
  if (Test-Path $tunnelOut) {
    $txt = Get-Content $tunnelOut -Raw
    if ($txt -match 'https://[a-z0-9-]+\.trycloudflare\.com') {
      $PublicURL = $Matches[0]
      break
    }
  }
  Start-Sleep -Milliseconds 800
}

if (-not $PublicURL) {
  Write-Err "[TUNNEL] Could not detect public URL. Check logs:"
  Write-Host "  $tunnelOut"
  Write-Host "  $tunnelErr"
  exit 1
}

$PublicURL | Out-File -Encoding ascii $urlFile
Write-Ok "[TUNNEL] Public URL: $PublicURL"
Write-Host ""
Write-Host "Use this in your client .env as REACT_APP_API_BASE:" -ForegroundColor Yellow
Write-Host "  $PublicURL" -ForegroundColor Yellow
Write-Host ""
Write-Host "When you’re done: .\Stop-Demo.ps1" -ForegroundColor DarkCyan
