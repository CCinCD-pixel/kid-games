#!/bin/bash

# 获取本机局域网 IP (针对 macOS)
IP=$(ipconfig getifaddr en0)

# 如果 en0 没获取到 (比如用的是 WiFi en1)，尝试 en1
if [ -z "$IP" ]; then
    IP=$(ipconfig getifaddr en1)
fi

PORT=8000

echo "=================================================="
echo "🎮 游戏服务器启动中..."
echo "--------------------------------------------------"
echo "请拿起 iPad，打开 Safari 浏览器，输入以下地址："
echo ""
echo "👉  http://$IP:$PORT"
echo ""
echo "--------------------------------------------------"
echo "按 Ctrl+C 可以停止服务器"
echo "=================================================="

# 启动 Python 内置服务器
python3 -m http.server $PORT
