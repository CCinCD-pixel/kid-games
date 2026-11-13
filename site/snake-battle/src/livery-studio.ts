/**
 * 贪吃蛇 × 涂装台: opens the shared studio (kit/livery) with a live preview of 我的蛇 swimming a figure-8 on the
 * floor of the venue picked in the lobby. The preview uses the very painters the match atlas uses (paintSegment,
 * paintDeco → kit paintBallMotif, drawSticker, paintHeadPortrait), cached per look, so what he sees here is what
 * he gets in the arena. Body segments sit 0.62 r apart along the path, like in a match.
 */
import { openLiveryStudio, type Looks, type StudioResult, type StudioSfx, type PreviewInfo } from '@kit/livery';
import { drawSticker } from '@kit/livery/paint';
import { FLOORS, type VenueId } from './sim/venues';
import { hex2rgb, rgb2css, mix, paintSegment, segVariant, variantsOf, ballOf, type Rgb } from './render/art';
import { paintDeco, paintHeadPortrait, DECO, DECO_K } from './render/skins';
import { SNAKE_LIVERY, mineSkin, lookKey, stickerSlots, STICKER_K } from './render/livery';
import { play } from './audio';

const SFX: Record<StudioSfx, [string, number]> = {
  select: ['ui-select', 0.8], 'sticker-on': ['ui-pop', 0.9], 'sticker-off': ['ui-back', 0.7], full: ['ui-locked', 0.6],
  random: ['jingle-magic', 0.7], reset: ['ui-back', 0.8], save: ['level-up', 0.7], close: ['ui-close', 0.8], tab: ['ui-tap', 0.7],
};

interface Sprites { key: string; img: Map<string, HTMLCanvasElement>; pattern: string; stickers: string[] }
const N = 24;

function spritesFor(looks: Looks, prev: Sprites | null): Sprites {
  const look = looks.snake, key = lookKey(look);
  if (prev?.key === key) return prev;
  const sk = mineSkin(look), base = hex2rgb(sk.base), acc = hex2rgb(sk.accent), img = new Map<string, HTMLCanvasElement>();
  const mk = (k: string, px: number, f: (c: CanvasRenderingContext2D) => void) => { const cv = document.createElement('canvas'); cv.width = cv.height = px; const c = cv.getContext('2d')!; c.translate(px / 2, px / 2); f(c); img.set(k, cv); };
  for (const v of variantsOf(sk.pattern)) {
    const b = ballOf(v);
    if (!img.has(b)) mk(b, 128, (c) => paintSegment(c, 56, base, acc, b));
    if (DECO.has(v)) mk(`d:${v}`, 128, (c) => paintDeco(c, 56, v, base, acc));
  }
  for (const closed of [false, true]) mk(closed ? 'headZ' : 'head', 200, (c) => paintHeadPortrait(c, 37.5, sk, base, acc, closed));
  for (const id of sk.stickers ?? []) mk(`stk:${id}`, 128, (c) => drawSticker(c, id, 0, 0, 120));
  mk('shadow', 64, (c) => { const g = c.createRadialGradient(0, 0, 4, 0, 0, 30); g.addColorStop(0, 'rgba(3,5,22,0.55)'); g.addColorStop(1, 'rgba(3,5,22,0)'); c.fillStyle = g; c.fillRect(-32, -32, 64, 64); });
  return { key, img, pattern: sk.pattern, stickers: sk.stickers ?? [] };
}

/** the floor of the stage, painted once per size (the hex grid + craters of the lobby showcase) */
function floorFor(W: number, H: number, venue: VenueId): HTMLCanvasElement {
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const c = cv.getContext('2d')!, fl = (FLOORS[venue] ?? FLOORS.moon).map(hex2rgb) as Rgb[], k = Math.min(W, H) / 400;
  const g = c.createLinearGradient(0, 0, W, H); g.addColorStop(0, rgb2css(fl[1])); g.addColorStop(1, rgb2css(fl[0]));
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  c.strokeStyle = 'rgba(255,255,255,0.05)'; c.lineWidth = 2 * k;
  const hs = 44 * k;
  for (let y = 0, row = 0; y < H + hs; y += hs * 1.5, row++) for (let x = (row % 2) * hs * 0.866; x < W + hs; x += hs * 1.732) { c.beginPath(); for (let j = 0; j < 6; j++) { const a = Math.PI / 6 + (j * Math.PI) / 3; c.lineTo(x + Math.cos(a) * hs, y + Math.sin(a) * hs); } c.closePath(); c.stroke(); }
  for (let i = 0; i < 11; i++) {
    const cx = ((i * 173 + 40) % 997) / 997 * W, cy = ((i * 97 + 30) % 613) / 613 * H, rx = (16 + (i * 7) % 18) * k, ry = rx * 0.7;
    c.fillStyle = rgb2css(fl[2], 0.22); c.beginPath(); c.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.10)'; c.lineWidth = 2 * k; c.beginPath(); c.ellipse(cx, cy + ry * 0.12, rx, ry, 0, Math.PI * 0.05, Math.PI * 0.95); c.stroke();
  }
  // a soft pool of light where the snake swims
  const sp = c.createRadialGradient(W / 2, H * 0.55, 0, W / 2, H * 0.55, Math.max(W, H) * 0.55); sp.addColorStop(0, 'rgba(255,246,220,0.14)'); sp.addColorStop(1, 'rgba(255,246,220,0)');
  c.fillStyle = sp; c.fillRect(0, 0, W, H);
  const vg = c.createRadialGradient(W / 2, H * 0.55, Math.min(W, H) * 0.3, W / 2, H * 0.55, Math.max(W, H) * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(4,6,20,0.6)'); c.fillStyle = vg; c.fillRect(0, 0, W, H);
  return cv;
}

