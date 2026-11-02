/**
 * 算术站 2.0 — problems, stage table, generators and stage-definition predicates.
 *
 * 44 stages: four 10-step lines (add / sub / mul / div) + the mixed challenge line (mix, 4 steps).
 * Stages 1–6 of the four lines are the original generators (kept bit-for-bit so a saved round resumes
 * with the same questions). Stages 7–10 and mix are new. Every stage has a *predicate* (`inStage`)
 * that states its definition independently of the generator; the tests check generator ⊆ predicate.
 */
export type Operation = 'add' | 'sub' | 'mul' | 'div';
export type TrackOp = Operation | 'mix';
export type GlyphId =
  | 'lamp' | 'battery' | 'tank' | 'barrel' | 'solar' | 'plug' | 'bolt' | 'crate' | 'dock' | 'star' | 'ship' | 'bell'
  | 'antenna' | 'gear' | 'arm' | 'drill' | 'planet' | 'dome' | 'rover' | 'rocket'
  | 'engine' | 'truck' | 'shelf' | 'key' | 'scale' | 'chain' | 'circuit' | 'hand' | 'cells';

export interface Expr { nums: number[]; ops: Operation[] }
export type Problem =
  | { kind: 'calc'; op: Operation; a: number; b: number; answer: number }
  | { kind: 'rem'; op: 'div'; a: number; b: number; answer: number; rem: number }
  | { kind: 'fill'; op: Operation; a: number | null; b: number | null; c: number; answer: number }
  | { kind: 'expr'; op: Operation; nums: number[]; ops: Operation[]; answer: number }
  | { kind: 'cmp'; op: Operation; left: Expr; right: Expr; answer: -1 | 0 | 1 };
export type ProblemKind = Problem['kind'];

export interface Stage { id: string; op: TrackOp; tier: number; title: string; brief: string; glyph: GlyphId }

export const SYMBOL: Record<Operation, string> = { add: '+', sub: '−', mul: '×', div: '÷' };
export const QUESTIONS_PER_STAGE = 8;
export const PASS_SCORE = 5;
export const WARMUP_QUESTIONS = 2;

type Def = [title: string, brief: string, glyph: GlyphId];
export interface Track { op: TrackOp; title: string; short: string; color: string; stages: Def[] }
export const TRACKS: Track[] = [
  { op: 'add', title: '加法', short: '能源补给线', color: 'coral', stages: [
    ['点亮信号灯', '10 内相加', 'lamp'], ['给探测车充电', '20 内进位', 'battery'], ['装满氧气罐', '两位加一位', 'tank'],
    ['堆起燃料桶', '整十相加', 'barrel'], ['拼装太阳板', '两位相加', 'solar'], ['接通电力网', '进位加法', 'plug'],
    ['凑满一百度电', '凑整百 · 连加', 'bolt'], ['装货上火箭', '整百整十相加', 'crate'], ['补给舱对接', '三位加两位', 'dock'], ['星际大补给', '三位加三位', 'star'],
  ] },
  { op: 'sub', title: '减法', short: '返航着陆线', color: 'teal', stages: [
    ['熄灭警示灯', '10 内相减', 'bell'], ['卸下货物箱', '20 内退位', 'crate'], ['消耗燃料', '两位减一位', 'barrel'],
    ['拆除旧天线', '整十相减', 'antenna'], ['回收零件', '两位相减', 'gear'], ['着陆减速', '退位减法', 'ship'],
    ['清点氧气库', '一百减几 · 连续退位', 'tank'], ['货舱清点', '整百整十相减', 'shelf'], ['返航减重', '三位减两位', 'rocket'], ['深空着陆', '三位减三位', 'planet'],
  ] },
  { op: 'mul', title: '乘法', short: '机械组装线', color: 'gold', stages: [
    ['组装双轮车', '2 的乘法', 'rover'], ['五指机械手', '5 的乘法', 'hand'], ['十格货架', '10 的乘法', 'shelf'],
    ['三脚架四轮车', '3 和 4 的乘法', 'truck'], ['六足探测车', '6 和 7 的乘法', 'rover'], ['八爪机械臂', '8 和 9 的乘法', 'arm'],
    ['大货仓装箱', '整十整百乘一位', 'crate'], ['零件流水线', '两位乘一位 · 不进位', 'gear'], ['拆分大积木', '拆一拆 · 乘 2、4、5', 'cells'], ['装配发动机', '两位乘一位 · 进位', 'engine'],
  ] },
  { op: 'div', title: '除法', short: '分配运输线', color: 'blue', stages: [
    ['平分能量块', '除以 2', 'battery'], ['五人分补给', '除以 5', 'hand'], ['十箱分装', '除以 10', 'crate'],
    ['分给车队', '除以 3 和 4', 'truck'], ['分配宿舍舱', '除以 6 和 7', 'dome'], ['分配实验舱', '除以 8 和 9', 'planet'],
    ['平分大货仓', '整十除以一位 · 表内', 'shelf'], ['分拣包裹', '两位除以一位 · 整除', 'dock'], ['剩下的小分队', '有剩下的除法 · 表内', 'scale'], ['分装补给站', '两位除以一位 · 有剩下', 'drill'],
  ] },
  { op: 'mix', title: '混合挑战', short: '深空挑战线', color: 'violet', stages: [
    ['修复断线电路', '填数 · 加减', 'circuit'], ['补全密码锁', '填数 · 乘除', 'key'], ['比一比谁大', '比大小', 'scale'], ['两步任务链', '两步题', 'chain'],
  ] },
];
export const STAGES: Stage[] = TRACKS.flatMap((track) => track.stages.map(([title, brief, glyph], i) => ({ id: `${track.op}-${i + 1}`, op: track.op, tier: i + 1, title, brief, glyph })));
export const OPS: TrackOp[] = ['add', 'sub', 'mul', 'div', 'mix'];
export const LINE_OPS: Operation[] = ['add', 'sub', 'mul', 'div'];
export const stageById = (id: string): Stage | undefined => STAGES.find((s) => s.id === id);
export const trackOf = (op: TrackOp): Track => TRACKS.find((t) => t.op === op)!;

