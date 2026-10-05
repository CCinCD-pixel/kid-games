#!/bin/bash
# tools/voice/voice.sh — run the narration pipeline (python -m voice …) with the machine-local
# venv/models under $VOICE_HOME (default ~/kid-games-work/voice). See docs/VOICE.md.
#   tools/voice/voice.sh engines | selftest | setup --engine qwen3|kokoro|asr
#   tools/voice/voice.sh build --game hub [--engine qwen3|kokoro|say] [--no-qc] [--only 'hub.moon.*']
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
export VOICE_HOME="${VOICE_HOME:-$HOME/kid-games-work/voice}"
PY="$VOICE_HOME/.venv/bin/python"
[ -x "$PY" ] || { echo "voice: no venv at $VOICE_HOME/.venv — see docs/VOICE.md (Setup)" >&2; exit 2; }
cd "$HERE"
exec env HF_HOME="$VOICE_HOME/hf" HF_HUB_OFFLINE="${HF_HUB_OFFLINE:-1}" PYTHONPATH="$HERE" "$PY" -m voice "$@"
