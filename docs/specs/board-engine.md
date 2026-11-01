# BoardKit · `engines/board` · 共享棋盘引擎设计 v1.1（评审后修订，对国际象棋 8×8 与象棋 9×10 通用）

> 日期 2026-10-13 ｜ 作者：规格代理（key `revise-xiangqi`）｜ 读者：**engines/board 构建任务**（唯一所有者）、楚河棋院（`docs/specs/xiangqi.md`）与棋手学院（国际象棋，`docs/specs/chess.md`）的实现代理。
> 本文取代 `engines/board/README.md` 的草图。**契约有可编译源**：`~/kid-games-work/specs/board-contract/src/types.ts`（21 KB，用仓库 tsconfig 的 strict / noUnusedLocals / isolatedModules 通过 `tsc`），S0 原样放进 `engines/board/core/types.ts`；**可运行的一致性套件与参考 Game**：同目录 `src/{conformance,game,run}.mjs` + `adapters/{xq,chess}.mjs`——象棋原型与国象原型（`chess-tools/rules.mjs`）各跑 16 项一致性（69 万 / 37 万断言）+ 14 条特例向量，全绿（`node run.mjs`）。冲突以 types.ts 为准并改本文。陆战棋不使用本引擎。

## 0. 所有权、交付门、变更通道（解决评审"三份文档三种说法"）
- **`engines/board/**` 只有一个所有者：独立任务「engines/board build」（key `engines-board`）**。它先于楚河棋院与棋手学院的构建运行；`engines/board/README.md` 的 `Owner:` 行与 `military-chess.md §0` 的"owner 是棋手学院"由协调者改成此说法。游戏构建代理**不得**修改 `engines/board/**`，唯一例外是各自的游戏包：楚河棋院 = `games/xiangqi/**`；棋手学院 = `games/chess/**` + 预先划定的三个扩展点 `view/promotion-picker.ts`、`lesson/steps-chess/**`、`ai/ops-chess.ts`（由 S0 建好空壳与导出口）。
- **变更请求通道**：游戏代理缺什么，就追加一条到 `~/kid-games-work/state/rr/engine-requests.md`（格式 `日期｜游戏｜接口/文件｜要什么｜是否破坏性｜原因`），本游戏内先用本地替代；engines-board 每个 session 开头处理（接受 / 拒绝 / 延后，写回同一行），协调者仲裁（本轮禁提交 / 推送，没有"PR 描述"通道）。
- **交付门**：`engines/board/STATUS.md` 出现 `S0: FROZEN`（核心契约 + `Game` + 一致性套件 + 参考适配器全绿、`tsc` 通过）之前，游戏代理**只能做 tools / content / 原型**，不得开 `games/<id>/**`；之后各阶段按 STATUS 对应行解锁（§14）。STATUS.md 由 engines-board 维护，三栏：已冻结（改动 = 破坏性，走请求）/ 可改 / 未做。
- 工作包与出口准则见 §14（按 bounded agent session 拆，不再按周）。

## 1. 目录与屏幕状态机
```
engines/board/
  core/   types.ts · rng.ts(mulberry32+hash32) · game.ts · search.ts · errormodel.ts · see.ts · coach.ts · hints.ts
  view/   board-view.ts · piece-layer.ts · overlays.ts · anim.ts · effects.ts · orientation.ts · layout-types.ts · promotion-picker.ts(chess 扩展点)
  input/  input-controller.ts · snap.ts · keyboard.ts
  ai/     host.ts · worker-entry.ts · protocol.ts · ops-chess.ts(扩展点)
  lesson/ player.ts · steps.ts(registerStep) · ghost.ts · twins.ts · steps-chess/(扩展点)
  puzzle/ player.ts · validate.ts · audit.ts(偷懒策略)
  play/   session.ts · facetoface.ts · replay.ts · recorder.ts      save/ adapter.ts
  art/    shade.ts · bake.ts            test/ conformance.ts · perft.ts · diff.ts · calibrate.ts · pw.ts · reference/
  games/xiangqi/ | games/chess/   rules.ts · geometry.ts · theme.ts · pieces.ts · notation.ts · eval.ts · robots.json · createRules(cfg)
```
依赖：`core/` 与 `games/*/rules.ts` 不得 import DOM / kit；`view/ lesson/ input/` 可 import kit；Worker 只能 import `core/`、`games/*`、`ai/`（随机数唯一来源 = `core/rng.ts`，与 `@kit/rng` 同算法，加 100 个种子的向量测试）。
**对局状态机**（`play/session.ts`，转移有单测）：`idle → selected → dragging → animating(锁) → aiThinking(锁) → ended`，叠加锁 `modal / consent / lesson`。输入只在 `idle/selected` 且轮到该座位时被接受；其余一律丢弃、不排队。

