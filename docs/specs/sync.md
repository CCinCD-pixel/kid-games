# 星港云存档 · sync · 构建规格 v1.1

> 2026-10-20 ｜ v1.1 = v1.0 + 两份对抗评审（安全 1 阻塞 12 主要 10 次要；合并 4 阻塞 18 主要 7 次要）的修订，逐条处理见**附录 B** ｜ 读者：实现代理（本规格 + `docs/GAME_AUTHORING.md` + `docs/specs/star-pets.md`）
> 背景：孩子（6y3m，"小步步"）要"过关赚币、养宠物、装饰小窝"，进度只放浏览器不再安全。爸爸要求**异步、文件式、本地优先**，用他的**海外服务器**（国内机无证书，https 页会拦混合内容）。
> **数字全部来自可运行原型** `~/kid-games-work/specs/sync-tools/`（`./run-all.sh` 全跑，附录 A）；构建时移植为 TS，用例原样当回归测试。**仲裁**：账本**信封与排序契约归本规格**（§8.4：`lc`+`d`+`id`），star-pets §3 据此修订。

---

## 0. 一屏速览
- **是什么**：每个 `createStore` 存档、家长设置、账本被**密封成不透明信封**（AES-GCM，钥匙由 160 位"家庭钥匙"派生，只在设备上），异步备份到爸爸海外机的小服务（Node 22 + SQLite，256 MB 容器）。localStorage 永远是唯一真相；同步只是后台"拉→合并→推"，**失败静默**，孩子看不到任何东西。
- **合并不靠墙钟**：声明式规则树，全是交换+结合+幂等的纯函数；LWW 用 Lamport。**会降低的值**（难度档、重开的关卡、自适应控制器）走 LWW 或世代，不用 max；**重置**用槽世代 `g`；金币走独立追加通道（§8.4）。
- **应用时机**：远端结果进**收件箱**，下次页面打开、`load()` 之前并入；游戏局中不被换底；金币余额只在**安全点**变化。
- **服务器不懂内容**：上限按**条数+字节+行开销**计；磁盘守卫；远程急停；旧版客户端不能覆盖新版本。
- **配对**：6 位码 + **先承诺后揭示**的 6 位暗号（对主动中间人 1e-6）；钥匙不进 URL，带逐组校验位。
- **部署**：子域 `kg.ccincd.shop:8443` + 既有 Caddy 加站点块（**只此一案**）；专用 docker 网络；Docker 日志轮转；服务内夜间备份 + **异地拉取**。**先做真 iPad 连通测试（S2），再写客户端接入**。
- **实测**（附录 A，全部重跑）：属性 357 028 项、变异 22/22、账本 306 528 项、语义断言 78、自合并中性 2 400 操作、模拟器 10 场景×2 000 段、服务器 89 项断言，全部 0 失败。工作量 **≈18 个 session**（§8.1）。

### 0A. v1 范围（构建以本节为准）
| 项 | 内容 |
|---|---|
| 同步对象 | 9 个存档：xiangqi、**chess**、mars-base、gear-fort、snake-battle、sokoban、military-chess、emoji-match、**memory-matrix（重做版）**；`settings`、`hub-seen`、`metrics`、`economy`；**金币账本通道**（清单 §4.1） |
| 客户端/服务器 | `kit/clock`（设备 id+Lamport，无需开通）· `kit/sync/*` · 家长页「云存档」· 导出导入联动；`docs/ops/kg-sync/`（服务器、Docker、Caddy、备份、RUNBOOK；**不改 netlify.toml**） |
| **不做（v1.1/v2）** | 实时；账本封存段（v1.1）；设备列表与单设备吊销；局中续玩跨设备；PIN/游玩日志同步；"忘了钥匙"找回；`/v1/beacon` |
| 砍单顺序（先砍后者） | QR → `metrics` → `hub-seen` → 配对 UI 打磨（退回手输 47 字符钥匙）→ 游戏只留玩得最多的 4 个。**绝不砍**：密封信封、合并引擎+全部测试门槛、账本通道、世代重置、epoch 自愈、撤销/急停/重新登记、磁盘与配额守卫、早期真机连通性、导出联动、sim2 门槛 |

---

## 1. 威胁模型与隐私
目标：币/宠物/进度不因换设备、清缓存、无痕、重装丢失；永不打断游戏；不拖垮机上生产服务；公开仓库无秘密。
| 资产 / 对手 | 威胁 → 对策 |
|---|---|
| 进度/币/宠物 | 服务器是**可丢弃副本**，每台设备本机另一份；服务器丢/回滚/重建→epoch 自愈（§4.4）；**异地拉取**备份（§6.4）；家长页每月提示导出文件 |
| 家庭钥匙、开通码 | 钥匙只在设备 `kg:sync:v1:key`（导出排除 `kg:sync:*`），不进 URL/日志/仓库；**默认遮罩（长按显示）、无"复制"**，只给"存到文件/密码"与打印，提示勿截图；开通码只在爸爸脑中和服务器 `.env`(0600)，≥12 位随机，开通后轮换，`KG_ENROLL_OPEN_UNTIL` 限期 |
| 家长页 PIN（**软门**） | 忘记 PIN 的重置只是乘法题（`site/parent` forgotPin），孩子能过。故显示钥匙/移除钥匙/删除云端=长按 3 秒+再输 PIN+倒计时；**移除钥匙需重输其中 2 组并先导出文件**；PIN 重置后 24 小时冻结这三项。PIN 只防误触 |
| 扫描/暴力 | 128 位 fid+256 位 auth；未知家庭与错钥匙同路径常数时间（差 0.03 ms）；失败计数按"来源+(来源,fid)"，**合法钥匙永不被封**；开通需开通码，家庭 ≤**3**（只限爸爸自家）|
| **配对中间人** | v1.0 的 SAS=H(A‖B) 被自适应碰撞（平均约 1.4 万次、≤0.5 s，20/20 成功）。v1.1：B 先交 H(bpub‖nB)，A 才揭示 apub，B 最后揭示；暗号 6 位=H(apub‖bpub‖nB)，攻击者须在看到对方值前定钥匙→单次 1e-6（实测 2/3/4 位成功率 1.0e-2/1.1e-3/1.1e-4=理论基线，磨刀无增益）。**不防已拿到钥匙的人**（持钥匙=可读可写） |
| 恶意服务器 | AAD 绑定 `fid\|槽\|版本`（账本 `fid\|ledger:<id>\|v`，明文 id 须等于外层 id）；篡改/串槽/换 id 回放→解密失败即拒。可见元数据：槽名、大小、时间、账本条数与到达时间、IP 盐哈希；备份留约 2 个月，"删除云端"=密码学删除 |
| 滥用/DoS | 条数+字节+行开销三重上限（§5）、磁盘守卫、日志采样；泄漏钥匙最坏=写满家庭配额（≤5 MB），不会写满磁盘 |
| 同机其他容器 | 专用网络 `kg-net`；`X-Forwarded-For` 只认 `KG_PROXY_CIDR` 内的对端；`KG_TRUST_PROXY` 未显式设置→拒绝启动 |
| 钥匙泄漏 | "重置云存档（换新钥匙）"（§3.6）；`DELETE` 需由钥匙派生的**删除令牌**（只有 Bearer 删不了） |
| Safari 7 天清理 | 仅**浏览器标签页**；主屏 App 不受限→**开通/加入/配对必须在主屏 App 内做**（`navigator.standalone` 检测），爸爸的 iPhone 也要装成主屏 App |
隐私：无姓名/邮箱/设备指纹；`displayName` 可能是真名但被密封；家长页开启时写一句"加密后存在爸爸的海外服务器；服务器看不到内容，但能看到有哪些游戏、何时同步"；对外开放需另立规格。

---

