# 星港云存档 · 运维手册（RUNBOOK）

> 给"不是运维"的爸爸看的。每一步都有 **要敲的命令** 和 **预期输出**。输出和预期不一样，就**停下来**，把屏幕内容发给我，不要硬往下做。
> 规格出处：`docs/specs/sync.md` 第 5、6 章。本目录文件：`server.mjs`（服务）· `Dockerfile` · `compose.yml` · `Caddyfile.snippet` · `.env.example` · `.dockerignore` · `ensure-net.sh` · `pull-backups.sh` · `check-health.sh` · `smoke-remote.mjs` · `make-sums.sh` · `SHA256SUMS` · 本手册。

---

## 0. 一页纸读懂

**这是什么**：一个很小的网络服务，替孩子的 iPad / iPhone 存一份"加密后的游戏进度"。它**看不懂内容**（内容在设备上就被密封了，钥匙只在设备上），只负责存和还。它跑在你那台**已经在跑生产服务**的海外机上，放在一个独立的 Docker 容器里（最多用 256 MB 内存、半个 CPU）。

**四条铁律**

1. **每一步等你说 "go" 再做**。我（agent）不会自己去连服务器；本手册里的命令都是你自己敲的。
2. **生产 Caddy 只改一次，而且改之前必须先备份**（第 4 章，有一键回滚）。
3. **觉得不对，先"暂停"**：`touch data/PAUSE`（第 9 章）。暂停只是不再收新数据，孩子的游戏照常玩，本机进度一点不丢。
4. **备份是密文**：`data/backup` 里的文件谁拿到都读不出孩子的数据，但也别公开发。

**三条最常用的命令**（都在服务器上、目录 `/srv/kg-sync` 里敲）

| 想做什么 | 命令 | 正常的样子 |
|---|---|---|
| 看一眼是否健康 | `docker compose ps` | `STATUS` 一栏是 `Up … (healthy)` |
| 看服务内部数字 | `docker exec kg-sync node /app/server.mjs status` | 一行 JSON：`families`（家庭数）、`events`（账本条数）、`freeMB`（剩余磁盘）、`lastBackup`（最近一次备份时间） |
| 紧急暂停 / 恢复 | `touch data/PAUSE` / `rm data/PAUSE` | 无输出；立刻生效，不用重启 |

**约定**：尖括号 `<…>` 是要你替换成自己的值（第 1 章列出来了）。命令前面的 `$` 不用敲。凡是写着 **(需要 go)** 的，都会改动服务器，开始前请先回复 go。

---

## 1. 先准备好这些信息（填在这里，后面直接抄）

| 记号 | 是什么 | 怎么查 | 你的值 |
|---|---|---|---|
| `<服务器>` | 登录海外机的地址 | 你平时 ssh 的那个 | |
| `<Caddy容器名>` | 生产 Caddy 容器的名字 | 服务器上 `docker ps --format '{{.Names}}'`，找带 caddy 的那行 | |
| `<Caddyfile路径>` | 宿主机上的 Caddyfile 文件 | 第 4 章 4.1 步查 | |
| `<API域名>` | 你现在对外的 API 域名（生产服务在用） | 你的 Caddyfile 里 `…:8443 {` 那一行 | |
| `<游戏站来源>` | 孩子游戏网页的完整来源，例如 `https://xxx.netlify.app` | 浏览器地址栏，只要 `https://域名` 这一段，**不带结尾斜杠** | |
| 正式域名 | `kg.ccincd.shop`（已定） | — | `kg.ccincd.shop` |

---

## 2. 部署前只读检查（不改任何东西，可以随时做）

```bash
$ docker version --format '{{.Server.Version}}'
```
预期：一个版本号，如 `27.3.1`（20 以上都行）。

```bash
$ docker compose version
```
预期：`Docker Compose version v2.…`（必须是 v2，不是 `docker-compose` 1.x）。

```bash
$ df -h /srv && free -m
```
预期：`/srv` 所在磁盘"可用"至少 5G；`free -m` 里 `available` 至少 600（本服务最多用 256 MB）。不够就停下来问。

```bash
$ dig +short kg.ccincd.shop <API域名>
```
预期：**两行一模一样的 IP**（先是 kg 的，后是 API 域名的）。不一样 = DNS 没配好（爸爸待办 1：A 记录指向同一个 IP，**灰云**，TTL 300），**停下来**，否则证书申请会失败并耗掉 Let's Encrypt 的次数限额。

---

## 3. 启动服务（还不碰 Caddy）(需要 go)

### 3.1 把文件放到服务器并核对

在**你的 Mac 上**（仓库根目录）：

