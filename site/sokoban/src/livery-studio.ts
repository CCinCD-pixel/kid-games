/**
 * 星港搬运工 × 涂装台: the shared studio (kit/livery) with two parts, 小推 and 箱子, and a live preview drawn by the
 * board's own renderers: 小推 pushes a 星港补给 crate along a row of floor tiles onto its pad, then turns to the
 * camera and cheers (the front view shows both chest stickers). With reduced motion he just stands, facing front,
 * beside the crate. Saving clears the earned 涂装 slot so the new paint shows at once.
 */
import { openLiveryStudio, type Looks, type PreviewInfo, type StudioResult, type StudioSfx } from '@kit/livery';
import { drawRobot, restPose, type Cosmetics, type Facing } from './render/robot';
import { drawCrate, drawPadMarks } from './render/crate';
import { ROBOT_FEET } from './render/layout';
import { SOKOBAN_LIVERY, cratePaintOf, porterPaintOf } from './render/livery';
import { playSfx } from './audio/sfx';

const SFX: Record<StudioSfx, [string, number]> = {
  select: ['ui-select', 0.8], 'sticker-on': ['ui-pop', 0.9], 'sticker-off': ['ui-back', 0.7], full: ['ui-locked', 0.6],
  random: ['jingle-magic', 0.7], reset: ['ui-back', 0.8], save: ['lock-in', 0.8], close: ['ui-close', 0.8], tab: ['ui-tap', 0.7],
};
const CYCLE = 6.4;

let floorKey = '', floor: HTMLCanvasElement | null = null;
/** warm floor tiles of the board, painted once per stage size */
function floorFor(W: number, H: number, s: number, row: number, x0: number): HTMLCanvasElement {
  const key = `${W}x${H}:${s}`;
  if (key === floorKey && floor) return floor;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const c = cv.getContext('2d')!;
  c.fillStyle = '#1b2656'; c.fillRect(0, 0, W, H);
  // the depot floor, tiled edge to edge (the crate's row is lit, the rest fades into the night)
  for (let r = -Math.ceil(row / s) - 1; r <= Math.ceil((H - row) / s) + 1; r++) for (let x = x0 - s * 3; x < W + s; x += s) {
    const y = row + r * s;
    c.fillStyle = '#d8bf8f'; c.beginPath(); c.roundRect(x + 2, y + 2, s - 4, s - 4, s * 0.12); c.fill();
    c.fillStyle = '#f1e2c2'; c.beginPath(); c.roundRect(x + 2, y + 2, s - 4, s - 8, s * 0.12); c.fill();
  }
  const sh = c.createRadialGradient(W / 2, row + s / 2, s * 0.8, W / 2, row + s / 2, Math.max(W, H) * 0.7); sh.addColorStop(0, 'rgba(20,12,40,0)'); sh.addColorStop(1, 'rgba(12,16,48,0.62)');
  c.fillStyle = sh; c.fillRect(0, 0, W, H);
  floor = cv; floorKey = key;
  return cv;
}

export function porterPreview(base: Cosmetics) {
  return {
    draw(c: CanvasRenderingContext2D, W: number, H: number, t: number, looks: Looks, info: PreviewInfo) {
      const s = Math.round(Math.min(W / 5, H / 2.4)), row = Math.round(H * 0.64 - s / 2), x0 = Math.round(W / 2 - 2.5 * s);
      c.drawImage(floorFor(W, H, s, row, x0), 0, 0);
      const cos: Cosmetics = { ...base, stripes: false, retro: false, livery: porterPaintOf(looks) };
      const paint = cratePaintOf(looks);
      // where the crate is: pushed from cell 1 to cell 3 (the pad), then rests while 小推 cheers
      const u = info.reduced ? CYCLE - 0.6 : t % CYCLE, push = Math.min(1, Math.max(0, (u - 0.4) / 3.2)), done = u > 3.8;
      const ease = push * push * (3 - 2 * push), cx = x0 + (1 + 2 * ease) * s, padX = x0 + 3 * s;
      drawPadMarks(c, padX, row, s, 0, 0.9);
      const since = t - info.changedAt, hop = !info.reduced && since >= 0 && since < 0.45 ? Math.sin((since / 0.45) * Math.PI) * (1 - since / 0.45) : 0;
      const sel = info.part;
      drawCrate(c, cx, row, s, { color: 0, lock: done ? Math.min(1, (u - 3.8) * 3) : 0, paint, lift: sel === 'crate' ? hop * 14 : 0 });
      const facing: Facing = done ? 1 : 3;
      const pose = { ...restPose(facing), arm: done ? 0 : 1, tread: ease * 2, eyes: done ? ('happy' as const) : ('effort' as const), cheer: done ? Math.min(0.8, (u - 3.8) * 2) : 0,
        bob: Math.sin(t * 6) * (done ? 1.5 : 0.8), z: sel === 'porter' ? hop * 16 : 0, cosmetics: cos };
      drawRobot(c, (done ? cx - 0.95 * s : cx - 0.55 * s), row + ROBOT_FEET * s, s * 1.05, pose);
      if (hop > 0) {   // a ring of sparkles over the part that changed
        const q = since / 0.45, mx = sel === 'crate' ? cx + s / 2 : cx - 0.6 * s, my = row + (sel === 'crate' ? 0.2 : -0.3) * s;
        for (let i = 0; i < 10; i++) {
          const an = (i / 10) * Math.PI * 2 + 0.3, d = s * (0.5 + 0.7 * q), x = mx + Math.cos(an) * d, y = my + Math.sin(an) * d * 0.8, r = s * 0.07 * (1 - q);
          c.fillStyle = `rgba(255,${i % 2 ? 255 : 236},${i % 2 ? 255 : 160},${1 - q})`;
          c.beginPath(); for (let j = 0; j < 8; j++) { const aa = (j * Math.PI) / 4, rr = j % 2 ? r * 0.3 : r; c.lineTo(x + Math.cos(aa) * rr, y + Math.sin(aa) * rr); } c.closePath(); c.fill();
        }
      }
    },
  };
}

/** open the 涂装台 for 小推 and the 星港补给 crate */
export function openPorterStudio(base: Cosmetics, part: 'porter' | 'crate' = 'porter'): Promise<StudioResult> {
  return openLiveryStudio({
    target: SOKOBAN_LIVERY, title: '小推和箱子', part, preview: porterPreview(base),
    sfx: (n) => { const [name, volume] = SFX[n]; playSfx(name, { volume }); },
  });
}