## 2. 架构：十二条定案
1. **状态式同步**：传"去掉本机专属字段的整个存档状态"；账本除外。
2. **声明式规则树**（`kit/sync/merge.ts`←`merge.mjs`）：每个叶子须被非 `any` 规则或 `local`(X) 覆盖；按存档类型做类型检查（`RuleOf<T>`，加字段不写规则=编译错），CI 禁 `rest:any`。
3. **LWW 戳** `[lc,dev]`：Lamport；设备计数器**仅安装时**用墙钟种子一次（`lcSeed`，≤2^33），此后只靠 `max(lc,远端)+1`。
4. **会降低的值不用 max**：难度档/自适应控制器=整组一个 LWW；重开的关卡=记录带世代 `g`（游戏在重开处 `g++`）；步骤指针=**目录序 `rank`**；FIFO=`fifo(cap)`，cap=游戏自己的上限（CI 校验）。
5. **槽世代 `g=[lc,dev]`**：`resetSlot(id)` 升高 g，**高世代整体胜出**，旧世代数据丢弃。浏览器清了游戏键（侧车还在）=**当作新加入**，不是重置。
6. **密封**：HKDF→`fid/auth/enc/del`；>256 B 先 gzip，IV 随机，AAD 绑定；30.5 KB 存档封 0.7 ms、密文 9.96 KB。
7. **原子性**：`侧车{pending}→数据→侧车终态`，开机 `reconcile`；同步只在**打开的页面**里跑，页面死亡则整轮作废。
8. **版本**：服务器按槽存 `v`，低版本 PUT→409；远端更高→`blocked`；更低→纯函数 `migrateFrom` 后再合并。
9. **epoch 自愈**：恢复/重建服务器→新 epoch→设备清游标、**重推全部持有的事件（含收件箱）与状态**；401→"云端找不到本家庭"→同一把钥匙**重新登记**。
10. **只在前台工作**；被杀前最多丢"上次推送之后"的新内容，本机仍在。
11. **默认关闭**：无 `kg:sync:v1:key` 时 0 请求 0 定时器；`kit/clock` 与账本本机功能不依赖 sync。
12. **总闸**：入口 try/catch + 特性检测（`crypto.subtle`、`CompressionStream/DecompressionStream`、localStorage）→不满足状态 `unsupported`；`kg:sync:v1:killed` 一键关；非安全上下文（局域网 http 调试）下游戏照常。

---

## 3. 客户端 `kit/sync/*`

### 3.1 API 与接入纪律（接入顺序错一次=收件箱永不生效，故做成"写不错"）
```ts
createStore<T>(game, { version, defaults, migrate, sync?: { merge: RuleOf<T>, validate(x): boolean, migrateFrom(raw, from): T } })
// sync 在场 → 工厂在【第一次 load() 内部】先 reconcile 再并入收件箱；registerSync(store) 只挂触发器。CI lint：同步存档必须经此工厂。
syncNow(reason) · getSyncStatus() · onSyncStatus(cb) · resetSlot(id)      // 时钟/戳来自 kit/clock（§8.4）
// 家长页 admin.ts：enableNewFamily joinWithKey pairStart pairClaim pairApprove showKey pause removeKey deleteCloud resetFamily reEnroll setRole
```
- **包装器**：`createBoardStore`（`engines/board/save/adapter.ts`，xiangqi/chess 共用，**冻结**）只返回 `key/load/save/reset/envelope/update`→提 **EQ-sync-1**：转发 `opts.sync`，暴露 `version/defaults/migrateFrom/subscribe`。mars `SaveHandle`、snake `SaveCtl`、sokoban/emoji `SaveHandle` 必须经同一 store 的 `load()` 取数，不另存内存副本。
- **`validate`**：对**远端载荷合并前**与**合并结果写入/推送前**各跑游戏自己的校验（`isValidXqSave`、mars `sanitize`、snake `normalize`…）；不过→`err:'invalid'`、保留本机、不推送（否则一个坏结果毒化所有设备）。
- **`migrateFrom` 必须是纯函数**：不读存储、不用随机、X 字段取 `defaults()`，与 `load()` 迁移做等值单测；**不得复用有副作用的 `migrate()`**（xiangqi 的会把 live 键抄成 legacy 快照；mars v4→v5 会作废引导）。顺序：迁移远端→validate→合并。
- **写 save 的纪律**：会降低的字段只能是 LWW/世代字段；撤销不靠删数组元素，map 键要删写 `null`；FIFO cap=规则 cap。**每个游戏规格必附"非单调写入点审计表"**（谁、在哪、把什么降低/删除/重开、用哪条规则）；`neutral.mjs` 用真实写法跑，空表=没审计。
- **重置入口**：`store.reset()`、emoji-match「重置本游戏进度」(`parent.ts`→`resetProgress`)、military-chess「清空本游戏进度」(`parent.ts:115`) 都调 `resetSlot(id)`，确认框写明"**云端的这份也会清空**"。账本永不重置（只能追加 `adjust`）；一次性奖励 id 终身一次，重置**不会**重发。
- kit 加法：`Store.subscribe/version/defaults/migrateFrom`；`exportProgress` 排除 `kg:sync:*`、`kg:clock`；`importProgress` 对 `kg:v1:economy` 取并集（§8.4），导入后 `syncNow('import')`（单调字段不被旧备份拉低、不触发重置；已开通时先同步一轮并提示"未同步的新内容会被文件替换"）。

### 3.2 侧车、原子性与触发器
侧车键（localStorage，带 `sv`；总预算 **≤600 KB**，均不导出）：`kg:sync:v1:` + `key`{钥匙,fid,base} · `side:<id>`{rev,stamps,slots,ords,seen,g,pushedHash,v,pending?} · `inbox:<id>` · `led:side`{cursor,pushedLc,pushedNat,resend,epoch} · `ledger:inbox` · `stat` · `role`；撤销快照在 IndexedDB。`kg:clock:v1`{dev,lc} 归 kit/clock（不导出）。
- **sum**：游戏存纯数字 V，线上是分槽 `{dev:n}`；我的槽=`max(已知, V−他人已知之和)`，所以 **V 与侧车必须一起更新**：应用收件箱按 `侧车{pending:{dataCanon,终态}}→数据→侧车终态→删收件箱`，开机 `reconcile`（数据与 pending 相符=采纳，否则丢弃）。缺此步 torn write 使计数永久多算（`no-pending` 变异被抓）。epoch 重置：先清各槽 rev（幂等），**最后**写 epoch 标记。
- **dirty**=`hash(上传形态)≠pushedHash`（只改 X 字段的保存不触发请求）；盖戳在拉取之后。
- **新加入设备**：LWW 值盖最低戳；游戏键缺失但侧车在=**浏览器清了**→当新加入（rev/stamps 归零、`seen`=defaults 基线，世代与 sum 槽保留），不是重置。**克隆设备**（iCloud 还原到第二台）：检测→换新 dev id、把现值**全部记在旧 id 名下**（max 合并，不重复）、重盖戳、`resend` 一次。
- **触发器**：加载后 800 ms 一轮（不阻塞首屏）；保存后去抖 3 s、同槽≥15 s；回前台(>5 min)/`online` 立即；`hidden/pagehide` 冲刷（≤48 KB 用 keepalive，**尽力而为**，主路径是去抖冲刷）；可见时每 5 min±20%；单飞 `navigator.locks`（无则 60 s 租约）。
- **配额**：游戏存档写入永远优先；`QuotaExceeded` 时先丢收件箱/侧车（可由云端重建），状态 `quota`；Playwright 用 4.8 MB 填满验证。老页遇更高 `sv`→本页只读（不写侧车不推送），状态 `client-old`。

