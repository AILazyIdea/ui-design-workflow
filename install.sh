#!/usr/bin/env bash
# ui-design-workflow 安装/自检脚本（macOS / Linux，bash）
# 默认只检测与自检。Node.js 缺失或过旧时，必须由用户明确同意才会安装。
set -uo pipefail

NODE_MIN=20
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AUTO_INSTALL=0
ASSUME_YES=0

blue()  { printf '\033[1;34m%s\033[0m\n' "$*"; }
green() { printf '\033[1;32m%s\033[0m\n' "$*"; }
red()   { printf '\033[1;31m%s\033[0m\n' "$*" >&2; }

usage() {
  cat <<'EOF'
用法：bash install.sh [--install-node --yes]

默认行为：检测 Node.js，缺失或版本过低时在交互式终端询问是否安装。
非交互环境（CI、Agent、重定向输入）绝不会自行安装；如确有需要，必须显式传入：
  --install-node --yes
EOF
}

parse_args() {
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --install-node) AUTO_INSTALL=1 ;;
      --yes) ASSUME_YES=1 ;;
      -h|--help) usage; exit 0 ;;
      *) red "未知参数：$1"; usage >&2; exit 2 ;;
    esac
    shift
  done
  if [ "$ASSUME_YES" -eq 1 ] && [ "$AUTO_INSTALL" -ne 1 ]; then
    red "--yes 只能与 --install-node 一起使用，避免误触发环境安装。"
    exit 2
  fi
}

node_major() { node -e 'process.stdout.write(String(process.versions.node.split(".")[0]))' 2>/dev/null; }
have_node()  { command -v node >/dev/null 2>&1 && [ "$(node_major)" -ge "$NODE_MIN" ] 2>/dev/null; }
is_interactive() { [ -t 0 ] && [ -t 1 ]; }

load_nvm() {
  export NVM_DIR="$HOME/.nvm"
  [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" 2>/dev/null
}

choose_install_method() {
  if [ -s "$HOME/.nvm/nvm.sh" ]; then
    printf 'nvm'
  elif command -v brew >/dev/null 2>&1; then
    printf 'brew'
  elif command -v apt-get >/dev/null 2>&1; then
    printf 'apt'
  elif command -v curl >/dev/null 2>&1 && { [ "$(uname)" = 'Darwin' ] || [ "$(uname)" = 'Linux' ]; }; then
    printf 'nvm-bootstrap'
  else
    printf 'manual'
  fi
}

describe_install_method() {
  case "$1" in
    nvm)
      printf '%s\n' '将使用已有 nvm 安装 Node 20，仅在当前脚本进程中切换到该版本；不会修改 nvm 的默认 Node。'
      ;;
    brew)
      printf '%s\n' '将通过 Homebrew 安装 node@20，并只在当前脚本进程中加入该版本的路径；不会执行 brew link 或覆盖已有 Node。'
      ;;
    apt)
      printf '%s\n' '将下载 NodeSource 的安装配置脚本，并使用 sudo apt-get 安装 nodejs。这会修改系统级软件包。'
      ;;
    nvm-bootstrap)
      printf '%s\n' '将从 nvm 官方 GitHub 下载并执行固定版本的 nvm 安装脚本。它会创建 ~/.nvm，并可能更新你的 shell 配置；随后安装 Node 20，但不会修改 nvm 的默认 Node。'
      ;;
    *)
      printf '%s\n' '未找到可用的安装方式。请从 https://nodejs.org/ 手动安装 Node 20 或更高版本。'
      ;;
  esac
}

confirm_install() {
  local method="$1"
  if [ "$method" = 'manual' ]; then
    red '未对机器做任何修改。'
    return 2
  fi
  if [ "$AUTO_INSTALL" -eq 1 ] && [ "$ASSUME_YES" -eq 1 ]; then
    return 0
  fi
  if ! is_interactive; then
    red '当前不是交互式终端，已拒绝自动安装。请先手动安装 Node，或在确认允许后使用：bash install.sh --install-node --yes'
    return 2
  fi

  printf '\n未检测到 Node.js %s 或更高版本。\n' "$NODE_MIN"
  describe_install_method "$method"
  printf '%s\n' '不会读取项目文件、上传数据或安装本项目的 npm 依赖。'
  printf '是否继续自动安装？[y/N] '
  local answer=''
  IFS= read -r answer || answer=''
  case "$answer" in
    y|Y|yes|YES|Yes) return 0 ;;
    *) red '已取消安装，未对机器做任何修改。'; return 2 ;;
  esac
}

