// core/coach.ts — 教练防漏着（v1.1）：对"当前所有合法着法"算判定表。
//  hang：走完后对方能静态净赢 ≥2 且比最安全着法多亏 ≥2；allowMate：走完后对方有一步杀或一步困毙（判负规则下）且存在不会被一步杀的着法。
//  CoachRow.victim/attacker = 对方最大净赚的那一对（气泡箭头）；movedIsVictim = 被吃的就是刚拿起的这颗子（两句话文案）。
import { bestGainPair, hasMateIn1, type ValueAt } from './see';
import type { CoachPolicy, CoachRow, RobotLevel, SearchPos } from './types';

export interface CoachOptions<M> {
  valueAt: ValueAt<M>; encode(m: M): string;
  /** 困毙也算"被杀"（象棋：困毙判负；国象：困毙 = 和，设 false） */
  stalemate?: boolean;
  hangMin?: number; hangGap?: number;
}
export function coachTable<M>(pos: SearchPos<M>, o: CoachOptions<M>): CoachRow[] {
  const stalemate = o.stalemate ?? true, hangMin = o.hangMin ?? 2, hangGap = o.hangGap ?? 2;
  const L = pos.legal();
  const info = L.map((m) => {
    const cv = pos.isCapture(m) ? pos.capturedBy(m) : 0;         // 这步自己吃到的子力（孩子口径）
    const to = pos.to(m);
    pos.make(m); const bg = bestGainPair(pos, o.valueAt); const mate = hasMateIn1(pos, { stalemate }); pos.unmake();
    return { m, loss: Math.max(0, bg.gain - cv), mate, victim: bg.to, attacker: bg.from, movedIsVictim: bg.to === to };
  });
  const minLoss = info.length ? Math.min(...info.map((x) => x.loss)) : 0;
  const anySafeMate = info.some((x) => !x.mate);
  return info.map((x) => ({
    m: o.encode(x.m),
    reason: x.mate && anySafeMate ? 'allowMate' : x.loss >= hangMin && x.loss - minLoss >= hangGap ? 'hang' : null,
    loss: x.loss, victim: x.victim, attacker: x.attacker, movedIsVictim: x.movedIsVictim,
  } satisfies CoachRow));
}
/** CoachPolicy 工厂：游戏在 AiPlugin.coach 里用它 */
export function createCoachPolicy<M>(o: CoachOptions<M>): CoachPolicy<M> {
  return { table: (pos) => coachTable(pos, o), cap: (level: RobotLevel) => level.coachCap };
}