### 3.3 一轮同步（`sim2.mjs` 的 `cycleGen`）
`GET /v1/state`（epoch≠记录值或 rev/seq 回退→清游标、重推全部）→每槽（远端 rev≠已知或 dirty）：`GET`→v 更高 `blocked`→**validate/migrateFrom**→`merge(本机上传形态,远端)`（**合并时才取本机数据**，局中改动不丢）→结果写**收件箱**→与远端不同则 `PUT If-Match`（412→重拉重并≤3 次；409→`blocked('local-older')`）→账本：推 `d==我 && lc>pushedLc` 与**未确认的自然事件**（`pushedLc`=本批最大 lc，**不是**当前 lc——飞行中新增的事件下轮仍要推；epoch 变/克隆→推**事件库+收件箱里全部**），拉 `seq>cursor` 写 `ledger:inbox`。400 `bad_event{bad[]}`→把这些事件隔离进 `led.bad`（不再重试，家长页可见），继续推其余。
### 3.4 退避、失败 UX、401
退避 `min(30 min,5 s×3ⁿ)±20%`；超时 15 s/轮 60 s；慢线路只做 state+推送。游戏/大厅**无任何提示**；家长页：状态灯+上次成功+待传+`立即同步`+最近错误（区分：网络不通 / **站点域名未加入 KG_ORIGINS**（高级→诊断用 no-cors 探 `/healthz`）/ 请更新应用 / **云端找不到本家庭（点此用本机钥匙重新登记）** / 钥匙被拒 / 云端已满 / 解密失败 / 配额 / 暂停）。**401**：低频重试（24 h，前台）；"重新登记"=同钥匙 `POST /v1/enroll`（需开通码；409=成功）→新 epoch→全量重推，本机进度不受影响。已开启且>24 h 无成功→概览小黄点。
### 3.5 连通性（真实 iPad 路线是最大未知数，**S2 先验证**）
本机 Mac 到 `<现网 API 域名>:8443`：TLS 0.8–1.3 s、总 2.0–2.7 s，但 connect 仅 3–6 ms=走了本地代理，**不代表 iPad**。S2：DNS+只 `respond "ok"` 的站点块（或 S1 真容器）→爸爸在**家里 Wi-Fi 与蜂窝各一次、关闭一切 VPN/代理**，用 Safari 打开 `https://kg.ccincd.shop:8443/healthz`，记录耗时；不通→立即启动备选（换端口/IP/供应商），客户端工作不开始。
### 3.6 开通、加入、配对、撤销（家长页，PIN 之后）
- **开通**：开通码→生成 S→`POST /v1/enroll {fid,auth,del,code}`→首轮全量→显示钥匙 `ABCDE-FGHIJ-…`（8 组×(4 位+1 校验位)=40 字符+7 横线；单字符错 100% 检出并指出第几组，相邻互换 ≈92%）；**须随机重输其中 2 组才能完成**。**先**把全部 `kg:*` 快照存 IndexedDB（留 3 份）并提示"导出备份文件"。
- **加入已有家庭**：本机有进度→弹窗 **[取云端，并把本机备份成文件]（默认）/ [合并]**。**设备角色** `play`（默认）/ `parent`（爸爸手机：拉 settings+metrics，只推 settings）/ `test`（QA：只拉不推，永不污染孩子账号；或用**独立测试家庭**）。**验收先用一次性测试家庭**（开通→测→删），再开真实家庭。
- **配对（v1.1）**：A `POST /v1/pair`（**不传公钥**）得 6 位码（180 秒单次）；B `claim {code,commit=H(bpub‖nB),label∈枚举}`；A 见 commit 后才 `POST apub`；B 取到 apub 后才 `reveal {bpub,nB}`；A 校验 commit；两屏显示 6 位暗号；家长确认一致点允许→A 用 ECDH 密钥+`aad=pid` 封钥匙上传，B 取走即删；`label` 只用 textContent 渲染。reveal 后窗口延至 120 秒（总上限 300）。B 的码放请求头 `X-KG-Pair-Code`（不进 URL/日志）；双方各 2 s 轮询（≤30 次/分）；家长在 reveal 后 20/60/100 秒点允许都成功，130 秒超时提示重来（`pair-test.mjs` 虚拟时钟）。
- **撤销/急停/重置**：「撤销最近一次云合并」（从快照回滚并暂停）；服务器 `touch data/PAUSE`→全体设备只读；"**暂停同步**"（保留钥匙，默认）≠"**移除本机钥匙**"（PIN+重输 2 组+已导出）；"**重置云存档（换新钥匙）**"：新 S→旧家庭删除(或留 7 天)→本机全量推新家庭→其他设备 401 后输入新钥匙/配对；`SYNC_BASE` 覆盖只接受同注册域 `https://`，更换即清游标重握手。

---

## 4. 存档清单、规则、版本、模拟器

### 4.1 清单（`createStore(` 全树扫描 + 读 TS 类型 + 读真实写入点；可运行规则树在 `schemas.mjs`，构建时移植进各游戏 `save.ts`，**构建前先做逐游戏审计表**）
代号：**M** max · **m** min · **O** 布尔只升 · **U** 并集 · **K** 枚举取高 · **L** LWW · **S** 分槽求和 · **R** 环(ord=元素自带) · **F** FIFO(cap=游戏 cap) · **G** 世代守卫 · **P** 整条取更进展 · **X** 本机专属。
| 同步 id | 规则要点（括号=评审改动） | X |
|---|---|---|
| `xiangqi` v2 | lessons{stars K, **stepId=目录序 rank**, puzzleIx M, done/known O}；robots{w/d/l S, unlocked O, badges/xjWon U, loseStreak/easy L, helpTier/wall M}；battles/xj M·K·O；**puzzles{done/firstTry F800, daily/recent30 L, tier L（游戏会降档）}**；history R30(ord=t, 毫秒时间戳)；settings **仅 houseRules L、coachOn 逐键 L**；stats S；intro/placement O | `game` 及其余设置 |
| `chess` v1（棋手学院） | 与 xiangqi 同构；puzzles.review L；cards U；stars M（经 `createBoardStore`，EQ-sync-1） | `game` 等 |
| `mars-base` v5 | nodes **G**{st K, why K（`g` 更高者整体胜出，可"清除 why"）, stars/plays M, ft 取长, bridge O}——游戏在 `cert.ts recordProvisional`、`adaptive.ts failDirectProbe` 的重开处 `g++`；tags 整条 L；cert P；probes/tutorials/onboarded O；session/lastPlayed/buildings/baseLevel/checker M；cards/visited U；orbit.tests R40、errors.recent R12、recent R300(ord=visit)；direct L | `salt mission directOffer race.inProgress settings` |
| `gear-fort` v1 | levels/puzzles/jinnang/almanac/coach 按 K·M·m·O；counters M；learned/story/decks U；current/fastTrack L | `resume kernelVersion settings`、IDB |
| `snake-battle` v1 | missions/venues 按 M·m·K·O；`life.*` 17 个计数 **S**；owned/seenTips U；equipped/cardQueue/tipDay L | `inProgress settings` |
| `sokoban` v1 | levels{best m(含 legacy `null`), stars K, clean/firstClean/legacy/cert O, plays/hintMax M}；cert.at/finale m；stats.* **S（activeMs 已达 2.6e9）**；cosmetics{owned U, equipped L}；random 逐位 M | `inProgress settings` |
| `military-chess` v1 | items{stars K, best/tries/at M}；ladder 三轨数组逐位 M；family 计数 **S**、`log` R60（**元素是毫秒数**）；settings **仅 fanFlagRule L**（`unlockAll/aiOverride` 是测试开关） | `resume puzzleResume` 与其余设置 |
| `emoji-match` v1 | levels K·M；puzzles O；`boosters` 整体 L（消耗品；**新做的消耗品一律走账本**）；grants/intros/arrivals/sky U | `resume settings` |
| `memory-matrix` v1（重做） | **sectors 每个扇区 = 一个 LWW 寄存器**（自适应控制器的档位上下都动）；recent L；nights/nightsAny M；tutorial/introSeen O；cards U；veteran L | `settings lastSeen` |
| `economy` | pet = `Record<键, 值\|null>` map L（null=删除）；seen U；`ledger` 走账本通道；`dev` 改用 kit/clock | — |
| `settings` | displayName/narration/pinyin/hiddenGames L | **`skipIntros` `unlockAll`（测试开关）** |
| `hub-seen` · `metrics` | U · map L，键 `<game>@<设备标签>`（各设备只写自己的键；家长页显示"iPad，2 小时前"） | `kg:hub:v1`（派生，每次开游戏重算，**不同步**） |
**设置分级**：GLOBAL（displayName narration pinyin hiddenGames + xiangqi/chess houseRules、xiangqi coachOn、military-chess fanFlagRule）；DEVICE（操控、特效、左右手、音乐…）与 TEST（skipIntros、unlockAll、aiOverride）= X；新设置默认 X，lint 扫每个 `defaults().settings` 叶子。**S 名单**（家长页指标读的计数）：xiangqi `stats.* robots.*.w/d/l`；snake `life.*`；sokoban `stats.*`；military-chess `family.* stats.*`（用 M 时 iPad 占 90% 少算 10.0%，S 为 0）。
**不同步**：游玩日志 `kg:log:v1`、`kg:launch`、`kg:parent:*`、局中状态(`game/mission/resume/inProgress`/IDB)、旧页键 `kg:v1:legacy-*`、`pre-v5-*`/`.bak`、`kg:dev:*`、`kg:hub:v1/tab/visited`、`kg:sync:*`、`kg:clock`。**登记表 CI**：每个 `createStore` id 必须在 `STORE_IDS` 或 `NOT_SYNCED`（现树 9 个 id 全部登记）；未建的游戏（lane-defense 等）上线时补行；`docs/GAME_AUTHORING.md` 加"Sync 小节"（规则树 + X 清单 + 非单调写入点表为规格必填项）。

