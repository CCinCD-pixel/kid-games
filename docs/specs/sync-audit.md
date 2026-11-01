# 星港云存档 · 非单调写入审计表（S3）

> 2026-10-20 ｜ 工作包 S3（`docs/specs/sync.md` §8.1：**先于任何游戏接入**）｜ 读者：S9–S11 游戏接入代理、爸爸
> 对象：`createStore` 的 9 个存档（xiangqi、chess、mars-base、gear-fort、snake-battle、sokoban、military-chess、emoji-match、memory-matrix）+ `settings`/`hub-seen`/`metrics` + 未建的 `economy` + 共享层（`engines/board/save/adapter.ts`、`kit/progress.ts`）。
> 方法：四路只读审计（逐文件 `grep -n` 核对，行号取 2026-10-20 工作树 `iter/rebuild-2026-10`，含未提交改动），再由 S3 把"规则缺口"落进可运行规则树 `tests/sync/support/schemas.ts` 并用真实 `defaults()` 与类型定义做漂移测试。**chess 代码尚未重建**，其行号是 `docs/specs/chess.md:LINE`，模板是 xiangqi 对应写入点。
> 图例同 `sync.md` §4.1：M max · m min · O 布尔只升 · U 并集 · K 枚举取高 · L LWW · S 分槽求和 · R 环 · F FIFO · G 世代守卫 · P 整条取更进展 · X 本机专属。"非单调写入"= 会让存储值下降、被删除、被重置、被无关值替换或"重开"的写入；它们**不得**用 M/m/O/U，必须是 L / G(`g++`) / X，否则云端副本是棘轮，会悄悄撤销这次写入。判据是**自合并中性**：写入后跑一轮同步，状态必须不变。

---

## 0. 结论（TL;DR）

**共 178 行逐点审计，最严重的 10 条（按"孩子会看到什么"排序）**

1. **8 个已建游戏全部在内存里长期持有一份存档并整份回写**（xiangqi `main.ts:32/38/48` + 各屏 `ctx.save`；sokoban `save.ts:152/163/174`；military-chess `app.ts:92`；gear-fort `main.ts:14/19`；snake `save.ts:99/133`；emoji `save.ts:104`；mars `main.ts:15` + `screens/app.ts:61`；memory-matrix `main.ts:40` + `engine.save`）。后台把合并结果写进 localStorage 后，下一次 `persist`/`pause` 用旧对象整档覆盖；旧对象里与合并值不同的 L/S 字段被当作"新写入"拿到更大的戳，**别的设备的降档、改家规、装备、计数被悄悄撤销**。违反 `sync.md` §3.1"必须经同一 store 的 `load()` 取数"。这是接入前必须先改的第一件事（每个游戏的内存模型不同，见各节"内存副本"行）。
2. **"重开/清除"用 `delete` 或没有 `g++`，被云端旧值复活**：mars `cert.ts:100`、`adaptive.ts:159` 重开节点，**`NodeState` 类型根本没有 `g` 字段**（`schema.ts:9`），`gv` 规则等于没生效，且 `adaptive.ts:160` 同时删了 `direct.pending`，节点会永久停在 skipped；sokoban `collection.ts:148 delete rec.legacy`（复活后重复计发射 `:138/:151`）与 `hangar.ts:319 delete equipped[slot]`（"不戴"反复失效）；snake `save.ts:157 delete twinLevel[id]`；gear-fort `app.ts:127` 从 `story` 里删 `quick.*`（U 复活，`fastTrack` 重算错）。
3. **规则方向错的棘轮**：military-chess `items.*.best`（最少步数，越小越好，规则却是 max，`core/progress.ts:51/54`，每次改进都被回退）与 `hintMax`（升星时直接赋值，3→0）；snake `life.multiMax/streakMax` 是 `Math.max` 却被当 S 求和（`save.ts:70`）→ 收藏卡**提前解锁**（`collection.ts:40-41`）；xiangqi/chess `robots.*.helpTier` 赢后复位却是 M（chess 的帮助邀请被永久静音）；mars `nodes.*.bridge` 被写回 false 却是 `or`（`adaptive.ts:111`）；emoji `veteranToast` 放完语音写 false 却是 `or`（每次启动重放语音）；gear-fort `decks` 整条替换却是 U（选牌被并集+字母序打乱，`menus.ts:315`）。
4. **测试开关泄漏进被 M/O 保护的同步字段**：military-chess `unlockAll` 让 `ladder.unlocked` 写成 4（`core/progress.ts:107/148`，**全家所有设备永久解锁全部对手**），`aiOverride` 让弱机器人胜局按名义等级记账并抬高 `rank`（`match.ts:658` 对 `:1249`）；`skipIntros` 的效果写进 mars `onboarded`（`screens/app.ts:192`）与 memory-matrix `tutorial[s]`（`main.ts:166`）；sokoban/emoji 的 `?test=1` 钩子（`dev.ts:108-123`、`dev/test-hook.ts:41`）能把造假记录推到云端。
5. **重置入口不走 `resetSlot`**：military-chess `parent.ts:115/145-158`、emoji `parent.ts:86`（还清空 `grants`+`intros` 导致奖励重发，违反"一次性奖励终身一次"）、mars `main.ts:50` rescue `removeItem`、`store.reset()`（`adapter.ts:13`→`kit/progress.ts:147`）。不接 `resetSlot`，M/O/U/S 字段全部被云端顶回，重置等于被撤销。
6. **"一个坏字段 → 整档回默认"**：xiangqi `adapter.ts:12` + `save.ts:47`（X 字段 `game` 形状坏就否决整档，下一次保存覆盖真实进度）；mars `repair.ts:34/65` + `store.ts:68`（合并结果里 `cert.C2.state` 是 passenger 枚举 → 三块徽章整体归零并落盘；`session/probes/race/direct/orbit` 同理）；military-chess `fit()` `save.ts:173`（定长数组长度不等整体清零）。合并输出必须先过游戏自己的 SHAPE/`validate`。
7. **`importProgress` 整键替换**（`kit/progress.ts:349`）：对 `kg:v1:economy` 无并集（一次旧备份恢复清掉之后所有币事件、物品与蛋）；`exportable`（`:308`）会把将来的 `kg:clock:v1`、`kg:sync:*` 导出再导入（两台设备共用同一个 `d`，事件 id 冲突）；`kg:parent:pin` 能被备份文件改掉。
8. **emoji `boosters` 整体 L + `grants` U**：并发发放/消耗时奖励**永久丢失**（`grants` 记了 id 不会再发）；规格建议拆 `earned{}`/`spent{}` 两个 S（`save.ts:158`、`play.ts:580`）。
9. **memory-matrix 的 `sectors` 是单个 LWW 寄存器**：落后设备更晚写一次，就能用更少的 `cleared/maxL/byLevel.stars/open` 整条盖掉另一设备大量进度（建议 S10 改"按进展排名的 P"，需要中性测试验证）；另有 5 个真实字段（`nightClock seenRules practiceN salt voice`）原型根本没有规则，`Voice` 还持有 `engine.save.voice` 引用（`main.ts:83`）。
10. **工具层与规则缺口（已修）**：`overlay()` 在真实 `defaults()` 上会为"本地没有、规则里声明的容器字段"凭空造 `{}`（emoji `stats.tools`），破坏自合并中性 → 已在 `kit/sync/merge.ts` 修复并有回归测试；mars `challenge{plays,best}` 字段原型规则树缺失（`mission.ts:117`）→ 由新的"类型↔规则"漂移测试发现并补上。

**S3 已经做到的 / 留给游戏接入包的**：下表 §3 列出**已落进规则树**的变更（可直接移植进各游戏 `save.ts` 的 `RuleOf<T>`）；§3 末尾"待游戏侧改动"是**规则单独解决不了**、必须同时改游戏代码的点（每个游戏接入包的验收清单）。

---

## 1. 通用要求（所有游戏接入包共同遵守）

| 编号 | 要求 | 违反时的症状 | 本审计中的命中 |
|---|---|---|---|
| C1 | 存档只经 store 的 `load()` 取数；同步合并后原地刷新（`Object.assign`）或换新对象并让各屏重新取引用 | 后台合并被旧内存对象覆盖，L/S 字段重盖章 | 全部 8 个游戏 |
| C2 | 会降低的字段用 L / `g++` / X；撤销不靠删数组元素或 `delete`，map 键删除写 `null` | 云端旧值复活 | mars、sokoban、snake、gear-fort |
| C3 | 重置入口调 `resetSlot(id)`，确认框写明"云端的这份也会清空"；一次性奖励 id 终身一次，重置**不**重发 | 重置被云端顶回 / 奖励重发 | military-chess、emoji、mars、`store.reset()` |
| C4 | 测试开关（`skipIntros` `unlockAll` `aiOverride` `?test=1`/DEV 钩子）不得写入同步字段；测试模式下不得 `registerSync`/`syncNow` | 全家云存档被污染 | military-chess、mars、memory-matrix、sokoban、emoji |
| C5 | 合并结果写入前必须过游戏的 `validate`/SHAPE；X 字段损坏只丢该字段，不否决整档 | 整档回默认并落盘 | xiangqi、mars、military-chess |
| C6 | 加载时的 normalize/repair 必须幂等且**不降低**合法值；`migrateFrom` 必须是纯函数（不得复用有副作用的 `migrate`） | 每轮同步都不中立 | xiangqi（抄 live 键）、mars（v4→v5 改 onboarded）、snake（equipped 兜底改写）、memory-matrix（cards `c.vet`→`vet`） |
| C7 | 纯 X 字段的变化不得标脏、不得触发推送（`inProgress` `resume` 每步都写） | 每秒一次请求 | sokoban、military-chess、snake |
| C8 | 读/渲染路径上不得写存档（"顺手把失败者写成 null"类） | 每次加载产生差异、盖掉另一设备的正当编辑 | economy（star-pets §3.5）、mars `levelFor`→`tagState` 的 `??=` 插入 |

---

## 2. 逐项数字

* 审计行数：xiangqi 24 + chess 17 + gear-fort 16 + snake 19 + emoji 16 + sokoban 10 + military-chess 18 + mars 23 + memory-matrix 20 + economy 11 + kit/progress 4 = **178**（另有 settings / hub-seen / metrics 三个 kit 级 store 的要点，不计行）。
* 风险分布（174 行带"风险"列，kit/progress 的 4 行不分级；按"风险"列的开头字）：**高 19**、**中 41**、低/无 114。
* 规则缺口/规则建议条目（G·H·R·M 编号，见各节第一张表）共 **31** 条；§3 第一张表 **23** 行变更**已落入规则树**，第二张表 **10** 组改动需要游戏侧同时完成。

---

## 3. 规则树变更清单（相对 `sync.md` v1.1 §4.1；已落入 `tests/sync/support/schemas.ts` 并通过全部测试）

| store | 字段 | v1.1 / 原型 | 现在 | 依据 |
|---|---|---|---|---|
| xiangqi | `robots.*.helpTier` | M | **L** | A-G3：赢后须复位，M 是棘轮（死字段，一旦接线即触发） |
| xiangqi | `placement.rec` | 无 | **L** | A-G1：academy.ts:199 整条替换 |
| xiangqi | `settings.r1Skip` | 无 | **O** | A-G2：arena.ts:60 只置 true（也可显式 `local`，二选一） |
| chess | `robots.*.nonWinStreak` | 无 | **L** | A-H1：chess.md:154 帮助阶梯用"连续没赢" |
| chess | `robots.*.helpTier` | M | **L** | A-H2 |
| gear-fort | `decks.*` | `map(set)` | **`map(lww)`** | C：整条替换，并集+字母序会打乱选牌 |
| snake-battle | `life.multiMax` `life.streakMax` | S | **M** | C：`Math.max`（save.ts:70），S 会提前解锁收藏 |
| snake-battle | `twinLevel.*` | `map(max)` | **`map(lww)`** | C：通关 `delete`（须改写 `null`，见待改） |
| snake-battle | `venueIntroDay.*` | `map(max)` | **`map(lww)`** | C：设备时钟较晚会写入更小日期 |
| sokoban | `random.poolIdx` | `maxArr` | **X** | D：绝对赋值、全树无读取者 |
| sokoban | `wrapShownAt` | `min` | **L** | D：无条件 `= Date.now()`、无读取者 |
| military-chess | `tagStats.*` | M | **S** | D：`++`/`+=`，M 丢并发增量并破坏 correct≤total |
| military-chess | `family.log` | R60 | **R100** | D：match.ts:1241 `slice(-100)`，cap 必须等于游戏 cap |
| emoji-match | `free.energy` | L | **M** | C：唯一写入 `+=`（play.ts:841） |
| emoji-match | `stats.combos/specials/tools` | `map(max)` | **`map(sum)`** | C：`++` 计数，家长页读总和 |
| mars-base | `cert.*` 排名向量 | `[state, attempts]` | **`[state, attempts, remedialPlays+recheck, -prov.left]`** | B-R3：同 attempts 内的进度不参与排名会重复发复核题 |
| mars-base | `errors.*.recent` | R12 | **R3** | B-R4：mission.ts:71 `length>3` 才 shift |
| mars-base | `challenge{plays,best}` | 无 | **`plays:S, best:M`** | 漂移测试发现（mission.ts:117） |
| memory-matrix | `nightClock` `seenRules` `practiceN` `salt` `voice` | 无 | **M · U · X · X · X** | B-M1..M5 |
| memory-matrix | 夹具 | `recent` 字符串、`cards:['c.vet']` | 数字、`['vet']` | B-M7/M8（`normalizeSave` 会改写） |
| economy | `dev` | X | **删除** | star-pets §3.1/§3.9、sync.md §8.4：设备 id 归 `kit/clock` |
| NOT_SYNCED | 键族 | `mars-base:pre-v5-*` | `kg:v1:mars-base:pre-v5-*` `kg:v1:mars-base:corrupt-*` | B-R9：真实键名 |
| 引擎 | `overlay()` | 为缺失的容器字段造 `{}` | 两侧都缺则保持缺失 | 真实 `defaults()` 上的中立性回归（emoji `stats.tools`） |

**待游戏侧同时改动（规则单独解决不了；每条是对应接入包的验收项）**

