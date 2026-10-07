// Runtime atlas baking (spec §6.2.3, §8.5): every part is shaded once per (tile width × DPR) into a shelf-packed page,
// plus a same-layout white-silhouette page for the 60 ms hit flash. Rigs are then drawn with one drawImage per part.
import { buildParts, type PartDef } from '../art/parts';
import { shadePart } from '../art/shade';
import { RIGS, type Pose, type Rig } from '../art/rigs';

export interface Slot { x: number; y: number; w: number; h: number }
type Canvas = HTMLCanvasElement | OffscreenCanvas;
type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
const PAD = 3; // du of padding (outline + highlight)

function makeCanvas(w: number, h: number): Canvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
}

export class Atlas {
  readonly page: Canvas; readonly white: Canvas; readonly slots: Record<string, Slot> = {}; readonly a: number; readonly parts: Record<string, PartDef>;
  readonly bakeMs: number;
  /** a = device pixels per design unit; k = CSS pixels per design unit (stroke widths are constant in CSS px) */
  constructor(a: number, k: number = a / 2) {
    const t0 = performance.now();
    this.a = a; this.parts = buildParts();
    const W = 2048; let x = 0, y = 0, rowH = 0;
    const ids = Object.keys(this.parts).sort((p, q) => this.parts[q].h - this.parts[p].h);
    for (const id of ids) {
      const d = this.parts[id]; const w = Math.ceil((d.w + PAD * 2) * a), h = Math.ceil((d.h + PAD * 2) * a);
      if (x + w > W) { x = 0; y += rowH + 2; rowH = 0; }
      this.slots[id] = { x, y, w, h }; x += w + 2; rowH = Math.max(rowH, h);
    }
    const H = Math.min(4096, y + rowH + 2);
    this.page = makeCanvas(W, H); this.white = makeCanvas(W, H);
    const c1 = this.page.getContext('2d') as Ctx, c2 = this.white.getContext('2d') as Ctx;
    for (const id of ids) {
      const d = this.parts[id]; const s = this.slots[id];
      for (const [c, white] of [[c1, false], [c2, true]] as [Ctx, boolean][]) {
        c.save(); c.translate(s.x, s.y); c.scale(a, a); c.translate(PAD, PAD);
        shadePart(c, d.path, white ? 'white' : d.mat, { x: 0, y: 0, w: d.w, h: d.h }, k, { seed: d.seed, marks: white ? undefined : d.marks, markW: d.markW, markColor: d.markColor, outline: d.outline });
        c.restore();
      }
    }
    this.bakeMs = performance.now() - t0;
  }
  /** draw one part with its top-left at the current origin (context already in du space) */
  part(ctx: CanvasRenderingContext2D, id: string, white = false): void {
    const s = this.slots[id]; if (!s) return;
    ctx.drawImage(white ? this.white : this.page, s.x, s.y, s.w, s.h, -PAD, -PAD, s.w / this.a, s.h / this.a);
    if (drawStats.measure) { const m = ctx.getTransform(); drawStats.px += Math.abs(m.a * m.d - m.b * m.c) * (s.w / this.a) * (s.h / this.a); }
  }
  /** same as part() without the fill-rate probe (drawRig measures with the matrix it already has) */
  blit(ctx: CanvasRenderingContext2D, id: string, white: boolean): number {
    const s = this.slots[id]; if (!s) return 0; const w = s.w / this.a, h = s.h / this.a;
    ctx.drawImage(white ? this.white : this.page, s.x, s.y, s.w, s.h, -PAD, -PAD, w, h); return w * h;
  }
}

/**
 * Draw counters for the ?dev overlay and the perf gate (§8.6/§9.8): drawImage calls per frame (≤700) and, while
 * `measure` is on (?dev=perf only — getTransform allocates), the device pixels those drawImages cover (≤3× the screen).
 */
export const drawStats = { calls: 0, px: 0, measure: false };

/**
 * Draw a rig. X, Y in CSS px (feet / origin), k = CSS px per du, dpr = device pixel ratio of the stage canvas.
 * Parts are drawn with setTransform (no save/restore per part).
 */
export function drawRig(ctx: CanvasRenderingContext2D, atlas: Atlas, kind: string, pose: Pose, X: number, Y: number, k: number, dpr: number, o: { alpha?: number; white?: number; scale?: number } = {}): void {
  const rig: Rig | undefined = RIGS[kind]; if (!rig) return;
  const root = pose.root || {};
  const sc = dpr * k * (root.s ?? 1) * (o.scale ?? 1);
  const rr = root.r ?? 0; const cr = Math.cos(rr), sr = Math.sin(rr);
  const ox = (X + (root.x ?? 0) * k) * dpr, oy = (Y + (root.y ?? 0) * k) * dpr;
  // M0 = T(ox,oy)·R(rr)·S(sc)
  const a0 = cr * sc, b0 = sr * sc, c0 = -sr * sc, d0 = cr * sc;
  const passes = o.white && o.white > 0 ? 2 : 1;
  for (let pass = 0; pass < passes; pass++) {
    ctx.globalAlpha = pass === 0 ? (o.alpha ?? 1) : (o.white ?? 0) * (o.alpha ?? 1);
    for (const p of rig.parts) {
      const b = p.b ? pose[p.b] : undefined; if (b && b.hide) continue;
      const x = p.x + (b?.x ?? 0), y = p.y + (b?.y ?? 0);
      const r = (p.r ?? 0) + (b?.r ?? 0); const bs = b?.s ?? 1; const sx = (p.sx ?? 1) * bs, sy = (p.sy ?? 1) * bs;
      const cp = Math.cos(r), sp = Math.sin(r);
      // M = M0 · T(x,y) · R(r) · S(sx,sy) · T(-px,-py)
      const e1 = a0 * x + c0 * y + ox, f1 = b0 * x + d0 * y + oy;
      const a1 = (a0 * cp + c0 * sp) * sx, b1 = (b0 * cp + d0 * sp) * sx, c1 = (-a0 * sp + c0 * cp) * sy, d1 = (-b0 * sp + d0 * cp) * sy;
      const px = p.px ?? 0, py = p.py ?? 0;
      ctx.setTransform(a1, b1, c1, d1, e1 - a1 * px - c1 * py, f1 - b1 * px - d1 * py);
      const area = atlas.blit(ctx, p.p, pass === 1); drawStats.calls++;
      if (drawStats.measure) drawStats.px += Math.abs(a1 * d1 - b1 * c1) * area;
    }
  }
  ctx.globalAlpha = 1;
}
