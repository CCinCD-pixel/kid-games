# 星港云存档 (kg-sync) 镜像 -- docs/specs/sync.md 6.2
# 基础镜像必须"钉摘要"(RUNBOOK 2.3): 在 .env 里把 NODE_IMAGE 写成 node:22-slim@sha256:<摘要>。没写时退回浮动标签 node:22-slim(能跑, 但不可复现)。
# server.mjs 需要 Node >= 22.16 (node:sqlite 与 backup()), 零依赖, 所以镜像里没有 npm install 这一步。
ARG NODE_IMAGE=node:22-slim
FROM ${NODE_IMAGE}

ENV NODE_ENV=production \
    NODE_NO_WARNINGS=1 \
    KG_DB=/data/kg.db \
    KG_BACKUP_DIR=/data/backup \
    KG_PORT=8787

WORKDIR /app
COPY server.mjs /app/server.mjs
RUN chmod 0444 /app/server.mjs && install -d -o node -g node /data

# 非 root: node 镜像里 node 的 uid/gid 是 1000(与 compose 的 user: "1000:1000" 一致)
USER node
EXPOSE 8787

# 健康检查用 bash 的 /dev/tcp(约 1.7 MB), 不再起第二个 node 进程(约 49 MB, 会和服务抢 256 MB 的内存上限)
HEALTHCHECK --interval=60s --timeout=5s --start-period=20s --retries=3 CMD ["bash", "-c", "exec 3<>/dev/tcp/127.0.0.1/8787 && printf 'GET /healthz HTTP/1.0\\r\\n\\r\\n' >&3 && head -1 <&3 | grep -q 200"]

CMD ["node", "/app/server.mjs", "serve"]
