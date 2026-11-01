/**
 * Misconception catalogue — the single source (spec §4.5): 20 classes, parent wording, the `bug` answer lookup used by the
 * classifier and the bots, and the "演示为什么" scripts (DemoStep data executed by each stage). A demo ALWAYS opens with the
 * child's own answer and NEVER shows the oracle answer in any frame (V3).
 */
import type { Answer, DemoStep, DiagClass, FamilyDef } from '../app/types';
import { DIAG_CLASSES } from '../app/types';

export { DIAG_CLASSES };
/** Classes the classifier may use even when a family does not list them (the loser of a collision). */
export const GENERIC_CLASSES: readonly DiagClass[] = ['offByOne', 'offByTen', 'other'];

export const CLASS_INFO: Record<DiagClass, { parent: string }> = {
  noCarry: { parent: '不进位 · 满十没有压成一根棒' },
  countOnInclusive: { parent: '往上数时把起点也数进去了' },
  smallerFromLarger: { parent: '不够减时用大数减小数（没有退位）' },
  digitReversal: { parent: '把十位和个位的顺序弄反了' },
  pvConcat: { parent: '把"几根棒、几颗"直接拼在一起读' },
  zeroOmit: { parent: '数位上是 0 时漏写了 0' },
  canonicalOnly: { parent: '只会一种拆法（几个十就是几个十）' },
  unitAsOne: { parent: '把每根棒、每个箱都当成 1 个来数' },
  mulAsAdd: { parent: '"几个几"当成两个数相加' },
  equalAsOperator: { parent: '把等号当成"得数"，不是"两边一样重"' },
  keywordOp: { parent: '看到"多/少"就直接加/减，没看谁是谁' },
  extraZero: { parent: '读"三百零六"时多写了一个 0' },
  offByOne: { parent: '差 1（数多了或数少了一个）' },
  offByTen: { parent: '差 10（棒数错了一根）' },
  offByStep: { parent: '跳数多跳或少跳了一次' },
  opReversed: { parent: '加和减用反了' },
  partialDistribute: { parent: '拆开算时只乘了一部分' },
  cmpWrongDigit: { parent: '比大小时看错了数位' },
  logCompress: { parent: '大数放得偏小（数轴上越往后越挤）' },
  other: { parent: '其他' },
};

const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
export function flatNumbers(a: unknown): number[] {
  if (isNum(a)) return [a];
  if (Array.isArray(a)) return a.flatMap(flatNumbers);
  if (a && typeof a === 'object') return Object.values(a as object).flatMap(flatNumbers);
  return [];
}

/** The answer a child with misconception `cls` would give (null = the class does not apply to this item). */
export function bugAnswer(f: FamilyDef, p: unknown, cls: DiagClass, ask?: string): Answer | null {
  const correct = f.oracle(p, ask);
  let b: Answer | null = f.bug?.(p, cls, ask) ?? null;
  if (b === null && isNum(correct)) {
    if (cls === 'offByOne') b = correct + 1;
    else if (cls === 'offByTen') b = correct + 10;
  }
  if (b === null) return null;
  return JSON.stringify(b) === JSON.stringify(correct) ? null : b;
}

// ---- demo scripts ------------------------------------------------------------------------------------------------------------
export interface DemoCtx { fam: string; p: any; resp: unknown; correct: Answer; ask?: string }
const f = (op: string, args: Record<string, unknown> = {}, shown: number[] = [], ms = 700): DemoStep => ({ op, args, shown, ms });

