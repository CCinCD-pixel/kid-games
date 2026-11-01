/**
 * Independent oracles (spec §3.3 / V2): every family's correct answer, recomputed from the params ONLY.
 * This file may import nothing but `shared/arith.ts` and types — never a generator (V2 greps its imports).
 */
import type { Answer } from '../app/types';
import { decisivePlace, sorted, sym } from './shared/arith';

type P = any;
export const ORACLES: Record<string, (p: P, ask?: string) => Answer> = {
  'nl.calib': (p) => p.target,
  'nl.place': (p) => p.target,
  'nl.read': (p) => p.target,
  'nl.zoom': (p) => p.target,
  'pv2.read': (p) => 10 * p.t + p.o,
  'pv2.build': (p) => p.n,
  'pv2.compare': (p) => ({ sym: sym(p.a, p.b), digit: decisivePlace(p.a, p.b) }),
  'pv2.step': (p) => p.from + p.d,
  'pv2.split': (p) => p.n - 10 * p.k,
  'add.tens': (p) => p.a + p.b,
  'add.carry1': (p) => p.a + p.b,
  'add.2d2d': (p) => p.a + p.b,
  'add.compensate': (p) => p.a + p.b,
  'sub.tens': (p) => p.a - p.b,
  'sub.borrow1': (p) => p.a - p.b,
  'sub.thinkAdd': (p) => p.a - p.b,
  'sub.2d2d': (p) => p.a - p.b,
  'sub.compensate': (p) => p.a - p.b,
  'col.add': (p) => { const s = p.a + p.b; return [s % 10, Math.floor(s / 10)]; },
  'col.sub': (p) => { const s = p.a - p.b; return [s % 10, Math.floor(s / 10)]; },
  'rel.compare': (p) => (p.form === 'diff' ? p.big - p.small : p.form === 'findBig' ? p.small + p.d : p.big - p.d),
  'pv3.pack': (p) => 10 * p.rods + p.loose,
  'pv3.read': (p) => 100 * p.h + 10 * p.t + p.o,
  'pv3.build': (p) => p.n,
  'pv3.counter': (p) => p.n,
  'pv3.dictation': (p) => p.n,
  'pv3.compare': (p) => ({ sym: sym(p.a, p.b), digit: decisivePlace(p.a, p.b) }),
  'pv3.order': (p) => sorted(p.xs),
  'pv3.step': (p) => (p.op === '+' ? p.a + p.b : p.a - p.b),
  'pv3.addHund': (p) => (p.op === '+' ? p.a + p.b : p.a - p.b),
  'pv3.skip': (p) => p.start + p.step * p.k,
  'pv3.round': (p) => Math.round(p.n / 100) * 100,
  'mul.groups': (p, ask) => (ask === 'count' ? p.k : ask === 'size' ? p.n : p.n * p.k),
  'mul.write': (p, ask) => (ask === 'sum' ? [p.n, p.n * p.k] : [p.n, p.k]),
  'mul.equalCheck': (p) => {
    const s: number[] = p.sizes; const mn = Math.min(...s); const same = s.every((x) => x === s[0]);
    return same ? [1, s[0], s.length] : [0, s.reduce((a, x) => a + x - mn, 0)];
  },
  'mul.skip': (p) => p.n * p.k,
  'mul.array': (p, ask) => (ask === 'cols' ? p.cols : p.rows * p.cols),
  'mul.commute': (p) => [0, p.cols, p.rows],
  'mul.missingFactor': (p) => p.P / p.n,
  'mul.split': (p) => [p.k * p.m, (p.n - p.k) * p.m, p.n * p.m],
  'mul.compareArr': (p) => {
    const a = p.r1 * p.c1; const b = p.r2 * p.c2;
    return [a > b ? 1 : a < b ? 2 : 0, Math.max(a, b)];
  },
  'open.pv3': () => 0,
  'open.pv3cmp': () => 0,
  'open.groups': () => 0,
  'open.arrays': () => 0,
};
export const oracleOf = (fam: string, p: unknown, ask?: string): Answer => {
  const f = ORACLES[fam];
  if (!f) throw new Error(`no oracle for ${fam}`);
  return f(p, ask);
};