```bash
$ rsync -av --exclude data --exclude .env docs/ops/kg-sync/ <用户>@<服务器>:/srv/kg-sync/
```
预期：列出一串文件名，最后一行类似 `sent … bytes  received … bytes`。（目录 `/srv/kg-sync` 不存在时先在服务器上 `sudo mkdir -p /srv/kg-sync && sudo chown $USER /srv/kg-sync`。）

在**服务器上**：

```bash
$ cd /srv/kg-sync && sha256sum -c SHA256SUMS
```
预期：每个文件一行 `…: OK`，共 10 行（`server.mjs`、`Dockerfile`、`compose.yml`、`Caddyfile.snippet`、`.env.example`、`.dockerignore`、`ensure-net.sh`、`pull-backups.sh`、`check-health.sh`、`smoke-remote.mjs`）。**出现任何 `FAILED` 就停**：说明文件在传输中被改了。

### 3.2 写 `.env`（里面有开通码，权限 600，不进 git，不发聊天）

```bash
$ cd /srv/kg-sync
$ cp .env.example .env && chmod 600 .env
$ CODE=$(openssl rand -base64 12) && sed -i "s|^KG_ENROLL_CODE=.*|KG_ENROLL_CODE=$CODE|" .env && echo "开通码已写入 .env"
```
预期：打印 `开通码已写入 .env`。

```bash
$ nano .env
```
- 把 `KG_ORIGINS=` 改成 `KG_ORIGINS=<游戏站来源>`（可用逗号再加预览站；**不能写 `*`**）。
- 把 `CADDY_CONTAINER=` 改成 `CADDY_CONTAINER=<Caddy容器名>`。
- 其余先不动。保存退出（nano：`Ctrl+O` 回车，`Ctrl+X`）。

查看开通码（**只在这一次抄进密码管理器，别截图别发聊天**）：

```bash
$ grep '^KG_ENROLL_CODE=' .env
```
预期：`KG_ENROLL_CODE=` 后面是 16 个左右的字符（形如 `aB3+x9/Qk2Lm5w==`）。

### 3.3 把基础镜像"钉"成固定版本

```bash
$ docker buildx imagetools inspect node:22-slim | grep -m1 '^Digest'
```
预期：`Digest:    sha256:` 加 64 个十六进制字符。把它写进 `.env` 的 `NODE_IMAGE=`：

```bash
$ nano .env      # 改成  NODE_IMAGE=node:22-slim@sha256:<刚才那 64 位>
```
不钉也能跑（会退回浮动标签），但以后重建可能悄悄换了小版本。**钉了才可复现。**

### 3.4 数据目录（二选一）

**A. 推荐：单独一个 512 MB 的回环文件系统**（防止和生产库共盘写满）

```bash
$ sudo mkdir -p /srv/kg-sync/data
$ sudo fallocate -l 512M /srv/kg-sync/data.img
$ sudo mkfs.ext4 -q -F /srv/kg-sync/data.img
$ sudo mount -o loop,nosuid,nodev /srv/kg-sync/data.img /srv/kg-sync/data
$ echo '/srv/kg-sync/data.img /srv/kg-sync/data ext4 loop,nosuid,nodev 0 2' | sudo tee -a /etc/fstab
$ sudo chown 1000:1000 /srv/kg-sync/data && sudo install -d -o 1000 -g 1000 -m 755 /srv/kg-sync/data/backup
$ df -h /srv/kg-sync/data
```
预期：最后一条显示 `Size` 约 `488M`，`Mounted on` 是 `/srv/kg-sync/data`。
**重要**：用了回环文件系统，必须把 `.env` 里的 `KG_MIN_FREE_MB=3072` 改成 `KG_MIN_FREE_MB=64`，否则磁盘守卫会误以为"空间不足"而拒绝所有写入（它看的是 `data/` 所在文件系统的剩余空间）。

**B. 不单独分区**（共用系统盘；磁盘守卫保持 3072 MB）

```bash
$ sudo install -d -o 1000 -g 1000 /srv/kg-sync/data /srv/kg-sync/data/backup
$ ls -ld /srv/kg-sync/data /srv/kg-sync/data/backup
```
预期：两行，属主都是 `1000 1000`。

### 3.5 检查配置、构建、启动

```bash
$ cd /srv/kg-sync && docker compose config > /dev/null && echo "配置没问题"
```
预期：`配置没问题`。如果提示 `KG_ENROLL_CODE 没填` 或 `KG_ORIGINS 没填`，回 3.2 补上。

```bash
$ docker compose up -d --build
```
预期：最后几行 `Network kg-net  Created`、`Container kg-sync  Started`（Docker 版本不同，措辞略有差别，没有 `error` 就行）。

```bash
$ docker compose ps
```
预期（头一分钟 `STATUS` 可能是 `Up … (health: starting)`，等 1 分钟再看）：

