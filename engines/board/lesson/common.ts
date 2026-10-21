// lesson/common.ts — 各步型共用：星级、提示展示（H1 高亮 / H2 箭头 / H3 幽灵手）、走错说明。
import type { Disposable, HintSpec, Sq, StepContext } from '../core/types';
import type { LessonStep, StepContextImpl } from './registry';
import { sleep } from './registry';

export type Tier = 0 | 1 | 2 | 3;
export function starsFor(moves: number, par: number | undefined, hintTier: Tier, failures: number): 1 | 2 | 3 {
  if (par !== undefined) return moves === par && hintTier < 3 ? 3 : moves <= par + 2 ? 2 : 1;
  return hintTier === 0 && failures === 0 ? 3 : hintTier <= 1 ? 2 : 1;
}
/** 把 HintSpec 画到棋盘上；返回清除函数（公开 API，保持稳定） */
export function applyHint<M, S>(ctx: StepContext<M, S>, h: HintSpec): () => void {
  const ds: Disposable[] = []; for (const m of h.marks ?? []) ds.push(ctx.view.mark(m.kind, m.sqs, { pulse: true })); if (h.arrow) ds.push(ctx.view.arrow(h.arrow[0], h.arrow[1], 'hint'));
  if (h.ghost?.length) void ctx.hooks.ghost.path(h.ghost); if (h.say) void ctx.hooks.companion.say(h.say); return () => { for (const d of ds) d.dispose(); };
}
/** 提示旁白 id 的缺省表（xiangqi 旁白 h.1.* / h.2 / h.3）；游戏可用 data.hintSay 覆盖 */
const H1: Record<string, string> = { stars: 'h.1.stars', sweep: 'h.1.stars', capture: 'h.1.move', escape: 'h.1.esc', trade: 'h.1.trade', tap: 'h.1.move', quiz: 'h.1.free', bank: 'h.1.mate', bank2: 'h.1.mate', setup: 'h.1.move', battle: 'h.1.free' };
export function hintSayId(step: LessonStep, tier: 1 | 2 | 3): string {
  if (tier === 2) return 'h.2'; if (tier === 3) return 'h.3';
  if (step.k === 'make') return step.goal === 'mate' ? 'h.1.mate' : 'h.1.check'; return H1[step.k] ?? 'h.1.move';
}
export interface HintShow { from?: Sq; to?: Sq; sqs?: readonly Sq[] }
/** 通用提示展示：H1 = 起点 / 若干格脉冲；H2 = 再加箭头；H3 = 再加幽灵手（拖 from→to，或点第一个格）。返回清除函数。 */
export function showHint<M, S>(c: StepContextImpl<M, S>, step: LessonStep, tier: 1 | 2 | 3, h: HintShow): () => void {
  const ds: Disposable[] = []; const say = c.data?.hintSay?.(step, tier) ?? hintSayId(step, tier);
  const marks = h.sqs?.length ? [...h.sqs] : h.from !== undefined ? [h.from] : []; if (marks.length) ds.push(c.view.mark('hint', marks, { pulse: true }));
  if (tier >= 2 && h.from !== undefined && h.to !== undefined) ds.push(c.view.arrow(h.from, h.to, 'hint'));
  if (tier >= 3) { if (h.from !== undefined && h.to !== undefined) void c.hooks.ghost.drag(h.from, h.to); else if (marks.length) void c.hooks.ghost.tap(marks[0]); }
  if (say) void Promise.resolve(c.hooks.narrate(say)).catch(() => undefined);
  return () => { for (const d of ds) d.dispose(); };
}
/** 连续失败 → 档位（经游戏注入的 HintLadder） */
export const tierFor = <M, S>(c: StepContext<M, S>, stepId: string, failures: number): Tier => c.hints.next({ stepId, failures }).tier;
/** 走错 / 点到非法点：说原因（同一原因一步里只说一次）；reason 为空则不说 */
export function explainer<M, S>(c: StepContextImpl<M, S>): (reason: string | null) => void {
  const said = new Set<string>(); return (reason) => { if (!reason || said.has(reason)) return; said.add(reason); void Promise.resolve(c.hooks.narrate('w.' + reason)).catch(() => undefined); };
}
export const holdMs = (c: { wrongHoldMs?: number }): number => c.wrongHoldMs ?? 600;
export { sleep };
