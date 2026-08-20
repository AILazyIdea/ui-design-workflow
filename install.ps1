# ui-design-workflow 一键安装/自检脚本（Windows，PowerShell）
# 作用：检测 Node.js >= 20；缺失或过旧时尝试用 winget 自动安装；然后跑自检。
# 用法：powershell -ExecutionPolicy Bypass -File install.ps1
$ErrorActionPreference = "Stop"
$NODE_MIN = 20
Set-Location $PSScriptRoot

function Write-Step([string]$msg) { Write-Host $msg -ForegroundColor Cyan }
function Write-Ok([string]$msg)   { Write-Host $msg -ForegroundColor Green }
function Write-Warn([string]$msg) { Write-Host $msg -ForegroundColor Red }

function Get-NodeMajor {
  try { return [int](& node -e "process.stdout.write(String(process.versions.node.split('.')[0]))" 2>$null) } catch { return 0 }
}

function Test-Node {
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) { return $false }
  return (Get-NodeMajor -ge $NODE_MIN)
}

function Refresh-NodePath {
  # winget 装完当前会话可能没刷新 PATH；补常见安装位置
  $candidates = @("$env:ProgramFiles\nodejs", "$env:LOCALAPPDATA\Programs\nodejs")
  foreach ($c in $candidates) {
    if (Test-Path (Join-Path $c "node.exe")) { $env:Path = "$c;$env:Path"; return }
  }
}

Write-Step "== ui-design-workflow 安装自检 =="

if (Test-Node) {
  Write-Ok "已检测到 Node $(node -v)（要求 >= $NODE_MIN）"
} else {
  if (Get-Command node -ErrorAction SilentlyContinue) {
    Write-Warn "当前 Node $(node -v) 低于 $NODE_MIN，需要升级。"
  } else {
    Write-Warn "未检测到 Node.js，尝试用 winget 自动安装 …"
  }
  if (Get-Command winget -ErrorAction SilentlyContinue) {
    winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
    Refresh-NodePath
  } else {
    Write-Warn "未找到 winget。请到 https://nodejs.org/ 手动安装 Node $NODE_MIN+ 后重跑本脚本。"
    exit 1
  }
  if (Test-Node) { Write-Ok "Node $(node -v) 已就绪。" }
  else {
    Write-Warn "Node 安装未完成。请到 https://nodejs.org/ 手动安装后重跑本脚本。"
    exit 1
  }
}

Write-Step "运行自检（离线，无需 npm install）…"
node handoff/verify-handoff.mjs
if ($LASTEXITCODE -ne 0) { Write-Warn "verify-handoff 未通过" }
node scripts/check-skill.mjs
if ($LASTEXITCODE -ne 0) { Write-Warn "skill 校验未通过" }
node --test test/core.test.mjs test/mcp.test.mjs
if ($LASTEXITCODE -ne 0) { Write-Warn "核心测试未通过" }

Write-Ok "安装完成。快速上手见 README「快速开始」；一键全自动优化见 handoff/AUTO-OPTIMIZE-PROMPT.md。"
