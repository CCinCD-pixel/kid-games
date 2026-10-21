// lesson/steps-move.ts — "孩子要走棋"的步型：stars（收星）capture（吃子）sweep（小眼睛）escape（应将）make（走一步将军 / 将死）trade（吃一个看赚亏）。
// 红方连续走、黑子静止（每步把走子方拨回红方）。走错处理对所有步型一致：说原因（whyIllegal）→ 走过去看一眼 → 悔回 →
// 连续 2 / 3 / 4 次触发 H1 / H2 / H3（ctx.hints）；不出现"错"字、不扣星。par 与答案都来自 lessons.mjs 的数据，运行时用 BFS 现算提示。
import { netCapture } from '../core/see';
import { stateSearchAdapter } from '../core/stateadapter';
import type { Disposable, GameRules, MoveInfo, Sq, StepResult, StepRunner } from '../core/types';
import { holdMs, showHint, starsFor, tierFor, explainer, type Tier } from './common';
import { forceSide, cheapestCapture, solve, soloDone, soloMoves, soloNext, soloStart, type SoloGoal, type SoloNode } from './solo';
import { clearLast, nameMap, posOf, registerStep, sleep, stepPromise, type LessonStep, type StepContextImpl } from './registry';

type Kind = 'stars' | 'capture' | 'sweep' | 'escape' | 'make' | 'trade';
interface Task<M, S> {
  goal: SoloGoal; start: SoloNode<S>; heroKind: boolean;
  /** 这一手好不好：ok = 算数；done = 步骤完成；net = trade 的净得；unsafe = sweep 落在危险格 */
  judge(n: SoloNode<S>, m: M): { ok: boolean; done: boolean; next: SoloNode<S>; net?: number; unsafe?: boolean; gotStar?: Sq | null; deadEnd?: boolean };
  /** 从某个节点出发的一条建议着法 */
  best(n: SoloNode<S>): M | null;
  /** 英雄类步型：从 n 出发是否还有解（只有穷尽搜索确认无解才返回 false；maxDepth 限制剩余着数） */
  solvable(n: SoloNode<S>, maxDepth: number): boolean;
}
function escapeKind<M, S>(rules: GameRules<M, S>, s: S, m: M): 'king' | 'capture' | 'block' { const i = rules.moveInfo(s, m); if (i.capture) return 'capture'; return i.piece.type === rules.meta.kingType ? 'king' : 'block'; }

function makeTask<M, S>(kind: Kind, step: LessonStep, c: StepContextImpl<M, S>): Task<M, S> {
  const { rules } = c; const names = nameMap(rules); const sqs = (a: unknown): Sq[] => ((a as string[] | undefined) ?? []).map((n) => names.get(n)).filter((q): q is Sq => q !== undefined);
  const s0 = rules.fromFen(posOf(step, c)); const heroKind = kind === 'stars' || kind === 'capture' || kind === 'sweep';
  const hero = heroKind ? (names.get(step.hero as string) ?? -1) : -1;
  const goal: SoloGoal = { hero, movers: heroKind ? (step.movers ? sqs(step.movers) : [hero]) : [], stars: kind === 'capture' ? [] : sqs(step.stars), targets: kind === 'capture' ? sqs(step.targets) : [], avoid: kind === 'sweep' };
  const start = soloStart(rules, s0, goal); const sa = kind === 'trade' ? stateSearchAdapter(rules) : null;
  const reds = (n: SoloNode<S>): M[] => rules.legalMoves(n.s);
  const keep = (n: SoloNode<S>, m: M): SoloNode<S> => ({ ...n, s: forceSide(rules, rules.apply(n.s, m), 0) });
  if (heroKind) return {
    goal, start, heroKind,
    judge: (n, m) => { const nx = soloNext(rules, goal, n, m); return { ok: !nx.unsafe, done: !nx.unsafe && soloDone(rules, goal, nx), next: nx, unsafe: nx.unsafe, gotStar: nx.gotStar }; },
    best: (n) => solve(rules, goal, n)?.path[0] ?? null,
    solvable: (n, maxDepth) => { const stats = { capped: false }; return solve(rules, goal, n, { maxDepth, maxStates: 30000, stats }) !== null || stats.capped; },
  };
  if (kind === 'escape') {
    const mode = (step.mode as string | undefined) ?? 'any'; const pick = (n: SoloNode<S>): M | null => reds(n).find((m) => mode === 'any' || escapeKind(rules, n.s, m) === mode) ?? null;
    return { goal, start, heroKind, judge: (n, m) => ({ ok: true, done: true, next: keep(n, m) }), best: pick, solvable: () => true };
  }
  if (kind === 'make') {
    const accepts = (n: SoloNode<S>, m: M): boolean => { const s2 = rules.apply(n.s, m); const chk = !!rules.check(s2); if (step.goal !== 'mate') return chk; return chk && rules.legalMoves(s2).length === 0; };
    return { goal, start, heroKind, judge: (n, m) => { const ok = accepts(n, m); return { ok, done: ok, next: keep(n, m) }; }, best: (n) => reds(n).find((m) => accepts(n, m)) ?? null, solvable: () => true };
  }
  // trade：只认吃子；goal 'win' 还要净赚（孩子口径 SEE，含对方回吃）
  const netOf = (n: SoloNode<S>, m: M): number => netCapture(sa!.create(n.s), m, sa!.valueAt);
  const accepts = (n: SoloNode<S>, m: M): boolean => !!rules.moveInfo(n.s, m).capture && (step.goal !== 'win' || netOf(n, m) > 0);
  return { goal, start, heroKind, judge: (n, m) => { const cap = !!rules.moveInfo(n.s, m).capture; const net = cap ? netOf(n, m) : 0; const ok = cap && (step.goal !== 'win' || net > 0); return { ok, done: ok, next: keep(n, m), net }; }, best: (n) => reds(n).find((m) => accepts(n, m)) ?? null, solvable: () => true };
}