## 2. 核心契约（`core/types.ts` 节选；全文见 types.ts）
```ts
export type Side = 0 | 1;  export type Sq = number;  export type HashKey = readonly [number, number];
export interface Piece { readonly type: number; readonly side: Side }
export const OBSTACLE = 99;                       // 静止障碍子（国象课的陨石）：不会走、不能被吃、没人能走上去
export type Outcome = { over: false } | { over: true; winner: Side | null; reason: string };
export type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;   // 修 Omit 不分配联合的 TS2353

export type Phase = 0 | 1 | 2;                    // 同阶段并行、阶段间串行（只管动画时序）
export type Effect =                              // 状态变化语义 = 先吃 → 再走 → 后升变（与 phase 无关；C04 按此重放）
  | { k: 'move'; phase: Phase; from: Sq; to: Sq; piece: Piece; arc?: boolean }      // 马 arc；易位 = 同阶段两个 move
  | { k: 'capture'; phase: Phase; sq: Sq; piece: Piece }                              // 吃过路兵：sq ≠ move.to
  | { k: 'promote'; phase: Phase; sq: Sq; from: Piece; to: Piece };
export interface MoveInfo { from: Sq; to: Sq; piece: Piece; capture: { sq: Sq; piece: Piece } | null; promotion: number | null; resetsClock: boolean }
export interface CheckInfo { king: Sq; by: readonly Sq[] }                            // by 含闪击的暗子 → 视图高亮王格 + 全部将军子
export interface RepWindow { mover: Side; plies: readonly { side: Side; check: boolean; capture: boolean }[] }
export interface RulesMeta { kingType: number | null; repeatN: number; clockPlies: number | null; clockReason: string }

export interface GameRules<M, S> {
  readonly id: string; readonly geometry: Geometry; readonly meta: RulesMeta;
  initial(variant?: string): S;  fromFen(fen: string): S;  toFen(s: S): string;  // fromFen 必须接受无王/带 OBSTACLE 局面（legalMoves 退化为伪合法，不抛）
  turn(s: S): Side;  pieceAt(s: S, sq: Sq): Piece | null;
  legalMoves(s: S): M[];  legalFrom(s: S, from: Sq): M[];      // 升变：每个升变子一条 M
  apply(s: S, m: M): S;                                         // 纯函数
  moveInfo(s: S, m: M): MoveInfo;  effects(s: S, m: M): Effect[];
  check(s: S, side?: Side): CheckInfo | null;
  status(s: S): Outcome;                                        // 只管局面自身：将死 / 困毙 / 无进攻子力 / 子力不足。重复与限着不在这里（归 Game）
  repetitionVerdict?(w: RepWindow): Outcome | null;             // 象棋：长将；缺省 = 和棋
  hash(s: S): HashKey;                                          // ⇔ "重复意义上同一局面"（含走子方；国象含易位权与"合法的"过路兵格）
  clock?(s: S): number;                                         // FEN 内无进展计数（国象 halfmove），Game 以此起算
  encode(m: M): string;  decode(s: S, text: string): M | null;  // 'h3e3' / 'e7e8q'：存档稳定
  notation(s: S, m: M, style: 'zh' | 'san' | 'coord'): string;
  whyIllegal(s: S, from: Sq, to: Sq): string | null;            // null ⇔ 存在合法着法 from→to
  value(s: S, sq: Sq): number;                                  // 孩子口径子力价值（象棋兵过河 = 2；王/障碍 = 0）
  mirror?(s: S): S | null;                                      // 左右镜像（课孪生）；国象可丢易位权；不适用 → null
  attackersOf?(s: S, sq: Sq, by: Side): Sq[];
}
export interface Geometry { kind: 'points' | 'squares'; cols: number; rows: number; squares: number; unit: number; margin: number; viewBox: { w: number; h: number };
  center(sq: Sq, o: Orientation): { x: number; y: number }; hit(x: number, y: number, o: Orientation): Sq | null; name(sq: Sq): string; flip(sq: Sq): Sq }
export type Orientation = 'first-bottom' | 'second-bottom';     // 旋转 180°（两轴一起翻）；象棋"执黑"、国象"黑方在下"都用它
```
**评审指出的 7 处契约破口，逐条对应的修法**（棋手学院实现者对照）：① 吃过路兵被吃子不在 `to`：`MoveInfo.capture = { sq, piece }`；② 易位的车 / 升变换子 / 过路兵第二个子：`effects()`；③ 升变 4 条同 (from,to)：`legalMoves` 每个升变一条，InputController 按 (from,to) 分组，>1 条时调 `hooks.promotion(from, to, options)`，选择框在 `view/promotion-picker.ts`；④ "兵动"重置限着：`MoveInfo.resetsClock`（游戏自定，引擎不懂兵）；⑤ AI 请求不封闭：`op:'custom'` + `AiPlugin.ops`（§6）；⑥ Step/Puzzle 联合封闭：`registerStep` + 统一判别字段 `k` 与 `id`（§7）；⑦ 无王 / 障碍子 / 镜像：`OBSTACLE`、`fromFen` 契约、`mirror?`（C07、C08 测）。