```
NAME      IMAGE           …   SERVICE   …   STATUS                    PORTS
kg-sync   kg-sync:local   …   kg-sync   …   Up About a minute (healthy)   8787/tcp
```
`PORTS` 一栏**只能是 `8787/tcp`（没有 `->` 箭头）**。如果看到 `0.0.0.0:…->8787`，说明端口被发布到公网了，**立刻 `docker compose down` 并问我**。

```bash
$ docker logs kg-sync
```
预期：一行 `{"ev":"listening","port":8787}`。

体检（可选，确认安全设置真的生效）：

```bash
$ docker inspect kg-sync --format '{{.Config.User}} {{.HostConfig.ReadonlyRootfs}} {{.HostConfig.Memory}} {{json .HostConfig.CapDrop}} {{.HostConfig.PortBindings}}'
```
预期：`1000:1000 true 268435456 ["ALL"] map[]`（非 root · 只读根文件系统 · 256 MB · 去掉全部特权 · 没有任何宿主端口）。

```bash
$ docker network inspect kg-net --format 'internal={{.Internal}} {{range .IPAM.Config}}{{.Subnet}}{{end}}'
```
预期：`internal=true 172.30.77.0/24`。

### 3.6 让生产 Caddy 能"看见"这个服务 (需要 go)

```bash
$ docker network connect kg-net <Caddy容器名>
$ docker inspect <Caddy容器名> --format '{{json .NetworkSettings.Networks}}' | grep -o '"kg-net"'
```
预期：第一条无输出；第二条打印 `"kg-net"`。（这是"热操作"，不重启 Caddy，也不影响它原来的网络。）

生产栈以后如果重建了 Caddy，它会**掉出** kg-net。所以加一个每 5 分钟的自动补连（一切正常时完全静默）：

```bash
$ crontab -l 2>/dev/null | { cat; echo '*/5 * * * * /srv/kg-sync/ensure-net.sh >> /var/log/kg-ensure-net.log 2>&1'; } | crontab -
$ crontab -l | grep ensure-net
```
预期：打印刚加的那一行。再手动跑一次确认它认得路：

```bash
$ /srv/kg-sync/ensure-net.sh && echo "已在网络里，无事发生"
```
预期：`已在网络里，无事发生`。（`/var/log/kg-ensure-net.log` 若没有写权限，把日志路径改成 `$HOME/kg-ensure-net.log`。）

---

## 4. 修改生产 Caddy（最危险的一步，带回滚）(需要 go)

**为什么危险**：这台 Caddy 在服务你现在的生产站点。改坏了，生产也会受影响。所以：先摸清情况、先备份、改完先"验证"再"重载"，任何一步不对都回滚。
**绝不要**用 `vim`/`sed -i` 去改 Caddyfile：如果 Caddyfile 是"单个文件挂载"进容器的，这些工具会换掉文件的 inode，容器里读到的还是旧文件（"改了没生效"，甚至下次重启才炸）。**只用追加**（`>>`），原地写，inode 不变。

### 4.0 先记下"改之前"的现网状态（回滚后用来对比）

```bash
$ curl -sI https://<API域名>:8443/ | head -1
```
预期：一行 `HTTP/2 200`（或你平时看到的状态，原样抄下来：______）。

### 4.1 摸清 Caddyfile 怎么挂进容器的

```bash
$ docker inspect <Caddy容器名> --format '{{json .Mounts}}' | tr ',' '\n' | grep -E '"Source"|"Destination"'
```
预期：能看到一对 `Source`（宿主机路径）→ `Destination`（容器内路径，通常 `/etc/caddy/Caddyfile` 或 `/etc/caddy`）。把宿主机上那个 Caddyfile 的完整路径填进第 1 章的 `<Caddyfile路径>`。
- `Destination` 以 `Caddyfile` 结尾 = **单文件挂载**（最容易踩 inode 的坑，所以只追加）。
- `Destination` 是目录 = 目录挂载（追加同样安全）。

### 4.2 确认 Caddy 的管理接口开着（reload 要用）

```bash
$ docker exec <Caddy容器名> wget -qO- localhost:2019/config/ | head -c 80
```
预期：一小段 JSON，以 `{"admin":` 或 `{"apps":` 开头。
**如果什么都没打印或报错 → 停下来问我，不要重启容器**（说明管理接口被关了，reload 不能用）。

### 4.3 漂移检查：现在跑着的配置 = Caddyfile 里写的吗？

