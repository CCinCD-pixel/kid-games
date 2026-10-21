#!/bin/zsh
set -eu
cd "${0:A:h}/../../.."
free_pct=$(memory_pressure -Q | awk -F': ' '/free percentage/{gsub("%","",$2);print $2}')
if (( free_pct < 25 )); then
  print '当前可用内存不足 25%，请稍后重试。'
  exit 1
fi
if [[ ! -d node_modules ]]; then
  npm ci --ignore-scripts --no-audit --no-fund
fi
npm run build
node site/pinyin-station/tools/local-preview.mjs
