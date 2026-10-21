import { describe, expect, it, vi } from 'vitest';
import { nextPhase, acceptsInput, type Phase, type PhaseEvent } from './states';
import { createSession, type RobotConfig } from './session';
import { createGame } from '../core/game';
import { chessRules } from '../test/reference/chess-adapter.mjs';
import type { AiHost, AiRequest, RobotLevel } from '../core/types';

describe('对局阶段状态机 nextPhase', () => {
  const T = (p: Phase, e: PhaseEvent): Phase => nextPhase(p, e);
  it('转移表', () => {
    expect(T('play', { t: 'commit' })).toBe('animating'); expect(T('aiThinking', { t: 'commit' })).toBe('animating'); expect(T('animating', { t: 'commit' })).toBe('animating'); expect(T('ended', { t: 'commit' })).toBe('ended');
    expect(T('animating', { t: 'animDone', over: false, robotTurn: false })).toBe('play'); expect(T('animating', { t: 'animDone', over: false, robotTurn: true })).toBe('aiThinking'); expect(T('animating', { t: 'animDone', over: true, robotTurn: true })).toBe('ended');
    expect(T('play', { t: 'animDone', over: true, robotTurn: false })).toBe('play'); expect(T('play', { t: 'aiStart' })).toBe('aiThinking'); expect(T('animating', { t: 'aiStart' })).toBe('animating');
    expect(T('aiThinking', { t: 'aiCancel' })).toBe('play'); expect(T('animating', { t: 'aiCancel' })).toBe('animating');
    for (const p of ['play', 'animating', 'aiThinking', 'ended'] as Phase[]) { expect(T(p, { t: 'end' })).toBe('ended'); expect(T(p, { t: 'reset' })).toBe('play'); }
    expect(acceptsInput('play')).toBe(true); for (const p of ['animating', 'aiThinking', 'ended'] as Phase[]) expect(acceptsInput(p)).toBe(false);
  });
});

// ───── 假视图 / 假 AI：不依赖 DOM ─────
const noop = (): void => undefined;
function fakeView(): any { // eslint-disable-line @typescript-eslint/no-explicit-any
  const el = { style: {}, addEventListener: noop, removeEventListener: noop, getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 800 }) };
  const stamps: string[] = []; const marks: string[] = [];
  return { el, reduced: true, cellPx: 100, orientation: 'first-bottom', stamps, marks, calls: [] as string[],
    setState: noop, setLastMove: noop, finishAnimations: noop, animateMove: vi.fn(async () => undefined), animateUndo: vi.fn(async () => undefined),
    mark(kind: string) { marks.push(kind); return { dispose: noop }; }, async stamp(kind: string) { stamps.push(kind); },
    rect: () => ({ left: 0, top: 0, width: 100, height: 100 }), hitTest: () => null, liftPiece: noop, showPreview: noop, showFocus: noop, bump: noop, announce: noop, refreshRect: noop };
}
const LEVEL: RobotLevel = { id: 't', depth: 1, nodes: 100, slip: 0, glanceTemp: 1, temp: 1, margin: 0, mateSight: 0, coachCap: 0, look: {} };
function deferredAi(script: (req: AiRequest) => Promise<unknown>): AiHost & { bumps: number; calls: AiRequest[] } {
  const h = { bumps: 0, calls: [] as AiRequest[], fallbackActive: false, request: (req: AiRequest) => { h.calls.push(req); return script(req) as Promise<never>; }, bump() { h.bumps++; }, terminate: noop };
  return h as unknown as AiHost & { bumps: number; calls: AiRequest[] };
}
const robot = (): RobotConfig => ({ level: LEVEL, gameSeed: 1, thinkMs: 0 });
const tick = (ms = 5): Promise<void> => new Promise((r) => setTimeout(r, ms));

