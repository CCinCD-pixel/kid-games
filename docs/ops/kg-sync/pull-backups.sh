#!/usr/bin/env bash
# pull-backups.sh -- 异地备份: 在"另一台机器"(爸爸的国内机, 不是公司电脑)上每晚运行, 只读地把海外机的备份目录拉回来。docs/specs/sync.md 6.4
# 备份文件里只有密封信封 + 口令哈希 + 配对密文, 放在哪里都读不出孩子的数据, 但仍然别公开。
#
# 配置(环境变量, 或写进同目录的 pull-backups.env, 一行一个 KEY=VALUE):
#   KG_REMOTE       海外机的 ssh 登录, 例如 kgpull@服务器地址。留空 = 把 KG_REMOTE_DIR 当本机目录(演练/测试用, 不联网)
#   KG_REMOTE_PATH  远端路径。用 rrsync 受限密钥时写 .(默认), 它会把根固定在备份目录
#   KG_REMOTE_DIR   KG_REMOTE 留空时的本机源目录
#   KG_SSH_KEY      专用私钥文件(只用来拉备份), 默认 ~/.ssh/kg_pull
#   KG_SSH_PORT     ssh 端口, 默认 22
#   KG_LOCAL_DIR    本机存放目录, 默认 ~/kg-backup
#   KG_KEEP_DAYS    本机保留天数, 默认 30
#   KG_MAX_AGE_H    最新备份允许的最大"年龄"(小时), 默认 36; 超过就报警(退出码 1)
# 退出码: 0 成功; 1 拉取失败/备份过旧/文件损坏; 2 配置错误。成功时静默(cron 只在出事时发邮件); 加 -v 看过程。
set -euo pipefail
VERBOSE=0; [ "${1:-}" = "-v" ] && VERBOSE=1
say() { if [ "$VERBOSE" = 1 ]; then echo "$@"; fi; return 0; }
HERE="$(cd "$(dirname "$0")" && pwd)"
if [ -f "$HERE/pull-backups.env" ]; then set -a; . "$HERE/pull-backups.env"; set +a; fi

REMOTE="${KG_REMOTE:-}"
LOCAL="${KG_LOCAL_DIR:-$HOME/kg-backup}"
KEEP="${KG_KEEP_DAYS:-30}"
MAXH="${KG_MAX_AGE_H:-36}"
KEY="${KG_SSH_KEY:-$HOME/.ssh/kg_pull}"
PORT="${KG_SSH_PORT:-22}"

if [ -n "$REMOTE" ]; then
  [ -f "$KEY" ] || { echo "pull-backups: 找不到私钥 $KEY(KG_SSH_KEY)" >&2; exit 2; }
  SRC="$REMOTE:${KG_REMOTE_PATH:-.}/"
  SSH="ssh -i $KEY -p $PORT -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=20"
else
  [ -n "${KG_REMOTE_DIR:-}" ] && [ -d "$KG_REMOTE_DIR" ] || { echo "pull-backups: KG_REMOTE 和 KG_REMOTE_DIR 都没有可用的值" >&2; exit 2; }
  SRC="${KG_REMOTE_DIR%/}/"
  SSH=""
fi
mkdir -p "$LOCAL"
chmod 700 "$LOCAL" 2>/dev/null || true

# 不重叠地运行(有 flock 就用)
if command -v flock >/dev/null 2>&1; then exec 9>"$LOCAL/.pull.lock"; flock -n 9 || { echo "pull-backups: 上一次还没跑完" >&2; exit 1; }; fi

# 只读拉取: 不加 --delete(远端删了旧文件, 本机仍保留到 KEEP 天); 不拉临时文件
RSYNC=(rsync -a --partial --timeout=120 --exclude '.tmp*' --exclude '*.tmp' --exclude '.pull.lock')
if [ -n "$SSH" ]; then RSYNC+=(-e "$SSH"); fi
say "拉取 $SRC -> $LOCAL/"
if ! "${RSYNC[@]}" "$SRC" "$LOCAL/"; then echo "pull-backups: rsync 失败(网络/密钥/路径)" >&2; exit 1; fi

# 检查: 最新的日备份存在, 是 SQLite 文件, 不是空的, (有 sqlite3 时) integrity_check 通过
LATEST="$(ls -1 "$LOCAL"/kg-d-*.db 2>/dev/null | sort | tail -1 || true)"
[ -n "$LATEST" ] || { echo "pull-backups: 本机没有任何 kg-d-*.db(远端还没有备份?)" >&2; exit 1; }
[ -s "$LATEST" ] || { echo "pull-backups: $LATEST 是空文件" >&2; exit 1; }
[ "$(head -c 15 "$LATEST")" = "SQLite format 3" ] || { echo "pull-backups: $LATEST 不是 SQLite 文件" >&2; exit 1; }
if command -v sqlite3 >/dev/null 2>&1; then
  R="$(sqlite3 -readonly "$LATEST" 'PRAGMA integrity_check' 2>&1 | head -1)"
  [ "$R" = "ok" ] || { echo "pull-backups: $LATEST integrity_check 失败: $R" >&2; exit 1; }
  say "integrity_check ok ($LATEST)"
else
  say "本机没有 sqlite3, 跳过 integrity_check(只做了文件头检查)"
fi

# 新鲜度: LAST_OK 的修改时间(rsync -a 保留了远端写入时间)
if [ -f "$LOCAL/LAST_OK" ]; then
  if [ -n "$(find "$LOCAL/LAST_OK" -mmin +$((MAXH * 60)) 2>/dev/null)" ]; then echo "pull-backups: 最新备份超过 ${MAXH} 小时没更新(远端备份停了?)" >&2; exit 1; fi
else
  echo "pull-backups: 没有 LAST_OK(远端从未成功备份?)" >&2; exit 1
fi

# 本机只保留 KEEP 天(按文件修改时间), 不碰 LAST_OK
find "$LOCAL" -maxdepth 1 -name 'kg-*.db' -mtime +"$KEEP" -delete
find "$LOCAL" -maxdepth 1 -name 'pre-update-*.db' -mtime +"$KEEP" -delete
say "完成: 最新 $(basename "$LATEST"), 本机共 $(ls -1 "$LOCAL"/kg-*.db | wc -l | tr -d ' ') 个备份文件"
