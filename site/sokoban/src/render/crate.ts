/**
 * Supply crate (spec §6.4): rounded top face (inset 0.08 s, r 0.10 s) raised 0.20 s over a darker
 * front face, 0.04 s outline, three ribs, corner guards, an amber sealing tape and the colour's
 * symbol (★ for 星港补给). Locked on its pad: a night-blue chip with an LED ✓, clasps, +8 % light,
 * pad marks outside the outline (the crate hides the pad ring). Dead: desaturated 30 %.
 */
import { CRATES, LOCK_LED, SIGNAL, SYMBOL_INK, TAPE } from './palette';
import { P, check, rrect, symbolPath } from './shapes';

export interface CrateLook {
  color: number;
  /** 0..1 lock-in progress (clasps slide in, chip lights) */
  lock: number;
  dead?: boolean;
  /** lift above the floor (cell units ×100), for the drop-in */
  lift?: number;
  /** vertical squash (1 = none) around the base */
  sy?: number;
  sx?: number;
  /** shake rotation (deg) */
  rot?: number;
  /** sink into the lift (0..1): scaleY 1→0.6, darker, lower */
  sink?: number;
  alpha?: number;
}

const TOP = rrect(8, -12, 84, 84, 10);
const FRONT = rrect(8, 52, 84, 40, [0, 0, 10, 10]);
const BODY = rrect(8, -12, 84, 104, 10);
const SHADOW = rrect(4, 80, 92, 18, 9);

/** Draw a crate whose cell top-left is (x, y) px at cell size s. */
export function drawCrate(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, look: CrateLook): void {
  const k = CRATES[look.color] ?? CRATES[0];
  const sink = look.sink ?? 0;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s / 100, s / 100);
  if (look.alpha !== undefined) ctx.globalAlpha *= look.alpha;
  // contact shadow stays on the floor
  ctx.fillStyle = `rgba(38, 28, 48, ${0.2 * (1 - sink)})`;
  ctx.fill(P(SHADOW));
  // body transform: lift, squash around the base, shake
  ctx.translate(50, 92 + sink * 20 - (look.lift ?? 0));
  if (look.rot) ctx.rotate((look.rot * Math.PI) / 180);
  ctx.scale(look.sx ?? 1, (look.sy ?? 1) * (1 - 0.4 * sink));
  ctx.translate(-50, -92);
  // front + top
  ctx.fillStyle = k.front;
  ctx.fill(P(FRONT));
  ctx.fillStyle = k.top;
  ctx.fill(P(TOP));
  // top lighting: light from the upper left
  const g = ctx.createLinearGradient(8, -12, 92, 72);
  g.addColorStop(0, 'rgba(255, 244, 220, 0.22)');
  g.addColorStop(0.55, 'rgba(255, 244, 220, 0)');
  g.addColorStop(1, 'rgba(60, 30, 8, 0.10)');
  ctx.fillStyle = g;
  ctx.fill(P(TOP));
  // corner guards
  ctx.fillStyle = 'rgba(74, 45, 18, 0.28)';
  ctx.fill(P('M14 -6H30L14 10Z M86 -6H70L86 10Z M14 66H30L14 50Z M86 66H70L86 50Z'));
  // sealing tape (top) + its fold over the front
  ctx.fillStyle = TAPE;
  ctx.fill(P('M44 -12H56V72H44Z'));
  ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
  ctx.fill(P('M44 -12H47V72H44Z'));
  ctx.fillStyle = '#C37900';
  ctx.fill(P('M44 72H56V91H44Z'));
  // front ribs
  ctx.strokeStyle = 'rgba(40, 20, 4, 0.35)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (const rx of [22, 33, 67, 78]) {
    ctx.moveTo(rx, 77);
    ctx.lineTo(rx, 87);
  }
  ctx.stroke();
  // crease between top and front
  ctx.strokeStyle = 'rgba(40, 20, 4, 0.45)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(10, 72);
  ctx.lineTo(90, 72);
  ctx.stroke();
  // symbol on a kraft disc (so it reads over the tape)
  ctx.fillStyle = k.top;
  ctx.fill(P('M50 15A15 15 0 1 0 50.01 15Z'));
  ctx.fillStyle = SYMBOL_INK;
  ctx.fill(P(symbolPath(k.symbol, 50, 30, 13)));
  // outline
  ctx.strokeStyle = k.stroke;
  ctx.lineWidth = 4;
  ctx.lineJoin = 'round';
  ctx.stroke(P(BODY));
  // locked: brighter, chip with LED check, clasps
  if (look.lock > 0) {
    const t = Math.min(1, look.lock);
    ctx.fillStyle = `rgba(255, 250, 235, ${0.08 * t})`;
    ctx.fill(P(TOP));
    const off = (1 - t) * 9;
    ctx.fillStyle = k.stroke;
    for (const d of ['M1 22H9V40H1Z', 'M91 22H99V40H91Z']) {
      ctx.save();
      ctx.translate(d.startsWith('M1 ') ? -off : off, 0);
      ctx.fill(P(rrect(d.startsWith('M1 ') ? 2 : 90, 20, 8, 22, 3)));
      ctx.restore();
    }
    ctx.globalAlpha *= t;
    ctx.fillStyle = SIGNAL;
    ctx.fill(P(rrect(66, -6, 18, 18, 4.5)));
    ctx.strokeStyle = LOCK_LED;
    ctx.lineWidth = 3.4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke(P(check(75, 3, 5.2)));
  }
  if (look.dead) {
    ctx.save();
    ctx.globalCompositeOperation = 'saturation';
    ctx.fillStyle = 'rgba(128, 128, 128, 0.32)';
    ctx.fill(P(BODY));
    ctx.restore();
    ctx.fillStyle = 'rgba(12, 18, 48, 0.12)';
    ctx.fill(P(BODY));
  }
  if (sink > 0) {
    ctx.fillStyle = `rgba(12, 18, 48, ${0.45 * sink})`;
    ctx.fill(P(BODY));
  }
  ctx.restore();
}

/** Pad marks around a crate that sits on its pad (drawn on the floor, before the crate). */
export function drawPadMarks(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, color: number, alpha = 1): void {
  const k = CRATES[color] ?? CRATES[0];
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s / 100, s / 100);
  ctx.globalAlpha *= alpha;
  ctx.strokeStyle = k.top;
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  // short ring arcs that peek out at the sides and below
  ctx.arc(50, 50, 47, Math.PI * 0.86, Math.PI * 1.06);
  ctx.moveTo(50 + 47 * Math.cos(-0.06 * Math.PI), 50 + 47 * Math.sin(-0.06 * Math.PI));
  ctx.arc(50, 50, 47, -0.06 * Math.PI, 0.14 * Math.PI);
  ctx.stroke();
  // the pad's symbol tab at the lower right
  ctx.fillStyle = k.top;
  ctx.fill(P(rrect(84, 82, 16, 16, 5)));
  ctx.fillStyle = SYMBOL_INK;
  ctx.fill(P(symbolPath(k.symbol, 92, 90, 5.5)));
  ctx.restore();
}
