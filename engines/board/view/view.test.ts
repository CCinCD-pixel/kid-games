import { describe, expect, it } from 'vitest';
import { createAnimQueue, type AnimJob } from './anim';
import { planEffects, slideMs } from './effects';
import { checkLayout, fitRect, SAFE_NONE, VIEWPORTS } from './layout-types';
import { flipOrientation, pieceRotation } from './orientation';
import { neighbour } from '../input/keyboard';
import { chessRules } from '../test/reference/chess-adapter.mjs';
import { xqRules } from '../test/reference/xq-adapter.mjs';
import type { Effect, Theme } from '../core/types';

const motion: Theme['motion'] = { moveMs: (d) => 150 + 24 * d, liftPx: 14, squash: [1.08, 0.9, 140], captureMs: 260, landMs: 120, maxMs: 240 };
const P0 = { type: 3, side: 0 as const }, P1 = { type: 6, side: 1 as const };
const c = (sq: number) => ({ x: (sq % 8) * 100, y: Math.floor(sq / 8) * 100 });

describe('planEffects（动画时间线）', () => {
  it('滑行 = 150+24×格距，≤240 ms', () => {
    expect(slideMs(1, motion)).toBe(174); expect(slideMs(9, motion)).toBe(240); expect(slideMs(3, motion, 2)).toBeCloseTo(111); expect(slideMs(5, motion, 1, true)).toBe(80);
  });
  it('普通吃子：吃子在滑行尾段开始（重叠 70 ms）；最长一次 ≤ 700 ms（9 格吃子 ≈ 440 ms）', () => {
    const eff: Effect[] = [{ k: 'move', phase: 0, from: 0, to: 63, piece: P0 }, { k: 'capture', phase: 1, sq: 63, piece: P1 }];
    const p = planEffects(eff, { unit: 100, center: c, motion }); const mv = p.items[0], cp = p.items[1];
    expect(mv.durMs).toBe(240); expect(cp.startMs).toBe(240 - 70); expect(p.totalMs).toBeCloseTo(170 + 260); expect(p.totalMs).toBeLessThanOrEqual(700); expect(mv.main).toBe(true);
  });
  it('易位：两个 move 同阶段并行；升变在吃子之后串行', () => {
    const castle: Effect[] = [{ k: 'move', phase: 0, from: 4, to: 6, piece: { type: 1, side: 0 } }, { k: 'move', phase: 0, from: 7, to: 5, piece: P0 }];
    const p = planEffects(castle, { unit: 100, center: c, motion, mainFrom: 4 }); expect(p.items.every((i) => i.startMs === 0)).toBe(true); expect(p.items.filter((i) => i.main).length).toBe(1); expect(p.items.find((i) => i.main)!.effect).toMatchObject({ from: 4 });
    const promo: Effect[] = [{ k: 'move', phase: 0, from: 8, to: 0, piece: P0 }, { k: 'capture', phase: 1, sq: 0, piece: P1 }, { k: 'promote', phase: 2, sq: 0, from: P0, to: { type: 2, side: 0 } }];
    const q = planEffects(promo, { unit: 100, center: c, motion }); const cap = q.items[1], pro = q.items[2]; expect(pro.startMs).toBeGreaterThanOrEqual(cap.startMs + cap.durMs - 1e-6);
  });
  it('reducedMotion：每步 ≤ 80 ms 且吃子不重叠等待', () => {
    const eff: Effect[] = [{ k: 'move', phase: 0, from: 0, to: 63, piece: P0 }, { k: 'capture', phase: 1, sq: 63, piece: P1 }];
    const p = planEffects(eff, { unit: 100, center: c, motion, reduced: true }); expect(p.items.every((i) => i.durMs <= 80)).toBe(true); expect(p.totalMs).toBeLessThanOrEqual(160);
  });
  it('超过 700 ms 的时间线按比例压缩', () => {
    const eff: Effect[] = [{ k: 'move', phase: 0, from: 0, to: 63, piece: P0 }, { k: 'capture', phase: 1, sq: 63, piece: P1 }, { k: 'promote', phase: 2, sq: 63, from: P0, to: P0 }];
    const slow = { ...motion, captureMs: 900 }; const p = planEffects(eff, { unit: 100, center: c, motion: slow }); expect(p.totalMs).toBeLessThanOrEqual(700 + 1e-6);
  });
  it('用真实适配器：国象易位 / 吃过路兵 / 升变的效果都能排出时间线', () => {
    const r = chessRules(); const s = r.fromFen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1'); const m = r.legalMoves(s).find((x: unknown) => r.encode(x) === 'e1g1');
    const p = planEffects(r.effects(s, m), { unit: 100, center: (q) => r.geometry.center(q, 'first-bottom'), motion }); expect(p.items.length).toBe(2); expect(p.items.every((i) => i.startMs === 0)).toBe(true);
  });
});