## 3. `Game`（`core/game.ts`；参考实现 = `board-contract/src/game.mjs`）
```ts
interface Game<M, S> { rules; startFen; moves: readonly M[]; keys: readonly HashKey[]; flags: readonly { check: boolean; capture: boolean; capValue: number }[];
  state(): S; turn(): Side; ply(): number; noProgress(): number; fen(): string; legalMoves(): M[]; play(m: M): void; undo(): M | null; encoded(): string[];
  status(): Outcome; repCount(): number; occurrences(n: number): number[] | null; warn(): { warn: boolean; side?: Side }; wouldEndBadly(m: M): boolean;
  captured(side: Side): readonly Piece[]; materialDiff(side: Side): number }
declare function createGame<M, S>(rules: GameRules<M, S>, startFen?: string, opts?: { cfg?: unknown }): Game<M, S>;
declare function replayMoves(rules, startFen: string, moves: string[]): { game: Game; applied: number; truncated: boolean };
```
- **不变量**：`keys.length === moves.length + 1` 且末项 = `hash(state())`（含起始局面与让子起始局面）；状态栈保存不可变状态，**不做 clone**（修评审"clone 不复制 make 栈"）；撤销精确恢复 keys / flags / noProgress / captured。
- **`status()` 顺序**：① `rules.status(局面)`（将死 / 困毙 / 无进攻子力 / 子力不足）→ ② 重复（`repCount ≥ repeatN` → `repetitionVerdict(窗口) ?? 和棋`）→ ③ 限着（`noProgress ≥ clockPlies` → 和棋 `clockReason`）。局面终局优先 = 国象"第 100 个半回合恰好将死 → 将死"自然成立。`rules.status` 不得返回重复与限着。
- **重复窗口算法（长将的唯一实现）**：取当前局面最近 `repeatN` 次出现（`keys` 下标升序 `occ`），窗口 = `occ[0]` 起到当前的全部着法；窗口第 i 步的走子方 = i 偶数为当前走子方 `mover`、奇数为对方；每步的 `check` 取自 `flags`（走完是否将军对方）。象棋 `repetitionVerdict`：仅一方**每一步**都将军 → 该方负；双方都每步将军或都不是 → 和（`null` → 默认和棋）。循环前的"引入步"不在窗口内；窗口里插一步安静着 → 和。判决与"第三次出现落在谁的那一步"无关。
- **预警 / 提交前提醒**：`warn()` = 当前局面已是第 2 次出现且 `repetitionVerdict(窗口₂)` 判走子方负；`wouldEndBadly(m)` = 走 m 之后 `status()` 是对走子方的判负（机器人根过滤与孩子提交前"换个走法"共用）。机器人在**候选集里排除**这些着法（`exclude` 传给搜索根），不再"随机替换"。
- **测试**（原型已有，进 vitest）：`rule-vectors.mjs` 15 条长将 / 重复 / 限着 / 家规向量（含真实"互相将军 → 和"一条）、hash 增量 = 重算 + 4.7 万局面 0 碰撞、撤销往返、2 万序列的长将模糊测试（与暴力参考 0 不一致）；国象向量：三次重复、第 100 个半回合（和 vs 将死优先）、子力不足、过路兵格不合法不入重复键；`keys[0]` 参与重复。

## 4. 视图与动画（`view/`）
- **`Theme`**：`tokens`、`boardArt(g,o)`（一次性静态 SVG）、`pieces: PieceSprites`、`motion`。**`PieceSprites` 通用化**：`prepare(px, dpr): Promise<void>`（象棋：先 `await document.fonts.load('40px "XQ Piece"', '帅仕相马车炮兵将士象卒蹩')` 再烘焙，防回退字形被永久缓存；国象：SVG `<symbol>`，no-op）、`make(p, px): PieceNode`（`{ el, setPiece, dispose }`；象棋用 `<canvas>`/`<div>` 位图，**不用 ImageBitmap 当 CSS 背景**；国象 `<svg><use>`）、`rotationFor?`、`label`。节点由 piece-layer 池化（≤32）。
- **层次**（静态层不重绘）：静态 SVG → 高亮层（`mark`：select / legal / capture / last / check / **checker**（闪击暗子）/ star / danger / hint / dim / **sight**（象棋见面金线））→ DOM 棋子层（`translate3d`，WAAPI）→ 箭头 / 印章 / 粒子层。
- **`animateMove(m, before, { fromPx?, speed? })`**：按 `rules.effects(before, m)` 的阶段排时间线；多子（易位的车、升变换子、过路兵）同阶段并行；`fromPx` = 拖放落点（棋子从那里滑，不先弹回起点）。`animateUndo` 沿原路径倒滑 160 ms。**动画预算（每回合）**：滑行 `moveMs(dist) = 150 + 24×格距` 且 **≤ 240 ms（上限从 320 降到 240）**；落地压扁、吃子飞出与滑行尾段并行；一次最长动作 ≤ 700 ms（评审算的 9 格吃子 740 ms 现为 ≈ 500 ms = 240 + 260）；`reducedMotion` ≤ 80 ms。
- **`finishAnimations()` 与竞态规则**：`undo / restart / setState / setOrientation / layout / destroy` 之前必须先调它（队列推进到终态并释放 anim 锁；进行中的 WAAPI 像素 translate 会在 layout 后错位）。`view.on('landed' | 'captured' | 'promoted' | 'castled' | 'checked' | 'lift' | 'bump')` 给游戏触发音效（引擎不依赖 kit audio，落子反馈 ≤100 ms）；`view.idle` / `window.__board.idle` 供测试。
- **托盘**：`Game.captured(side)` + `materialDiff`（价值 = `rules.value`）；`view.trayAnchor(side)`；托盘画在游戏 HUD（c ≥ 60 放外框边距内，否则 chip + 弹层，见 xiangqi.md §2.2），两个游戏同一接口。
- **将军呈现**：`rules.check()` 返回 `{ king, by }`：王格 `mark('check')`，`by` 逐个 `mark('checker')`（闪击时暗子也亮）；象棋将帅见面时 `by` = 对方帅格，并画 `sight` 金线。

