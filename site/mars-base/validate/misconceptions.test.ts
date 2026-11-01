/** V3: misconception bots → classifier, hand-authored golden vectors (V3b), collisions, class coverage, demo frames. Spec §9. */
import { describe, expect, it } from 'vitest';
import { createRng } from '@kit/rng';
import { FAMILIES, META } from '../src/families';
import { classify } from '../src/app/judge';
import { DIAG_CLASSES, bugAnswer, consequence, flatNumbers } from '../src/diag/bugs';
import { NODES } from '../src/app/content';
import { colAddNoCarry, colSubAbs, dropZeros, needsBorrow, needsCarry, ones, rev2, tens } from '../src/families/shared/arith';
import type { DiagClass, GenCtx } from '../src/app/types';

const ctx = (band: number, ask?: string): GenCtx => ({ band, level: 3, rep: 'A', ask, knobs: {} });

// ---- bots written here, independently of the families' bug() (they use only arith helpers)
interface Bot { name: DiagClass; fams: string[]; f: (p: any) => number; applies: (p: any, fam: string, band: number) => boolean }
const BOTS: Bot[] = [
  { name: 'noCarry', fams: ['add.carry1', 'add.2d2d', 'add.compensate'], f: (p) => colAddNoCarry(p.a, p.b), applies: (p) => needsCarry(p.a, p.b) },
  { name: 'smallerFromLarger', fams: ['sub.borrow1', 'sub.thinkAdd', 'sub.2d2d', 'sub.compensate'], f: (p) => colSubAbs(p.a, p.b), applies: (p) => needsBorrow(p.a, p.b) },
  { name: 'digitReversal', fams: ['pv2.read'], f: (p) => rev2(10 * p.t + p.o), applies: (p) => p.o < 10 && p.o !== 0 && p.t !== p.o },
  { name: 'pvConcat', fams: ['pv2.read', 'pv3.read'], f: (p) => Number(`${p.h ?? ''}${p.t}${p.o}`), applies: (p) => p.o >= 10 || p.t >= 10 },
  { name: 'zeroOmit', fams: ['pv3.read'], f: (p) => dropZeros(100 * p.h + 10 * p.t + p.o), applies: (p) => String(100 * p.h + 10 * p.t + p.o).includes('0') },
  { name: 'mulAsAdd', fams: ['mul.groups', 'mul.array'], f: (p) => (p.n !== undefined ? p.n + p.k : p.rows + p.cols), applies: () => true },
  { name: 'keywordOp', fams: ['rel.compare'], f: (p) => (p.form === 'findSmallMore' ? p.big + p.d : p.small - p.d), applies: (p) => p.form !== 'diff' },
  { name: 'canonicalOnly', fams: ['pv2.split'], f: (p) => ones(p.n), applies: (p) => tens(p.n) !== p.k },
  { name: 'unitAsOne', fams: ['pv2.read', 'pv3.read'], f: (p) => (p.h ?? 0) + (p.t ?? 0) + (p.o ?? 0), applies: (p, fam, band) => (fam === 'pv2.read' ? p.o < 10 : band === 1 && p.t < 10 && p.o < 10) },
  { name: 'countOnInclusive', fams: ['add.carry1'], f: (p) => p.a + p.b - 1, applies: () => true },
  ];

describe('V3 misconception bots', () => {
  for (const bot of BOTS.filter((b) => b.name !== 'opReversed')) {
    for (const fam of bot.fams) {
      const f = FAMILIES[fam];
      for (let band = 1; band <= f.bands; band++) {
        it(`${bot.name} on ${fam} b${band}: errs ≥80 %, classified ≥90 %`, () => {
          const rng = createRng(`bot:${bot.name}:${fam}:${band}`);
          let targeted = 0; let wrong = 0; let labelled = 0; let other = 0;
          for (let k = 0; k < 600; k++) {
            const { params, answer } = f.gen(rng, ctx(band, fam === 'mul.groups' ? 'total' : undefined));
            if (!bot.applies(params, fam, band)) continue;
            targeted++;
            const resp = bot.f(params);
            if (resp !== answer) {
              wrong++;
              const c = classify(f, params, resp, fam === 'mul.groups' ? 'total' : undefined);
              if (c.diag === bot.name) labelled++;
              if (c.diag === 'other') other++;
            }
          }
          if (!targeted) return;                       // this bot never applies on that band
          expect(wrong / targeted).toBeGreaterThanOrEqual(0.8);
          expect(labelled / Math.max(1, wrong)).toBeGreaterThanOrEqual(0.9);
          expect(other / Math.max(1, wrong)).toBeLessThanOrEqual(0.02);
        });
      }
    }
  }
});

