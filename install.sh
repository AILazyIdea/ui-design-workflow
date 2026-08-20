#!/usr/bin/env bash
# ui-design-workflow 一键安装/自检脚本（macOS / Linux，bash）
# 作用：检测 Node.js >= 20；缺失或过旧时尝试自动安装；然后跑自检。
# 全部离线完成（仅自动安装 Node 时需要联网），不需要 npm install、不需要编译。
set -uo pipefail

NODE_MIN=20
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

blue()  { printf '\033[1;34m%s\033[0m\n' "$*"; }
green() { printf '\033[1;32m%s\033[0m\n' "$*"; }
red()   { printf '\033[1;31m%s\033[0m\n' "$*" >&2; }

node_major() { node -e 'process.stdout.write(String(process.versions.node.split(".")[0]))' 2>/dev/null; }
have_node()  { command -v node >/dev/null 2>&1 && [ "$(node_major)" -ge "$NODE_MIN" ] 2>/dev/null; }
load_nvm()   { export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" 2>/dev/null; [ -d "$NVM_DIR/versions/node" ] && PATH="$(ls -d "$NVM_DIR/versions/node"/*/bin 2>/dev/null | sort -V | tail -1):$PATH"; }

install_via_nvm() {
  blue "尝试用 nvm 安装 Node ${NODE_MIN}（无需 sudo）…"
  if [ ! -s "$HOME/.nvm/nvm.sh" ]; then
    command -v curl >/dev/null 2>&1 || { red "缺少 curl，跳过 nvm"; return 1; }
    blue "安装 nvm …"
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash || { red "nvm 安装失败"; return 1; }
  fi
  load_nvm
  command -v nvm >/dev/null 2>&1 || { red "nvm 加载失败"; return 1; }
  nvm install "$NODE_MIN" && nvm alias default "$NODE_MIN" && return 0
  red "nvm 安装 Node 失败"; return 1
}

install_via_brew() {
  command -v brew >/dev/null 2>&1 || return 1
  blue "尝试用 Homebrew 安装 Node …"
  brew install "node@$NODE_MIN" 2>/dev/null || brew install node || { red "brew 安装失败"; return 1; }
  command -v node >/dev/null 2>&1
}

install_via_apt() {
  command -v apt-get >/dev/null 2>&1 || return 1
  blue "尝试用 apt 安装 Node（需要 sudo）…"
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MIN}.x" | sudo -E bash - || { red "nodesource 配置失败"; return 1; }
  sudo apt-get install -y nodejs || { red "apt 安装失败"; return 1; }
  command -v node >/dev/null 2>&1
}

install_node() {
  install_via_nvm || install_via_brew || install_via_apt || { red "自动安装失败。请手动到 https://nodejs.org/ 安装 Node $NODE_MIN+，再重跑本脚本。"; return 1; }
  load_nvm
  command -v node >/dev/null 2>&1
}

main() {
  cd "$HERE"
  blue "== ui-design-workflow 安装自检 =="

  if have_node; then
    green "已检测到 Node $(node -v)（要求 >= ${NODE_MIN}）"
  else
    if command -v node >/dev/null 2>&1; then
      red "当前 Node $(node -v) 低于 ${NODE_MIN}，需要升级。"
    else
      red "未检测到 Node.js，开始自动安装 …"
    fi
    install_node || { red "Node 安装未完成，请手动安装后重跑本脚本。"; exit 1; }
    have_node && green "Node $(node -v) 已就绪。"
  fi

  blue "运行自检（离线，无需 npm install）…"
  node handoff/verify-handoff.mjs || red "verify-handoff 未通过"
  node scripts/check-skill.mjs || red "skill 校验未通过"
  node --test test/core.test.mjs test/mcp.test.mjs || red "核心测试未通过"

  green "安装完成。快速上手见 README「快速开始」；一键全自动优化见 handoff/AUTO-OPTIMIZE-PROMPT.md。"
}

main "$@"
