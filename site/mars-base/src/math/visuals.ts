/** HTML builders for the pictures and widgets of the arithmetic station (pure functions of data, no DOM access). */
import { PASS_SCORE, QUESTIONS_PER_STAGE, STAGES, SYMBOL, TRACKS, type Expr, type Problem } from './problems';
import { stageStatus, type MathSave } from './save';
import type { SplitPlan } from './split';

export interface Entry { fields: string[]; active: number; choice: -1 | 0 | 1 | null; state: '' | 'right' | 'wrong' }
export const CMP_SYMBOL: Record<string, string> = { '1': '>', '0': '=', '-1': '<' };

export function exprHtml(e: Expr, markHeavy = false): string {
  const parts: string[] = [];
  e.nums.forEach((n, i) => {
    parts.push(`<span class="ma-n">${n}</span>`);
    if (i < e.ops.length) parts.push(`<em>${SYMBOL[e.ops[i]]}</em>`);
  });
  if (!markHeavy) return parts.join(' ');
  // wrap the multiplication / division pair so the hint can show what goes first
  const html: string[] = [];
  for (let i = 0; i < e.nums.length; i++) {
    const heavyAfter = i < e.ops.length && (e.ops[i] === 'mul' || e.ops[i] === 'div');
    if (heavyAfter) { html.push(`<span class="ma-first"><span class="ma-n">${e.nums[i]}</span> <em>${SYMBOL[e.ops[i]]}</em> <span class="ma-n">${e.nums[i + 1]}</span></span>`); i++; if (i < e.ops.length) html.push(`<em>${SYMBOL[e.ops[i]]}</em>`); continue; }
    html.push(`<span class="ma-n">${e.nums[i]}</span>`);
    if (i < e.ops.length) html.push(`<em>${SYMBOL[e.ops[i]]}</em>`);
  }
  return html.join(' ');
}

const box = (e: Entry, index: number, label: string, text?: string): string => {
  const value = text ?? (e.fields[index] || '?');
  const cls = ['ma-box', e.active === index ? 'is-active' : '', e.fields[index] === '' && text === undefined ? 'is-empty' : '', e.state].filter(Boolean).join(' ');
  return `<button type="button" class="${cls}" data-field="${index}" aria-label="${label}">${value}</button>`;
};

export function equationHtml(p: Problem, e: Entry, markHeavy = false): string {
  switch (p.kind) {
    case 'calc': return `<span class="ma-n">${p.a}</span> <em>${SYMBOL[p.op]}</em> <span class="ma-n">${p.b}</span> <em>=</em> ${box(e, 0, '答案')}`;
    case 'rem': return `<span class="ma-n">${p.a}</span> <em>÷</em> <span class="ma-n">${p.b}</span> <em>=</em> <span class="ma-multi"><small>商</small>${box(e, 0, '商')}</span><em class="ma-dots3">…</em><span class="ma-multi"><small>剩</small>${box(e, 1, '剩下的')}</span>`;
    case 'fill': return `${p.a === null ? box(e, 0, '空格') : `<span class="ma-n">${p.a}</span>`} <em>${SYMBOL[p.op]}</em> ${p.b === null ? box(e, 0, '空格') : `<span class="ma-n">${p.b}</span>`} <em>=</em> <span class="ma-n">${p.c}</span>`;
    case 'expr': return `${exprHtml(p, markHeavy)} <em>=</em> ${box(e, 0, '答案')}`;
    case 'cmp': return `${exprHtml(p.left)} ${box(e, 0, '符号', e.choice === null ? '?' : CMP_SYMBOL[String(e.choice)])} ${exprHtml(p.right)}`;
  }
}

// ---------------------------------------------------------------- pictures
/** the original dot pictures of stages 1–6 */
function amount(value: number, removed = 0): string {
  if (value > 20) {
    const tens = Math.floor(value / 10), ones = value % 10;
    return `<span class="ma-tens">${Array.from({ length: tens }, () => '<i aria-hidden="true">十</i>').join('')}</span><span class="ma-dots">${Array.from({ length: ones }, () => '<i aria-hidden="true"></i>').join('')}</span>`;
  }
  return `<span class="ma-dots">${Array.from({ length: value }, (_, i) => `<i class="${i >= value - removed ? 'is-removed' : ''}" aria-hidden="true"></i>`).join('')}</span>`;
}
export function dotsModel(q: Extract<Problem, { kind: 'calc' }>): string {
  if (q.op === 'add') return `<div class="ma-model" aria-label="${q.a} 个加上 ${q.b} 个"><div><b>先有 ${q.a}</b>${amount(q.a)}</div><span class="ma-model-op">+</span><div><b>再加 ${q.b}</b>${amount(q.b)}</div></div>`;
  if (q.op === 'sub') return q.a <= 20
    ? `<div class="ma-model" aria-label="${q.a} 个拿走 ${q.b} 个"><div><b>先有 ${q.a}，划掉 ${q.b}</b>${amount(q.a, q.b)}</div></div>`
    : `<div class="ma-model" aria-label="${q.a} 个拿走 ${q.b} 个"><div><b>先有 ${q.a}</b>${amount(q.a)}</div><span class="ma-model-op">−</span><div class="ma-remove"><b>拿走 ${q.b}</b>${amount(q.b)}</div></div>`;
  const groups = q.op === 'mul' ? q.a : q.b;
  const each = q.op === 'mul' ? q.b : q.answer;
  return `<div class="ma-model ma-model-groups" aria-label="${groups} 组，每组 ${each} 个">${Array.from({ length: groups }, (_, i) => `<div><b>第 ${i + 1} 组</b>${amount(each)}</div>`).join('')}</div>`;
}

