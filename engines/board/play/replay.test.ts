import { describe, expect, it, vi } from 'vitest';
import { createReplayPlayer } from './replay';
import { createRecorder, isGameRecord, parseRecord } from './recorder';
import { createSession } from './session';
import { createBoardStore, isSavedGame, restoreSavedGame, toSavedGame } from '../save/adapter';
import { chessRules } from '../test/reference/chess-adapter.mjs';
import { createGame } from '../core/game';

const noop = (): void => undefined;
const fakeView = (): any => ({ el: { style: {}, addEventListener: noop, removeEventListener: noop, getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 800 }) }, reduced: false, cellPx: 100, orientation: 'first-bottom', states: [] as unknown[], lasts: [] as unknown[],
  setState(s: unknown) { this.states.push(s); }, setLastMove(a: unknown, b?: unknown) { this.lasts.push([a, b]); }, finishAnimations: noop, animateMove: vi.fn(async () => undefined), animateUndo: vi.fn(async () => undefined), mark: () => ({ dispose: noop }), stamp: async () => undefined, rect: () => ({ left: 0, top: 0, width: 100, height: 100 }), hitTest: () => null }); // eslint-disable-line @typescript-eslint/no-explicit-any
const rules = chessRules(); const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'; const MOVES = ['e2e4', 'e7e5', 'g1f3', 'b8c6'];

describe('复盘播放器', () => {
  it('前进 / 后退 / 跳转；非法着法处截断；越界无效', async () => {
    const view = fakeView(); const p = createReplayPlayer({ rules, view, startFen: START, moves: [...MOVES, 'a1a5'] }); expect(p.total).toBe(4); expect(p.ply).toBe(0);
    expect(await p.prev()).toBe(false); expect(await p.next()).toBe(true); expect(p.ply).toBe(1); expect(view.animateMove).toHaveBeenCalledTimes(1); await p.next(); expect(await p.prev()).toBe(true); expect(p.ply).toBe(1); expect(view.animateUndo).toHaveBeenCalledTimes(1);
    p.goto(99); expect(p.ply).toBe(4); expect(p.atEnd).toBe(true); expect(await p.next()).toBe(false); p.goto(-3); expect(p.ply).toBe(0);
  });
  it('自动播放：按间隔逐手前进，到末尾自动停；暂停 / 重播', async () => {
    vi.useFakeTimers(); try {
      const view = fakeView(); const p = createReplayPlayer({ rules, view, startFen: START, moves: MOVES, gapMs: 500 }); const seen: string[] = []; p.onChange((e) => seen.push(`${e.ply}${e.playing ? '▶' : '■'}`)); p.play();
      await vi.advanceTimersByTimeAsync(520); expect(p.ply).toBe(1); await vi.advanceTimersByTimeAsync(520); expect(p.ply).toBe(2); p.pause(); await vi.advanceTimersByTimeAsync(2000); expect(p.ply).toBe(2);
      p.play(); await vi.advanceTimersByTimeAsync(2000); expect(p.ply).toBe(4); expect(p.playing).toBe(false); p.play(); expect(p.ply).toBe(0); expect(p.playing).toBe(true); p.destroy();
    } finally { vi.useRealTimers(); }
  });
});

describe('记录器 / 存档适配器', () => {
  it('Recorder 跟随 Session：move / undo / end / restart', async () => {
    let t = 1000; const rec = createRecorder('chess', START, { kidSide: 0, level: 'R2', seed: 9 }, () => (t += 100)); const s = createSession({ rules, view: fakeView(), seat: 'f2f' }); rec.attach(s);
    for (const m of ['f2f3', 'e7e5', 'g2g4', 'd8h4']) await s.play(rules.decode(s.game.state(), m));
    let r = rec.record(); expect(r.moves).toEqual(['f2f3', 'e7e5', 'g2g4', 'd8h4']); expect(r.result).toEqual({ winner: 1, reason: 'checkmate' }); expect(r.times).toHaveLength(4); expect(isGameRecord(r)).toBe(true); expect(r.level).toBe('R2');
    await s.undo(); r = rec.record(); expect(r.moves).toHaveLength(3); expect(r.result).toBeUndefined(); s.restart(); expect(rec.record().moves).toEqual([]);
  });
  it('parseRecord：合法 → 原样；含非法着法 → 截断；形状不对 → null', () => {
    const good = { v: 1 as const, gameId: 'chess', startFen: START, moves: MOVES, times: [1, 2, 3, 4], startedAt: 0 }; expect(parseRecord(rules, good)).toMatchObject({ truncated: false });
    const bad = parseRecord(rules, { ...good, moves: ['e2e4', 'e2e4', 'g1f3'], times: [1, 2, 3] }); expect(bad?.truncated).toBe(true); expect(bad?.record.moves).toEqual(['e2e4']); expect(bad?.record.times).toEqual([1]);
    expect(parseRecord(rules, { v: 2 })).toBeNull(); expect(parseRecord(rules, null)).toBeNull();
  });
  it('SavedGame：序列化往返；非法着法截断；未知形状 → null', () => {
    const g = createGame(rules); for (const m of MOVES) g.play(rules.decode(g.state(), m)); const saved = toSavedGame(g, { kidSide: 1, level: 'R3', seed: 5 }); expect(isSavedGame(saved)).toBe(true);
    const back = restoreSavedGame(rules, JSON.parse(JSON.stringify(saved))); expect(back?.truncated).toBe(false); expect(back?.game.fen()).toBe(g.fen()); expect(restoreSavedGame(rules, { ...saved, moves: ['e2e4', 'zzzz'] })?.truncated).toBe(true); expect(restoreSavedGame(rules, { nope: 1 })).toBeNull();
  });
  it('createBoardStore：版本迁移一次调用、形状校验不合格 → defaults；新版存档不被覆盖', () => {
    const mem = new Map<string, string>(); const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k), clear: () => mem.clear(), key: () => null, length: 0 } as unknown as Storage;
    interface S { v: number; stars: Record<string, number> } const isValid = (x: unknown): x is S => !!x && typeof x === 'object' && typeof (x as S).v === 'number' && !!(x as S).stars && typeof (x as S).stars === 'object';
    mem.set('kg:v1:t-board', JSON.stringify({ v: 1, updatedAt: 1, data: { stars: { a: 3 } } })); const migrate = vi.fn((old: unknown) => ({ v: 2, stars: (old as { stars: Record<string, number> }).stars }));
    const store = createBoardStore<S>('t-board', { version: 2, defaults: () => ({ v: 2, stars: {} }), migrate, isValid, storage }); expect(store.load()).toEqual({ v: 2, stars: { a: 3 } }); store.load(); expect(migrate).toHaveBeenCalledTimes(1);
    mem.set('kg:v1:t-board', JSON.stringify({ v: 2, updatedAt: 2, data: { v: 2, stars: 5 } })); const warn = vi.spyOn(console, 'warn').mockImplementation(noop); expect(store.load()).toEqual({ v: 2, stars: {} }); warn.mockRestore();
    expect(store.update((d) => { d.stars.b = 2; })).toEqual({ v: 2, stars: { b: 2 } });
    mem.set('kg:v1:t-board', JSON.stringify({ v: 3, updatedAt: 3, data: { z: 1 } })); expect(store.save({ v: 2, stars: {} })).toBe(false);
  });
});