### 4.2 规则细则（每条都有对应失败演示）
- **数值上限**：max/min/环 ord 到 2^53−1，sum 槽到 2^40。v1.0 的 1e12/1e9 上限把 `Date.now()`(1.79e12) 与 `activeMs` 2.6e9 当垃圾丢掉，`overlay` 还把本机值删了——xiangqi 对局历史、mars `lastActiveAt`、military-chess `family.log` 全被清空。现在 `overlay` **永不因合并结果缺值删本机值**（可表示的值被世代"清除"除外）；未知枚举值是 passenger（最低序、不删）；`__proto__`/继承键一律丢弃。
- **步骤指针**：字符串 max 在 xiangqi 11 对、chess 16 对步骤上选了更早的（`G1.9`>`G1.10`）；自然序在 xiangqi 仍错 11 对（第 7 课后有步骤 `B1`）；**按目录序 rank：1 322/1 322**（`coverage.mjs` 读真实 `content/*/lessons.v1.json`）。
- **FIFO**：原 `U` 把数组按字母序重排并在 4 000 处按字母截断；`fifo(cap)` 线上形态 `{id: lc}`，每 id 取最大 lc、留最新 cap 个（结合律成立，测试含 cap=3 小窗）。
- **会降的字段**：xiangqi `puzzles.tier` 被游戏降档，旧规则 `M` 使云端副本成棘轮，**单设备**也被撤销（38/2 496 次同步检查失败，改 L 后 0）；mars 重开节点用 `g`（缺 `g++` 的负对照被抓 20 次）。
- **叶子覆盖**：真实 `defaults()` 里 map 为空，看不到记录字段（sokoban 28 叶，`LevelRec` 0 个）；改在**满字段样本**上查（364 叶：320 规则+44 X+0 未覆盖；给 `LevelRec` 加无规则字段立即报错）并要求 `rest:any` 为空；13 个带 cap 的规则逐个对照游戏 cap。

### 4.3 版本与冲突
信封 `{fmt,v,env}`；`fmt` 比本客户端新→整体 `blocked('client-old')`；服务器按槽存 `v`，低版本 PUT→409；远端 `v` 更高→该槽 `blocked`（家长页"更新应用"，本机照常玩）；更低→`migrateFrom`。**任何形状变化、新枚举值、更长 id 都必须升 `version`**（kit 规则+规则 token 对 TS 联合类型的测试）。路径改名则旧戳丢弃；老客户端忽略且不删不认识的槽。

### 4.4 模拟器 `sim2.mjs`（CI 门槛；v1.0 的 `sim.mjs` 只证明"理想化客户端上的合并核心"，已取代）
模拟**定案的设计**：请求排队延迟乱序、响应可丢，不同设备的 GET/PUT 交错（412 重试环真正跑到）；游戏持**内存副本**，远端结果进收件箱、页面重开才并入；侧车/数据按 §3.2 顺序写，**任一同步写入点可崩溃或 QuotaExceeded**；**非单调写入**（tier 降档、节点重开、FIFO 移出、游戏重置、浏览器清键）；服务器 epoch/恢复/**整机丢失（401→同钥匙重新登记）**/旧版本 409；时钟偏差、擦除、**克隆设备 id**、应用升级 v1→v2；账本按 §8.4。每段结束后停故障、各设备跑到稳定再检查：数据/戳/世代与服务器逐位相同；事件除"唯一持有者被清"外都在；余额每步 ≥0 且各设备相同；**到达批余额降幅 ≤ 批内 spend 之和**；一次性奖励 ≤1 条；Lamport 新戳恒大于旧戳；服务器 `v` 不倒退；单设备星/拥有/卡片/教程/最佳单调（世代边界除外）；重置后无旧世代键；节点状态必是其世代内被写过的值；清键不升世代；**sum 在 B/E/F 与真值精确相等**。
| 场景（各 2 000 段，220 步×3 台） | 违规 | 事件 | 丢失：清存储 / 整机丢后无持有者 | 原谅占发放 |
|---|---|---|---|---|
| A 全部故障+擦除+整机丢+重置+克隆+清键+v1/v2 | **0** | 96 167 | 15 745 / 608 | 0.76% |
| B 无破坏（延迟/丢包/torn/配额/克隆，计数精确） | **0** | 97 924 | 0 / 0 | 1.08% |
| C 重置（陈旧设备后推、离线设备带旧进度回来） | **0** | 98 326 | 0 / 0 | 1.28% |
| D 整机丢+旧备份恢复（5 003 次重新登记） | **0** | 97 986 | 0 / 0 | 0.87% |
| **E 真实家庭（iPad 90%/手机 8%/备用 2%）** | **0** | 96 128 | 0 / 0 | **0.06%** |
| F 40% 丢包+长延迟 | **0** | 97 955 | 0 / 0 | 0.97% |
| G 旧"盲"客户端（无版本检查）与 v2 并存 | **0** | 97 783 | 0 / 0 | 0.93% |
| H 浏览器清单个游戏键（无重置） | **0** | 98 392 | 0 / 0 | 1.09% |
| I / J 作者设备消失+整机丢+恢复（J：页面很少重开，金币久躺收件箱） | **0** | 88 994 / 89 495 | 54 220 / 2 692 · 54 421 / 2 648 | 0.06% / 0.08% |
收敛 ≤2 轮（A 最多 4）；无内容 PUT 0 次；迟到 earn 被已原谅透支吸收的金额占到达金额 0.01%（E）–0.07%，Lamport 种子再降约 30%（E：73 对 103）。**变异 12/12 被抓**（`no-pending` `no-resend` `resend-no-inbox` `ledger-replace` `stale-lc` `pushed-now` `no-regen` `live-ledger` `no-v-check` `missing-as-reset` `gen-ignore` `gv-ignore-g`）。**模拟器自己找出并已修入本规格的 6 个缺陷**：`pushedLc` 竞态、自然事件无法按 lc 追踪、重推漏收件箱、epoch 重置非崩溃安全、同步轮在已崩溃页面里继续、克隆设备计数重复。

---

