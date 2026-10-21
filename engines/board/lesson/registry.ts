// lesson/registry.ts — 课步骤注册表 + 步骤上下文类型（registerStep 是公开扩展点；国象专用种类在 steps-chess/ 注册）。
// 字段名与 lessons.mjs 的最终 schema（out/lessons.v1.json）一致：k / id / pos(FEN) / say / twin / note + 各步型自己的字段。
import type { Disposable, GameRules, Puzzle, Sq, StepBase, StepContext, StepResult, StepRunner } from '../core/types';
import type { InputControllerImpl } from '../input/input-controller';

export interface LessonStep extends StepBase { /** 局面（FEN）；setup / card / bank 等步型没有 */ readonly pos?: string; readonly par?: number; readonly [extra: string]: unknown }

// ───────────── 取消作用域：课播放器 cancel() 时所有在途步骤都要放手输入并结束 ─────────────
export interface StepScope { readonly cancelled: boolean; onCancel(fn: () => void): () => void }
export interface StepScopeImpl extends StepScope { cancel(): void }
export const CANCELLED: Error & { cancelled: true } = Object.assign(new Error('cancelled'), { cancelled: true as const });
export const isCancelled = (e: unknown): boolean => !!e && typeof e === 'object' && (e as { cancelled?: boolean }).cancelled === true;
export function createScope(): StepScopeImpl {
  const subs = new Set<() => void>(); let cancelled = false;
  return { get cancelled() { return cancelled; }, onCancel(fn) { if (cancelled) { fn(); return () => undefined; } subs.add(fn); return () => { subs.delete(fn); }; }, cancel() { if (cancelled) return; cancelled = true; for (const f of [...subs]) f(); subs.clear(); } };
}

// ───────────── 步骤 UI（答题按钮 / 小眼睛 / 计数）：由游戏注入，缺省 DOM 版见 step-ui.ts ─────────────
export interface ChoiceOption { readonly id: string; readonly label: string }
export interface Chooser { pick(): Promise<string>; mark(id: string, state: 'ok' | 'soft' | 'hint' | 'off'): void; dispose(): void }
export interface StepUi {
  choose(opts: readonly ChoiceOption[]): Chooser;
  button(label: string, onPress: () => void, o?: { id?: string }): Disposable;
  counter(text: string): { set(text: string): void; dispose(): void };
  /** 棋格上漂起的分数筹码（+4 / −9）；缺省 DOM 实现飞向吃子托盘 */
  chip?(sq: Sq, net: number): Promise<void>;
}
/** 摆子步（setup）：base = 该部分之前已摆好的局面 FEN；place = 要摆的 [格名, FEN 字符] */
export interface SetupSpec { readonly base: string; readonly place: readonly (readonly [string, string])[] }
/** 游戏给课的数据 / 玩法钩子（全部可选） */
export interface LessonData {
  /** 步骤没有 pos 时（puzSel 等）由游戏解析出局面 FEN */
  position?(step: LessonStep): string | null;
  setup?(part: string, step: LessonStep): SetupSpec | null;
  /** 题库取题（bank / bank2 的 ids） */
  puzzle?(id: string, step: LessonStep): Puzzle | null;
  /** 覆盖某种 quiz 的选项与文案（缺省见 steps-ask.ts 的 CHOICES） */
  choices?(q: string, step: LessonStep): readonly ChoiceOption[] | null;
  /** play 步：和机器人下一盘（整盘 / 小局）；缺省直接完成 */
  play?(step: LessonStep, ctx: StepContext<never, never>): Promise<StepResult>;
  /** 提示旁白 id（缺省 h.1.* / h.2 / h.3，见 common.ts） */
  hintSay?(step: LessonStep, tier: 1 | 2 | 3): string | null;
  /** 小战场：敌卒字符 / 红帅字符（缺省 'p' / 'K'） */
  battle?: { readonly pawn?: string; readonly king?: string };
}
export interface StepContextImpl<M, S> extends StepContext<M, S> {
  input: InputControllerImpl<M, S>;
  /** 走错后"看一眼"的停留（毫秒；缺省 600） */ wrongHoldMs?: number;
  ui?: StepUi; data?: LessonData;
  /** 播放器填：当前课 id（存检查点用）/ 题组续播下标 / 辅助档（连续两步首试没对 → 下一步先亮 H1） */
  lessonId?: string; resumeIx?: number; assist?: 0 | 1; scope?: StepScope;
  /** 播放器填：LessonDef.strict（摸底 / 测验）= 不放宽、不预亮提示、不因连续没对给辅助——孩子的作答如实计分 */ strict?: boolean;
}

const registry = new Map<string, StepRunner<unknown, unknown, never>>();
/** 公开扩展点（冻结类型里 Step = never 太窄，这里放宽为 St extends StepBase）；棋手学院在 steps-chess/ 用它注册 castleQuiz / endgame / pawnwar … */
export function registerStep<M, S, St extends StepBase = LessonStep>(kind: string, runner: StepRunner<M, S, St>): void { registry.set(kind, runner as unknown as StepRunner<unknown, unknown, never>); }
export const getRunner = (kind: string): StepRunner<unknown, unknown, never> | undefined => registry.get(kind);
export const stepKinds = (): string[] => [...registry.keys()].sort();

/** 清掉"上一手"高亮（StepContext.view 是 BoardView 接口；setLastMove 在 BoardViewImpl 上） */
export const clearLast = (view: unknown): void => (view as { setLastMove?(a: null): void }).setLastMove?.(null);
export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
/** 格名 → Sq */
export function nameMap<M, S>(rules: GameRules<M, S>): Map<string, Sq> { const m = new Map<string, Sq>(); for (let q = 0; q < rules.geometry.squares; q++) m.set(rules.geometry.name(q), q); return m; }
/** 步骤的局面 FEN：先看 step.pos，再问游戏（data.position），都没有 → 抛错 */
export function posOf<M, S>(step: LessonStep, ctx: StepContextImpl<M, S>): string {
  const p = step.pos ?? ctx.data?.position?.(step); if (!p) throw new Error(`no-position:${step.id}`); return p;
}
/**
 * 步骤承诺：body 注册输入覆盖等资源并返回清理函数；调 done(r) 结束；课被取消时清理后以 CANCELLED 拒绝。
 * （body 里同步 done 也安全。）
 */
export function stepPromise<R>(ctx: { scope?: StepScope }, body: (done: (r: R) => void) => () => void): Promise<R> {
  return new Promise<R>((resolve, reject) => {
    let finished = false; let cleanup: (() => void) | null = null; let off: () => void = () => undefined;
    const fin = (): void => { if (finished) return; finished = true; off(); cleanup?.(); };
    cleanup = body((r) => { const was = finished; fin(); if (!was) resolve(r); });
    if (finished) { cleanup?.(); return; }
    off = ctx.scope?.onCancel(() => { fin(); reject(CANCELLED); }) ?? (() => undefined);
  });
}
