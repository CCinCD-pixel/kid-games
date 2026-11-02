/**
 * 拆一拆 — step-by-step "guided" solving. Every plan is derived from the problem by code (no hand-written tables).
 *
 *  - 乘 (13 × 5):    area picture, 10 × 5 = 50 and 3 × 5 = 15, then 50 + 15
 *  - 除 (65 ÷ 5):    bar picture, 50 ÷ 5 = 10 and 15 ÷ 5 = 3, then 10 + 3   (with a remainder the second step has two boxes)
 *  - 加 (347 + 28):  route picture, add the second number one place at a time: 347 + 20, then + 8
 *  - 减 (603 − 278): route picture, take the second number away one place at a time
 */
import { borrowCount, calc, carryCount, type Operation, type Problem, type Stage } from './problems';

export interface SplitStep {
  kind: 'part' | 'merge';
  /** the little problem answered in this step (calc, or rem for the second step of a division with a remainder) */
  problem: Problem;
  /** operand sources: index of an earlier step whose answer is used, or -1 for a literal from the main problem */
  uses: [number, number];
}
export type SplitShape =
  | { kind: 'area'; rows: number; cols: [number, number] }
  | { kind: 'bar'; total: number; chunks: [number, number]; divisor: number }
  | { kind: 'path'; start: number; chunks: number[]; sign: 1 | -1 };
export interface SplitPlan { op: Operation; shape: SplitShape; steps: SplitStep[] }

/** non-zero place values of n, big to small: 347 → [300, 40, 7] */
export function placeChunks(n: number): number[] {
  const out: number[] = [];
  for (let unit = 100; unit >= 1; unit /= 10) {
    const digit = Math.floor(n / unit) % 10;
    if (digit > 0) out.push(digit * unit);
  }
  return out;
}

/** The two parts of "big × small": big = tens + units. */
const mulFactors = (p: Problem): [number, number] | null => {
  if (p.kind !== 'calc' || p.op !== 'mul') return null;
  const pair: [number, number][] = [[p.a, p.b], [p.b, p.a]];
  return pair.find(([big, small]) => big >= 11 && big <= 99 && big % 10 !== 0 && small >= 2 && small <= 9) ?? null;
};
const divParts = (p: Problem): { a: number; d: number; chunk: number; rest: number } | null => {
  if (p.kind !== 'calc' && p.kind !== 'rem') return null;
  if (p.op !== 'div' || p.b < 2 || p.a < 10 * p.b) return null;
  const chunk = Math.floor(p.a / (10 * p.b)) * 10 * p.b, rest = p.a - chunk;
  return rest >= p.b ? { a: p.a, d: p.b, chunk, rest } : null;
};

/** Does 拆一拆 apply to this problem in this stage? (乘 8–10, 除 8 and 10, 加减 7–10 when carrying / borrowing.) */
export function splittable(stage: Stage, p: Problem): boolean {
  if (stage.op === 'mix') return false;
  if (stage.op === 'add') return stage.tier >= 7 && p.kind === 'calc' && p.op === 'add' && carryCount(p.a, p.b) >= 1 && placeChunks(p.b).length >= 2;
  if (stage.op === 'sub') return stage.tier >= 7 && p.kind === 'calc' && p.op === 'sub' && borrowCount(p.a, p.b) >= 1 && placeChunks(p.b).length >= 2;
  if (stage.op === 'mul') return stage.tier >= 8 && mulFactors(p) !== null;
  return (stage.tier === 8 || stage.tier === 10) && divParts(p) !== null;
}

export function planFor(p: Problem): SplitPlan | null {
  if (p.kind === 'calc' && (p.op === 'add' || p.op === 'sub')) {
    const chunks = placeChunks(p.b);
    if (chunks.length < 2) return null;
    const sign = p.op === 'add' ? 1 : -1;
    const steps: SplitStep[] = [];
    let running = p.a;
    chunks.forEach((chunk, i) => {
      const step = calc(p.op, running, chunk);
      steps.push({ kind: 'part', problem: step, uses: [i === 0 ? -1 : i - 1, -1] });
      running = step.answer;
    });
    return { op: p.op, shape: { kind: 'path', start: p.a, chunks, sign }, steps };
  }
  const m = mulFactors(p);
  if (m) {
    const [big, small] = m;
    const tens = Math.floor(big / 10) * 10, units = big % 10;
    const s1 = calc('mul', tens, small), s2 = calc('mul', units, small);
    if (s1.kind !== 'calc' || s2.kind !== 'calc') return null;
    return {
      op: 'mul', shape: { kind: 'area', rows: small, cols: [tens, units] },
      steps: [
        { kind: 'part', problem: s1, uses: [-1, -1] },
        { kind: 'part', problem: s2, uses: [-1, -1] },
        { kind: 'merge', problem: calc('add', s1.answer, s2.answer), uses: [0, 1] },
      ],
    };
  }
  const dv = divParts(p);
  if (dv) {
    const s1 = calc('div', dv.chunk, dv.d);
    const exact = dv.rest % dv.d === 0;
    const s2: Problem = exact ? calc('div', dv.rest, dv.d) : { kind: 'rem', op: 'div', a: dv.rest, b: dv.d, answer: Math.floor(dv.rest / dv.d), rem: dv.rest % dv.d };
    return {
      op: 'div', shape: { kind: 'bar', total: dv.a, chunks: [dv.chunk, dv.rest], divisor: dv.d },
      steps: [
        { kind: 'part', problem: s1, uses: [-1, -1] },
        { kind: 'part', problem: s2, uses: [-1, -1] },
        { kind: 'merge', problem: calc('add', s1.answer, s2.answer), uses: [0, 1] },
      ],
    };
  }
  return null;
}

/** Self-consistency of a plan: every step is a valid little problem, operands come from where `uses` says, and the last step gives the answer. */
export function planIsConsistent(p: Problem, plan: SplitPlan): boolean {
  const last = plan.steps[plan.steps.length - 1];
  if (!last) return false;
  const answerOf = (i: number) => plan.steps[i].problem;
  for (let i = 0; i < plan.steps.length; i++) {
    const step = plan.steps[i], q = step.problem;
    if (q.kind !== 'calc' && q.kind !== 'rem') return false;
    const [ua, ub] = step.uses;
    if (ua >= i || ub >= i) return false;
    if (ua >= 0 && q.a !== answerOf(ua).answer) return false;
    if (ub >= 0 && q.b !== answerOf(ub).answer) return false;
  }
  const remStep = plan.steps.find((s) => s.problem.kind === 'rem');
  if (p.kind === 'rem') return last.problem.answer === p.answer && remStep?.problem.kind === 'rem' && remStep.problem.rem === p.rem;
  return !remStep && last.problem.answer === (p as { answer: number }).answer;
}

/** Does a finished 拆一拆 problem count as "一次就对"? Using the method on purpose, with no step wrong and no answer shown, does (use the method!); a warm-up never counts, nor does a problem that was already answered wrongly. */
export function splitCountsAsRight(origin: 'warm' | 'button' | 'miss', missed: boolean, kind: 'warm' | 'review' | 'scored'): boolean {
  return origin === 'button' && !missed && kind === 'scored';
}