| store | 改动 | 位置 |
|---|---|---|
| mars-base | `NodeState` 加 `g?: number`；`cert.ts:100`、`adaptive.ts:159` 重开处 `g++`（先于 `direct.pending` 过滤）；`migrate` 不给 voided 记 g | schema.ts:9、repair.ts:40、cert.ts:100、adaptive.ts:159-160 |
| mars-base | `bridge` 读侧守卫 `replay = n.bridge && n.st==='open'`（或把 `bridge` 加进 gv 守卫字段）；`levelFor` 改成不插入的查找；`orbit.tests` push 后裁到 40；`sync.validate` 用 `repairSave(x).changed===false` | planMission.ts:139、adaptive.ts:26、mission.ts:124 |
| sokoban | 新增 `legacyDone`(O)，停止 `delete rec.legacy`；`equipped` 卸下写 `null`；`finale.v1At` 改 `??=` | collection.ts:148、hangar.ts:319、finale.ts:25 |
| snake-battle | `twinLevel` 通关写 `null` 而非 delete；`equipped` 不在加载时兜底回写；`seenTips` 日期键移入 `tipDay` | save.ts:157、:120-121、app.ts:172/175 |
| gear-fort | `story` 里的 `quick.*` 拆成 `quick: map(lww)`（写 true/false）并由它派生 `fastTrack`；`current` 改 `rank(ORDER)` | app.ts:127、:134 |
| emoji-match | `boosters` 拆 `earned{}`/`spent{}`（S）；`veteranToast` 改 `intros` 里的 U 标记；legacy 导入在 reconcile 之后；重置前 `resetSlot` 且不清 `grants/intros` | save.ts:158、main.ts:163、parent.ts:86 |
| military-chess | `items.*.best` 改"忽略 0 的 min"或把 `{stars,best,hintMax,at}` 绑成 P 组；`ladder.unlocked` 按忽略 `unlockAll` 的开放度计算；`aiOverride` 时不记 ladder；`streakLoss`+`handicapOffer` 成组 L；`deployments` 逐槽 L；`settings.familyQuiet/shuttleMax` 升 L | core/progress.ts:51/52/107/148、match.ts:658/1249、deploy.ts:517 |
| xiangqi / chess | `academy.ts:217`、`game.ts:263` 重玩课时 `{...old, stars: max(old,new)}`、`known` 不写 false、保留 `puzzleIx`、done 课不写 `stepId`；push 前去重；`game` 坏时只丢它；chess `puzzles.review` 改 `map(lww)`+null 墓碑（倒计时锚 `stats.sessions`），`stars` 先定语义 | academy.ts:165/206、game.ts:263、starmap.ts:50、save.ts:47 |
| memory-matrix | `sectors` 改"按进展排名的 P"（S10 用中性测试验证）；`defaults()` 含随机 `salt`，同步层不得拿它做比较 | main.ts:39、session.ts |
| kit | `importProgress` 对 `kg:v1:economy` 并集；`exportable` 排除 `kg:sync:*` `kg:clock:v1`；导入后 `syncNow('import')`；`store.reset()` 走 `resetSlot`；`updateSettings` 只写变化的键并透传未知键；metrics 远端条目放独立命名空间 | kit/progress.ts:308/332-352/147、kit/settings.ts:60-93、kit/metrics.ts:89 |

---

## 4. 对 `sync.md` / `star-pets.md` 的修订建议

* sync.md §4.1：按 §3 表更新规则要点；`snake-battle` 的 S 名单改为 15 个 S + 2 个 M；chess"与 xiangqi 同构"改为"除 `settings`、`puzzles.review`、`cards`、`stars` 外同构，机器人记录多 `nonWinStreak`，无 `coachOn`"；mars 加 `challenge`，X 清单加 star-pets v6 的 `eco.pending` `daily.run` `daily.runSeq`。
* sync.md §8.4 与 star-pets §3.2 的 id 分类对齐：加入 `mn:`（订单）`ck:`（检修）`b:`（购买，确定性非自然）三类；删除 `adjust` / `rf:` 退货 / `m:` / `d1:` 的残留描述（star-pets 已无）；`ID_RE` 契约已由 `tests/economy/contract.test.ts` 双向锁定。
* sync.md §3.1：`createBoardStore` 的 EQ-sync-1 需额外转发 `isValid`（作为 `sync.validate`）、`reset` 钩子；"每个游戏规格必附非单调写入点审计表"现在有 178 行样板。
* star-pets §3.5 "下次写入顺手把失败者写成 null" 违反 C8，应改为只在用户操作时写；§3.7 `importProgress` 并集必须先于星币上线。

---

## 5. 验证（本审计的结论哪些由机器守着）

* `tests/sync/coverage.test.ts`：8 个可导入 store 的**真实 `defaults()`**（337 个叶子：300 规则 + 37 本机）0 个叶子只靠 `any`；374 个满字段夹具叶子 0 个未覆盖；"类型 ↔ 规则"漂移测试（读 TS 源码里的 interface，递归进入 `Record<string, X>` 的记录类型）——给任何存档类型加字段而不写规则、或规则里留着类型已删除的字段，立即失败（含反例自测）。
* `tests/sync/neutral.test.ts`：8 个存档按真实写法（含降档、重开 `g++`、FIFO 移出、环截断、重置）2 400 次操作、2 496 次同步检查 0 违规；负对照"重开不 `g++`"20 次违规、"`puzzles.tier=max`"38 次违规。
* `tests/sync/mutants.test.ts`：22/22 合并变异（含 4 个"格合法但错"）+ 账本 1/1 全部被杀；只靠格定律的套件最多杀 18 个。
* 每条"待游戏侧改动"在接入包里都要有对应的中性测试（用该游戏自己的 bot/求解器，`sync.md` §7）。

---

# 逐游戏审计表（178 行）

## 一、xiangqi 楚河棋院 — store: `site/xiangqi/src/progress/save.ts:63-65`（`createXqStore` → `createBoardStore('xiangqi', …)` 在 :64）

> **行号漂移说明**：`site/xiangqi` 正被并行的修复轮改动（2026-10-20 01:42 复核：`academy.ts` 的「课完成」写入已从 :206 移到 :217，`game.ts` 的「第一盘棋」写入已从 :261 移到 :263；`stepId` 现在被保留 `s.lessons[id]?.stepId ?? …`，但 `stars` 仍整条替换为 `res.stars`、`known:false` 仍被写、`puzzleIx` 仍被丢弃，结论不变）。本节 xiangqi 行号其余部分可能漂移约 ±12 行，接入前以 `grep -n` 重新定位。

**存档形状与规则树**：`XqSave` v2（save.ts:13-27），对应 `SCHEMAS.xiangqi`；`game` 是 X，`settings` 里只有 `houseRules` 是 L。主要写入点：整盘结算 `recordResult`（save.ts:83-91）、学堂 `app/academy.ts`、星图 `app/starmap.ts:49-52`、赛前面板 `app/arena.ts`、设置开关 `app/panels.ts:89-93`。

**规则缺口与规则建议**（G1/G2/G3 已写进 `tests/sync/support/schemas.ts`）

| # | 字段 | 现状 | 建议规则 |
|---|---|---|---|
| G1 | `placement.rec?: string[]` | 类型在 save.ts:17，academy.ts:199 整条替换写入；原型规则树没有 `rec` | `rec: lww`（可由 lessons 重算，读取时已过滤已学课 academy.ts:39） |
| G2 | `settings.r1Skip?: boolean` | 类型在 save.ts:25，arena.ts:60 只写 true，save.ts:74 读取；原型 `localAll` 里没有，`defaults().settings` 也没有，按 defaults 叶子扫描的 lint 抓不到 | `r1Skip: or`（孩子点了"不用，直接下"，跨设备也不再弹）；若定为设备级则必须显式写 `local`，二选一 |
| G3 | `robots.*.helpTier` | 现为 M；全仓没有写入点（save.ts:29 默认值、save.ts:93 读取，死字段）。`helpInvite`（save.ts:93）语义是 `floor(loseStreak/2) > helpTier`，赢后必须把 helpTier 复位才能让阶梯重新触发 | 改 `lww`，与 `loseStreak` 同组；一旦接线，M 就是棘轮 |
| G4 | `xj.*.wins` | M，但游戏 `x.wins++`（save.ts:88）：两台设备各赢一次合并后是 1（真实 2）；目前只被当 `>0` 用（save.ts:69、arena.ts:77、arena.ts:87）可接受 | 若家长页要显示场数，改 S |
| G5 | 死字段 | `battles`、`robots.*.easy`、`settings.coachOn`、`newContent` 都没有写入点 | 规则保留无害；"coachOn 逐键 L"现在是空转 |

**非单调写入审计表**

| # | 字段路径 | 写入点 | 非单调行为 | 同步规则 | 风险 | 游戏侧要求 |
|---|---|---|---|---|---|---|
| 1 | `lessons[id].stars` | academy.ts:217 `stars: res.stars` 整条替换；game.ts:263 胜 3 / 负 2；academy.ts:45、:197、box.ts:124 写 2 或 1（仅 `!done`） | 重玩已完成课得星更少，或第二盘课内整盘输了：3→1 / 3→2 | K(STARS) 已有 | 中：本机降、云端拉回，自合并不中性，neutral 必挂 | `Math.max(old?.stars ?? 0, new)`，用 `{...old, …}` 展开 |
| 2 | `lessons[id].known` | academy.ts:217 写 `known:false`；game.ts:263 省略该键即 false | true→false | O 已有 | 中：合并后又变回 true | 保留 `known: old?.known`，永不写 false（UI 已 done 优先 academy.ts:42） |
| 3 | `lessons[id].puzzleIx` | academy.ts:217、game.ts:263、academy.ts:45、:197、box.ts:124 整条替换，键被丢弃 | 被删除 | M 已有 | 低：done 课不读指针（academy.ts:188） | `...old` 展开保留 |
| 4 | `lessons[id].stepId` | academy.ts:165 每步无条件写；done 节点可点开重学（academy.ts:59 只挡 locked），academy.ts:188 对 done 课传 `prog=null` 从第 1 步起，指针倒退；academy.ts:45、:197、box.ts:124 把未完成课重置到 `steps[0]` | 指针倒退 | K by XQ_STEP rank 已有 | 中：已完成课的指针在云端比本机高，自合并不中性 | done 课不写指针，或仅当 `rank(new) > rank(old)` 才写；markKnown 保留旧 stepId |
| 5 | `lessons` 整体 | 无 `delete lessons[..]`、无 `done=false`、无清空 | — | — | 无 | done 永不回落（已核对） |
| 6 | `placement.{done,known,rec}` | academy.ts:199 整条替换；可重考（academy.ts:51 只在横屏且 done 时隐藏按钮） | `rec` 整体替换；`known[ch]` 由 `isDone` 重算，单调 | done O、known `map(or)` 已有；`rec` 缺规则（G1） | 低 | 补 G1 |
| 7 | `puzzles.tier` | starmap.ts:51：近 N 题（N≥10）首次做对率 <50% 降一档，≥80% 升一档 | 降档 | L 已有 | 低 | `tier` 与 `recent30` 各自盖戳，偶发一次档位抖动，可接受 |
| 8 | `puzzles.done` / `puzzles.firstTry` | starmap.ts:50 `push`，>800 时 `shift()` | 删最旧；push 不去重 | F800 已有（cap 对得上） | 低 | push 前 `includes` 去重，否则本机数组带重复而线上是 `{id:lc}` 去重形，不中性 |
| 9 | `puzzles.recent30` | starmap.ts:50 push 后 >30 `shift()` | 窗口滑动 | L 已有 | 低 | 无 |
| 10 | `puzzles.daily` | starmap.ts:50 整体替换；跨日 ids 清空、got 归零（`todayKey` 用 UTC，starmap.ts:23） | 重置 | L 已有 | 低 | 无 |
| 11 | `robots[].loseStreak` | save.ts:85 赢 `=0`；save.ts:86 输 `++`，和棋不动 | 清零 | L 已有 | 低 | 无 |
| 12 | `robots[].helpTier` / `easy` | 无写入点（G3、G5） | — | M / L | 低（潜在） | 若接线，helpTier 按 G3 改 L |
| 13 | `history` | save.ts:89 `push` 后 `splice(0, len-30)` | 删最旧 | R30 已有 | 低：`now` 默认 `Date.now()`（save.ts:83），时钟回拨会让数组序不等于按 t 排序 | 无 |
| 14 | `game`（X） | game.ts:114 写入；game.ts:250 `delete`；save.ts:90 `delete s.game` | 删除 | X | 低 | 合并结果必须保留本机 `game`；不得因 `game` 形状让整档判无效（见 #22） |
| 15 | `notice` | hall.ts:41 `'legacy'→'seen'`；save.ts:60 迁移置 `'legacy'` | 只升 | K(rank) 已有 | 低：设备 A 置 legacy 后 B 也会弹旧版提示，B 本机没有旧快照，家长角会写"没有旧版数据"，文案矛盾 | 无 |
| 16 | `settings.houseRules` | arena.ts:109 整对象替换 | 替换 | L 已有 | 低 | 无 |
| 17 | `settings.r1Skip` | arena.ts:60 只置 true | 无降 | 缺规则（G2） | 低 | 补 G2 |
| 18 | `settings.{coords,handedness,dangerHatch,sfx,subs,material}` | panels.ts:89-93 双向开关 | 双向 | X 已有 | 低 | 无 |
| 19 | `stats.sessions` | main.ts:32 每次开页 `++` 并立刻 `save` | 只增 | S 已有 | 低：每次开页都产生一次写，会触发同步 | 无 |
| 20 | 其余计数与旗标 | `stats.f2fGames` game.ts:254；`legacySolved` 仅迁移写 save.ts:59；`robots.w/d/l/unlocked/badges/xjWon/wall` save.ts:85-87；`xj` save.ts:88；`intro.*` box.ts:115、:124；main.ts:42 dev 解锁 | 无非单调写入 | 已有规则够用 | 低 | 无 |
| 21 | **整档内存副本** | main.ts:32 `let save = store.load()` 之后从不重取；main.ts:38 `onBeforeLeave`/`onPause` 与 main.ts:48 `persist` 都写同一个对象；各屏挂载时捕获 `const s = ctx.save`（academy.ts:35、:106、starmap.ts:35、arena.ts:32、:98、hall.ts:18、panels.ts:46） | 后台把合并结果写进 localStorage 后，下一次 persist/pause 用旧对象整档覆盖 | 全部字段 | **高**：旧对象里与合并值不同的 L 字段（tier、houseRules、daily、recent30）被当作新的本机写入，拿到更大的戳，赢过云端——别的设备的降档、改家规被悄悄撤销 | 违反 sync §3.1"不另存内存副本"。`ctx.save` 改成每次 `store.load()`、写改用 `store.update`；或在 `go()` 切屏的安全点换新对象并让各屏不再长期持有旧引用 |
| 22 | **整档无效即回默认** | adapter.ts:12 `isValid` 失败后 `defaults()`，不落盘，下次 save 即覆盖；save.ts:47 只要 `game` 形状坏就否决整档；save.ts:44 要求 R1~R6 都在 | 一个 X 字段坏了，全部进度被默认值覆盖 | 全部字段 | **高**：同步后 `validate` 失败报 `invalid`，本机卡在旧值 | `game` 形状坏时只丢弃 `game`，不否决整档；`isValid` 只校验会改变语义的核心字段 |
| 23 | **导入备份** | parent/src/main.ts:484 `importProgress(bundle, {overwrite:true})`；kit/progress.ts:341-348 只挡"旧 schema 版本"，同版本旧备份整条替换 `kg:v1:xiangqi` | 全部字段回到旧值 | 全部字段 | 中：未接 `syncNow('import')` 前所有 M/O/U 字段被拉低，之后云端又拉回，孩子看到进度闪回 | 按 sync §3.1 导入后 `syncNow('import')`，导入前提示"未同步的新内容会被替换" |
| 24 | **`store.reset()`** | adapter.ts:13 → kit/progress.ts:147-157 `removeItem('kg:v1:xiangqi')` | 整档删除 | 全部字段 | 低（现状）：xiangqi src 和 parent 里都没有调用方（grep 无命中） | 以后任何入口必须走 `resetSlot('xiangqi')` 并写明"云端也会清空" |