## 5. 输入控制器（`input/`）
- 点—点与拖动并存；`pointerdown` 在己方子上 → `selected`（`mark('select')` + `legalFrom` 的 legal / capture 点 + 抬起）；超过 slop 10 px → `dragging`（1.12×）。**第二指忽略；`pointercancel` / `lostpointercapture` → 回到 `selected`；拖到棋盘外松手 → 飞回；`touch-action: none`**。
- **点选 4 级规则**（取代旧"0.75 格内最近合法点优先"——蒙特卡洛显示它在手机上 16–39 % 把"想看原因/想改选"劫持成走子）：① 最近交点是己方子 → 改选（无论远近）；② 最近交点是合法点 → 走；③ 最近交点非法 → `onIllegal(原因)`，**仅当**点击距该交点 ≥ `guard` 且 `targetRadius` 内恰有一个合法点才吸附；④ 其余取消（不报错）。参数：iPad `{ target 0.5, guard 0.35 }`，手机（c<44）`{ 0.6, 0.5 }`；手机另加"选子辅助"（0.6c 内唯一可动己方子则选它）与**触点预览**（按下时画出将提交的交点，松手才提交，可滑动修正）。`snap-mc.mjs`（每格 20 万次）：iPad σ=0.10 格 → 目标命中 100 %、劫持 0 %；iPhone 13（c=40，σ=0.31）命中 81–82 %、劫持 5–11 %（旧规则 87–95 % 但劫持 16–33 %）；SE（σ=0.40）63–64 % / 9–18 %。手机的残余误差靠预览 + 悔棋 + 真机验收（20 次刻意点击 ≥ 90 %）兜底。
- **输入锁**：`lock(reason)` 可叠加，返回释放函数；`withLock(reason, f)` 用 try/finally，**reject 与抛错也释放**；DEV 下锁超时看门狗（`anim` > 2 s、`ai` > 3 s 自动释放并记录）；所有主操作按钮（悔棋 / 重开 / 提示）读 `InputController.locked`；`ignoredTaps` 计数供测试。同一帧两次点击只处理第一次。
- **升变选择**：`hooks.promotion(from, to, options[{move, promotion}])`；选择框 4 个大棋子，≥76 px，点外面 = 取消（兵回原位）；课里只升后可跳过。键盘：Tab / 方向键 / Enter / Esc，`aria-live` 文字播报。
- **测试**：状态转移单测（含 pointercancel、拖出棋盘、第二指、动画期间连点 80 / 150 / 220 / 300 / 450 ms）；Playwright 的 `touchscreen` 只有 tap，拖动用 `page.evaluate` 派发合成 PointerEvent（touch 型）；真机清单加"拖动取消 / 多指"。

