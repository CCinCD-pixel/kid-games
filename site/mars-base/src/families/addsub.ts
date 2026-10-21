/** Two-digit addition / subtraction, column forms and part–whole comparison (加法牌 C2 / 减法牌 C3 + warm-ups). Spec §4.4. */
import type { FamilyImpl } from '../app/types';
import { colAddNoCarry, colSubAbs, needsBorrow, needsCarry, ones, tens } from './shared/arith';
import { until } from './shared/util';

interface AB { a: number; b: number }
const addFeatures = (p: AB) => ({ size: p.a + p.b, carry: needsCarry(p.a, p.b), cross: needsCarry(p.a, p.b), zero: ones(p.a) === 0 || ones(p.b) === 0 });
const subFeatures = (p: AB) => ({ size: p.a, carry: needsBorrow(p.a, p.b), cross: needsBorrow(p.a, p.b), zero: ones(p.a) === 0 || ones(p.b) === 0 });
const addBug = (p: AB, cls: string) => (cls === 'noCarry' ? colAddNoCarry(p.a, p.b) : cls === 'countOnInclusive' ? p.a + p.b - 1 : cls === 'opReversed' ? p.a - p.b : null);
const subBug = (p: AB, cls: string) => (cls === 'smallerFromLarger' ? colSubAbs(p.a, p.b) : cls === 'opReversed' ? p.a + p.b : null);
const addPrompt = (p: AB) => ({ big: `${p.a} + ${p.b} = □` });
const subPrompt = (p: AB) => ({ big: `${p.a} − ${p.b} = □` });

const addTens: FamilyImpl<AB> = {
  gen(rng, c) {
    let a: number; let b: number;
    if (c.band === 1) { ({ a, b } = until(() => ({ a: 10 * rng.int(1, 8), b: 10 * rng.int(1, 8) }), (x) => x.a + x.b <= 90)); }
    else { ({ a, b } = until(() => ({ a: rng.int(11, 89), b: 10 * rng.int(1, 8) }), (x) => x.a + x.b <= 99 && ones(x.a) !== 0)); }
    return { params: { a, b }, answer: a + b };
  },
  features: addFeatures, bug: addBug, prompt: addPrompt,
};
const addCarry1: FamilyImpl<AB> = {
  gen(rng, c) {
    const p = until(() => ({ a: (c.band === 1 ? rng.int(1, 3) : rng.int(4, 8)) * 10 + rng.int(2, 9), b: rng.int(2, 9) }), (x) => ones(x.a) + x.b >= 10 && x.a + x.b <= 99);
    return { params: p, answer: p.a + p.b };
  },
  features: addFeatures, bug: addBug, prompt: addPrompt,
};
const add2d2d: FamilyImpl<AB> = {
  gen(rng, c) {
    const p = until(() => ({ a: rng.int(11, 88), b: rng.int(11, 88) }), (x) => {
      const s = x.a + x.b; const cy = ones(x.a) + ones(x.b) >= 10;
      if (s > 99) return false;
      if (c.band === 1) return !cy;
      if (ones(x.a) + ones(x.b) < 11) return false;
      return c.band !== 3 || s >= 80;
    });
    return { params: p, answer: p.a + p.b };
  },
  features: addFeatures, bug: addBug, prompt: addPrompt,
};
const addCompensate: FamilyImpl<AB> = {
  gen(rng, c) {
    const p = until(() => ({ a: rng.int(12, 79), b: rng.int(1, c.band === 1 ? 3 : 6) * 10 + rng.pick([8, 9]) }), (x) => x.a + x.b <= 99 && ones(x.a) + ones(x.b) >= 10);
    return { params: p, answer: p.a + p.b };
  },
  features: addFeatures, bug: addBug, prompt: addPrompt,
};