```bash
$ docker exec <Caddy容器名> caddy adapt --config /etc/caddy/Caddyfile --adapter caddyfile | jq -S . > /tmp/kg-adapted.json
$ docker exec <Caddy容器名> wget -qO- localhost:2019/config/ | jq -S . > /tmp/kg-running.json
$ diff /tmp/kg-adapted.json /tmp/kg-running.json && echo "一致"
```
预期：`一致`。如果 `diff` 打印出差异 = 现在跑着的配置里有"没写进 Caddyfile 的改动"（以前有人热改过）。**停下来问我**：贸然 reload 会把那些改动抹掉。（服务器没装 `jq` 时：`sudo apt-get install -y jq`，或把两条命令里的 `jq -S .` 去掉后直接 diff，可能有排序噪声。）

### 4.4 备份 Caddyfile

```bash
$ cp -p <Caddyfile路径> <Caddyfile路径>.bak.$(date +%F-%H%M)
$ ls -l <Caddyfile路径>*
```
预期：除了原文件，多出一个 `Caddyfile.bak.2026-…`，大小相同。**记下这个备份文件名**：______（回滚要用）。

### 4.5 追加站点块

```bash
$ echo >> <Caddyfile路径>
$ cat /srv/kg-sync/Caddyfile.snippet >> <Caddyfile路径>
$ tail -n 16 <Caddyfile路径>
```
预期：末尾能看到 `kg.ccincd.shop:8443 {` … `}` 这一段。

核对"宿主机上的文件"和"容器里读到的文件"是同一份（inode 陷阱检查）：

```bash
$ sha256sum <Caddyfile路径>
$ docker exec <Caddy容器名> sha256sum /etc/caddy/Caddyfile
```
预期：**两个哈希完全相同**。不同 = 容器读到的还是旧文件 → 立刻按 4.8 回滚并问我。（Caddyfile 在容器里的路径若不是 `/etc/caddy/Caddyfile`，用 4.1 看到的 `Destination`。）

### 4.6 先验证，再重载

```bash
$ docker exec <Caddy容器名> caddy validate --config /etc/caddy/Caddyfile
```
预期：最后一行 `Valid configuration`。**不是这句 → 不要 reload，直接 4.8 回滚。**

```bash
$ docker exec <Caddy容器名> caddy reload --config /etc/caddy/Caddyfile
```
预期：没有 `error` 字样（可能有几行 JSON 日志）。reload 是平滑切换，不中断现有连接。

### 4.7 验证

```bash
$ curl -sI https://<API域名>:8443/ | head -1
```
预期：和 4.0 抄下的**一样**（生产没被影响）。

```bash
$ curl -s https://kg.ccincd.shop:8443/healthz
```
预期：`{"ok":true,"backupAgeH":null}`（首次申请证书可能要等 10–30 秒，等一会儿再试一次）。

```bash
$ docker logs <Caddy容器名> 2>&1 | grep -i 'certificate obtained' | grep kg.ccincd.shop | tail -1
```
预期：一行日志，含 `certificate obtained successfully` 和 `kg.ccincd.shop`。

### 4.8 回滚（任何一步不对就做这个）

```bash
$ cp -p <Caddyfile路径>.bak.<你记下的时间> <Caddyfile路径>
$ docker exec <Caddy容器名> caddy validate --config /etc/caddy/Caddyfile
$ docker exec <Caddy容器名> caddy reload --config /etc/caddy/Caddyfile
$ curl -sI https://<API域名>:8443/ | head -1
```
预期：最后一条回到 4.0 抄下的状态。（`cp` 覆盖已有文件是**原地写入**，inode 不变，单文件挂载也安全。）
如果要彻底撤掉本服务：再接着做第 11 章。

---

## 5. 冒烟测试（部署后第一次，从"另一台设备"）(需要 go)

在**爸爸网络里的另一台设备**（笔记本即可，**关掉 VPN/代理**），装有 Node 18 以上，把 `smoke-remote.mjs` 拷过去：

```bash
$ KG_ENROLL_CODE='<开通码>' node smoke-remote.mjs https://kg.ccincd.shop:8443
```
预期（每行 `ok`，耗时数字不同）：

```
  ok   GET /healthz  200 38 ms backupAgeH=null
  ok   POST /v1/enroll (测试家庭)  201
  ok   PUT /v1/stores/smoke-test  200 41 ms
  ok   GET /v1/stores/smoke-test 与写入一致  200 36 ms
  ok   POST /v1/ledger  200
  ok   GET /v1/ledger  200
  ok   GET /v1/state  200 caps.pause=false
  ok   POST /v1/pair (只检查拿到 6 位配对码)  200
  ok   DELETE 用错误的删除令牌被拒绝(403)  403
  ok   DELETE /v1/family (删除测试家庭)  204
  ok   删除后该钥匙返回 401  401

冒烟通过
```
失败时的常见原因：`403`=开通码不对；`507`=家庭数已满；`429`=一小时内开通次数用完；`s=0` 加错误名 = 网络不通（DNS/防火墙 8443/证书）。测试家庭会被自动删除，不留痕迹。

