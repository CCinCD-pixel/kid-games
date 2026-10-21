// input/keyboard.ts — 键盘操作：方向键移动光标、Enter / 空格 = 点击当前格、Esc = 取消选择；播报走 aria-live。
import type { Geometry, Orientation, Sq } from '../core/types';

/** 在 dir 方向上找最近的邻格（按几何中心；不依赖行列号，交叉点 / 方格通用） */
export function neighbour(g: Geometry, o: Orientation, from: Sq, dx: number, dy: number): Sq | null {
  const c = g.center(from, o); let best: Sq | null = null, bestScore = Infinity;
  for (let q = 0; q < g.squares; q++) {
    if (q === from) continue; const p = g.center(q, o); const vx = p.x - c.x, vy = p.y - c.y;
    const along = vx * dx + vy * dy; if (along <= g.unit * 0.3) continue;
    const across = Math.abs(vx * dy - vy * dx); const score = along + across * 3; if (score < bestScore) { bestScore = score; best = q; }
  }
  return best;
}
export interface KeyboardApi { tapSquare(sq: Sq): void; cancel(): void; focus(sq: Sq | null): void; cursor(): Sq | null }
export function attachKeyboard(el: HTMLElement, g: Geometry, getOrientation: () => Orientation, api: KeyboardApi, startSq: () => Sq): () => void {
  let cur: Sq | null = null;
  const on = (e: KeyboardEvent): void => {
    const dir: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (e.key in dir) { e.preventDefault(); if (cur === null) cur = startSq(); else { const n = neighbour(g, getOrientation(), cur, dir[e.key][0], dir[e.key][1]); if (n !== null) cur = n; } api.focus(cur); return; }
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (cur === null) cur = startSq(); api.focus(cur); api.tapSquare(cur); return; }
    if (e.key === 'Escape') { e.preventDefault(); api.cancel(); }
  };
  const blur = (): void => { cur = null; api.focus(null); };
  el.addEventListener('keydown', on); el.addEventListener('blur', blur);
  return () => { el.removeEventListener('keydown', on); el.removeEventListener('blur', blur); };
}
