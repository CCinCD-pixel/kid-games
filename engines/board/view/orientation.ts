// view/orientation.ts — 朝向 / 座位的纯函数（无 DOM）。
import type { Orientation, Piece, Seat, Side } from '../core/types';

export const flipOrientation = (o: Orientation): Orientation => (o === 'first-bottom' ? 'second-bottom' : 'first-bottom');
/** 单人对机器人：孩子执哪一方，哪一方在下（自己的子在下，河字与字形保持正向） */
export const orientationForSide = (kidSide: Side): Orientation => (kidSide === 0 ? 'first-bottom' : 'second-bottom');
/** 面对面（f2f）：棋盘永不翻转；只有后手方的棋子自身转 180° */
export function pieceRotation(p: Piece, seat: Seat, mode: 'none' | 'seat', rotationFor?: (p: Piece, seat: Seat) => number): number {
  if (rotationFor) { const r = rotationFor(p, seat); if (r !== 0 || mode === 'none') return mode === 'none' ? 0 : r; }
  return mode === 'seat' && seat === 'f2f' && p.side === 1 ? 180 : 0;
}