describe('动画队列', () => {
  const mkJob = (log: string[], name: string, ms = 0): AnimJob => ({ start() { log.push('start ' + name); let fin = false; let res!: () => void; const done = new Promise<void>((r) => (res = r)); const finish = (): void => { if (fin) return; fin = true; log.push('end ' + name); res(); }; if (ms >= 0) setTimeout(finish, ms); return { done, finish }; } });
  it('依次执行，全部结束后 idle', async () => {
    const q = createAnimQueue(); const log: string[] = []; const idles: boolean[] = []; q.onIdleChange((i) => idles.push(i));
    const a = q.enqueue(mkJob(log, 'a', 5)), b = q.enqueue(mkJob(log, 'b', 5)); expect(q.idle).toBe(false); expect(q.pending).toBe(2); await Promise.all([a, b]);
    expect(log).toEqual(['start a', 'end a', 'start b', 'end b']); expect(q.idle).toBe(true); expect(idles).toEqual([false, true]);
  });
  it('finishAll：当前任务推进到终态，排队的"启动即完成"，所有等待者被释放', async () => {
    const q = createAnimQueue(); const log: string[] = []; const ps = [q.enqueue(mkJob(log, 'a', 1000)), q.enqueue(mkJob(log, 'b', 1000)), q.enqueue(mkJob(log, 'c', 1000))];
    q.finishAll(); expect(q.idle).toBe(true); await Promise.all(ps); expect(log).toEqual(['start a', 'end a', 'start b', 'end b', 'start c', 'end c']);
  });
  it('任务抛错不阻塞队列', async () => {
    const q = createAnimQueue(); const log: string[] = []; const bad: AnimJob = { start() { throw new Error('boom'); } };
    const w = console.warn; console.warn = () => undefined; try { await Promise.all([q.enqueue(bad), q.enqueue(mkJob(log, 'ok', 1))]); } finally { console.warn = w; } expect(log).toEqual(['start ok', 'end ok']);
  });
  it('finishAll 后可继续入队', async () => {
    const q = createAnimQueue(); const log: string[] = []; void q.enqueue(mkJob(log, 'a', 1000)); q.finishAll(); await q.enqueue(mkJob(log, 'b', 1)); expect(log.at(-1)).toBe('end b');
  });
});

describe('布局助手 / 朝向 / 键盘邻格', () => {
  it('fitRect 居中取整；checkLayout 找出越界、过小、重叠、底部余量', () => {
    const r = fitRect({ x: 0, y: 0, w: 810, h: 700 }, 910 / 1010); expect(r.h).toBe(700); expect(r.x + r.w / 2).toBeCloseTo(405, 0);
    const vp = { ...VIEWPORTS.phoneP, safe: SAFE_NONE };
    const bad = checkLayout(vp, [{ name: 'a', rect: { x: 0, y: 0, w: 100, h: 40 }, tappable: true }, { name: 'b', rect: { x: 50, y: 20, w: 100, h: 60 } }, { name: 'c', rect: { x: 300, y: 600, w: 120, h: 64 }, tappable: true }]);
    expect(bad.join('|')).toMatch(/a 可点区域/); expect(bad.join('|')).toMatch(/a 与 b 重叠/); expect(bad.join('|')).toMatch(/c 超出安全区/);
    expect(checkLayout(vp, [{ name: 'ok', rect: { x: 10, y: 10, w: 60, h: 60 }, tappable: true }])).toEqual([]);
  });
  it('朝向翻转；只有 f2f 的后手子旋转', () => {
    expect(flipOrientation('first-bottom')).toBe('second-bottom'); expect(pieceRotation(P1, 'f2f', 'seat')).toBe(180); expect(pieceRotation(P1, 'single', 'seat')).toBe(0); expect(pieceRotation(P1, 'f2f', 'none')).toBe(0); expect(pieceRotation(P0, 'f2f', 'seat')).toBe(0);
  });
  it('键盘邻格：方格与交叉点棋盘、两个朝向都能走到边', () => {
    for (const rules of [chessRules(), xqRules()]) {
      const g = rules.geometry; for (const o of ['first-bottom', 'second-bottom'] as const) {
        let start = 0; for (let q = 1; q < g.squares; q++) { const a = g.center(q, o), b = g.center(start, o); if (a.x < b.x - 1 || (Math.abs(a.x - b.x) < 1 && a.y < b.y)) start = q; }     // 最左一列
        let q: number | null = start, n = 0; while (q !== null && n < 30) { const nx: number | null = neighbour(g, o, q, 1, 0); if (nx === null) break; q = nx; n++; }
        expect(n).toBe(g.cols - 1); void flipOrientation;
      }
    }
  });
});