// ---------------------------------------------------------------- arithmetic helpers
export function evalExpr(e: Expr): number {
  const nums = [e.nums[0]];
  const ops: Operation[] = [];
  for (let i = 0; i < e.ops.length; i++) {
    const op = e.ops[i], n = e.nums[i + 1];
    if (op === 'mul') nums[nums.length - 1] *= n;
    else if (op === 'div') {
      const x = nums[nums.length - 1];
      if (n === 0 || x % n !== 0) return NaN;
      nums[nums.length - 1] = x / n;
    } else { ops.push(op); nums.push(n); }
  }
  return ops.reduce((acc, op, i) => (op === 'add' ? acc + nums[i + 1] : acc - nums[i + 1]), nums[0]);
}
const applyOp = (op: Operation, a: number, b: number) => (op === 'add' ? a + b : op === 'sub' ? a - b : op === 'mul' ? a * b : a / b);

export function carryCount(a: number, b: number): number {
  let count = 0, carry = 0;
  while (a > 0 || b > 0 || carry > 0) {
    const sum = (a % 10) + (b % 10) + carry;
    carry = sum >= 10 ? 1 : 0;
    count += carry;
    a = Math.floor(a / 10); b = Math.floor(b / 10);
  }
  return count;
}
export function borrowCount(a: number, b: number): number {
  let count = 0, borrow = 0;
  while (a > 0 || b > 0) {
    const digit = (a % 10) - (b % 10) - borrow;
    borrow = digit < 0 ? 1 : 0;
    count += borrow;
    a = Math.floor(a / 10); b = Math.floor(b / 10);
  }
  return count;
}
/** Number of columns that carry when a two-digit number is multiplied by one digit. */
export function mulCarries(a: number, s: number): number {
  const u = a % 10, t = Math.floor(a / 10);
  const c1 = Math.floor((u * s) / 10);
  return (u * s >= 10 ? 1 : 0) + (t * s + c1 >= 10 ? 1 : 0);
}

export const calc = (op: Operation, a: number, b: number): Problem => ({ kind: 'calc', op, a, b, answer: applyOp(op, a, b) });
const fill = (op: Operation, a: number | null, b: number | null, c: number, answer: number): Problem => ({ kind: 'fill', op, a, b, c, answer });
const remP = (a: number, b: number): Problem => ({ kind: 'rem', op: 'div', a, b, answer: Math.floor(a / b), rem: a % b });
const mainOp = (ops: Operation[]): Operation => ops.find((o) => o === 'mul' || o === 'div') ?? ops[0] ?? 'add';
export const exprP = (nums: number[], ops: Operation[]): Problem => ({ kind: 'expr', op: mainOp(ops), nums, ops, answer: evalExpr({ nums, ops }) });
const sign = (n: number): -1 | 0 | 1 => (n > 0 ? 1 : n < 0 ? -1 : 0);
export const cmpP = (left: Expr, right: Expr): Problem => ({ kind: 'cmp', op: mainOp(left.ops.length ? left.ops : right.ops), left, right, answer: sign(evalExpr(left) - evalExpr(right)) });