// ---- V3b: hand-authored golden vectors (3 per class). Predicates are written HERE, not derived from bug().
const D = (x: number) => [Math.floor(x / 10), x % 10];
const CORRECT: Record<string, (p: any) => any> = {
  add: (p) => p.a + p.b, sub: (p) => p.a - p.b, read2: (p) => 10 * p.t + p.o, read3: (p) => 100 * p.h + 10 * p.t + p.o, mul: (p) => p.a * p.b,
  bal: (p) => p.a + p.c - p.d, step: (p) => p.a + p.d, split: (p) => p.n - 10 * p.k, skip: (p) => p.start + p.step * p.k, dict: (p) => p.n,
  cmp: (p) => (p.x > p.y ? '>' : p.x < p.y ? '<' : '='), nl: (p) => p.target, rel: (p) => p.B + p.d, relMore: (p) => p.A - p.d,
};
const PRED: Record<string, (p: any) => any> = {
  noCarry: (p) => ((D(p.a)[0] + D(p.b)[0]) % 10) * 10 + ((D(p.a)[1] + D(p.b)[1]) % 10),
  countOnInclusive: (p) => p.a + p.b - 1,
  smallerFromLarger: (p) => Math.abs(D(p.a)[0] - D(p.b)[0]) * 10 + Math.abs(D(p.a)[1] - D(p.b)[1]),
  digitReversal: (p) => { const c = 10 * p.t + p.o; return D(c)[1] * 10 + D(c)[0]; },
  pvConcat: (p) => Number(String(p.h ?? '') + String(p.t) + String(p.o)),
  zeroOmit: (p) => Number(String(CORRECT.read3(p)).replace(/0/g, '')),
  canonicalOnly: (p) => D(p.n)[1],
  unitAsOne: (p) => (p.h ?? 0) + p.t + p.o,
  mulAsAdd: (p) => p.a + p.b,
  equalAsOperator: (p) => p.a + p.c,
  keywordOp: (p) => (p.more ? p.A + p.d : p.B - p.d),
  extraZero: (p) => p.n * 10,
  offByOne: (p) => CORRECT[p.kind](p) + p.sgn,
  offByTen: (p) => CORRECT[p.kind](p) + 10 * p.sgn,
  offByStep: (p) => CORRECT.skip(p) + p.step * p.sgn,
  opReversed: (p) => (p.kind === 'add' ? p.a - p.b : p.a + p.b),
  partialDistribute: (p) => (p.n - 1) * p.m + 1,
  cmpWrongDigit: (p) => (D(p.x % 100)[1] > D(p.y % 100)[1] ? '>' : '<'),
  logCompress: (p) => Math.round(1000 * Math.log(p.target + 1) / Math.log(1001)),
};
interface Row { cls: string; kind: string; p: any; wrong: any; sgn?: number; fam?: string; fp?: any; ask?: string }
const R = (cls: string, kind: string, p: any, wrong: any, extra: Partial<Row> = {}): Row => ({ cls, kind, p, wrong, ...extra });
const ROWS: Row[] = [
  R('noCarry', 'add', { a: 27, b: 5 }, 22, { fam: 'add.carry1', fp: { a: 27, b: 5 } }), R('noCarry', 'add', { a: 48, b: 36 }, 74, { fam: 'add.2d2d', fp: { a: 48, b: 36 } }), R('noCarry', 'add', { a: 65, b: 28 }, 83, { fam: 'add.carry1', fp: { a: 65, b: 28 } }),
  R('countOnInclusive', 'add', { a: 27, b: 5 }, 31, { fam: 'add.carry1', fp: { a: 27, b: 5 } }), R('countOnInclusive', 'add', { a: 58, b: 6 }, 63, { fam: 'add.carry1', fp: { a: 58, b: 6 } }), R('countOnInclusive', 'add', { a: 39, b: 4 }, 42, { fam: 'add.carry1', fp: { a: 39, b: 4 } }),
  R('smallerFromLarger', 'sub', { a: 42, b: 7 }, 45, { fam: 'sub.borrow1', fp: { a: 42, b: 7 } }), R('smallerFromLarger', 'sub', { a: 83, b: 47 }, 44, { fam: 'sub.2d2d', fp: { a: 83, b: 47 } }), R('smallerFromLarger', 'sub', { a: 51, b: 28 }, 37, { fam: 'sub.2d2d', fp: { a: 51, b: 28 } }),
  R('digitReversal', 'read2', { t: 4, o: 6 }, 64, { fam: 'pv2.read', fp: { t: 4, o: 6 } }), R('digitReversal', 'read2', { t: 7, o: 2 }, 27, { fam: 'pv2.read', fp: { t: 7, o: 2 } }), R('digitReversal', 'read2', { t: 3, o: 8 }, 83, { fam: 'pv2.read', fp: { t: 3, o: 8 } }),
  R('pvConcat', 'read2', { t: 4, o: 13 }, 413, { fam: 'pv2.read', fp: { t: 4, o: 13 } }), R('pvConcat', 'read3', { h: 2, t: 13, o: 5 }, 2135, { fam: 'pv3.read', fp: { h: 2, t: 13, o: 5 } }), R('pvConcat', 'read2', { t: 2, o: 15 }, 215, { fam: 'pv2.read', fp: { t: 2, o: 15 } }),
  R('zeroOmit', 'read3', { h: 3, t: 0, o: 6 }, 36, { fam: 'pv3.read', fp: { h: 3, t: 0, o: 6 } }), R('zeroOmit', 'read3', { h: 5, t: 0, o: 9 }, 59, { fam: 'pv3.read', fp: { h: 5, t: 0, o: 9 } }), R('zeroOmit', 'read3', { h: 7, t: 4, o: 0 }, 74, { fam: 'pv3.read', fp: { h: 7, t: 4, o: 0 } }),
  R('canonicalOnly', 'split', { n: 63, k: 5 }, 3, { fam: 'pv2.split', fp: { n: 63, k: 5 } }), R('canonicalOnly', 'split', { n: 52, k: 3 }, 2, { fam: 'pv2.split', fp: { n: 52, k: 3 } }), R('canonicalOnly', 'split', { n: 84, k: 6 }, 4, { fam: 'pv2.split', fp: { n: 84, k: 6 } }),
  R('unitAsOne', 'read2', { t: 4, o: 6 }, 10, { fam: 'pv2.read', fp: { t: 4, o: 6 } }), R('unitAsOne', 'read3', { h: 3, t: 2, o: 5 }, 10, { fam: 'pv3.read', fp: { h: 3, t: 2, o: 5 } }), R('unitAsOne', 'read2', { t: 5, o: 2 }, 7, { fam: 'pv2.read', fp: { t: 5, o: 2 } }),
  R('mulAsAdd', 'mul', { a: 3, b: 4 }, 7, { fam: 'mul.groups', fp: { n: 4, k: 3 }, ask: 'total' }), R('mulAsAdd', 'mul', { a: 5, b: 6 }, 11, { fam: 'mul.groups', fp: { n: 6, k: 5 }, ask: 'total' }), R('mulAsAdd', 'mul', { a: 4, b: 7 }, 11, { fam: 'mul.array', fp: { rows: 4, cols: 7 } }),
  R('equalAsOperator', 'bal', { a: 3, c: 4, d: 5 }, 7), R('equalAsOperator', 'bal', { a: 8, c: 6, d: 9 }, 14), R('equalAsOperator', 'bal', { a: 12, c: 7, d: 10 }, 19),
  R('keywordOp', 'rel', { B: 43, d: 8 }, 35, { fam: 'rel.compare', fp: { form: 'findBig', big: 51, small: 43, d: 8 } }), R('keywordOp', 'rel', { B: 37, d: 12 }, 25, { fam: 'rel.compare', fp: { form: 'findBig', big: 49, small: 37, d: 12 } }),
  R('keywordOp', 'relMore', { A: 51, d: 8, more: true }, 59, { fam: 'rel.compare', fp: { form: 'findSmallMore', big: 51, small: 43, d: 8 } }),
  R('extraZero', 'dict', { n: 306 }, 3060, { fam: 'pv3.dictation', fp: { n: 306 } }), R('extraZero', 'dict', { n: 450 }, 4500, { fam: 'pv3.dictation', fp: { n: 450 } }), R('extraZero', 'dict', { n: 120 }, 1200, { fam: 'pv3.dictation', fp: { n: 120 } }),
  R('offByOne', 'step', { a: 399, d: 1 }, 401, { sgn: 1, fam: 'pv3.step', fp: { a: 399, b: 1, op: '+' } }), R('offByOne', 'add', { a: 45, b: 9 }, 53, { sgn: -1 }), R('offByOne', 'step', { a: 1000, d: -1 }, 1000, { sgn: 1, fam: 'pv3.step', fp: { a: 1000, b: 1, op: '-' } }),
  R('offByTen', 'step', { a: 340, d: 50 }, 380, { sgn: -1 }), R('offByTen', 'add', { a: 27, b: 5 }, 42, { sgn: 1 }), R('offByTen', 'sub', { a: 42, b: 7 }, 25, { sgn: -1 }),
  R('offByStep', 'skip', { start: 3, step: 3, k: 4 }, 18, { sgn: 1 }), R('offByStep', 'skip', { start: 20, step: 5, k: 2 }, 25, { sgn: -1 }), R('offByStep', 'skip', { start: 0, step: 3, k: 4 }, 15, { sgn: 1, fam: 'mul.skip', fp: { n: 3, k: 4 } }),
  R('opReversed', 'add', { a: 45, b: 10 }, 35, { fam: 'add.tens', fp: { a: 45, b: 10 } }), R('opReversed', 'sub', { a: 64, b: 20 }, 84, { fam: 'sub.tens', fp: { a: 64, b: 20 } }), R('opReversed', 'add', { a: 70, b: 8 }, 62, { fam: 'add.tens', fp: { a: 70, b: 8 } }),
  R('partialDistribute', 'mul', { a: 6, b: 4, n: 6, m: 4 }, 21), R('partialDistribute', 'mul', { a: 7, b: 3, n: 7, m: 3 }, 19), R('partialDistribute', 'mul', { a: 8, b: 5, n: 8, m: 5 }, 36),
  R('cmpWrongDigit', 'cmp', { x: 352, y: 325 }, '<', { fam: 'pv3.compare', fp: { a: 352, b: 325 } }), R('cmpWrongDigit', 'cmp', { x: 706, y: 760 }, '>', { fam: 'pv3.compare', fp: { a: 706, b: 760 } }), R('cmpWrongDigit', 'cmp', { x: 418, y: 481 }, '>', { fam: 'pv3.compare', fp: { a: 418, b: 481 } }),
  R('logCompress', 'nl', { target: 150 }, 726, { fam: 'nl.place', fp: { L: 1000, target: 150, anchors: 'ends', mode: 'ends', tol: 70, tolPct: 7 } }), R('logCompress', 'nl', { target: 100 }, 668, { fam: 'nl.place', fp: { L: 1000, target: 100, anchors: 'ends', mode: 'ends', tol: 70, tolPct: 7 } }), R('logCompress', 'nl', { target: 300 }, 826, { fam: 'nl.place', fp: { L: 1000, target: 300, anchors: 'every10', mode: 'every10', tol: 30, tolPct: 3 } }),
  R('other', 'add', { a: 36, b: 27 }, 41, { fam: 'add.carry1', fp: { a: 36, b: 27 } }), R('other', 'sub', { a: 83, b: 47 }, 19, { fam: 'sub.2d2d', fp: { a: 83, b: 47 } }), R('other', 'read2', { t: 4, o: 13 }, 99, { fam: 'pv2.read', fp: { t: 4, o: 13 } }),
];