/** Mechanism frames per class (before the final value is revealed). Param names follow the family tables. */
function mechanism(cls: DiagClass, c: DemoCtx): DemoStep[] {
  const { p } = c;
  switch (cls) {
    case 'noCarry': return [f('tray.show', { value: p.a }, [p.a]), f('tray.pour', { crystals: p.b }, [p.b]), f('tray.overflow', { at: 10 }), f('tray.press'), f('ask', { what: 'rods' })];
    case 'countOnInclusive': return [f('nl.jumpFrom', { from: p.a, firstJump: 1 }, [p.a, p.a + 1]), f('ask', { what: 'landing' })];
    case 'smallerFromLarger': return [f('tray.show', { value: p.a }, [p.a]), f('tray.take', { crystals: p.b % 10, fails: true }), f('tray.cutRod'), f('ask', { what: 'afterCut' })];
    case 'digitReversal': return [f('place.swap', { highlight: 'tens-ones' }), f('ask', { what: 'tensDigit' })];
    case 'pvConcat': return [f('tray.show', { rods: p.t ?? p.h, crystals: p.o }), f('tray.press', { highlight: 'tenCrystals' }), f('ask', { what: 'rods' })];
    case 'zeroOmit': return [f('place.cards', { cards: [p.h, '_', p.o] }, [p.h, p.o]), f('place.glow', { place: 'tens' }), f('ask', { what: 'emptyPlace' })];
    case 'canonicalOnly': return [f('tray.show', { value: p.n }), f('tray.cutRod'), f('place.cards', { split: true }), f('ask', { what: 'ones' })];
    case 'unitAsOne': return [f('tray.show', { rods: p.t ?? p.h, crystals: p.o }), f('tray.cutRod', { all: true }), f('count.by', { unit: 10 }), f('ask', { what: 'total' })];
    case 'mulAsAdd': { const shown = Array.from({ length: Math.max(0, (p.k ?? 2) - 1) }, (_, i) => (i + 1) * (p.n ?? 1)); return [f('pods.light', { upTo: shown.length }, shown), f('ask', { what: 'next' })]; }
    case 'equalAsOperator': return [f('balance.put', { side: 'right', weights: [p.a, p.c] }), f('balance.tilt', { dir: 'right' }), f('ask', { what: 'level' })];
    case 'keywordOp': return [f('bar.show', { which: 'gap' }), f('ask', { what: 'bigger' })];
    case 'extraZero': return [f('counter.dial', { rods: 3 }), f('lamp.off'), f('ask', { what: 'digits' })];
    case 'offByOne': return [f('compare.adjacent'), f('ask', { what: 'whichSide' })];
    case 'offByTen': return [f('compare.sticks', { diff: 1 }), f('ask', { what: 'whichSide' })];
    case 'offByStep': return [f('nl.rejump', { stopBeforeLast: true }), f('ask', { what: 'lastJump' })];
    case 'opReversed': return [f('order.flashOperator'), f('ask', { what: 'operator' })];
    case 'partialDistribute': return [f('array.cut', { after: p.k ?? 1 }), f('array.glowRow', { row: 'last' }), f('ask', { what: 'rowProduct' })];
    case 'cmpWrongDigit': return [f('cmp.align'), f('cmp.glowDecisive'), f('ask', { what: 'decisive' })];
    case 'logCompress': return [f('nl.twoFlags', { which: 'his-vs-half' }), f('ask', { what: 'whereIs' })];
    default: return [];
  }
}

/**
 * Consequence script: 对质 (his answer vs the order) first; then — only when the classifier is confident — the mechanism, stopping BEFORE
 * the final value. Frames never list the oracle answer in `shown` (stripped here as a hard guarantee).
 */
export function consequence(cls: DiagClass | null, confident: boolean, c: DemoCtx): DemoStep[] {
  const his = flatNumbers(c.resp);
  const steps: DemoStep[] = [f('confront.his', { resp: c.resp }, his, 900), f('confront.order', {}, flatNumbers(c.p && typeof c.p === 'object' ? Object.values(c.p as object).filter(isNum) : []).slice(0, 4), 600)];
  if (cls && cls !== 'other' && confident) steps.push(...mechanism(cls, c));
  else steps.push(f('gap.show', { gap: true }, []), f('ask', { what: 'again' }));
  const bad = new Set(flatNumbers(c.correct));
  return steps.map((s, i) => (i === 0 || !('shown' in s) || !s.shown ? s : { ...s, shown: s.shown.filter((x) => !bad.has(x) || flatNumbers(c.resp).includes(x)) }));
}