/** Recompute the answer from the structure; false when anything is out of range or inconsistent. */
export function checkProblem(p: Problem): boolean {
  const ok = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 999;
  switch (p.kind) {
    case 'calc': return ok(p.a) && ok(p.b) && ok(p.answer) && !(p.op === 'div' && (p.b === 0 || p.a % p.b !== 0)) && applyOp(p.op, p.a, p.b) === p.answer;
    case 'rem': return p.op === 'div' && ok(p.a) && p.b >= 2 && ok(p.b) && ok(p.answer) && ok(p.rem) && p.rem >= 1 && p.rem < p.b && p.b * p.answer + p.rem === p.a;
    case 'fill': {
      if (!ok(p.c) || !ok(p.answer) || ((p.a === null) === (p.b === null))) return false;
      const a = p.a ?? p.answer, b = p.b ?? p.answer;
      return ok(a) && ok(b) && !(p.op === 'div' && (b === 0 || a % b !== 0)) && applyOp(p.op, a, b) === p.c;
    }
    case 'expr': return Array.isArray(p.nums) && Array.isArray(p.ops) && p.nums.length >= 2 && p.nums.length <= 3 && p.ops.length === p.nums.length - 1 && p.nums.every(ok) && p.ops.every((o) => ['add', 'sub', 'mul', 'div'].includes(o)) && ok(p.answer) && evalExpr(p) === p.answer;
    case 'cmp': {
      const side = (e: Expr) => Array.isArray(e?.nums) && Array.isArray(e?.ops) && e.nums.length >= 1 && e.nums.length <= 3 && e.ops.length === e.nums.length - 1 && e.nums.every(ok) && e.ops.every((o) => ['add', 'sub', 'mul', 'div'].includes(o)) && ok(evalExpr(e));
      return side(p.left) && side(p.right) && sign(evalExpr(p.left) - evalExpr(p.right)) === p.answer;
    }
    default: return false;
  }
}
export function problemKey(p: Problem): string {
  switch (p.kind) {
    case 'calc': case 'rem': return `${p.kind}:${p.a}${p.op}${p.b}`;
    case 'fill': return `fill:${p.a ?? '_'}${p.op}${p.b ?? '_'}=${p.c}`;
    case 'expr': return `expr:${p.nums.map((n, i) => `${n}${p.ops[i] ?? ''}`).join('')}`;
    case 'cmp': return `cmp:${p.left.nums.map((n, i) => `${n}${p.left.ops[i] ?? ''}`).join('')}|${p.right.nums.map((n, i) => `${n}${p.right.ops[i] ?? ''}`).join('')}`;
  }
}
/** Text of a problem for tests/debug, e.g. "13 × 5 = ?". */
export function problemText(p: Problem): string {
  const s = (e: Expr) => e.nums.map((n, i) => `${n}${e.ops[i] ? ` ${SYMBOL[e.ops[i]]} ` : ''}`).join('').trim();
  switch (p.kind) {
    case 'calc': return `${p.a} ${SYMBOL[p.op]} ${p.b} = ?`;
    case 'rem': return `${p.a} ÷ ${p.b} = ? … ?`;
    case 'fill': return `${p.a ?? '□'} ${SYMBOL[p.op]} ${p.b ?? '□'} = ${p.c}`;
    case 'expr': return `${s(p)} = ?`;
    case 'cmp': return `${s(p.left)} ? ${s(p.right)}`;
  }
}

// ---------------------------------------------------------------- rng
function hash(value: string): number {
  let h = 2166136261;
  for (const char of value) h = Math.imul(h ^ char.charCodeAt(0), 16777619);
  return h >>> 0;
}
export function random(seed: number): () => number {
  let state = seed || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}
export const seededRandom = (text: string) => random(hash(text));
const one = (rng: () => number, low: number, high: number): number => low + Math.floor(rng() * (high - low + 1));
const pick = <T>(rng: () => number, list: T[]): T => list[Math.floor(rng() * list.length)];