**加载时改写点**

| 位置 | 做了什么 | 对同步是否安全 |
|---|---|---|
| main.ts:32 | 每次开页 `sessions++` 并 `save` | 单调（S）；带 sync 的 createStore 首次 `load()` 内部先 reconcile 再 `++`，顺序正确 |
| kit/progress.ts:104 | 同版本直接返回 `env.data`，无 fillDefaults、无 sanitize | 安全，不改写 |
| adapter.ts:12-13 | `isValid` 失败返回 `defaults()`，不立即落盘 | 非幂等且有破坏性（#22） |
| save.ts:54-62 + kit/progress.ts:107-109 | v1→v2 迁移：返回 `defaults()` 丢弃全部 v1 进度；save.ts:58 有副作用：把 live 键原文抄成 `kg:v1:legacy-xiangqi` | 副作用幂等（先查 `!getItem`），但不是纯函数，**不能当 `migrateFrom`**；要另写纯函数（输出 `defaults()` + `legacySolved` + `notice:'legacy'`）并与 `load()` 迁移做等值单测 |
| game.ts:354 附近 | 恢复对局后逐着重放、遇非法着截断并回写 `game` | 只动 X 字段，安全 |

**最可怕的 3 个发现**
1. main.ts:32/38/48 + 各屏 `const s = ctx.save`：整页生命周期持有一份内存存档并整档回写，一次后台合并之后就会撤销别的设备的 L 字段修改。
2. academy.ts:217 / game.ts:263 / academy.ts:165：重玩已完成课时整条替换，`stars` 下降、`known` 变 false、`puzzleIx` 被删、`stepId` 倒退，一次动作破坏 K、O、M 三类规则的自合并中性。
3. save.ts:47 + adapter.ts:12：X 字段 `game` 坏了就整档回默认，下一次 `save` 覆盖真实进度，同步的 `validate` 也会因此永久报 `invalid`。

---

## 二、chess 棋手学院 — 规格 `docs/specs/chess.md:234-235`（§8.5，`createBoardStore('chess', {version:1})`；**代码尚未重建**：`site/chess/` 只有 `game.json`、`index.html`、空的 `tests/` `tools/`）

旧 `index.html` 没有任何 localStorage（chess.md:235），v1 无迁移，xiangqi 那条"v1→v2 把 live 键抄成 legacy 快照"不适用。规则树：`SCHEMAS.chess` 在 `xqLike(CH_STEP)` 基础上覆盖 puzzles（加 `review: lww`）、settings（只有 houseRules L）、`cards: set`、`stars: max`、`stats{sessions,games}: sum`。

**规则缺口与规则建议**（H1/H2/H3 已写进 `schemas.ts`）

| # | 字段 | 现状与问题 | 建议规则 |
|---|---|---|---|
| H1 | `robots[].nonWinStreak` | chess.md:154、:235 的帮助阶梯用"连续没赢（输或和）"触发，字段是 `nonWinStreak`；原型 `robotRec` 只有 `loseStreak` | 加 `nonWinStreak: lww`（和棋 `++`，赢清零；模板 save.ts:85-86，注意 xiangqi 和棋不动 loseStreak） |
| H2 | `robots[].helpTier` | 现为 M；chess.md:154"拒绝后下一级在再 2 盘没赢时才问"，tier 随连续没赢升降，赢后必须复位，否则 tier 永远高于 `floor(streak/2)`，邀请被永久静音（模板逻辑 save.ts:93） | 改 `lww`，与 `nonWinStreak` 同组写入 |
| H3 | `battles[id]` | chess.md:78"连输 2 盘自动降一档"需要落盘的连输计数/已降档标志，规格未定义；原型 `battles: map(obj({won, stars}))` 没有这两项；`DEFAULTS.chess` 沿用 xiangqi 的 B1~B3，规格有 4 个战场 + 3 个兵的战争 | 若落盘：`lossStreak: lww`、`easy: lww`；`battles` 是 map，`isValidChessSave` 不得写死 B1~B3 |
| H4 | `puzzles.review` | 现为 L 整条；chess.md:127"复习队列到期一题"、"没对的 2 次会话后复现孪生"，条目带倒计时，做对即移除；整条 L 在多设备同时加入复习项时会丢更新 | 改 `map(lww)`：`{puzzleId: {at: stats.sessions 失败时的值} \| null}`，到期判断 `sessions >= at+2`，移除写 `null`，不存递减计数 |
| H5 | `stars`（顶层） | 现为 M；chess.md:185/235 没说是什么。若是各课星的总和不应单独存（可派生）；若是随事件累加的计数，M 会少算，应为 S | 规格先钉死语义：能派生就不存；确需累加则 S；可花费则进账本 |
| H6 | `coachOn` | chess 没有该键（设置只有 coords、coachCap[]、theme、seatHints、houseRules、dangerHatch）；sync.md §4.1 写"与 xiangqi 同构"会误导 | 不加；规格文字改成"除 settings 与 puzzles.review、cards、stars 外同构" |

**非单调写入审计表**（规格行号；模板为 xiangqi 对应写入点）

| # | 字段路径 | 规格依据 / 模板 | 非单调行为 | 同步规则 | 风险 | 游戏侧要求 |
|---|---|---|---|---|---|---|
| 1 | `lessons[id].stars/known/puzzleIx` | chess.md:56（"已会"空心徽记可重学）、:122；模板 academy.ts:217、game.ts:263 | 重玩得星更低；`known` true→false；整条替换丢 `puzzleIx` | K / O / M | 中：直接照抄 xiangqi 会破坏自合并中性 | `{...old, stars: max(old,new)}`，`known` 不写 false，保留 `puzzleIx` |
| 2 | `lessons[id].stepId` | chess.md:72、:99；模板 academy.ts:165、:188、:45、:197、box.ts:124 | 重学已完成课、"我会了"、摸底都会把指针重置到本课第一步 | K(CH_STEP rank) | 中 | 已完成课不写指针，或仅 rank 变大时才写；摸底和"我会了"保留旧指针 |
| 3 | `lessons[id].done` | chess.md:56 | 无复位写入点 | O | 低 | 重学不得把 done 写回 false |
| 4 | `puzzles.tier` | chess.md:127（≥80% 升、<50% 降）；模板 starmap.ts:51 | 降档 | L 已有 | 低 | 无 |
| 5 | `puzzles.review` | chess.md:125-127、:235 | 做对即移除；倒计时递减 | L 整条 → `map(lww)` | 中：多设备丢更新（H4） | `map(lww)` + null 墓碑，倒计时锚在 `stats.sessions` |
| 6 | `puzzles.done` / `firstTry` | chess.md:127（FIFO ≤800）；模板 starmap.ts:50 | `shift()` 删最旧；chess.md:99"题号不存在→当作已完成"只读处理，不得借机删除 | F800 已有 | 低 | push 前去重 |
| 7 | `puzzles.recent30` / `daily` | chess.md:127；模板 starmap.ts:50 | 窗口滑动；daily 跨日整体替换 | L 已有 | 低 | 无 |
| 8 | `robots[].nonWinStreak` / `loseStreak` | chess.md:154、:235；模板 save.ts:85-86 | 赢清零 | L（`nonWinStreak` 缺规则 H1） | 中：缺规则则退化为 passenger，丢更新 | 补 H1 |
| 9 | `robots[].helpTier` | chess.md:154；模板 save.ts:93 | 赢后必须复位 | M 错 → L（H2） | **高**：M 形成棘轮，邀请被永久静音 | 改 L，与 nonWinStreak 同次写入 |
| 10 | `robots[].easy` | chess.md:235、:154 | 孩子可关 | L 已有 | 低 | 无 |
| 11 | `battles[id].lossStreak/easy` | chess.md:78 | 连输 2 盘降一档，赢后应还原 | 缺规则（H3） | 中 | 补 H3 |
| 12 | `settings.houseRules` | chess.md:52、:235；模板 arena.ts:109 | 整对象替换 | L 已有 | 低 | 无 |
| 13 | `settings.{coords,coachCap[],theme,seatHints,dangerHatch}` | chess.md:235 | 双向 | X 已有 | 低 | theme 解锁由 robots 胜场推导（chess.md:185），胜场是 S/O，不会让已选主题失效 |
| 14 | `history` | chess.md:235；模板 save.ts:89 | `splice` 删最旧 | R30 已有 | 低 | 无 |
| 15 | `game`（X） | chess.md:235；模板 game.ts:114、:250、save.ts:90 | 写入与 delete | X | 低 | 同 xiangqi #14、#22：`game` 坏时只丢它，不否决整档 |
| 16 | `notice` | chess.md:235 有该字段，chess v1 没有 legacy | 只可能 none→seen | K 已有 | 低 | 永不写回 none |
| 17 | `stars` | chess.md:185、:235 | 语义未定（H5） | M | 中 | 先定语义 |

单调、无需成行：`robots.w/d/l/unlocked/badges/xjWon`、`xj`、`placement.done/known`、`intro.box`、`cards`、`stats.*`、`newContent`。

**加载时改写点**：规格无迁移（chess.md:235"version 1 安全、无迁移"），`migrateFrom(raw,1)` 就是恒等或 `defaults()`，等值单测很容易写；`isValidChessSave` 不合格→`defaults()` 与 xiangqi 同一个陷阱（#22）；恢复对局重放并截断非法着法（chess.md:99）只改 X 字段 `game`，安全。

**最可怕的 3 个发现**
1. chess.md:154 + schemas：`nonWinStreak` 完全没有规则，`helpTier` 被误设为 M，赢后复位被云端拉回，帮助阶梯被永久静音。
2. chess.md:127 / :235：`puzzles.review` 是带倒计时、做对即移除的队列，整条 L 会丢更新，倒计时递减这类写入最不适合同步。
3. chess.md:56 / :122 + xiangqi academy.ts:217 / game.ts:263：照抄 xiangqi 的"整条替换课记录"，会同时降星、清 known、删 puzzleIx、倒退 stepId。

---

## 三、共享层：`engines/board/save/adapter.ts` 与 `kit/progress.ts`
- **adapter 现状**：`createBoardStore`（adapter.ts:8-16）只返回 `key/load/save/reset/envelope/update`；没有转发 `sync`、`version`、`defaults`、`migrateFrom`、`subscribe`，也没有把 `isValid` 作为 `sync.validate` 传下去（EQ-sync-1 还没做）。
- **`update` 的隐患**：adapter.ts:14 的 `update` 用了 `this.load()`，方法一旦被解构出来调用就会坏；xiangqi 现在不调 `update`，只调 `store.save`；`inner.save(next)` 的返回值被丢弃。
- **`store.reset()` 删什么**：adapter.ts:13 → kit/progress.ts:147-157，只 `removeItem('kg:v1:xiangqi')`；不删 `kg:v1:legacy-xiangqi`（save.ts:52）、`kg:hub:v1` 卡片行、指标键，也不碰将来的 `kg:sync:*`、`kg:clock`，没有 `resetSlot` 钩子。
- **新版本守卫**：有。kit/progress.ts:151 `reset()` 在 `env.v > opts.version` 时直接返回，kit/progress.ts:87 `write()` 同样拒绝覆盖更新版本（工作树里未提交的改动，`git diff -- kit/progress.ts` 可见）。
- **没有"陈旧数据"守卫**：信封 `updatedAt`（kit/progress.ts:88）写入后从不被读取参与任何判断，同版本旧数据可直接覆盖新数据。
- **导入的版本守卫只防降 schema**：kit/progress.ts:341-348，同版本旧备份整条替换。
- **导出范围太宽**：kit/progress.ts:308 `exportable` 是任何 `kg:` 开头的键，将来会把 `kg:sync:*`、`kg:clock` 一并导出导入，需按 sync §3.1 排除。


---

## 四、gear-fort 齿轮堡 — store: `site/gear-fort/src/save.ts:56`

三个游戏（gear-fort / snake-battle / emoji-match）都没有 `store.reset()` 调用；家长页 `site/parent/src` 里只有 PIN 的 `clearPin`，没有任何游戏进度重置；唯一的重置入口是 emoji-match 的 `resetProgress`。

**概要与规则缺口**：`SaveV1` 共 16 个顶层字段（save.ts:8-25），原型规则树全部覆盖；规则有 4 处不对、2 处夹具类型不符：
- **`decks`**：规则是 `map(set)`，应改 `map(lww)`——游戏对整条数组做替换写入（menus.ts:315）。
- **`current`**：规则 `lww`，建议改 `rank(ORDER)`（K）：游戏只在 `ORDER.indexOf(nx) > ORDER.indexOf(s.current)` 时才写（app.ts:134），本身单调；LWW 会让较落后设备的后写把指针拉回去。
- **`story` 与 `fastTrack`**：app.ts:127 会从 `story` 里删 `quick.1-1` / `quick.1-2` 再重算 `fastTrack`，对 U 集合是删除。建议新增 `quick: map(lww)`（写 true/false，不删），`fastTrack` 由它派生，旧存档里的 `quick.*` 迁移时转入。
- **`counters`**：`map(map(max))` 能用，`+=` 累加（app.ts:128）多设备会少算，但 `learned`（U，`LEARN_AT=2`，learn.ts:7）已兜底，可选改 S。
- **`lastAt`**：实际是 `toISOString()`（app.ts:124），固定 24 位 UTC，字符串 `a>=b` 字典序等于时间序，`max` 正确，默认值 `''` 最小。问题在夹具：`SAMPLES` 里 `lastAt: T` 是数字，没覆盖字符串分支，应改成 ISO 字符串。
- **`jinnang.mastered`、`infer.firstSeenAt`**：实际存 levelId 字符串（metrics.ts:23、:27），不是数字或时间戳；字典序下 `'1-10' < '1-9'`，但游戏只做真值判断（metrics.ts:12、:27），无功能影响。夹具要改成 `'1-3'` 之类；`DEFAULTS.infer` 还缺 `firstSeenAt: null`。
- **cap 检查**：游戏端没有任何集合裁剪，各 set 默认 cap 4000 够用。

