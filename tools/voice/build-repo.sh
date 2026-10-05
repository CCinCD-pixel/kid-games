#!/bin/bash
# npm run voice:build [-- <game> ...]
# Builds content/narration/<game>.yaml → public/audio/<game>/*.m4a + audio-manifest.json in this
# repo (default: every yaml except _* and numbers*), then runs the content checks.
# Engine: $VOICE_ENGINE (default qwen3). Memory-safe: every model process runs through memrun.sh
# (waits for ≥30 % free memory, one model process at a time, killed above 4 GB).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
ENGINE="${VOICE_ENGINE:-qwen3}"
free=$(memory_pressure -Q 2>/dev/null | awk -F': ' '/free percentage/{gsub("%","",$2);print $2+0}')
if [ -n "${free:-}" ] && [ "$free" -lt 25 ]; then
  echo "voice:build: only ${free}% memory free (< 25 %) — close apps or wait, then retry" >&2; exit 75
fi
games=("$@")
if [ ${#games[@]} -eq 0 ]; then
  for f in "$ROOT"/content/narration/*.yaml; do
    g="$(basename "$f" .yaml)"
    case "$g" in _*|numbers*) continue;; esac
    games+=("$g")
  done
fi
for g in "${games[@]}"; do
  echo "== voice: $g ($ENGINE)"
  "$HERE/voice.sh" build --game "$g" --engine "$ENGINE" --content "$ROOT/content" --out "$ROOT" --prune
done
node "$ROOT/tools/check-content.mjs"
