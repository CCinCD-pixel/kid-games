#!/bin/bash
# Build the whole site exactly like Netlify does and serve dist/ on the LAN so the iPad can open it.
#   ./play.sh            build + serve on port 8000 (or the next free port)
#   PORT=9000 ./play.sh  choose a port
#   SKIP_BUILD=1 ./play.sh   serve the existing dist/ without rebuilding
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

echo "=================================================="
echo "🎮 准备本地预览（与 Netlify 相同的构建：npm run build → dist/）"
echo "=================================================="

if [ ! -d node_modules ]; then
  echo "📦 首次运行：安装依赖（npm ci）..."
  npm ci --no-fund --no-audit
fi

if [ "${SKIP_BUILD:-0}" != "1" ]; then
  npm run build
fi

for file in index.html sw.js manifest.json _redirects; do
  if [ ! -f "dist/$file" ]; then
    echo "预览文件缺失：dist/${file}"
    exit 1
  fi
done
echo "构建产物检查通过。"

# 本机局域网 IP（macOS：先试 en0，再试 en1）
IP=$(ipconfig getifaddr en0 2>/dev/null || true)
if [ -z "$IP" ]; then IP=$(ipconfig getifaddr en1 2>/dev/null || true); fi
if [ -z "$IP" ]; then IP="localhost"; fi

PORT="${PORT:-8000}"
REQUESTED_PORT="$PORT"
port_available() {
  python3 - "$1" <<'PY'
import socket, sys
with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
    try:
        sock.bind(("", int(sys.argv[1])))
    except OSError:
        sys.exit(1)
PY
}
while ! port_available "$PORT"; do PORT=$((PORT + 1)); done
if [ "$PORT" != "$REQUESTED_PORT" ]; then echo "端口 ${REQUESTED_PORT} 已被占用，改用 ${PORT}。"; fi

echo "=================================================="
echo "🎮 游戏服务器启动中..."
echo "--------------------------------------------------"
echo "请拿起 iPad，打开 Safari 浏览器，输入以下地址："
echo ""
echo "👉  http://${IP}:${PORT}"
echo ""
echo "（注意：Service Worker 只在 https 或 localhost 下工作，局域网 http 预览不会离线缓存。）"
echo "--------------------------------------------------"
echo "按 Ctrl+C 可以停止服务器"
echo "=================================================="

exec npx vite preview --host 0.0.0.0 --port "$PORT" --strictPort