| # | 字段路径 | 写入点 | 非单调行为 | 同步规则 | 风险 | 游戏侧要求 |
|---|---|---|---|---|---|---|
| 1 | `decks[lv.id]` | menus.ts:315 | 每次点"出战"用 `deck.slice()` 整条替换（可更短、顺序不同）；读取时 menus.ts:155 先 `.slice(0, lv.slots)`。U 会把历史卡牌全并进来并按字母序重排，选牌被打乱 | 现 U，应 `map(lww)` | **高**：可见功能 bug | 规则改 L 即可，游戏侧无需改 |
| 2 | `story`（`quick.*` 项） | app.ts:127 | `s.story.filter(x => x !== q)` 删元素再按 `r.quick` 决定是否 push；每次重玩 1-1/1-2 都可能 true→false | 现 U（删除被云端复活） | **高**：快速通道标记被复活 | 拆出 `quick: map(lww)`，写 false 而不是删；旧 `quick.*` 项迁移时转入 |
| 3 | `fastTrack` | app.ts:127 | 由 `story` 重算，会 true→false；U 复活 `quick.1-1` 后，下次 1-2 慢速通关重算出错误的 true | 现 L，读取在 battle.ts:313 | 中 | 改为由 `quick` 派生 |
| 4 | `current` | app.ts:134 | 本机只升不降；但 L 下落后设备重玩旧关时较晚的低值会盖掉高值（A 在 1-8，B 玩 1-3 写 1-4） | 现 L，应 `rank(ORDER)`（K） | 中：地图"当前关"光标倒退，不影响解锁（解锁看 `levels.wins`，menus.ts:73） | 无 |
| 5 | `lossStreak[id]` | app.ts:133（=0）、:135（+1） | 通关归零、失败 +1 | `map(lww)` 正确 | 低 | 无 |
| 6 | `coach.followed` | battle.ts:430 | 整对象替换成 `{...mem.lifetime}`，`mem` 是 battle.ts:299 开局时快照；值只增，战斗中途若有合并会用旧底子盖掉 | `map(max)` 可自愈 | 低 | 无 |
| 7 | `almanac[id]` | almanac.ts:49、:79 | `unseen→shown→seen` 单调 | K 正确 | 低 | 无 |
| 8 | `levels[id]` 各字段 | app.ts:124、:133 | `attempts++`、`wins++`、`best=max`、`lastAt` 递增，`firstTry` 只在 null 时写一次 | M / K / max 正确 | 低 | 无 |
| 9 | `levels[id].firstTry` | app.ts:124 | rank 让 A 的 `lose` 和 B 的 `win` 合成 `win`，家长页"一次通关"（metrics.ts:13）偏高；null 在合并时被丢，读取都是 `== null`，无害 | K | 低 | 无 |
| 10 | `jinnang[id].mastered`、`infer.firstSeenAt` | metrics.ts:23、:27 | 只写一次，值是 levelId 字符串 | max / min（字符串字典序） | 低，仅看真值 | 修夹具 |
| 11 | `puzzles[id]` | app.ts:81-82 | `tries++`、`stars=max`、`bestSpent=min`，单调 | 正确 | 低 | 无 |
| 12 | `counters` / `learned` / `story`（其余项）/ `settings.speed` | app.ts:128、:130；story.ts:140；battle.ts:539 | 只增；`settings` 是 X | M / U / X | 低 | 无 |
| 13 | `resume`、`kernelVersion` | app.ts:49、:60-61、:110、:136 | 内核版本变更时置空、完赛时置 null | X 正确 | 低 | 确认同步层不覆盖这两个键；IDB 快照（snapstore.ts）也是 X |
| 14 | **内存副本** | main.ts:14（`let save = loadSave()`）、:19（`persist: () => store.save(save)`）、:29 | 整个会话持有一份内存存档，每次落盘整份覆盖；同步在会话中途合并进 localStorage 后下次 `persist` 用旧值盖回去 | — | 中 | 在 `store.subscribe` 回调里重新 `store.load()`，不要另存内存副本 |
| 15 | 导入 | kit/progress.ts:332 | 备份文件整键替换；L 字段（current/lossStreak/decks）被旧值带回，M/U/O 字段会被云端再顶回来 | — | 低 | 导入后走 `syncNow('import')` |
| 16 | 测试开关 | app.ts:240（`__gfApp.win`）、main.ts:15 | `test` 来自 URL `?test=1` 或 `webdriver`，需有人在控制台调用才写真实进度 | — | 低 | 开通同步后建议忽略 URL 触发的 test |

`levels` 记录只在 `ended()` 里创建（app.ts:123），没有"读取时创建零记录"的问题。

**加载时改写点**：save.ts:35-48 `migrate`——补缺失字段、丢弃类型错误的顶层字段、数组字段只保留 string 元素（:43）、`resume` 做结构校验（:42）、`coach/infer/settings` 走 `mergeTyped`（:50-54）；纯函数、幂等、不降低任何合法值，**可直接当 `migrateFrom`**；但 `levels/jinnang/puzzles/decks` 等 map 整个原样放行（:44），不校验内部记录，需单独写 `validate`。save.ts:57 `loadSave()` 对 `store.load()` 再 `migrate` 一次，幂等。app.ts:49 内核版本不一致时重写 `kernelVersion` 并置空 `resume`，都是 X 字段，安全。

**最可怕的 3 个发现**
1. `decks` 被规则 U 并集 + 字母序重排，选牌会被打乱（menus.ts:315、menus.ts:155）。
2. `story` 里的 `quick.*` 被删除后又被 U 复活，`fastTrack` 重算结果可能错误（app.ts:127）。
3. 整个会话持有内存 `save` 并整份覆盖落盘（main.ts:14 / :19），会无声丢掉会话中途合并进来的远端内容；`current` 用 L 会倒退（app.ts:134）紧随其后。

---

## 五、snake-battle 贪吃蛇大作战 — store: `site/snake-battle/src/save.ts:101`（`SaveCtl`）

**概要与规则缺口**：`SbSaveV1`（save.ts:24-46）所有字段原型都有规则；`attemptSeq` 没有任何写入点（死字段）。缺口：
- **`life.multiMax` / `life.streakMax`**：原型归在 `SUM`（S），游戏实际用 `Math.max`（save.ts:70，`MAX_KEYS` save.ts:65）。S 会把各设备最大值相加；收藏解锁条件直接读这两个值（collection.ts:40-41），相加后会**提前解锁**。应为 `max`——15 个 S 加 2 个 M，不是 17 个 S。
- **`twinLevel`**：原型 `map(max)`，应改 `map(lww)` 并写 `null`：游戏通关时 `delete d.twinLevel[id]`（save.ts:157），失败时 `+1`（save.ts:158）。
- **`venueIntroDay`**：原型 `map(max)`，建议 `map(lww)`：app.ts:158 用 `!== d` 判断后写入，设备时钟较晚时会写入更小的日期。
- **`venues.*.heat` 与 `recentRanks`**：两个独立 L 寄存器，但由 `nextHeat` 成对产生（save.ts:224）；建议合并成一个寄存器（不合并也不会坏，heat 仍在 [min,max] 内）。
- **`life.*` 取整**：全是整数（match.ts:271-272 `Math.round`/`Math.floor`），满足 `sum` 的 `Number.isInteger` 校验，不会被静默丢弃。
- **`DEFAULTS` 夹具与真实 `defaults()` 不符**：`owned` 实际 `['skin:venus','trail:stardust']`（save.ts:54）、`venues` 按 `VENUE_IDS` 预填零记录（save.ts:56）；夹具带了 `lastPraise/twinLevel/inProgress`，真实默认值里没有。
- **`seenTips`（cap）**：游戏侧没有裁剪，但写按日期的键 `suggest:*:日期`、`rest:日期`（app.ts:172、:175），只增不减会无限增长；约 5 年撞 cap 4000，撞到后字母序截断会丢较晚日期的键。建议把这两类日期键改放进 `tipDay`（L）或 X。

| # | 字段路径 | 写入点 | 非单调行为 | 同步规则 | 风险 | 游戏侧要求 |
|---|---|---|---|---|---|---|
| 1 | `life.multiMax` / `streakMax` | save.ts:70 | `Math.max` 取大 | 现 S，应 `max` | **高**：收藏解锁提前 | 无 |
| 2 | `twinLevel[id]` | save.ts:157（delete）、:158（+1） | 通关时删键；M 下云端旧值下次同步复活，孩子再玩这关仍被放宽 | 现 `map(max)`，应 `map(lww)` | **高** | 删改写 `null`；读取已用 `?? 1`（app.ts:711、save.ts:158），null 安全；save.ts:113 的整体 delete 只在数据损坏时触发 |
| 3 | `equipped.skin` / `trail` | 装备 app.ts:917；加载时回退 save.ts:120-121 | 加载时若 id 不在本机 `collection.json` 里，就改写成 `venus`/`stardust` 并落盘，成为较晚的 L 写入；旧缓存页或旧版本设备会把另一台设备的装扮盖回默认 | `lwwAll` | 中高 | 不要在加载时回写；渲染时用兜底值即可，存储里保持原值 |
| 4 | `cardQueue` | push：save.ts:160、:229、:240；collection.ts:97；消费：app.ts:900（`q.shift()`）；回退：app.ts:630（`unshift`） | 弹出和回退使数组变短/变长；并发 push 时 L 只留一份 | 现 L | 中：丢解锁动画，不丢道具（`owned` 才是真值） | 可接受；若想避免两台设备重复弹同一张卡，改 X |
| 5 | `missions[id].failStreak` | save.ts:157（=0）、:158（++） | 通关归零、失败 +1 | L 正确 | 低 | 无 |
| 6 | `missions[id].skipped/hintMax/stars/bestT/why` | save.ts:180；app.ts:684；save.ts:157-158 | `hintMax` 有"仅升高"守卫，其余单调 | O / M / m / `map(max)` 正确 | 低 | 无 |
| 7 | `venues[v].heat`、`recentRanks` | save.ts:224 | `nextHeat` 会让 heat 下降，`recent` 清空到 `[]` | L 正确；两寄存器独立有微小不一致 | 低 | 无 |
| 8 | `venues[v]` 其余字段 | save.ts:219-223、:234 | `played/podiums/wins/bestPeak/bestKills/endless.*` 都是 `++` 或 `max` | M；`bestRank` 用 m（null 被丢，加载时 `fillDefaults` 补回） | 低 | 无 |
| 9 | `life.*`（15 个 S） | save.ts:69、:219-221 | `Math.max(0, now-committed)`，只增 | S 正确 | 低 | `SaveCtl.data` 常驻内存（见 #16） |
| 10 | `session.*` | save.ts:237-238 | 新一天或间隔超 30 分钟时整体重置（`matchesInRow`、`lastEndAt` 归零）随后立即 `++`/`Date.now()`；净效果 `day`、`matchesInRow` 可降，`lastEndAt` 只升 | `day`/`matchesInRow` 用 L、`lastEndAt` 用 max 可行 | 低：设备时钟快的设备会把 `lastEndAt` 顶到未来，间隔判断失效 | 可把 `lastEndAt` 改 L |
| 11 | `tipDay` | save.ts:261 | 每天重置、`byCause` 递增 | L 正确 | 低 | 无 |
| 12 | `venueIntroDay[v]` | app.ts:158 | `!== d` 即写，日期可能变小 | 现 `map(max)`，应 `map(lww)` | 低 | 无 |
| 13 | `seenTips` | save.ts:258；app.ts:172、:175 | 只增；日期键使其无限增长 | U | 低 | 日期键移入 `tipDay` 或 X |
| 14 | `owned` | save.ts:229；collection.ts:97 | 只 `push`，无删除 | U 正确 | 低 | 无 |
| 15 | `inProgress` | save.ts:136、:142、:152、:203、:213 | 开局写、结算删 | X | 低 | 同步层必须当 X；加载时会收尾（save.ts:125-129） |
| 16 | **内存副本** | save.ts:99、:108、:133 | `this.data` 常驻，`save()` 整份覆盖；会话中途合并进来的 `life/owned/missions` 被旧数据盖回，S 槽位也会算错 | — | 中 | 订阅 `store.subscribe` 后重载并重跑加载归一化 |
| 17 | `firstRunDone` / `lastPraise` | app.ts:869、:952、:855 | 只升 / 覆盖式 | O / L 正确 | 低 | 无 |
| 18 | 重置入口 | — | 游戏内和家长页都没有 | — | — | 无 |
| 19 | 导入 | kit/progress.ts:332 | 同 gear-fort #15；L 字段（equipped、cardQueue、tipDay、session、heat、recentRanks）以备份为准 | — | 低 | 导入后 `syncNow('import')` |

测试钩子要求 `webdriver` 或 DEV（app.ts:97），不会在真机误触发。

**加载时改写点**：save.ts:108 `fillDefaults(defaults(), ...)` 补缺字段、数组整体取存档值、数字非有限数时回默认值、raw 为 null 时回默认值——幂等、不降低合法值，但会把 L 寄存器里的 `null` 变回默认值；save.ts:110-112 重建 `missions`，丢弃非对象项并补默认字段（幂等，会把线上丢掉的 `bestT: null`/`why: {}` 补回）；save.ts:113 `twinLevel` 非对象时整体 delete（只在数据损坏时发生，安全）；**save.ts:120-121 `equipped` 兜底改写，不安全（见 #3）**；save.ts:122 `venues` 补默认，安全；save.ts:125-129 残留 `inProgress` 收尾，`applyPeak` 只升；`inProgress` 是 X 且收尾发生在 reconcile 之后，安全；`newer`（更高版本信封）路径 save.ts:104-106 只读，同步层也要当只读。

**最可怕的 3 个发现**
1. `multiMax` / `streakMax` 被当作 S 求和，直接让收藏解锁提前（save.ts:70，collection.ts:40-41）。
2. `twinLevel` 被 `delete` 后，在 `map(max)` 规则下被云端旧值复活（save.ts:157）。
3. 加载时把未知皮肤 id 改写成 `venus`，随后以较晚的 L 写入盖掉另一台设备的装扮（save.ts:120-121）；会话中途覆盖合并结果的内存 `this.data`（save.ts:133）紧随其后。

---

## 六、emoji-match 表情消消乐 — store: `site/emoji-match/src/save.ts:57`（`openStore`）

**概要与规则缺口**：`EmSaveV1`（save.ts:12-36）所有字段原型都有规则；`free.bg` 和 `stats.minutes` 没有写入点（死字段）。缺口：
- **`boosters`**：原型整体 L，与 `grants`（U）搭配会**永久丢奖励**：A 设备发放 `drill-intro` 的 +3，B 设备并发发放另一项，U 合并后两个 id 都在 `grants` 里不会再发，L 却只留其中一台设备的数量。建议拆成 `earned{drill,tractor,ion}: S` 与 `spent{...}: S`，余量 = earned − spent；`GRANT_CAP=9`（save.ts:129）在发放时按当前余量截断；puzzle 奖励发哪种工具取决于当时"最少的那种"（save.ts:151），无法由 id 推出，所以必须记录实际发放的数量。
- **`free.energy`**：原型 L，应改 `max`（或 S）：唯一写入点是 `+=`（play.ts:841），本身单调；L 会让落后设备把它拉低。
- **`veteranToast`**：原型 `or`，但游戏在放完语音后写 `false`（main.ts:163）。云端的 true 每次复活，造成每次启动都重放 `em.veteran`。建议删除该字段，改在 `intros`（U）里记一个 `'veteran-toast'` 标记。
- **`stats.combos/specials/tools`**：原型 `map(max)`，家长页读取总和（parent.ts:49-52），建议改 S，否则两台设备时少算。
- **夹具**：`arrivals` 实际是 `number[]`（arrival.ts:60、:181 推入 `this.ep`），样本写成 `['a1']`；`DEFAULTS` 是 `{...SAMPLES, ...}`，导致 `boosters/talk/free/lastLevel/attemptSeq/settings.sound` 都带着样本值，真实默认值见 save.ts:41-49（0/null/缺省）。
- **cap 检查**：没有集合裁剪常量；`GRANT_CAP=9` 是 booster 上限，不是集合 cap。