// ---------------------------------------------------------------- stage definitions (predicates)
const isCalc = (p: Problem, op: Operation): p is Extract<Problem, { kind: 'calc' }> => p.kind === 'calc' && p.op === op && checkProblem(p);
const mult10 = (n: number) => n % 10 === 0;
const twoDigit = (n: number) => n >= 10 && n <= 99;
/** (big, small) for a multiplication whose one factor is a single digit 2–9. */
const factors = (p: Extract<Problem, { kind: 'calc' }>): [number, number] | null => (p.b >= 2 && p.b <= 9 ? [p.a, p.b] : p.a >= 2 && p.a <= 9 ? [p.b, p.a] : null);
const legacyTable: Record<Operation, (t: number, p: Problem) => boolean> = {
  add: (t, p) => {
    if (!isCalc(p, 'add')) return false;
    const { a, b } = p;
    if (t === 1) return a >= 1 && b >= 1 && a + b <= 10;
    if (t === 2) return a >= 1 && a <= 9 && b >= 1 && b <= 9 && a + b >= 11;
    if (t === 3) return twoDigit(a) && b >= 1 && b <= 9 && (a % 10) + b <= 9;
    if (t === 4) return mult10(a) && mult10(b) && a >= 10 && b >= 10 && a + b <= 90;
    if (t === 5) return twoDigit(a) && twoDigit(b) && carryCount(a, b) === 0 && a + b <= 99;
    return twoDigit(a) && twoDigit(b) && (a % 10) + (b % 10) >= 10 && a + b <= 99;
  },
  sub: (t, p) => {
    if (!isCalc(p, 'sub')) return false;
    const { a, b } = p;
    if (t === 1) return a >= 2 && a <= 10 && b >= 1 && b < a;
    if (t === 2) return a >= 11 && a <= 18 && b >= 1 && b <= 9 && (a % 10) < b;
    if (t === 3) return twoDigit(a) && b >= 1 && b <= 9 && b <= a % 10;
    if (t === 4) return mult10(a) && mult10(b) && b >= 10 && b < a && a <= 90;
    if (t === 5) return twoDigit(a) && twoDigit(b) && borrowCount(a, b) === 0 && b < a;
    return twoDigit(a) && twoDigit(b) && (a % 10) < (b % 10) && b < a;
  },
  mul: (t, p) => {
    const table = [[2], [5], [10], [3, 4], [6, 7], [8, 9]][t - 1];
    return isCalc(p, 'mul') && table.includes(p.a) && p.b >= 1 && p.b <= 10;
  },
  div: (t, p) => {
    const table = [[2], [5], [10], [3, 4], [6, 7], [8, 9]][t - 1];
    return isCalc(p, 'div') && table.includes(p.b) && p.answer >= 1 && p.answer <= 10;
  },
};

