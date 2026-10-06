/**
 * The three cargo rockets (spec §6.4), parametric Path2D in a unit space: x = 0 is the axis, y = 0
 * the nozzle exit plane, the nose points to −y. Paper-cut look like the rest of the game: flat
 * fills, a darker shaded half, a cream rim on the lit edge, night-blue details.
 *  - 天宫线 tiangong: 长征七号 + 天舟 — white body with cool-grey shade, four boosters (two at the
 *    sides, one in front, one hidden), an amber waist band, a fairing with the 天舟 cargo ship
 *    showing through its window, a vermilion nose.
 *  - 月宫线 moon: the lander stack — a shorter core, two boosters, and on top a wide gold-foil
 *    lander with four folded legs and a small ascent cabin.
 *  - 火星线 mars: the heavy cargo ship — a 1.4× wide core with Mars-orange stripes and portholes,
 *    two big boosters and four big tail fins.
 * Flames are three jittered tongues per nozzle (gold / amber / vermilion; the boss's second stage
 * burns blue-white), deterministic per frame index. `sep` animates the boss booster separation.
 */
import { P, circle, ellipse, rrect } from './shapes';

export type RocketKind = 'tiangong' | 'moon' | 'mars';

export interface RocketPose {
  /** flame length 0 … 1 (0 = engines off) */
  flame: number;
  /** frame index (flame jitter, deterministic) */
  frame: number;
  /** boss: booster separation progress 0 … 1 (boosters drift out, tumble and fall) */
  sep: number;
  /** boss: second-stage burn 0 … 1 (blue-white core flame) */
  stage2: number;
  alpha?: number;
}

export const restRocket = (): RocketPose => ({ flame: 0, frame: 0, sep: 0, stage2: 0 });

/** Height (units) from the nozzle exit to the nose tip. */
export const ROCKET_H: Record<RocketKind, number> = { tiangong: 362, moon: 264, mars: 336 };
/** Half width (units) including boosters and fins. */
export const ROCKET_HALF_W: Record<RocketKind, number> = { tiangong: 34, moon: 34, mars: 54 };

const C = {
  white: '#F6F7FB',
  shade: '#CBD2E4',
  shade2: '#AAB4CF',
  rim: 'rgba(255, 255, 255, 0.85)',
  ink: '#26346E',
  ink2: '#35468C',
  nozzle: '#4A4458',
  nozzleHi: '#776A85',
  amber: '#F9A726',
  amberDeep: '#C37900',
  gold: '#F6B934',
  goldDeep: '#DF9A1C',
  goldDark: '#B07A10',
  vermilion: '#E4513D',
  mars: '#EB6A3C',
  marsDeep: '#C25A3A',
  led: '#8FF7EC',
  window: '#0C1230',
} as const;

function fill(ctx: CanvasRenderingContext2D, d: string, color: string): void {
  ctx.fillStyle = color;
  ctx.fill(P(d));
}

/** A cylinder section: lit left, shaded right third, rim on the left edge. */
function tube(ctx: CanvasRenderingContext2D, x0: number, x1: number, y0: number, y1: number, body: string, shade: string, r = 3): void {
  const w = x1 - x0;
  fill(ctx, rrect(x0, y0, w, y1 - y0, r), body);
  fill(ctx, rrect(x0 + w * 0.64, y0, w * 0.36, y1 - y0, [0, r, r, 0]), shade);
  ctx.strokeStyle = C.rim;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(x0 + 1.6, y0 + r);
  ctx.lineTo(x0 + 1.6, y1 - r);
  ctx.stroke();
}

/** Ogive nose from (x0..x1 at yBase) to the tip at yTip; shade on the right. */
function nose(ctx: CanvasRenderingContext2D, x0: number, x1: number, yBase: number, yTip: number, body: string, shade: string): void {
  const cx = (x0 + x1) / 2;
  const h = yBase - yTip;
  fill(ctx, `M${x0} ${yBase}C${x0} ${yBase - h * 0.55} ${cx - (x1 - x0) * 0.18} ${yTip + h * 0.08} ${cx} ${yTip}C${cx + (x1 - x0) * 0.18} ${yTip + h * 0.08} ${x1} ${yBase - h * 0.55} ${x1} ${yBase}Z`, body);
  fill(ctx, `M${cx + (x1 - x0) * 0.14} ${yBase}C${cx + (x1 - x0) * 0.16} ${yBase - h * 0.6} ${cx + (x1 - x0) * 0.08} ${yTip + h * 0.1} ${cx} ${yTip}C${cx + (x1 - x0) * 0.18} ${yTip + h * 0.08} ${x1} ${yBase - h * 0.55} ${x1} ${yBase}Z`, shade);
}

