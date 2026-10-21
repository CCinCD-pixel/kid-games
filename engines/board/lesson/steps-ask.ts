// lesson/steps-ask.ts — "点一点 / 答一答"的步型：tap（点亮的点）quiz（点选格子 / 选答案）setup（摆子）。
// quiz 的 q 种类：palace moves attackers（点格子）· incheck mated stalemate recapture trade safe（选答案按钮）。数据字段见 lessons.v1.json。
import type { Disposable, Sq, StepResult, StepRunner } from '../core/types';
import { showHint, starsFor, tierFor, type Tier } from './common';
import { fenEdit } from './fen';
import { forceSide } from './solo';
import { clearLast, nameMap, posOf, registerStep, stepPromise, type ChoiceOption, type LessonStep, type StepContextImpl } from './registry';

/** 选答案类 quiz 的缺省选项与文案（儿童口径；游戏可用 data.choices 覆盖） */
export const CHOICES: Readonly<Record<string, readonly ChoiceOption[]>> = {
  incheck: [{ id: 'yes', label: '将军了' }, { id: 'no', label: '没有将军' }],
  mated: [{ id: 'mate', label: '将死了' }, { id: 'check-only', label: '还能逃' }],
  stalemate: [{ id: 'stalemate', label: '困毙' }, { id: 'moves-left', label: '还有路走' }],
  recapture: [{ id: 'yes', label: '会被吃回' }, { id: 'no', label: '吃了没事' }],
  trade: [{ id: 'win', label: '赚了' }, { id: 'even', label: '一样' }, { id: 'lose', label: '亏了' }],
  safe: [{ id: 'safe', label: '安全' }, { id: 'unsafe', label: '不安全' }],
};
const SQUARE_Q = new Set(['palace', 'moves', 'attackers']);
/** 这道题要不要"孪生确认"：选答案类（猜中概率高）或选项 ≤3 的点选题 */
export const guessable = (step: LessonStep): boolean => typeof step.answer === 'string' || (Array.isArray(step.opts) && (step.opts as unknown[]).length <= 3);

interface TapSpec { answer: Sq[]; cands?: Sq[]; lit?: Sq[]; ignore?: Sq[]; pre?: (c: StepContextImpl<unknown, unknown>) => Disposable[]; hintFrom?: Sq }
/** 点格子类：答案格全部点到才算完成；点到别的格子记一次失误（候选之外 / 无关格忽略） */
function tapMount(step: LessonStep, c: StepContextImpl<unknown, unknown>, spec: TapSpec): Promise<StepResult> {
  const { view } = c; const left = new Set(spec.answer); let misses = 0, tier: Tier = 0; const keep: Disposable[] = []; let clear: () => void = () => undefined;
  view.finishAnimations(); view.setState(c.rules.fromFen(posOf(step, c))); clearLast(view);
  if (spec.lit?.length) keep.push(view.mark('hint', [...spec.lit], { id: `lit-${step.id}` })); for (const d of spec.pre?.(c) ?? []) keep.push(d);
  return stepPromise<StepResult>(c, (done) => {
    if (c.assist) { tier = 1; clear = showHint(c, step, 1, { sqs: spec.hintFrom !== undefined ? [spec.hintFrom] : [...left].slice(0, 1) }); }
    const restore = c.input.overrideHooks({
      canAct: () => true,
      rawTap: (sq) => {
        if (left.has(sq)) { left.delete(sq); c.hooks.sfx('ok'); keep.push(view.mark('star', [sq])); if (!left.size) { done({ stars: starsFor(0, undefined, tier, misses), firstTry: misses === 0, hintTier: tier }); } return true; }
        if (spec.answer.includes(sq) || (spec.cands && !spec.cands.includes(sq)) || spec.ignore?.includes(sq)) return true;
        misses++; c.hooks.sfx('soft'); const t = tierFor(c, step.id, misses);
        if (t > tier) { tier = t; clear(); const rest = [...left]; clear = showHint(c, step, t as 1 | 2 | 3, t === 1 ? { sqs: spec.hintFrom !== undefined ? [spec.hintFrom] : [] } : { sqs: t === 2 ? rest.slice(0, 1) : rest }); }
        return true;
      },
    });
    return () => { restore(); clear(); for (const d of keep) d.dispose(); };
  });
}
const sqList = (m: Map<string, Sq>, a: unknown): Sq[] => ((a as string[] | undefined) ?? []).map((n) => m.get(n)).filter((q): q is Sq => q !== undefined);

