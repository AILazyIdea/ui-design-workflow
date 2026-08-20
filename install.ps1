# ui-design-workflow 安装/自检脚本（Windows，PowerShell）
# 默认只检测与自检。Node.js 缺失或过旧时，必须由用户明确同意才会安装。
[CmdletBinding()]
param(
  [switch]$InstallNode,
  [switch]$Yes
)

$ErrorActionPreference = 'Stop'
# 已有 Node 20+ 仍可运行本项目；新安装使用 winget 提供的当前 LTS。
# 请在当前 LTS 即将 EOL 前更新此提示值，并同步 Bash 脚本、README 和测试。
$NODE_MIN = 20
$NODE_RECOMMENDED_LTS = 24
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

function Test-InteractiveTerminal {
  return [Environment]::UserInteractive -and -not [Console]::IsInputRedirected -and -not [Console]::IsOutputRedirected
}

function Refresh-NodePath {
  $candidates = @("$env:ProgramFiles\nodejs", "$env:LOCALAPPDATA\Programs\nodejs")
  foreach ($candidate in $candidates) {
    if (Test-Path (Join-Path $candidate 'node.exe')) {
      $env:Path = "$candidate;$env:Path"
      return
    }
  }
}

function Get-InstallPlan {
  if (Get-Command winget -ErrorAction SilentlyContinue) {
    return @{ Method = 'winget'; Detail = "将通过 Windows Package Manager 安装当前 Node.js LTS（目前为 Node $NODE_RECOMMENDED_LTS）。Windows 可能要求你再次确认软件源和许可证。" }
  }
  return $null
}

function Confirm-NodeInstallation($Plan) {
  if ($InstallNode -and $Yes) { return $true }
  if (-not (Test-InteractiveTerminal)) {
    Write-Warn '当前不是交互式终端，已拒绝自动安装。请先手动安装 Node，或在确认允许后使用：powershell -File install.ps1 -InstallNode -Yes'
    return $false
  }
  Write-Host ''
  Write-Host "未检测到 Node.js $NODE_MIN 或更高版本。"
  Write-Host $Plan.Detail
  Write-Host '不会读取项目文件、上传数据或安装本项目的 npm 依赖。'
  $answer = Read-Host '是否继续自动安装？[y/N]'
  return $answer -match '^(?i:y|yes)$'
}

function Install-Node($Plan) {
  if ($Plan.Method -ne 'winget') { throw "未找到可用的自动安装方式。请从 https://nodejs.org/ 手动安装当前 LTS（目前为 Node $NODE_RECOMMENDED_LTS）；Node $NODE_MIN 或更高版本可运行本项目。" }
  Write-Step '使用 Windows Package Manager 安装 Node.js LTS…'
  $arguments = @('install', '-e', '--id', 'OpenJS.NodeJS.LTS')
  if ($Yes) {
    # -Yes 是显式的无交互授权；交互式安装仍保留 winget 自身的协议确认。
    $arguments += @('--accept-source-agreements', '--accept-package-agreements')
  }
  & winget @arguments
  if ($LASTEXITCODE -ne 0) { throw "winget 安装失败，退出码：$LASTEXITCODE" }
  Refresh-NodePath
  if (-not (Test-Node)) { throw 'Node 安装后仍未检测到 Node 20 或更高版本。请重新打开终端后再运行本脚本。' }
}

function Invoke-RequiredCheck([string]$Name, [string[]]$NodeArgs) {
  Write-Step "${Name}…"
  & node @NodeArgs
  if ($LASTEXITCODE -ne 0) { throw "${Name}失败，安装未完成。" }
  Write-Ok "${Name}通过。"
}

if ($Yes -and -not $InstallNode) {
  Write-Warn '-Yes 只能与 -InstallNode 一起使用，避免误触发环境安装。'
  exit 2
}

try {
  Write-Step '== ui-design-workflow 安装自检 =='
  if (Test-Node) {
    Write-Ok "已检测到 Node $(node -v)（要求 >= $NODE_MIN）"
  } else {
    if (Get-Command node -ErrorAction SilentlyContinue) {
      Write-Warn "当前 Node $(node -v) 低于 $NODE_MIN，需要升级。"
    } else {
      Write-Warn '未检测到 Node.js。'
    }
    $plan = Get-InstallPlan
    if ($null -eq $plan) { throw "未找到可用的自动安装方式。请从 https://nodejs.org/ 手动安装当前 LTS（目前为 Node $NODE_RECOMMENDED_LTS）；Node $NODE_MIN 或更高版本可运行本项目。" }
    if (-not (Confirm-NodeInstallation $plan)) {
      Write-Warn '已取消安装，未对机器做任何修改。'
      exit 2
    }
    Install-Node $plan
    Write-Ok "Node $(node -v) 已就绪。"
  }

  Invoke-RequiredCheck '运行交接包自检' @('handoff/verify-handoff.mjs')
  Invoke-RequiredCheck '校验 Skill' @('scripts/check-skill.mjs')
  Invoke-RequiredCheck '运行核心测试' @('--test', 'test/core.test.mjs', 'test/mcp.test.mjs', 'test/installer.test.mjs')
  Write-Ok '安装与自检均已完成。快速上手见 README。'
} catch {
  Write-Warn $_.Exception.Message
  exit 1
}
