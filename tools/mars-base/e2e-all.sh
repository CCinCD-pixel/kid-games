#!/bin/bash
# The whole 火星基地 browser matrix against the SCOPED production bundle (spec §9 V10). One WebKit at a time, sequential.
#   npx vite build --config tools/mars-base/vite.scoped.config.ts && tools/mars-base/e2e-all.sh [project ...]
# QA fix-mars-r2: `stability` (DOM never piles up, wrong -> retry is finishable) runs everywhere; AFTER the projects the REAL-TOUCH SWEEP (tools/mars-base/touch-sweep.mjs) runs against the same bundle:
#   quick (every live stage signature, wrong path + twin, iPad portrait) + spot runs on SE / iPhone 13 / iPhone landscape / iPad landscape + Chromium CDP touch drags for the number line.
#   SWEEP=0 skips it; SWEEP_ONLY=1 runs only the sweep (no Playwright projects). Reports: ~/kid-games-work/state/rr/touch-sweep/*.json
# The ipad-l project also runs the V11 soak spec (Chromium + CDP, every screen type and every stage type). Logs: ~/kid-games-work/state/rr/e2e/run.log; per-project audit reports: .../layout-<project>.txt; shots: ~/kid-games-work/shots/rr/mars/e2e/<project>/
set -euo pipefail
cd "$(dirname "$0")/../.."
LOG=~/kid-games-work/state/rr/e2e/run.log; mkdir -p "$(dirname "$LOG")"; : > "$LOG"
PREVIEW=
cleanup() {
  if [ -n "$PREVIEW" ]; then kill "$PREVIEW" 2>/dev/null || true; wait "$PREVIEW" 2>/dev/null || true; fi
}
trap cleanup EXIT
check_port() {
  if lsof -nP -ti TCP:5323 -sTCP:LISTEN > /dev/null; then
    echo "port 5323 is already in use; stop that server before running the matrix" | tee -a "$LOG" >&2
    exit 1
  fi
}
PROJECTS=("$@"); [ ${#PROJECTS[@]} -eq 0 ] && PROJECTS=(ipad-p ipad-l phone-p se phone-l phone-l-inset phone-pwa-p ipad-p-inset ipad-l-inset)
if [ "${SWEEP_ONLY:-0}" != 1 ]; then
for p in "${PROJECTS[@]}"; do
  free=$(memory_pressure -Q 2>/dev/null | awk -F': ' '/free percentage/{gsub("%","",$2);print $2+0}')
  while [ "${free:-100}" -lt 25 ]; do echo "[$p] waiting: memory ${free}% free" >> "$LOG"; sleep 60; free=$(memory_pressure -Q | awk -F': ' '/free percentage/{gsub("%","",$2);print $2+0}'); done
  specs="layout numline wall screens result stability"; case "$p" in ipad-l|phone-p|se|phone-l-inset) specs="layout numline wall screens result stability behaviour glyphs";; esac   # result = QA fix-mars-r1: result / calibration / build cards inside the viewport on every project + probe resume
  [ "$p" = ipad-l ] && specs="$specs soak"   # V11 memory-flat soak (own headless Chromium, ~5 min); results in ~/kid-games-work/state/rr/e2e/soak.json
  check_port
  echo "=== $p ($specs) $(date +%T)" >> "$LOG"
  npx playwright test -c site/mars-base/playwright.mars.config.ts --project="$p" $specs >> "$LOG" 2>&1
done
fi
if [ "${SWEEP:-1}" = 1 ]; then
  check_port
  echo "=== touch-sweep $(date +%T)" >> "$LOG"
  ./node_modules/.bin/vite preview --config tools/mars-base/vite.scoped.config.ts --port 5323 --strictPort > ~/kid-games-work/state/rr/e2e/preview-sweep.log 2>&1 & PREVIEW=$!
  ready=0
  for i in $(seq 1 30); do
    if curl --max-time 2 -sf http://localhost:5323/mars-base/ > /dev/null; then ready=1; break; fi
    kill -0 "$PREVIEW" 2>/dev/null || break
    sleep 1
  done
  if [ "$ready" != 1 ]; then echo "touch-sweep preview did not start" | tee -a "$LOG" >&2; exit 1; fi
  sweep() {   # one sweep run; waits for memory first; the exit code is logged (non-zero = a failed signature / console error / stall)
    free=$(memory_pressure -Q 2>/dev/null | awk -F': ' '/free percentage/{gsub("%","",$2);print $2+0}'); while [ "${free:-100}" -lt 25 ]; do echo "[sweep] waiting: memory ${free}% free" >> "$LOG"; sleep 60; free=$(memory_pressure -Q | awk -F': ' '/free percentage/{gsub("%","",$2);print $2+0}'); done
    if node tools/mars-base/touch-sweep.mjs "$@" >> "$LOG" 2>&1; then
      echo "[sweep] $* -> exit 0" >> "$LOG"
    else
      echo "[sweep] $* -> FAILED" | tee -a "$LOG" >&2
      exit 1
    fi
  }
  sweep --mode quick --vp ipad-p                                  # every live signature, wrong path (H1-H3 -> assisted -> twin) + right path, real touches
  sweep --mode spot --vp se; sweep --mode spot --vp phone-p; sweep --mode spot --vp phone-l; sweep --mode spot --vp ipad-l
  sweep --mode quick --engine chromium --vp ipad-p --sigs nl. --tag nl-touch-ipad-p      # real CDP touch drags of the flag
  cleanup; PREVIEW=
fi
echo "=== ALL DONE $(date +%T)" >> "$LOG"
