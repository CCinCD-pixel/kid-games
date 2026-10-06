/**
 * Sprite painters + atlas (spec §6.1–6.6, §8.6). Everything is drawn by code (Canvas 2D paths), once per
 * match, into one 2048² atlas of 128-px cells; the GL texture is mip-mapped (LINEAR_MIPMAP_LINEAR) so a
 * sprite is never magnified more than ~1.25× nor sampled below its mip level — the role of the spec's
 * "3 size tiers" (each mip level is a pre-filtered smaller copy, so outlines and highlights don't shimmer).
 * Unified lighting: key light top-left 45°, dark outline = base × 0.55, bright rim = mix(base, white, .4),
 * top-left elliptical highlight (white 35 %). Sprites that need a runtime colour are drawn white and
 * tinted by the instance colour.
 */
import { AI_NAMES, FLOORS } from '../sim/venues';
import collection from '../../../../content/snake-battle/collection.json';
import { paintSkinHead, paintExtra, extrasOf, paintDeco, paintSkinSegment, addSharedSprites, DECO } from './skins';

export const CELL = 128;
export const ATLAS = 2048;
const PER_ROW = ATLAS / CELL;

export interface SpriteUV { u0: number; v0: number; u1: number; v1: number; i: number }

export type Rgb = [number, number, number];
export const hex2rgb = (h: string): Rgb => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
export const rgb2css = (c: Rgb, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
export const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const scale = (a: Rgb, k: number): Rgb => [Math.min(255, a[0] * k), Math.min(255, a[1] * k), Math.min(255, a[2] * k)];
const WHITE: Rgb = [255, 255, 255];

export const STAR_COLORS = ['#ffd84d', '#ff8a3d', '#ff5f7e', '#c86bff', '#6c8cff', '#3fd0ff', '#4fe3a1', '#b6f25a'];

export interface SkinDef { id: string; name: string; base: string; accent: string; pattern: string; head: string; eyes: string }
export const SKINS = (collection as unknown as { skins: SkinDef[] }).skins;
export const skinById = (id: string) => SKINS.find((s) => s.id === id) ?? SKINS[0];

/** body colour for an AI colour word + persona (skittish = 25 % lighter, spec §6.4) */
export function aiBodyColor(color: string, persona: string): Rgb {
  const c = hex2rgb(AI_NAMES.palette[color] ?? '#8d97ad');
  return persona === 'skittish' ? mix(c, WHITE, 0.25) : c;
}

/** an AI body colour as drawn on a given floor: browns get a lighter caramel on the brown floors so they stay
 *  ΔE00 ≥ 25 from the ground (V14); presentation only — the name word (棕) and the sim are unchanged */
export function aiBodyOn(color: string, persona: string, floor: string): Rgb {
  const c = aiBodyColor(color, persona);
  return color === '棕' && (floor === 'jupiter' || floor === 'saturn') ? mix(c, [255, 214, 160], 0.38) : c;
}

/** which segment variant a body index uses (spec §6.4 persona patterns, §6.5 skin patterns); n = segment count, ph = scroll phase */
export function segVariant(pattern: string, i: number, n = 0, ph = 0): string {
  switch (pattern) {
    case 'hunter': return i % 4 === 3 ? 'dark' : 'plain';
    case 'coiler': return i % 5 === 4 ? 'ring' : 'plain';
    case 'scavenger': return i % 2 ? 'spotA' : 'spotB';
    case 'daredevil': return i % 2 ? 'light' : 'dark';
    case 'stripe3': return i % 3 === 2 ? 'alt' : 'plain';
    case 'stripe2': return i % 2 ? 'alt' : 'plain';
    case 'ring6': return i % 6 === 5 ? 'ring' : 'plain';
    case 'ring5': return i % 5 === 4 ? 'ring' : 'plain';
    case 'ring4': return i % 4 === 3 ? 'ring' : 'plain';
    case 'fade': return `f${Math.min(5, Math.floor((n > 1 ? i / (n - 1) : 0) * 6))}`;
    case 'stars': return i < 7 || (i - 7) % 9 === 8 ? 'star' : 'plain';
    case 'swirl': return 'swirl';
    case 'cars6': return i % 6 === 5 ? 'coupler' : 'car';
    case 'panels': return i % 2 ? 'panelY' : 'panel';
    case 'tracks': return (i + ph) % 2 ? 'trackB' : 'trackA';
    case 'modules': return i % 8 === 3 || i % 8 === 7 ? 'wing' : 'module';
    case 'scales': return 'scale';
    case 'clouds': return i % 3 === 1 ? 'cloud' : 'plain';
    case 'bricks': return i % 10 === 9 ? 'crenel' : i % 2 ? 'brickB' : 'brickA';
    case 'patrol': return i % 2 ? 'dots' : 'plain';
    case 'king': return i % 4 < 2 ? 'plain' : 'black';
    default: return 'plain';
  }
}
/** every variant a pattern can produce (atlas build) */
export function variantsOf(pattern: string): string[] {
  const out = new Set<string>(['plain']);
  if (pattern === 'fade') for (let k = 0; k < 6; k++) out.add(`f${k}`);
  for (let i = 0; i < 40; i++) for (const ph of [0, 1]) out.add(segVariant(pattern, i, 40, ph));
  return [...out];
}
/** the shaded-ball sprite a variant uses (pattern overlays sit on the plain ball) */
export const ballOf = (v: string) => (DECO.has(v) ? 'plain' : v);

export class Atlas {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  private map = new Map<string, SpriteUV>();
  private next = 0;
  version = 0;
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = ATLAS;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: false })!;
  }
  get count() { return this.next; }
  has(key: string) { return this.map.has(key); }
  get(key: string): SpriteUV { return this.map.get(key) ?? this.map.get('dot')!; }
  /** paint(ctx, size) draws centred at (0,0) into a CELL×CELL box (content radius ≤ CELL/2 − 6) */
  add(key: string, paint: (c: CanvasRenderingContext2D, R: number) => void) {
    if (this.map.has(key)) return this.map.get(key)!;
    const i = this.next++;
    const cx = (i % PER_ROW) * CELL, cy = Math.floor(i / PER_ROW) * CELL;
    const c = this.ctx;
    c.save(); c.beginPath(); c.rect(cx, cy, CELL, CELL); c.clip();
    c.translate(cx + CELL / 2, cy + CELL / 2);
    paint(c, CELL / 2 - 8);
    c.restore();
    const uv = { u0: cx / ATLAS, v0: cy / ATLAS, u1: (cx + CELL) / ATLAS, v1: (cy + CELL) / ATLAS, i };
    this.map.set(key, uv); this.version++;
    return uv;
  }
}