---

## 6. 备份：服务内自动 + 异地拉取

### 6.1 服务内自动备份（已经在做）

每天 UTC 03:00 之后的第一次检查（每 10 分钟查一次）会在**服务进程内部**做一次备份（不另开进程，不占额外内存），保留最近 **14 个日备份 + 8 个周日备份**。第一次备份会在启动后约 15 秒（如果当时已过 03:00 UTC）或当天 03:00 UTC 做。

```bash
$ ls -l /srv/kg-sync/data/backup && cat /srv/kg-sync/data/backup/LAST_OK
```
预期：有 `kg-d-2026-…db` 和 `LAST_OK`；`LAST_OK` 是一行 JSON，里面 `"integrity":"ok"`。

```bash
$ curl -s https://kg.ccincd.shop:8443/healthz
```
预期：`backupAgeH` 从 `null` 变成一个数字（比如 `2.4`，表示 2.4 小时前备份的）。**超过 36 说明备份停了**。

### 6.2 异地拉取（强烈建议，一次性设置）

道理：服务器和备份在同一台机器，机器丢了就全丢。所以让**另一台机器**（推荐你的国内机；**不要用公司电脑**）每晚把备份"只读"拉回去。

**(a) 在国内机上生成专用钥匙**（只用来拉备份）

```bash
$ ssh-keygen -t ed25519 -f ~/.ssh/kg_pull -N '' -C kg-pull && cat ~/.ssh/kg_pull.pub
```
预期：打印一行以 `ssh-ed25519 AAAA…` 开头的公钥。

**(b) 在海外服务器上授权这把钥匙，并把它"锁死"成只能读备份目录**

先确认 `rrsync` 在：

```bash
$ command -v rrsync || ls /usr/share/doc/rsync/scripts/rrsync*
```
预期：打印出一个路径（如 `/usr/bin/rrsync`）。没有就 `sudo apt-get install -y rsync`（新版自带），仍没有就问我。

```bash
$ sudo chmod 755 /srv/kg-sync/data /srv/kg-sync/data/backup
$ echo 'command="rrsync -ro /srv/kg-sync/data/backup",restrict <把(a)里那一整行公钥粘在这里>' >> ~/.ssh/authorized_keys
```
（`~` 是你登录服务器的那个用户。`restrict` 关掉了端口转发、终端等一切；`rrsync -ro` 让这把钥匙**只能只读地**同步备份目录。）

**(c) 在国内机上第一次连接（接受服务器指纹）并试拉**

```bash
$ ssh -i ~/.ssh/kg_pull -o IdentitiesOnly=yes <用户>@<服务器>
```
预期：先问 `Are you sure you want to continue connecting`，输入 `yes`；然后因为钥匙是受限的，会马上看到 `rrsync` 的报错或直接断开——**这是正常的**，目的只是把服务器指纹记下来。

把 `pull-backups.sh` 拷到国内机（例如 `~/kg-tools/`），然后：

```bash
$ cd ~/kg-tools && chmod +x pull-backups.sh
$ KG_REMOTE=<用户>@<服务器> ./pull-backups.sh -v
```
预期：

```
拉取 <用户>@<服务器>:./ -> /home/…/kg-backup/
integrity_check ok (/home/…/kg-backup/kg-d-2026-….db)
完成: 最新 kg-d-2026-….db, 本机共 N 个备份文件
```
（没装 `sqlite3` 时会显示"跳过 integrity_check"，只做文件头检查，也算通过。）

**(d) 每晚自动拉（国内机 crontab）**

```bash
$ (crontab -l 2>/dev/null; echo '30 4 * * * cd ~/kg-tools && KG_REMOTE=<用户>@<服务器> ./pull-backups.sh >> ~/kg-pull.log 2>&1') | crontab -
```
脚本**成功时完全静默**，只有出事（连不上、备份超过 36 小时没更新、文件损坏）才输出并以非 0 退出——把 cron 的邮件/你已有的告警渠道接上即可。本机默认保留 30 天。

### 6.3 外部监控（接你已有的 Bark / 邮件 / 飞书）

在任何一台能上网的机器上：

```bash
$ KG_HEALTH_URL=https://kg.ccincd.shop:8443/healthz ./check-health.sh
```
预期：`云存档正常, 最近备份 2.4 小时前`，退出码 0。服务不通或备份超过 36 小时，会打印原因并以 1 退出。接告警：`./check-health.sh || <你的告警命令>`，建议每小时一次。

---

## 7. 日常与月检

**每月一次（5 分钟）**，服务器上：

