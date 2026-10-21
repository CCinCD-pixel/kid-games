// engines/board/core/types.ts — v1.1 [S0: FROZEN — 改动 = 破坏性，走 ~/kid-games-work/state/rr/engine-requests.md]（BoardKit 通用契约；象棋与国际象棋共用）。这是 board-engine.md 的可编译源：S0 工作包把它原样放进 engines/board/core/，`tsc` 必须通过（仓库 tsconfig：strict、noUnusedLocals/Parameters、isolatedModules）。
// 依赖规则：core/ 与 games/*/rules.ts 不得 import DOM / kit；本文件里的 DOM 类型只出现在 view/input 部分的声明里（用 lib.dom）。

// ───────────────────────────── 基础 ─────────────────────────────
export type Side = 0 | 1;                                // 0 = 先手（红/白），1 = 后手
export type Sq = number;                                  // 稠密下标 0..geometry.squares-1，游戏自定
export type HashKey = readonly [number, number];          // 两个 Int32；比较永远用 hashEq
export interface Piece { readonly type: number; readonly side: Side }
export const OBSTACLE = 99;                               // 静止障碍子（国际象棋课里的陨石）：side 0；不会走、不能被吃、没人能走上去；规则必须遵守
export type Outcome = { over: false } | { over: true; winner: Side | null; reason: string };
export interface Disposable { dispose(): void }           // 不依赖 lib 的 Disposable
export type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export interface Rng { next(): number }                   // [0,1)；core/rng.ts：mulberry32 + hash32（与 @kit/rng 同算法，向量测试）
export const hashEq = (a: HashKey, b: HashKey): boolean => a[0] === b[0] && a[1] === b[1];

// ───────────────────────────── 几何 ─────────────────────────────
export type Orientation = 'first-bottom' | 'second-bottom';   // 旋转 180°（两条轴一起翻）；象棋"执黑"与国际象棋"黑方在下"都用它
export interface Geometry {
  readonly kind: 'points' | 'squares';                   // 象棋 = 交叉点；国际象棋 = 方格
  readonly cols: number; readonly rows: number; readonly squares: number;
  readonly unit: number; readonly margin: number;       // 设计单位 c=100；外框边距（c）
  readonly viewBox: { readonly w: number; readonly h: number };
  center(sq: Sq, o: Orientation): { x: number; y: number };
  hit(x: number, y: number, o: Orientation): Sq | null; // 最近交点 / 所在格；外框内才有值
  name(sq: Sq): string;                                  // 'e1'、'i10'
  flip(sq: Sq): Sq;                                      // 180° 对称点（对合）
}

// ───────────────────────────── 规则插件 ─────────────────────────────
/** 视图要演的东西：同一阶段（phase）的效果并行，阶段之间串行。吃过路兵：capture.sq ≠ move.to；王车易位：同阶段两个 move；升变：move → promote */
export type Phase = 0 | 1 | 2;
export type Effect =
  | { readonly k: 'move'; readonly phase: Phase; readonly from: Sq; readonly to: Sq; readonly piece: Piece; readonly arc?: boolean }
  | { readonly k: 'capture'; readonly phase: Phase; readonly sq: Sq; readonly piece: Piece }
  | { readonly k: 'promote'; readonly phase: Phase; readonly sq: Sq; readonly from: Piece; readonly to: Piece };