/** Engine bell under (cx, y) of width w. */
function bell(ctx: CanvasRenderingContext2D, cx: number, y: number, w: number): void {
  const h = w * 0.55;
  fill(ctx, `M${cx - w * 0.32} ${y - h}H${cx + w * 0.32}L${cx + w * 0.5} ${y}H${cx - w * 0.5}Z`, C.nozzle);
  fill(ctx, `M${cx - w * 0.32} ${y - h}H${cx - w * 0.12}L${cx - w * 0.22} ${y}H${cx - w * 0.5}Z`, C.nozzleHi);
}

/** Booster: tube + cone top + bell. */
function booster(ctx: CanvasRenderingContext2D, x0: number, x1: number, yTop: number, yBot: number, cone: number, body: string = C.white, shade: string = C.shade): void {
  tube(ctx, x0, x1, yTop, yBot - 4, body, shade, 2);
  nose(ctx, x0, x1, yTop + 1, yTop - cone, body, shade);
  bell(ctx, (x0 + x1) / 2, yBot, x1 - x0);
}

/** Three-tongue flame (outer → inner) below a nozzle at (cx, y), width w. */
function flameAt(ctx: CanvasRenderingContext2D, cx: number, y: number, w: number, len: number, frame: number, k: number, blue: boolean): void {
  if (len <= 0.01) return;
  const jit = (i: number) => {
    let h = Math.imul(frame * 7 + k * 131 + i * 17, 2654435761) >>> 0;
    h ^= h >>> 15;
    return ((h % 1000) / 1000 - 0.5) * 0.16; // ±8 %
  };
  const layers = blue ? ['#B9E9FF', C.led, '#FFFFFF'] : [C.vermilion, C.amber, C.gold];
  const lens = [1, 0.74, 0.46];
  const wid = [0.62, 0.46, 0.28];
  layers.forEach((col, i) => {
    const L = len * lens[i] * (1 + jit(i)) * w * 3.2;
    const W = w * wid[i];
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(cx - W, y - 1);
    ctx.quadraticCurveTo(cx - W * 0.9, y + L * 0.45, cx + jit(i + 3) * w, y + L);
    ctx.quadraticCurveTo(cx + W * 0.9, y + L * 0.45, cx + W, y - 1);
    ctx.closePath();
    ctx.fill();
  });
}

// ------------------------------------------------------------------ the three rockets

interface Nozzle {
  x: number;
  w: number;
  booster: boolean;
}

const NOZZLES: Record<RocketKind, Nozzle[]> = {
  tiangong: [{ x: -26, w: 12, booster: true }, { x: 26, w: 12, booster: true }, { x: 0, w: 22, booster: false }],
  moon: [{ x: -21, w: 11, booster: true }, { x: 21, w: 11, booster: true }, { x: 0, w: 20, booster: false }],
  mars: [{ x: -31, w: 16, booster: true }, { x: 31, w: 16, booster: true }, { x: 0, w: 28, booster: false }],
};

function boostersTiangong(ctx: CanvasRenderingContext2D, side: -1 | 1): void {
  const x0 = side < 0 ? -33 : 19;
  booster(ctx, x0, x0 + 14, -118, 0, 20);
  fill(ctx, rrect(x0, -60, 14, 5, 1), C.vermilion);
}