/** the 拆一拆 picture; `at` = index of the step being solved (steps before it show their results) */
export function splitPicture(plan: SplitPlan, at: number): string {
  const s = plan.steps, shape = plan.shape;
  const val = (i: number) => (i < at ? String(s[i].problem.answer) : '?');
  const cur = (i: number) => (i === at ? ' is-now' : i < at ? ' is-done' : '');
  if (shape.kind === 'area') {
    const [tens, units] = shape.cols, total = tens + units;
    const wt = tens, wu = Math.max(units, total * 0.3);
    return `<div class="ma-pic ma-area" style="--rows:${shape.rows}" role="img" aria-label="${shape.rows} 行，拆成 ${tens} 列和 ${units} 列">
      <div class="ma-area-head"><span style="flex:${wt} 1 0">${tens}</span><span style="flex:${wu} 1 0">${units}</span></div>
      <div class="ma-area-grid"><span class="ma-area-side">${shape.rows} 行</span>
        <div class="ma-area-blocks"><div class="ma-block${cur(0)}" style="flex:${wt} 1 0"><small>${tens} × ${shape.rows}</small><b>${val(0)}</b></div><div class="ma-block ma-block-b${cur(1)}" style="flex:${wu} 1 0"><small>${units} × ${shape.rows}</small><b>${val(1)}</b></div></div></div>
      <div class="ma-area-sum${cur(2)}"><span>${val(0)}</span><em>+</em><span>${val(1)}</span><em>=</em><b>${val(2)}</b></div></div>`;
  }
  if (shape.kind === 'bar') {
    const [c1, c2] = shape.chunks, w2 = Math.max(c2, shape.total * 0.3);
    const q = (i: number) => { const p = s[i].problem; return i < at ? (p.kind === 'rem' ? `${p.answer}${p.rem ? ` … ${p.rem}` : ''}` : String(p.answer)) : '?'; };
    return `<div class="ma-pic ma-bar" role="img" aria-label="${shape.total} 拆成 ${c1} 和 ${c2}">
      <div class="ma-bar-total"><b>${shape.total}</b><span>拆成</span></div>
      <div class="ma-bar-chunks"><div class="ma-block${cur(0)}" style="flex:${c1} 1 0"><b>${c1}</b><small>÷ ${shape.divisor}</small><i>${q(0)}</i></div><div class="ma-block ma-block-b${cur(1)}" style="flex:${w2} 1 0"><b>${c2}</b><small>÷ ${shape.divisor}</small><i>${q(1)}</i></div></div>
      <div class="ma-area-sum${cur(2)}"><span>${val(0)}</span><em>+</em><span>${s[1].problem.kind === 'rem' ? (1 < at ? String(s[1].problem.answer) : '?') : val(1)}</span><em>=</em><b>${val(2)}</b></div></div>`;
  }
  const nodes: string[] = [`<span class="ma-node is-start">${shape.start}</span>`];
  shape.chunks.forEach((chunk, i) => {
    nodes.push(`<span class="ma-hop${cur(i)}">${shape.sign > 0 ? '+' : '−'}${chunk}</span>`, `<span class="ma-node${cur(i)}${i === shape.chunks.length - 1 ? ' is-end' : ''}">${val(i)}</span>`);
  });
  return `<div class="ma-pic ma-path" role="img" aria-label="从 ${shape.start} ${shape.sign > 0 ? '一块一块地加' : '一块一块地减'}">${nodes.join('')}</div>`;
}

// ---------------------------------------------------------------- gauges
export function energyHtml(cells: ('ok' | 'soft')[], total: number, now: number, streak: number, burst: boolean): string {
  const items = Array.from({ length: total }, (_, i) => `<i class="${cells[i] ? `is-${cells[i]}` : i === now ? 'is-now' : ''}"></i>`).join('');
  const label = streak >= 3 ? `连对 ${streak}` : '能量';
  return `<div class="ma-energy${burst ? ' is-burst' : ''}${streak >= 3 ? ' is-hot' : ''}" role="img" aria-label="能量条，已点亮 ${cells.length} 格"><span class="ma-energy-label">${label}</span><div class="ma-energy-cells" style="--n:${total}">${items}</div></div>`;
}

export function bayHtml(save: MathSave): string {
  const groups = TRACKS.map((track) => `<div class="ma-bay-group ma-${track.color}" title="${track.title}">${STAGES.filter((s) => s.op === track.op).map((s) => `<i class="is-${stageStatus(save, s)}"></i>`).join('')}</div>`).join('');
  const done = STAGES.filter((s) => { const st = stageStatus(save, s); return st === 'passed' || st === 'placed'; }).length;
  return `<section class="ma-bay" aria-label="基地舱段，已点亮 ${done} / ${STAGES.length}"><div class="ma-bay-head"><b>基地舱段</b><span>${done} / ${STAGES.length}</span></div><div class="ma-bay-groups" aria-hidden="true">${groups}</div></section>`;
}

export const starsFor = (score: number): number => (score >= QUESTIONS_PER_STAGE ? 3 : score >= QUESTIONS_PER_STAGE - 1 ? 2 : score >= PASS_SCORE ? 1 : 0);
export const starText = (n: number): string => '★'.repeat(n) + '☆'.repeat(3 - n);
