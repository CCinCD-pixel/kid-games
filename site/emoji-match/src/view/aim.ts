/**
 * Tool aiming (spec §2.5, §8.4 AIM state, §8.6): while a tool is armed a transparent layer between the
 * board and the HUD takes the pointer — the HUD (tool buttons, ⏸, 🏠) stays on top and usable.
 *   激光钻 drill   : tap a cell (press shows the target ring, release fires)
 *   离子炮 ion     : 横/竖 keys in the subtitle lane; pressing on the board previews that row/column
 *                    live, lifting the finger fires it
 *   牵引臂 tractor : tap two ADJACENT cells (after the first a preview links its neighbours)
 * Tapping outside the board (or the same tool again) cancels without spending anything.
 */
import type { BoosterUse } from '../core/types';
import type { ToolId } from './art/tools';
import { cellAt, type PlayLayout } from './layout';
import type { Scene } from './scene';

export interface AimHost {
  layout(): PlayLayout;
  W: number; H: number;
  scene: Scene;
  /** cells this tool may act on (engine boosterTargets) */
  targets(t: ToolId): number[];
  fire(use: BoosterUse): void;
  cancel(): void;
  redraw(): void;
  touched(): void;
}

export class AimController {
  tool: ToolId | null = null;
  dir: 'H' | 'V' = 'H';
  private first = -1;
  private pid: number | null = null;
  private cell = -1;
  private valid = new Set<number>();
  private layer: HTMLElement;
  constructor(parent: HTMLElement, private h: AimHost) {
    this.layer = document.createElement('div');
    this.layer.className = 'em-aimlayer';
    this.layer.hidden = true;
    parent.append(this.layer);
    this.layer.addEventListener('pointerdown', this.down);
    this.layer.addEventListener('pointermove', this.move);
    this.layer.addEventListener('pointerup', this.up);
    this.layer.addEventListener('pointercancel', () => { this.pid = null; this.preview(-1); });
  }
  get active(): boolean { return this.tool !== null; }
  start(t: ToolId): void {
    this.tool = t; this.first = -1; this.pid = null;
    this.valid = new Set(this.h.targets(t));
    this.layer.hidden = false;
    const s = this.h.scene;
    s.maskAlpha = 0.3;
    s.maskCells = t === 'ion' ? null : [...this.valid];
    s.aimTargets = [...this.valid];
    s.aimCells = []; s.selected = -1;
    this.h.redraw();
  }
  setDir(d: 'H' | 'V'): void { this.dir = d; if (this.cell >= 0 && this.pid !== null) this.preview(this.cell); }
  stop(): void {
    this.tool = null; this.first = -1; this.pid = null; this.cell = -1;
    this.layer.hidden = true;
    const s = this.h.scene;
    s.maskCells = null; s.maskAlpha = 0.6; s.aimCells = []; s.aimTargets = []; s.selected = -1;
    this.h.redraw();
  }
  private cellOf(e: PointerEvent): number { return cellAt(this.h.layout(), this.h.W, this.h.H, e.clientX, e.clientY, 0); }
  private lineCells(i: number): number[] {
    const W = this.h.W, out: number[] = [];
    const r = Math.floor(i / W), c = i % W;
    if (this.dir === 'H') { for (let x = 0; x < W; x += 1) if (this.h.scene.mask[r * W + x]) out.push(r * W + x); }
    else for (let y = 0; y < this.h.H; y += 1) if (this.h.scene.mask[y * W + c]) out.push(y * W + c);
    return out;
  }
  private preview(i: number): void {
    const s = this.h.scene;
    if (this.tool === 'ion') { s.aimCells = i >= 0 ? this.lineCells(i) : []; s.maskCells = i >= 0 ? s.aimCells.slice() : null; }
    else if (this.tool === 'drill') s.aimCells = i >= 0 && this.valid.has(i) ? [i] : [];
    this.h.redraw();
  }
  private adjacent(a: number, b: number): boolean {
    const W = this.h.W;
    return Math.abs(a - b) === W || (Math.abs(a - b) === 1 && Math.floor(a / W) === Math.floor(b / W));
  }
  private down = (e: PointerEvent) => {
    this.h.touched();
    if (!this.tool || this.pid !== null) return;
    const i = this.cellOf(e);
    if (i < 0 || !this.h.scene.mask[i]) { this.h.cancel(); return; }
    this.pid = e.pointerId; this.cell = i;
    try { this.layer.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    if (this.tool !== 'tractor') this.preview(i);
  };
  private move = (e: PointerEvent) => {
    if (e.pointerId !== this.pid || !this.tool) return;
    const i = this.cellOf(e);
    if (i !== this.cell) { this.cell = i; if (this.tool !== 'tractor') this.preview(i); }
  };
  private up = (e: PointerEvent) => {
    if (e.pointerId !== this.pid || !this.tool) return;
    this.pid = null;
    const i = this.cellOf(e);
    const t = this.tool;
    if (t === 'drill') { if (i >= 0 && this.valid.has(i)) this.h.fire({ t: 'drill', a: i }); else this.preview(-1); return; }
    if (t === 'ion') { if (i >= 0 && this.h.scene.mask[i]) this.h.fire({ t: 'ion', a: i, dir: this.dir }); else this.preview(-1); return; }
    // tractor: two taps on adjacent movable cells
    if (i < 0 || !this.valid.has(i)) return;
    const s = this.h.scene;
    if (this.first < 0 || i === this.first) {
      this.first = i === this.first ? -1 : i;
      s.aimCells = this.first >= 0 ? [this.first] : [];
      s.maskCells = this.first >= 0 ? [this.first, ...[...this.valid].filter((j) => this.adjacent(this.first, j))] : [...this.valid];
      this.h.redraw();
      return;
    }
    if (!this.adjacent(this.first, i)) { this.first = i; s.aimCells = [i]; s.maskCells = [i, ...[...this.valid].filter((j) => this.adjacent(i, j))]; this.h.redraw(); return; }
    const a = this.first;
    this.first = -1;
    this.h.fire({ t: 'tractor', a, b: i });
  };
  /** after a refused tractor pair: back to picking the first cell */
  reset(): void { if (this.tool) this.start(this.tool); }
  destroy(): void { this.layer.remove(); }
}