| 检查 | 命令 | 正常 |
|---|---|---|
| 是否健康、有没有重启过 | `docker inspect kg-sync --format '{{.RestartCount}} {{.State.Health.Status}}'` | `0 healthy`（重启次数很小且不增长） |
| 最近日志有没有 error | `docker logs --since 720h kg-sync 2>&1 \| grep -c '"ev":"error"'` | `0` |
| 备份新鲜吗 | `cat /srv/kg-sync/data/backup/LAST_OK` | `at` 是 24 小时内；`"integrity":"ok"` |
| 磁盘 | `df -h /srv/kg-sync/data` | 使用率 < 60% |
| 账本容量 | `docker exec kg-sync node /app/server.mjs status` | `events` 远小于 20000（达到 16000 家长页会提示 80%） |
| Docker 占用 | `docker system df` | 没有异常膨胀 |
| 异地副本 | 在国内机 `ls -lt ~/kg-backup \| head -3` | 最新文件是今天或昨天 |
| 证书（Caddy 自动续） | `echo \| openssl s_client -connect kg.ccincd.shop:8443 -servername kg.ccincd.shop 2>/dev/null \| openssl x509 -noout -enddate` | `notAfter` 在 20 天以后 |

---

## 8. 更新程序（有新版 `server.mjs` 时）(需要 go)

原则：先备份，先留旧镜像，构建后健康才算成功，不健康就回退。

```bash
$ cd /srv/kg-sync
$ docker exec kg-sync node /app/server.mjs backup /data/backup/pre-update-$(date +%F-%H%M).db
```
预期：`{"backup":"/data/backup/pre-update-2026-….db","integrity":"ok"}`（`pre-update-` 开头的文件不会被每晚的轮换删掉，更新稳定后手动删）。

把新文件放上去（同 3.1：在 Mac 上 `rsync -av --exclude data --exclude .env docs/ops/kg-sync/ <用户>@<服务器>:/srv/kg-sync/`），再：

```bash
$ sha256sum -c SHA256SUMS                         # 全部 OK
$ docker tag kg-sync:local kg-sync:prev           # 留住旧镜像，回退用
$ docker compose up -d --build
$ sleep 30 && docker compose ps                  # STATUS 里要看到 (healthy)
$ curl -s https://kg.ccincd.shop:8443/healthz     # {"ok":true,...}
```
**成功的标志**：`healthy` + `healthz` 返回 `ok:true`。

**回退**（新版不健康、或行为不对）：

```bash
$ docker tag kg-sync:prev kg-sync:local && docker compose up -d --no-build
$ sleep 30 && docker compose ps
```
预期：回到 `healthy`。**如果回退后日志里是 `database schema N is newer than this server; refusing to start`**：说明新版已经升级了库结构，旧版读不了——这种情况**不要硬来**，用更新前的备份还原（第 10 章 10.2），或者改为"向前修复"新版。

---

## 9. 紧急暂停（PAUSE）

**什么时候用**：怀疑家庭钥匙泄漏 / 看到异常流量 / 要做恢复或搬数据 / 磁盘告急 / 任何"我不确定"的时刻。

```bash
$ cd /srv/kg-sync && touch data/PAUSE
```
预期：无输出。**1 秒内生效，不用重启。**效果：
- 所有"写"请求（存档、账本、开通、配对、删除）返回 `503 paused`；
- 读照常（设备还能拉取）；`/healthz` 照常；
- 孩子完全无感：游戏本机进度照常保存，等恢复后自动补传；家长页会显示"云端暂停中"。

恢复：

```bash
$ rm /srv/kg-sync/data/PAUSE
```
预期：无输出，写入立刻恢复。

确认当前是否暂停：`ls /srv/kg-sync/data/PAUSE`（存在 = 暂停中）。暂停状态保存在文件里，重启也不会丢；**别忘了处理完要删**。

更狠一档：`docker compose stop`（服务整个停掉，设备静默离线，本机数据不受影响）；`docker compose start` 恢复。

---

## 10. 恢复

备份是 SQLite 单文件。恢复命令会：检查文件完整性 → 删除旧库遗留的 `-wal/-shm` → 拷成新库 → **换一个新的 epoch**（设备看到新 epoch 后会清掉游标，把自己手里的全部内容重新推一遍，所以"备份之后"新写的内容也会从设备找回来）。

### 10.1 恢复演练（**不碰线上**，建议部署后做一次）

```bash
$ cd /srv/kg-sync && ls data/backup
$ docker run --rm --user 1000:1000 -v "$PWD/data:/data" kg-sync:local node /app/server.mjs restore /data/backup/<某个 kg-d-….db> /data/drill.db
```
预期：`{"restored":true,"newEpoch":true}`。

