/** Equal groups, arrays, skip counting (生产线 P1/P2). Spec §4.2, §4.4. Products ≤ 100. */
import type { FamilyImpl } from '../app/types';
import { until } from './shared/util';

interface Groups { n: number; k: number }
const groups: FamilyImpl<Groups> = {
  asks: ['total', 'count', 'size'],
  gen(rng, c) {
    const pool = c.knobs.n;
    const n = pool?.length ? rng.pick(pool) : c.band === 1 ? rng.pick([2, 3, 5, 10]) : c.band === 2 ? rng.pick([3, 4, 6]) : rng.pick([6, 7, 8, 9]);
    const k = c.band === 3 ? rng.int(3, 9) : c.band === 2 ? rng.int(2, 7) : rng.int(2, n === 10 ? 5 : n === 2 ? 8 : 6);
    return { params: { n, k }, answer: c.ask === 'count' ? k : c.ask === 'size' ? n : n * k };
  },
  features: (p) => ({ size: p.n * p.k, carry: false, cross: p.n * p.k >= 10, zero: false, loose: p.n === 10 ? 0 : p.n }),
  bug: (p, cls, ask) => (cls === 'mulAsAdd' && (!ask || ask === 'total') ? p.n + p.k : null),
  prompt: (p, ask) => (ask === 'count' ? { big: `${p.n * p.k} 颗，每舱 ${p.n} 颗，几舱？` } : ask === 'size' ? { big: `${p.n * p.k} 颗，${p.k} 舱，每舱几颗？` } : { big: `${p.k} 舱，每舱 ${p.n} 颗` }),
};

const write: FamilyImpl<Groups> = {
  asks: ['sum', 'times'],
  gen(rng, c) {
    const n = rng.int(2, c.band === 1 ? 6 : 9); const k = rng.int(2, 5);
    return { params: { n, k }, answer: c.ask === 'sum' ? [n, n * k] : [n, k] };
  },
  features: (p) => ({ size: p.n * p.k, carry: false, cross: p.n * p.k >= 10, zero: false }),
  bug: (p, cls, ask) => (cls === 'mulAsAdd' && ask !== 'sum' ? [p.n, p.n + p.k] : null),
  prompt: (p, ask) => (ask === 'sum' ? { big: `${p.k} 舱，每舱 ${p.n} 颗：连加` } : { big: `${p.k} 个 ${p.n}：写成乘法` }),
};

interface EqP { sizes: number[] }
const equalCheck: FamilyImpl<EqP> = {
  gen(rng) {
    const n = rng.int(2, 6); const k = rng.int(3, 5);
    const equal = rng.chance(0.5);
    const sizes = Array.from({ length: k }, () => n);
    if (!equal) { const i = rng.int(0, k - 1); sizes[i] = n + rng.pick([-1, 1, 2]); if (sizes[i] < 1) sizes[i] = n + 1; }
    const mn = Math.min(...sizes);
    return { params: { sizes }, answer: equal ? [1, n, k] : [0, sizes.reduce((a, x) => a + x - mn, 0)] };
  },
  features: (p) => ({ size: p.sizes.reduce((a, x) => a + x, 0), carry: false, cross: false, zero: false }),
  prompt: () => ({ big: '每舱一样多吗？' }),
};

interface SkipP { n: number; k: number }
const skip: FamilyImpl<SkipP> = {
  gen(rng, c) {
    const n = c.band === 1 ? rng.pick([2, 5, 10]) : c.band === 2 ? rng.pick([3, 4]) : rng.pick([6, 7, 8, 9]);
    const k = c.band === 3 ? rng.int(3, 8) : c.band === 2 ? rng.int(3, 7) : rng.int(3, 8);
    return { params: { n, k }, answer: n * k };
  },
  features: (p) => ({ size: p.n * p.k, carry: false, cross: p.n * p.k >= 10, zero: false }),
  bug: (p, cls) => (cls === 'offByStep' ? p.n * (p.k + 1) : cls === 'mulAsAdd' ? p.n + p.k : null),
  prompt: (p) => ({ big: `每次跳 ${p.n}，跳 ${p.k} 次` }),
};