export const STAGE_DEFS: Record<string, (p: Problem) => boolean> = {
  'add-7': (p) => {
    if (p.kind === 'fill') return p.op === 'add' && p.c === 100 && checkProblem(p) && (p.a ?? p.b!) >= 11 && (p.a ?? p.b!) <= 98;
    return p.kind === 'expr' && checkProblem(p) && p.ops.length === 2 && p.ops.every((o) => o === 'add') && p.nums.every((n) => n >= 5 && n <= 90) && p.answer <= 100;
  },
  'add-8': (p) => isCalc(p, 'add') && mult10(p.a) && mult10(p.b) && p.a >= 100 && p.b >= 100 && p.answer <= 999 && !(p.a % 100 === 0 && p.b % 100 === 0),
  'add-9': (p) => isCalc(p, 'add') && p.a >= 100 && p.a <= 999 && twoDigit(p.b) && p.answer <= 999,
  'add-10': (p) => isCalc(p, 'add') && p.a >= 100 && p.b >= 100 && p.answer <= 999,
  'sub-7': (p) => isCalc(p, 'sub') && ((p.a === 100 && p.b >= 11 && p.b <= 99) || (twoDigit(p.a) && twoDigit(p.b) && p.b < p.a && (p.a % 10) < (p.b % 10))),
  'sub-8': (p) => isCalc(p, 'sub') && mult10(p.a) && mult10(p.b) && p.a >= 200 && p.a <= 990 && p.b >= 100 && p.b < p.a && !(p.a % 100 === 0 && p.b % 100 === 0),
  'sub-9': (p) => isCalc(p, 'sub') && p.a >= 100 && twoDigit(p.b) && p.answer >= 20 && borrowCount(p.a, p.b) >= 1,
  'sub-10': (p) => isCalc(p, 'sub') && p.a >= 100 && p.b >= 100 && p.answer >= 10 && borrowCount(p.a, p.b) >= 1,
  'mul-7': (p) => {
    if (!isCalc(p, 'mul')) return false;
    const f = factors(p);
    return !!f && f[1] >= 2 && f[1] <= 9 && ((f[0] >= 10 && f[0] <= 90 && mult10(f[0])) || (f[0] >= 100 && f[0] <= 900 && f[0] % 100 === 0)) && p.answer <= 999;
  },
  'mul-8': (p) => {
    if (!isCalc(p, 'mul')) return false;
    const f = factors(p);
    return !!f && f[0] >= 11 && f[0] <= 99 && f[0] % 10 !== 0 && f[1] >= 2 && mulCarries(f[0], f[1]) === 0;
  },
  'mul-9': (p) => isCalc(p, 'mul') && p.a >= 11 && p.a <= 59 && p.a % 10 !== 0 && [2, 4, 5].includes(p.b) && (p.a % 10) * p.b >= 10,
  'mul-10': (p) => isCalc(p, 'mul') && p.a >= 11 && p.a <= 99 && p.a % 10 !== 0 && p.b >= 2 && p.b <= 9 && mulCarries(p.a, p.b) >= 1 && p.answer <= 999,
  'div-7': (p) => isCalc(p, 'div') && p.b >= 2 && p.b <= 9 && ((mult10(p.a) && p.a >= 20 && (p.answer <= 9 || p.answer % 10 === 0)) || (p.answer >= 2 && p.answer <= 9)),
  'div-8': (p) => isCalc(p, 'div') && twoDigit(p.a) && p.a % 10 !== 0 && p.b >= 2 && p.b <= 9 && p.answer >= 10,
  'div-9': (p) => p.kind === 'rem' && checkProblem(p) && p.b >= 2 && p.b <= 9 && p.answer >= 2 && p.answer <= 9,
  'div-10': (p) => p.kind === 'rem' && checkProblem(p) && p.a >= 20 && p.a <= 99 && p.b >= 2 && p.b <= 9 && p.answer >= 10,
  'mix-1': (p) => p.kind === 'fill' && (p.op === 'add' || p.op === 'sub') && checkProblem(p) && p.c >= 11 && p.c <= 99 && (p.a ?? p.b!) >= 11 && p.answer >= 11 && p.answer <= 99,
  'mix-2': (p) => {
    if (p.kind !== 'fill' || !checkProblem(p)) return false;
    if (p.op === 'mul') return (p.a ?? p.b!) >= 2 && (p.a ?? p.b!) <= 9 && p.answer >= 2 && p.answer <= 30;
    if (p.op === 'div') return p.b === null ? p.a! >= 4 && p.c >= 2 && p.c <= 9 && p.answer >= 2 && p.answer <= 9 : p.b >= 2 && p.b <= 9 && p.c >= 2 && p.c <= 30;
    return false;
  },
  'mix-3': (p) => {
    if (p.kind !== 'cmp' || !checkProblem(p)) return false;
    const l = evalExpr(p.left), r = evalExpr(p.right);
    const valueSide = (e: Expr) => e.nums.length === 1 || (e.nums.length === 2 && e.nums.every((n) => n >= 2));
    return valueSide(p.left) && valueSide(p.right) && (p.left.nums.length === 2 || p.right.nums.length === 2) && Math.abs(l - r) <= 30 && l >= 10 && r >= 10;
  },
  'mix-4': (p) => {
    if (p.kind !== 'expr' || !checkProblem(p) || p.nums.length !== 3 || p.answer < 1) return false;
    const heavy = (o: Operation) => o === 'mul' || o === 'div', light = (o: Operation) => o === 'add' || o === 'sub';
    const [o1, o2] = p.ops;
    return (heavy(o1) && light(o2)) || (light(o1) && heavy(o2)) ? p.nums.every((n) => n >= 2) : false;
  },
};

/** The definition of a stage: does `p` belong to it? */
export function inStage(stage: Stage, p: Problem): boolean {
  if (!checkProblem(p)) return false;
  const custom = STAGE_DEFS[stage.id];
  if (custom) return custom(p);
  return stage.op === 'mix' ? false : legacyTable[stage.op](stage.tier, p);
}