describe('V3b golden vectors', () => {
  it('has ≥ 3 rows for each of the 20 classes', () => {
    for (const c of DIAG_CLASSES) expect(ROWS.filter((r) => r.cls === c).length, c).toBeGreaterThanOrEqual(3);
    expect(ROWS.length).toBe(60);
  });
  it('every golden wrong answer is explained by its hand-written predicate (and differs from the right answer)', () => {
    for (const r of ROWS) {
      const correct = CORRECT[r.kind]?.(r.p);
      if (correct !== undefined && r.cls !== 'offByOne') expect(r.wrong, `${r.cls} ${JSON.stringify(r.p)}`).not.toBe(correct);
      if (r.cls !== 'other') expect(PRED[r.cls]({ ...r.p, kind: r.kind, sgn: r.sgn }), `${r.cls} ${JSON.stringify(r.p)}`).toBe(r.wrong);
    }
  });
  it('the REAL classifier labels every row that runs through a built family', () => {
    let n = 0;
    for (const r of ROWS) {
      if (!r.fam) continue; n++;
      const f = FAMILIES[r.fam];
      const c = classify(f, r.fp, r.wrong, r.ask);
      expect(c.diag, `${r.fam} ${JSON.stringify(r.fp)} → ${JSON.stringify(r.wrong)}`).toBe(r.cls);
    }
    expect(n).toBeGreaterThanOrEqual(46);
  });
  it('collisions: the earlier class in diag[] wins, the loser is only a 对质', () => {
    const add = FAMILIES['add.carry1']; const sub = FAMILIES['sub.borrow1'];
    expect(classify(add, { a: 27, b: 5 }, 22).diag).toBe('noCarry');
    expect(classify(add, { a: 27, b: 5 }, 31).diag).toBe('countOnInclusive');
    expect(classify(sub, { a: 42, b: 7 }, 45).diag).toBe('smallerFromLarger');
    expect(classify(add, { a: 27, b: 5 }, 22).confidence).toBe('high');
    // two SPECIFIC classes predicting the same wrong answer → low confidence (only the 对质 is shown)
    const read3 = FAMILIES['pv3.read']; const c2 = classify(read3, { h: 3, t: 0, o: 0 }, 3);
    expect(c2.matches.length).toBe(2); expect(c2.confidence).toBe('low');
  });
  it('every class is declared by ≥ 1 v1 family; no family declares a class outside the 20', () => {
    const used = new Set(NODES.flatMap((n) => n.items.map((i) => i.fam)));
    const declared = new Set([...used].flatMap((id) => META[id]?.diag ?? []));
    const missing = DIAG_CLASSES.filter((c) => c !== 'other' && !declared.has(c));
    expect(missing).toEqual([]);
    for (const id of used) for (const c of META[id]?.diag ?? []) expect(DIAG_CLASSES as readonly string[]).toContain(c);
    // classes only reachable through families that are not built yet (balance round): must be updated when 称重台 lands
    const builtDeclared = new Set([...used].filter((id) => FAMILIES[id]).flatMap((id) => META[id].diag));
    expect(DIAG_CLASSES.filter((c) => c !== 'other' && !builtDeclared.has(c))).toEqual(['equalAsOperator']);
  });
});

describe('V3 demo frames', () => {
  it('the first frame renders the child\'s own answer; no frame ever shows the oracle answer', () => {
    let demos = 0;
    for (const [id, f] of Object.entries(FAMILIES)) {
      if (f.answer === 'open') continue;
      const rng = createRng(`demo:${id}`);
      for (let k = 0; k < 40; k++) {
        const { params } = f.gen(rng, ctx(1));
        for (const cls of f.diag) {
          const b = bugAnswer(f, params, cls); if (b === null) continue;
          const correct = f.oracle(params);
          const steps = consequence(cls, true, { fam: id, p: params, resp: b, correct });
          demos++;
          const first = steps[0] as { op: string; shown?: number[] };
          expect(first.op).toBe('confront.his');
          for (const x of flatNumbers(b)) expect(first.shown).toContain(x);
          const bad = flatNumbers(correct).filter((x) => !flatNumbers(b).includes(x));
          for (const s of steps.slice(1)) if ('shown' in s && s.shown) for (const x of s.shown) expect(bad, `${id} ${cls}`).not.toContain(x);
        }
      }
    }
    expect(demos).toBeGreaterThan(300);
  });
});