function coreTiangong(ctx: CanvasRenderingContext2D): void {
  // core stage
  tube(ctx, -15, 15, -222, -4, C.white, C.shade, 3);
  bell(ctx, 0, 0, 22);
  // amber waist band + seam lines
  fill(ctx, rrect(-15, -158, 30, 9, 0), C.amber);
  fill(ctx, rrect(5, -158, 10, 9, 0), C.amberDeep);
  ctx.strokeStyle = C.shade2;
  ctx.lineWidth = 1.2;
  for (const y of [-196, -120, -84]) {
    ctx.beginPath();
    ctx.moveTo(-14, y);
    ctx.lineTo(14, y);
    ctx.stroke();
  }
  // front booster (the third of four; the fourth hides behind the core)
  booster(ctx, -8, 8, -96, 0, 16, '#E9ECF5', C.shade);
  // upper stage
  tube(ctx, -13, 13, -262, -222, C.white, C.shade, 2);
  fill(ctx, rrect(-13, -236, 26, 4, 0), C.vermilion);
  // fairing with 天舟 inside its window
  tube(ctx, -19, 19, -320, -262, C.white, C.shade, 6);
  fill(ctx, `M-19 -262Q0 -256 19 -262V-258Q0 -252 -19 -258Z`, C.shade2);
  fill(ctx, rrect(-11, -312, 22, 40, 9), C.window);
  // the cargo ship: a gold cylinder with a docking cone and folded solar panels
  fill(ctx, rrect(-6.5, -305, 13, 26, 4), C.gold);
  fill(ctx, rrect(1.5, -305, 5, 26, [0, 4, 4, 0]), C.goldDeep);
  fill(ctx, `M-4 -305L-2.5 -310H2.5L4 -305Z`, C.shade);
  fill(ctx, rrect(-10, -296, 3, 14, 1), '#3F7BE6');
  fill(ctx, rrect(7, -296, 3, 14, 1), '#3F7BE6');
  ctx.strokeStyle = C.goldDark;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-6, -292);
  ctx.lineTo(6, -292);
  ctx.stroke();
  nose(ctx, -19, 19, -319, -362, C.white, C.shade);
  fill(ctx, `M-6.5 -350Q0 -366 6.5 -350Q0 -347 -6.5 -350Z`, C.vermilion);
}

function boostersMoon(ctx: CanvasRenderingContext2D, side: -1 | 1): void {
  const x0 = side < 0 ? -27 : 15;
  booster(ctx, x0, x0 + 12, -100, 0, 18);
}

function coreMoon(ctx: CanvasRenderingContext2D): void {
  tube(ctx, -14, 14, -176, -4, C.white, C.shade, 3);
  bell(ctx, 0, 0, 20);
  fill(ctx, rrect(-14, -120, 28, 7, 0), C.ink2);
  ctx.strokeStyle = C.shade2;
  ctx.lineWidth = 1.2;
  for (const y of [-150, -70]) {
    ctx.beginPath();
    ctx.moveTo(-13, y);
    ctx.lineTo(13, y);
    ctx.stroke();
  }
  // interstage ring
  fill(ctx, rrect(-16, -188, 32, 13, 2), C.ink2);
  fill(ctx, rrect(-16, -188, 32, 4, 2), '#5466B0');
  // four landing legs folded along the descent stage (two seen at the sides, two in front)
  ctx.strokeStyle = C.ink;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3.4;
  ctx.beginPath();
  for (const sx of [-1, 1]) {
    ctx.moveTo(sx * 26, -214);
    ctx.lineTo(sx * 38, -190);
    ctx.lineTo(sx * 27, -191);
  }
  ctx.stroke();
  for (const sx of [-1, 1]) fill(ctx, ellipse(sx * 39, -189, 5.5, 2.4), C.ink);
  // gold-foil descent stage (an octagon) with crinkles
  fill(ctx, `M-24 -190H24L31 -197V-212L24 -219H-24L-31 -212V-197Z`, C.gold);
  fill(ctx, `M7 -190H24L31 -197V-212L24 -219H7Z`, C.goldDeep);
  ctx.strokeStyle = C.goldDark;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-24, -203);
  ctx.lineTo(-15, -207);
  ctx.lineTo(-7, -202);
  ctx.moveTo(-18, -214);
  ctx.lineTo(-9, -211);
  ctx.lineTo(0, -215);
  ctx.moveTo(13, -201);
  ctx.lineTo(22, -206);
  ctx.stroke();
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(-11, -190);
  ctx.lineTo(-13, -181);
  ctx.moveTo(11, -190);
  ctx.lineTo(13, -181);
  ctx.stroke();
  // ascent cabin + window + thrusters + antenna dish
  fill(ctx, rrect(-18, -246, 36, 28, 8), C.white);
  fill(ctx, rrect(5, -246, 13, 28, [0, 8, 8, 0]), C.shade);
  fill(ctx, rrect(-10, -240, 14, 11, 4), C.window);
  fill(ctx, circle(-6, -236, 1.7), C.led);
  fill(ctx, rrect(-22, -238, 4, 8, 1), C.shade2);
  fill(ctx, rrect(18, -238, 4, 8, 1), C.shade2);
  ctx.strokeStyle = C.shade2;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(8, -246);
  ctx.lineTo(12, -256);
  ctx.stroke();
  fill(ctx, `M3 -258Q12 -249 21 -258Q12 -263 3 -258Z`, C.white);
  fill(ctx, circle(12, -258, 1.6), C.ink2);
}

