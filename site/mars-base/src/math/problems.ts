export type Operation = 'add' | 'sub' | 'mul' | 'div';
export interface Stage { id: string; op: Operation; tier: number; title: string }
export interface Problem { a: number; b: number; op: Operation; answer: number }

export const SYMBOL: Record<Operation, string> = { add: '+', sub: '−', mul: '×', div: '÷' };
export const TRACKS: { op: Operation; title: string; color: string; stages: string[] }[] = [
  { op: 'add', title: '加法', color: 'coral', stages: ['10 内相加', '20 内进位', '两位加一位', '整十相加', '两位相加', '进位加法'] },
  { op: 'sub', title: '减法', color: 'teal', stages: ['10 内相减', '20 内退位', '两位减一位', '整十相减', '两位相减', '退位减法'] },
  { op: 'mul', title: '乘法', color: 'gold', stages: ['2 的乘法', '5 的乘法', '10 的乘法', '3 和 4', '6 和 7', '8 和 9'] },
  { op: 'div', title: '除法', color: 'blue', stages: ['除以 2', '除以 5', '除以 10', '除以 3 和 4', '除以 6 和 7', '除以 8 和 9'] },
];
export const STAGES: Stage[] = TRACKS.flatMap((track) => track.stages.map((title, i) => ({ id: `${track.op}-${i + 1}`, op: track.op, tier: i + 1, title })));
export const QUESTIONS_PER_STAGE = 8;
export const PASS_SCORE = 5;

function hash(value: string): number {
  let h = 2166136261;
  for (const char of value) h = Math.imul(h ^ char.charCodeAt(0), 16777619);
  return h >>> 0;
}

function random(seed: number): () => number {
  let state = seed || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function one(rng: () => number, low: number, high: number): number {
  return low + Math.floor(rng() * (high - low + 1));
}

function make(stage: Stage, rng: () => number): Problem {
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
    const factors = [[2], [5], [10], [3, 4], [6, 7], [8, 9]][t - 1];
    const factor = factors[one(rng, 0, factors.length - 1)];
    const other = one(rng, 1, 10);
    if (stage.op === 'mul') { a = factor; b = other; }
    else { a = factor * other; b = factor; }
  }
  const answer = stage.op === 'add' ? a + b : stage.op === 'sub' ? a - b : stage.op === 'mul' ? a * b : a / b;
  return { a, b, op: stage.op, answer };
}

export function questionsFor(stage: Stage, round: number): Problem[] {
  const rng = random(hash(`${stage.id}:${round}`));
  const found = new Set<string>();
  const out: Problem[] = [];
  for (let tries = 0; out.length < QUESTIONS_PER_STAGE && tries < 1000; tries++) {
    const p = make(stage, rng);
    const key = `${p.a}:${p.b}`;
    if (found.has(key)) continue;
    found.add(key); out.push(p);
  }
  if (out.length !== QUESTIONS_PER_STAGE) throw new Error(`not enough questions for ${stage.id}`);
  return out;
}

export function hintFor(p: Problem): string {
  if (p.op === 'add') return p.a + p.b <= 20 ? `从 ${p.a} 开始，再往后数 ${p.b} 个。` : `先加十位，再加个位。`;
  if (p.op === 'sub') return p.a <= 20 ? `从 ${p.a} 开始，往回数 ${p.b} 个。` : `先减十位，再减个位；不够减时向十位借 1 个十。`;
  if (p.op === 'mul') return `想成 ${p.a} 组，每组 ${p.b} 个。`;
  return `把 ${p.a} 个平均分成 ${p.b} 组，每组一样多。`;
}