```bash
$ docker run --rm --user 1000:1000 -e KG_DB=/data/drill.db -v "$PWD/data:/data" kg-sync:local node /app/server.mjs status
```
预期：一行 JSON，`families` 等数字和线上基本一致。然后清理演练文件：

```bash
$ rm -f data/drill.db data/drill.db-wal data/drill.db-shm
```
预期：无输出。（线上服务全程没被碰过。）

### 10.2 真实恢复（线上库坏了 / 要回到某个备份）(需要 go)

```bash
$ cd /srv/kg-sync
$ touch data/PAUSE && docker compose stop            # 先暂停并停服务
$ mkdir -p old && mv data/kg.db data/kg.db-wal data/kg.db-shm old/ 2>/dev/null; ls old
$ docker run --rm --user 1000:1000 -v "$PWD/data:/data" kg-sync:local node /app/server.mjs restore /data/backup/<要用的 kg-d-….db> /data/kg.db
```
预期：`{"restored":true,"newEpoch":true}`。

```bash
$ rm data/PAUSE && docker compose up -d
$ sleep 30 && docker compose ps                     # healthy
$ docker exec kg-sync node /app/server.mjs status   # families/events 合理
```
然后在孩子的 iPad 上打开游戏玩一下：几分钟内设备会发现 epoch 变了并自动补推。**孩子这边不用做任何事。**确认没问题后 `rm -r old`。

### 10.3 整台机器丢了

1. 新机器上从第 2 章开始重新部署（第 3、4 章）；**用新的开通码**（`.env` 里重新生成）。
2. 把异地副本放回去：`scp ~/kg-backup/kg-d-<最新>.db <服务器>:/srv/kg-sync/data/backup/`，再按 10.2 恢复。没有备份也行：
3. 各设备打开家长页点"重新登记"（用**同一把钥匙**，不用重输）→ 设备把本机数据全量重推。期间孩子玩游戏不受影响，本机数据一直都在。

---

## 11. 整体撤销（回到部署前，反向操作）

```bash
$ cp -p <Caddyfile路径>.bak.<4.4 记下的时间> <Caddyfile路径>        # 恢复 Caddyfile
$ docker exec <Caddy容器名> caddy validate --config /etc/caddy/Caddyfile
$ docker exec <Caddy容器名> caddy reload --config /etc/caddy/Caddyfile
$ curl -sI https://<API域名>:8443/ | head -1                      # 回到 4.0 抄下的状态
$ docker network disconnect kg-net <Caddy容器名>                   # 先让 Caddy 离开 kg-net
$ cd /srv/kg-sync && docker compose down                          # 再停服务、删网络
$ crontab -l | grep -v ensure-net.sh | crontab -                  # 去掉每 5 分钟补连
```
预期：每条都没有 error；最后 `docker ps` 里没有 `kg-sync`，`docker network ls` 里没有 `kg-net`。数据还在 `/srv/kg-sync/data`（想彻底删除再 `sudo rm -r /srv/kg-sync/data`）。孩子的游戏照常玩，云同步状态变成"离线"，本机进度不受影响。

---

## 12. 出了问题怎么办

| 看到的现象 | 可能原因 | 怎么查 / 怎么办 |
|---|---|---|
| `docker compose ps` 显示 `unhealthy` | 服务没起来或卡死 | `docker logs --tail 30 kg-sync`；多半是 `.env` 有误；改完 `docker compose up -d` |
| 容器不停重启 | 启动校验没过 | `docker logs --tail 5 kg-sync`：`KG_TRUST_PROXY must be set…` / `KG_ENROLL_CODE … required` → 补 `.env`；`database schema N is newer…` → 见第 8 章回退说明 |
| `curl https://kg.ccincd.shop:8443/healthz` 502 | Caddy 找不到 kg-sync | `docker network inspect kg-net --format '{{range .Containers}}{{.Name}} {{end}}'` 应同时含 `kg-sync` 和 Caddy 容器名；缺 Caddy → `./ensure-net.sh` |
| 同上，连接超时 / 证书错误 | DNS、防火墙 8443、证书未签发 | `dig +short kg.ccincd.shop`；`docker logs <Caddy容器名> 2>&1 \| grep -i kg.ccincd.shop \| tail`；`too many failed authorizations` = 等一小时 |
| 设备写入都是 `503 paused` | 忘了删 PAUSE | `ls data/PAUSE`，有就 `rm data/PAUSE` |
| 设备写入都是 `507 disk_guard` | 剩余空间低于 `KG_MIN_FREE_MB` 或库超过 `KG_DB_MAX_MB` | `df -h data`、`docker exec kg-sync node /app/server.mjs status`；单独分区的记得 `KG_MIN_FREE_MB=64`（3.4） |
| 开通返回 `403` | 开通码错 / 超过 `KG_ENROLL_OPEN_UNTIL` | 核对 `.env`；改后 `docker compose up -d` |
| 开通返回 `507 full` | 家庭数已达 `KG_MAX_FAMILIES`（默认 3） | `docker exec kg-sync node /app/server.mjs status` 看 `families` |
| 开通/配对返回 `429` | 触发限流（防暴力） | 等一小时（开通）/ 一分钟（配对）；不是故障 |
| 设备写账本返回 `413 ledger_full` | 账本到顶（20000 条 / 4 MB） | 约 4 年才会遇到；联系我评估提高上限 |
| 备份 `backupAgeH` 很大或 `null` | 备份没跑 | `docker logs kg-sync 2>&1 \| grep '"ev":"backup"'`；看是否有 `"ok":false`；`df -h data` |
| 内存告警 | 不应该发生（实测 55–105 MB，上限 256 MB） | `docker stats --no-stream kg-sync`；持续 > 200 MB 就先 PAUSE 再问我 |