const subTens: FamilyImpl<AB> = {
  gen(rng, c) {
    let a: number; let b: number;
    if (c.band === 1) { a = 10 * rng.int(3, 9); b = 10 * rng.int(1, a / 10 - 1); }
    else { ({ a, b } = until(() => ({ a: rng.int(31, 99), b: 10 * rng.int(1, 8) }), (x) => x.b < x.a - ones(x.a) && ones(x.a) !== 0)); }
    return { params: { a, b }, answer: a - b };
  },
  features: subFeatures, bug: subBug, prompt: subPrompt,
};
const subBorrow1: FamilyImpl<AB> = {
  gen(rng, c) {
    const p = until(() => ({ a: (c.band === 1 ? rng.int(2, 4) : rng.int(5, 9)) * 10 + rng.int(0, 7), b: rng.int(2, 9) }), (x) => ones(x.a) < x.b);
    return { params: p, answer: p.a - p.b };
  },
  features: subFeatures, bug: subBug, prompt: subPrompt,
};
const subThinkAdd: FamilyImpl<AB> = {
  gen(rng, c) {
    const p = c.band === 1
      ? until(() => { const b = rng.int(21, 89); return { a: b + rng.int(2, 9), b }; }, (x) => x.a <= 99 && ones(x.a) < ones(x.b))
      : until(() => { const a = rng.int(51, 99); return { a, b: a - rng.int(10, 40) }; }, (x) => ones(x.a) < ones(x.b) && x.b >= 11);
    return { params: p, answer: p.a - p.b };
  },
  features: subFeatures, bug: subBug, prompt: subPrompt,
};
const sub2d2d: FamilyImpl<AB> = {
  gen(rng, c) {
    const p = until(() => { const a = rng.int(31, 99); return { a, b: rng.int(11, a - 2) }; }, (x) => {
      const bw = ones(x.a) < ones(x.b);
      if (c.band === 1 && bw) return false;
      if (c.band >= 2 && !bw) return false;
      if (c.band === 3 && x.a - x.b >= 20) return false;
      return x.b >= 11 && tens(x.b) !== 0;
    });
    return { params: p, answer: p.a - p.b };
  },
  features: subFeatures, bug: subBug, prompt: subPrompt,
};
const subCompensate: FamilyImpl<AB> = {
  gen(rng) {
    const p = until(() => { const b = rng.int(1, 6) * 10 + rng.pick([8, 9]); return { a: rng.int(b + 3, 99), b }; }, (x) => ones(x.a) < ones(x.b));
    return { params: p, answer: p.a - p.b };
  },
  features: subFeatures, bug: subBug, prompt: subPrompt,
};

const colAdd: FamilyImpl<AB> = {
  gen(rng, c) {
    const p = until(() => (c.band === 1 ? { a: rng.int(11, 60), b: rng.int(11, 38) } : { a: rng.int(25, 70), b: rng.int(15, 40) }),
      (x) => needsCarry(x.a, x.b) && x.a + x.b <= 99 && (c.band === 1 || x.a + x.b >= 60));
    const s = p.a + p.b;
    return { params: p, answer: [s % 10, Math.floor(s / 10)] };
  },
  features: addFeatures,
  bug: (p, cls) => (cls === 'noCarry' ? [colAddNoCarry(p.a, p.b) % 10, Math.floor(colAddNoCarry(p.a, p.b) / 10)] : null),
  prompt: (p) => ({ big: `${p.a} + ${p.b}` }),
};
const colSub: FamilyImpl<AB> = {
  gen(rng, c) {
    const p = until(() => { const a = rng.int(c.band === 1 ? 31 : 51, 99); return { a, b: rng.int(11, a - 10) }; }, (x) => needsBorrow(x.a, x.b) && x.a - x.b >= 10);
    const s = p.a - p.b;
    return { params: p, answer: [s % 10, Math.floor(s / 10)] };
  },
  features: subFeatures,
  bug: (p, cls) => (cls === 'smallerFromLarger' ? [colSubAbs(p.a, p.b) % 10, Math.floor(colSubAbs(p.a, p.b) / 10)] : null),
  prompt: (p) => ({ big: `${p.a} − ${p.b}` }),
};

interface Rel { form: 'diff' | 'findBig' | 'findSmallMore'; big: number; small: number; d: number }
const relCompare: FamilyImpl<Rel> = {
  gen(rng, c) {
    const { x, y } = until(() => ({ x: rng.int(25, 95), y: rng.int(12, 90) }), (v) => Math.abs(v.x - v.y) >= 4 && v.x !== v.y);
    const big = Math.max(x, y); const small = Math.min(x, y); const d = big - small;
    const form = c.band === 1 ? 'diff' : c.band === 2 ? 'findBig' : 'findSmallMore';
    const p: Rel = { form, big, small, d };
    return { params: p, answer: form === 'diff' ? d : form === 'findBig' ? big : small };
  },
  features: (p) => ({ size: p.big, carry: needsBorrow(p.big, p.small), cross: needsBorrow(p.big, p.small), zero: false }),
  bug: (p, cls) => (cls !== 'keywordOp' ? (cls === 'opReversed' ? (p.form === 'diff' ? p.big + p.small : p.form === 'findBig' ? p.small - p.d : p.big + p.d) : null)
    : p.form === 'findSmallMore' ? p.big + p.d : p.form === 'findBig' ? p.small - p.d : null),
  prompt: (p) => (p.form === 'diff' ? { big: `大的 ${p.big}，小的 ${p.small}，多多少？` } : p.form === 'findBig' ? { big: `小的 ${p.small}，大的比它多 ${p.d}，大的是几？` } : { big: `大的 ${p.big}，小的比它少 ${p.d}，小的是几？` }),
};

export const ADDSUB: Record<string, FamilyImpl<any>> = {
  'add.tens': addTens, 'add.carry1': addCarry1, 'add.2d2d': add2d2d, 'add.compensate': addCompensate,
  'sub.tens': subTens, 'sub.borrow1': subBorrow1, 'sub.thinkAdd': subThinkAdd, 'sub.2d2d': sub2d2d, 'sub.compensate': subCompensate,
  'col.add': colAdd, 'col.sub': colSub, 'rel.compare': relCompare,
};
