// view/effects.ts — 把 rules.effects() 排成时间线（纯函数，无 DOM，可单测）。
// 语义：状态变化 = 先吃 → 再走 → 后升变（与 phase 无关）；phase 只管动画时序：同阶段并行、阶段之间串行。
// 预算：滑行 moveMs(dist)=150+24×格距 且 ≤ 240 ms；落地压扁、吃子飞出与滑行尾段并行；一次最长动作 ≤ 700 ms；reducedMotion ≤ 80 ms。
import type { Effect, Phase, Sq, Theme } from '../core/types';

export interface PlanItem { effect: Effect; phase: Phase; startMs: number; durMs: number; /** 本次着法的"主角"（拖放起点 fromPx 作用于它） */ main: boolean }
export interface Plan { items: PlanItem[]; totalMs: number }
export interface PlanOptions {
  unit: number; center(sq: Sq): { x: number; y: number }; motion: Theme['motion'];
  speed?: number; reduced?: boolean; mainFrom?: Sq; maxTotalMs?: number;
}
export const REDUCED_MS = 80;
export const PROMOTE_MS = 260;
/** 吃子飞出与滑行尾段重叠的毫秒数（落地瞬间对方子开始离场） */
export const CAPTURE_OVERLAP_MS = 70;

export function slideMs(distCells: number, motion: Theme['motion'], speed = 1, reduced = false): number {
  if (reduced) return REDUCED_MS;
  return Math.max(60, Math.min(motion.maxMs, motion.moveMs(distCells)) / Math.max(0.25, speed));
}

export function planEffects(effects: readonly Effect[], o: PlanOptions): Plan {
  const speed = o.speed ?? 1, reduced = !!o.reduced, maxTotal = o.maxTotalMs ?? 700;
  const phases: Phase[] = [0, 1, 2];
  const items: PlanItem[] = [];
  let cursor = 0, prevMoveEnd = 0;
  let mainTaken = false;
  for (const ph of phases) {
    const inPhase = effects.filter((e) => e.phase === ph);
    if (!inPhase.length) continue;
    let start = cursor;
    // 吃子紧跟在滑行之后，但与滑行尾段重叠
    if (inPhase.some((e) => e.k === 'capture') && prevMoveEnd > 0 && !reduced) start = Math.max(0, prevMoveEnd - CAPTURE_OVERLAP_MS);
    let end = start;
    for (const e of inPhase) {
      let dur: number;
      if (e.k === 'move') { const a = o.center(e.from), b = o.center(e.to); dur = slideMs(Math.hypot(a.x - b.x, a.y - b.y) / o.unit, o.motion, speed, reduced); }
      else if (e.k === 'capture') dur = reduced ? REDUCED_MS : o.motion.captureMs / Math.max(0.25, speed);
      else dur = reduced ? REDUCED_MS : PROMOTE_MS / Math.max(0.25, speed);
      const main = e.k === 'move' && !mainTaken && (o.mainFrom === undefined || e.from === o.mainFrom);
      if (main) mainTaken = true;
      items.push({ effect: e, phase: ph, startMs: start, durMs: dur, main });
      end = Math.max(end, start + dur);
      if (e.k === 'move') prevMoveEnd = Math.max(prevMoveEnd, start + dur);
    }
    cursor = end;
  }
  let total = items.reduce((m, i) => Math.max(m, i.startMs + i.durMs), 0);
  if (total > maxTotal && !reduced) { const f = maxTotal / total; for (const i of items) { i.startMs *= f; i.durMs *= f; } total = maxTotal; }
  return { items, totalMs: total };
}
/** 反向（悔棋）：沿原路径倒滑 160 ms；吃子复现（淡入）、升变换回 */
export const UNDO_MS = 160;
