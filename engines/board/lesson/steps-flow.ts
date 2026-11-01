// lesson/steps-flow.ts — 带流程的步型：demo（幽灵手演示）card（对照卡）bank / bank2（题组，每题存检查点）battle（小战场）play（和机器人下一盘，交给游戏）。
import { createGame } from '../core/game';
import type { Disposable, Sq, StepResult } from '../core/types';
import { createPuzzlePlayer } from '../puzzle/player';
import type { BoardViewImpl } from '../view/board-view';
import { advancePawns, BATTLE_DEFAULT, pawnNames, pawnsLeft } from './battle';
import { explainer, holdMs, showHint, tierFor, type Tier } from './common';
import { fenEdit, parseName } from './fen';
import { forceSide } from './solo';
import { CANCELLED, clearLast, nameMap, posOf, registerStep, sleep, stepPromise, type LessonStep, type StepContextImpl } from './registry';

const OK: StepResult = { stars: 3, firstTry: true, hintTier: 0 };
const encSquares = (enc: string): [string, string] | null => { const m = /^([a-z]\d{1,2})([a-z]\d{1,2})/.exec(enc); return m ? [m[1], m[2]] : null; };

/** demo：幽灵手把 step.ghost 一手手走给孩子看（真的走到棋盘上，演完恢复）；非法的着法演示"想走被拒"（说原因、两王见面时亮红）；重复将军逼近长将时说 perp.warn */
registerStep<unknown, unknown>('demo', {
  hint: () => ({}), async demo() { /* demo 本身就是演示 */ },
  async mount(step, ctx) {
    const c = ctx as StepContextImpl<unknown, unknown>; const { rules, view } = c; const pos = posOf(step, c); const g = createGame(rules, pos); const names = nameMap(rules); const explain = explainer(c); let warned = false;
    view.finishAnimations(); view.setState(g.state()); clearLast(view);
    for (const enc of (step.ghost as string[] | undefined) ?? []) {
      if (c.scope?.cancelled) throw CANCELLED; const p = encSquares(enc); if (!p) continue; const a = names.get(p[0]), b = names.get(p[1]); if (a === undefined || b === undefined) continue;
      await c.hooks.ghost.drag(a, b); const mv = rules.decode(g.state(), enc);
      if (mv !== null) { const before = g.state(); g.play(mv); await view.animateMove(mv, before); if (!warned && g.warn().warn) { warned = true; await Promise.resolve(c.hooks.narrate('perp.warn')).catch(() => undefined); } }
      else {
        c.hooks.sfx('soft'); (view as unknown as { bump?(q: Sq): void }).bump?.(a); const why = rules.whyIllegal(g.state(), a, b); explain(why); const ds: Disposable[] = [];
        if (why === 'face') { const kq: Sq[] = []; for (let q = 0; q < rules.geometry.squares; q++) { const pc = rules.pieceAt(g.state(), q); if (pc && pc.type === rules.meta.kingType) kq.push(q); } ds.push(view.mark('danger', kq)); }
        await sleep(900); for (const d of ds) d.dispose();
      }
    }
    await sleep(300); view.finishAnimations(); view.setState(rules.fromFen(pos)); return OK;
  },
});
/** card：对照卡 / 一句话（旁白已由课播放器播）；有步骤 UI 时等孩子点"好" */
registerStep<unknown, unknown>('card', {
  hint: () => ({}), async demo() { /* 无 */ },
  mount(step, ctx) { const c = ctx as StepContextImpl<unknown, unknown>; const ui = c.ui; if (!ui) return Promise.resolve(OK); return stepPromise<StepResult>(c, (done) => { const b = ui.button('好', () => done(OK), { id: `card-${step.id}` }); return () => b.dispose(); }); },
});
/** play：和机器人下一盘 / 小局——交给游戏（data.play）；没有就直接完成 */
registerStep<unknown, unknown>('play', {
  hint: () => ({}), async demo() { /* 无 */ },
  mount(step, ctx) { const c = ctx as StepContextImpl<unknown, unknown>; return c.data?.play ? c.data.play(step, c as never) : Promise.resolve(OK); },
});

/** 题组：逐题走 PuzzlePlayer，每题存检查点（puzzleIx），引导档（guided）或连续两题没一次做对 → 下一题先亮 H1。
 *  放宽只放宽预先亮出的 H1：孩子一步没走错、也没自己再要提示 → 仍算一次做对。走错一步就如实记（QA r3：以前放宽还会赦免走错 ≤ 2 步，
 *  摸底第 9 题因此在前两题没对之后被判一次做对，L25 被白送）。strict（摸底 / 测验）整个不放宽。 */