## 5. 服务器（`docs/ops/kg-sync/server.mjs`，原型已跑通）
Node ≥22.16 零依赖单文件，SQLite WAL。表 `meta(epoch)` `family(fid, sha256(auth), sha256(del), 计数)` `store` `ledger` `pair`；`PRAGMA user_version`（比库新的镜像拒绝启动，只向前升级）。
| API（`Authorization: Bearer <fid>.<auth>`） | 要点 |
|---|---|
| `GET /healthz` | 无认证；`{ok, backupAgeH}` |
| `POST /v1/enroll {fid,auth,del,code}` | 开通码常数时间比较；5 次/小时/来源、全局 10 次/小时；`KG_ENROLL_OPEN_UNTIL`；家庭 ≤3；已存在 409（同钥匙重新登记=成功） |
| `GET /v1/state` | `{epoch, stores:{id:{rev,v}}, ledger:{seq,bytes,count}, caps:{…,pause}}` |
| `GET/PUT /v1/stores/:id` | PUT 必带 `If-Match`；412 带当前 rev；`v` 更低 409 |
| `POST/GET /v1/ledger` | ≤200 条/批；坏事件→400 `{bad:[下标]}`；id 正则 `^[A-Za-z0-9:._-]{3,96}$`（与 `kit/economy` 同源） |
| 配对（A 认证；B 凭 pid+头部码） | `POST /v1/pair` · `POST …/claim {code,commit,label}` · `GET …/:pid`(A) · `POST …/apub`(A) · `GET …/apub`(B) · `POST …/reveal`(B，服务器核对承诺) · `POST …/grant`(A) · `GET …/grant`(B，取走即删) |
| `DELETE /v1/family` | 头 `X-KG-Delete-Token`（由钥匙派生，库里只存哈希）；级联删除 |

**上限（行字节=密文+id 长度+64，并按条数）**：信封解码后 ≥29 B、首字节 0|1、规范 base64url（**0/1 字节信封与空 env 全拒**）；槽密文 ≤64 KB、≤32 个槽/家庭、合计 ≤1 MB；账本 ≤**20 000 条且 ≤4 MB**（≈12.6 条/天→4 年以上）；体 ≤90 KB；`/v1/state` 恒 <6 KB。80% 家长页提示；100%→413 `ledger_full`，本机继续记账、状态 `full`、红点（**不静默**）。
**磁盘守卫**：写前 `statfs`，剩余 <3 GB 或库+WAL >100 MB→507（读照常）；运维另给 `/data` 一个固定大小回环文件系统（512 MB ext4 镜像，防与生产库共盘写满）。**急停**：`touch data/PAUSE`→写 503 `paused`、`caps.pause`，无需重启。
**鉴权**：未知 fid 与错钥匙同路径常数时间；失败桶按"来源"(30/15 min) 与"(来源,fid)"(10/15 min)，**合法钥匙从不被拦**（家里 iPad/iPhone 共出口 IP，爸爸输错不会封 iPad）；每家庭 300/分、每来源 240/分；限流表硬上限（超 5 万项淘汰最旧 10%），IPv6 按 /64。**来源 IP**：`KG_TRUST_PROXY` 未显式设 0/1→拒绝启动；=1 须配 `KG_PROXY_CIDR`，**仅当对端在该网段才信 XFF 最右项**（伪造 XFF 的 45 次请求落入同一桶）。**CORS**：`KG_ORIGINS` 逗号列表（正式+预览域，无 `*`），`KG_ALLOW_LOCALHOST` 默认 0。**日志**：JSON，无 Authorization/体/码/密文/完整 fid/账本 id（17 探针 0 泄漏），同来源噪声每分钟 ≤5 行。**备份**：进程内每晚 `backup()`→`kg-d-日期.db`(14)+周日 `kg-w-日期.db`(8)，`integrity_check`，写 `LAST_OK`；CLI `backup/restore/status/health`；`restore` 先删旧 `-wal/-shm`、换 epoch。
**实测**（`load.mjs`，Node 22.21，89/89）：20 000 个混合请求/32 并发：≈1.5 万 rps、p99 ≈7.5 ms、0 非预期错误；RSS 53→78 MB，**与备份并发峰值 105 MB**；Docker 健康检查若用 `node -e fetch` 另占 49 MB（合计 154 MB >128 MB，v1.0 的上限确实太小）→改 **bash `/dev/tcp` 探活 1.7 MB**、容器 **256 MB**。

---

## 6. 部署（爸爸那台**已在跑生产服务**的海外机；**未经爸爸对每一步明确同意不得执行**）
### 6.1 路由：只留子域（**砍掉**路径方案 B）
`kg.ccincd.shop:8443` 独立站点块（独立证书/日志/限流）；Caddy 既有 :80（HTTP-01）与 :8443。换机器只改 DNS；`SYNC_BASE=https://kg.ccincd.shop:8443`。
### 6.2 交付包 `docs/ops/kg-sync/`（公开仓库无秘密/IP；`data/`、`.env` 入 `.gitignore`）
`server.mjs` · `Dockerfile`（`FROM node:22-slim@sha256:…`，摘要取自 `docker buildx imagetools inspect node:22-slim`；`USER node`；`HEALTHCHECK --interval=60s` 用 `bash -c 'exec 3<>/dev/tcp/127.0.0.1/8787 && printf "GET /healthz HTTP/1.0\r\n\r\n" >&3 && head -1 <&3 | grep -q 200'`）· `compose.yml` · `Caddyfile.snippet` · `.env.example` · `ensure-net.sh` · `RUNBOOK.md` · `SHA256SUMS`。
**compose**：项目 `kg-sync`；**自建网络 `kg-net`**（由 compose 创建，`internal: true`，固定子网 `172.30.77.0/24`），kg-sync 只加入它——不进生产网络（被攻破时碰不到 postgres/redis，也不拖累生产栈 `compose down`）；`read_only`、`tmpfs /tmp`、`user 1000`、`cap_drop ALL`、`no-new-privileges`、`mem_limit=memswap_limit=256m`、`cpus 0.5`、`pids_limit 64`、`NODE_OPTIONS=--max-old-space-size=96`、`restart unless-stopped`、**`logging: {driver: json-file, options: {max-size: "5m", max-file: "3"}}`**、卷 `./data:/data`（先 `install -d -o 1000 -g 1000 data data/backup`）、不发布宿主端口。
**`.env.example`**：`KG_ENROLL_CODE=`(`openssl rand -base64 12`) `KG_ORIGINS=` `KG_TRUST_PROXY=1` `KG_PROXY_CIDR=172.30.77.0/24` `KG_ALLOW_LOCALHOST=0` `KG_MAX_FAMILIES=3` `KG_BACKUP_DIR=/data/backup`。
**`Caddyfile.snippet`**：`kg.ccincd.shop:8443 { encode zstd gzip; request_body { max_size 100KB }; log { output discard }; header -Server; reverse_proxy kg-sync:8787 { header_up X-Forwarded-For {remote_host}; health_uri /healthz } }`
### 6.3 生产 Caddy 修改清单（每步有预期输出，失败即回滚）
0. `docker inspect <caddy> --format '{{json .Mounts}}'` 看 Caddyfile 是**单文件挂载**还是目录挂载；`docker exec <caddy> wget -qO- localhost:2019/config/ | head -c 80` 有内容（admin API 未关；若 admin off→**停下问爸爸，不要重启容器**）。
1. 漂移检查：`caddy adapt` 的输出与 `curl localhost:2019/config/` 用 `jq -S` 对比；不一致=有未应用改动，先问爸爸。
2. `cp -p Caddyfile Caddyfile.bak.$(date +%F-%H%M)`；**inode 陷阱**：单文件挂载时 `vim/sed -i` 换 inode，容器仍读旧文件——只用 `cat snippet >> Caddyfile`，并核对宿主与 `docker exec <caddy> sha256sum /etc/caddy/Caddyfile` 相同；若 Caddyfile 所在**目录**整体挂载，可改放独立文件 `kg.caddy` 并在主文件加一行 `import kg.caddy`（先 `docker exec <caddy> ls` 确认容器内可见）。
3. `dig +short kg.ccincd.shop` 必须等于现网 API 域名的同一 IP（灰云、TTL 300），否则 ACME 失败会占 Let's Encrypt 额度（5 次/小时/主机名）。
4. `docker compose up -d`（创建 `kg-net`）→`compose ps` healthy；`docker network connect kg-net <caddy>`（热操作；`ensure-net.sh` 每 5 分钟补连，应对生产栈重建 Caddy）。
5. `docker exec <caddy> caddy validate --config /etc/caddy/Caddyfile` → `caddy reload --config /etc/caddy/Caddyfile`。
6. 验证：`curl -sI https://<现网 API 域名>:8443/` 仍 200；`curl https://kg.ccincd.shop:8443/healthz` 返回 `{"ok":true,…}`；`docker logs <caddy>` 含 kg 主机名的 "certificate obtained"。
7. 回滚：`cp -p Caddyfile.bak.<时间> Caddyfile && docker exec <caddy> caddy reload …`；`docker network disconnect kg-net <caddy>`；`docker compose down`。
### 6.4 备份、异地、恢复、监控
- **异地拉取（v1 就做）**：备份是密文（库里只有密封信封+哈希+配对密文），放哪都安全。评估：①**爸爸国内机每晚 `rsync` 拉**（ssh 受限密钥+服务器端 `rrsync -ro /srv/kg-sync/data/backup`，留 30 天；GFW 偶抖但每晚几 MB、重试即可）——**推荐**；②家里 Mac（不要用公司电脑）；③服务商快照（付费、同账号风险）；④家长页每月导出文件。取①+④。agent **不做** ssh/rsync，只写脚本与命令。
- **恢复**：`docker compose stop`→移走 `kg.db*`→`docker run --rm -v ./data:/data kg-sync node server.mjs restore /data/backup/<文件>`→`up -d`→`curl /v1/state` 看 epoch 变了→观察客户端自愈。**整机丢失**：新机部署→新开通码→各设备点"重新登记"（同钥匙）→全量重推，期间本机数据不受影响。
- **监控**：`/healthz` 的 `backupAgeH`（>36 h 告警，走爸爸已有的 Bark/邮件/飞书）；`docker exec kg-sync node server.mjs status`；RUNBOOK 月检清单（`docker system df`、日志、LAST_OK、restartCount）。
- **更新**：发布附 SHA-256 与提交号；`docker tag kg-sync:local kg-sync:prev`→构建→健康→失败回滚。**上线解耦**：客户端默认关，服务器冒烟通过且爸爸输入开通码才启用。

