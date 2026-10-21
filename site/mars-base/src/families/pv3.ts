/** Three-digit place value + hundreds (千晶大仓 K1/K2). Spec §4.2, §4.4. */
import type { FamilyImpl } from '../app/types';
import { decisivePlace, dropZeros, hund, ones, sym, tens } from './shared/arith';
import { until } from './shared/util';

const digits3 = (n: number) => [hund(n), tens(n), ones(n)];
const hasZero = (n: number) => digits3(n).includes(0);

interface Pack { rods: number; loose: number }
const pack: FamilyImpl<Pack> = {
  gen(rng, c) {
    const p = { rods: rng.int(10, 19), loose: c.band === 1 ? 0 : rng.int(1, 9) };
    return { params: p, answer: 10 * p.rods + p.loose };
  },
  features: (p) => ({ size: 10 * p.rods + p.loose, carry: true, cross: true, zero: p.loose === 0, loose: p.loose }),
  prompt: (p) => ({ big: `${p.rods} 根棒${p.loose ? `，${p.loose} 颗` : ''}` }),
};

interface Read3 { h: number; t: number; o: number }
const read: FamilyImpl<Read3> = {
  gen(rng, c) {
    let p: Read3;
    if (c.band === 1) p = { h: rng.int(1, 9), t: rng.int(1, 9), o: rng.int(1, 9) };
    else if (c.band === 2) {
      const z = rng.pick(['mid', 'mid', 'end', 'end', 'both'] as const);
      p = { h: rng.int(1, 9), t: z === 'mid' || z === 'both' ? 0 : rng.int(1, 9), o: z === 'end' || z === 'both' ? 0 : rng.int(1, 9) };
      if (z === 'mid') p.o = rng.int(1, 9);
      if (z === 'end') p.t = rng.int(1, 9);
    } else {
      p = until(() => { const t = rng.chance(0.5) ? rng.int(10, 14) : rng.int(0, 9); return { h: rng.int(1, 8), t, o: t >= 10 ? rng.int(0, 9) : rng.int(10, 19) }; }, (x) => 100 * x.h + 10 * x.t + x.o <= 999);
    }
    return { params: p, answer: 100 * p.h + 10 * p.t + p.o };
  },
  features: (p) => ({ size: 100 * p.h + 10 * p.t + p.o, carry: false, cross: p.t >= 10 || p.o >= 10, zero: p.t === 0 || p.o === 0, loose: p.o }),
  bug(p, cls) {
    const n = 100 * p.h + 10 * p.t + p.o;
    if (cls === 'zeroOmit') return n === dropZeros(n) ? null : dropZeros(n);
    if (cls === 'pvConcat') return p.t >= 10 || p.o >= 10 ? Number(`${p.h}${p.t}${p.o}`) : null;
    if (cls === 'unitAsOne') return p.h + p.t + p.o;
    return null;
  },
  prompt: () => ({ big: '一共几颗？' }),
};

interface N { n: number }
const nonZero = (rng: any) => until(() => rng.int(111, 999), (x) => !hasZero(x));
const withZero = (rng: any) => until(() => rng.int(101, 990), (x) => hasZero(x));
const build: FamilyImpl<N> = {
  gen(rng, c) { const n = c.band === 1 ? nonZero(rng) : withZero(rng); return { params: { n }, answer: n }; },
  features: (p) => ({ size: p.n, carry: false, cross: false, zero: hasZero(p.n), loose: 0 }),
  prompt: (p) => ({ big: `装 ${p.n} 颗` }),
};
const counter: FamilyImpl<N> = {
  gen(rng, c) { const n = c.band === 1 ? nonZero(rng) : withZero(rng); return { params: { n }, answer: n }; },
  features: (p) => ({ size: p.n, carry: false, cross: false, zero: hasZero(p.n), loose: 0 }),
  prompt: (p) => ({ big: `拨出 ${p.n}` }),
};
const dictation: FamilyImpl<N> = {
  gen(rng, c) {
    const n = c.band === 1 ? nonZero(rng) : withZero(rng);
    return { params: { n }, answer: n };
  },
  features: (p) => ({ size: p.n, carry: false, cross: false, zero: hasZero(p.n) }),
  bug(p, cls) { return cls === 'zeroOmit' ? (dropZeros(p.n) === p.n ? null : dropZeros(p.n)) : cls === 'extraZero' ? p.n * 10 : null; },
  prompt: () => ({ big: '听一听，写数' }),
};