interface Arr { rows: number; cols: number }
const array: FamilyImpl<Arr> = {
  asks: ['total', 'cols'],
  gen(rng, c) {
    const rows = rng.int(2, c.band === 1 ? 5 : 6); const cols = c.band === 1 ? rng.int(2, 6) : rng.pick([3, 4, 5, 6, 10]);
    return { params: { rows, cols }, answer: c.ask === 'cols' ? cols : rows * cols };
  },
  features: (p) => ({ size: p.rows * p.cols, carry: false, cross: p.rows * p.cols >= 10, zero: false }),
  bug: (p, cls, ask) => (cls === 'mulAsAdd' && ask !== 'cols' ? p.rows + p.cols : null),
  prompt: (p, ask) => (ask === 'cols' ? { big: `${p.rows} 行，一共 ${p.rows * p.cols} 块，几列？` } : { big: `${p.rows} 行 ${p.cols} 列` }),
};

const commute: FamilyImpl<Arr> = {
  gen(rng, c) {
    const p = until(() => ({ rows: rng.int(2, c.band === 1 ? 5 : 8), cols: rng.int(2, c.band === 1 ? 7 : 9) }), (x) => x.rows !== x.cols);
    return { params: p, answer: [0, p.cols, p.rows] };
  },
  features: (p) => ({ size: p.rows * p.cols, carry: false, cross: false, zero: false }),
  prompt: (p) => ({ big: `${p.rows} 行 ${p.cols} 列，转一转` }),
};

interface Miss { n: number; P: number }
const missingFactor: FamilyImpl<Miss> = {
  gen(rng) {
    const n = rng.pick([2, 3, 4, 5, 10]); const k = rng.int(2, n === 10 ? 5 : 6);
    return { params: { n, P: n * k }, answer: k };
  },
  features: (p) => ({ size: p.P, carry: false, cross: p.P >= 10, zero: false }),
  prompt: (p) => ({ big: `每列 ${p.n} 块，一共 ${p.P} 块，几列？` }),
};

interface SplitP { n: number; m: number; k: number }
const splitArr: FamilyImpl<SplitP> = {
  gen(rng, c) {
    const n = rng.int(4, 9); const m = rng.int(3, 6);
    const k = c.band === 1 ? n - 1 : rng.int(2, n - 2);
    return { params: { n, m, k }, answer: [k * m, (n - k) * m, n * m] };
  },
  features: (p) => ({ size: p.n * p.m, carry: false, cross: true, zero: false }),
  bug: (p, cls) => (cls === 'partialDistribute' ? [p.k * p.m, p.n - p.k, p.k * p.m + (p.n - p.k)] : null),
  prompt: (p) => ({ big: `${p.n} 行 ${p.m} 列，拆成 ${p.k} 行 + ${p.n - p.k} 行` }),
};

interface CmpArr { r1: number; c1: number; r2: number; c2: number }
const compareArr: FamilyImpl<CmpArr> = {
  gen(rng, c) {
    const p = until(() => ({ r1: rng.int(2, 8), c1: rng.int(2, 8), r2: rng.int(2, 8), c2: rng.int(2, 8) }), (x) => {
      const d = Math.abs(x.r1 * x.c1 - x.r2 * x.c2);
      return c.band === 1 ? d >= 8 : d <= 4 && (d > 0 || rng.chance(0.25));
    });
    const a = p.r1 * p.c1; const b = p.r2 * p.c2;
    return { params: p, answer: [a > b ? 1 : a < b ? 2 : 0, Math.max(a, b)] };
  },
  features: (p) => ({ size: Math.max(p.r1 * p.c1, p.r2 * p.c2), carry: false, cross: false, zero: false }),
  prompt: () => ({ big: '哪块板大？' }),
};

export const MUL: Record<string, FamilyImpl<any>> = {
  'mul.groups': groups, 'mul.write': write, 'mul.equalCheck': equalCheck, 'mul.skip': skip, 'mul.array': array,
  'mul.commute': commute, 'mul.missingFactor': missingFactor, 'mul.split': splitArr, 'mul.compareArr': compareArr,
};