function boostersMars(ctx: CanvasRenderingContext2D, side: -1 | 1): void {
  const x0 = side < 0 ? -39 : 23;
  booster(ctx, x0, x0 + 16, -152, 0, 24);
  fill(ctx, `M${x0} -112L${x0 + 16} -122V-114L${x0} -104Z`, C.mars);
  // a big tail fin on the outside
  const fx = side < 0 ? x0 : x0 + 16;
  fill(ctx, `M${fx} -66L${fx + side * 15} -28L${fx + side * 15} -6L${fx} -18Z`, C.mars);
  fill(ctx, `M${fx} -40L${fx + side * 15} -18V-6L${fx} -18Z`, C.marsDeep);
}

function coreMars(ctx: CanvasRenderingContext2D): void {
  tube(ctx, -21, 21, -288, -4, C.white, C.shade, 4);
  bell(ctx, 0, 0, 28);
  // stripes and portholes
  for (const y of [-252, -132]) {
    fill(ctx, rrect(-21, y, 42, 10, 0), C.mars);
    fill(ctx, rrect(6, y, 15, 10, 0), C.marsDeep);
  }
  for (const y of [-226, -206, -186]) {
    fill(ctx, circle(-6, y, 4.2), C.ink2);
    fill(ctx, circle(-7, y - 1, 1.4), C.led);
  }
  ctx.strokeStyle = C.shade2;
  ctx.lineWidth = 1.3;
  for (const y of [-160, -96, -60]) {
    ctx.beginPath();
    ctx.moveTo(-20, y);
    ctx.lineTo(20, y);
    ctx.stroke();
  }
  // the two front/back fins seen edge-on
  fill(ctx, `M-3 -46H3L4 -4H-4Z`, C.marsDeep);
  nose(ctx, -21, 21, -287, -336, C.white, C.shade);
  fill(ctx, `M-7.5 -322Q0 -340 7.5 -322Q0 -318 -7.5 -322Z`, C.ink);
}

const PARTS: Record<RocketKind, { core: (ctx: CanvasRenderingContext2D) => void; booster: (ctx: CanvasRenderingContext2D, side: -1 | 1) => void }> = {
  tiangong: { core: coreTiangong, booster: boostersTiangong },
  moon: { core: coreMoon, booster: boostersMoon },
  mars: { core: coreMars, booster: boostersMars },
};

/** Rockets are drawn a little stouter than the unit art (a chunkier, friendlier silhouette). */
export const X_STRETCH = 1.3;
/** Unit-space boxes of the parts (with room for the outline). */
const CORE_BOX = { x0: -32, x1: 32, y0: -372, y1: 6 };
const BOOSTER_BOX: Record<RocketKind, { x0: number; x1: number; y0: number; y1: number }> = {
  tiangong: { x0: 14, x1: 38, y0: -142, y1: 6 },
  moon: { x0: 11, x1: 31, y0: -122, y1: 6 },
  mars: { x0: 19, x1: 58, y0: -180, y1: 6 },
};

/** Booster pivot (unit space): its own centre — the boss separation tumbles them around it. */
function pivot(kind: RocketKind, side: -1 | 1): { x: number; y: number } {
  const b = BOOSTER_BOX[kind];
  return { x: (side * (b.x0 + b.x1)) / 2, y: (b.y0 + b.y1) / 2 };
}