// ---------------------------------------------------------------- painters
/** shaded ball: the body segment (R = drawn radius) */
export function ball(c: CanvasRenderingContext2D, R: number, base: Rgb, o: { rim?: Rgb; band?: Rgb; ring?: Rgb; spots?: number; sx?: number; k?: number } = {}) {
  const sx = o.sx ?? 1, q = o.k ?? 1;
  c.save(); c.scale(sx, 1);
  // bright rim (outermost), dark outline, then body
  const rim = o.rim ?? mix(base, WHITE, 0.4);
  c.beginPath(); c.arc(0, 0, R, 0, Math.PI * 2); c.fillStyle = rgb2css(rim); c.fill();
  c.beginPath(); c.arc(0, 0, R - 3 * q, 0, Math.PI * 2); c.fillStyle = rgb2css(scale(base, 0.55)); c.fill();
  const g = c.createRadialGradient(-R * 0.35, -R * 0.4, R * 0.1, 0, 0, R - 5 * q);
  g.addColorStop(0, rgb2css(mix(base, WHITE, 0.18)));
  g.addColorStop(0.65, rgb2css(base));
  g.addColorStop(1, rgb2css(scale(base, 0.78)));
  c.beginPath(); c.arc(0, 0, R - 6 * q, 0, Math.PI * 2); c.fillStyle = g; c.fill();
  if (o.band) { c.save(); c.beginPath(); c.arc(0, 0, R - 6, 0, Math.PI * 2); c.clip(); c.fillStyle = rgb2css(o.band); c.fillRect(-R * 0.28, -R, R * 0.56, R * 2); c.restore(); }
  if (o.ring) { c.beginPath(); c.arc(0, 0, R - 9, 0, Math.PI * 2); c.lineWidth = 4; c.strokeStyle = rgb2css(o.ring); c.stroke(); }
  if (o.spots) {
    c.fillStyle = rgb2css(scale(base, 0.6));
    const off = o.spots > 1 ? -1 : 1;
    c.beginPath(); c.arc(R * 0.25, off * R * 0.35, R * 0.16, 0, Math.PI * 2); c.arc(-R * 0.3, -off * R * 0.25, R * 0.12, 0, Math.PI * 2); c.fill();
  }
  // top-left elliptical highlight
  c.beginPath(); c.ellipse(-R * 0.3, -R * 0.42, R * 0.38, R * 0.2, -0.5, 0, Math.PI * 2);
  c.fillStyle = 'rgba(255,255,255,0.35)'; c.fill();
  c.restore();
}