// ---------------------------------------------------------------- generators
function makeLegacy(stage: Stage, rng: () => number): Problem {
  const t = stage.tier;
  let a = 0, b = 0;
  if (stage.op === 'add') {
    if (t === 1) { a = one(rng, 1, 9); b = one(rng, 1, 10 - a); }
    if (t === 2) { a = one(rng, 6, 9); b = one(rng, 11 - a, 9); }
    if (t === 3) { const units = one(rng, 0, 8); a = one(rng, 1, 8) * 10 + units; b = one(rng, 1, 9 - units); }
    if (t === 4) { const tens = one(rng, 1, 8); a = tens * 10; b = one(rng, 1, 9 - tens) * 10; }
    if (t === 5) { const tens = one(rng, 1, 7), units = one(rng, 0, 9); a = tens * 10 + units; b = one(rng, 1, 8 - tens) * 10 + one(rng, 0, 9 - units); }
    if (t === 6) { const tens = one(rng, 1, 7), units = one(rng, 1, 9); a = tens * 10 + units; b = one(rng, 1, 8 - tens) * 10 + one(rng, 10 - units, 9); }
  } else if (stage.op === 'sub') {
    if (t === 1) { a = one(rng, 2, 10); b = one(rng, 1, a - 1); }
    if (t === 2) { a = one(rng, 11, 18); b = one(rng, a % 10 + 1, 9); }
    if (t === 3) { const units = one(rng, 1, 9); a = one(rng, 2, 9) * 10 + units; b = one(rng, 1, units); }
    if (t === 4) { const tens = one(rng, 2, 9); a = tens * 10; b = one(rng, 1, tens - 1) * 10; }
    if (t === 5) { const tens = one(rng, 2, 9), units = one(rng, 0, 9); a = tens * 10 + units; b = one(rng, 1, tens - 1) * 10 + one(rng, 0, units); }
    if (t === 6) { const tens = one(rng, 2, 9), units = one(rng, 0, 8); a = tens * 10 + units; b = one(rng, 1, tens - 1) * 10 + one(rng, units + 1, 9); }
  } else {
    const table = [[2], [5], [10], [3, 4], [6, 7], [8, 9]][t - 1];
    const factor = table[one(rng, 0, table.length - 1)];
    const other = one(rng, 1, 10);
    if (stage.op === 'mul') { a = factor; b = other; }
    else { a = factor * other; b = factor; }
  }
  return calc(stage.op as Operation, a, b);
}

function randomExpr(rng: () => number): Expr {
  const r = rng();
  if (r < 0.3) return { nums: [one(rng, 11, 89), one(rng, 11, 89)], ops: ['add'] };
  if (r < 0.5) { const a = one(rng, 31, 99); return { nums: [a, one(rng, 11, a - 10)], ops: ['sub'] }; }
  if (r < 0.9) return { nums: [one(rng, 11, 49), one(rng, 3, 9)], ops: ['mul'] };
  const d = one(rng, 3, 9);
  return { nums: [d * one(rng, 10, 30), d], ops: ['div'] };
}

