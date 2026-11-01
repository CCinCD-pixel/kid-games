#!/bin/bash
# Reproducible pronunciation audit. Silent (files only). Memory-safe: ASR runs through tools/voice/memrun.sh (one model process).
#   site/pinyin-station/tools/audit/run-audit.sh [OUT_DIR]      -> tone.json, asr.json, pronunciation-audit.{json,md}, f0/*.png
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/../../../.." && pwd)"
OUT="${1:-$HOME/kid-games-work/pinyin-audit/out-r3}"; mkdir -p "$OUT"; export AUDIT_OUT="$OUT"
VOICE_HOME="${VOICE_HOME:-$HOME/kid-games-work/voice}"
cd "$ROOT"
npx vitest run -c site/pinyin-station/tools/audit/vitest.audit.config.ts 2>&1 | grep -E "TONE AUDIT|FAIL|passed|failed" | cut -c1-400
"$ROOT/tools/voice/memrun.sh" -l 1500 -w 25 -t asr:audit -- "$VOICE_HOME/.venv/bin/python" "$HERE/asr.py" "$ROOT/public/audio/pinyin-station/audio-manifest.json" "$ROOT/public/audio/pinyin-station" "$OUT/asr.json"
node "$HERE/pronunciation-audit.mjs" "$OUT"
python3 "$HERE/plot_f0.py" "$OUT" "${AUDIT_EXTRA:-pi3,ta3,fa2,na4,fo1,te1,zi1,ci1,ri1,yu1,o1}"