export function paintSegment(c: CanvasRenderingContext2D, R: number, base: Rgb, accent: Rgb, variant: string) {
  switch (variant) {
    case 'alt': ball(c, R, accent); break;
    case 'dark': ball(c, R, scale(base, 0.62), { rim: mix(base, WHITE, 0.4) }); break;
    case 'light': ball(c, R, mix(base, WHITE, 0.3)); break;
    case 'ring': ball(c, R, base, { ring: mix(base, WHITE, 0.55) }); break;
    case 'spotA': ball(c, R, base, { spots: 1 }); break;
    case 'spotB': ball(c, R, base, { spots: 2 }); break;
    default: if (!paintSkinSegment(c, R, base, accent, variant)) ball(c, R, base);
  }
}

/** round head facing +x: a slightly long ball with nostrils and (player) cheeks */
export function paintHead(c: CanvasRenderingContext2D, R: number, base: Rgb, blush: boolean) {
  ball(c, R * 0.92, base, { sx: 1.12 });
  c.fillStyle = rgb2css(scale(base, 0.45));
  c.beginPath(); c.ellipse(R * 0.86, -R * 0.16, R * 0.06, R * 0.045, 0, 0, Math.PI * 2); c.ellipse(R * 0.86, R * 0.16, R * 0.06, R * 0.045, 0, 0, Math.PI * 2); c.fill();
  if (blush) { c.fillStyle = 'rgba(255,110,120,0.35)'; c.beginPath(); c.ellipse(R * 0.25, -R * 0.62, R * 0.17, R * 0.1, 0, 0, Math.PI * 2); c.ellipse(R * 0.25, R * 0.62, R * 0.17, R * 0.1, 0, 0, Math.PI * 2); c.fill(); }
}