| # | 字段路径 | 写入点 | 非单调行为 | 同步规则 | 风险 | 游戏侧要求 |
|---|---|---|---|---|---|---|
| 1 | `boosters.*` | 消耗 play.ts:580；发放 save.ts:158（调用方 intro-card.ts:33、arrival.ts:57、:126、play.ts:813）；老玩家礼包 save.ts:53；重置 save.ts:110 | 消耗 `-1`，发放 `+n` 再截断到 9，重置归零；L 并发写会丢奖励或丢消耗 | 现整体 L，应 earned/spent 的 S | **高**：奖励永久丢失（`grants` 记了 id 不会再发） | `grant()` 改记 earned；play.ts:580 改记 spent；余量派生 |
| 2 | `grants` | save.ts:157（push）；重置 save.ts:110（清空，仅 legacy 保留 `veteran`） | 重置后集合变小，U 会全部复活；与 spec"一次性奖励 id 终身一次，重置不会重发"冲突（重置后 `intros` 也清空，教学卡会重新发放） | U | 高（重置路径） | 见 #12 |
| 3 | `veteranToast` | save.ts:53（置 true）；main.ts:163（置 false） | `or` 下 true 无法回落，每次启动都重放 | 现 `or` | **高** | 改成 `intros` 里的 U 标记 |
| 4 | `free.energy` | play.ts:841 | `+=`，单调；L 规则下落后设备会把它拉低 | 现 L，应 M / S | 中 | 无 |
| 5 | `levels[id].failStreak` | play.ts:893（=0）、:1054、:1185（+=1） | 通关归零、失败 +1，影响 `assistTier`（save.ts:125） | L 正确 | 低 | 无 |
| 6 | `levels[id]` 初始化 | play.ts:195（`??=` 零记录） | 读取即创建零记录；若这台设备离线，零值 `failStreak` 的时间戳可能比云端更新 | L | 低 | 只在首次真实写入时创建 |
| 7 | `levels[id].stars/bestLeft/wins/attempts/firstWinAt` | play.ts:893-896、:593 | 只升或 `??=` | K / M / min 正确 | 低 | 无 |
| 8 | `lastLevel` | play.ts:247（开局）、:900（通关→下一关） | 重玩旧关通关后指针指向"下一关"，会比之前更靠前或更靠后 | L 正确 | 低 | 无 |
| 9 | `puzzles[id]` | play.ts:596、:742-743、:807-813 | `attempts++`，`solved` 只升，`maxHint` 取 max 或设为 3 | `or` / `max` 正确 | 低 | 无 |
| 10 | `intros/arrivals/sky/cosmetics/talk/free.plays/free.seed/free.bestCascade/stats.maxCascade/attemptSeq/firstRunDone` | main.ts:156、:158；intro-card.ts:32；arrival.ts:58-60、:137、:148、:173、:181、:188；play.ts:141、:593、:605、:611、:860、:895 | 全部只增（`talk` 无限递增、读取时 `% 4`；`free.seed` 取 `max(...)+1`） | U / M / L / `or` 正确 | 低 | 无 |
| 11 | `stats.combos/specials/tools` | play.ts:581、:603-604 | 累加，M 下多设备少算 | 现 M，建议 S | 低到中 | 无 |
| 12 | **整体重置** | save.ts:108-112 ← parent.ts:86 | 全部字段重置（含 `resume`、`settings`、`lastLevel`）。当前**没有**调 `resetSlot(id)`，不调则下次同步全部 U/M/O 字段被云端顶回，等于重置被撤销 | — | **高** | 先 `resetSlot('emoji-match')` 再写默认值；确认框写明云端也会清空；`grants` 的"不重发"要与 spec 对齐 |
| 13 | 老玩家导入 | save.ts:51-54、:61-64 | 新设备若有 legacy 键，会在**没有信封**时导入礼包；若云端已有存档且已花掉，导入的 `boosters {1,1,1}` 会以较晚的 L 写入复活奖励 | — | 中 | legacy 导入必须在 reconcile 之后、且云端没有 `veteran` 时才执行 |
| 14 | **内存副本** | save.ts:104-107（`h.data`）、`commit()` | 整份覆盖落盘；会话中途合并的内容被盖回 | — | 中 | 订阅 `store.subscribe` 后重载并重跑 `normalize` |
| 15 | 测试开关 | dev/test-hook.ts:41（`setSave`）、main.ts:67、:131 | 只要 URL 带 `?test=1`（没有 `webdriver` 判断）就挂钩，可任意 `Object.assign` 存档 | — | 低 | 开通同步后忽略 URL 触发的 test |
| 16 | 导入 | kit/progress.ts:332 | 同 gear-fort #15 | — | 低 | 同上 |

**加载时改写点**：save.ts:69-82 `normalize`，在 save.ts:104 对读到的信封（含只读的更新版本）都跑一遍——只补默认值，不降低、不删除任何值；副作用：`stats.tools` 总会变成 `{}`，`sky` 有则拷贝；幂等、安全，但不做类型校验（NaN/负数能通过），同步层需要自己的 `validate`。main.ts:156-158、:163 启动时往 `intros` 里推入并 `commit`，`veteranToast` 置 false 并 `commit`——后者不安全（#3）。save.ts:99-101 `env.v > 1` 时进入只读，同步层也要当只读，不能写回。

**最可怕的 3 个发现**
1. `boosters` 整体 L + `grants` U：并发发放时奖励永久丢失，"消耗 vs 发放"并发同理（save.ts:158、play.ts:580）。
2. `veteranToast` 在 `or` 规则下无法回落，语音每次启动都重放一遍（main.ts:163）。
3. `resetProgress` 不调 `resetSlot`，重置会被云端整盘顶回；且重置同时清空 `grants` 与 `intros`，会重新发放奖励，和 spec"不重发"冲突（save.ts:108-112，parent.ts:86）。

---

### 跨游戏共同提示（C 组）
- 三个游戏都在内存里长期持有一份存档并整份覆盖落盘：gear-fort main.ts:14，snake-battle save.ts:99，emoji-match save.ts:104——与 spec §3.1"必须经同一 store 的 `load()` 取数，不另存内存副本"直接冲突；同步合并发生在会话中途时，这三处都会把合并结果盖回旧值。
- 原型夹具里这三个游戏有多处与真实类型不符（各节已列）。修好后重跑中性测试，让字符串分支（`lastAt`、`jinnang.mastered`）和整数/数组分支（`arrivals`）都被覆盖——这也是 `DEFAULTS` 要改成真实默认值的原因（本批测试已改用真实 `defaults()`）。


---

## 七、sokoban 推箱子 — store: `site/sokoban/src/app/save.ts:134`（`createStore('sokoban')` 在 `openSave` 内）

**存档形状与规则缺口。** `SaveV1` 在 save.ts:30-53；原型 `SCHEMAS.sokoban` 覆盖 `SaveV1` 全部 20 个字段，但下列规则有问题：

- **`levels.*.legacy: or` 不对**：游戏会主动 `delete rec.legacy`（collection.ts:148）。云端 `or` 会把它复活，复活后会重复计发射、重复走"覆盖星数"分支（见表 #1）。建议 `LevelRec` 新增 `legacyDone?: true`（规则 O），读取处改 `legacy && !legacyDone`，游戏停止 `delete`。
- **`random.poolIdx: maxArr` 不对**：random.ts:111 是 `= idx`，idx 由 `(seed+k)%len` 算出，会变小，max 是棘轮；全树没有任何读取者。建议改 `local`（X）或停止写入。
- **`cosmetics.equipped: map(lww)` 规则对、写法不对**：卸下用 `delete`（hangar.ts:319），必须改写 `null`，类型改 `Partial<Record<slot, string|null>>`。读取处 robotArt.ts:13、hangar.ts:281 对 falsy 都安全。
- **`wrapShownAt: min`、`finale.v1At: min` 规则可保留，写法会失败自合并中性**：两处都无条件 `= Date.now()`（overlays.ts:189、finale.ts:25），新值更大被 min 回退。`finale.v1At` 改 `??=`；`wrapShownAt` 全树只写不读，改 lww 或 X 均可。
- **cap 对照**：sokoban 规则树里没有 FIFO/ring/带 cap 的 set；`random.recent` 是 lww，游戏侧 `slice(-50)`（collection.ts:187）无需对齐。
- **计数器丢增量（可接受，仅提示）**：`plays`、`launched.total/byDest/random`、`random.byTier` 用 M，并发 `+=` 会少算，`total ≥ Σ byDest` 不变式合并后可能被打破；影响仅限 `hubLine` 文案与 `launched.random >= n` 奖励解锁延后。

**游戏侧通用要求（save.ts:123、152-181）**：`SaveHandle.data` 在 `openSave` 取一次后常驻内存，所有写入都是 `store.save(handle.data)`——同步把合并结果写进 localStorage 后，下一次 `save()` 会用旧对象覆盖回去（对 L 和 S 字段尤其危险：旧值被当成新写入重新盖章）；屏幕里还有 `const save = this.ctx.save.data` 这类捕获引用，所以刷新必须原地 `Object.assign`，不能换对象。`inProgress` 是 X，但 `saveSoon()` 每步都写（play.ts:1019、1044、1060、1080、1085-1086）——纯 X 差异不得触发推送，否则每秒推一次。

| # | 字段路径 | 写入点 | 非单调行为 | 同步规则 | 风险 | 游戏侧要求 |
|---|---|---|---|---|---|---|
| 1 | `levels.*.legacy` | collection.ts:148 `delete rec.legacy`（来源 save.ts:86 `importLegacy` 置 true） | 首次重玩旧记录就删除；云端 `or` 复活后 `launchCounted = firstPass \|\| !!prev?.legacy`（:138）会再次 `launched.total/byDest += 1`（:151-152），并走 `rec.stars = r.stars` 覆盖分支（:144） | 现 O 错；建议新增 `legacyDone` 为 O | 高：已有记录被复活后重复计发射，星数走覆盖分支 | 不再 delete，改写 `legacyDone=true`；读取处同步改 |
| 2 | `cosmetics.equipped[slot]`（点"不戴"） | hangar.ts:285→316→319 `delete`；hangar.ts:318 覆盖；collection.ts:91 自动换装 | 键被删除；lww map 里"缺键"是旁观者，云端旧值复活，已卸下的装备下次同步又戴上 | map(lww) 规则对 | 高：用户可见的撤销被反复撤销 | 写 `null`，不要 delete；类型放宽到 `string\|null` |
| 3 | `random.poolIdx[tier-1]` | random.ts:110-111 | 绝对赋值，可降，且无读取者 | maxArr 错 → X | 中：实际无害，但 neutral 会红 | 改 X 或停止写入 |
| 4 | `random.recent` | collection.ts:187 `filter`+`slice(-50)` | 去重后重排并截断整数组 | lww 对 | 低：并发时丢另一台的窗口，只影响随机去重 | 无 |
| 5 | `wrapShownAt` | overlays.ts:188-189 | 无条件 `= Date.now()` 越来越大，被 min 回退；无读取者 | min → lww 或 X | 低 | 改规则或 `??=` |
| 6 | `finale.v1At` | finale.ts:24-25 | 无条件覆盖；生产路径由 collection.ts:155 `!v1At` 守住，dev 钩子 dev.ts:191 可重放 | min 对 | 低 | 改 `??=` |
| 7 | `arrows` | dev.ts:124-125 `setArrows(mode)` 可写回 `'locked'`；dev.ts:118 置 on | 降档（仅测试钩子） | K rank 对 | 低 | `?test=1`/DEV 下同步必须关闭（见 #9） |
| 8 | `inProgress`（X） | play.ts:412-413、1085-1086、1174 `=undefined`；boot.ts:166 `=undefined` | 整条替换或清除 | X 对 | 低 | X-only 变化不得触发推送、不得标脏 |
| 9 | 测试钩子 `unlockAll`、`seed` | dev.ts:108-123 往真存档塞 `{stars:1,clean:true,firstClean:true,best:opt}`；dev.ts:175-176 把 `nextSeed` 调低；入口 boot.ts:173，`test` 来自 boot.ts:36 的 `?test=1` | 造假记录会被推到云端；`nextSeed` 被 max 恢复 | — | 中：线上 URL 加 `?test=1` 就能污染全家云存档 | `?test=1` 与 DEV 下不得 `registerSync`/推送 |
| 10 | `readOnly`（envelope `v>1`） | save.ts:150-152 | 不调用 `load()`，所以首次 reconcile 不会跑 | — | 中：若 `registerSync` 仍挂了触发器，可能把 v1 载荷写进 v2 信封 | 同步写入必须走 kit 的 `write()` 守卫（progress.ts:84-87 已拒写）；状态报"需更新" |

其余字段只升不降：`tutorialDone`、`cert.offered/passed/at`（:172-174 `??=`）、`chaptersSeen`、`taught`、`named`、`onceLines`、`cards`、`cosmetics.owned`、`quiz.*`（Math.max :164）、`levels.best/stars/clean/firstClean/hintMax/twinStars`、`classicUnlocked`、`veteran`、`stats.*`（`+=` play.ts:1175-1182）。

**加载时改写点**：save.ts:103-119 `normalizeSave` 只补缺字段（`{...d, ...data}` 加各嵌套浅合并），不降低任何值，幂等，对同步安全（没有类型校验，`validate` 要另写）；save.ts:151-152 `readOnly` 时 `data = defaults()` 不落盘；kit/progress.ts legacy 分支只在本机没有信封时才跑并 `write(data)`（save.ts:139-140 两个导入器）——第二台设备若云端已有副本必须先 reconcile、不得再导入 legacy，否则导入产物 `legacy:true` 会合并进云端已删 legacy 的记录；没有 `migrate`，以后升版必须补纯函数 `migrateFrom`；没有 `store.reset()` 入口，家长页没有 sokoban 重置，只有 `importProgress`（kit/progress.ts:332-351 `overwrite:true`）整键替换。

**最可怕的 3 个发现**
1. **内存副本**：`SaveHandle.data` 常驻内存且只会整体回写（save.ts:152、163、174），合并结果会被下一次 `save()` 悄悄覆盖，L 和 S 字段被当成新写入。
2. **`delete rec.legacy`**：collection.ts:148 配合 `legacy: or` 让已清除的旧记录复活，重复计 `launched`（:138、151-152）并走 `rec.stars = r.stars` 覆盖分支（:144）。
3. **`delete s.cosmetics.equipped[slot]`**：hangar.ts:319 的卸下装备在 lww map 里不是墓碑，云端旧值让"不戴"反复失效。

---

