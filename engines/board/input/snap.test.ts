import { describe, expect, it } from 'vitest';
import { resolveTap, SNAP_IPAD, SNAP_PHONE, tuningForCell, type TapContext } from './snap';

// 蒙特卡洛（xiangqi-tools/snap-mc.mjs 的回归版）：手指噪声 σ（格）：iPad c=81 → 0.10；iPhone 13 c=40 → 0.31；SE c=32 → 0.40。
const mk = (seed: number) => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const R = mk(7); const gauss = (): number => { const u = Math.max(1e-9, R()), v = R(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
type Pt = [number, number]; const key = (x: number, y: number): string => `${x},${y}`;
const sqOf = (x: number, y: number): number => (x + 20) * 100 + (y + 20);

interface Case { intent: Pt; legal: Pt[]; own: Pt[]; want: 'move:0,0' | 'illegal' | 'select'; hijack?: (r: string) => boolean }
const CASES: Record<string, Case> = {
  'A 目标合法 · 左右各有合法邻点（车沿线）': { intent: [0, 0], legal: [[0, 0], [1, 0], [-1, 0]], own: [], want: 'move:0,0' },
  'B 目标合法 · 孤立（马落点）': { intent: [0, 0], legal: [[0, 0]], own: [], want: 'move:0,0' },
  'C 想点非法点看原因 · 紧邻 1 个合法点': { intent: [0, 0], legal: [[1, 0]], own: [], want: 'illegal', hijack: (r) => r.startsWith('move') },
  'D 想点非法点看原因 · 紧邻 2 个合法点（车线）': { intent: [0, 0], legal: [[1, 0], [-1, 0]], own: [], want: 'illegal', hijack: (r) => r.startsWith('move') },
  'E 想改选己方子 · 旁边有合法点': { intent: [0, 0], legal: [[1, 0], [0, 1]], own: [[0, 0]], want: 'select', hijack: (r) => r.startsWith('move') },
};
function decide(c: Case, click: Pt, tuning = SNAP_IPAD): string {
  const nx = Math.round(click[0]), ny = Math.round(click[1]); const legal = new Set(c.legal.map(([x, y]) => sqOf(x, y))); const own = new Set(c.own.map(([x, y]) => sqOf(x, y)));
  const selfSq = sqOf(9, 9); const d = (x: number, y: number): number => Math.hypot(click[0] - x, click[1] - y);
  const ctx: TapContext = {
    nearest: sqOf(nx, ny), dist: d(nx, ny), selected: selfSq, legal, ownAtNearest: own.has(sqOf(nx, ny)),
    near: c.legal.map(([x, y]) => ({ sq: sqOf(x, y), dist: d(x, y) })).filter((q) => q.dist <= Math.max(tuning.targetRadius, 1)),
    ownNear: c.own.map(([x, y]) => ({ sq: sqOf(x, y), dist: d(x, y) })),
  };
  const r = resolveTap(ctx, tuning); return r.kind === 'move' ? `move:${key(Math.floor(r.sq / 100) - 20, (r.sq % 100) - 20)}` : r.kind;
}
const rate = (name: string, sigma: number, tuning: typeof SNAP_IPAD, N = 20000): { ok: number; hij: number } => {
  const c = CASES[name]; let ok = 0, hij = 0; for (let i = 0; i < N; i++) { const click: Pt = [c.intent[0] + sigma * gauss(), c.intent[1] + sigma * gauss()]; const r = decide(c, click, tuning); if (r === c.want) ok++; if (c.hijack?.(r)) hij++; } return { ok: ok / N, hij: hij / N };
};

describe('点选 4 级规则（纯函数）', () => {
  const base: TapContext = { nearest: 5, dist: 0, selected: 1, legal: new Set([5, 6]), ownAtNearest: false, near: [], ownNear: [] };
  it('① 己方子改选（无论远近）；再点已选中 = toggle', () => {
    expect(resolveTap({ ...base, ownAtNearest: true, dist: 0.45 }, SNAP_IPAD)).toEqual({ kind: 'select', sq: 5 }); expect(resolveTap({ ...base, nearest: 1, ownAtNearest: true }, SNAP_IPAD)).toEqual({ kind: 'toggle', sq: 1 });
  });
  it('② 最近交点合法 → 走（不吸附）', () => { expect(resolveTap(base, SNAP_IPAD)).toEqual({ kind: 'move', sq: 5, snapped: false }); });
  it('③ 非法点：近距离只报原因；≥guard 且唯一合法点在 targetRadius 内才吸附；两个合法点不吸附', () => {
    const ill = { ...base, nearest: 9, legal: new Set([5]) };
    expect(resolveTap({ ...ill, dist: 0.1, near: [{ sq: 5, dist: 0.4 }] }, SNAP_IPAD)).toEqual({ kind: 'illegal', sq: 9 });
    expect(resolveTap({ ...ill, dist: 0.4, near: [{ sq: 5, dist: 0.45 }] }, SNAP_IPAD)).toEqual({ kind: 'move', sq: 5, snapped: true });
    expect(resolveTap({ ...ill, dist: 0.4, near: [{ sq: 5, dist: 0.45 }, { sq: 6, dist: 0.48 }] }, SNAP_IPAD)).toEqual({ kind: 'illegal', sq: 9 });
    expect(resolveTap({ ...ill, dist: 0.4, near: [{ sq: 5, dist: 0.6 }] }, SNAP_IPAD)).toEqual({ kind: 'illegal', sq: 9 });
  });
  it('④ 没有选中且点空处 → 取消；棋盘外 → 取消；手机选子辅助', () => {
    expect(resolveTap({ ...base, selected: null, legal: new Set(), nearest: 9 }, SNAP_IPAD)).toEqual({ kind: 'cancel' }); expect(resolveTap({ ...base, nearest: null }, SNAP_IPAD)).toEqual({ kind: 'cancel' });
    expect(resolveTap({ ...base, selected: null, legal: new Set(), nearest: 9, ownNear: [{ sq: 3, dist: 0.5 }] }, SNAP_PHONE)).toEqual({ kind: 'select', sq: 3 });
    expect(resolveTap({ ...base, selected: null, legal: new Set(), nearest: 9, ownNear: [{ sq: 3, dist: 0.5 }, { sq: 4, dist: 0.55 }] }, SNAP_PHONE)).toEqual({ kind: 'cancel' });
  });
  it('预设：c<44 用手机档', () => { expect(tuningForCell(81)).toBe(SNAP_IPAD); expect(tuningForCell(40)).toBe(SNAP_PHONE); expect(tuningForCell(32)).toBe(SNAP_PHONE); });
  it('蒙特卡洛 iPad σ=0.10：目标命中 ≥99 %，劫持 0 %', () => {
    for (const k of Object.keys(CASES)) { const r = rate(k, 0.1, SNAP_IPAD); if (k[0] <= 'B') expect(r.ok).toBeGreaterThan(0.99); if (CASES[k].hijack) expect(r.hij).toBeLessThan(0.002); }
  });
  it('蒙特卡洛 iPhone 13 σ=0.31：目标命中 ≥78 %，劫持 ≤12 %', () => {
    const phone = { ...SNAP_PHONE, selectRadius: 0 };   // 与原型同口径：不含选子辅助
    for (const k of Object.keys(CASES)) { const r = rate(k, 0.31, phone); if (k[0] <= 'B') expect(r.ok).toBeGreaterThan(0.78); if (CASES[k].hijack) expect(r.hij).toBeLessThan(0.12); }
  });
  it('蒙特卡洛 SE σ=0.40：命中 ≥ 58 %，劫持 ≤ 20 %', () => {
    const phone = { ...SNAP_PHONE, selectRadius: 0 };
    for (const k of Object.keys(CASES)) { const r = rate(k, 0.4, phone); if (k[0] <= 'B') expect(r.ok).toBeGreaterThan(0.58); if (CASES[k].hijack) expect(r.hij).toBeLessThan(0.2); }
  });
});