describe('Session（假视图 + 假 AI）', () => {
  const rules = chessRules(); const dec = (g: { state(): unknown }, t: string): unknown => rules.decode(g.state(), t);
  it('单人对机器人：孩子走 → 动画 → 机器人思考（持 ai 锁）→ 机器人走 → 回到 play；事件顺序正确', async () => {
    const view = fakeView(); const ai = deferredAi(async () => ({ move: 'e7e5', resign: false, ply: 1 })); const s = createSession({ rules, view, seat: 'single', kidSide: 0, ai, robot: robot() });
    const phases: string[] = []; const moves: string[] = []; s.on('phase', (e) => phases.push(e.phase)); s.on('move', (e) => moves.push(`${e.robot ? 'R' : 'K'}:${e.encoded}`));
    await s.play(dec(s.game, 'e2e4') as never); await tick(20);
    expect(moves).toEqual(['K:e2e4', 'R:e7e5']); expect(phases).toEqual(['animating', 'aiThinking', 'animating', 'play']); expect(s.phase).toBe('play'); expect(s.input.locked).toBe(false); expect(s.game.encoded()).toEqual(['e2e4', 'e7e5']);
    expect(ai.calls[0]).toMatchObject({ op: 'move', startFen: s.game.startFen, moves: ['e2e4'] });
  });
  it('机器人思考中：输入被拒（canAct false）、程序化 play 被忽略；悔棋 = bump AI + 撤回孩子这一手，迟到的 AI 回复不落子', async () => {
    const view = fakeView(); let release!: (v: unknown) => void; const ai = deferredAi(() => new Promise((r) => (release = r))); const s = createSession({ rules, view, seat: 'single', kidSide: 0, ai, robot: robot() });
    await s.play(dec(s.game, 'e2e4') as never); await tick(); expect(s.phase).toBe('aiThinking'); expect(s.input.locked).toBe(true); expect(s.state).toBe('aiThinking');
    await s.play(dec(s.game, 'd2d4') as never); expect(s.game.encoded()).toEqual(['e2e4']);
    expect(await s.undo()).toBe(true); expect(ai.bumps).toBeGreaterThan(0); expect(s.game.encoded()).toEqual([]); expect(s.phase).toBe('play'); expect(s.input.locked).toBe(false);
    release({ move: 'e7e5', resign: false, ply: 1 }); await tick(20); expect(s.game.encoded()).toEqual([]);
  });
  it('悔棋（轮到孩子时）撤回两步；空历史悔棋 = false', async () => {
    const view = fakeView(); const ai = deferredAi(async () => ({ move: 'e7e5', resign: false, ply: 1 })); const s = createSession({ rules, view, seat: 'single', ai, robot: robot() }); expect(await s.undo()).toBe(false);
    await s.play(dec(s.game, 'e2e4') as never); await tick(20); expect(s.game.encoded()).toHaveLength(2); expect(await s.undo()).toBe(true); expect(s.game.encoded()).toEqual([]); expect(view.animateUndo).toHaveBeenCalledTimes(2);
  });
  it('孩子执黑：开局机器人先走', async () => {
    const view = fakeView(); const ai = deferredAi(async () => ({ move: 'e2e4', resign: false, ply: 0 })); const s = createSession({ rules, view, seat: 'single', kidSide: 1, ai, robot: robot() }); await tick(20);
    expect(s.game.encoded()).toEqual(['e2e4']); expect(s.phase).toBe('play'); expect(s.input.locked).toBe(false);
  });
  it('将死：end 事件、阶段 ended、印章 mate、输入拒绝；悔棋可回到对局', async () => {
    const view = fakeView(); const s = createSession({ rules, view, seat: 'f2f' }); const ends: string[] = []; s.on('end', (e) => ends.push((e.outcome as { reason: string }).reason));
    for (const t of ['f2f3', 'e7e5', 'g2g4', 'd8h4']) await s.play(dec(s.game, t) as never);
    expect(ends).toEqual(['checkmate']); expect(s.phase).toBe('ended'); expect(view.stamps).toContain('mate'); expect(s.outcome()).toMatchObject({ over: true, winner: 1 }); await s.play(dec(s.game, 'a2a3') as never); expect(s.game.encoded()).toHaveLength(4);
    expect(await s.undo()).toBe(true); expect(s.phase).toBe('play'); expect(s.outcome().over).toBe(false);
  });
  it('认输：赢家为对方；结束后不再接受着法；restart 回到初始局面', async () => {
    const view = fakeView(); const s = createSession({ rules, view, seat: 'f2f' }); const rs: number[] = []; s.on('resign', (e) => rs.push(e.side)); await s.play(dec(s.game, 'e2e4') as never); s.resign(1);
    expect(rs).toEqual([1]); expect(s.outcome()).toMatchObject({ over: true, winner: 0, reason: 'resign' }); expect(s.phase).toBe('ended'); await s.play(dec(s.game, 'e7e5') as never); expect(s.game.encoded()).toEqual(['e2e4']);
    s.restart(); expect(s.phase).toBe('play'); expect(s.game.encoded()).toEqual([]); expect(s.outcome().over).toBe(false);
  });
  it('机器人认输（resign: true）→ 孩子胜；AI 报错 → aiError 事件、回到可操作', async () => {
    const view = fakeView(); const ai = deferredAi(async () => ({ move: null, resign: true, ply: 1 })); const s = createSession({ rules, view, seat: 'single', ai, robot: robot() }); await s.play(dec(s.game, 'e2e4') as never); await tick(20);
    expect(s.outcome()).toMatchObject({ over: true, winner: 0, reason: 'resign' }); expect(s.input.locked).toBe(false);
    const warn = vi.spyOn(console, 'warn').mockImplementation(noop); const ai2 = deferredAi(async () => { throw new Error('boom'); }); const errs: unknown[] = []; const s2 = createSession({ rules, view: fakeView(), seat: 'single', ai: ai2, robot: robot() }); s2.on('aiError', (e) => errs.push(e.error));
    await s2.play(dec(s2.game, 'e2e4') as never); await tick(20); expect(errs).toHaveLength(1); expect(s2.phase).toBe('play'); expect(s2.input.locked).toBe(false); warn.mockRestore();
  });
  it('由已有 Game 创建（恢复存档）：lasts 与状态一致，终局先于输入', async () => {
    const g = createGame(rules); for (const t of ['e2e4', 'e7e5']) g.play(rules.decode(g.state(), t)); const s = createSession({ rules, view: fakeView(), game: g, seat: 'f2f' }); expect(s.game.ply()).toBe(2); expect(s.phase).toBe('play'); expect(await s.undo()).toBe(true); expect(s.game.ply()).toBe(1);
  });
});
