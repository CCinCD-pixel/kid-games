// lesson/test-kit.ts — 课 / 谜题测试夹具（不是测试文件）：假视图、脚本化步骤 UI、拼好的 StepContext。vitest 用；游戏也可以拿去测自己的课数据。
import { vi } from 'vitest';
import { autoTier } from '../core/hints';
import type { GameRules, LessonHooks, StepContext } from '../core/types';
import { createInputController, type InputControllerImpl } from '../input/input-controller';
import type { LessonData, StepContextImpl, StepUi } from './registry';

const noop = (): void => undefined;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function fakeView(): any {
  return {
    el: { style: {}, addEventListener: noop, removeEventListener: noop, getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 800 }) }, reduced: true, cellPx: 100, orientation: 'first-bottom', states: [] as unknown[],
    setState(s: unknown) { this.states.push(s); }, setLastMove: noop, finishAnimations: noop, animateMove: vi.fn(async () => undefined), animateUndo: vi.fn(async () => undefined), mark: vi.fn(() => ({ dispose: noop })), arrow: vi.fn(() => ({ dispose: noop })),
    rect: () => ({ left: 0, top: 0, width: 100, height: 100 }), hitTest: () => null, liftPiece: noop, showPreview: noop, showFocus: noop, bump: noop, announce: noop, refreshRect: noop, trayAnchor: () => ({ left: 0, top: 0, width: 10, height: 10 }), stamp: async () => undefined,
  };
}
export interface ScriptedUi { ui: StepUi; /** 下一次 pick 要回答的 id 队列 */ queue: string[]; log: string[]; buttons: string[]; chips: number[] }
export function scriptedUi(): ScriptedUi {
  const queue: string[] = []; const log: string[] = []; const buttons: string[] = []; const chips: number[] = [];
  const ui: StepUi = {
    choose(opts) { let dead = false; log.push(`choose:${opts.map((o) => o.id).join('|')}`); return { pick: () => new Promise<string>((res) => { const next = (): void => { if (dead) return; if (queue.length) res(queue.shift() as string); else setTimeout(next, 1); }; next(); }), mark: (id, st) => void log.push(`${id}:${st}`), dispose() { dead = true; } }; },
    button(label, onPress) { buttons.push(label); const h = setTimeout(onPress, 2); return { dispose: () => clearTimeout(h) }; },
    counter: () => ({ set: noop, dispose: noop }),
    chip: async (_sq, net) => { chips.push(net); },
  };
  return { ui, queue, log, buttons, chips };
}
export interface TestCtx<M, S> { ctx: StepContextImpl<M, S>; view: ReturnType<typeof fakeView>; input: InputControllerImpl<M, S>; ghost: { tap: ReturnType<typeof vi.fn>; drag: ReturnType<typeof vi.fn>; path: ReturnType<typeof vi.fn> }; saved: { lessonId: string; stepId: string; puzzleIx?: number }[]; said: string[]; sfx: string[]; ui: ScriptedUi }
export function mkCtx<M, S>(rules: GameRules<M, S>, o: { skip?: boolean; data?: LessonData; wrongHoldMs?: number } = {}): TestCtx<M, S> {
  const view = fakeView(); const base = rules.initial(); const input = createInputController(view, rules, { state: () => base, seatToMove: () => 0, canAct: () => true, commit: async () => undefined, onIllegal: noop }, { keyboard: false }) as InputControllerImpl<M, S>;
  const ghost = { tap: vi.fn(async () => undefined), drag: vi.fn(async () => undefined), path: vi.fn(async () => undefined) }; const saved: TestCtx<M, S>['saved'] = []; const said: string[] = []; const sfx: string[] = []; const ui = scriptedUi();
  const hooks: LessonHooks = { narrate: vi.fn(async (id: string) => void said.push(id)), companion: { mood: noop, say: vi.fn(async () => undefined) }, sfx: (n: string) => void sfx.push(n), ghost, save: (p) => void saved.push({ ...p }), skip: () => !!o.skip };
  const ctx = { rules, view, input, ai: null as never, hooks, hints: { next: ({ failures }: { failures: number }) => ({ tier: autoTier(failures) }) }, ui: ui.ui, data: o.data, wrongHoldMs: o.wrongHoldMs ?? 1 } as unknown as StepContextImpl<M, S> & StepContext<M, S>;
  return { ctx, view, input, ghost, saved, said, sfx, ui };
}
export const tick = (ms = 12): Promise<void> => new Promise((r) => setTimeout(r, ms));
/** 一直试到输入接受（锁 / 动画未结束时 submit 返回 false） */
export async function submitWhenReady<M, S>(input: InputControllerImpl<M, S>, m: M, tries = 400): Promise<void> { for (let i = 0; i < tries; i++) { if (await input.submit(m)) return; await tick(2); } throw new Error('submit-never-accepted'); }
