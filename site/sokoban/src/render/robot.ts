/**
 * 小推 — the amber porter robot (spec §6.4), fully parametric: tracked chassis with three rollers,
 * a rounded amber body, a screen head with a night-blue visor and 3×3 LED eyes, an antenna with a
 * gold ball, two pusher arms. Four facings (front / back / right; left = mirrored right). Every
 * animation (walk, push, bump, think, scratch, celebrate, idle) only changes the pose numbers.
 * Coordinates: origin at the feet centre, 100 units = one cell, +y down.
 */
import { ROBOT } from './palette';
import { P, circle, ellipse, rrect } from './shapes';

export type Facing = 0 | 1 | 2 | 3; // up down left right (engine Dir)
export type Expr = 'normal' | 'blink' | 'happy' | 'effort' | 'question' | 'think' | 'surprised' | 'sleepy';
export const EXPRESSIONS: readonly Expr[] = ['normal', 'blink', 'happy', 'effort', 'question', 'think', 'surprised', 'sleepy'];

export interface Cosmetics {
  hat?: boolean;
  lamp?: boolean;
  stripes?: boolean;
  plate?: boolean;
  badge?: boolean;
  retro?: boolean;
  random?: boolean;
}

export interface RobotPose {
  facing: Facing;
  /** body + head lift (units, + = up) — breathing / walking bob */
  bob: number;
  sx: number;
  sy: number;
  /** lean (radians) toward the facing (side views); front/back views use sy instead */
  lean: number;
  /** pusher arms 0 (rest) … 1 (extended) */
  arm: number;
  eyes: Expr;
  /** −1 … 1 eye glance (front view x, side view y) */
  look: number;
  /** antenna swing (radians) */
  antenna: number;
  /** jump height (units) */
  z: number;
  /** 0 … 1 head-scratch phase (dead reaction); 0 = off */
  scratch: number;
  /** tread animation phase (0 … 1 per cell) */
  tread: number;
  /** celebrate: arms up 0 … 1 */
  cheer: number;
  /** think bubble dots 0 … 3 */
  dots: number;
  /** lamps glow (night scenes) 0 … 1 */
  glow?: number;
  /** the visor shows an LED pictogram instead of eyes (front view): 'route' = the auto-route upgrade */
  visor?: 'route';
  /** LED ring around the head 0 … 1 (upgrade flourish); `haloSpin` turns it (radians) */
  halo?: number;
  haloSpin?: number;
  alpha?: number;
  cosmetics?: Cosmetics;
}

export function restPose(facing: Facing = 1): RobotPose {
  return { facing, bob: 0, sx: 1, sy: 1, lean: 0, arm: 0, eyes: 'normal', look: 0, antenna: 0, z: 0, scratch: 0, tread: 0, cheer: 0, dots: 0 };
}

const BIT = (s: string) => s.split('').map((c) => c === '1');
const E = (a: string, b = a): [boolean[], boolean[]] => [BIT(a), BIT(b)];
const EYE_MASK: Record<Expr, [boolean[], boolean[]]> = {
  normal: E('010111010'),
  blink: E('000111000'),
  happy: E('010101000'),
  effort: E('100010100', '001010001'),
  question: E('111001010'),
  think: E('011011000'),
  surprised: E('111101111'),
  sleepy: E('000000111'),
};

const BODY_COL = (c?: Cosmetics) => (c?.retro ? { body: '#B27A44', hi: '#CF9A62', shade: '#7C4E22' } : { body: ROBOT.body, hi: ROBOT.hi, shade: ROBOT.shade });