export function snakePreview(venue: VenueId) {
  let sp: Sprites | null = null, floor: HTMLCanvasElement | null = null, fKey = '';
  const xs = new Float32Array(N + 1), ys = new Float32Array(N + 1);
  return {
    draw(c: CanvasRenderingContext2D, W: number, H: number, t: number, looks: Looks, info: PreviewInfo) {
      sp = spritesFor(looks, sp);
      const fk = `${W}x${H}:${venue}`;
      if (fk !== fKey) { floor = floorFor(W, H, venue); fKey = fk; }
      c.drawImage(floor!, 0, 0);
      const R = Math.min(W * 0.062, H * 0.11), ax = W / 2 - R * 3.6, ay = Math.min(H * 0.24, H / 2 - R * 2.6), cx = W / 2, cy = H * 0.54;
      const pos = (u: number): [number, number] => [cx + Math.sin(u) * ax, cy + Math.sin(2 * u) * ay];
      // hop on every change (and a ring of sparkles), never with reduced motion
      const since = t - info.changedAt, hop = !info.reduced && since >= 0 && since < 0.45 ? Math.sin((since / 0.45) * Math.PI) * (1 - since / 0.45) : 0;
      const r = R * (1 + 0.22 * hop);
      // walk back along the path from the head, one sample every 0.62 r
      let u = t * 0.42, [px, py] = pos(u); xs[0] = px; ys[0] = py;
      for (let i = 1, acc = 0; i <= N; ) {
        u -= 0.004; const [x, y] = pos(u); acc += Math.hypot(x - px, y - py); px = x; py = y;
        if (acc >= 0.62 * r) { xs[i] = x; ys[i] = y; acc = 0; i++; }
      }
      const img = sp.img, size = (i: number) => r * (i > N * 0.82 ? 1 - 0.42 * (i - N * 0.82) / (N * 0.18) : 1);
      const sh = img.get('shadow')!;
      for (let i = N; i >= 1; i--) { const s = size(i) * 2.6; c.drawImage(sh, xs[i] - s / 2, ys[i] - s / 2 + r * 0.35, s, s); }
      c.fillStyle = 'rgba(255,255,255,0.85)';
      for (let i = N; i >= 1; i--) { c.beginPath(); c.arc(xs[i], ys[i], size(i) * 0.94, 0, Math.PI * 2); c.fill(); }
      for (let i = N; i >= 1; i--) {
        const v = segVariant(sp.pattern, i - 1, N), b = img.get(ballOf(v)) ?? img.get('plain')!, s = size(i) * 2 * 128 / 112 * 0.875;
        c.drawImage(b, xs[i] - s / 2, ys[i] - s / 2, s, s);
        const d = DECO.has(v) ? img.get(`d:${v}`) : undefined;
        if (d) { const dk = (DECO_K[v] ?? 1) * s; c.save(); c.translate(xs[i], ys[i]); c.rotate(Math.atan2(ys[i - 1] - ys[i], xs[i - 1] - xs[i])); c.drawImage(d, -dk / 2, -dk / 2, dk, dk); c.restore(); }
      }
      const sl = stickerSlots(N);
      sp.stickers.forEach((id, k) => { const i = sl[k] + 1, s = r * STICKER_K * 128 / 120; const im = img.get(`stk:${id}`); if (im && i <= N) c.drawImage(im, xs[i] - s / 2, ys[i] - s / 2, s, s); });
      const [nx, ny] = pos(t * 0.42 + 0.01), a = Math.atan2(ny - ys[0], nx - xs[0]);
      const shut = !info.reduced && t % 4 < 0.12, hs = r * 1.086 * 100 / 37.5;
      c.save(); c.translate(xs[0], ys[0]); c.rotate(a); c.drawImage(img.get(shut ? 'headZ' : 'head')!, -hs, -hs, hs * 2, hs * 2); c.restore();
      if (hop > 0) {
        const q = since / 0.45, mx = xs[5], my = ys[5];
        for (let i = 0; i < 10; i++) {
          const an = (i / 10) * Math.PI * 2 + 0.3, d = R * (2 + 4 * q), x = mx + Math.cos(an) * d, y = my + Math.sin(an) * d * 0.8, s = R * 0.32 * (1 - q);
          c.fillStyle = rgb2css(mix([255, 236, 160], [255, 255, 255], i % 2 ? 0.6 : 0), 1 - q);
          c.beginPath(); for (let j = 0; j < 8; j++) { const aa = (j * Math.PI) / 4, rr = j % 2 ? s * 0.3 : s; c.lineTo(x + Math.cos(aa) * rr, y + Math.sin(aa) * rr); } c.closePath(); c.fill();
        }
      }
    },
  };
}

/** open the 涂装台 for 我的蛇; resolves after 保存 (looks stored) or after leaving without saving */
export function openSnakeStudio(venue: VenueId): Promise<StudioResult> {
  return openLiveryStudio({
    target: SNAKE_LIVERY, title: '我的蛇', preview: snakePreview(venue),
    sfx: (n) => { const [name, volume] = SFX[n]; play(name, { volume }); },
  });
}
