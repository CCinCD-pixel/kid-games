#!/bin/bash
# memrun.sh — run ONE model process under a hard memory guard (16 GB Mac; see crash 2026-10-05).
#
# usage: memrun.sh [-l LIMIT_MB] [-w MIN_FREE_PCT] [-k KILL_FREE_PCT] [-t TAG] -- cmd args...
#
#  * Before starting: waits (sleep 60, up to WAIT_MAX s) until system free memory >= MIN_FREE_PCT (default 30).
#  * Refuses to start if another memrun-guarded process is alive (one model process at a time).
#  * While running: every 1 s measures the child's process tree — RSS (ps) and phys_footprint
#    (footprint(1); this is what counts MLX/Metal unified-memory buffers) — and kills the whole
#    tree (TERM, KILL after 3 s) if either exceeds LIMIT_MB (default 4000), or if system free
#    memory drops below KILL_FREE_PCT (default 12).
#  * Exit status: the child's, or 137 when the guard killed it. A summary line with peak RSS /
#    peak footprint / wall time goes to stderr and to logs/memrun.log.
set -u
LIMIT_MB=${LIMIT_MB:-4000}
MIN_FREE=${MIN_FREE:-30}
KILL_FREE=${KILL_FREE:-12}
WAIT_MAX=${WAIT_MAX:-1800}
TAG=run
VOICE_HOME="${VOICE_HOME:-$HOME/kid-games-work/voice}"
LOGDIR="$VOICE_HOME/logs"; mkdir -p "$LOGDIR"
LOG="$LOGDIR/memrun.log"
LOCK="$LOGDIR/memrun.lock"

while [ $# -gt 0 ]; do
  case "$1" in
    -l) LIMIT_MB=$2; shift 2;;
    -w) MIN_FREE=$2; shift 2;;
    -k) KILL_FREE=$2; shift 2;;
    -t) TAG=$2; shift 2;;
    --) shift; break;;
    *) break;;
  esac
done
[ $# -gt 0 ] || { echo "usage: memrun.sh [-l MB] [-w pct] [-k pct] [-t tag] -- cmd..." >&2; exit 2; }

free_pct() { memory_pressure -Q 2>/dev/null | awk -F': ' '/free percentage/{gsub("%","",$2);print $2+0}'; }
log() { echo "$(date '+%F %T') [$TAG] $*" | tee -a "$LOG" >&2; }

# one guarded model process at a time
if [ -f "$LOCK" ] && kill -0 "$(cat "$LOCK" 2>/dev/null)" 2>/dev/null; then
  log "REFUSED: another guarded process is running (memrun pid $(cat "$LOCK"))"; exit 75
fi

waited=0
while :; do
  f=$(free_pct); f=${f:-0}
  [ "$f" -ge "$MIN_FREE" ] && break
  if [ $waited -ge $WAIT_MAX ]; then log "GAVE UP: free ${f}% < ${MIN_FREE}% after ${waited}s"; exit 75; fi
  log "waiting: free ${f}% < ${MIN_FREE}%"; sleep 60; waited=$((waited+60))
done

echo $$ > "$LOCK"
tree() {  # $1 = root pid -> root + all descendants
  local p=$1; echo "$p"
  for c in $(pgrep -P "$p" 2>/dev/null); do tree "$c"; done
}
fp_mb() {  # phys_footprint of one pid in MB
  footprint -p "$1" 2>/dev/null | awk '/Footprint:/{for(i=1;i<=NF;i++) if($i=="Footprint:"){v=$(i+1);u=$(i+2);
    if(u ~ /^GB/) v*=1024; else if(u ~ /^KB/) v/=1024; else if(u ~ /^B/) v/=1048576; printf "%d", v; exit}}'
}
kill_tree() {
  local pids; pids=$(tree "$child" | tr '\n' ' ')
  kill -TERM $pids 2>/dev/null; sleep 3; kill -KILL $pids 2>/dev/null
}

start=$(date +%s)
"$@" &
child=$!
trap 'log "interrupted -> killing $child"; kill_tree; rm -f "$LOCK"; exit 130' INT TERM
peak_rss=0; peak_fp=0; killed=""; f0=$(free_pct)
while kill -0 "$child" 2>/dev/null; do
  pids=$(tree "$child")
  rss=$(ps -o rss= -p $(echo $pids | tr ' ' ',') 2>/dev/null | awk '{s+=$1} END{printf "%d", s/1024}')
  fp=0; for p in $pids; do v=$(fp_mb "$p"); fp=$((fp + ${v:-0})); done
  [ "${rss:-0}" -gt $peak_rss ] && peak_rss=$rss
  [ "$fp" -gt $peak_fp ] && peak_fp=$fp
  if [ "${rss:-0}" -gt "$LIMIT_MB" ] || [ "$fp" -gt "$LIMIT_MB" ]; then
    killed="rss=${rss}MB footprint=${fp}MB > ${LIMIT_MB}MB"
  else
    f=$(free_pct)
    if [ -n "$f" ] && [ "$f" -lt "$KILL_FREE" ]; then killed="system free ${f}% < ${KILL_FREE}%"; fi
  fi
  if [ -n "$killed" ]; then log "KILL ($killed): $*"; kill_tree; break; fi
  sleep 1
done
wait "$child" 2>/dev/null; rc=$?
[ -n "$killed" ] && rc=137
rm -f "$LOCK"
log "exit=$rc peak_rss=${peak_rss}MB peak_footprint=${peak_fp}MB wall=$(( $(date +%s) - start ))s free_at_start=${f0}% cmd: $(echo "$*" | cut -c1-160)"
exit $rc