## 6. AI 宿主（`ai/`）
```ts
export type AiRequest =
  | { op: 'move'; startFen: string; moves: readonly string[]; cfg?: unknown; level: RobotLevel; gameSeed: number; budget: { maxMs: number; maxDepth: number }; exclude?: readonly string[] }
  | { op: 'coach' | 'hint' | 'highlights'; startFen: string; moves: readonly string[]; cfg?: unknown; /* hint: tier; highlights: kidSide, budgetMs */ }
  | { op: 'custom'; name: string; payload: unknown };                         // 游戏私有：残局防守方、小战场、兵战、bench…
interface AiHost { request<R>(req: AiRequest): Promise<R>; bump(): void; terminate(): void; readonly fallbackActive: boolean }
interface AiHostOptions { createWorker(): WorkerLike; timeoutMs: number; retries: number; warmup: boolean; fallback?(req: AiRequest): Promise<unknown> }
interface AiPlugin<M, S> { createRules(cfg: unknown): GameRules<M, S>; adapter; errorModel; coach; highlights; ops?: Record<string, (payload, ctx) => unknown> }
declare function registerAiWorker<M, S>(scope: WorkerScopeLike, plugin: AiPlugin<M, S>): void;
```
- **请求带 `startFen + moves + cfg`（不再是 keys）**：Worker 里 `createRules(cfg)` + `replayMoves` 重建 `Game`，长将预警 / 根过滤 / 家规在 Worker 内有完整历史；搜索树内的路径重复一律算和棋 0 分——这是被校准过的行为，xiangqi.md V8 的数字不依赖对局历史（评审"原型 path 不看历史"以此裁定：根过滤用 `Game`，树内不用）。
- **确定性**：`seed = hash32(gameSeed, ply, fenHash)`（`ply` = 当前着数）；每个 `move` 请求新建 `Rng` 并 **`clearTT()`**——结果是 `(局面, gameSeed, level)` 的纯函数（`determinism.mjs`：750 次请求中间插别的搜索，0 不同；slip 判定 1000 组越出 p±3σ 3 组，期望 2.7）；悔棋后同一 `(gameSeed, ply)` 得同一步。测试模式（`navigator.webdriver` / `?dev`）`maxMs = Infinity` 并以节点预算为准；`level.nodes/depth` 是强度旋钮，`budget` 只管墙钟与硬上限（`maxMs` 默认 1800；仅"页面可见时计时"：`visibilitychange` 重置起点，避免挂起恢复后只返回一层弱着）。
- **取消**：`bump()` = `epoch++`，在途请求立即 reject `cancelled`，迟到回复丢弃；同步搜索中的 Worker 收不到消息，所以**新请求前旧搜索未结束且 >200 ms → `terminate()` + 重建**（≈30 ms + 预热）。**超时**：`timeoutMs = 3000 + budget.maxMs` → terminate 重建 → 重发 `retries` 次 → 仍失败走主线程兜底（深度 1、无静态搜索，≤R3）。启动后立即做一次微型热身搜索让 JSC 先编译。
- `SearchPos<M>` 增加 `pieceAt / from / to / isCapture / capturedBy`（被吃子的 `value`，含过路兵），`evaluate()` 约定**走子方视角**；`ErrorModel.choose(ctx{ …exclude })`；`RobotLevel.glanceMargin` 可选（缺省 400），`pcap`（R1 吃子胃口）、`resign{afterPly,behind}` 为可选字段，游戏专属参数放 `look`。**子力价值只有一张表**：`GameRules.value`（炮 = 马 = 4）；原型里 `PIECE_VALUE_SEE`（炮 4.5）已删。
- **搜索骨架** `core/search.ts`：迭代加深 alpha-beta、置换表 2¹⁸（`Int32Array`）、杀手、MVV-LVA、静态搜索 ≤6、节点预算、`aborted`、根 `exclude`。**校准** `test/calibrate.ts`：孩子模型 × 机器人 × n 盘 × 颜色轮换 × 随机开局，`worker_threads` ≤6；校准是 `XQ_FULL` 工具，报告带 Wilson 区间。

## 7. 课播放器与谜题（`lesson/`、`puzzle/`）
- **统一判别字段 `k` 与稳定 `id`**（国象数据的 `t` / `sid` 改名为 `k` / `id`，纯数据改动，由其生成器完成）：`interface StepBase { id: string; k: string; say?: string; twin?: string | 'mirror'; note?: string }`；**`registerStep(kind, runner)`** 是公开扩展点——引擎自带 `tap stars capture setup escape quiz make trade sweep demo card bank bank2 battle play`（象棋课程用到的 14 种），棋手学院在 `lesson/steps-chess/` 注册 `castleQuiz endgame pawnwar goto count choice save …`。`StepRunner = { mount(step, ctx): Promise<StepResult>; hint(step, tier): HintSpec; demo(step, ctx) }`，`ctx = { rules, view, input, ai, hooks, hints }`。
- **课进度存步骤 id，不存下标**：`LessonProgress { lessonId, stepId, puzzleIx? }`（题组可从第 k 题续）。**`pos` 一律 FEN**；`say` = 旁白 id（缺省按步型取通用句）；`twin: 'mirror'` 由 `rules.mirror` 生成（不可镜像时回退"同课同题型未用题"）。数据由 `lessons.mjs` 直接产出最终 schema（`out/lessons.v1.json`），运行时校验器与 vitest 共用。
- **走错处理**（对所有步型一致）：`explain`（说 `whyIllegal` 原因）→ `demo`（幽灵手）→ `undo` → `twin`；连续 2 / 3 / 4 次触发 H1 / H2 / H3（`core/hints.ts`）。**两选一的 quiz 必须有 twin：首次对也要孪生确认才给 ★★★**。
- **`Puzzle`（采用国象的 `string[][]`）**：`{ id, fen, theme, tier, solution: string[][] /*每个半回合一组可接受着法*/, kidPlies, answer?, judge: 'list' | 'outcome', meta }`。`judge:'outcome'` = 以 `rules.status` 判（象棋一步杀：任何当场取胜着都算正解；若不是预设答案，说"这步也能赢，我们找将死"）。"为什么不行"演示只在确有反驳时出现（唯一性按**全体合法首着**判，所以必有）。
- **校验接口** `puzzle/validate.ts`（工具与 vitest 共用）：`validateMate1/2` 按**全体合法首着**判唯一（不论黑方应着数；含"困毙当场赢"也算其它取胜着）、诱饵、"吃子答案则还有别的吃子"；**独立复核代码与生成器不得共享过滤条件**（象棋用 `@weshell/xiangqi.js`——现为 package.json 的 dependencies，RULES-R 禁改依赖，只写明现状；国象无 chess.js，复核 = 旧引擎原型 `reference/` 对拍 + perft）。**`shortcutAudit`（偷懒策略，v1.1）**：先把候选限制为将军着法，再套 价值最高 / 离将最近 / 同类唯一 / 同线 / 吃子 五种排序 + 顺序回退组合，每种命中 ≤15 %，档 2–3 要求 ≥2 个诱饵将军（`lazy.mjs`）。

