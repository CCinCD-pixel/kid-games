#!/usr/bin/env bash
# make-sums.sh -- 重新生成 SHA256SUMS(改了下面任何一个文件之后必须跑一次; tests/sync-server/bundle.test.ts 会核对)。
# 部署前在服务器上用  sha256sum -c SHA256SUMS  核对, 确保拿到的和仓库里评审过的完全一致。RUNBOOK.md 不在其中(文档随时可改)。
set -euo pipefail
cd "$(dirname "$0")"
FILES="server.mjs Dockerfile compose.yml Caddyfile.snippet .env.example .dockerignore ensure-net.sh pull-backups.sh check-health.sh smoke-remote.mjs"
if command -v sha256sum >/dev/null 2>&1; then sha256sum $FILES > SHA256SUMS; else shasum -a 256 $FILES > SHA256SUMS; fi
cat SHA256SUMS