## 八、military-chess 军棋 — store: `site/military-chess/src/ctrl/save.ts:213`（`openStore`，:212）

**存档形状与规则缺口。** `SaveV1` 在 save.ts:50-103；原型字段与真实类型一一对应、没有缺失字段，但有以下规则问题：

- **`items.*.best: max` 方向错了**：core/progress.ts:51、:54 里 `best` 是最少步数，`0` 表示未记录，越小越好；max 会把后来改进的更小值回退成更差的旧值，是棘轮。建议"忽略 0 的 min"。
- **`items.*.hintMax: max` 不对**：core/progress.ts:52 升星时直接赋值 `o.hintMax`（用 H3 得 1 星后无提示得 3 星，会 3→0）。建议把 `{stars, best, hintMax, at}` 绑成一个 P 组（星多者整条胜出，同星取较小非零 best），或至少 `hintMax` 用 lww。
- **`items.*.last/lastHint`（lww）应成对**：它们在同一次尝试里一起写（:46-47）。
- **`family.log` 的 ring cap=60 但游戏自己裁到 100**：match.ts:1241 是 `.slice(-100)`，`GAME_CAPS` 写 60。游戏写 100 条、合并后只剩 60 条，自合并不中性。规则改 R100，或游戏改 `slice(-60)`（家长页只数近 30 天，100 更稳）。
- **`tagStats.*: max` 建议改 S**：match.ts:1259-1261 是 `++`/`+=`，max 会丢并发增量，还会破坏 `correct ≤ total`。
- **`ladder.*` 计数数组 `wins/cleanWins/handicapWins/undoWins/losses/draws: maxArr`**：`++` 在 core/progress.ts:128-131、135、138，单调，只是并发时少算；阈值判定（`wins>=2`、`cleanWins>0`）在 max 下安全；`gamesPlayed()` 决定先手奇偶（ctrl/ladder.ts:30-35），影响很小。
- **`streakLoss / handicapOffer / recent` 现在是三个独立 lww**：它们在 recordLadder 里一起写（progress.ts:132-133、141、146），独立盖章会拼出不一致状态（如 offer=2 而 streakLoss=0）。建议把 `streakLoss`+`handicapOffer` 做成一个 LWW 组。
- **`deployments` 整数组 lww 会丢另一台设备存的槽位**：deploy.ts:517 "找第一个空槽"，两台设备可能各存一个。建议按下标逐槽 lww。
- **`settings.familyQuiet/shuttleMax` 建议升为 L**：它们是家规，进入家庭局规则（family.ts:213、parent.ts:93-94），保持 X 会让两台设备家庭局规则不一致；规格目前只列 `fanFlagRule`。
- **夹具和真实默认值不一致**：`DEFAULTS['military-chess'].ladder` 原型为 `{}`，真实 `defaultSave()` 带 fan/ming/an 三条完整轨道（save.ts:122）；`SAMPLES` 的 `lastAttacker:'red'`，真实是数字 Side，默认 0（save.ts:138）；`rank` 真实默认 -1（save.ts:120）。
- **死字段**：`lastTemplate` 全树无写入，`stats.minutes` 只在 save.ts:100、156 出现，`seenRefereeIntro` 无写入。

**游戏侧通用要求**：`app.ts:92` 的 `let save` 常驻内存，`store.save(save)` 在 app.ts:107、112、135 和 `app.persist` 里整体回写——与 sokoban 同样的问题（合并写入 localStorage 后会被下一次回写盖回旧值，屏幕里也捕获了 `this.app.save`，刷新要原地合并）；`store.load` 被 save.ts:222 猴补丁，只对外部调用方生效，kit 在首次 `load()` 内部做的 reconcile 看到的是未 normalize 的原始数据，`validate` 要容忍残缺的 v1。

| # | 字段路径 | 写入点 | 非单调行为 | 同步规则 | 风险 | 游戏侧要求 |
|---|---|---|---|---|---|---|
| 1 | 整个存档 | parent.ts:115 按钮；parent.ts:145-158 `reset()`（:152 `keep=settings`，:154 `fresh.settings=keep`，:155 `fresh.firstRun.ft=true`，:156 `app.save=fresh`，:157 `persist`） | 一切回默认；M/O/U/S 全部会被云端复活 | 需 `resetSlot('military-chess')` | 高 | `reset()` 里调 `resetSlot(id)`，确认框写明"云端的这份也会清空"；账本不重置；`rank` 写入 -1 而下次 load 抬到 0（save.ts:200），中性检查要容忍 |
| 2 | `items.*.best` | core/progress.ts:51（升星覆盖）、:54（同星更优则降） | 越小越好，且升星时可被覆盖为更大值 | max 错 → min 忽略 0；或 P 组 | 高：改进被反复撤销 | 无 |
| 3 | `items.*.hintMax` | progress.ts:52 | 升星时 `= o.hintMax`，可 3→0 | max 错 → P 组或 lww | 中：仅在 `lastHint` 缺失时作为掌握度回退（progress.ts:211-213） | 无 |
| 4 | `items.*.last/lastHint` | progress.ts:46-47 | 每次尝试覆盖，设计上可降 | lww 对，宜成对 | 低 | 无 |
| 5 | `items.*.stars/at/tries` | progress.ts:49-53、45 | stars/at 只升；tries `++` | K / M / M | 低 | `tries` 并发少算可接受 |
| 6 | `ladder.*.streakLoss[i]`、`handicapOffer` | progress.ts:132-133（赢则清零）、:136（输则 `++`）、:146 | 赢一盘清零 | lww 对，应成组 | 中：拆开盖章会得到互相矛盾的值 | 无 |
| 7 | `ladder.*.recent[i]` | progress.ts:141 `slice(-5)` | 窗口截断 | lww 对 | 低 | 无 |
| 8 | `ladder.*.unlocked` | progress.ts:148 `max(t.unlocked, after)`，`after=ladderOpen`，而 :107 在 `unlockAll` 时返回 4 | 测试开关 `unlockAll` 泄漏进持久字段，一旦写进去 M 永不下降 | max 对，写法错 | **高**：全家所有设备永久解锁全部对手 | `recordLadder` 的 before/after 按"忽略 `unlockAll`"的开放度计算，另起 `ladderOpenReal` |
| 9 | `ladder.*.wins/cleanWins/…`（经 `aiOverride`） | match.ts:658 用覆盖强度的机器人下棋；match.ts:1249 按名义 `this.level` 记账 | 弱机器人赢的局记成名义高等级的赢，进而影响 `rank`（progress.ts:175-181 的 RANK_RULES 用 `wins[1]`、`cleanWins[2]`、`cleanWins[3]`） | M 对，来源被污染 | 中：不可回撤 | `aiOverride` 生效时不记 ladder，或按实际强度记 |
| 10 | `rank` | progress.ts:192 只升；save.ts:200 归一化器可把 0 降成 -1（`ft` 为 false） | 仅阶段 1 遗留存档 | max 对 | 低 | 无 |
| 11 | `family.log` | match.ts:1241 `slice(-100)` | 裁剪 100 条，规则 cap=60 | R60 → 改 100 | 中：第 61 局后自合并不中性 | 规则与游戏 cap 对齐 |
| 12 | `family.lastMode/seating/firstMover/lastAttacker/dadName` | family.ts:190-192；physical.ts:90；parent.ts:104 | 覆盖写（family.ts:97 是自赋值 no-op） | lww 对 | 低 | 无 |
| 13 | `deployments[k]` | deploy.ts:517（满槽时替换）、:579（教学强制覆盖槽 0） | 用无关值替换整槽 | 整数组 lww → 逐槽 lww | 中：并发丢槽 | 无 |
| 14 | `lastLayout` | deploy.ts:557（handicap 时写 `null`）、:580 | 替换或置 null | lww 对 | 低：已显式写 `null` | 无 |
| 15 | `tagStats.*` | match.ts:1259-1261 | 单调，丢并发增量 | max → S | 低-中 | 无 |
| 16 | `resume / puzzleResume`（X） | match.ts:218、1235、1493；puzzle.ts:177、722；item-common.ts:51；app.ts:220-221 | 整条替换或清空 | X 对 | 低 | X-only 写入不触发推送（match.ts:218 会很频繁） |
| 17 | `settings.*` | parent.ts:28 通用 setter；match.ts:1256、1395、1410 | 覆盖（`refereeSpeed='fast'` 是只升一次） | 除 `fanFlagRule` 为 L，其余 X 对 | 低 | `familyQuiet/shuttleMax` 建议改 L |
| 18 | `family.games/kidWins/dadWins/draws/physicalGames/physicalVerdicts`、`stats.matches` | match.ts:1240、1242-1244；physical.ts:174、238；match.ts:134 | 单调 `++` | S 对 | 无 | 无 |

只升不降、无需单列：`cards`（progress.ts:206）、`firstRun.*`（ft.ts:33、match.ts:973/995、deploy.ts:395、cards.ts:772/810、base.ts:91，无任何 `= false`）。

**加载时改写点**：save.ts:222 每次 `load()` 都跑 `normalizeSave`（app.ts:92 再来一次），幂等；save.ts:167-182 `fit()` 对合法数据幂等，**破坏性分支在 save.ts:173：定长数组长度不等时整体回默认值**（`wins` 等变全 0，`deployments` 清空）——合并结果里某个数组长度与默认值不同就会被一次性抹掉，所以合并必须保持数组长度；save.ts:194-206 的过滤只丢垃圾，对同步安全；save.ts:200 `rank` 重写（`ft` 为 true 时抬到 ≥0，`ft` 为 false 且原值 0 时压成 -1，后者只在阶段 1 遗留存档出现，非幂等但极罕见）；save.ts:216 `migrate: (old) => normalizeSave(old)` 纯函数，可作 `migrateFrom`；parent.ts 的 `reset()` 见表 #1；`exportProgress`/`importProgress`（kit/progress.ts:332-351 `setItem` 整键替换）见规格。

**最可怕的 3 个发现**
1. **`items.*.best` 用 `max` 方向反了**（core/progress.ts:51、54）：每次改进都被云端回退，`hintMax` 同类（:52）。
2. **"清空本游戏进度"只覆盖本机**（parent.ts:115、145-158）：`fresh` 一写完，M/O/U/S 全由云端复活，除非 `resetSlot`。
3. **测试开关泄漏进被 M 保护的字段**：`unlockAll` 让 `ladder.unlocked` 写成 4（progress.ts:107、148），`aiOverride` 让弱机器人的胜局按名义等级记账（match.ts:658 对 1249），影响 `rank`，且都无法撤销。


---

## 九、mars-base 火星基地 v5 — store: `site/mars-base/src/save/store.ts:60`（`createStore<MarsSaveV5>`，`openSave()` 包一层 repair/sanitize；`src/save/` 在 git 里是 untracked 新文件）

**形状与规则对照**：函数还在，重开点没变——`cert.ts:93 recordProvisional`（重开在 :100）和 `adaptive.ts:156 failDirectProbe`（重开在 :159）都还在，mission.ts 里的调用点是 :80、:81。**两处重开都没有 `g++`，而且类型里根本没有 `g`**：`schema.ts:9 NodeState` 只有 `st stars plays ft bridge? why?`，`nodeState()`（schema.ts:62）和 `repair.ts:40 NODE` 也都没 `g`——在这个状态下，原型的 `gv` 规则等于没生效。顶层字段齐全：`MarsSaveV5`（schema.ts:28-51）的 23 个顶层字段原型全覆盖，没有缺字段。

规则缺口 / 规则建议：

| # | 位置 | 问题 | 建议 |
|---|---|---|---|
| R1 | `nodes.*.g` | 类型和默认值里没有 `g` | 加 `g?: number`，缺省按 0；重开处先 `ns.g=(ns.g??0)+1` |
| R2 | `nodes.*.bridge` | 原型 `or`，但 adaptive.ts:111 写 `bridge=false`，单设备也会被棘轮撤销 | 保留 `or`，读侧加守卫：planMission.ts:139 改为 `replay = n.bridge && n.st==='open'`；或把 `bridge` 加进 gv 的守卫字段 |
| R3 | `cert.*` | `certRank=[state,attempts]`，同 attempts 内的进度不参与排名：`prov.left--`（cert.ts:96）、`recheck`/`remedialPlays`（:108-112）；平局任选一边，会重复发复核题或丢 `recheck=true` | 排名改为 `[stateIdx, attempts, (remedialPlays??0)+(recheck?1:0), prov? CERT.provisionalItems-prov.left : 0]`；`state` 代码里只会 `none→half→lit`（cert.ts:70/73），P 对 state 没问题 |
| R4 | `errors.*.recent` | 规则 ring 上限 12，游戏实际 `if (length>3) shift`（mission.ts:71），合并后能涨到 >3，游戏每次只 shift 一个，不会收回 | `GAME_CAPS['mars-base.errors.*.recent']` 改 3，规则 cap 同步改 3 |
| R5 | `orbit.tests` | 规则 R40，但 mission.ts:124 只 push、不裁剪，超过 40 条时自合并不中立 | 游戏侧 push 后裁到 40（ord=at） |
| R6 | `session.lastActiveAt` | 规则是 M，但 session.ts:8 直接 `= now`，时钟回拨时会变小 | 改 X（或 L）；保留 M 的话，别的设备 `now < lastActiveAt-20min`（session.ts:7）会让每次开页都 `index++` |
| R7 | 未登记的 X | star-pets §3.6/§3.8 要往 mars 存档（v6）加 `eco.pending[]`、`daily.run`、`daily.runSeq`，这些会被 flush 删除或清空 | 全部登记为 X；`migrateFrom` v5→v6 要纯函数，`retro:` 账本事件不能放进去 |
| R8 | SAMPLES | `tags`（缺 window/tailNoHint/mastered/reviews/repDown/wrongRun）、`orbit.tests`（缺 targets/est/r2/slope/pae/valid）、`mission:{node}` 过不了 repair.ts 的 SHAPE，会被整条丢掉 | 用满字段样本；`sync.validate` 用 `repairSave(x).changed===false`，别用 store.ts:35 `sanitize`（它只检查 mission） |
| R9 | NOT_SYNCED | 写的是 `mars-base:pre-v5-*`，真实键是 `kg:v1:mars-base:pre-v5-<ts>` / `:corrupt-<ts>`（store.ts:25/47）；`corrupt-*` 没登记 | 补全这两个模式 |
| R10 | `direct` 与 `nodes` | `failDirectProbe` 同时做两件事：重开节点（:159，K 规则）和删 `direct.pending`（:160，L 规则）；节点重开被撤销、pending 删除生效，节点会永久停在 skipped | 随 R1 的 `g++` 一起修 |

**非单调写入表**