## 8. 教练、SEE、复盘（`core/`）
- `CoachRow { m, reason: 'hang' | 'allowMate' | null, loss, victim, attacker, movedIsVictim }`：气泡画"哪个对方子会吃哪个己方子"，`movedIsVictim` 分两句（"这个子会被吃" / "那个子还在被攻击"）。`allowMate` **含困毙判负**（原型 `hasMateIn1(pos, { stalemate: true })`；评审测得孩子被困毙判负占 7–13 % 而教练从不提醒）。判定表在**轮到孩子时**（机器人落子动画开始时）就预算，松手只查表，`guard-timeout` 仅兜底。
- **SEE（`core/see.ts`）**：用真实 `make/unmake` 递归（每层取最便宜的两个攻击者各试一次、可放弃 = 0），**不用 x-ray 列表**——炮的攻击依赖炮架，吃子会让炮架出现或消失，x-ray 列表会错。`see-test.mjs`：3.07 万个被攻击目标对"穷举全部攻击者的极小极大"0 不一致（含炮局面 3.07 万），并固化"吃后成为对方炮的目标 → −8""吃掉炮架 → 对方炮失效 → +1"两条向量。
- 复盘检测器 / 记录器接口不变（`HighlightDetector.detect(startFen, moves, kidSide, budgetMs)`，≤3 条）。

## 9. 面对面（`play/facetoface.ts`）
`consent(kind, from): { result: Promise<boolean>; cancel() }`：对方侧弹"同意 / 先不用"（朝向对方），**发起方可「撤回请求」**，永不因超时锁棋盘；等待期间棋盘全锁，撤回 / 拒绝 / 同意都释放 `consent` 锁。`resign` 二次确认、无需同意；`turnLamp` 亮该侧外框金边。布局契约：后手簇 `rotate(180deg)`；**棋盘本体不转，只有后手方棋子自身转**（象棋转字形层；国象转位图——烘焙时单独烘"字形层"或额外 7 张 rot180 位图，保持光源左上）；**f2f 永不翻转棋盘**；对机器人执后手 = `Orientation 'second-bottom'`（自己的子在下，河字与字形保持正向，竖线号重编）。

## 10. 存档适配器（`save/adapter.ts`）
`replayMoves`（§3）：恢复一律逐着 `decode` + 校验，遇非法着法**截断**并置 `truncated`；`createBoardStore(gameId, def)` 包 kit `createStore`：`migrate(old, fromVersion)` 的语义 = **一次调用、直接返回当前形状**（kit 在 `env.v < version` 时只调一次）；加载后再过游戏的 `isValid` 形状校验，不合格 → `defaults()`。**引擎不放游戏进度字段**。旧版 `kg:v1:xiangqi`（v1）的处理见 xiangqi.md §8.4。

## 11. 测试与一致性套件（`test/`）
**每个 `GameRules` 插件必须通过 `runConformance(rules, fixtures)`**（每项 = 一个 vitest `it`，游戏在 `games/<id>/rules.test.ts` 调用；`fixtures = { fens, noKing?, obstacle?, perft, fenKey, randomGames, maxPly }`）：