/** Flames + pose of every part, with a given painter for the parts (vector or cached sprite). */
function compose(ctx: CanvasRenderingContext2D, kind: RocketKind, pose: RocketPose, paint: (part: 'core' | 'L' | 'R') => void): void {
  const sep = Math.max(0, Math.min(1, pose.sep));
  const len = pose.flame;
  // engine glow + flames first (behind the bells)
  for (const [k, n] of NOZZLES[kind].entries()) {
    if (n.booster && sep > 0) continue;
    const L = n.booster ? len : len * (pose.stage2 > 0 ? 1.15 : 1);
    if (L > 0.01) {
      const g = ctx.createRadialGradient(n.x, 6, 1, n.x, 6, n.w * 2.6);
      const blue = !n.booster && pose.stage2 > 0.5;
      g.addColorStop(0, blue ? `rgba(185, 233, 255, ${0.55 * L})` : `rgba(249, 167, 38, ${0.55 * L})`);
      g.addColorStop(1, 'rgba(249, 167, 38, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(n.x, 6 + n.w * 0.8, n.w * 2.6, n.w * 3.2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    flameAt(ctx, n.x, 0, n.w, L, pose.frame, k, !n.booster && pose.stage2 > 0.5);
  }
  for (const side of [-1, 1] as const) {
    ctx.save();
    if (sep > 0) {
      const pv = pivot(kind, side);
      ctx.translate(side * sep * 46, sep * sep * 260);
      ctx.translate(pv.x, pv.y);
      ctx.rotate(side * sep * 1.1);
      ctx.translate(-pv.x, -pv.y);
      ctx.globalAlpha *= 1 - sep * 0.35;
    }
    paint(side < 0 ? 'L' : 'R');
    ctx.restore();
  }
  paint('core');
}

/**
 * Draw a rocket (vector, no outline) with its nozzle exit centre at (x, y), `scale` px per unit.
 * The launch uses RocketSprite (outlined, cached); this is for small or one-off drawings.
 */
export function drawRocket(ctx: CanvasRenderingContext2D, kind: RocketKind, x: number, y: number, scale: number, pose: RocketPose): void {
  const parts = PARTS[kind];
  ctx.save();
  ctx.globalAlpha *= pose.alpha ?? 1;
  ctx.translate(x, y);
  ctx.scale(scale * X_STRETCH, scale);
  compose(ctx, kind, pose, (part) => (part === 'core' ? parts.core(ctx) : parts.booster(ctx, part === 'L' ? -1 : 1)));
  ctx.restore();
}

/**
 * A rocket ready for animation: each part pre-rendered once (at the device pixel ratio) into an
 * off-screen canvas with a 2 px night-ink paper-cut outline; a frame only blits three images and
 * draws the flames. `dispose()` releases the canvases (iOS frees canvas memory slowly).
 */
export class RocketSprite {
  private readonly parts: Record<'core' | 'L' | 'R', { cv: HTMLCanvasElement; x0: number; y0: number; w: number; h: number }>;

  constructor(readonly kind: RocketKind, readonly scale: number, dpr: number) {
    const k = scale;
    const make = (part: 'core' | 'L' | 'R') => {
      const box = part === 'core' ? CORE_BOX : BOOSTER_BOX[kind];
      const bx0 = part === 'L' ? -box.x1 : box.x0;
      const bx1 = part === 'L' ? -box.x0 : box.x1;
      const pad = 4;
      const x0 = bx0 * X_STRETCH * k - pad;
      const y0 = box.y0 * k - pad;
      const w = (bx1 - bx0) * X_STRETCH * k + 2 * pad;
      const h = (box.y1 - box.y0) * k + 2 * pad;
      const pw = Math.ceil(w * dpr);
      const ph = Math.ceil(h * dpr);
      const art = document.createElement('canvas');
      art.width = pw;
      art.height = ph;
      const a = art.getContext('2d')!;
      a.setTransform(dpr * X_STRETCH * k, 0, 0, dpr * k, -x0 * dpr, -y0 * dpr);
      if (part === 'core') PARTS[kind].core(a);
      else PARTS[kind].booster(a, part === 'L' ? -1 : 1);
      // outline: the silhouette stamped around in night ink, then the art on top
      const cv = document.createElement('canvas');
      cv.width = pw;
      cv.height = ph;
      const o = cv.getContext('2d')!;
      const r = 2 * dpr;
      for (let i = 0; i < 12; i += 1) {
        const t = (i / 12) * Math.PI * 2;
        o.drawImage(art, Math.cos(t) * r, Math.sin(t) * r);
      }
      o.globalCompositeOperation = 'source-in';
      o.fillStyle = '#1B1424';
      o.fillRect(0, 0, pw, ph);
      o.globalCompositeOperation = 'source-over';
      o.drawImage(art, 0, 0);
      art.width = art.height = 0;
      return { cv, x0, y0, w, h };
    };
    this.parts = { core: make('core'), L: make('L'), R: make('R') };
  }

  /** Draw with the nozzle exit centre at (x, y): flames (vector) under the cached, outlined parts. */
  draw(ctx: CanvasRenderingContext2D, x: number, y: number, pose: RocketPose): void {
    const k = this.scale;
    ctx.save();
    ctx.globalAlpha *= pose.alpha ?? 1;
    ctx.translate(x, y);
    ctx.scale(X_STRETCH * k, k);
    compose(ctx, this.kind, pose, (part) => {
      const p = this.parts[part];
      ctx.save();
      ctx.scale(1 / (X_STRETCH * k), 1 / k);
      ctx.drawImage(p.cv, p.x0, p.y0, p.w, p.h);
      ctx.restore();
    });
    ctx.restore();
  }

  get height(): number {
    return ROCKET_H[this.kind] * this.scale;
  }

  dispose(): void {
    for (const p of Object.values(this.parts)) p.cv.width = p.cv.height = 0;
  }
}

// ------------------------------------------------------------------ destinations (the flight's end)

/** The route's destination silhouette (spec §5.5: 天宫空间站 / 月宫基地 / 火星基地), centred at (x, y), radius-ish r. */
export function drawDestination(ctx: CanvasRenderingContext2D, kind: RocketKind, x: number, y: number, r: number, glow: number): void {
  ctx.save();
  ctx.translate(x, y);
  if (glow > 0) {
    const g = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, r * 2.2);
    g.addColorStop(0, `rgba(143, 247, 236, ${0.35 * glow})`);
    g.addColorStop(1, 'rgba(143, 247, 236, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, r * 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
  const k = r / 40;
  ctx.scale(k, k);
  if (kind === 'tiangong') {
    // 天宫: core module, two lab modules, solar wings
    fill(ctx, rrect(-50, -7, 28, 14, 3), '#5466B0');
    fill(ctx, rrect(22, -7, 28, 14, 3), '#5466B0');
    for (const sx of [-1, 1]) {
      fill(ctx, rrect(sx < 0 ? -92 : 52, -18, 40, 36, 3), '#8594D6');
      ctx.strokeStyle = '#35468C';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      for (const yy of [-9, 0, 9]) {
        ctx.moveTo(sx < 0 ? -90 : 54, yy);
        ctx.lineTo(sx < 0 ? -54 : 90, yy);
      }
      ctx.stroke();
    }
    fill(ctx, rrect(-22, -13, 44, 26, 12), '#E2E7FB');
    fill(ctx, rrect(-6, -32, 12, 20, 5), '#E2E7FB');
    fill(ctx, circle(0, 0, 4.5), C.gold);
  } else if (kind === 'moon') {
    fill(ctx, circle(0, 0, 40), '#E2E7FB');
    fill(ctx, `M12 -38A40 40 0 0 1 12 38A44 44 0 0 0 12 -38Z`, '#B7C1EC');
    fill(ctx, circle(-14, -10, 7), '#C9D0EE');
    fill(ctx, circle(10, 14, 9), '#C9D0EE');
    fill(ctx, circle(16, -18, 4.5), '#C9D0EE');
    // the base on the rim: a dome and a tower
    fill(ctx, `M-30 -26A12 10 0 0 1 -6 -36Z`, C.gold);
    fill(ctx, rrect(-12, -50, 4, 14, 1), C.ink2);
    fill(ctx, circle(-10, -52, 3), C.led);
  } else {
    fill(ctx, circle(0, 0, 40), C.mars);
    fill(ctx, `M-38 -10Q-10 -20 38 -6V2Q-6 -10 -38 0Z`, C.marsDeep);
    fill(ctx, `M-36 14Q0 6 36 18V24Q0 14 -34 22Z`, C.marsDeep);
    fill(ctx, circle(-12, 16, 5), '#F08A5D');
    fill(ctx, `M4 -34A14 11 0 0 1 30 -22Z`, '#FFF6E3');
    fill(ctx, rrect(14, -42, 4, 10, 1), C.ink2);
  }
  ctx.restore();
}
