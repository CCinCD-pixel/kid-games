/** Two-digit place value (数位牌 C1 + warm-ups): read, build, compare, step, split. Spec §4.4. */
import type { FamilyImpl } from '../app/types';
import { decisivePlace, ones, rev2, sym, tens } from './shared/arith';
import { until } from './shared/util';

interface Read { t: number; o: number }
const read: FamilyImpl<Read> = {
  gen(rng, c) {
    if (c.band === 1) { const t = rng.int(1, 9); const o = rng.int(0, 9); return { params: { t, o }, answer: 10 * t + o }; }
    const p = until(() => ({ t: rng.int(1, 8), o: rng.int(10, 19) }), (x) => 10 * x.t + x.o <= 99);
    return { params: p, answer: 10 * p.t + p.o };
  },
  features: (p) => ({ size: 10 * p.t + p.o, carry: false, cross: p.o >= 10, zero: p.o === 0, loose: p.o }),
  bug(p, cls) {
    if (cls === 'digitReversal') return p.o >= 10 || p.o === 0 ? null : rev2(10 * p.t + p.o);
    if (cls === 'pvConcat') return p.o >= 10 ? Number(`${p.t}${p.o}`) : null;
    if (cls === 'unitAsOne') return p.t + p.o;
    return null;
  },
  prompt: () => ({ big: '一共几颗？' }),
};

interface Build { n: number }
const build: FamilyImpl<Build> = {
  gen(rng, c) {
    const n = c.band >= 2 && rng.chance(0.5) ? 10 * rng.int(2, 9) : until(() => rng.int(21, c.band === 1 ? 59 : 99), (x) => c.band >= 2 || ones(x) !== 0);
    return { params: { n }, answer: n };
  },
  features: (p) => ({ size: p.n, carry: false, cross: false, zero: ones(p.n) === 0, loose: 0 }),
  prompt: (p) => ({ big: `装 ${p.n} 颗` }),
};

interface Cmp { a: number; b: number }
const compare: FamilyImpl<Cmp> = {
  gen(rng, c) {
    let a: number; let b: number;
    if (c.band === 1) { ({ a, b } = until(() => ({ a: rng.int(10, 99), b: rng.int(10, 99) }), (x) => tens(x.a) !== tens(x.b))); }
    else if (c.band === 2) { a = rng.int(10, 99); b = until(() => tens(a) * 10 + rng.int(0, 9), (y) => y !== a); }
    else { a = until(() => rng.int(12, 98), (x) => tens(x) !== ones(x) && ones(x) !== 0); b = rev2(a); }
    return { params: { a, b }, answer: { sym: sym(a, b), digit: decisivePlace(a, b) } };
  },
  features: (p) => ({ size: Math.max(p.a, p.b), carry: false, cross: tens(p.a) === tens(p.b), zero: false }),
  bug(p, cls) {
    if (cls === 'digitReversal') { const s = sym(rev2(p.a), rev2(p.b)); return s === sym(p.a, p.b) ? null : s; }
    if (cls === 'cmpWrongDigit') { const s = sym(ones(p.a), ones(p.b)); return s === sym(p.a, p.b) || s === '=' ? null : s; }
    return null;
  },
  prompt: (p) => ({ big: `${p.a} ○ ${p.b}` }),
};

interface Step { from: number; d: number }
const STEP_BANDS: Record<number, (rng: any) => Step> = {
  1: (rng) => (rng.chance(0.5) ? { from: rng.int(11, 88), d: rng.chance(0.5) ? 10 : -10 } : (() => { const from = until(() => rng.int(11, 88), (x) => ones(x) >= 1 && ones(x) <= 8); return { from, d: rng.chance(0.5) ? 1 : -1 }; })()),
  2: (rng) => { const up = rng.chance(0.5); return rng.chance(0.6) ? { from: rng.int(2, 8) * 10 + (up ? 9 : 0), d: up ? 1 : -1 } : { from: rng.int(21, 79), d: rng.chance(0.5) ? 10 : -10 }; },
  3: (rng) => { const k = rng.int(0, 3); return k === 0 ? { from: 99, d: 1 } : k === 1 ? { from: 90, d: 10 } : k === 2 ? { from: 100, d: rng.chance(0.5) ? -1 : -10 } : { from: rng.int(2, 9) * 10 + 9, d: 1 }; },
};
const step: FamilyImpl<Step> = {
  gen(rng, c) {
    const p = STEP_BANDS[c.band](rng);
    return { params: p, answer: p.from + p.d };
  },
  features: (p) => ({ size: Math.max(p.from, p.from + p.d), carry: false, cross: Math.floor(p.from / 10) !== Math.floor((p.from + p.d) / 10), zero: ones(p.from) === 0 }),
  bug(p, cls) { return cls === 'offByTen' ? p.from + p.d + (p.d > 0 ? 10 : -10) : cls === 'offByOne' ? p.from + p.d + (p.d > 0 ? 1 : -1) : null; },
  prompt: (p) => ({ big: `${p.from} ${p.d > 0 ? '+' : '−'} ${Math.abs(p.d)}` }),
};

interface Split { n: number; k: number }
const split: FamilyImpl<Split> = {
  gen(rng, c) {
    const j = c.band - 1;
    const n = until(() => rng.int(21, 99), (x) => tens(x) - j >= 1);
    const k = tens(n) - j;
    return { params: { n, k }, answer: n - 10 * k };
  },
  features: (p) => ({ size: p.n, carry: false, cross: tens(p.n) !== p.k, zero: ones(p.n) === 0, loose: ones(p.n) }),
  bug: (p, cls) => (cls === 'canonicalOnly' && tens(p.n) !== p.k ? ones(p.n) : null),
  prompt: (p) => ({ big: `${p.n} = ${p.k} 个十 + □ 个一` }),
};

export const PV2: Record<string, FamilyImpl<any>> = { 'pv2.read': read, 'pv2.build': build, 'pv2.compare': compare, 'pv2.step': step, 'pv2.split': split };