| # | 字段路径 | 写入点 | 非单调行为 | 规则 | 风险 | 游戏侧要求 |
|---|---|---|---|---|---|---|
| 1 | `nodes[id].st/why` | cert.ts:100 | 灯亮后复核 ≥2 错，任意状态（含 done/skipped）→`open`，`why=undefined` | G | **高**：云端 done/skipped 按 K 秩覆盖回来 | 此处 `g++`；清 `why` 靠 g 更高整体胜出，不要靠 `undefined` |
| 2 | 同上 | adaptive.ts:159（pending 删除 :160） | 直达探针答错，skipped(direct)→open，`why` 清掉 | G | **高**：同上，并与 `direct` 失配（R10） | `g++`，且要先于 pending 过滤 |
| 3 | 同上 | migrate.ts:31-32 | v4→v5 把校准节点作废：open、`stars=0`、`why='voided'` | G(K) | 低：v4 设备不同步 | **不要**在 `migrateFrom` 里给 voided 记 g，否则会盖掉云端 v5 新完成的校准 |
| 4 | `nodes[id].bridge` | adaptive.ts:110 置 true，:111 置 false | true→false | O（错） | **高**：单设备也会被云端 true 撤销 | 见 R2 |
| 5 | `nodes[id].stars` | mission.ts:125 `ns.stars=0`，adaptive.ts:111 `Math.max` | 只有校准节点（stars 恒 0）被赋 0 | M | 低 | 无 |
| 6 | `nodes[id].plays/ft` | adaptive.ts:99，mission.ts:125 | 只增，ft 只 push | M / `longer` | 低 | 无 |
| 7 | `nodes[id]`（整条） | repair.ts:26（rec 丢坏条目）、:34 | 缺 `ft`/`plays` 非数的节点被整条删除，store.ts:68 落盘 | — | 中：合并结果或远端若缺必填字段会丢进度 | 合并输出必须过 SHAPE |
| 8 | `tags[tag]` | adaptive.ts:61 档位 -1，:47 窗口，:64 repDown--，:76 reviews 重置，:78 shift，:79 shaky 清除 | 整条记录会降 | L | 中：`levelFor`→`tagState`（adaptive.ts:26 `??=`，planMission.ts:140）在发题时就插入默认记录，较晚的默认记录会盖掉另一设备的真实进度 | `levelFor` 改成不插入的查找，只在 `recordMain/Warm` 里创建 |
| 9 | `zoneHist[z]` | adaptive.ts:115 | 长度 4 的滑窗 shift | L | 低 | 无 |
| 10 | `cert[C]` | cert.ts:67 `recheck=false`、`remedialPlays=0`、`attempts++`；:73 `prov=undefined`；:96 `prov.left--` | `recheck` true→false，prov 清空 | P | 中 | 见 R3；清空 prov 要写 `undefined`，且 attempts 同时 +1（已满足） |
| 11 | `probes[z]` | mission.ts:107 | 整体替换 `{done:true,score}`，但 screens/app.ts:111 只在 `!done` 时进入，所以只有一次 | `done:O,score:M` | 低 | 无 |
| 12 | `session.lastActiveAt` | session.ts:8（`touchVisit` :11 用 Math.max） | 时钟回拨变小 | M（错） | 中 | 见 R6 |
| 13 | `session.index/missions`、`lastPlayed[z]`、`visited`、`buildings`、`baseLevel`、`cards` | session.ts:7；mission.ts:113/136-137；base.ts:55-57 | 均只增 | M / U | 低 | 无 |
| 14 | `errors[c].n` / `recent` | mission.ts:71 | `n++`；`recent` shift 到 3 | `n:M`，`recent:R` | 中 | 见 R4 |
| 15 | `recent`（ring） | schema.ts:70 `splice(0, n-300)` | 裁剪 | R300 | 低：`RECENT_RING=300`（tuning.ts:73）一致，但 `recentRate`（adaptive.ts:16）按数组位置取最近 N 条，合并必须保持同 visit 内的插入顺序 | merge 对相等 ord 用稳定排序 |
| 16 | `orbit.tests` | mission.ts:124 push；migrate.ts:33 迁移时整体赋值 | 只增，不裁剪 | R40 | 低 | 见 R5 |
| 17 | `direct` | adaptive.ts:151 push，:160/:164 过滤删除 | 删元素 | L | 中 | 见 R10 |
| 18 | `onboarded` | screens/app.ts:192（`shouldAutoSkip()`）、:212；migrate.ts:35 置 false | 测试开关 skipIntros 把同步标记写成 true，传到所有设备 | O | 中 | 自动跳过时不要落盘，或接受并写进规格 |
| 19 | `tutorials` | 仅 migrate.ts:35 | v5 里没有写入点，死字段 | O | 低 | 无 |
| 20 | `race.games`、`checker` | 无写入点（只读 base.ts:33/46） | 无 | M | 低 | 无 |
| 21 | 整档删除 | main.ts:50 rescue 按钮 `removeItem('kg:v1:mars-base')` | 整档清空，不走 `resetSlot` | — | 中：本地空档被误读为重置 | 改调 `resetSlot('mars-base')`，或确保同步层把"本地缺失"当作无变化 |
| 22 | 整档替换 | dev/test-hook.ts:39 `setSave` | `Object.assign(app.save, defaultSave(0), patch)`，会真写 localStorage | — | 低：仅 `?test=1` | 测试模式下不得 `syncNow` |
| 23 | `mission`、`directOffer`、`settings`、`salt` | mission.ts:108/113/138；store.ts:39；adaptive.ts:119/147/154；store.ts:57 | 清空或重置 | X | 低 | 无 |

mars 没有任何"重置进度"按钮：mars 源码和 `site/parent/src` 里都没有；唯一的整档清除是第 21 行。

**加载时改写点**
- `store.ts:64-70 load()`：先 `store.load()`，再 `repairSave`；`changed` 时 `quarantine` 备份并 `store.save(r.save)`（:68），最后 `sanitize`（:69，不落盘）。
- `repair.ts:59-70 repairSave`：对纯净存档幂等，但会改写数据——记录/数组里的坏项直接删除（:22、:26）；**固定键对象里任一必填子字段不合法，整个子对象回落默认值**（:34、:65）。例如 `cert` 里 C2 的 `state` 若是 passenger 枚举，C1/C2/C3 三块徽章整体归零并落盘；`session`、`probes`、`race`、`direct`、`orbit` 同理。**这条要求合并输出必须先过 SHAPE，否则一次同步就会写出降级存档。**
- `migrate.ts:38-41 migrateTo5`：`from>=5` 原样返回；`v4ToV5` 有副作用（migrate.ts:35 置 `onboarded=false`、清 `buildings`），不能被 `migrateFrom` 复用。
- `store.ts:17-33 backupBeforeLoad`：写备份键并 `removeItem` 旧备份（:30）；这些键会被 `exportProgress` 导出。
- `session.ts:5-9 beginVisit`：每次开页写 `index/lastActiveAt`。`app/base.ts:55-57 updateBase`：每次开页执行，只做 max/push，安全。

**最可怕的 3 个发现**
1. cert.ts:100 和 adaptive.ts:159 重开节点没有 `g++`，`NodeState`（schema.ts:9）也没有 `g` 字段，云端的 done/skipped 会在下次同步把重开撤销；adaptive.ts:160 同时删了 `direct.pending`，节点会永久停在 skipped。
2. adaptive.ts:111 写 `bridge=false`，规则是 `or`，单设备下云端的 true 也会把它撤回来，让 planMission.ts:139 误判为重玩并封顶题目档位。
3. repair.ts:34/65 加 store.ts:68：合并结果里 `cert.C2.state` 若是 passenger 枚举，三块徽章会被默认值覆盖并落盘；同一机制也会重置 `session`。

---

## 十、memory-matrix 记忆方块（重做版）— store: `site/memory-matrix/src/main.ts:39`（`createStore<Save>`，无 `migrate`）

`core/save.ts`、`core/controller.ts` 头部写着 GENERATED：改规则要改 `tools/memory-matrix/proto/*.mjs` 再跑 `sync-core.mjs`。

**形状与规则对照**：`defaults()`（core/save.ts:10-15）有 `v introSeen tutorial{s1..s4} nights nightsAny cards flags{rotation} sectors recent settings{colorAssist} lastSeen`；`normalizeSave`（session.ts:59-102）另外补出 `nightClock`（:67）、`seenRules`（:69）、`practiceN`（:70）、`salt`（:71）、`voice{once,week,nightAt}`（:72）；`veteran` 由 `applyVeteran`（save.ts:17-24）写入。"每扇区一个 LWW 寄存器"成立：`repairTrack` 按 `L ≤ gates[cleared]` 做钳位，整条取最新写入，内部才自洽。**`defaults()` 不确定**：`defaults: () => normalizeSave(null, mkSalt)`（main.ts:39）每次生成随机 `salt`，同步层比较或迁移要避免调用它。

规则缺口 / 规则建议（M1-M5、M7、M8 已写进 `schemas.ts`）：

| # | 字段 | 问题 | 建议规则 |
|---|---|---|---|
| M1 | `nightClock` | 缺规则；`endNight` 里 `+= 1`（session.ts:341） | `max` |
| M2 | `seenRules` | 缺规则；`markRuleSeen` 只 push（session.ts:239） | `set`（U） |
| M3 | `practiceN` | 缺规则；`+= 1`（session.ts:242） | X（用作种子计数） |
| M4 | `salt` | 缺规则；`normalizeSave` 缺失时 `mkSalt()`（:71） | X（`local`） |
| M5 | `voice` | 缺规则；`once.push` / `week[id]=now()` / `nightAt[id]=nightClock`（voice.ts:74-76） | 最简单是整体 X；要同步则 `once:set`、`week:map(max)`、`nightAt:map(max)`。`Voice` 持有 `engine.save.voice` 的引用（main.ts:83），换存档对象后引用会陈旧，`abandon` 在 session.ts:356 手工保住了它 |
| M6 | `sectors` | LWW 会让**陈旧设备覆盖更多进度**：寄存器里混着单调进展（`cleared`、`maxL`、`byLevel.stars`、`open`、`stats`、`rounds`）和易变状态（`nr`、`nightMiss`、`nightRec`、`queue`、`carryRw`） | 建议改 `map(pick(rank=[Σtracks.cleared, Σtracks.maxL, rounds, nights]))`，平局回落 LWW；`levelDown` 也会 `rounds+1`，所以不会被排名压回去。把握中等，需要中性测试验证（**S10 决定**） |
| M7 | `recent` | 原型样本用字符串哈希 `'a1b2c3d4'`，真实是有限数字（`hashString`）；`normalizeSave`（session.ts:98-99）用 `Number.isFinite` 会把样本清空 | 样本改数字 |
| M8 | `cards` | 原型样本和 DEFAULTS 里是 `'c.vet'`，真实存的是 `'vet'`；`normalizeSave`（session.ts:65）每次加载把 `c.vet` 改成 `vet`，任何设备写入 `c.vet` 都会被 U 合并拉回，每轮同步都不中立 | `validate` / `migrateFrom` 同样做 `c.vet→vet` 映射 |
| M9 | `veteran` | LWW 能用，但 `source` 取决于本机有没有旧键 | 可改 `pick([cleared, stars])` |
| M10 | `nights` / `nightsAny` | M 会少算另一设备的夜数；`cardCtx.nights`（session.ts:167）驱动卡片解锁 | 对用户可见的计数考虑 S |

**非单调写入表**

| # | 字段路径 | 写入点 | 非单调行为 | 规则 | 风险 | 游戏侧要求 |
|---|---|---|---|---|---|---|
| 1 | `sectors[s].tracks[i].L` | controller.ts:107（答错 -1 或 -2）、:126（闸门失败 `L=G-1`）；升档 :100-102、:124 | 自适应控制器上下都动 | L（或 P，见 M6） | 中：整寄存器被陈旧设备覆盖 | 见 M6 |
| 2 | `…tracks[i].s/m/ramp/atG/gateFails/park/parkCount/placement/cleared/maxL` | controller.ts:96、:104、:109、:123-127 | 计数归零、`placement` 关闭；`cleared`、`maxL` 只增 | 同上 | 中 | 同上 |
| 3 | `sectors[s].cur` | controller.ts:40 换翼；session.ts:85 在 `tracks[0].cleared<1` 时强制 0 | 双向 | 同上 | 低 | 无 |
| 4 | `sectors[s].nights/swaps/nr/nightMiss` | controller.ts:36；**回滚** session.ts:369（没完成一局就离开，扇区恢复为 `nightSnap`） | 回滚会让 `nights/swaps` 变小 | 同上 | 低：恢复的是已存状态，中立 | 无 |
| 5 | `sectors[s].nightRec` | session.ts:186、:342、:373，`normalizeSave` :88-89 | 置 null | 同上 | 低 | 无 |
| 6 | `sectors[s].queue` | controller.ts:46 unshift、:90 push、:92 整体重赋，`nextRound` shift | 弹出、重置 | 同上 | 低 | 无 |
| 7 | `sectors[s].gate/pending` | session.ts:91 每次加载置 null；`serialize` :378 | 每次加载/保存都清 | 同上 | 低：已存的本来就是 null | 无 |
| 8 | `sectors[s].open` | session.ts:180、:312（只置 true）；:92 把 s1 钉成 true | 单调，但在 L 寄存器里陈旧设备能关掉它 | 同上 | 中 | 见 M6 |
| 9 | `sectors[s].byLevel[D]` | session.ts:301（`if (!bl.stars)` 守卫）、:275（桥接首次通过点亮） | `stars` 单调；`normalizeSave` :82 把 `att` 夹到 ≤99 | 同上 | 低：`att` 超 99 时每次加载被下压 | 无 |
| 10 | `sectors[s].stats.*` | session.ts:299 附近 `s.rounds += 1` 等 | 计数只增 | 同上 | 低：并发设备会少算 | 无 |
| 11 | `sectors[s].last20/badStreak/last/carryRw` | session.ts:300、:341、:226 | `badStreak` 归零；`carryRw=0` | 同上 | 低 | 无 |
| 12 | `sectors[s].span` | session.ts:322 Math.max、:331 | 单调 | 同上 | 低 | 无 |
| 13 | `recent[s].exact/shape` | session.ts:202-203 `slice(-64)` / `slice(-6)` | FIFO 窗口 | L（整条） | 低：另一设备的去重历史会丢 | 无 |
| 14 | `nights` / `nightsAny` | session.ts:340 | 只 `+= 1` | M | 低 | 见 M10 |
| 15 | `tutorial[s]` | session.ts:270；main.ts:166（`shouldAutoSkip()` 自动置 true）；测试 main.ts:43 | 只置 true | O | 中：测试开关 skipIntros 的效果落进同步 O 标记 | 自动跳过时不要落盘，或写进规格接受 |
| 16 | `introSeen` | main.ts:129；测试 :42 | 只置 true | O | 低 | 无 |
| 17 | `flags.rotation` | 无写入点也无读取点，只在 save.ts:11 作默认值（params.ts:61 是 stretch 档） | 无 | L | 低：死字段 | 无 |
| 18 | `cards` | session.ts:171 push；:65 去重并改名 | 只增 | U | 低 | 见 M8 |
| 19 | `veteran` | save.ts:21，每次加载经 session.ts:119-125 重写 | `computeVeteran`（veteran.ts）与已有值取 max，`awardedAt` 保留；`source` 随本机旧键变化 | L | 低：幂等 | 无 |
| 20 | `settings.colorAssist`、`lastSeen` | `lastSeen`：session.ts:126/191/287/316，其中 :126 把过大的值压下去 | 向下钳位 | X | 低 | 无 |