---

## 7. 测试与验证（门槛；括号=原型实测，`./run-all.sh` 全部重跑）
| 层 | 内容与门槛 |
|---|---|
| 合并属性 `props.mjs` | 17 棵规则树×3 000 随机三元组×(5 定律+**2 项"维度"：合并结果在各规则自己的序里 ≥ 每个输入**)=357 028 项 0 失败；垃圾 JSON、`__proto__`/`constructor` 模糊每树 300；`overlay` 往返恒等（满字段样本含 1.79e12、1e13、长 id、null） |
| 变异 `mutants.mjs` | 22 个合并变异（含"合法但错"的 max→min、or→and、并集→交集、rank 反序，及 cap=1e12、sum 上限 1e9、overlay 删本机值、世代无视…）+账本 1 个，**必须全抓：22/22、1/1**；只靠定律的 v1.0 套件仅 11/22。门槛：≥12 个且全杀 |
| 语义断言 `semantic.mjs` | 78 条：真实游戏形状样本+手写期望值（stepId 目录序、`activeMs` 2.6e9+1e9=3.6e9、tier 降档与重开保留、FIFO 丢最旧、重置不复活、清键后云端回来…） |
| 自合并中性 `neutral.mjs` | 8 个存档用真实写法（含降档/重开/FIFO 移出/环截断/重置）2 400 次操作，**每次后同步一轮状态必须不变**，被动设备收敛（2 496 次检查 0 失败；v1.0 的 tier=max 规则失败 38 次、缺 `g++` 的负对照失败 20 次）。构建时改跑各游戏自己的 bot/求解器 |
| 覆盖/cap/登记 `coverage.mjs` | 364 叶（320 规则+44 X）0 未覆盖；13 个 cap 对照游戏；`createStore` id 全登记；目录序 rank 1 322/1 322 |
| 账本 `ledger-props.mjs` | 306 528 项：并集（含**同 id 不同内容**）幂等/交换/结合、排列不变、≥0、earn/grant 不降、spend 不升且**降幅≤其金额**、到达批降幅≤批内 spend 之和、封存段恒等+晚到事件、14 种真实 id 形状、9 种非法事件 |
| 加密 `crypto-test.mjs` | 密封负例 4/4；账本 AAD（换 id/换槽/明文 id 不符 3/3）；钥匙校验：单字符错 49 600/49 600 检出并定位分组、相邻互换 ≈92%、随机双错 99.8%、换组 40/40；v1.0 SAS 自适应攻击 20/20；v1.1 攻击者成功率=理论基线 |
| 服务器 | `load.mjs` 89 项；`hygiene.mjs`（时序差 0.03 ms，17 探针 0 泄漏）；`pair-test.mjs`（虚拟时钟：家长 20/60/100 秒后点允许成功，130 秒超时）；`unit.mjs` 8 项；**部署后**从爸爸网络内另一台设备跑 `smoke-remote`（测试家庭 enroll→put→get→ledger→delete） |
| 假服务器 vitest | ≥80 条，含：bad_event 隔离、401→重新登记、epoch 重置崩溃安全、pending 对账、克隆换 id、浏览器清键、重置与陈旧设备、工厂首次 `load()` 已含收件箱（每游戏）、`validate` 拒毒结果、`migrateFrom` 纯函数等值、非安全上下文游戏照常、`killed` 键、配额满、更高 `sv` 只读 |
| Playwright WebKit | iPad(gen 7) 竖/横+iPhone 13；单浏览器 try/finally；`?mute=1`+`tools/qa/mute-audio.js`（**全程无声**）；真 `server.mjs`：①双 context 收敛 ②`route.abort()` 断网 0 console error ③延迟 3/12 s 不影响首屏 ④空 context 配对取回（含**等 60 秒再点允许**）⑤remote-newer 只在家长页 ⑥4.8 MB 填满 localStorage 游戏照常存 ⑦A 重置、陈旧 B 后推 ⑧测试角色不污染 |
**安全清单**（逐项勾选，证据=测试名）：上表各项 + 秘密不入库(`git grep` 钥匙/开通码/IP 0 命中) + 容器(`docker inspect`：非 root/只读/cap_drop/256 MB/无宿主端口/专用网络) + 客户端(钥匙不在 URL/console/导出/剪贴板)。

---

## 8. 工作包、待办、账本契约
### 8.1 session（诚实估计 **≈18**，范围 15–20；每个 100–130 次工具调用）。**连通性与服务器加固先于任何游戏接入**
| # | 内容 | 依赖 |
|---|---|---|
| S0 | 爸爸：DNS+占位站点块（§6.3） | — |
| S1 | 服务器包：加固版 `server.mjs`、Docker/compose/Caddy/备份/RUNBOOK 与四个服务器测试入仓库 | — |
| **S2** | **真 iPad 连通门槛**：Wi-Fi/蜂窝、无 VPN 打开 `/healthz`，记录耗时；不通则切备选 | S0,S1 |
| S3 | `merge.ts` 移植+满字段样本+维度/语义/变异/覆盖测试；**逐游戏非单调写入点审计表**（先于任何游戏代码） | — |
| S4 | `kit/clock`、加密、钥匙码、侧车/原子写/reconcile、触发器、工厂、收件箱、总闸 | S3 |
| S5 | 假服务器 vitest+sim2 进 `npm test` | S3,S4 |
| S6 | 家长页「云存档」：开通(重输 2 组)、状态、暂停/移除钥匙、重新登记、重置云存档、角色、撤销快照 | S4 |
| S7 | **配对**（客户端+服务器联调+暗号 UI）+Playwright（含等 60 秒） | S1,S4,S6 |
| S8 | 账本通道+`kit/economy` 共用折叠/向量+与 star-pets 对账（§8.4）+`importProgress` 并集 | S4,star-pets 修订 |
| S9–S11 | 游戏接入：①xiangqi+chess(EQ-sync-1) ②mars-base+memory-matrix+sokoban ③snake+military-chess+emoji-match+gear-fort；每个：RuleOf<T>、审计表、`validate`、纯 `migrateFrom`、重置入口、中性测试 | S3–S5 |
| S12 | Playwright 全套（断网/延迟/配额/重置/角色） | S9–S11 |
| S13 | 安全清单+两位独立评审+压测 | S7,S12 |
| S14 | 部署+远端冒烟+恢复演练+异地拉取（**需爸爸 go**） | S2,S13 |
| S15 | 测试家庭验收→真实家庭开通 | S14 |
| S16–S18 | 修复轮与缓冲（两位评审各可能 1 轮） | |
关键路径=爸爸侧等待；S1/S3 可并行；砍单见 §0A。