export interface MoveInfo {
  readonly from: Sq; readonly to: Sq; readonly piece: Piece;
  readonly capture: { readonly sq: Sq; readonly piece: Piece } | null;   // sq 可能 ≠ to
  readonly promotion: number | null;                                     // 升变后的 type
  readonly resetsClock: boolean;                                         // 吃子（象棋）；吃子或兵动（国象）
}
export interface CheckInfo { readonly king: Sq; readonly by: readonly Sq[] }  // 被将军的王格 + 所有将军子（含闪击的暗子）
/** 重复窗口：当前局面最近 repeatN 次出现中最早一次起的全部着法；mover = 窗口第 0 步的走子方（= 当前走子方） */
export interface RepWindow { readonly mover: Side; readonly plies: readonly { readonly side: Side; readonly check: boolean; readonly capture: boolean }[] }
export interface RulesMeta {
  readonly kingType: number | null;                      // 无王玩法（课）= null 时 check() 恒 null
  readonly repeatN: number;                              // 3
  readonly clockPlies: number | null;                    // 象棋 120（家规可 null）；国象 100；无 = null
  readonly clockReason: string;                          // 'no-capture-limit' | 'fifty-move'
}
export interface GameRules<M, S> {
  readonly id: string; readonly geometry: Geometry; readonly meta: RulesMeta;
  initial(variant?: string): S;                          // 让子 / 摆局由游戏解释
  fromFen(fen: string): S;                               // 必须接受无王、带 OBSTACLE 的局面（legalMoves 退化为伪合法，不抛错）
  toFen(s: S): string;
  turn(s: S): Side;
  pieceAt(s: S, sq: Sq): Piece | null;
  legalMoves(s: S): M[];                                 // 升变：每个升变子一条 M
  legalFrom(s: S, from: Sq): M[];
  apply(s: S, m: M): S;                                  // 纯函数
  moveInfo(s: S, m: M): MoveInfo;                        // s = 走之前
  effects(s: S, m: M): Effect[];                         // 状态变化语义（C04 重放）= 先吃 → 再走 → 后升变，与 phase 无关；phase 只管动画时序
  check(s: S, side?: Side): CheckInfo | null;            // 默认 side = 走子方
  status(s: S): Outcome;                                 // **只管局面自身**：将死/困毙/无进攻子力/子力不足；重复与限着归 Game
  repetitionVerdict?(w: RepWindow): Outcome | null;      // 象棋：长将；缺省 = 和棋
  hash(s: S): HashKey;                                   // ⇔ "重复意义上的同一局面"（含走子方；国象含易位权与"合法的"过路兵格）
  encode(m: M): string; decode(s: S, text: string): M | null;     // 'h3e3' / 'e7e8q'：存档与日志，稳定
  notation(s: S, m: M, style: 'zh' | 'san' | 'coord'): string;
  clock?(s: S): number;                                  // FEN 内的无进展计数（国象 halfmove）；Game 以此起算 noProgress
  whyIllegal(s: S, from: Sq, to: Sq): string | null;     // null ⇔ 存在合法着法 from→to（升变算一条）
  value(s: S, sq: Sq): number;                           // 孩子口径子力价值（象棋兵过河=2；王/障碍=0）；吃子托盘与教练共用
  mirror?(s: S): S | null;                               // 左右镜像（课孪生题）；国象：丢易位权；不适用返回 null
  attackersOf?(s: S, sq: Sq, by: Side): Sq[];
}
export interface PlyFlags { readonly check: boolean; readonly capture: boolean; readonly capValue: number }
export interface GameOptions<Cfg = unknown> { readonly cfg?: Cfg }
/** 通用对局：历史、撤销、重复/长将窗口、限着、吃子列表。不变量：keys.length === moves.length + 1 且末项 = hash(state())；状态栈保存不可变状态（不做 clone） */
export interface Game<M, S> {
  readonly rules: GameRules<M, S>; readonly startFen: string;
  readonly moves: readonly M[]; readonly keys: readonly HashKey[]; readonly flags: readonly PlyFlags[];
  state(): S; turn(): Side; ply(): number; noProgress(): number; fen(): string;
  legalMoves(): M[]; play(m: M): void; undo(): M | null; encoded(): string[];
  /** 顺序：rules.status(局面) → 重复(第 repeatN 次) → 限着；将死优先于第 100 个半回合 */
  status(): Outcome; repCount(): number; occurrences(n: number): number[] | null;
  warn(): { warn: boolean; side?: Side };                // 再循环一次就会被判长将的预警（走子方 = 窗口内每步将军的一方）
  wouldEndBadly(m: M): boolean;                          // 走完立刻被判负（长将）；机器人根过滤与孩子提交前提醒共用
  captured(side: Side): readonly Piece[]; materialDiff(side: Side): number;   // 托盘与"+4"徽标
}
export declare function createGame<M, S>(rules: GameRules<M, S>, startFen?: string, opts?: GameOptions): Game<M, S>;
export declare function replayMoves<M, S>(rules: GameRules<M, S>, startFen: string, moves: string[], opts?: GameOptions): { game: Game<M, S>; applied: number; truncated: boolean };

