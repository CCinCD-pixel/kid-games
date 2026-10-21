#!/usr/bin/env bash
# ensure-net.sh -- 保证生产 Caddy 容器接在 kg-net 上。生产栈重建 Caddy 后它会掉出 kg-net(`docker network connect` 是热操作, 重建就没了)。
# 每 5 分钟由 cron 调用(RUNBOOK 3.5)。一切正常时完全静默; 只有补连成功或出问题才输出一行。
# 容器名: 环境变量 CADDY_CONTAINER, 或同目录 .env 里的 CADDY_CONTAINER=...
set -euo pipefail
cd "$(dirname "$0")"
NET=kg-net
CADDY="${CADDY_CONTAINER:-}"
if [ -z "$CADDY" ] && [ -f .env ]; then CADDY="$(grep -E '^CADDY_CONTAINER=' .env | tail -1 | cut -d= -f2- | tr -d '"' | tr -d "'" | tr -d '[:space:]' || true)"; fi
if [ -z "$CADDY" ]; then echo "ensure-net: CADDY_CONTAINER 没有设置(环境变量或 .env)" >&2; exit 2; fi

if ! docker inspect "$CADDY" >/dev/null 2>&1; then echo "ensure-net: 找不到容器 $CADDY" >&2; exit 1; fi
if ! docker network inspect "$NET" >/dev/null 2>&1; then echo "ensure-net: 网络 $NET 不存在(kg-sync 还没启动?)" >&2; exit 1; fi

if docker inspect "$CADDY" --format '{{json .NetworkSettings.Networks}}' | grep -q "\"$NET\""; then exit 0; fi

docker network connect "$NET" "$CADDY"
echo "ensure-net: $(date '+%F %T') 已把 $CADDY 接回 $NET"