### 8.2 v1.1 / v2
账本封存段 · 设备列表与单设备吊销 · 游玩日志摘要 · PIN 同步 · 局中续玩跨设备 · QR · `/v1/beacon` · 管理 CLI · 钥匙卡 PDF · 家长页看币流水。

### 8.3 爸爸的待办（默认值已替你定好，每项有命令与预期输出，随时可叫停）
1 DNS：给 `kg` 加一条 **A 记录指向与 API 域名相同的 IP，灰云，TTL 300**（`dig +short <api域名> kg.ccincd.shop` 两行相同）· 2 只走子域（已定）· 3 开通码：服务器上 `openssl rand -base64 12`（脚本打印一次，只存 `.env`，不发聊天）· 4 谁部署：(a) 爸爸按 §6.3 约 10 条命令；(b) agent 只读查网络名，之后每步等爸爸说"go" · 5 备份：服务器内自动 14 日+8 周；**异地拉取**用国内机（给 3 行 cron+受限密钥命令）· 6 开通时钥匙存进密码管理器/打印，并按提示重输 2 组 · 7 验收：**关闭 VPN/代理，Wi-Fi 与蜂窝各测一次**，先在测试家庭上做 · 8 确认：透支原谅（不收回物品）、并发设置"后到者胜"、游玩日志暂不同步、`skipIntros/unlockAll` 不再跨设备。

### 8.4 账本契约（**本节为准**；star-pets §3 据此修订；`ledger.mjs` 是可运行的参照实现）
**事件**（明文，一条一封；AAD `fid|ledger:<id>|v`，解密后 `ev.id` 必须等于外层 id）：`{id, d, lc, ts, kind, amount, src, ref}`
- `id` `^[A-Za-z0-9:._-]{3,96}$`（**唯一字符集**，`kit/economy` 导出 `ID_RE`，服务器/测试 import；含 `. : - _`）。随机 id=`<d>.<ts36>.<seq36>`；**自然 id**（终身一次）=`first:<game>:<ref>`（如 `first:mars-base:orbit.O1.0`）· `m:<类>:<键>` · `u:<规则>` · `egg:<线>` · `g:<物品>` · `d1:<日期>` · `rf:<被退 id>` · `retro:*`。
- `d` `^[A-Za-z0-9]{1,16}$` 设备 id（`kit/clock` 安装随机数；自然事件固定 `'n'`）；`lc` Lamport 整数 0..2^40（`kit/clock.tick()`，与 sync 是否开通无关；安装时用墙钟种子**一次**，§2-3）；`ts` 展示用毫秒，**永不参与排序**。
- **符号**：`kind ∈ earn|spend|grant`，`amount` **无符号**整数 0..100 000，`spend` 为减；`amount=0` 合法（送物品/蛋/货架解锁=`grant` 0）；`src≤32` `ref≤48`。非法事件合并时丢弃并计数，不抛错。**只增不改不删**；纠错、退货、家长调整都是新事件。
- **自然事件是规范事件** `{id, d:'n', lc:0, ts:0, kind, amount, src, ref}`，后四项查 `content/star-pets/economy.json`（金额只能是 id 的函数；校验器拒绝不符者，CI 对每个内容 id 跑）。理由：服务器按 id 先到先得，两台设备必须产出**字节相同**的事件，否则各持一份、折叠不同。代价：它们在折叠中排最前（只会被其后已原谅的透支吸收，界≤已原谅总额）。同 id 不同内容（违约）确定性取较小 `(lc,d,JSON)`，绝不按金额文本。重置游戏进度**不**重发。
- **折叠**：按 `(lc,d,id)` 排序，`b←max(0,b±amount)`；`balance` 与 `forgiven`（被原谅的透支总额）都是**事件集合的纯函数**，与到达顺序/重复/批次无关（306 528 项检查）。
**孩子看到的余额**：①显示余额=本机折叠；远端事件先入 `ledger:inbox`，只在**安全点**并入：页面打开（`load()` 之前）、回到主界面、购买动画结束后；**绝不在界面显示或购买确认的中途**。②保证：**孩子看到的余额只会因他自己花掉币（在任一设备上）而下降**——并入一批远端事件后，降幅≤该批 `spend` 之和；不含 `spend` 的批次不会降低余额；本机新记的事件 `lc` 最大排最后，**创建时立即全额可见**（sim2 全场景 0 违规）。③购买前校验本机折叠余额≥价。两台离线各花同一笔→折叠把透支"原谅"为 0（**孩子两件都留，什么都不收回**，无黑暗模式）。代价是微量通胀：真实家庭（E）占发放 0.06%，极端并发/丢包约 1%。**迟到的 earn 可被其后位置已原谅的透支吸收**（界≤已原谅总额；实测占到达金额 0.01%）；退货按原价入账会多给"已原谅的那部分"，同样≤已原谅总额——接受，只在家长页 `forgiven` 统计出现，孩子界面不显示。④种子：新装/重装设备的 `lc` 起点远大于老设备，其事件天然排后面（吸收金额约 -30%）。
**导入/重置**：`importProgress` 对 `kg:v1:economy` 永远并集（账本按 id、`pet` 逐键 LWW、`seen` 并集），文件里的 `dev/lc` 忽略；无"清空账本"入口；游戏世代重置不触及账本；"重置云存档"把本机账本全量上传到新家庭；"删除云端"后本机账本仍在。
**压缩（v1.1，与集合并集折叠兼容）**：**不用"检查点替换前缀"**（晚到的低序事件会使其失效，且没有设备登记表）。改**重编码封存**：按规范序每 500 条封成不可变段（gzip 后约 15 B/条，原 139 B），折叠输入集合不变，晚到事件仍是独立事件，折叠结果恒同（`ledger-props` 证）。v1 不需要：20 000 条/4 MB≈4 年。容量/配额见 §5（80% 提示、100% 红点）与 §3.2（游戏存档写入优先、侧车 ≤600 KB）。
**star-pets 必须据此改**：①事件加 `d`、`lc`（来自 `kit/clock`，不是 sync），保留无符号 `amount`+`kind`；②**排序改 `(lc,d,id)`**，`ts` 仅展示，其 P1 仿真与"原谅率"按新序重跑，共用 `tests/economy/vectors.json`；③id 长度放宽到 3–96；④**自然事件改规范事件**（`d:'n',lc:0,ts:0`，删"只有 ts 不同"一句）；⑤`petState` 去掉 `{k,v,t,d}` 与墙钟 `t`，存 `Record<键,值|null>`（null=删除），戳由 sync 层盖；删 `economy.dev`，改用 `kit/clock`；⑥`importProgress` 并集（在 `kit/progress.ts` 实现并测）；⑦显示余额只在安全点变化、购买以事件呈现；⑧§9.6 改指向云存档状态页；⑨D5 在本节关闭。**双向清单**（测试编号两边共用）：L1 `ID_RE` 契约(每个 id 生成器与内容 id 过服务器校验) · L2 自然事件规范 · L3 折叠向量 · L4 安全点降幅界 · L5 导入并集 · L6 `kit/clock` 无 sync 可用 · L7 种子 · L8 封存段恒等。

---