interface Cmp3 { a: number; b: number }
const compare: FamilyImpl<Cmp3> = {
  gen(rng, c) {
    let a: number; let b: number;
    if (c.band === 1) { ({ a, b } = until(() => ({ a: rng.int(100, 999), b: rng.int(100, 999) }), (x) => hund(x.a) !== hund(x.b))); }
    else if (c.band === 2) { a = rng.int(100, 999); b = until(() => hund(a) * 100 + rng.int(0, 99), (y) => y !== a && tens(y) !== tens(a)); }
    else { a = until(() => rng.int(102, 987), (x) => new Set(String(x)).size === 3 && ones(x) !== 0); const d = String(a).split(''); b = Number(d[0] + d[2] + d[1]); }
    return { params: { a, b }, answer: { sym: sym(a, b), digit: decisivePlace(a, b) } };
  },
  features: (p) => ({ size: Math.max(p.a, p.b), carry: false, cross: hund(p.a) === hund(p.b), zero: false }),
  bug(p, cls) {
    if (cls === 'cmpWrongDigit') { const s = sym(ones(p.a), ones(p.b)); return s === sym(p.a, p.b) || s === '=' ? null : s; }
    if (cls === 'digitReversal') { const r = (n: number) => Number(String(n).split('').reverse().join('')); const s = sym(r(p.a), r(p.b)); return s === sym(p.a, p.b) ? null : s; }
    return null;
  },
  prompt: (p) => ({ big: `${p.a} ○ ${p.b}` }),
};

interface Order { xs: number[] }
const order: FamilyImpl<Order> = {
  gen(rng, c) {
    const xs = c.band === 1
      ? until(() => [rng.int(100, 999), rng.int(100, 999), rng.int(100, 999)], (v) => new Set(v.map(hund)).size === 3)
      : until(() => { const h = rng.int(1, 9) * 100; return [h + rng.int(0, 99), h + rng.int(0, 99), h + rng.int(0, 99)]; }, (v) => new Set(v.map((x) => x)).size === 3 && new Set(v.map(tens)).size === 3);
    return { params: { xs }, answer: [...xs].sort((a, b) => a - b) };
  },
  features: (p) => ({ size: Math.max(...p.xs), carry: false, cross: new Set(p.xs.map(hund)).size < 3, zero: false }),
  prompt: () => ({ big: '从小到大排队' }),
};

interface StepP { a: number; b: number; op: '+' | '-' }
const STEP_POOL: Record<number, [number, number, number][]> = { 1: [], 2: [], 3: [] };
for (let n = 100; n <= 1000; n++) for (const d of [1, 10, 100]) for (const sg of [1, -1]) {
  const m = n + sg * d; if (m < 100 || m > 1000) continue;
  let changed = 0; for (let p = d * 10; p <= 1000; p *= 10) if (Math.floor(n / p) !== Math.floor(m / p)) changed++;
  STEP_POOL[Math.min(3, changed + 1)].push([n, d, sg]);
}
const step: FamilyImpl<StepP> = {
  gen(rng, c) {
    const [n, d, sg] = rng.pick(STEP_POOL[c.band]);
    return { params: { a: n, b: d, op: sg > 0 ? '+' : '-' }, answer: n + sg * d };
  },
  features: (p) => { const r = p.op === '+' ? p.a + p.b : p.a - p.b; return { size: Math.max(p.a, r), carry: false, cross: Math.floor(p.a / 100) !== Math.floor(r / 100) || tens(p.a) !== tens(r), zero: ones(p.a) === 0 }; },
  bug(p, cls) { const r = p.op === '+' ? p.a + p.b : p.a - p.b; return cls === 'offByOne' ? r + (p.op === '+' ? 1 : -1) : cls === 'offByTen' ? r + (p.op === '+' ? 10 : -10) : null; },
  prompt: (p) => ({ big: `${p.a} ${p.op === '+' ? '+' : '−'} ${p.b}` }),
};

