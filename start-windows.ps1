# One-click Windows launcher: ensure Cursor has CDP, then run the public relay.
# Double-click start-windows.bat (preferred), or run this from system PowerShell.
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

$Port = if ($env:CDP_PORT) { $env:CDP_PORT } else { 9222 }
$NodeDir = 'C:\Program Files\nodejs'
if ((Test-Path (Join-Path $NodeDir 'node.exe')) -and ($env:Path -notlike "*${NodeDir}*")) {
  $env:Path = "$NodeDir;" + $env:Path
}

function Test-Cdp {
  try {
    Invoke-RestMethod -Uri "http://127.0.0.1:$Port/json/version" -TimeoutSec 1 | Out-Null
    $true
  } catch {
    $false
  }
}

function Pause-Exit([int]$Code = 1) {
  Write-Host ''
  Read-Host '按回车退出'
  exit $Code
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host '找不到 node。请先安装 Node.js 22+：https://nodejs.org/'
  Pause-Exit
}

if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
  Write-Host '找不到 cloudflared。外网访问需要它：'
  Write-Host '  https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/'
  Pause-Exit
}

if (-not (Test-Path (Join-Path $Root 'node_modules'))) {
  Write-Host '首次运行：正在 npm install ...'
  npm install
  if ($LASTEXITCODE -ne 0) { Pause-Exit }
}

if (Test-Cdp) {
  Write-Host "调试端口 $Port 已就绪，跳过重启 Cursor。"
} else {
  Write-Host '正在用调试端口启动 Cursor（会先退出当前 Cursor）...'
  & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Root 'start-cursor.ps1')
  if (-not (Test-Cdp)) {
    Write-Host '等待 Cursor 打开调试端口...'
    $ok = $false
    for ($i = 0; $i -lt 45; $i++) {
      Start-Sleep -Seconds 1
      if (Test-Cdp) { $ok = $true; break }
    }
    if (-not $ok) {
      Write-Host "Cursor 调试端口 $Port 未就绪。可手动再跑一次 start-cursor.ps1。"
      Pause-Exit
    }
  }
  Write-Host "Cursor 已就绪（端口 $Port）。"
}

Write-Host ''
Write-Host '中继启动中。请保持本窗口开着；关掉 = 手机断开。'
Write-Host '配对手机请另开系统 PowerShell 运行：npm run pair'
Write-Host ''
npm run public
if ($LASTEXITCODE -ne 0) { Pause-Exit $LASTEXITCODE }