| 编号 | 检查 |
|---|---|
| C01 C02 | FEN 往返幂等；`apply` 是纯函数（前后原状态 toFen / hash 不变） |
| C03 | encode / decode 往返且互异；`legalFrom ≡ legalMoves` 按起点过滤 |
| C04 | **`effects` 重放（吃→走→升变）= `apply` 后的棋盘**，且 `moveInfo.capture` 与 capture 效果一致（过路兵 / 易位 / 升变逐子核对） |
| C05 | `hash`：同局面同键；不同局面（按 `fenKey`）不同键；转置同键 |
| C06 | 走子方交替；合法着法走完己方不被将军；`check().by` 非空 |
| C07 | 无王 / 带障碍子局面：fromFen、legalMoves、status 不抛；障碍子永不被吃、永不被走上 |
| C08 C09 | `mirror` 对合且（除丢易位权外）着法数相同；几何 `flip` 对合、`center→hit` 往返、`flip` 与朝向一致 |
| C10 | `whyIllegal ⇔ 合法性`（所有 (from,to)）；原因为非空字符串 |
| C11 | perft 金标准（象棋 44 / 1920 / 79 666；国象 20 / 400 / 8 902 与 Kiwipete 48 / 2 039） |
| C12 C13 | `Game` 往返模糊（随机走子 → 全 undo，fen / hash / keys / noProgress / flags 全等；keys 不变量）；`status` 幂等 |
| C14 C15 C16 | notation 三种风格非空；`value`（王 / 障碍 = 0）与 `materialDiff` 对称；`clock` 从 FEN 起算 |
游戏另供：规则向量（象棋 43 + 15 条长将 / 家规；国象 14 条：三次重复、五十回合与将死优先、子力不足、易位 / 过路兵 / 升变 effects、陨石）。**实测**：象棋适配器 16/16（692 178 断言）、国象适配器 16/16（369 751）、特例向量 14/14，`node run.mjs` ≈ 6 s。
- **其它**：`diffAgainst(rules, oracle)` 对独立实现逐局面比较合法着法与将军状态（象棋 10.67 万局面 0 不一致；终局语义靠向量）；哈希增量一致、让子 / 无王 FEN 的 perft、`AiHost` 假 Worker（epoch 丢弃、超时重建、兜底）、同请求二次同结果、snap 蒙特卡洛不回归。根 `vitest.config` 把 `engines/**/*.test.ts` 纳入 `npm run check`：重型用例用 `describe.skipIf(!process.env.XQ_FULL)`，快速部分 ≤25 s。
- **Playwright 助手 `pw.ts`**：`VIEWPORTS`（ipadP / ipadL / phoneP / se / phoneL，各有"Safari 窗口"与"主屏 App 安全区"两组）、`boardPage(page)`：`tapSq / dragSq(合成 touch PointerEvent) / waitIdle / state / legalMarks / expectInViewport / expectNoOverflow / expectLayout(layout())（DOM 矩形 ≈ 布局函数输出 ±1 px）/ shotBoard`。所有 spec `try/finally` 关浏览器、`?mute=1`；**截图必须人眼看过**。
- **布局纯函数**（各游戏自带，引擎提供类型与断言助手 `view/layout-types.ts`）：`layout(viewport, screen) → 矩形集合`，vitest 断言"全部元素在安全区内、可点 ≥44、互不重叠、底部余量 ≥8"。象棋实现与证明见 xiangqi.md §2.2。

## 12. 预算与可访问性
JS：通用核心 ≤ 60 KB gzip（不含游戏包与内容）；单游戏包（含搜索）≤ 40 KB；Worker 包单算（≤ 50 KB gzip），**禁止 barrel 导入**（`kidmodel / puzzles 生成器 / calibrate` 只在 tools / tests import），加 size-limit 测试；Service Worker 预缓存所有 dist 文件，大 JSON 的体积由游戏规格写明。运行：静态 SVG + 位图棋子 + ≤32 个 DOM 棋子；无空闲 rAF；DPR ≤ 2；内存 ≤ 250 MB（iPad 9）；落子反馈 ≤ 100 ms；Worker 单步 ≤ 2 s（硬上限 1.8 s 墙钟）。可访问性：棋盘 `role="grid"`、棋子 `role="gridcell"` + `aria-label`；`prefers-reduced-motion`；色弱不依赖颜色；点击目标 iPad ≥ 69 px，手机靠 snap 与预览。

## 13. 两个使用者的差异表
| 项 | 楚河棋院 | 棋手学院（国际象棋） |
|---|---|---|
| 几何 | `points` 9×10，margin .55，viewBox 910×1010 | `squares` 8×8，margin .5 |
| 额外规则 | 长将判负（`repetitionVerdict`）、困毙判负（家规可改）、象眼 / 马腿 / 炮架、将帅见面 | 易位（两个 move 效果）、过路兵（capture.sq ≠ to）、升变（4 条同 (from,to) + 选择框）、五十回合（`clockPlies 100`）、困毙 = 和、子力不足 |
| 棋子 | 车削木玩具位图（`prepare` 等字体再烘焙） | Staunton 剪影 SVG `<use>`（`prepare` 为空） |
| 价值 | 车 9 炮马 4 仕相 2 兵 1（过河 2） | 兵 1 马象 3 车 5 后 9 |
| 机器人 | 同一 `ErrorModel`，6 级 + 「轻松」档 | 同一 `ErrorModel`，8 级（chess.md §4.6） |
| 课步骤 | 引擎自带 14 种 | 另 `registerStep` 国象专用种类 |
| 谜题 | `judge:'outcome'`，唯一性 = 全体合法首着 | `judge:'list'` 的 `string[][]` + `kidPlies`（chess.md §8.4 原样） |
| 目录 | `engines/board/games/xiangqi/` | `engines/board/games/chess/`（不是 `engines/board/chess/`） |
**棋手学院对齐清单（chess.md 照此改）**：①§8.3 BoardKit API / §8.5 Worker 协议以本文为准，工厂名 `createBoardView / createInputController / createAiHost / createGame / createPuzzlePlayer`；`view.move(from,to,{capture,promoteTo,castleRook,hop})` → `animateMove(m, before)` + `effects`；②`createAiHost` 的 3 s → terminate 重建 → 主线程兜底 = §6（沿用国象做法）；③defender / endgameHint / battleSolve / battleMove / pawnwar / bench = `op:'custom'` + `ops`；④`history: repKeys` → `startFen + moves`；⑤`Step.t/sid` → `k/id`，`Puzzle.solution: string[][]` + `kidPlies` + `answer` 保留并加 `judge:'list'`；⑥`result(state, repetitionCounts)` → `status` + `Game.status`（顺序一致），`repKey` → `hash`（易位权 + 合法的过路兵格）；⑦陨石 = `OBSTACLE`，无王 = `fromFen` 契约，`mirrorFEN` → `mirror?`；⑧路径 `engines/board/chess/` → `engines/board/games/chess/`，原型 `.mjs` 放 `reference/` 对拍；⑨升变选择框 = `view/promotion-picker.ts`（你的文件）；⑩"按住 1.5 秒认输"在游戏 HUD，`FaceToFace.resign` 只管结果。