## 附录 A 原型与复现（`~/kid-games-work/specs/sync-tools/`，零依赖；`./run-all.sh` 全跑，输出 `out/*.txt`）
`merge.mjs` `schemas.mjs`（规则树+满字段样本+默认值+cap 表+登记表）`dom.mjs` `props.mjs` `mutants.mjs` `semantic.mjs` `neutral.mjs` `coverage.mjs` `replica.mjs` · `ledger.mjs` `ledger-props.mjs` · `sim2.mjs` `mut-sim2.mjs` `inbox-resend.mjs` · `kgcrypto.mjs` `crypto-test.mjs` · `server.mjs` `load.mjs` `hygiene.mjs` `pair-test.mjs` `unit.mjs`（Node ≥22.13）。v1.0 的 `sim.mjs` 已由 `sim2.mjs` 取代（原文在 `sync-tools-v10-backup/`）。评审证据脚本（`state/rr/crit-sync-*`）的复现均已变成上述回归测试。

## 附录 B 评审意见处理（S=安全评审 23 项，M=合并评审 29 项；修=已修、部=部分、驳=驳回；右侧=位置）
**已修**：S1 §5 · S2 §1,§3.6 · S3 §3.6,§5 · S4 §3.4 · S5 §3.6,§5 · S6 §3.6,§5 · S7 §6.3 · S8 §6.2,§5 · S9 §5,§6.2 · S10 §6.2,§5 · S11 §1,§3.6 · S12 §3.5,§8.1 · S13 §6.4 · S14 §1,§3.6 · S16 §8.4,§7 · S17 §2-12 · S19 §6.2,§6.3 · S20 §1,§5 · S21 §3.5,§3.6 · S23 §8.1,§8.3 ｜ M1 §4.2 · M2 §8.4,§5 · M3 §8.4 · M4 §2-5,§3.1 · M5 §4.1,§4.2 · M6 §4.2 · M7 §4.2 · M8 §4.1 · M9 §3.6 · M10 §4.1 · M11 §4.1 · M12 §8.4 · M13 §8.4 · M15 §3.1 · M16 §3.1 · M17 §3.1 · M18 §3.2 · M19 §4.4 · M20 §7 · M22 §8.1 · M23 §3.4 · M24 §3.2 · M26 §3.2 · M27 §1 · M29 §8.4
**部分修**（理由）：S15 重置云存档与删除令牌已做（§3.6）；"max 类字段夹逼"只做到金额/id/lc/枚举——持钥匙=写权限，持钥匙者能写任何合法值，不假装能防。S18 服务端各项全修（§5）；`textContent` 渲染见 §3.6。S22 `/healthz` 指标+告警走爸爸已有渠道（§6.4），**不**用 UptimeRobot（需第三方账号）。M14 封存段设计、80% 提示、100% 红点、游戏存档优先已做；**驳回**"到顶只停非必要类"（账本每类都必要，改为提示+提高上限）；**驳回**"侧车搬 IndexedDB"（改 ≤600 KB 硬预算，IDB 只放撤销快照）。M21 满字段覆盖+禁 `any` 已在原型运行时验证；`RuleOf<T>` 是 TS 构建要求（§2-2）。M25 标明"尽力而为"、去抖冲刷为主；`/v1/beacon` 出 v1（`sendBeacon` 带不了 `Authorization`，须另开端点，列 v1.1）。M28 passenger 只对枚举做；长 id/新枚举靠"升 version"规则+测试。
**接受的残余风险**：公开客户端含 `kg.ccincd.shop` 主机名（S21）；配对中间人 1e-6；持钥匙者可写任意合法值；退货多给"已原谅部分"与晚到 earn 被吸收，两者均≤已原谅总额。

## 附录 C 构建备注（S1 服务器包，2026-10-20；只记与上文不同或上文未定的地方）
- **文件名**：编排文件叫 `compose.yml`（本规格 §6.2 的写法），不是 `docker-compose.yml`；`docker compose` 两个名字都认。交付包另含 `check-health.sh`（告警渠道用）、`smoke-remote.mjs`（§7 的 smoke-remote，部署后用）、`make-sums.sh`；`SHA256SUMS` 覆盖 10 个可部署文件（含 `.dockerignore`：构建上下文只带 `server.mjs`）（`RUNBOOK.md` 不在内，`bundle.test.ts` 核对其新鲜度）。
- **基础镜像摘要不入库**：离线拿不到 `node:22-slim` 的摘要，Dockerfile 用 `ARG NODE_IMAGE`，摘要由爸爸按 RUNBOOK 3.3 写进服务器 `.env`（`NODE_IMAGE=node:22-slim@sha256:…`）；不写则退回浮动标签。
- **磁盘守卫与 512 MB 回环文件系统相互咬合（§5 的遗漏）**：守卫看 `data/` 所在文件系统的剩余空间；默认 `KG_MIN_FREE_MB=3072` 在 512 MB 的回环盘上会**永远触发 507**。故用回环盘时必须设 `KG_MIN_FREE_MB=64`（`.env.example`、RUNBOOK 3.4 已写明；compose 透传该变量）。
- **服务器相对原型的修订（均有回归测试，29/29 变异全杀）**：①`POST /v1/ledger` 事件缺 `env`/`env` 非字符串时原型抛 TypeError→500，现为 400 `bad_event`；②账本到顶时**重复事件不再计费**（原型先计费后去重，已落地批次重试会被误报 `ledger_full`），越界批次仍整体回滚；③**PAUSE 拦所有状态变更**（开通、配对、删除、存档、账本；读与 `/healthz` 照常），原型只拦存档与账本；磁盘守卫同时覆盖开通与 `POST /v1/pair`；④配对认领：同一来源 15 分钟内失败 >10 次后**连"碰巧正确的码"也拒绝**（原型只拒错误猜测）；⑤备份改为**单文件**（`journal_mode=DELETE`，无 `-wal/-shm` 需随拷）、`LAST_OK` 原子写、触发时刻按 **UTC 小时**（`KG_BACKUP_HOUR` 默认 3）、CLI `backup` 复用同一快照函数；⑥`status` 只读打开且库不存在时报错而不是新建；⑦优雅退出时先 `wal_checkpoint(TRUNCATE)` 再关库；`uncaughtException/unhandledRejection` 记一行 `fatal` 后退出由 Docker 重启；⑧新增可调项 `KG_HEADERS_TIMEOUT_MS`、`KG_REQUEST_TIMEOUT_MS`（生产默认 10 s/15 s，测试用来把慢连接测试缩短到秒级）。
- **测试运行环境**：`tests/sync-server/*.test.ts`（auth 80 · pairing 12 · hygiene 13 · load 6 · bundle 33，共 144 条，约 6.5 s，端口 59000–59599，静默）由 Node 20 的 vitest 运行，但服务器需要 **Node ≥ 22.16**：测试按 `KG_NODE22` → 当前进程 → `~/.nvm` 最新 v22+ → Homebrew/`PATH` 的顺序找一个够新的 Node 去起真服务进程；**找不到则这些套件跳过**，CI 应设 `KG_REQUIRE_NODE22=1` 使其变成失败。需要虚拟时钟的场景（配对 TTL、限流窗口、DB 体积守卫、轮转）在同一个 Node 22 下以 `helpers/scn-*.mjs` 进程内运行。变异烟测驱动在 `~/kid-games-work/state/rr/s1/mutate.py`（把 `server.mjs` 临时改坏再跑测试，结束后还原）。
- **实测（容器外进程，带生产堆上限 `--max-old-space-size=96`，Node 22.21，20 000 个混合请求/32 并发）**：约 1.3 万 rps，p50 1.8 ms，p99 ≈ 9 ms；RSS 空闲 55 MB → 负载后 80 MB → 与夜间备份并发峰值 84 MB（容器上限 256 MB）。`docker compose config` 未能在本机验证（本机无 Docker）；`compose.yml` 已用 YAML 解析器检查语法，S14 部署时的 RUNBOOK 3.5 第一条就是 `docker compose config`。
