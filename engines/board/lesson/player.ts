// lesson/player.ts — 课播放器：按步骤 id 续播（LessonProgress 存步骤 id，不存下标；题组另存 puzzleIx）；每步前存进度；旁白；
// 孪生确认（选答案类 quiz 首次对也要孪生也对才 ★★★；其余步型走错后给孪生再做一次）；可选步（小战场）问游戏要不要玩；
// 连续两步首试没对 → 下一步先亮 H1（assist）；课星 = 步星平均向上取整（跳过的可选步不计）；cancel() 立刻放手输入。
import type { LessonProgress, StepContext, StepResult } from '../core/types';
import { guessable } from './steps-ask';
import { getRunner, createScope, isCancelled, posOf, type LessonStep, type StepContextImpl } from './registry';
import { twinOf } from './twins';
import './steps';

/** strict = 测验口径（楚河棋院的考考你）：不给辅助档（连续没对也不预亮 H1）、题组不放宽——每一步的 firstTry 如实反映孩子有没有一次做对 */
export interface LessonDef { readonly id: string; readonly steps: readonly LessonStep[]; readonly strict?: boolean }
export interface LessonResult { stars: 0 | 1 | 2 | 3; results: { stepId: string; result: StepResult; skipped?: boolean; optional?: boolean; twin?: StepResult }[]; completed: boolean }
const SKIPPABLE = new Set(['demo', 'card']);
export const rollStars = (rs: readonly StepResult[]): 0 | 1 | 2 | 3 => (rs.length ? (Math.min(3, Math.max(0, Math.ceil(rs.reduce((a, r) => a + r.stars, 0) / rs.length))) as 0 | 1 | 2 | 3) : 0);
export interface LessonPlayerOptions {
  /** 可选步（optional: true，如小战场）要不要玩：游戏弹"来玩一局？"；缺省 = 玩 */
  askOptional?(step: LessonStep): Promise<boolean>;
  /** 每步开始 / 结束的钩子（HUD 进度条、埋点）；孪生题也会触发一次 'start'（step.id 带 ~m 后缀） */
  onStep?(e: { step: LessonStep; index: number; total: number; phase: 'start' | 'end'; result?: StepResult }): void | Promise<void>;
  /* phase end 返回的 Promise 会被等完才进下一步（步后旁白：说完这一步的揭晓句，下一步的局面才摆上盘） */
}
type Mountable = { mount(s: LessonStep, c: StepContext<unknown, unknown>): Promise<StepResult> };

export function createLessonPlayer<M, S>(ctx0: StepContext<M, S>, opts: LessonPlayerOptions = {}) {
  let scope = createScope();
  return {
    cancel() { scope.cancel(); },
    async run(lesson: LessonDef, progress?: LessonProgress | null): Promise<LessonResult> {
      scope = createScope(); const sc = scope; const results: LessonResult['results'] = []; const byId = (id: string): LessonStep | null => lesson.steps.find((s) => s.id === id) ?? null;
      const resumed = progress && progress.lessonId === lesson.id ? lesson.steps.findIndex((s) => s.id === progress.stepId) : -1; const start = Math.max(0, resumed);
      const roll = (): 0 | 1 | 2 | 3 => rollStars(results.filter((r) => !(r.skipped && r.optional)).map((r) => r.result)); let streakBad = 0; let resumeIx = resumed >= 0 ? progress?.puzzleIx : undefined;
      try {
        for (let i = start; i < lesson.steps.length; i++) {
          if (sc.cancelled) return { stars: roll(), results, completed: false };
          const step = lesson.steps[i]; const runner = getRunner(step.k); if (!runner) throw new Error(`unknown-step-kind:${step.k}`);
          const c = { ...ctx0, lessonId: lesson.id, scope: sc, assist: !lesson.strict && streakBad >= 2 ? 1 : 0, strict: lesson.strict === true, resumeIx: i === start ? resumeIx : undefined } as unknown as StepContextImpl<M, S>; resumeIx = undefined;
          ctx0.hooks.save({ lessonId: lesson.id, stepId: step.id, ...(c.resumeIx !== undefined ? { puzzleIx: c.resumeIx } : {}) });
          if (SKIPPABLE.has(step.k) && ctx0.hooks.skip()) { results.push({ stepId: step.id, result: { stars: 3, firstTry: true, hintTier: 0 }, skipped: true }); continue; }
          if (step.optional === true && opts.askOptional && !(await opts.askOptional(step))) { results.push({ stepId: step.id, result: { stars: 3, firstTry: true, hintTier: 0 }, skipped: true, optional: true }); continue; }
          if (step.say) await ctx0.hooks.narrate(step.say).catch(() => undefined);
          opts.onStep?.({ step, index: i, total: lesson.steps.length, phase: 'start' });
          const mount = (s: LessonStep): Promise<StepResult> => (runner as unknown as Mountable).mount(s, c as unknown as StepContext<unknown, unknown>);
          let r = await mount(step); let twinRes: StepResult | undefined;
          const wantTwin = !!step.twin && (step.k === 'quiz' ? guessable(step) || !r.firstTry : !r.firstTry && step.k !== 'bank' && step.k !== 'bank2' && step.k !== 'battle' && step.k !== 'play');
          if (wantTwin) {
            let pos: string | null = null; try { pos = step.pos ?? posOf(step, c); } catch { pos = null; }
            const t = twinOf(step, ctx0.rules, byId, pos); if (t) {
              opts.onStep?.({ step: t, index: i, total: lesson.steps.length, phase: 'start' }); twinRes = await mount(t);
              r = step.k === 'quiz' ? { stars: r.firstTry && twinRes.firstTry && r.hintTier === 0 ? 3 : (Math.min(r.stars, 2) as 1 | 2), firstTry: r.firstTry && twinRes.firstTry, hintTier: Math.max(r.hintTier, twinRes.hintTier) as 0 | 1 | 2 | 3 }
                : { stars: Math.max(r.stars, Math.min(2, twinRes.stars)) as 1 | 2 | 3, firstTry: false, hintTier: Math.max(r.hintTier, twinRes.hintTier) as 0 | 1 | 2 | 3 };
            }
          }
          streakBad = r.firstTry ? 0 : streakBad + 1; results.push({ stepId: step.id, result: r, ...(twinRes ? { twin: twinRes } : {}), ...(step.optional === true ? { optional: true } : {}) }); await opts.onStep?.({ step, index: i, total: lesson.steps.length, phase: 'end', result: r });
        }
      } catch (e) { if (isCancelled(e)) return { stars: roll(), results, completed: false }; throw e; }
      return { stars: roll(), results, completed: true };
    },
  };
}