function drawEyes(ctx: CanvasRenderingContext2D, expr: Expr, centers: [number, number][], pitch: number, r: number): void {
  const masks = EYE_MASK[expr];
  ctx.save();
  ctx.fillStyle = ROBOT.led;
  ctx.shadowColor = 'rgba(143, 247, 236, 0.85)';
  ctx.shadowBlur = 4;
  centers.forEach(([cx, cy], e) => {
    const m = masks[Math.min(e, 1)];
    for (let i = 0; i < 9; i += 1) {
      if (!m[i]) continue;
      const x = cx + ((i % 3) - 1) * pitch;
      const y = cy + (((i / 3) | 0) - 1) * pitch;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  ctx.restore();
}

function chassisFront(ctx: CanvasRenderingContext2D, tread: number): void {
  ctx.fillStyle = ROBOT.tread;
  ctx.fill(P(rrect(-40, -19, 80, 19, 8)));
  ctx.fillStyle = '#4A3D58';
  ctx.fill(P(rrect(-40, -19, 18, 19, 7)));
  ctx.fill(P(rrect(22, -19, 18, 19, 7)));
  ctx.strokeStyle = 'rgba(12, 8, 20, 0.55)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  const ph = (tread % 1) * 5;
  for (let y = -17 + ph; y < -1; y += 5) {
    ctx.moveTo(-38, y);
    ctx.lineTo(-24, y);
    ctx.moveTo(24, y);
    ctx.lineTo(38, y);
  }
  ctx.stroke();
  ctx.fillStyle = ROBOT.roller;
  ctx.fill(P(rrect(-16, -15, 32, 10, 4)));
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fill(P(rrect(-38, -19, 76, 3, 1.5)));
}

function chassisSide(ctx: CanvasRenderingContext2D, tread: number): void {
  ctx.fillStyle = ROBOT.tread;
  ctx.fill(P(rrect(-40, -20, 80, 20, 10)));
  ctx.strokeStyle = 'rgba(12, 8, 20, 0.5)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  const ph = (tread % 1) * 7;
  for (let x = -36 + ph; x < 38; x += 7) {
    ctx.moveTo(x, -20);
    ctx.lineTo(x, -17);
    ctx.moveTo(x, -3);
    ctx.lineTo(x, 0);
  }
  ctx.stroke();
  for (const x of [-24, 0, 24]) {
    ctx.fillStyle = ROBOT.roller;
    ctx.fill(P(circle(x, -10, 6.5)));
    ctx.fillStyle = ROBOT.tread;
    ctx.fill(P(circle(x, -10, 2.4)));
    ctx.save();
    ctx.translate(x, -10);
    ctx.rotate(tread * Math.PI);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(-0.9, -6, 1.8, 3);
    ctx.restore();
  }
}

function bodyBlock(ctx: CanvasRenderingContext2D, x: number, w: number, c?: Cosmetics): void {
  const col = BODY_COL(c);
  const body = P(rrect(x, -62, w, 47, 13));
  ctx.fillStyle = col.body;
  ctx.fill(body);
  ctx.save();
  ctx.clip(body);
  ctx.fillStyle = col.shade;
  ctx.globalAlpha = 0.55;
  ctx.fillRect(x - 2, -31, w + 4, 20);
  ctx.globalAlpha = 1;
  ctx.fillStyle = col.hi;
  ctx.fill(P(rrect(x + 4, -59, w - 8, 9, 5)));
  if (c?.stripes) {
    ctx.fillStyle = 'rgba(53, 42, 64, 0.85)';
    for (let i = 0; i < 3; i += 1) {
      const sx = x + 8 + i * 14;
      ctx.beginPath();
      ctx.moveTo(sx, -15);
      ctx.lineTo(sx + 7, -15);
      ctx.lineTo(sx + 21, -48);
      ctx.lineTo(sx + 14, -48);
      ctx.closePath();
      ctx.fill();
    }
  }
  if (c?.retro) {
    // wood-plank grooves + an LED-teal trim line: the torso is a crate, the robot is still a robot
    ctx.strokeStyle = 'rgba(70, 38, 10, 0.55)';
    ctx.lineWidth = 2;
    for (const y of [-46, -33]) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + w, y);
      ctx.stroke();
    }
    ctx.fillStyle = ROBOT.led;
    ctx.fillRect(x, -21, w, 3);
  }
  ctx.restore();
  // retro: an amber rim keeps the hero apart from the kraft crates (QA r1 figure/ground)
  ctx.strokeStyle = c?.retro ? ROBOT.body : 'rgba(90, 50, 0, 0.55)';
  ctx.lineWidth = c?.retro ? 4 : 3;
  ctx.stroke(body);
}

function headShell(ctx: CanvasRenderingContext2D, x: number, w: number, c?: Cosmetics): Path2D {
  // the head always keeps the hero amber (a paint job is for the body only)
  const col = BODY_COL(c?.retro ? undefined : c);
  const head = P(rrect(x, -104, w, 40, 13));
  ctx.fillStyle = col.body;
  ctx.fill(head);
  ctx.save();
  ctx.clip(head);
  ctx.fillStyle = col.hi;
  ctx.fill(P(rrect(x + 5, -101, w - 10, 7, 3.5)));
  ctx.fillStyle = col.shade;
  ctx.globalAlpha = 0.45;
  ctx.fillRect(x - 2, -72, w + 4, 10);
  ctx.restore();
  ctx.strokeStyle = 'rgba(90, 50, 0, 0.55)';
  ctx.lineWidth = 3;
  ctx.stroke(head);
  return head;
}

function antenna(ctx: CanvasRenderingContext2D, x: number, swing: number, hat: boolean): void {
  ctx.save();
  ctx.translate(x, hat ? -114 : -103);
  ctx.rotate(swing);
  ctx.strokeStyle = ROBOT.tread;
  ctx.lineWidth = 3.4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, hat ? -10 : -16);
  ctx.stroke();
  ctx.fillStyle = ROBOT.gold;
  ctx.fill(P(circle(0, hat ? -14 : -20, 5.6)));
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fill(P(circle(-1.8, hat ? -16 : -22, 1.8)));
  ctx.restore();
}

