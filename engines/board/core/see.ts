// core/see.ts — 静态交换（SEE）与战术小工具（孩子口径价值）。用真实 make/unmake 递归，不用 x-ray 列表：
// 炮的攻击依赖炮架，吃子会让炮架出现或消失，x-ray 列表会错（xiangqi.md §8）。过路兵的目标格为空，SEE 视为 0（国象教练可接受）。
import type { Piece, SearchPos, Sq } from './types';

/** 当前局面里 sq 上那颗子的价值（孩子口径；象棋兵过河 = 2 所以与格有关）。空格 = 0 */
export type ValueAt<M> = (pos: SearchPos<M>, sq: Sq) => number;

/** 走子方在 to 格上吃子能净赚多少：最便宜的两个攻击者各试一次（防钉住 / 炮架干扰），可放弃 = 0 */
export function see<M>(pos: SearchPos<M>, to: Sq, valueAt: ValueAt<M>): number {
  const target = pos.pieceAt(to);
  if (!target) return 0;
  const caps = pos.legal(true).filter((m) => pos.to(m) === to && pos.isCapture(m));
  if (caps.length === 0) return 0;
  const cost = caps.map((m) => valueAt(pos, pos.from(m)));
  const order = caps.map((_, i) => i).sort((a, b) => cost[a] - cost[b] || a - b);
  const v = valueAt(pos, to);
  let best = 0;
  for (let i = 0; i < Math.min(2, order.length); i++) {
    const m = caps[order[i]];
    pos.make(m); const g = v - see(pos, to, valueAt); pos.unmake();
    if (g > best) best = g;
  }
  return best;
}
/** 穷举全部攻击者的极小极大（只给测试对拍用） */
export function seeFull<M>(pos: SearchPos<M>, to: Sq, valueAt: ValueAt<M>): number {
  const target = pos.pieceAt(to);
  if (!target) return 0;
  const caps = pos.legal(true).filter((m) => pos.to(m) === to && pos.isCapture(m));
  let best = 0; const v = valueAt(pos, to);
  for (const m of caps) { pos.make(m); const g = v - seeFull(pos, to, valueAt); pos.unmake(); if (g > best) best = g; }
  return best;
}
/** 走子方走吃子着法 m 的净得（孩子口径）：被吃子价值 − 对方在该格的静态交换回收；非吃子 = 0 */
export function netCapture<M>(pos: SearchPos<M>, m: M, valueAt: ValueAt<M>): number {
  if (!pos.isCapture(m)) return 0;
  const v = pos.capturedBy(m), to = pos.to(m);
  pos.make(m); const g = v - see(pos, to, valueAt); pos.unmake();
  return g;
}
/** 走子方能赢到的最大净得（看所有吃子） */
export function bestGain<M>(pos: SearchPos<M>, valueAt: ValueAt<M>): number {
  let best = 0;
  for (const m of pos.legal(true)) { const g = netCapture(pos, m, valueAt); if (g > best) best = g; }
  return best;
}
/** 最大净得的那一对（攻击者格 → 被吃格） */
export function bestGainPair<M>(pos: SearchPos<M>, valueAt: ValueAt<M>): { gain: number; from: Sq; to: Sq } {
  let best = { gain: 0, from: -1, to: -1 };
  for (const m of pos.legal(true)) { const g = netCapture(pos, m, valueAt); if (g > best.gain) best = { gain: g, from: pos.from(m), to: pos.to(m) }; }
  return best;
}
/** 一步杀着法（必须将军；{ stalemate: true } 同时算"困毙判负"） */
export function mateIn1Moves<M>(pos: SearchPos<M>, o: { stalemate?: boolean } = {}): M[] {
  const out: M[] = [];
  for (const m of pos.legal()) {
    pos.make(m); const n = pos.legal().length; const ok = n === 0 && (o.stalemate || pos.inCheck()); pos.unmake();
    if (ok) out.push(m);
  }
  return out;
}
export function hasMateIn1<M>(pos: SearchPos<M>, o: { stalemate?: boolean } = {}): boolean {
  for (const m of pos.legal()) { pos.make(m); const n = pos.legal().length; const ok = n === 0 && (o.stalemate || pos.inCheck()); pos.unmake(); if (ok) return true; }
  return false;
}
/** 走完 m 之后，对方最好的吃子净得（威胁） */
export function threatAfter<M>(pos: SearchPos<M>, m: M, valueAt: ValueAt<M>): number {
  pos.make(m); const g = bestGain(pos, valueAt); pos.unmake(); return g;
}
export type { Piece };
