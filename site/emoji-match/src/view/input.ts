/**
 * Board pointer input (spec §2.5, §8.6): first pointer only; drag ≥ max(18 px, 0.28 cell) along the
 * dominant axis swaps immediately (no waiting for lift); tap (<10 px) selects / fires; long press
 * ≥ 350 ms without moving selects a special (the tap alternative for combos).
 */
import { cellAt, type PlayLayout } from './layout';

export interface BoardInputHandlers {
  enabled(): boolean;
  isSpecial(cell: number): boolean;
  onDown?(cell: number): void;
  onDrag(a: number, b: number): void;
  onTap(cell: number, ms: number): void;
  onLong(cell: number): void;
  /** any touch on the board (hint timers, ghost hand) */
  onTouch(): void;
}

export class BoardInput {
  private layout: PlayLayout | null = null;
  private cols = 0; private rows = 0;
  private pid: number | null = null;
  private start = { x: 0, y: 0, t: 0, cell: -1 };
  private consumed = false;
  private longTimer = 0;
  constructor(private el: HTMLElement, private h: BoardInputHandlers) {
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', this.down);
    el.addEventListener('pointermove', this.move);
    el.addEventListener('pointerup', this.up);
    el.addEventListener('pointercancel', this.cancel);
  }
  setLayout(l: PlayLayout, cols: number, rows: number): void { this.layout = l; this.cols = cols; this.rows = rows; }
  private cellOf(e: PointerEvent): number { return this.layout ? cellAt(this.layout, this.cols, this.rows, e.clientX, e.clientY) : -1; }
  private down = (e: PointerEvent) => {
    this.h.onTouch();
    if (this.pid !== null || !this.h.enabled()) return;
    const cell = this.cellOf(e);
    if (cell < 0) return;
    this.pid = e.pointerId;
    try { this.el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    this.start = { x: e.clientX, y: e.clientY, t: performance.now(), cell };
    this.consumed = false;
    this.h.onDown?.(cell);
    window.clearTimeout(this.longTimer);
    if (this.h.isSpecial(cell)) this.longTimer = window.setTimeout(() => { if (this.pid !== null && !this.consumed) { this.consumed = true; this.h.onLong(cell); } }, 350);
  };
  private move = (e: PointerEvent) => {
    if (e.pointerId !== this.pid || this.consumed || !this.layout) return;
    const dx = e.clientX - this.start.x, dy = e.clientY - this.start.y;
    if (Math.hypot(dx, dy) > 10) window.clearTimeout(this.longTimer);
    const th = Math.max(18, 0.28 * this.layout.cell);
    if (Math.abs(dx) < th && Math.abs(dy) < th) return;
    const a = this.start.cell, c = a % this.cols, r = Math.floor(a / this.cols);
    let b = -1;
    if (Math.abs(dx) >= Math.abs(dy)) { const nc = c + Math.sign(dx); if (nc >= 0 && nc < this.cols) b = a + Math.sign(dx); }
    else { const nr = r + Math.sign(dy); if (nr >= 0 && nr < this.rows) b = a + Math.sign(dy) * this.cols; }
    this.consumed = true;
    if (b >= 0 && this.h.enabled()) this.h.onDrag(a, b);
  };
  private up = (e: PointerEvent) => {
    if (e.pointerId !== this.pid) return;
    window.clearTimeout(this.longTimer);
    const was = this.consumed;
    this.pid = null;
    if (was) return;
    const dx = e.clientX - this.start.x, dy = e.clientY - this.start.y;
    if (Math.hypot(dx, dy) <= 10 && this.h.enabled()) this.h.onTap(this.start.cell, performance.now() - this.start.t);
  };
  private cancel = (e: PointerEvent) => { if (e.pointerId === this.pid) { this.pid = null; window.clearTimeout(this.longTimer); } };
  destroy(): void {
    window.clearTimeout(this.longTimer);
    this.el.removeEventListener('pointerdown', this.down);
    this.el.removeEventListener('pointermove', this.move);
    this.el.removeEventListener('pointerup', this.up);
    this.el.removeEventListener('pointercancel', this.cancel);
  }
}