// ───────────────────────────── 视图 ─────────────────────────────
export type Seat = 'single' | 'f2f';
export interface PieceNode { readonly el: HTMLElement; setPiece(p: Piece): void; dispose(): void }
export interface PieceSprites {
  /** 烘焙/加载：象棋 = 等字体 `document.fonts.load` 后烘焙位图（字体未就绪不得烘焙）；国象 = SVG symbol，no-op。resize 防抖 120 ms 后再调 */
  prepare(px: number, dpr: number): Promise<void>;
  make(p: Piece, px: number): PieceNode;                 // 象棋：<canvas>/<div> 位图；国象：<svg><use>；节点由 piece-layer 池化
  rotationFor?(p: Piece, seat: Seat): number;
  label(p: Piece): string;                               // aria-label
}
export interface Theme {
  readonly id: string; readonly tokens: Record<string, string>;
  boardArt(g: Geometry, o: Orientation): SVGSVGElement;
  readonly pieces: PieceSprites;
  readonly motion: { moveMs(dist: number): number; liftPx: number; squash: readonly [number, number, number]; captureMs: number; landMs: number; maxMs: number };
}
export type MarkKind = 'select' | 'legal' | 'capture' | 'last' | 'check' | 'checker' | 'star' | 'danger' | 'hint' | 'dim' | 'sight';
export type ViewEvent = 'landed' | 'captured' | 'promoted' | 'castled' | 'checked' | 'lift' | 'bump';
export interface BoardViewOptions<M, S> { readonly rules: GameRules<M, S>; readonly theme: Theme; readonly orientation: Orientation; readonly seat: Seat; readonly coords: boolean; readonly reducedMotion: boolean }
export interface BoardView<M, S> {
  readonly el: HTMLElement; readonly idle: boolean;
  layout(box: { x: number; y: number; w: number; h: number }): void;          // finishAnimations() → 重排；只在尺寸变时重烘焙
  setState(s: S, o?: { last?: M | null }): void;                              // finishAnimations() → 无动画整盘设置
  mark(kind: MarkKind, sqs: Sq[], o?: { id?: string; pulse?: boolean }): Disposable;
  arrow(from: Sq, to: Sq, kind: 'hint' | 'threat' | 'good' | 'warn'): Disposable;
  stamp(kind: 'check' | 'mate' | 'stalemate', at: Sq): Promise<void>;
  /** 多子动画：按 rules.effects(before, m) 的阶段串行/并行；opts.fromPx = 拖放落点（从那里滑，不弹回起点） */
  animateMove(m: M, before: S, o?: { fromPx?: { x: number; y: number }; speed?: number }): Promise<void>;
  animateUndo(m: M, after: S, before: S): Promise<void>;
  finishAnimations(): void;                                                    // 队列推进到终态并释放 anim 锁；undo/restart/setState/orientation/layout/destroy 之前必调
  setOrientation(o: Orientation, animate?: boolean): void;
  rect(sq: Sq): DOMRect; hitTest(clientX: number, clientY: number): Sq | null;
  trayAnchor(side: Side): DOMRect;
  setPieceRotation(mode: 'none' | 'seat'): void;
  on(ev: ViewEvent, cb: (e: { sq: Sq; piece?: Piece }) => void): Disposable;
  destroy(): void;
}
export declare function createBoardView<M, S>(host: HTMLElement, o: BoardViewOptions<M, S>): BoardView<M, S>;

// ───────────────────────────── 输入 ─────────────────────────────
export type LockReason = 'ai' | 'anim' | 'modal' | 'consent' | 'lesson';
export interface InputHooks<M, S> {
  state(): S; seatToMove(): Side; canAct(seat: Side): boolean;
  commit(m: M): void | Promise<void>;
  onIllegal(reason: string | null, from: Sq, to: Sq): void;
  onSelect?(sq: Sq | null, legal: Sq[]): void;
  /** 同一 (from,to) 有多条合法着法（升变）时调用；返回选中的那条（null = 取消，兵回原位）。choices = 这些 M 的 moveInfo.promotion */
  promotion?(from: Sq, to: Sq, options: { move: M; promotion: number }[]): Promise<M | null>;
}
/** 点选规则 4 级（顺序固定）：① 最近交点是己方子 → 改选；② 最近交点是合法点 → 走；③ 最近交点非法 → onIllegal(原因)，仅当它距点击 ≥0.35c 且 targetRadius 内有唯一合法点时才吸附；④ 其余取消 */
export interface SnapConfig { readonly selectRadius: number; readonly targetRadius: number }
export interface InputController {
  lock(reason: LockReason): () => void;                                        // 可叠加；返回释放函数
  withLock<T>(reason: LockReason, f: () => Promise<T>): Promise<T>;            // try/finally 释放；reject 也释放
  readonly locked: boolean; readonly ignoredTaps: number;                      // DEV 计数，测试断言
  readonly mode: 'idle' | 'selected' | 'dragging';
  setSnap(c: Partial<SnapConfig>): void; enable(on: boolean): void; destroy(): void;
}
export declare function createInputController<M, S>(view: BoardView<M, S>, rules: GameRules<M, S>, hooks: InputHooks<M, S>): InputController;