function hat(ctx: CanvasRenderingContext2D, x: number, w: number, side: boolean): void {
  const cx = x + w / 2;
  ctx.fillStyle = ROBOT.gold;
  ctx.beginPath();
  ctx.ellipse(cx, -103, w * 0.42, 13, 0, Math.PI, 0);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = ROBOT.goldDeep;
  ctx.fill(P(rrect(side ? cx - w * 0.5 : cx - w * 0.52, -106, side ? w * 0.95 : w * 1.04, 6, 3)));
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(cx, -103, w * 0.3, 9, 0, Math.PI * 1.15, Math.PI * 1.55);
  ctx.stroke();
}

function lamp(ctx: CanvasRenderingContext2D, x: number, glow: number): void {
  ctx.fillStyle = '#4A3D58';
  ctx.fill(P(rrect(x - 6, -66, 12, 8, 3)));
  ctx.fillStyle = '#FFF1C9';
  ctx.fill(P(circle(x, -66, 5)));
  if (glow > 0) {
    ctx.fillStyle = `rgba(255, 216, 99, ${0.35 * glow})`;
    ctx.fill(P(circle(x, -66, 11)));
  }
}

function chestDeco(ctx: CanvasRenderingContext2D, cx: number, c?: Cosmetics): void {
  if (c?.plate) {
    ctx.fillStyle = '#D3D8E2';
    ctx.fill(P(rrect(cx - 11, -50, 22, 11, 3)));
    ctx.fillStyle = '#5466B0';
    ctx.fillRect(cx - 7, -46, 14, 2.2);
  } else {
    ctx.fillStyle = 'rgba(90, 50, 0, 0.35)';
    ctx.fill(P(rrect(cx - 10, -50, 20, 10, 3)));
    ctx.fillStyle = ROBOT.led;
    ctx.fill(P(circle(cx - 4, -45, 1.8)));
    ctx.fillStyle = '#FFD863';
    ctx.fill(P(circle(cx + 4, -45, 1.8)));
  }
  if (c?.badge || c?.random) {
    ctx.fillStyle = ROBOT.visor;
    ctx.fill(P(circle(cx + 16, -40, 6)));
    ctx.strokeStyle = ROBOT.gold;
    ctx.lineWidth = 2;
    ctx.stroke(P(circle(cx + 15, -41, 2.8)));
    ctx.beginPath();
    ctx.moveTo(cx + 17, -39);
    ctx.lineTo(cx + 19.5, -36.5);
    ctx.stroke();
  }
}

