#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
PREVIEW_DIR="${TMPDIR:-/tmp}/kid-games-preview"

echo "=================================================="
echo "🎮 准备本地预览文件..."
echo "--------------------------------------------------"
echo "会先构建 Vite 游戏，再用临时目录启动静态服务器。"
echo "这样本地预览和 Netlify 部署看到的是同一类文件。"
echo "=================================================="

rm -rf "$PREVIEW_DIR"
mkdir -p "$PREVIEW_DIR"

rsync -a \
  --exclude ".git" \
  --exclude ".gstack" \
  --exclude "node_modules" \
  --exclude "dist" \
  "$ROOT_DIR/" "$PREVIEW_DIR/"

build_vite_game() {
  local game_dir="$1"

  echo "🔧 构建 $game_dir ..."
  (
    cd "$ROOT_DIR/$game_dir"
    if [ ! -d node_modules ]; then
      npm install --no-fund --no-audit
    fi
    npm run build
  )

  rm -rf "$PREVIEW_DIR/$game_dir"
  mkdir -p "$PREVIEW_DIR/$game_dir"
  cp -R "$ROOT_DIR/$game_dir/dist/." "$PREVIEW_DIR/$game_dir/"
}

build_vite_game "snake-battle"
build_vite_game "emoji-match"

REQUIRED_PREVIEW_FILES=(
  "index.html"
  "manifest.json"
  "sw.js"
  "icons/icon.svg"
  "memory-matrix/index.html"
  "emoji-match/index.html"
  "number-adventure/index.html"
  "sokoban/index.html"
  "chess/index.html"
  "checkers/index.html"
  "snake-battle/index.html"
  "military-chess/index.html"
  "star-catcher/index.html"
)

for file in "${REQUIRED_PREVIEW_FILES[@]}"; do
  if [ ! -f "$PREVIEW_DIR/$file" ]; then
    echo "预览文件缺失：${file}"
    exit 1
  fi
done

echo "预览文件检查通过。"

# 获取本机局域网 IP (针对 macOS)
IP=$(ipconfig getifaddr en0 2>/dev/null || true)

# 如果 en0 没获取到 (比如用的是 WiFi en1)，尝试 en1
if [ -z "$IP" ]; then
    IP=$(ipconfig getifaddr en1 2>/dev/null || true)
fi

if [ -z "$IP" ]; then
    IP="localhost"
fi

PORT="${PORT:-8000}"
REQUESTED_PORT="$PORT"

port_available() {
  python3 - "$1" <<'PY'
import socket
import sys

with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
    try:
        sock.bind(("", int(sys.argv[1])))
    except OSError:
        sys.exit(1)
PY
}

while ! port_available "$PORT"; do
  PORT=$((PORT + 1))
done

if [ "$PORT" != "$REQUESTED_PORT" ]; then
  echo "端口 ${REQUESTED_PORT} 已被占用，改用 ${PORT}。"
fi

echo "=================================================="
echo "🎮 游戏服务器启动中..."
echo "--------------------------------------------------"
echo "请拿起 iPad，打开 Safari 浏览器，输入以下地址："
echo ""
echo "👉  http://${IP}:${PORT}"
echo ""
echo "--------------------------------------------------"
echo "按 Ctrl+C 可以停止服务器"
echo "=================================================="

# 启动 Python 内置服务器
cd "$PREVIEW_DIR"
python3 -m http.server "$PORT"