registerStep<unknown, unknown>('tap', {
  hint: () => ({}),
  async demo(step, ctx) { const m = nameMap(ctx.rules); for (const q of sqList(m, step.targets)) await ctx.hooks.ghost.tap(q); },
  mount(step, ctx) { const c = ctx as StepContextImpl<unknown, unknown>; const t = sqList(nameMap(c.rules), step.targets); return tapMount(step, c, { answer: t, lit: t }); },
});

async function revealChoice(step: LessonStep, c: StepContextImpl<unknown, unknown>, names: Map<string, Sq>): Promise<void> {
  const { rules, view } = c; const q = step.q as string;
  if (q === 'incheck' || q === 'mated' || q === 'stalemate') {
    const s = forceSide(rules, rules.fromFen(posOf(step, c)), step.side === 'b' ? 1 : 0); const ci = rules.check(s); const ds: Disposable[] = [];
    if (ci) { ds.push(view.mark('check', [ci.king])); ds.push(view.mark('checker', [...ci.by])); } setTimeout(() => { for (const d of ds) d.dispose(); }, 1500); return;
  }
  const a = names.get(step.from as string), b = names.get(step.to as string); if (a !== undefined && b !== undefined) await c.hooks.ghost.drag(a, b);
}
/** quiz：点格子（palace / moves / attackers）或按按钮选答案（其余） */
registerStep<unknown, unknown>('quiz', {
  hint: () => ({}),
  async demo(step, ctx) { const m = nameMap(ctx.rules); const a = Array.isArray(step.answer) ? sqList(m, step.answer)[0] : undefined; if (a !== undefined) await ctx.hooks.ghost.tap(a); else await revealChoice(step, ctx as StepContextImpl<unknown, unknown>, m); },
  mount(step, ctx) {
    const c = ctx as StepContextImpl<unknown, unknown>; const names = nameMap(c.rules); const q = step.q as string;
    if (SQUARE_Q.has(q)) {
      const answer = sqList(names, step.answer); const cands = q === 'palace' ? sqList(names, step.opts) : undefined; const from = names.get(step.from as string), target = names.get(step.target as string);
      return tapMount(step, c, { answer, cands, lit: q === 'palace' ? cands : undefined, ignore: [from, target].filter((x): x is Sq => x !== undefined), hintFrom: from ?? target, pre: (cc) => (from !== undefined ? [cc.view.mark('select', [from])] : target !== undefined ? [cc.view.mark('danger', [target])] : []) });
    }
    return choiceMount(step, c, names);
  },
});
function choiceMount(step: LessonStep, c: StepContextImpl<unknown, unknown>, names: Map<string, Sq>): Promise<StepResult> {
  const { rules, view } = c; const q = step.q as string; const ui = c.ui; if (!ui) return Promise.reject(new Error('no-step-ui'));
  const options = c.data?.choices?.(q, step) ?? CHOICES[q]; if (!options) return Promise.reject(new Error(`unknown-quiz:${q}`));
  const answer = step.answer as string; let tries = 0, tier: Tier = 0; const keep: Disposable[] = [];
  view.finishAnimations(); view.setState(rules.fromFen(posOf(step, c))); clearLast(view);
  const a = names.get(step.from as string), b = names.get(step.to as string); if (a !== undefined && b !== undefined) keep.push(view.arrow(a, b, 'good'));
  const target = names.get(step.target as string); if (target !== undefined) keep.push(view.mark('danger', [target]));
  const chooser = ui.choose(options); let alive = true; if (c.assist) { tier = 1; chooser.mark(answer, 'hint'); }
  return stepPromise<StepResult>(c, (done) => {
    void (async () => {
      while (alive) {
        const id = await chooser.pick(); if (!alive) return;
        if (id === answer) { chooser.mark(id, 'ok'); c.hooks.sfx('ok'); done({ stars: tries === 0 && tier === 0 ? 3 : tries <= 1 ? 2 : 1, firstTry: tries === 0, hintTier: tier }); return; }
        tries++; chooser.mark(id, 'soft'); c.hooks.sfx('soft'); const t = tierFor(c, step.id, tries); if (t > tier) { tier = t; if (t >= 1) chooser.mark(answer, 'hint'); if (t >= 3) for (const o of options) if (o.id !== answer) chooser.mark(o.id, 'off'); }
        void revealChoice(step, c, names);
      }
    })().catch(() => undefined);
    return () => { alive = false; chooser.dispose(); for (const d of keep) d.dispose(); };
  });
}