## 14. 工作包（engines/board build，按 bounded agent session ≈100–130 次工具调用）
| 包 | 内容与验收（命令） | 依赖 / 约 session |
|---|---|---|
| **S0a** | `core/types.ts`（拷自 board-contract，tsc 绿）、`rng/hash32`（对 kit 向量）、`Game`（参考实现移植）、`test/conformance.ts` + `test/reference/`（两个参考适配器）、`STATUS.md` 首版（**S0 FROZEN** 的触发点：`tsc` + `vitest engines/board` 全绿） | 1–2 |
| **S0b** | `search / errormodel / see / coach / hints`（原型 1:1 移植）、象棋 `games/xiangqi/rules.ts` 的接口桩 | 1–2 |
| S1 | `view`（静态层 / piece-layer / overlays / anim + effects 多子 + finishAnimations）+ `input`（4 级规则 / 锁 / 看门狗 / pointercancel）+ 布局类型；5 视口截图 | 2–3 |
| S2 | `ai/host + worker-entry`（epoch / terminate / 热身 / 确定性 / custom ops；假 Worker 测试） | 1 |
| S3 | `lesson / puzzle`（registerStep、14 种步骤执行器、`validate/audit`）+ `play/*`（session / facetoface / replay / recorder）+ `save/` + `test/pw.ts` | 3 |
| S4 | `art/shade + bake`（OKLab 配方、字体就绪后烘焙） | 1–2 |
**合计约 9–13 个 session**。游戏按依赖交错开工：规则 / 内容包 ← S0；视图与美术 ← S1（+S4）；课与面对面 ← S3；对弈 ← S2。游戏 session 数见 xiangqi.md §10.2。**砍单顺序**：S4 通用主题钩子（游戏自带）→ `play/replay` 细节 → `puzzle/audit` 的 UI，其余不砍。

## 15. 变更日志 v1.0 → v1.1
**破坏性**：① `GameRules.moves.*` → `moveInfo`（capture 带格 `{sq,piece}`；`promotion` 为 type；新增 `resetsClock`），新增 `effects()`；② `isCheck` → `check(): CheckInfo | null`；③ `status(s, h)` → 局面自身的 `status(s)`，重复 / 限着归 `Game`（局面终局 → 重复 → 限着），`repetitionVerdict(h, flags)` → `repetitionVerdict(RepWindow)`；④ `AiRequest`：`keys` → `startFen + moves + cfg`，`seed` → `gameSeed`（每步 `hash32(gameSeed, ply, fenHash)`），加 `exclude` 与 `custom`；`AiHostOptions`；`registerAiWorker(scope, AiPlugin)`；⑤ `Step.k / id` 统一 + `registerStep`；`Puzzle` 改 `string[][] + kidPlies + judge`；⑥ `animateMove(m, before, { fromPx, speed })`；`PieceSprites.bake` → `prepare + make`；⑦ `InputHooks.promotion` 改 options 分组；`setSnapRadius` → `setSnap` + 4 级规则；⑧ 所有权 = engines/board build 唯一所有者；路径 `games/chess/**`。
**新增**：`Effect / MoveInfo / CheckInfo / RepWindow / RulesMeta / OBSTACLE / DistributiveOmit / Rng / hash32`；`Game`（历史、窗口、预警、captured、materialDiff）；`clock? / value / mirror? / whyIllegal ⇔ 合法`；`finishAnimations / withLock / 看门狗 / consent.cancel / on(...)`；`mark('checker' | 'sight')`；SEE 与教练 `allowMate` 含困毙、`CoachRow.victim / attacker / movedIsVictim`；一致性套件 C01–C16 + 参考适配器；布局纯函数约定；工作包与变更请求通道。
**实测改变的设计**：点选规则（旧 0.75 优先 → 4 级）、动画上限 320 → 240 ms、`Game.noProgress` 从 FEN 时钟起算（国象 halfmove 99 向量暴露）、`Effect` 重放固定为 吃 → 走 → 升变（吃子目标与落点同格暴露）、`mirror` 允许丢易位权。契约 TS 经 `tsc` 通过；一致性套件对两个游戏全绿；"重做省 40 % 工期"改为 §14 的 session 表。