function soloRunner<M, S>(kind: Kind): StepRunner<M, S, LessonStep> {
  return {
    hint: () => ({}),                                       // 提示依赖局面，在 mount 里现算（showHint）
    async demo(step, ctx) {
      const c = ctx as StepContextImpl<M, S>; const t = makeTask<M, S>(kind, step, c); const m = t.best(t.start); if (m === null) return;
      c.view.finishAnimations(); c.view.setState(t.start.s); const i = c.rules.moveInfo(t.start.s, m); await c.hooks.ghost.drag(i.from, i.to);
    },
    mount(step, ctx) {
      const c = ctx as StepContextImpl<M, S>; const { rules, view } = c; const T = makeTask<M, S>(kind, step, c); const goal = T.goal;
      let node = T.start; let moves = 0, failures = 0, tier: Tier = 0, busy = false; let clearHint: () => void = () => undefined; const explain = explainer(c);
      const par = typeof step.par === 'number' ? step.par : undefined; const marks: Disposable[] = []; const starMarks = new Map<Sq, Disposable>();
      view.finishAnimations(); view.setState(node.s); clearLast(view);
      for (const q of goal.stars) starMarks.set(q, view.mark('star', [q], { id: `st-${step.id}-${q}` }));
      if (goal.targets.length) marks.push(view.mark('capture', [...goal.targets], { id: `tg-${step.id}`, pulse: true }));
      if (kind === 'escape') { const ci = rules.check(node.s); if (ci) { marks.push(view.mark('check', [ci.king])); if (ci.by.length) marks.push(view.mark('checker', [...ci.by])); } }
      const allowed = (from: Sq): boolean => goal.movers.length === 0 || node.movers.includes(from);
      const show = (t: 1 | 2 | 3): void => { clearHint(); const m = T.best(node); if (m === null) { clearHint = () => undefined; return; } const i = rules.moveInfo(node.s, m); clearHint = showHint(c, step, t, { from: i.from, to: i.to }); };
      const escalate = (): void => { const t = tierFor(c, step.id, failures); if (t > tier) { tier = t; if (t >= 1) { show(t as 1 | 2 | 3); if (kind === 'sweep' && t === 1) peek(); } } };
      /** 小眼睛：英雄此刻能走到的格子里，哪些会被黑方吃掉（琥珀斜纹铺 1 秒） */
      const peek = (): void => { const ds: Sq[] = []; for (const m of soloMoves(rules, node)) if (rules.moveInfo(node.s, m).from === node.hero && soloNext(rules, goal, node, m).unsafe) ds.push(rules.moveInfo(node.s, m).to); if (!ds.length) return; const mk = view.mark('sight', ds); setTimeout(() => mk.dispose(), 1000); };
      const eye = kind === 'sweep' ? c.ui?.button('小眼睛', peek, { id: 'eye' }) : undefined;
      const cleanups = (): void => { clearHint(); eye?.dispose(); for (const m of marks) m.dispose(); for (const m of starMarks.values()) m.dispose(); };

      return stepPromise<StepResult>(c, (done) => {
        if (c.assist) { tier = 1; show(1); }
        const restore = c.input.overrideHooks({
          state: () => node.s, seatToMove: () => 0, canAct: () => !busy, onSelect: (sq) => { if (sq !== null && !allowed(sq)) { (view as unknown as { bump?(q: Sq): void }).bump?.(sq); c.input.select(null); } },
          onIllegal: (reason) => { failures++; c.hooks.sfx('soft'); explain(reason); escalate(); },
          commit: async (m: M) => {
            busy = true;
            try {
              const before = node; const info = rules.moveInfo(before.s, m); if (!allowed(info.from)) { c.hooks.sfx('soft'); busy = false; return; }
              moves++; const capVal = info.capture ? rules.value(before.s, info.capture.sq) : 0; const j = T.judge(before, m);
              if (j.ok && !j.done && T.heroKind && !T.solvable(j.next, Math.min(8, Math.max(1, (par ?? 6) + 2 - moves)))) { j.ok = false; j.deadEnd = true; }                  // 走进死胡同（吃掉了该留着的炮架之类）：当作走错，悔回
              const after = rules.apply(before.s, m); await view.animateMove(m, before.s);
              // 落子动画一结束就放开输入锁（watchdog 2 s 的 anim 锁不该被"看后果"的长尾巴占着）；尾巴在 busy 保护下继续，canAct 为假期间孩子点不动
              void (async () => {
                try {
                  if (j.ok) {
                    node = j.next; if (j.gotStar !== null && j.gotStar !== undefined) { starMarks.get(j.gotStar)?.dispose(); starMarks.delete(j.gotStar); c.hooks.sfx('star'); }
                    if (kind === 'trade') await tradeShow(c, after, info, j.net ?? 0, capVal);
                    if (j.done) { c.hooks.sfx('ok'); busy = false; done({ stars: starsFor(moves, par, tier, failures), firstTry: failures === 0, hintTier: tier }); return; }
                    if (par !== undefined && moves > par + 2) { failures++; escalate(); } else if (tier) show(tier as 1 | 2 | 3);      // 走了一步：提示按新局面重算
                    return;
                  }
                  // 走了但不算数：先让孩子看清后果（小眼睛：黑子吃掉；吃亏：对方回吃 + 筹码），再悔回
                  failures++; c.hooks.sfx('soft');
                  if (kind === 'sweep') await punish(c, after, info.to); else if (kind === 'trade') await tradeShow(c, after, info, j.net ?? 0, capVal);
                  await sleep(holdMs(c)); view.finishAnimations(); await view.animateUndo(m, after, before.s); view.setState(before.s); clearLast(view);
                  escalate();
                } catch (e) { console.warn('[lesson] 步骤收尾出错', e); } finally { busy = false; }
              })();
            } catch (e) { busy = false; throw e; }
          },
        });
        return () => { restore(); cleanups(); };
      });
    },
  };
}
/** 小眼睛：黑方真的把落在危险格上的子吃掉（幽灵回吃），随后整体悔回 */
async function punish<M, S>(c: StepContextImpl<M, S>, afterRed: S, at: Sq): Promise<void> {
  const rc = cheapestCapture(c.rules, afterRed, at, 1); if (!rc) return; await sleep(180); await c.view.animateMove(rc.m, rc.before); await sleep(holdMs(c) / 2);
  const afterBlack = c.rules.apply(rc.before, rc.m); c.view.finishAnimations(); await c.view.animateUndo(rc.m, afterBlack, rc.before);
}
/** 吃一个看赚亏：被保护则幽灵回吃，并飘分数筹码 */
async function tradeShow<M, S>(c: StepContextImpl<M, S>, afterRed: S, info: MoveInfo, net: number, capVal: number): Promise<void> {
  const rc = cheapestCapture(c.rules, afterRed, info.to, 1); let afterBlack: S | null = null;
  if (rc && net < capVal) { await sleep(220); await c.view.animateMove(rc.m, rc.before); afterBlack = c.rules.apply(rc.before, rc.m); }
  await Promise.all([c.ui?.chip?.(info.to, net) ?? Promise.resolve(), sleep(260)]); if (afterBlack && rc) { await sleep(holdMs(c) / 2); c.view.finishAnimations(); await c.view.animateUndo(rc.m, afterBlack, rc.before); }
}
for (const k of ['stars', 'capture', 'sweep', 'escape', 'make', 'trade'] as const) registerStep<unknown, unknown>(k, soloRunner<unknown, unknown>(k));

export { makeTask as lessonTask };
export type { Task as LessonTask };