/** setup：摆子。data.setup(part) 给出基础局面与要摆的 [格名, 字符]（从左到右）；点亮的点里"下一个子该去的点"最亮，同字符的点任选 */
registerStep<unknown, unknown>('setup', {
  hint: () => ({}),
  async demo(step, ctx) { const c = ctx as StepContextImpl<unknown, unknown>; const spec = c.data?.setup?.(step.part as string, step); const q = spec ? nameMap(c.rules).get(spec.place[0][0]) : undefined; if (q !== undefined) await c.hooks.ghost.tap(q); },
  mount(step, ctx) {
    const c = ctx as StepContextImpl<unknown, unknown>; const { rules, view } = c; const spec = c.data?.setup?.(step.part as string, step); if (!spec) return Promise.reject(new Error(`no-setup-data:${step.part as string}`));
    const names = nameMap(rules); const shape = { rows: rules.geometry.rows, cols: rules.geometry.cols }; const todo = spec.place.map(([n, ch]) => ({ name: n, ch, sq: names.get(n) as Sq })); let fen = spec.base; let misses = 0, tier: Tier = 0; let marks: Disposable[] = []; let clear: () => void = () => undefined;
    view.finishAnimations(); view.setState(rules.fromFen(fen)); clearLast(view); const counter = c.ui?.counter(`还差 ${todo.length} 个`);
    const paint = (): void => { for (const d of marks) d.dispose(); marks = todo.length ? [view.mark('hint', todo.map((t) => t.sq), { id: `su-${step.id}` }), view.mark('hint', [todo[0].sq], { id: `su1-${step.id}`, pulse: true })] : []; };
    paint();
    return stepPromise<StepResult>(c, (done) => {
      const restore = c.input.overrideHooks({
        canAct: () => true,
        rawTap: (sq) => {
          const i = todo.findIndex((t) => t.sq === sq && t.ch === todo[0].ch);
          if (i >= 0) { const t = todo.splice(i, 1)[0]; fen = fenEdit(fen, shape, [[t.name, t.ch]]); view.setState(rules.fromFen(fen)); c.hooks.sfx('ok'); void view.mark('star', [sq]); counter?.set(`还差 ${todo.length} 个`); paint(); if (!todo.length) done({ stars: starsFor(0, undefined, tier, misses), firstTry: misses === 0, hintTier: tier }); return true; }
          misses++; c.hooks.sfx('soft'); const tr = tierFor(c, step.id, misses); if (tr > tier) { tier = tr; clear(); clear = showHint(c, step, tr as 1 | 2 | 3, { sqs: [todo[0].sq] }); } return true;
        },
      });
      return () => { restore(); clear(); counter?.dispose(); for (const d of marks) d.dispose(); };
    });
  },
} satisfies StepRunner<unknown, unknown, LessonStep>);