**求助时请贴**：`docker compose ps`、`docker logs --tail 50 kg-sync`、`docker exec kg-sync node /app/server.mjs status` 三条的输出（里面没有任何密钥或孩子的数据）。

---

## 13. 附录

### 13.1 环境变量（都在 `.env`；改完执行 `docker compose up -d` 生效）

| 变量 | 默认 | 说明 |
|---|---|---|
| `KG_ENROLL_CODE` | （必填） | 开通码，≥ 12 位随机；开通完成后建议换新 |
| `KG_ORIGINS` | （必填） | 允许的网页来源，逗号分隔，不能写 `*` |
| `KG_ENROLL_OPEN_UNTIL` | `0` | 开通截止（Unix 秒）；`0` = 不限；过了这个时间任何人都开通不了 |
| `KG_TRUST_PROXY` / `KG_PROXY_CIDR` | `1` / `172.30.77.0/24` | 只信任 kg-net 网段内的对端传来的 `X-Forwarded-For` |
| `KG_ALLOW_LOCALHOST` | `0` | 仅本机调试设 `1` |
| `KG_MAX_FAMILIES` | `3` | 家庭数上限 |
| `KG_MIN_FREE_MB` | `3072` | 磁盘守卫：剩余空间低于它就拒绝写入；单独分区用 `64` |
| `KG_DB_MAX_MB` | `100` | 库文件 + WAL 超过它就拒绝写入 |
| `NODE_IMAGE` | `node:22-slim` | 基础镜像，请钉摘要（3.3） |
| `CADDY_CONTAINER` | （无） | 仅 `ensure-net.sh` 用 |

写死在 `compose.yml` 里的硬限制：内存 256 MB（含 swap）、0.5 CPU、64 个进程、只读根文件系统、`/tmp` 16 MB tmpfs、非 root(1000)、去掉全部 capability、`no-new-privileges`、不发布宿主端口、Docker 日志 5 MB × 3 个文件轮转。

### 13.2 服务的上限（防滥用，心里有数即可）

每个家庭：最多 32 个存档槽、每槽密文 ≤ 64 KB、合计 ≤ 1 MB；账本 ≤ 20000 条且 ≤ 4 MB；单个请求体 ≤ 90 KB。限流：每来源 240 次/分、每家庭 300 次/分；错误密钥按"来源"和"来源+家庭"计数，**正确的钥匙永远不会被拦**。

### 13.3 安全自检清单（部署后做一次，逐条核对）

- [ ] `git grep -nE '[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}' -- docs/ops/kg-sync` 只出现 `127.0.0.1`、`0.0.0.0`、`172.30.77.x`（仓库里没有真实 IP）。
- [ ] `docker compose ps` 的 `PORTS` 没有 `->`（3.5）。
- [ ] `docker inspect` 体检输出为 `1000:1000 true 268435456 ["ALL"] map[]`（3.5）。
- [ ] `ls -l .env` 显示 `-rw-------`；`git status` 里看不到 `.env` 和 `data/`。
- [ ] `docker network inspect kg-net` 里 `Internal` 为 `true`；kg-sync 不在任何生产网络里：`docker inspect kg-sync --format '{{json .NetworkSettings.Networks}}'` 只有 `kg-net`。
- [ ] 冒烟（第 5 章）全部 `ok`。
- [ ] 异地拉取至少成功过一次（6.2）；恢复演练做过一次（10.1）。

### 13.4 改了本目录文件之后

改了 `server.mjs`、`Dockerfile`、`compose.yml`、`Caddyfile.snippet`、`.env.example` 或任何脚本，必须重新生成校验和并提交：`./make-sums.sh`（`tests/sync-server/bundle.test.ts` 会核对，忘了会报红）。`RUNBOOK.md` 不在校验和里，可以随时改。