function pusher(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = '#776A85';
  ctx.fill(P(rrect(x - w / 2, y - h / 2, w, h, Math.min(w, h) / 2.4)));
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.fill(P(rrect(x - w / 2 + 1.5, y - h / 2 + 1, w - 3, Math.max(1.5, h * 0.22), 1)));
}

function armBar(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number): void {
  ctx.strokeStyle = ROBOT.tread;
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function thinkDots(ctx: CanvasRenderingContext2D, n: number, x: number): void {
  for (let i = 0; i < 3; i += 1) {
    const a = Math.max(0, Math.min(1, n - i));
    if (a <= 0) continue;
    ctx.fillStyle = `rgba(255, 250, 240, ${0.9 * a})`;
    ctx.strokeStyle = `rgba(12, 18, 48, ${0.5 * a})`;
    ctx.lineWidth = 1.5;
    const p = P(circle(x + i * 9, -126 - i * 6, 3 + i * 0.9));
    ctx.fill(p);
    ctx.stroke(p);
  }
}

/** LED pictogram on the visor: a dotted walk that turns a corner and ends in an arrow (自动绕行). */
function routeGlyph(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  ctx.fillStyle = ROBOT.led;
  ctx.strokeStyle = ROBOT.led;
  ctx.shadowColor = 'rgba(143, 247, 236, 0.85)';
  ctx.shadowBlur = 4;
  for (const [x, y] of [[-15, -76], [-15, -81], [-15, -86], [-10, -90], [-5, -90], [0, -90]]) {
    ctx.beginPath();
    ctx.arc(x, y, 1.9, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.lineWidth = 2.6;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(5, -90);
  ctx.lineTo(15, -90);
  ctx.moveTo(10.5, -94.5);
  ctx.lineTo(15, -90);
  ctx.lineTo(10.5, -85.5);
  ctx.stroke();
  // the crate the route leads to
  ctx.lineWidth = 1.8;
  ctx.strokeRect(6, -82, 10, 8);
  ctx.restore();
}

/** A ring of LED dots around the head (the upgrade flourish). */
function ledHalo(ctx: CanvasRenderingContext2D, a: number, spin: number): void {
  ctx.save();
  ctx.fillStyle = ROBOT.led;
  ctx.shadowColor = 'rgba(143, 247, 236, 0.9)';
  ctx.shadowBlur = 6;
  const n = 16;
  for (let i = 0; i < n; i += 1) {
    const t = (i / n) * Math.PI * 2 + spin;
    const k = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(t * 2 - spin * 3));
    ctx.globalAlpha = Math.max(0, Math.min(1, a)) * k;
    ctx.beginPath();
    ctx.arc(Math.cos(t) * 44, -84 + Math.sin(t) * 33, 2.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Draw 小推 with its feet at (x, y) px, cell size s. */
export function drawRobot(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, pose: RobotPose): void {
  const c = pose.cosmetics;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s / 100, s / 100);
  if (pose.alpha !== undefined) ctx.globalAlpha *= pose.alpha;
  // shadow on the floor (shrinks while jumping)
  const zk = Math.max(0.55, 1 - pose.z / 60);
  ctx.fillStyle = `rgba(12, 10, 30, ${0.24 * zk})`;
  ctx.fill(P(ellipse(0, -2, 35 * zk, 9 * zk)));
  ctx.translate(0, -pose.z);
  const mirror = pose.facing === 2;
  const side = pose.facing === 2 || pose.facing === 3;
  ctx.scale(mirror ? -1 : 1, 1);
  if (side) ctx.rotate(pose.lean);
  ctx.scale(pose.sx, pose.sy);
  if (side) {
    // ----- side view (facing right)
    const armX = pose.arm * 15;
    chassisSide(ctx, pose.tread);
    ctx.save();
    ctx.translate(0, -pose.bob);
    bodyBlock(ctx, -27, 54, c);
    if (c?.lamp) lamp(ctx, -12, pose.glow ?? 0);
    ctx.fillStyle = ROBOT.tread;
    ctx.fill(P(rrect(-7, -68, 14, 8, 3)));
    headShell(ctx, -25, 50, c);
    // visor wraps the front half
    ctx.fillStyle = ROBOT.visor;
    ctx.fill(P(rrect(-2, -98, 25, 28, [8, 10, 10, 8])));
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fill(P(rrect(1, -95, 18, 4, 2)));
    drawEyes(ctx, pose.eyes, [[12, -84 + pose.look * 2]], 4.4, 1.85);
    ctx.fillStyle = BODY_COL(c?.retro ? undefined : c).shade; // head ears stay hero amber
    ctx.fill(P(circle(-12, -84, 5)));
    if (c?.hat) hat(ctx, -25, 50, true);
    antenna(ctx, -6, pose.antenna, !!c?.hat);
    ctx.restore();
    // near arm (in front): a short arm with the pusher plate held upright in front of the body
    if (pose.scratch > 0) {
      const wv = Math.sin(pose.scratch * Math.PI * 6) * 6;
      armBar(ctx, 2, -44 - pose.bob, 14, -82 - pose.bob + wv * 0.3);
      pusher(ctx, 16, -86 - pose.bob + wv, 7, 14);
    } else if (pose.cheer > 0) {
      armBar(ctx, 2, -44 - pose.bob, 8 + 6 * pose.cheer, -44 - 44 * pose.cheer - pose.bob);
      pusher(ctx, 9 + 6 * pose.cheer, -48 - 46 * pose.cheer - pose.bob, 14, 7);
    } else {
      armBar(ctx, 6, -40 - pose.bob, 24 + armX, -38 - pose.bob);
      pusher(ctx, 30 + armX, -38 - pose.bob, 7.5, 26);
    }
    if (pose.dots > 0) thinkDots(ctx, pose.dots, 14);
    ctx.restore();
    return;
  }
  if (pose.facing === 0) {
    // ----- back view (facing up, away from the camera)
    const lift = pose.arm * 16;
    chassisFront(ctx, pose.tread);
    ctx.save();
    ctx.translate(0, -pose.bob);
    // arms behind/raised: pushing up shows the pushers beside the head
    for (const sgn of [-1, 1]) {
      armBar(ctx, sgn * 28, -48, sgn * 34, -64 - lift);
      pusher(ctx, sgn * 34, -70 - lift, 14, 7);
    }
    bodyBlock(ctx, -31, 62, c);
    ctx.fillStyle = 'rgba(90, 50, 0, 0.30)';
    ctx.fill(P(rrect(-19, -56, 38, 30, 7)));
    ctx.fillStyle = '#FFF1C9';
    ctx.font = '700 17px "XG KuaiLe", "PingFang SC", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('推', 0, -42);
    ctx.strokeStyle = 'rgba(53, 42, 64, 0.6)';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(-22, -22);
    ctx.lineTo(-8, -22);
    ctx.moveTo(8, -22);
    ctx.lineTo(22, -22);
    ctx.stroke();
    if (c?.lamp) {
      lamp(ctx, -24, pose.glow ?? 0);
      lamp(ctx, 24, pose.glow ?? 0);
    }
    ctx.fillStyle = ROBOT.tread;
    ctx.fill(P(rrect(-8, -68, 16, 8, 3)));
    headShell(ctx, -29, 58, c);
    ctx.fillStyle = 'rgba(90, 50, 0, 0.28)';
    ctx.fill(P(rrect(-14, -96, 28, 18, 6)));
    for (const sgn of [-1, 1]) {
      ctx.fillStyle = BODY_COL(c?.retro ? undefined : c).shade; // head ears stay hero amber
      ctx.fill(P(circle(sgn * 31, -84, 5)));
    }
    if (c?.hat) hat(ctx, -29, 58, false);
    antenna(ctx, 0, pose.antenna, !!c?.hat);
    ctx.restore();
    if (pose.dots > 0) thinkDots(ctx, pose.dots, 16);
    ctx.restore();
    return;
  }
  // ----- front view (facing down, toward the camera)
  chassisFront(ctx, pose.tread);
  ctx.save();
  ctx.translate(0, -pose.bob);
  bodyBlock(ctx, -31, 62, c);
  chestDeco(ctx, 0, c);
  if (c?.lamp) {
    lamp(ctx, -24, pose.glow ?? 0);
    lamp(ctx, 24, pose.glow ?? 0);
  }
  ctx.fillStyle = ROBOT.tread;
  ctx.fill(P(rrect(-8, -68, 16, 8, 3)));
  for (const sgn of [-1, 1]) {
    ctx.fillStyle = BODY_COL(c?.retro ? undefined : c).shade; // head ears stay hero amber
    ctx.fill(P(circle(sgn * 31, -84, 5)));
  }
  headShell(ctx, -29, 58, c);
  ctx.fillStyle = ROBOT.visor;
  ctx.fill(P(rrect(-23, -98, 46, 28, 9)));
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fill(P(rrect(-19, -95, 30, 4, 2)));
  const lx = pose.look * 3;
  if (pose.visor === 'route') routeGlyph(ctx);
  else drawEyes(ctx, pose.eyes, [[-10 + lx, -84], [10 + lx, -84]], 4.4, 1.85);
  if (c?.hat) hat(ctx, -29, 58, false);
  antenna(ctx, 0, pose.antenna, !!c?.hat);
  if (pose.halo) ledHalo(ctx, pose.halo, pose.haloSpin ?? 0);
  ctx.restore();
  // arms in front of the body
  const ext = pose.arm;
  for (const sgn of [-1, 1]) {
    if (pose.scratch > 0 && sgn === 1) {
      const wv = Math.sin(pose.scratch * Math.PI * 6) * 5;
      armBar(ctx, 30, -48 - pose.bob, 38, -80 - pose.bob);
      pusher(ctx, 38 + wv * 0.3, -86 - pose.bob + wv, 12, 7);
      continue;
    }
    if (pose.cheer > 0) {
      armBar(ctx, sgn * 30, -48 - pose.bob, sgn * (34 + 8 * pose.cheer), -48 - 44 * pose.cheer - pose.bob);
      pusher(ctx, sgn * (34 + 8 * pose.cheer), -52 - 48 * pose.cheer - pose.bob, 14, 7);
      continue;
    }
    // arms run down the outside of the body (no strap across the chest); pushers at the front corners
    ctx.fillStyle = ROBOT.tread;
    ctx.fill(P(circle(sgn * 32, -47 - pose.bob, 4.6)));
    armBar(ctx, sgn * 34, -46 - pose.bob, sgn * 37, -22 - pose.bob + 12 * ext);
    pusher(ctx, sgn * 33, -17 - pose.bob + 18 * ext, 16 + 6 * ext, 8 + 3 * ext);
  }
  if (pose.dots > 0) thinkDots(ctx, pose.dots, 16);
  ctx.restore();
}

/** Bounding box of the robot drawing around its feet (px), for partial redraws. */
export function robotBounds(x: number, y: number, s: number): { x: number; y: number; w: number; h: number } {
  const k = s / 100;
  return { x: x - 62 * k, y: y - 150 * k, w: 124 * k, h: 160 * k };
}