/** Generate the `slot`-th problem of a round. `round` only rotates which variant a stage with several shapes uses. */
function make(stage: Stage, rng: () => number, slot: number, round: number): Problem {
  const variant = (n: number) => (slot + round) % n;
  switch (stage.id) {
    case 'add-7': {
      if (variant(2) === 0) { const n = one(rng, 11, 98); return rng() < 0.6 ? fill('add', n, null, 100, 100 - n) : fill('add', null, n, 100, 100 - n); }
      for (;;) {
        const a = one(rng, 6, 55), b = one(rng, 6, 55), c = one(rng, 6, 55);
        if (a + b + c <= 100 && carryCount(a, b) + carryCount(a + b, c) >= 1) return exprP([a, b, c], ['add', 'add']);
      }
    }
    case 'add-8': for (;;) {
      const x = one(rng, 10, 88), y = one(rng, 10, 88);
      if (x + y > 99 || (x % 10 === 0 && y % 10 === 0)) continue;
      if (rng() < 0.65 && carryCount(x * 10, y * 10) === 0) continue;
      return calc('add', x * 10, y * 10);
    }
    case 'add-9': for (;;) {
      const a = one(rng, 100, 989), b = one(rng, 10, 99);
      if (a + b > 999 || (rng() < 0.8 && carryCount(a, b) === 0)) continue;
      return calc('add', a, b);
    }
    case 'add-10': for (;;) {
      const a = one(rng, 100, 899), b = one(rng, 100, 899);
      if (a + b > 999 || (rng() < 0.85 && carryCount(a, b) === 0)) continue;
      return calc('add', a, b);
    }
    case 'sub-7': {
      if (variant(2) === 0) { let b = one(rng, 12, 98); if (b % 10 === 0 && rng() < 0.9) b += 1; return calc('sub', 100, b); }
      for (;;) { const a = one(rng, 32, 99), b = one(rng, 12, a - 1); if ((a % 10) < (b % 10)) return calc('sub', a, b); }
    }
    case 'sub-8': for (;;) {
      const x = one(rng, 20, 99), y = one(rng, 10, x - 1);
      if ((x % 10 === 0 && y % 10 === 0) || (rng() < 0.7 && borrowCount(x * 10, y * 10) === 0)) continue;
      return calc('sub', x * 10, y * 10);
    }
    case 'sub-9': for (;;) {
      const a = one(rng, 100, 999), b = one(rng, 10, 99);
      if (a - b < 20 || borrowCount(a, b) === 0) continue;
      return calc('sub', a, b);
    }
    case 'sub-10': for (;;) {
      const a = one(rng, 220, 999), b = one(rng, 100, a - 10);
      if (borrowCount(a, b) === 0) continue;
      return calc('sub', a, b);
    }
    case 'mul-7': for (;;) {
      const s = one(rng, 2, 9), big = rng() < 0.7 ? 10 * one(rng, 1, 9) : 100 * one(rng, 1, 9);
      if (s * big > 999) continue;
      return rng() < 0.7 ? calc('mul', big, s) : calc('mul', s, big);
    }
    case 'mul-8': for (;;) {
      const t = one(rng, 1, 9), u = one(rng, 1, 9), s = one(rng, 2, 9), a = t * 10 + u;
      if (mulCarries(a, s) !== 0) continue;
      return rng() < 0.75 ? calc('mul', a, s) : calc('mul', s, a);
    }
    case 'mul-9': for (;;) {
      const b = pick(rng, [2, 4, 5]), a = one(rng, 1, 5) * 10 + one(rng, 1, 9);
      if ((a % 10) * b >= 10) return calc('mul', a, b);
    }
    case 'mul-10': for (;;) {
      const a = (rng() < 0.7 ? one(rng, 1, 5) : one(rng, 6, 9)) * 10 + one(rng, 1, 9), s = rng() < 0.7 ? pick(rng, [3, 6, 7, 8, 9]) : one(rng, 2, 9);
      if (mulCarries(a, s) >= 1) return calc('mul', a, s);
    }
    case 'div-7': {
      if (variant(2) === 0) for (;;) { const d = one(rng, 2, 9), a = one(rng, 2, 36) * 10, q = a / d; if (a % d === 0 && (q <= 9 || q % 10 === 0)) return calc('div', a, d); }
      const d = one(rng, 2, 9), q = one(rng, 2, 9);
      return calc('div', d * q, d);
    }
    case 'div-8': for (;;) {
      const d = one(rng, 2, 9), q = one(rng, 10, 49), a = d * q;
      if (a >= 20 && a <= 99 && a % 10 !== 0) return calc('div', a, d);
    }
    case 'div-9': { const d = one(rng, 2, 9); return remP(d * one(rng, 2, 9) + one(rng, 1, d - 1), d); }
    case 'div-10': for (;;) {
      const d = one(rng, 2, 9), a = d * one(rng, 10, 49) + one(rng, 1, d - 1);
      if (a >= 20 && a <= 99) return remP(a, d);
    }
    case 'mix-1': {
      if (variant(2) === 0) for (;;) {
        const c = one(rng, 31, 99), a = one(rng, 11, c - 11), b = c - a;
        const blankA = rng() < 0.5, known = blankA ? b : a;
        if (rng() < 0.7 && borrowCount(c, known) === 0) continue;
        return blankA ? fill('add', null, b, c, a) : fill('add', a, null, c, b);
      }
      if (rng() < 0.5) { const a = one(rng, 31, 99), x = one(rng, 11, a - 11); return fill('sub', a, null, a - x, x); }
      const b = one(rng, 11, 60), c = one(rng, 11, 99 - b);
      return fill('sub', null, b, c, b + c);
    }
    case 'mix-2': {
      if (variant(2) === 0) {
        const s = one(rng, 2, 9), q = rng() < 0.5 ? one(rng, 2, 9) : one(rng, 10, 30);
        return rng() < 0.5 ? fill('mul', null, s, s * q, q) : fill('mul', s, null, s * q, q);
      }
      if (rng() < 0.5) { const d = one(rng, 2, 9), c = one(rng, 2, 9); return fill('div', d * c, null, c, d); }
      const b = one(rng, 2, 9), c = one(rng, 2, 30);
      return fill('div', null, b, c, b * c);
    }
    case 'mix-3': {
      const rel = ([1, -1, 0] as const)[variant(3)];
      for (let tries = 0; tries < 400; tries++) {
        const left = randomExpr(rng), v = evalExpr(left);
        const delta = one(rng, 1, 12);
        const number = rel === 0 ? v : rel > 0 ? v - delta : v + delta;
        if (number < 10) continue;
        let right: Expr = { nums: [number], ops: [] };
        if (rng() < 0.25) {
          for (let k = 0; k < 40; k++) {
            const other = randomExpr(rng), w = evalExpr(other);
            if (sign(v - w) === rel && Math.abs(v - w) <= 25 && w >= 10) { right = other; break; }
          }
        }
        return rng() < 0.3 ? cmpP(right, left) : cmpP(left, right);
      }
      return cmpP({ nums: [17, 5], ops: ['mul'] }, { nums: [80], ops: [] });
    }
    case 'mix-4': {
      const form = variant(7);
      const a = one(rng, 2, 9), b = one(rng, 2, 9), prod = a * b;
      if (form === 0) return exprP([a, b, one(rng, 3, 40)], ['mul', 'add']);
      if (form === 1) return exprP([one(rng, 3, 40), a, b], ['add', 'mul']);
      if (form === 2) return exprP([a, b, one(rng, 2, prod - 1)], ['mul', 'sub']);
      if (form === 3) return exprP([one(rng, prod + 1, 99), a, b], ['sub', 'mul']);
      const q = one(rng, 2, 9), d = one(rng, 2, 9);
      if (form === 4) return exprP([d * q, d, one(rng, 3, 40)], ['div', 'add']);
      if (form === 5) return exprP([one(rng, 3, 40), d * q, d], ['add', 'div']);
      return exprP([one(rng, q + 1, 60), d * q, d], ['sub', 'div']);
    }
    default: return makeLegacy(stage, rng);
  }
}