// ───────────────────────────── AI 宿主 ─────────────────────────────
export interface RobotLevel {
  readonly id: string; readonly depth: number; readonly nodes: number; readonly slip: number;
  readonly glanceMargin?: number; readonly glanceTemp: number; readonly temp: number; readonly margin: number; readonly mateSight: number; // glanceMargin 缺省 400
  readonly pcap?: number; readonly resign?: { readonly afterPly: number; readonly behind: number }; readonly coachCap: number;
  readonly look: Readonly<Record<string, unknown>>;
}
export interface SearchBudget { readonly maxMs: number; readonly maxDepth: number }   // 强度由 level.nodes/depth 决定；budget 只管墙钟与硬上限
export type AiRequest =
  | { readonly op: 'move'; readonly startFen: string; readonly moves: readonly string[]; readonly cfg?: unknown; readonly level: RobotLevel; readonly gameSeed: number; readonly budget: SearchBudget; readonly exclude?: readonly string[] }
  | { readonly op: 'coach'; readonly startFen: string; readonly moves: readonly string[]; readonly cfg?: unknown }
  | { readonly op: 'hint'; readonly startFen: string; readonly moves: readonly string[]; readonly cfg?: unknown; readonly tier: 1 | 2 | 3 }
  | { readonly op: 'highlights'; readonly startFen: string; readonly moves: readonly string[]; readonly cfg?: unknown; readonly kidSide: Side; readonly budgetMs: number }
  | { readonly op: 'custom'; readonly name: string; readonly payload: unknown };   // 游戏私有：残局防守方、小战场、兵战、bench……
export type AiEnvelope = AiRequest & { readonly id: number; readonly epoch: number };
export interface WorkerLike { postMessage(m: unknown): void; onmessage: ((e: { data: unknown }) => void) | null; terminate(): void }
export interface AiHostOptions { readonly createWorker: () => WorkerLike; readonly timeoutMs: number; readonly retries: number; readonly warmup: boolean; readonly fallback?: (req: AiRequest) => Promise<unknown> }
export interface AiHost {
  request<R>(req: AiRequest): Promise<R>;                                      // 自动带 id/epoch；过期回复丢弃；超时 → terminate+重建+重发 retries 次 → fallback
  bump(): void;                                                                // epoch++；在途请求立即 reject('cancelled')
  terminate(): void; readonly fallbackActive: boolean;
}
export declare function createAiHost(o: AiHostOptions): AiHost;
// ── Worker 内：搜索插件 ──
export interface SearchPos<M> {
  make(m: M): void; unmake(): void; legal(capsOnly?: boolean): M[]; inCheck(): boolean; side(): Side; hashLo: number; hashHi: number;
  pieceAt(sq: Sq): Piece | null; from(m: M): Sq; to(m: M): Sq; isCapture(m: M): boolean; capturedBy(m: M): number;   // capturedBy = 被吃子的 value(0 = 不吃)；包括过路兵
  evaluate(): number;                                                          // 约定：走子方视角（厘兵）
}
export interface SearchAdapter<M, S> { create(s: S): SearchPos<M>; mvvLva(p: SearchPos<M>, m: M): number }
export interface ErrorModel<M> { choose(ctx: { pos: SearchPos<M>; level: RobotLevel; search: (o: { depth: number; nodes: number; margin: number; qs: boolean; exclude?: ReadonlySet<M> }) => { best: M; root: { m: M; score: number }[] }; mateIn1: () => M[]; legal: M[]; exclude: ReadonlySet<M> }, rng: Rng): M }
export interface CoachRow { readonly m: string; readonly reason: 'hang' | 'allowMate' | null; readonly loss: number; readonly victim: Sq; readonly attacker: Sq; readonly movedIsVictim: boolean }
export interface CoachPolicy<M> { table(pos: SearchPos<M>): CoachRow[]; cap(level: RobotLevel): number }
export interface Highlight { readonly kind: string; readonly ply: number; readonly score: number; readonly neg: boolean; readonly arrow?: readonly [Sq, Sq]; readonly say: string }
export interface HighlightDetector { detect(startFen: string, moves: readonly string[], kidSide: Side, budgetMs: number): Highlight[] }
export interface AiPlugin<M, S> { createRules(cfg: unknown): GameRules<M, S>; adapter: SearchAdapter<M, S>; errorModel: ErrorModel<M>; coach: CoachPolicy<M>; highlights: HighlightDetector; ops?: Readonly<Record<string, (payload: unknown, ctx: { rules: GameRules<M, S>; adapter: SearchAdapter<M, S> }) => unknown>> }
export interface WorkerScopeLike { postMessage(m: unknown): void; onmessage: ((e: { data: unknown }) => void) | null }
export declare function registerAiWorker<M, S>(scope: WorkerScopeLike, plugin: AiPlugin<M, S>): void;
/** 种子：每个 move 请求 = hash32(gameSeed, ply, fenHash)；每次 move 请求开头清置换表；测试模式（navigator.webdriver / ?dev）maxMs = Infinity */
export declare function hash32(...xs: number[]): number;