没有重置按钮：`index.html`、`main.ts`、`view/` 里都没有。测试钩子 main.ts:197 `loadSave` 会整体替换 `engine.save`，只在测试用。

**加载时改写点**（都是幂等的，但合并输出和远端载荷都要先过同一套 `normalizeSave` 才算中立）：`session.ts:59-102 normalizeSave`（调用点 :119 构造、:122 `applyVeteran` 之后、:356 `abandon`）——`cards` 改名去重（:65）、计数钳位（:66-70）、`recent` 过滤并裁剪（:98-99）、每个扇区 `cur` 重算（:85）、`nightRec` 重算（:88-89）、`gate/pending` 置 null（:91）、`s1.open` 钉 true（:92）、`last/badStreak/last20/carryRw` 钳位（:93-96）；session.ts:126 `lastSeen` 被压到当前时间以下（X 字段）；save.ts:17-24 `applyVeteran` 每次加载都跑，因为 main.ts:40 传入的是 `null` 而不是 `undefined`。

**最可怕的 3 个发现**
1. 扇区是单个 LWW 寄存器：落后的设备更晚写一次，就能用更少的 `cleared/maxL/byLevel.stars/open` 整条盖掉另一设备的大量进度，应改为按进展排名（M6）。
2. `voice`、`nightClock`、`seenRules`、`practiceN`、`salt` 五个真实字段在原型规则树里没有规则；`Voice` 还持有 `engine.save.voice` 的引用（main.ts:83），同步一旦换掉存档对象就会写进孤儿对象。
3. `cards` 的 `c.vet` / `vet` 不一致（session.ts:65 vs 原型样本）加上 `recent` 样本用字符串、真实是数字（session.ts:98-99）：按原型样本写出的数据，会被 `normalizeSave` 改写，永远无法自合并中立。

---

## 十一、economy（星币 / 宠物）— **未建**（`docs/specs/star-pets.md` §3.1 的 `kg:v1:economy = {v,ledger,pet,seen}`；`kit/clock`、`kit/economy` 均不存在，`kit/sync/ledger.ts` 已有）

`pet`：map·L，值可为 null；`seen`：U；`ledger`：走独立通道，槽规则里是 `local`。

规则缺口 / 规则建议：
- **原型 economy 仍含 `dev: local`**（SCHEMAS、SAMPLES、DEFAULTS 三处）：star-pets §3.1/§3.9 和 sync.md §8.4 都要求删除 `dev`；留着的话叶子覆盖检查会反过来报错。（已删，见 schemas.ts）
- **`pet` 的 null 墓碑没有回收规则**：star-pets 写"≤300 条、值 ≤64B"，没说 null 条目算不算在内。同步层若修剪 null，云端旧值会复活，所以墓碑要永久保留，上限只能计非 null。
- **撤销栈（10 步）**必须放内存或设备本地键，不能进 `kg:v1:economy`。
- mars 存档里的 `eco.pending[]`、`daily.run`、`daily.runSeq` 见 mars-base 的 R7。

| # | 字段路径 | 写入点 | 非单调行为 | 规则 | 风险 | 游戏侧要求 |
|---|---|---|---|---|---|---|
| 1 | `pet["slot:<房间>:<位置>"]` | §5.4 摆放/移动/放回仓库/撤销 | 移动 = 写新位置 + 旧位置写 null；放回 = null；撤销 = 写回旧值 | L | 中 | 一律写显式 `null`，不用 `delete`（LWW 差异看不到删除，会被云端复活）。两个位置落同一物品时 §3.5 要求"下次写入顺手把失败者写成 null"，这是读路径上的写入，应改成只在用户操作时写 |
| 2 | `pet["wear:<线>"/"paint:<线>"/tint/active/goal]` | 试戴、涂装、灯光、钉目标；买下后清 `goal` | 替换为另一个值或 null | L | 低 | 清除写 null |
| 3 | `pet["name:<线>"]` | §4.7 孵化取名 | 整体替换 | L | 低 | 若允许改名同理 |
| 4 | `pet["gift:<物品>"]` | §7.3 家长页写入，孩子拆开后写 null | 写入后被清除 | L | 中：墓碑丢了会让"拆开"反复出现 | 墓碑永久保留 |
| 5 | `seen` | §3.1 | 只增 | U | 低：star-pets 没有"重看教学"会清它的描述 | 保持只增 |
| 6 | `ledger` `spend` | §2.3/§3.2：`buy`、`feed`、`fest` | 余额下降；事件本身不可变，折叠是事件集合的纯函数 | 账本通道 | 低 | 购买前校验本机余额 ≥ 价格 |
| 7 | `ledger` 退货/调整 | star-pets 无退货、无 `adjust`（§3.2/§3.9/§5.4） | 不存在 | — | 低：但 sync.md 残留描述，见下 | sync.md 清理 |
| 8 | `ledger` `egg:<线>` 孵化 | §4.1 + §3.2 | 自然规范事件 `grant 0`，不可撤销 | 账本通道 | 低：两设备离线时各选一条线会立刻拿到两颗蛋（"第一单后 2 选 1"），规格没说明 | 规格补一句 |
| 9 | `ledger` `retro:node:<节点>` | §3.8 迁移追补，仅迁移前一次，12 币 | 不可撤销 | 账本通道 | 低 | 由 mars v5→v6 的**迁移步骤**发出，不能放进 `migrateFrom`，必须先于收件箱并入 |
| 10 | `ledger` `mn:` / `ck:` / `b:` | §3.2 确定性非自然 id | `b:` 同 id 异内容取较小 `(lc,d,JSON)`，两设备各买同一件会少付一次，余额可能反而上升 | 账本通道 | 低：与 §8.4 的保证一致 | 无 |
| 11 | `importProgress` 与 `kg:v1:economy` | kit/progress.ts:332-352 | 同版本整键替换，备份里没有的新事件全部丢失，物品和蛋随之消失 | 必须并集 | **高**：尚未实现 | 见 kit 一节 |

**与 sync.md §8.4 / §3.1 矛盾或遗漏的规格点**
- 本机普通事件 id：sync.md §8.4 写 `<d>.<ts36>.<seq36>`（含墙钟）；star-pets §3.2 写 `<d>.<lc36>`（不含墙钟）。
- 残留的旧 id 类：sync.md §8.4 的自然 id 列表还有 `m:` `d1:` `rf:` `first:`，且写了"退货按原价入账"；sync.md §3.1 还写"账本永不重置（只能追加 `adjust`）"。而 §8.4 的 `kind` 里没有 `adjust`，star-pets 明确"无退货、无 adjust、无 m:/d1:/rf:"（§3.2/§3.9/§5.4）。
- 缺失的 id 类：star-pets 用 `mn:` `ck:` `b:` 三种确定性非自然 id，sync.md §8.4 的 id 分类没有它们（本批 `tests/economy/contract.test.ts` 已验证它们都过 `ID_RE`）。`b:` 同 id 异内容取较小是常规路径，§8.4 只把它当作自然事件的违约情形。
- mars 存档版本：sync.md §4.1 写 mars-base v5 的 X 清单；star-pets §3.6/§3.8 把 mars 存档推到 v6 并新增 `eco.pending` / `daily.*`。
- 规格内数字不一致：账本年增量 §2.5 G8 写约 330KB，§3.9 写约 250KB。

**最可怕的 3 个发现**
1. star-pets §3.7 要求 `importProgress` 对 `kg:v1:economy` 取并集，而 `kit/progress.ts:332-352` 现在是整键替换，一次旧备份恢复就会清掉备份之后的所有币事件，已买物品和蛋随之消失。
2. star-pets §3.5"下次写入顺手把失败者写成 null"是读/渲染路径上的 LWW 写，会盖掉另一设备的正当编辑，也会让每次加载产生差异，不满足 sync.md §3.1 的写存档纪律。
3. 原型 schemas 仍保留 `economy.dev`，而 star-pets §3.1/§3.9 / sync.md §8.4 都要求删除，`kit/clock` 目前也不存在，两台设备的 `d/lc` 来源还没定下来。

---

## 十二、kit 级 store：settings / hub-seen / metrics（目前都不是 `createStore`，是裸 localStorage 键，上线前要包一层同步工厂才满足 sync.md §3.1 的 lint）

**settings**（`kit/settings.ts:23 SETTINGS_KEY='kg:settings:v1'`）
- 持久化：纯 JSON 对象，无信封；`updateSettings`（:81-93，`setItem` :84）把整个规范化后的对象写回。
- GLOBAL / DEVICE / TEST 与 sync.md §4.1 一致：GLOBAL = `displayName narration pinyin hiddenGames`，TEST = `skipIntros unlockAll`（X）。家长页能改 `skipIntros`（`site/parent/src/main.ts:410`）和 `unlockAll`（:413），都能关掉，但是 X，只影响本机。
- `hiddenGames`：main.ts:391-393 整数组替换，并发时 LWW 丢一次切换。`unlockAll` 只在读取时生效（settings.ts:122），mars 里没用到。
- **整对象写**：`updateSettings` 每次写全部 6 个键（:82-84）。若同步层按"写入"盖章，在陈旧设备上切一个测试开关就会用旧值重盖 `displayName` 等 GLOBAL 键。要求按与基线的差异盖章，或只写变化的键。
- **未知键丢失**：`normalize`（:60-70）只保留 6 个键，较旧的缓存页执行一次 `updateSettings` 就会擦掉新版本加的键（中）。需要透传未知键。
- **测试开关外溢**：`skipIntros` 的效果被写进同步的 O 标记：mars `screens/app.ts:192`（`onboarded=true`）和 memory-matrix `main.ts:166`（`tutorial[s]=true`）。"算作看过"的结果会传到其他设备（中）。
- 加载时改写：`getSettings` 只在读取时 `normalize`，不写回，幂等。

**hub-seen**（`kg:hub:seen`，`site/_hub/main.ts:30`）：唯一写入点 main.ts:298-301，读取点 :106、:298，读-加-写，只增，没有删除，规则 U 正确；数组无上限但量很小，风险低。`kg:hub:visited`、`kg:hub:tab`（:31-32）和 `kg:hub:v1`（由 `setHubProgress`，kit/progress.ts:195-202，每次开游戏覆盖）是派生/本机状态，不同步。

**metrics**（`kit/metrics.ts:24 METRICS_NAMESPACE='kg:metrics:v1:'`，键函数 :89）：本地键是每游戏一个 `kg:metrics:v1:<game>`，**不是** `<game>@<设备>`；`writeMetricsSummary`（:161-181，`setItem` :176）每次 `refresh()` 整条覆盖（mars `screens/app.ts:134`，memory-matrix `main.ts:104`）；`clearMetricsSummary`（:206-210）没有非测试调用点。**别的设备的条目必须放进独立的本地命名空间**，不能直接写进 `kg:metrics:v1:<game>`，否则远端覆盖本机后下次 `refresh()` 又覆盖远端，来回乒乓；`listMetricsSummaries`（:188-204）也要扩展。版本守卫（:167）与同步无冲突。

**最可怕的 3 个发现**
1. `skipIntros`（X）的效果通过 `onboarded` / `tutorial` 的 O 标记进入同步存档（mars screens/app.ts:192，memory-matrix main.ts:166）。
2. `updateSettings` 每次整对象写 6 个键（kit/settings.ts:82-84），若按写入盖章，一个本机测试开关切换就能用陈旧值重盖其他设备改过的 GLOBAL 设置。
3. metrics 本地键是 `kg:metrics:v1:<game>`（kit/metrics.ts:89），没有设备维度，不加命名空间隔离的话，远端条目会和本机 `refresh()` 互相覆盖。

---

## 十三、kit/progress.ts — export / import / reset（`createStore` 在 :76）

- **`importProgress`**（:332-352）：对每个导出键直接 `setItem`（:349），只有一道版本守卫（:342-347，仅当本机信封版本 > 备份版本才跳过）；同版本的旧备份会整键覆盖较新的进度。**对 `kg:v1:economy` 没有任何并集处理。**
- 版本守卫只覆盖 `kg:v1:*`（`NAMESPACE='kg:v1:'`，:20）；`kg:settings:v1`、`kg:hub:seen`、`kg:parent:pin`、`kg:metrics:v1:*` 等整键无守卫替换。
- **`exportProgress`**（:310-318）+ `exportable`（:308 `key.startsWith('kg:')`，:338 导入也用它）：导出全部 `kg:*`，包括 `kg:parent:pin`、`kg:log:v1`、`kg:v1:mars-base:pre-v5-*` / `:corrupt-*`，以及将来的 `kg:clock:v1`、`kg:sync:*`；sync.md §3.1 要求排除后两者。
- **`store.reset()`**（:147-156）：`removeItem(key)`，只有"较新版本不删"的守卫；mars 和 memory-matrix 都没有调用它。
- 加载迁移（:110-120）：迁移成功立刻 `write(upgraded)`，幂等。
- 家长页导入（`site/parent/src/main.ts:484`）：`importProgress(bundle,{overwrite:true,skipped})`，确认框写"同名内容会被替换"，没提云端，导入后也不调 `syncNow('import')`。

| # | 对象 | 位置 | 行为 | 要求 |
|---|---|---|---|---|
| 1 | `kg:v1:economy` | kit/progress.ts:349 | 整键替换，丢账本事件 | 并集：账本按 id，`pet` 逐键 LWW，`seen` 并集，文件里的 `dev` / `lc` 忽略 |
| 2 | 所有同步存档（同版本旧备份） | :349 | 把已有进度换成旧备份；单调字段云端会拉回来，L/G/R 字段会被当作新写入重盖章 | 导入后 `syncNow('import')`；单调字段不被旧备份拉低；已开通时先同步一轮，并提示"未同步的新内容会被文件替换" |
| 3 | `kg:clock:v1`, `kg:sync:*` | :308/:338 | 备份里若带有，会把另一台设备的 `d`/`lc` 导进来，造成事件 id 冲突，服务器先到先得会丢掉一台设备的事件 | `exportable` 里排除（该函数同时管导出和导入） |
| 4 | `store.reset()` | :147-156 | 删整键，不走 `resetSlot` | 改调 `resetSlot(id)`，确认框写明"云端的这份也会清空" |

**最可怕的 3 个发现**
1. kit/progress.ts:349 对 `kg:v1:economy` 整键替换，而 star-pets §3.7 明确这件事"必须先于星币上线"。
2. `exportable`（:308）会在 `kg:clock:v1` / `kg:sync:*` 出现后原样导出再导入，两台设备共用同一个 `d`，事件 id `<d>.<lc36>` 会冲突并被服务器丢弃。
3. 版本守卫只管 `kg:v1:*`（:342），`kg:settings:v1`、`kg:hub:seen`、`kg:metrics:v1:*`、`kg:parent:pin` 被旧备份无条件整键替换，家长 PIN 也能被备份文件改掉。