/** The 8 scored problems of a round: reproducible, pairwise different. */
export function questionsFor(stage: Stage, round: number): Problem[] {
  const rng = seededRandom(`${stage.id}:${round}`);
  const found = new Set<string>();
  const out: Problem[] = [];
  for (let tries = 0; out.length < QUESTIONS_PER_STAGE && tries < 1000; tries++) {
    const p = make(stage, rng, out.length, round);
    const key = problemKey(p);
    if (found.has(key)) continue;
    found.add(key); out.push(p);
  }
  if (out.length !== QUESTIONS_PER_STAGE) throw new Error(`not enough questions for ${stage.id}`);
  return out;
}

export function variationFor(stage: Stage, round: number, index: number): Problem {
  const originals = questionsFor(stage, round);
  const used = new Set(originals.map(problemKey));
  for (let offset = 0; offset < 20; offset++) {
    const candidate = questionsFor(stage, round + 101 + index * 20 + offset).find((p) => !used.has(problemKey(p)));
    if (candidate) return candidate;
  }
  throw new Error(`no variation for ${stage.id}:${round}:${index}`);
}

/** Extra problems used to show 拆一拆 before the scored eight: different from the eight and from each other, and the easiest of ~100 candidates. */
export function warmupFor(stage: Stage, round: number, k: number, wants: (p: Problem) => boolean): Problem {
  const taken = new Set(questionsFor(stage, round).map(problemKey));
  for (let j = 0; j < k; j++) taken.add(problemKey(warmupFor(stage, round, j, wants)));
  let best: Problem | null = null;
  for (let offset = 0; offset < 12; offset++) for (const p of questionsFor(stage, round + 7001 + k * 61 + offset)) {
    if (taken.has(problemKey(p)) || !wants(p)) continue;
    if (!best || p.answer < best.answer) best = p;
  }
  if (!best) throw new Error(`no warm-up for ${stage.id}:${round}:${k}`);
  return best;
}

/** One random problem of a stage (used by 测起点 and 超频). */
export function sampleFor(stage: Stage, seed: string, slot = 0): Problem {
  return make(stage, seededRandom(seed), slot, 0);
}
