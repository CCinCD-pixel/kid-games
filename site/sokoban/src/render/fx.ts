/**
 * Effects and signal overlays (spec §6.4/§6.6): a light particle pool (≤ 120, dust), and the
 * night-blue signals that are always drawn last (never hidden by a wall): footprints, selection
 * arrows, ✕ badges with a dashed frame, hint ring, ripples, the unreachable frame, lock rings.
 * Signals: night-blue #0C1230 + 2 px paper-white outline; meaning by shape, never by crate colour.
 */
import { DEAD_X, LOCK_LED, SIGNAL, SIGNAL_EDGE } from './palette';
import { ARROW_RIGHT, P, TREAD_BARS, TREAD_PRINT, check, circle, cross, rrect } from './shapes';

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  r: number;
  color: string;
  /** grid row the particle is drawn with (painter order) */
  row: number;
  gravity: number;
}

export class Particles {
  items: Particle[] = [];
  private seed = 1;
  enabled = true;

  /** deterministic pseudo-random in [0,1) (visual only) */
  rand(): number {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  dust(x: number, y: number, s: number, n: number, row: number, dir: { x: number; y: number } = { x: 0, y: 0 }, color = 'rgba(232, 213, 177, 0.95)'): void {
    if (!this.enabled) return;
    for (let i = 0; i < n; i += 1) {
      if (this.items.length >= 120) this.items.shift();
      const a = this.rand() * Math.PI * 2;
      const sp = (0.25 + this.rand() * 0.55) * s;
      this.items.push({
        x: x + (this.rand() - 0.5) * 0.3 * s,
        y: y + (this.rand() - 0.5) * 0.08 * s,
        vx: Math.cos(a) * sp * 0.9 - dir.x * 0.35 * s,
        vy: -Math.abs(Math.sin(a)) * sp * 0.55 - dir.y * 0.2 * s,
        life: 0,
        max: 0.32 + this.rand() * 0.22,
        r: (0.03 + this.rand() * 0.035) * s,
        color,
        row,
        gravity: 0.9 * s,
      });
    }
  }

  step(dt: number): boolean {
    if (!this.items.length) return false;
    const next: Particle[] = [];
    for (const p of this.items) {
      p.life += dt;
      if (p.life >= p.max) continue;
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.9;
      next.push(p);
    }
    this.items = next;
    return next.length > 0;
  }

  drawRow(ctx: CanvasRenderingContext2D, row: number): void {
    for (const p of this.items) {
      if (p.row !== row) continue;
      const k = 1 - p.life / p.max;
      ctx.globalAlpha = Math.max(0, k);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * (0.6 + 0.4 * k), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

/** Signal ink: night-blue fill with a paper-white outline stroke under it. */
function inked(ctx: CanvasRenderingContext2D, path: Path2D, edge = 5): void {
  ctx.lineJoin = 'round';
  ctx.strokeStyle = SIGNAL_EDGE;
  ctx.lineWidth = edge;
  ctx.stroke(path);
  ctx.fillStyle = SIGNAL;
  ctx.fill(path);
}

/** Pair of tread prints at a stand cell, facing `dir` (0 up 1 down 2 left 3 right). (x, y) = cell top-left px. */
export function drawFootprints(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, dir: number, t: number, alpha: number): void {
  const rot = [0, Math.PI, -Math.PI / 2, Math.PI / 2][dir];
  ctx.save();
  ctx.translate(x + s / 2, y + s / 2);
  ctx.scale(s / 100, s / 100);
  ctx.rotate(rot);
  ctx.globalAlpha *= alpha;
  // a soft paper halo so the prints read on every floor
  ctx.fillStyle = `rgba(255, 250, 240, ${0.55 * Math.min(1, t * 2)})`;
  ctx.beginPath();
  ctx.ellipse(0, 4, 30, 26, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.scale(1.25, 1.25);
  for (const [i, dx] of [[0, -11], [1, 11]] as const) {
    const k = Math.max(0, Math.min(1, (t - i * 0.25) / 0.75));
    if (k <= 0) continue;
    const sc = k < 1 ? 0.6 + 0.55 * k - 0.15 * k * k : 1;
    ctx.save();
    ctx.translate(dx, 4 + (i ? -6 : 6));
    ctx.scale(sc, sc);
    inked(ctx, P(TREAD_PRINT), 4.5);
    ctx.strokeStyle = 'rgba(255, 250, 240, 0.55)';
    ctx.lineWidth = 1.8;
    ctx.lineCap = 'round';
    ctx.stroke(P(TREAD_BARS));
    ctx.restore();
  }
  ctx.restore();
}

/** One selection arrow pointing `dir` from the crate centre (cx, cy) px; `t` 0 … 1 slide-out. */
export function drawArrow(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, dir: number, t: number, pressed = false): void {
  const rot = [-Math.PI / 2, Math.PI / 2, Math.PI, 0][dir];
  const dist = 0.6 * s * t;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  ctx.translate(dist + 0.08 * s, 0);
  const k = (s / 100) * (0.8 + 0.2 * t) * (pressed ? 0.88 : 1);
  ctx.scale(k, k);
  ctx.globalAlpha *= Math.min(1, t * 1.6);
  ctx.fillStyle = 'rgba(3, 5, 22, 0.3)';
  ctx.save();
  ctx.translate(0, 3);
  ctx.fill(P(ARROW_RIGHT));
  ctx.restore();
  inked(ctx, P(ARROW_RIGHT), 7);
  ctx.restore();
}

/** H2 push arrow, pointing right (unit: crate = 100): a short shaft and a wide head, rounded by the edge stroke. */
const PUSH_ARROW = 'M-23 -8H-3V-22L23 0L-3 22V8H-23Z';

/**
 * H2 (spec §5.1): a bold night-blue arrow ON the crate top pointing the way to push (paper-white
 * edge) — different in shape from the selection arrows around a crate. (cx, cy) px.
 */
export function drawPushChevron(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, dir: number, t: number): void {
  if (t <= 0) return;
  const rot = [-Math.PI / 2, Math.PI / 2, Math.PI, 0][dir];
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  const k = (s / 100) * (0.7 + 0.3 * Math.min(1, t));
  ctx.scale(k, k);
  ctx.globalAlpha *= Math.min(1, t * 2);
  // one bold block arrow (shaft + head): a thick chevron alone reads as a heart when it points down
  ctx.fillStyle = 'rgba(3, 5, 22, 0.28)';
  ctx.translate(0, 3);
  ctx.fill(P(PUSH_ARROW));
  ctx.translate(0, -3);
  inked(ctx, P(PUSH_ARROW), 7);
  ctx.restore();
}

/** ✕ badge on a dead crate: night disc, paper rim, amber ✕; pop 0 → 1.15 → 1. (cx, cy) px. */
export function drawDeadBadge(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, t: number): void {
  if (t <= 0) return;
  const pop = t < 0.6 ? (t / 0.6) * 1.15 : 1.15 - 0.15 * ((t - 0.6) / 0.4);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale((s / 100) * pop, (s / 100) * pop);
  ctx.fillStyle = 'rgba(3, 5, 22, 0.25)';
  ctx.fill(P(circle(0, 3, 19)));
  ctx.fillStyle = SIGNAL;
  ctx.fill(P(circle(0, 0, 17)));
  ctx.strokeStyle = SIGNAL_EDGE;
  ctx.lineWidth = 3.2;
  ctx.stroke(P(circle(0, 0, 17)));
  ctx.strokeStyle = DEAD_X;
  ctx.lineWidth = 5.2;
  ctx.lineCap = 'round';
  ctx.stroke(P(cross(0, 0, 7)));
  ctx.restore();
}

/** Double dashed frame (inner night-blue / outer paper-white) around a crate at cell (x, y) px. */
export function drawDeadFrame(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, alpha: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s / 100, s / 100);
  ctx.globalAlpha *= alpha;
  const p = P(rrect(1, -19, 98, 118, 14));
  ctx.setLineDash([9, 7]);
  ctx.lineWidth = 6.5;
  ctx.strokeStyle = SIGNAL_EDGE;
  ctx.stroke(p);
  ctx.lineWidth = 3;
  ctx.strokeStyle = SIGNAL;
  ctx.stroke(p);
  ctx.restore();
}

/** Unreachable target: night-blue dashed cell frame (fades out). (x, y) = cell top-left px. */
export function drawUnreachable(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, alpha: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s / 100, s / 100);
  ctx.globalAlpha *= alpha;
  const p = P(rrect(8, 8, 84, 84, 14));
  ctx.setLineDash([10, 8]);
  ctx.lineWidth = 7;
  ctx.strokeStyle = SIGNAL_EDGE;
  ctx.stroke(p);
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = SIGNAL;
  ctx.stroke(p);
  ctx.restore();
}

/** Tap target ring (walk destination flash) at a cell. */
export function drawTargetRing(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, t: number): void {
  ctx.save();
  ctx.translate(x + s / 2, y + s / 2);
  ctx.scale(s / 100, s / 100);
  ctx.globalAlpha *= 1 - t;
  ctx.strokeStyle = SIGNAL_EDGE;
  ctx.lineWidth = 6;
  ctx.stroke(P(circle(0, 0, 22 + 10 * t)));
  ctx.strokeStyle = SIGNAL;
  ctx.lineWidth = 3;
  ctx.stroke(P(circle(0, 0, 22 + 10 * t)));
  ctx.restore();
}

/** Paper ripple (a gesture that was received but did not count). (x, y) px. */
export function drawRipple(ctx: CanvasRenderingContext2D, x: number, y: number, t: number): void {
  ctx.save();
  ctx.globalAlpha = 0.25 * (1 - t);
  ctx.strokeStyle = '#FFFAF0';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(x, y, 10 + 26 * t, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#FFFAF0';
  ctx.globalAlpha = 0.18 * (1 - t);
  ctx.beginPath();
  ctx.arc(x, y, 8 + 16 * t, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Lock-in light ring: radius 0.40 s → 0.62 s, α .6 → 0. (cx, cy) px. */
export function drawLockRing(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, t: number): void {
  ctx.save();
  ctx.globalAlpha = 0.6 * (1 - t);
  ctx.strokeStyle = LOCK_LED;
  ctx.lineWidth = Math.max(2, 0.06 * s * (1 - t * 0.5));
  ctx.shadowColor = 'rgba(143, 247, 236, 0.8)';
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.arc(cx, cy, (0.4 + 0.22 * t) * s, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/** Hint H1 ring around a crate (night-blue + paper-white), pulsing. */
export function drawHintRing(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, pulse: number): void {
  ctx.save();
  const r = (0.56 + 0.05 * pulse) * s;
  ctx.lineWidth = Math.max(5, 0.1 * s);
  ctx.strokeStyle = SIGNAL_EDGE;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = Math.max(3, 0.06 * s);
  ctx.strokeStyle = SIGNAL;
  ctx.stroke();
  ctx.restore();
}

/**
 * Route preview (spec §6.2 "路线虚线", §2.3 0-2 tutor): a dashed night-blue walk with a paper-white
 * edge through cell centres (canvas px), revealed up to `reveal` (0 … 1 of its length), ending in a
 * small chevron. `pts` are the walk's cell centres including the start.
 */
export function drawRoute(ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[], s: number, reveal: number, alpha: number): void {
  if (pts.length < 2 || alpha <= 0 || reveal <= 0) return;
  const seg: number[] = [];
  let total = 0;
  for (let i = 1; i < pts.length; i += 1) {
    const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    seg.push(d);
    total += d;
  }
  const want = total * Math.min(1, reveal);
  const path = new Path2D();
  path.moveTo(pts[0].x, pts[0].y);
  let acc = 0;
  let end = pts[0];
  let dirx = 1;
  let diry = 0;
  for (let i = 1; i < pts.length; i += 1) {
    const a = pts[i - 1];
    const b = pts[i];
    const d = seg[i - 1];
    dirx = (b.x - a.x) / (d || 1);
    diry = (b.y - a.y) / (d || 1);
    if (acc + d >= want) {
      const k = (want - acc) / (d || 1);
      end = { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
      path.lineTo(end.x, end.y);
      break;
    }
    path.lineTo(b.x, b.y);
    end = b;
    acc += d;
  }
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = SIGNAL_EDGE;
  ctx.lineWidth = Math.max(7, 0.13 * s);
  ctx.setLineDash([0.16 * s, 0.13 * s]);
  ctx.stroke(path);
  ctx.strokeStyle = SIGNAL;
  ctx.lineWidth = Math.max(4, 0.075 * s);
  ctx.stroke(path);
  ctx.setLineDash([]);
  // chevron at the head
  const k = s / 100;
  ctx.translate(end.x, end.y);
  ctx.rotate(Math.atan2(diry, dirx));
  const head = new Path2D(`M${-6 * k} ${-11 * k}L${8 * k} 0L${-6 * k} ${11 * k}`);
  ctx.strokeStyle = SIGNAL_EDGE;
  ctx.lineWidth = Math.max(8, 0.14 * s);
  ctx.stroke(head);
  ctx.strokeStyle = SIGNAL;
  ctx.lineWidth = Math.max(4.5, 0.08 * s);
  ctx.stroke(head);
  ctx.restore();
}

/**
 * 侦探题 marks (spec §3.7): a magnifier badge on a tapped crate (night-blue + paper edge); `ok` turns it
 * into the cyan ✓ of a crate that can still reach a pad. (cx, cy) px; `t` 0 … 1 pop.
 */
export function drawQuizMark(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, t: number, ok = false): void {
  if (t <= 0) return;
  const pop = t < 0.6 ? (t / 0.6) * 1.15 : 1.15 - 0.15 * ((t - 0.6) / 0.4);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale((s / 100) * pop, (s / 100) * pop);
  ctx.fillStyle = 'rgba(3, 5, 22, 0.28)';
  ctx.fill(P(circle(0, 4, 23)));
  ctx.fillStyle = SIGNAL;
  ctx.fill(P(circle(0, 0, 21)));
  ctx.strokeStyle = SIGNAL_EDGE;
  ctx.lineWidth = 3.4;
  ctx.stroke(P(circle(0, 0, 21)));
  ctx.lineCap = 'round';
  if (ok) {
    ctx.strokeStyle = LOCK_LED;
    ctx.lineWidth = 5.6;
    ctx.stroke(P(check(0, 0, 11)));
  } else {
    ctx.strokeStyle = SIGNAL_EDGE;
    ctx.lineWidth = 4;
    ctx.stroke(P(circle(-3, -3, 8.5)));
    ctx.lineWidth = 5.2;
    ctx.beginPath();
    ctx.moveTo(3.5, 3.5);
    ctx.lineTo(11, 11);
    ctx.stroke();
  }
  ctx.restore();
}

/** A soft LED-cyan square on a cell (a ghost crate's slide path in the 侦探题 reveal). (x, y) = cell top-left px. */
export function drawLitCell(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, a: number): void {
  if (a <= 0) return;
  ctx.save();
  ctx.globalAlpha = 0.45 * a;
  ctx.fillStyle = LOCK_LED;
  ctx.fill(P(rrect(x + 0.12 * s, y + 0.12 * s, 0.76 * s, 0.76 * s, 0.14 * s)));
  ctx.restore();
}
