#!/usr/bin/env bash
# check-health.sh -- 给"爸爸已有的告警渠道"(Bark/邮件/飞书)套用: 退出码 0=正常, 1=不正常(服务不通, 或备份超过 36 小时没做)。
# 用法:  KG_HEALTH_URL=https://kg.ccincd.shop:8443/healthz ./check-health.sh        (在任何一台能上网的机器上, 例如异地拉取的那台)
# 输出一行人话; 想接告警就: ./check-health.sh || <你的告警命令>
set -uo pipefail
URL="${KG_HEALTH_URL:-${1:-}}"
MAX_H="${KG_MAX_BACKUP_AGE_H:-36}"
if [ -z "$URL" ]; then echo "用法: KG_HEALTH_URL=https://域名:8443/healthz $0" >&2; exit 2; fi
BODY="$(curl -fsS --max-time 10 "$URL" 2>&1)" || { echo "云存档服务不通: ${BODY:0:120}"; exit 1; }
case "$BODY" in *'"ok":true'*) ;; *) echo "云存档返回异常: ${BODY:0:120}"; exit 1 ;; esac
AGE="$(printf '%s' "$BODY" | sed -n 's/.*"backupAgeH":\([0-9.]*\).*/\1/p')"
if [ -z "$AGE" ]; then echo "云存档在线, 但还没有备份记录(backupAgeH=null)"; exit 1; fi
if awk -v a="$AGE" -v m="$MAX_H" 'BEGIN{exit !(a>m)}'; then echo "云存档在线, 但最近一次备份是 ${AGE} 小时前(超过 ${MAX_H})"; exit 1; fi
echo "云存档正常, 最近备份 ${AGE} 小时前"