interface AddH { a: number; b: number; op: '+' | '-' }
const addHund: FamilyImpl<AddH> = {
  gen(rng, c) {
    const op = rng.pick(['+', '-'] as const);
    const p = until(() => (c.band === 1 ? { a: 100 * rng.int(1, 9), b: 100 * rng.int(1, 9) } : { a: 10 * rng.int(11, 98), b: 10 * rng.int(1, 9) }), (x) => {
      const res = op === '+' ? x.a + x.b : x.a - x.b;
      if (res < 100 || res > 1000) return false;
      const cross = Math.floor(x.a / 100) !== Math.floor(res / 100) && c.band > 1;
      if (c.band === 2 && cross) return false;
      if (c.band === 3 && !cross) return false;
      return !(c.band > 1 && x.a % 100 === 0);
    });
    return { params: { ...p, op }, answer: op === '+' ? p.a + p.b : p.a - p.b };
  },
  features: (p) => { const r = p.op === '+' ? p.a + p.b : p.a - p.b; return { size: Math.max(p.a, r), carry: false, cross: p.a % 100 !== 0 && Math.floor(p.a / 100) !== Math.floor(r / 100), zero: ones(p.a) === 0 }; },
  bug(p, cls) { const r = p.op === '+' ? p.a + p.b : p.a - p.b; return cls === 'offByTen' ? r + (p.op === '+' ? 10 : -10) : cls === 'noCarry' ? (p.op === '+' ? (tens(p.a) + tens(p.b)) % 10 * 10 + (Math.floor(p.a / 100) + Math.floor(p.b / 100)) % 10 * 100 + ones(p.a) : null) : null; },
  prompt: (p) => ({ big: `${p.a} ${p.op === '+' ? '+' : '−'} ${p.b}` }),
};

interface SkipP { start: number; step: number; k: number }
const skip: FamilyImpl<SkipP> = {
  gen(rng, c) {
    const p = until(() => {
      const st = rng.pick([10, 100]);
      const k = rng.int(3, 7);
      const start = c.band === 1 ? st * rng.int(0, 3) : st * rng.int(1, 60 / (st / 10));
      return { start, step: st, k };
    }, (x) => x.start + x.step * x.k <= 1000 && (c.band === 1 || Math.floor(x.start / 100) !== Math.floor((x.start + x.step * x.k) / 100)));
    return { params: p, answer: p.start + p.step * p.k };
  },
  features: (p) => ({ size: p.start + p.step * p.k, carry: false, cross: Math.floor(p.start / 100) !== Math.floor((p.start + p.step * p.k) / 100), zero: p.start === 0 }),
  bug(p, cls) { const r = p.start + p.step * p.k; return cls === 'offByTen' ? r + 10 : cls === 'offByStep' ? r + p.step : null; },
  prompt: (p) => ({ big: `${p.start}，每次 +${p.step}，跳 ${p.k} 次` }),
};

const round: FamilyImpl<N> = {
  gen(rng, c) {
    const n = until(() => rng.int(101, 999), (x) => {
      const r = x % 100;
      if (r === 50) return false;
      return c.band === 1 ? r <= 36 || r >= 64 : (r >= 38 && r <= 46) || (r >= 54 && r <= 62);
    });
    return { params: { n }, answer: Math.round(n / 100) * 100 };
  },
  features: (p) => ({ size: p.n, carry: false, cross: p.n % 100 >= 50, zero: false }),
  prompt: (p) => ({ big: `${p.n} 大约几百？` }),
};

export const PV3: Record<string, FamilyImpl<any>> = {
  'pv3.pack': pack, 'pv3.read': read, 'pv3.build': build, 'pv3.counter': counter, 'pv3.dictation': dictation,
  'pv3.compare': compare, 'pv3.order': order, 'pv3.step': step, 'pv3.addHund': addHund, 'pv3.skip': skip, 'pv3.round': round,
};
