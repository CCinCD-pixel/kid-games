// engines/board/games/chess/geometry.ts — 国际象棋几何（方格 8×8；sq = r*8 + c，r 自上 0..7，c = a..h；设计单位 c=100）。
import type { Geometry, Orientation, Sq } from '../../core/types';
import { sqName } from './position';

const rcOf = (s: Sq): { r: number; c: number } => ({ r: (s / 8) | 0, c: s % 8 });
const turn = (r: number, c: number, o: Orientation): { r: number; c: number } => (o === 'second-bottom' ? { r: 7 - r, c: 7 - c } : { r, c });

/** 棋盘区 50..850（margin 0.5c），viewBox 900×900；格心 = 100·(0.5+c)+50 */
export const geometry: Geometry = {
  kind: 'squares', cols: 8, rows: 8, squares: 64, unit: 100, margin: 0.5, viewBox: { w: 900, h: 900 },
  center: (s, o) => { const { r, c } = turn(rcOf(s).r, rcOf(s).c, o); return { x: 100 * (0.5 + c) + 50, y: 100 * (0.5 + r) + 50 }; },
  hit: (x, y, o) => {
    const c = Math.floor(x / 100 - 0.5), r = Math.floor(y / 100 - 0.5);
    if (c < 0 || c > 7 || r < 0 || r > 7) return null;
    const t = turn(r, c, o); return t.r * 8 + t.c;
  },
  name: (s) => sqName(rcOf(s).r, rcOf(s).c),
  flip: (s) => 63 - s,
};
export const sqOf = (r: number, c: number): Sq => r * 8 + c;