function star(c: CanvasRenderingContext2D, R: number, r: number, n = 5, rot = -Math.PI / 2) {
  c.beginPath();
  for (let i = 0; i < n * 2; i++) { const a = rot + (i * Math.PI) / n, rr = i % 2 ? r : R; c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
  c.closePath();
}

function glassBubble(c: CanvasRenderingContext2D, R: number, tint: string) {
  const g = c.createRadialGradient(-R * 0.3, -R * 0.35, R * 0.1, 0, 0, R);
  g.addColorStop(0, 'rgba(255,255,255,0.55)'); g.addColorStop(0.7, tint); g.addColorStop(1, 'rgba(20,24,48,0.85)');
  c.beginPath(); c.arc(0, 0, R, 0, Math.PI * 2); c.fillStyle = g; c.fill();
  c.lineWidth = 4; c.strokeStyle = 'rgba(255,255,255,0.85)'; c.stroke();
}

/** build the per-match atlas: shared sprites + the colours this match uses */
export interface AtlasColor { key: string; base: Rgb; accent: Rgb; pattern: string; blush?: boolean; skin?: SkinDef }
export function buildAtlas(colors: AtlasColor[], venue: string, o: { trail?: string } = {}): Atlas {
  const A = new Atlas();
  // ---- shared soft shapes (white, tinted per instance)
  A.add('dot', (c, R) => { const g = c.createRadialGradient(0, 0, 0, 0, 0, R); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.45, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(-R, -R, 2 * R, 2 * R); });
  A.add('shadow', (c, R) => { const g = c.createRadialGradient(0, 0, R * 0.55, 0, 0, R); g.addColorStop(0, 'rgba(0,0,0,0.75)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(-R, -R, 2 * R, 2 * R); });
  A.add('disc', (c, R) => { c.beginPath(); c.arc(0, 0, R, 0, Math.PI * 2); c.fillStyle = '#fff'; c.fill(); });
  A.add('orbcore', (c, R) => {
    const g = c.createRadialGradient(-R * 0.25, -R * 0.3, R * 0.05, 0, 0, R);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.3, '#fffaf0'); g.addColorStop(0.55, 'rgba(255,255,255,0.92)'); g.addColorStop(1, 'rgba(235,235,235,0.9)');
    c.beginPath(); c.arc(0, 0, R, 0, Math.PI * 2); c.fillStyle = g; c.fill();
  });
  A.add('ring', (c, R) => { c.beginPath(); c.arc(0, 0, R - 6, 0, Math.PI * 2); c.lineWidth = 9; c.strokeStyle = '#fff'; c.stroke(); });
  A.add('spark', (c, R) => { const g = c.createRadialGradient(0, 0, 0, 0, 0, R); g.addColorStop(0, '#fff'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; star(c, R, R * 0.22, 4, 0); c.fill(); });
  A.add('confetti', (c, R) => { c.fillStyle = '#fff'; c.beginPath(); c.roundRect(-R * 0.6, -R * 0.32, R * 1.2, R * 0.64, R * 0.12); c.fill(); });
  A.add('hex', (c, R) => {
    c.beginPath(); for (let i = 0; i < 6; i++) { const a = (i * Math.PI) / 3; c.lineTo(Math.cos(a) * (R - 4), Math.sin(a) * (R - 4)); } c.closePath();
    c.fillStyle = 'rgba(255,255,255,0.16)'; c.fill(); c.lineWidth = 6; c.strokeStyle = '#fff'; c.stroke();
    c.beginPath(); c.ellipse(-R * 0.3, -R * 0.4, R * 0.3, R * 0.12, -0.5, 0, Math.PI * 2); c.fillStyle = 'rgba(255,255,255,0.5)'; c.fill();
  });
  A.add('shard', (c, R) => { c.beginPath(); for (let i = 0; i < 6; i++) { const a = (i * Math.PI) / 3; c.lineTo(Math.cos(a) * R * 0.5, Math.sin(a) * R * 0.5); } c.closePath(); c.fillStyle = '#fff'; c.fill(); });
  // ---- eyes (white sclera, pupil; lids/brows are white and tinted to the head colour)
  A.add('eye', (c, R) => { c.beginPath(); c.arc(0, 0, R, 0, Math.PI * 2); c.fillStyle = '#20223a'; c.fill(); c.beginPath(); c.arc(0, 0, R - 5, 0, Math.PI * 2); c.fillStyle = '#fffdf6'; c.fill(); });
  A.add('pupil', (c, R) => { c.beginPath(); c.arc(0, 0, R, 0, Math.PI * 2); c.fillStyle = '#1a1830'; c.fill(); c.beginPath(); c.arc(-R * 0.3, -R * 0.35, R * 0.3, 0, Math.PI * 2); c.fillStyle = '#fff'; c.fill(); });
  A.add('lid', (c, R) => { c.beginPath(); c.arc(0, 0, R, Math.PI, Math.PI * 2); c.closePath(); c.fillStyle = '#fff'; c.fill(); });
  A.add('lidClosed', (c, R) => { c.beginPath(); c.arc(0, 0, R, 0, Math.PI * 2); c.fillStyle = '#fff'; c.fill(); c.beginPath(); c.arc(0, -R * 0.1, R * 0.62, 0.15 * Math.PI, 0.85 * Math.PI); c.lineWidth = R * 0.18; c.lineCap = 'round'; c.strokeStyle = '#20223a'; c.stroke(); });
  A.add('happy', (c, R) => { c.beginPath(); c.arc(0, R * 0.25, R * 0.62, 1.15 * Math.PI, 1.85 * Math.PI); c.lineWidth = R * 0.24; c.lineCap = 'round'; c.strokeStyle = '#20223a'; c.stroke(); });
  A.add('brow', (c, R) => { c.beginPath(); c.moveTo(-R * 0.9, -R * 0.15); c.lineTo(R * 0.9, R * 0.3); c.lineWidth = R * 0.32; c.lineCap = 'round'; c.strokeStyle = '#fff'; c.stroke(); });
  A.add('xeye', (c, R) => { c.lineWidth = R * 0.26; c.lineCap = 'round'; c.strokeStyle = '#20223a'; c.beginPath(); c.moveTo(-R * 0.55, -R * 0.55); c.lineTo(R * 0.55, R * 0.55); c.moveTo(R * 0.55, -R * 0.55); c.lineTo(-R * 0.55, R * 0.55); c.stroke(); });
  A.add('goggles', (c, R) => {
    c.fillStyle = '#2a2d44'; c.fillRect(-R * 0.25, -R * 0.95, R * 0.5, R * 1.9);
    for (const y of [-0.45, 0.45]) {
      c.beginPath(); c.ellipse(R * 0.05, y * R, R * 0.36, R * 0.32, 0, 0, Math.PI * 2); c.fillStyle = '#2a2d44'; c.fill();
      const g = c.createLinearGradient(-R * 0.3, y * R - R * 0.3, R * 0.3, y * R + R * 0.3); g.addColorStop(0, '#bff6ff'); g.addColorStop(1, '#2bb7e8');
      c.beginPath(); c.ellipse(R * 0.05, y * R, R * 0.27, R * 0.24, 0, 0, Math.PI * 2); c.fillStyle = g; c.fill();
      c.beginPath(); c.ellipse(-R * 0.03, y * R - R * 0.08, R * 0.1, R * 0.05, -0.6, 0, Math.PI * 2); c.fillStyle = 'rgba(255,255,255,0.85)'; c.fill();
    }
  });
  A.add('sweat', (c, R) => { c.beginPath(); c.moveTo(0, -R * 0.8); c.quadraticCurveTo(R * 0.55, R * 0.1, 0, R * 0.6); c.quadraticCurveTo(-R * 0.55, R * 0.1, 0, -R * 0.8); c.fillStyle = '#9fe7ff'; c.fill(); c.lineWidth = 4; c.strokeStyle = '#3a8fc4'; c.stroke(); });
  // ---- items
  A.add('big', (c, R) => {
    const g = c.createRadialGradient(-R * 0.2, -R * 0.25, R * 0.05, 0, 0, R);
    g.addColorStop(0, '#fffbe0'); g.addColorStop(0.45, '#ffd23f'); g.addColorStop(1, '#e89a10');
    star(c, R * 0.95, R * 0.48); c.fillStyle = g; c.fill(); c.lineWidth = 5; c.strokeStyle = '#b86a00'; c.lineJoin = 'round'; c.stroke();
    c.beginPath(); c.ellipse(-R * 0.15, -R * 0.35, R * 0.18, R * 0.09, -0.5, 0, Math.PI * 2); c.fillStyle = 'rgba(255,255,255,0.8)'; c.fill();
  });
  A.add('meteor', (c, R) => {
    c.beginPath(); c.arc(0, 0, R * 0.9, 0, Math.PI * 2); c.fillStyle = '#fff'; c.fill();
    c.save(); c.clip();
    for (let i = 0; i < 6; i++) { c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, R, (i * Math.PI) / 3, (i * Math.PI) / 3 + Math.PI / 6); c.closePath(); c.fillStyle = '#ff5f9e'; c.fill(); }
    c.restore();
    c.beginPath(); c.arc(0, 0, R * 0.9, 0, Math.PI * 2); c.lineWidth = 6; c.strokeStyle = '#c2386f'; c.stroke();
    c.beginPath(); c.ellipse(-R * 0.3, -R * 0.4, R * 0.28, R * 0.12, -0.5, 0, Math.PI * 2); c.fillStyle = 'rgba(255,255,255,0.75)'; c.fill();
  });
  A.add('pu-magnet', (c, R) => {
    glassBubble(c, R, 'rgba(255,120,140,0.55)');
    c.lineWidth = R * 0.24; c.lineCap = 'butt';
    c.beginPath(); c.arc(0, -R * 0.02, R * 0.38, Math.PI, 0); c.strokeStyle = '#e8384f'; c.stroke();
    c.fillStyle = '#e8384f'; c.fillRect(-R * 0.5, -R * 0.02, R * 0.24, R * 0.34); c.fillStyle = '#3b6cff'; c.fillRect(R * 0.26, -R * 0.02, R * 0.24, R * 0.34);
    c.fillStyle = '#f2f2f2'; c.fillRect(-R * 0.5, R * 0.3, R * 0.24, R * 0.14); c.fillRect(R * 0.26, R * 0.3, R * 0.24, R * 0.14);
  });
  A.add('pu-shield', (c, R) => {
    glassBubble(c, R, 'rgba(90,220,255,0.55)');
    c.beginPath(); for (let i = 0; i < 6; i++) { const a = (i * Math.PI) / 3 + Math.PI / 6; c.lineTo(Math.cos(a) * R * 0.5, Math.sin(a) * R * 0.5); } c.closePath();
    c.fillStyle = '#2fd9f0'; c.fill(); c.lineWidth = 6; c.strokeStyle = '#0b6f8f'; c.stroke();
    c.beginPath(); c.ellipse(-R * 0.12, -R * 0.2, R * 0.16, R * 0.07, -0.5, 0, Math.PI * 2); c.fillStyle = 'rgba(255,255,255,0.8)'; c.fill();
  });
  A.add('pu-speed', (c, R) => {
    glassBubble(c, R, 'rgba(255,220,80,0.55)');
    c.beginPath(); c.moveTo(R * 0.12, -R * 0.62); c.lineTo(-R * 0.34, R * 0.08); c.lineTo(-R * 0.02, R * 0.08); c.lineTo(-R * 0.14, R * 0.62); c.lineTo(R * 0.36, -R * 0.1); c.lineTo(R * 0.04, -R * 0.1); c.closePath();
    c.fillStyle = '#ffd23f'; c.fill(); c.lineWidth = 5; c.lineJoin = 'round'; c.strokeStyle = '#a86300'; c.stroke();
  });
  // ---- 挑战关 objects (spec §4.4.4): rock disc, 星核 core, crown + gems, dashed target ring, beacon
  A.add('rock', (c, R) => {
    c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.ellipse(6, 9, R * 0.95, R * 0.9, 0, 0, Math.PI * 2); c.fill();
    c.beginPath(); for (let i = 0; i < 11; i++) { const a = (i / 11) * Math.PI * 2, rr = R * (0.88 + 0.07 * Math.sin(i * 2.7)); c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } c.closePath();
    const g = c.createRadialGradient(-R * 0.3, -R * 0.35, R * 0.1, 0, 0, R); g.addColorStop(0, '#a99fb8'); g.addColorStop(0.6, '#6d6480'); g.addColorStop(1, '#463f56');
    c.fillStyle = g; c.fill(); c.lineWidth = 5; c.strokeStyle = '#2c2638'; c.lineJoin = 'round'; c.stroke();
    c.fillStyle = 'rgba(40,34,52,0.55)';
    for (const [x, y, r] of [[0.3, 0.2, 0.2], [-0.35, 0.3, 0.14], [0.05, -0.4, 0.12], [-0.25, -0.1, 0.09]]) { c.beginPath(); c.arc(R * x, R * y, R * r, 0, Math.PI * 2); c.fill(); }
    c.beginPath(); c.ellipse(-R * 0.35, -R * 0.45, R * 0.3, R * 0.12, -0.5, 0, Math.PI * 2); c.fillStyle = 'rgba(255,255,255,0.28)'; c.fill();
  });
  A.add('core', (c, R) => {
    const g = c.createRadialGradient(0, 0, 0, 0, 0, R); g.addColorStop(0, '#ffffff'); g.addColorStop(0.35, '#bfe9ff'); g.addColorStop(1, 'rgba(120,180,255,0)');
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, R, 0, Math.PI * 2); c.fill();
    star(c, R * 0.62, R * 0.26, 4, 0); c.fillStyle = '#fff'; c.fill();
    c.beginPath(); c.arc(0, 0, R * 0.2, 0, Math.PI * 2); c.fillStyle = '#7fd4ff'; c.fill();
  });
  A.add('crown', (c, R) => {
    c.beginPath(); c.moveTo(-R * 0.85, R * 0.45); c.lineTo(-R * 0.9, -R * 0.35); c.lineTo(-R * 0.45, R * 0.05); c.lineTo(0, -R * 0.6); c.lineTo(R * 0.45, R * 0.05); c.lineTo(R * 0.9, -R * 0.35); c.lineTo(R * 0.85, R * 0.45); c.closePath();
    const g = c.createLinearGradient(0, -R * 0.6, 0, R * 0.45); g.addColorStop(0, '#fff3a6'); g.addColorStop(0.5, '#ffcf3a'); g.addColorStop(1, '#d58a00');
    c.fillStyle = g; c.fill(); c.lineWidth = 6; c.lineJoin = 'round'; c.strokeStyle = '#7a4a00'; c.stroke();
    c.fillStyle = '#7a4a00'; c.fillRect(-R * 0.85, R * 0.3, R * 1.7, R * 0.15);
    for (const x of [-0.9, 0, 0.9]) { c.beginPath(); c.arc(R * x, x === 0 ? -R * 0.62 : -R * 0.37, R * 0.11, 0, Math.PI * 2); c.fillStyle = '#fff3a6'; c.fill(); }
  });
  A.add('gem', (c, R) => {
    c.beginPath(); c.moveTo(0, -R * 0.9); c.lineTo(R * 0.7, -R * 0.2); c.lineTo(0, R * 0.9); c.lineTo(-R * 0.7, -R * 0.2); c.closePath();
    const g = c.createLinearGradient(-R, -R, R, R); g.addColorStop(0, '#ffd1f0'); g.addColorStop(0.5, '#ff4fa3'); g.addColorStop(1, '#a3105a');
    c.fillStyle = g; c.fill(); c.lineWidth = 6; c.lineJoin = 'round'; c.strokeStyle = '#5a0a32'; c.stroke();
    c.beginPath(); c.moveTo(-R * 0.25, -R * 0.45); c.lineTo(R * 0.05, -R * 0.55); c.lineTo(-R * 0.1, -R * 0.1); c.closePath(); c.fillStyle = 'rgba(255,255,255,0.75)'; c.fill();
  });
  A.add('gemEmpty', (c, R) => {
    c.beginPath(); c.moveTo(0, -R * 0.9); c.lineTo(R * 0.7, -R * 0.2); c.lineTo(0, R * 0.9); c.lineTo(-R * 0.7, -R * 0.2); c.closePath();
    c.fillStyle = 'rgba(40,20,40,0.55)'; c.fill(); c.lineWidth = 6; c.lineJoin = 'round'; c.strokeStyle = 'rgba(255,255,255,0.7)'; c.setLineDash([R * 0.25, R * 0.18]); c.stroke(); c.setLineDash([]);
  });
  A.add('dash', (c, R) => { c.beginPath(); c.arc(0, 0, R - 6, 0, Math.PI * 2); c.lineWidth = 8; c.setLineDash([R * 0.32, R * 0.2]); c.lineCap = 'round'; c.strokeStyle = '#fff'; c.stroke(); c.setLineDash([]); });
  A.add('beacon', (c, R) => {
    c.fillStyle = 'rgba(0,0,0,0.3)'; c.beginPath(); c.ellipse(5, R * 0.75, R * 0.5, R * 0.16, 0, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.moveTo(-R * 0.32, R * 0.75); c.lineTo(-R * 0.14, -R * 0.45); c.lineTo(R * 0.14, -R * 0.45); c.lineTo(R * 0.32, R * 0.75); c.closePath();
    const g = c.createLinearGradient(-R * 0.3, 0, R * 0.3, 0); g.addColorStop(0, '#d7dff0'); g.addColorStop(1, '#7d8aa8'); c.fillStyle = g; c.fill(); c.lineWidth = 5; c.strokeStyle = '#2f3550'; c.stroke();
    c.fillStyle = '#2f3550'; for (const y of [0.05, 0.4]) c.fillRect(-R * 0.25, R * y, R * 0.5, R * 0.07);
    const gl = c.createRadialGradient(0, -R * 0.6, 0, 0, -R * 0.6, R * 0.4); gl.addColorStop(0, '#fffbe0'); gl.addColorStop(0.5, '#ffd23f'); gl.addColorStop(1, 'rgba(255,210,63,0)');
    c.fillStyle = gl; c.beginPath(); c.arc(0, -R * 0.6, R * 0.4, 0, Math.PI * 2); c.fill();
  });
  A.add('zzz', (c, R) => { c.font = `900 ${R * 1.3}px system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineWidth = 8; c.strokeStyle = '#1d2240'; c.strokeText('z', 0, 0); c.fillStyle = '#e8f1ff'; c.fillText('z', 0, 0); });
  A.add('arrow', (c, R) => { c.beginPath(); c.moveTo(0, R * 0.9); c.lineTo(-R * 0.6, 0); c.lineTo(-R * 0.25, 0); c.lineTo(-R * 0.25, -R * 0.8); c.lineTo(R * 0.25, -R * 0.8); c.lineTo(R * 0.25, 0); c.lineTo(R * 0.6, 0); c.closePath(); c.fillStyle = '#ffd23f'; c.fill(); c.lineWidth = 6; c.lineJoin = 'round'; c.strokeStyle = '#7a4a00'; c.stroke(); });
  A.add('lantern', (c, R) => {
    c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.ellipse(6, 8, R * 0.42, R * 0.5, 0, 0, Math.PI * 2); c.fill();
    const g = c.createRadialGradient(-R * 0.1, -R * 0.15, 2, 0, 0, R * 0.5); g.addColorStop(0, '#fff3c4'); g.addColorStop(0.6, '#ffb347'); g.addColorStop(1, '#d9612a');
    c.beginPath(); c.ellipse(0, 0, R * 0.4, R * 0.48, 0, 0, Math.PI * 2); c.fillStyle = g; c.fill(); c.lineWidth = 4; c.strokeStyle = '#7a2d12'; c.stroke();
    c.beginPath(); c.ellipse(0, 0, R * 0.16, R * 0.48, 0, 0, Math.PI * 2); c.stroke();
    c.fillStyle = '#7a2d12'; c.fillRect(-R * 0.2, -R * 0.58, R * 0.4, R * 0.12); c.fillRect(-R * 0.2, R * 0.46, R * 0.4, R * 0.12);
  });
  // ---- floor decals (spec §6.8: shapes are sprites so they stay crisp)
  const fl = (FLOORS[venue] ?? FLOORS.moon).map(hex2rgb);
  A.add('decal', (c, R) => {
    if (venue === 'moon') {
      for (const [k, col] of [[1, scale(fl[0], 0.85)], [0.8, fl[1]], [0.62, scale(fl[0], 0.9)]] as [number, Rgb][]) { c.beginPath(); c.ellipse(0, 0, R * k, R * k * 0.82, 0, 0, Math.PI * 2); c.fillStyle = rgb2css(col); c.fill(); }
      c.beginPath(); c.ellipse(-R * 0.1, -R * 0.1, R * 0.5, R * 0.38, 0, 0, Math.PI * 2); c.fillStyle = rgb2css(scale(fl[0], 0.75)); c.fill();
      c.beginPath(); c.ellipse(R * 0.05, R * 0.55, R * 0.55, R * 0.12, 0, 0, Math.PI); c.fillStyle = rgb2css(fl[2], 0.5); c.fill();
    } else if (venue === 'mars') {
      // a pale dust spot with a cluster of dark rubble stones on its edge
      c.beginPath(); c.ellipse(-R * 0.1, R * 0.05, R * 0.78, R * 0.5, 0.3, 0, Math.PI * 2); c.fillStyle = rgb2css(mix(fl[2], WHITE, 0.12), 0.45); c.fill();
      for (const [x, y, rr, k] of [[0.35, -0.25, 0.26, 0.8], [0.62, 0.05, 0.17, 0.72], [0.15, 0.3, 0.13, 0.85], [-0.5, -0.3, 0.1, 0.75]]) {
        c.fillStyle = 'rgba(0,0,0,0.3)'; c.beginPath(); c.ellipse((x + 0.05) * R, (y + 0.07) * R, rr * R, rr * R * 0.8, 0, 0, Math.PI * 2); c.fill();
        c.beginPath(); for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + x * 5, q = rr * (0.8 + 0.25 * Math.sin(i * 2.3 + y * 7)); c.lineTo((x + Math.cos(a) * q) * R, (y + Math.sin(a) * q * 0.85) * R); } c.closePath();
        c.fillStyle = rgb2css(scale(fl[0], k)); c.fill(); c.lineWidth = 3; c.strokeStyle = rgb2css(scale(fl[0], 0.55)); c.stroke();
        c.beginPath(); c.ellipse((x - rr * 0.3) * R, (y - rr * 0.35) * R, rr * 0.35 * R, rr * 0.18 * R, -0.5, 0, Math.PI * 2); c.fillStyle = 'rgba(255,220,200,0.25)'; c.fill();
      }
    } else if (venue === 'saturn') {
      // the ring's slanted shadow band across the ice (soft, two tones) + a few ice grains
      c.save(); c.rotate(-0.5);
      const g = c.createLinearGradient(0, -R * 0.5, 0, R * 0.5); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.3, rgb2css(scale(fl[0], 0.7), 0.55)); g.addColorStop(0.55, rgb2css(scale(fl[0], 0.62), 0.6)); g.addColorStop(0.62, 'rgba(0,0,0,0)'); g.addColorStop(0.72, rgb2css(scale(fl[0], 0.75), 0.4)); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.beginPath(); c.ellipse(0, 0, R, R * 0.5, 0, 0, Math.PI * 2); c.fill(); c.restore();
      for (let i = 0; i < 7; i++) { const a = i * 2.1, rr = R * (0.15 + 0.1 * i); c.beginPath(); c.arc(Math.cos(a) * rr, Math.sin(a) * rr * 0.6, R * 0.035, 0, Math.PI * 2); c.fillStyle = 'rgba(235,245,255,0.7)'; c.fill(); }
    } else if (venue === 'jupiter') {
      c.globalAlpha = 0.35; c.lineWidth = R * 0.12; c.strokeStyle = rgb2css(mix(fl[2], WHITE, 0.4));
      c.beginPath(); for (let t = 0; t < 14; t += 0.2) { const rr = R * 0.07 * t; c.lineTo(Math.cos(t) * rr, Math.sin(t) * rr * 0.55); } c.stroke();
    } else {
      c.globalAlpha = 0.85; for (let i = 0; i < 9; i++) { const a = i * 2.4, rr = R * 0.12 * i; c.beginPath(); c.arc(Math.cos(a) * rr, Math.sin(a) * rr, R * (0.05 + (i % 3) * 0.03), 0, Math.PI * 2); c.fillStyle = i % 2 ? '#c9b8ff' : '#fff4d6'; c.fill(); }
    }
  });
  // ---- snakes: per colour, segment variants + head
  addSharedSprites((k, p) => A.add(k, p), o.trail ?? 'stardust');
  for (const col of colors) addColorSprites(A, col);
  if (A.count > (ATLAS / CELL) ** 2) console.warn('[snake-battle] atlas overflow', A.count);
  return A;
}

/** the sprites of one snake colour (segments, overlays, head, skin extras); also used lazily for snakes added mid-match */
export function addColorSprites(A: Atlas, col: AtlasColor) {
  for (const v of variantsOf(col.pattern)) {
    const b = ballOf(v);
    A.add(`seg:${col.key}:${b}`, (c, R) => paintSegment(c, R, col.base, col.accent, b));
    if (DECO.has(v)) A.add(`deco:${col.key}:${v}`, (c, R) => paintDeco(c, R, v, col.base, col.accent));
  }
  const sk = col.skin;
  if (sk) {
    A.add(`head:${col.key}`, (c, R) => paintSkinHead(c, R, sk, col.base, col.accent));
    if (sk.head === 'digger') A.add(`head2:${col.key}`, (c, R) => paintSkinHead(c, R, sk, col.base, col.accent, true));
    for (const x of extrasOf(sk)) A.add(`x:${col.key}:${x}`, (c, R) => paintExtra(c, R, x, col.base, col.accent));
  } else A.add(`head:${col.key}`, (c, R) => paintHead(c, R, col.base, !!col.blush));
}