const bankRunner = {
  hint: () => ({}), async demo() { /* 无 */ },
  async mount(step: LessonStep, ctx: unknown): Promise<StepResult> {
    const c = ctx as StepContextImpl<unknown, unknown>; const ids = (step.ids as string[] | undefined) ?? []; const results: StepResult[] = []; let bad = 0; let wrongNow = 0;
    const pp = createPuzzlePlayer({ rules: c.rules, view: c.view as BoardViewImpl<unknown, unknown>, input: c.input, ghost: c.hooks.ghost, wrongHoldMs: c.wrongHoldMs, opponentDelayMs: c.wrongHoldMs === undefined ? undefined : Math.min(350, c.wrongHoldMs), ui: c.ui, hooks: { onWrong: (i) => { wrongNow = i.wrong; } } });
    const off = c.scope?.onCancel(() => pp.cancel());
    try {
      for (let ix = c.resumeIx ?? 0; ix < ids.length; ix++) {
        if (c.scope?.cancelled) throw CANCELLED; const p = c.data?.puzzle?.(ids[ix], step); if (!p) throw new Error(`no-puzzle:${ids[ix]}`);
        c.hooks.save({ lessonId: c.lessonId ?? '', stepId: step.id, puzzleIx: ix }); wrongNow = 0;
        const run = pp.play(p, { hints: true }); const eased = !c.strict && (step.guided === true || bad >= 2 || !!c.assist); if (eased) pp.requestHint();
        const r = await run; const forgiven = eased && wrongNow === 0 && r.hintTier <= 1; const tier = (forgiven ? 0 : r.hintTier) as Tier; const firstTry = r.firstTry || forgiven;
        results.push({ stars: firstTry && tier === 0 ? 3 : tier <= 1 ? 2 : 1, firstTry, hintTier: tier }); bad = r.firstTry ? 0 : bad + 1;
      }
    } finally { off?.(); }
    if (!results.length) return { stars: 1, firstTry: false, hintTier: 0 };      // 没有题 = 数据错：绝不白送 firstTry（摸底曾因此把 L25 无条件判成已会）
    const allFirst = results.every((r) => r.firstTry); const avg = results.reduce((a, r) => a + r.stars, 0) / results.length;
    return { stars: Math.min(allFirst ? 3 : 2, Math.max(1, Math.round(avg))) as 1 | 2 | 3, firstTry: allFirst, hintTier: Math.max(...results.map((r) => r.hintTier)) as Tier };      // 有一题没一次做对 → 这一步最多 2 星
  },
};
registerStep<unknown, unknown>('bank', bankRunner); registerStep<unknown, unknown>('bank2', bankRunner);

/** battle：小战场。红每走一步，黑卒全部前进一格；卒到底线红败（演示卒冲到底后重来；连败 2 盘少 1 个卒）；星 = 着数 ≤ par → 3，≤ par+1 → 2，赢 → 1 */
registerStep<unknown, unknown>('battle', {
  hint: () => ({}), async demo() { /* 无 */ },
  async mount(step, ctx) {
    const c = ctx as StepContextImpl<unknown, unknown>; const { rules, view } = c; const cfg = { ...BATTLE_DEFAULT, ...(c.data?.battle ?? {}) }; const shape = { rows: rules.geometry.rows, cols: rules.geometry.cols };
    const par = (step.par as number | undefined) ?? 99; let fen = posOf(step, c); let defeats = 0;
    const playOnce = (startFen: string): Promise<{ win: boolean; moves: number }> => {
      let s = forceSide(rules, rules.fromFen(startFen), 0); let moves = 0, busy = false; let clear: () => void = () => undefined;
      view.finishAnimations(); view.setState(s); clearLast(view); const names = nameMap(rules);
      const hint = (): void => { clear(); const lowest = pawnNames(rules, rules.toFen(s), cfg)[0]; const q = lowest ? names.get(lowest) : undefined; if (q !== undefined) clear = showHint(c, step, 1, { sqs: [q] }); };
      if (defeats > 0) hint();
      return stepPromise<{ win: boolean; moves: number }>(c, (done) => {
        const restore = c.input.overrideHooks({
          state: () => s, seatToMove: () => 0, canAct: () => !busy, onIllegal: () => c.hooks.sfx('soft'),
          commit: async (m: unknown) => {
            // 输入锁只罩住红方这一步（动画 ~300 ms）；卒的行军 + 败北停顿在锁外跑，靠 busy 挡住新的点击（QA r3：以前整段 > 2 s 都罩在 anim 锁里，开发版会报超时）
            busy = true; moves++; const before = s; clear();
            try { await view.animateMove(m, before); } catch (e) { busy = false; throw e; }
            s = forceSide(rules, rules.apply(before, m), 0);
            if (pawnsLeft(rules, s, cfg) === 0) { busy = false; c.hooks.sfx('ok'); done({ win: true, moves }); return; }
            void (async () => {
              try {
                const a = advancePawns(rules, s, cfg); await sleep(180); for (const st of a.steps) { if (c.scope?.cancelled) return; await view.animateMove(st.m, st.before); } s = a.s;
                if (a.lost) { c.hooks.sfx('soft'); const bottom = a.steps.find((x) => x.reachedBottom); const mk = bottom ? view.mark('danger', [bottom.to]) : null; await sleep(holdMs(c) + 400); mk?.dispose(); done({ win: false, moves }); }
              } catch { /* 取消 / 视图已销毁：放手 */ } finally { busy = false; }
            })();
          },
        });
        return () => { restore(); clear(); };
      });
    };
    for (;;) {
      const r = await playOnce(fen);
      if (r.win) return { stars: r.moves <= par ? 3 : r.moves <= par + 1 ? 2 : 1, firstTry: defeats === 0, hintTier: defeats > 0 ? 1 : 0 };
      defeats++; if (defeats >= 2 && defeats % 2 === 0) { const worst = pawnNames(rules, fen, cfg)[0]; if (worst) fen = fenEdit(fen, shape, [[worst, '']]); }
    }
  },
});
void parseName; void tierFor;
