/** 喘息 (breather) open orders: only "what you built matches what you said" is checked — a response can be incomplete, never wrong. */
import type { FamilyImpl } from '../app/types';
import { hund, ones, sym, tens } from './shared/arith';

type R = Record<string, any> | null | undefined;
const rec = (r: unknown): R => (r && typeof r === 'object' && !Array.isArray(r) ? (r as R) : null);

interface Pv3 { rule: 'any' | 'zeroInside' | 'over500' | 'under300' }
const RULES: Record<Pv3['rule'], (n: number) => boolean> = {
  any: (n) => n >= 100 && n <= 999,
  zeroInside: (n) => n >= 100 && n <= 999 && (tens(n) === 0 || ones(n) === 0),
  over500: (n) => n > 500 && n <= 999,
  under300: (n) => n >= 100 && n < 300,
};
const openPv3: FamilyImpl<Pv3> = {
  gen(rng) { return { params: { rule: rng.pick(['any', 'zeroInside', 'over500', 'under300'] as const) }, answer: 0 }; },
  features: () => ({ size: 999, carry: false, cross: false, zero: true }),
  prompt: (p) => ({ big: p.rule === 'zeroInside' ? '装一个带 0 的数' : p.rule === 'over500' ? '装一个比 500 大的数' : p.rule === 'under300' ? '装一个比 300 小的数' : '自己选一个货单' }),
  open: (p, r) => { const x = rec(r); return !!x && Number.isInteger(x.built) && x.built === x.said && RULES[p.rule](x.built); },
};

interface Cmp { rel: '>' | '<' }
const openPv3cmp: FamilyImpl<Cmp> = {
  gen(rng) { return { params: { rel: rng.pick(['>', '<'] as const) }, answer: 0 }; },
  features: () => ({ size: 999, carry: false, cross: false, zero: false }),
  prompt: (p) => ({ big: `装两仓，左边${p.rel === '>' ? '比' : '没有'}右边多` }),
  open: (p, r) => { const x = rec(r); return !!x && x.a >= 100 && x.b >= 100 && x.a <= 999 && x.b <= 999 && sym(x.a, x.b) === p.rel && hund(x.a) + hund(x.b) > 0; },
};

interface Grp { total: number }
const openGroups: FamilyImpl<Grp> = {
  gen(rng) { return { params: { total: rng.pick([12, 16, 18, 20, 24]) }, answer: 0 }; },
  features: (p) => ({ size: p.total, carry: false, cross: false, zero: false }),
  prompt: (p) => ({ big: `${p.total} 颗，分成一样多的几舱` }),
  open: (p, r) => { const x = rec(r); return !!x && x.n >= 2 && x.k >= 2 && x.n * x.k === p.total; },
};

interface Arrs { total: number; rule: string }
/** All unordered factor pairs of `total` inside a 10×10 board. */
export const factorPairsIn10x10 = (total: number): [number, number][] => {
  const out: [number, number][] = [];
  for (let a = 1; a <= 10; a++) for (let b = a; b <= 10; b++) if (a * b === total && a > 1) out.push([a, b]);
  return out;
};
const openArrays: FamilyImpl<Arrs> = {
  gen() { return { params: { total: 24, rule: 'unorderedPairsIn10x10' }, answer: 0 }; },
  features: () => ({ size: 24, carry: false, cross: false, zero: false }),
  prompt: (p) => ({ big: `用 ${p.total} 块板，摆出所有长方形` }),
  open: (p, r) => {
    const x = rec(r); if (!x || !Array.isArray(x.pairs)) return false;
    const want = factorPairsIn10x10(p.total).map(([a, b]) => `${a}x${b}`).sort().join(',');
    const got = [...new Set((x.pairs as [number, number][]).map(([a, b]) => `${Math.min(a, b)}x${Math.max(a, b)}`))].sort().join(',');
    return want === got;
  },
};

export const OPEN: Record<string, FamilyImpl<any>> = { 'open.pv3': openPv3, 'open.pv3cmp': openPv3cmp, 'open.groups': openGroups, 'open.arrays': openArrays };