// ───────────────────────────── 课与谜题 ─────────────────────────────
export interface StepBase { readonly id: string; readonly k: string; readonly say?: string; readonly twin?: string | 'mirror'; readonly note?: string }   // 判别字段统一用 k（国象数据的 t/sid → k/id）
export interface LessonProgress { lessonId: string; stepId: string; puzzleIx?: number }
export interface LessonHooks { narrate(id: string): Promise<void>; companion: { mood(m: string): void; say(id: string): Promise<void> }; sfx(name: string): void; ghost: GhostHand; save(p: LessonProgress): void; skip: () => boolean }
export interface GhostHand { tap(sq: Sq): Promise<void>; drag(from: Sq, to: Sq): Promise<void>; path(moves: readonly string[]): Promise<void> }
export interface StepContext<M, S> { rules: GameRules<M, S>; view: BoardView<M, S>; input: InputController; ai: AiHost; hooks: LessonHooks; hints: HintLadder }
export interface StepRunner<M, S, Step extends StepBase = StepBase> { mount(step: Step, ctx: StepContext<M, S>): Promise<StepResult>; hint(step: Step, tier: 1 | 2 | 3): HintSpec; demo(step: Step, ctx: StepContext<M, S>): Promise<void> }
export interface StepResult { stars: 0 | 1 | 2 | 3; firstTry: boolean; hintTier: 0 | 1 | 2 | 3 }
export interface HintSpec { marks?: { kind: MarkKind; sqs: Sq[] }[]; arrow?: [Sq, Sq]; ghost?: string[]; say?: string }
export interface HintLadder { next(ctx: { stepId: string; failures: number }): { tier: 0 | 1 | 2 | 3 } }
export declare function registerStep<M, S>(kind: string, runner: StepRunner<M, S, never>): void;
export interface Puzzle { readonly id: string; readonly fen: string; readonly theme: string; readonly tier: 1 | 2 | 3;
  readonly solution: readonly (readonly string[])[];            // 每个半回合一组可接受着法（encode 串）；对方回应那一格 = 应着候选
  readonly kidPlies: number;                                    // 孩子要走几步；0 = 选择题（answer）
  readonly answer?: string; readonly judge: 'list' | 'outcome'; // outcome = 以 rules.status 判（象棋一步杀：任何当场取胜着都算；"也赢"提示）
  readonly meta: Readonly<Record<string, unknown>> }
export interface PuzzlePlayer { play(p: Puzzle, o: { hints: boolean; twin?: Puzzle }): Promise<{ firstTry: boolean; hintTier: 0 | 1 | 2 | 3; ms: number }> }

// ───────────────────────────── 面对面 ─────────────────────────────
export interface Consent { readonly result: Promise<boolean>; cancel(): void }       // 发起方可撤回；对方侧"先不用"；无超时
export interface FaceToFace { consent(kind: 'undo' | 'draw', from: Side): Consent; resign(from: Side): Promise<boolean>; turnLamp(side: Side): void }