install_via_nvm() {
  load_nvm
  command -v nvm >/dev/null 2>&1 || { red 'nvm 加载失败。'; return 1; }
  blue "使用 nvm 安装 Node ${NODE_MIN}…"
  nvm install "$NODE_MIN" || { red 'nvm 安装 Node 失败。'; return 1; }
  nvm use "$NODE_MIN" || { red '无法在当前脚本中启用 Node。'; return 1; }
}

install_via_nvm_bootstrap() {
  local installer_file
  installer_file="$(mktemp "${TMPDIR:-/tmp}/ui-design-workflow-nvm.XXXXXX")" || { red '无法创建 nvm 临时安装文件。'; return 1; }
  blue '下载 nvm 0.39.7 安装脚本…'
  if ! curl -fsSL 'https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh' -o "$installer_file"; then
    rm -f "$installer_file"
    red 'nvm 安装脚本下载失败。'
    return 1
  fi
  if ! bash "$installer_file"; then
    rm -f "$installer_file"
    red 'nvm 安装失败。'
    return 1
  fi
  rm -f "$installer_file"
  install_via_nvm
}

install_via_brew() {
  blue "使用 Homebrew 安装 node@${NODE_MIN}…"
  brew install "node@${NODE_MIN}" || { red 'Homebrew 安装失败。'; return 1; }
  local brew_node
  brew_node="$(brew --prefix "node@${NODE_MIN}")" || { red '无法确定 node@20 的安装位置。'; return 1; }
  if [ -x "$brew_node/bin/node" ]; then
    export PATH="$brew_node/bin:$PATH"
  fi
  have_node || { red 'Homebrew 已执行，但当前脚本仍找不到 Node 20。'; return 1; }
}

install_via_apt() {
  local installer_file
  installer_file="$(mktemp "${TMPDIR:-/tmp}/ui-design-workflow-nodesource.XXXXXX")" || { red '无法创建 NodeSource 临时安装文件。'; return 1; }
  blue "下载 NodeSource 的 Node ${NODE_MIN} 配置脚本…"
  if ! curl -fsSL "https://deb.nodesource.com/setup_${NODE_MIN}.x" -o "$installer_file"; then
    rm -f "$installer_file"
    red 'NodeSource 配置脚本下载失败。'
    return 1
  fi
  if ! sudo -E bash "$installer_file"; then
    rm -f "$installer_file"
    red 'NodeSource 配置失败。'
    return 1
  fi
  rm -f "$installer_file"
  blue '使用 apt 安装 nodejs…'
  sudo apt-get install -y nodejs || { red 'apt 安装失败。'; return 1; }
  hash -r
  have_node || { red 'apt 已执行，但当前脚本仍找不到 Node 20。'; return 1; }
}

install_node() {
  case "$1" in
    nvm) install_via_nvm ;;
    nvm-bootstrap) install_via_nvm_bootstrap ;;
    brew) install_via_brew ;;
    apt) install_via_apt ;;
    *) return 1 ;;
  esac
}

run_required_check() {
  local label="$1"
  shift
  blue "${label}…"
  if "$@"; then
    green "${label}通过。"
  else
    red "${label}失败，安装未完成。"
    return 1
  fi
}

run_self_checks() {
  run_required_check '运行交接包自检' node handoff/verify-handoff.mjs || return 1
  run_required_check '校验 Skill' node scripts/check-skill.mjs || return 1
  run_required_check '运行核心测试' node --test test/core.test.mjs test/mcp.test.mjs test/installer.test.mjs || return 1
}

main() {
  parse_args "$@"
  cd "$HERE"
  blue '== ui-design-workflow 安装自检 =='

  if have_node; then
    green "已检测到 Node $(node -v)（要求 >= ${NODE_MIN}）"
  else
    if command -v node >/dev/null 2>&1; then
      red "当前 Node $(node -v) 低于 ${NODE_MIN}，需要升级。"
    else
      red '未检测到 Node.js。'
    fi
    local method
    method="$(choose_install_method)"
    confirm_install "$method"
    local confirmation_status=$?
    if [ "$confirmation_status" -ne 0 ]; then
      exit "$confirmation_status"
    fi
    install_node "$method" || { red 'Node 安装未完成。请处理上方错误后重试，或手动安装 Node 20+。'; exit 1; }
    have_node || { red '安装后仍未检测到 Node 20+。'; exit 1; }
    green "Node $(node -v) 已就绪。"
  fi

  run_self_checks || exit 1
  green '安装与自检均已完成。快速上手见 README。'
}

main "$@"
