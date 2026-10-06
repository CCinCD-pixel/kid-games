/**
 * Sprite atlas (spec §8.5): every sprite rasterised once at cell×DPR into ONE canvas; on a cell-size
 * change a new atlas is built while the old one keeps drawing (scaled), then the old canvas is
 * released (width = height = 0) — iOS Safari has a page-wide canvas memory cap (review B24).
 */
import { gemSvg } from './art/gems';
import { bombSvg, crateSvg, drawOrb, gooSvg, iceSvg, podSvg, propSvg, rocketSvg } from './art/specials';

export type SpriteKey = string;
interface Entry { key: SpriteKey; svg?: string; draw?: (ctx: CanvasRenderingContext2D, size: number) => void }

function entries(): Entry[] {
  const e: Entry[] = [];
  for (let c = 0; c < 6; c += 1) e.push({ key: `gem${c}`, svg: gemSvg(c) });
  for (let s = -1; s < 5; s += 1) { e.push({ key: `rh${s}`, svg: rocketSvg(false, s) }); e.push({ key: `rv${s}`, svg: rocketSvg(true, s) }); }
  for (let f = 0; f < 4; f += 1) e.push({ key: `prop${f}`, svg: propSvg(f) });
  for (let f = 0; f < 3; f += 1) e.push({ key: `bomb${f}`, svg: bombSvg(f) });
  for (let f = 0; f < 8; f += 1) e.push({ key: `orb${f}`, draw: (ctx, size) => drawOrb(ctx, size, f) });
  e.push({ key: 'crate1', svg: crateSvg(1) }, { key: 'crate2', svg: crateSvg(2) }, { key: 'crate2d', svg: crateSvg(2, true) }, { key: 'crate3', svg: crateSvg(3) });
  e.push({ key: 'ice1', svg: iceSvg(1) }, { key: 'ice2', svg: iceSvg(2) });
  for (let f = 0; f < 4; f += 1) e.push({ key: `goo${f}`, svg: gooSvg(f) });
  e.push({ key: 'pod', svg: podSvg() });
  return e;
}

export interface Atlas {
  size: number;
  canvas: HTMLCanvasElement;
  rects: Map<SpriteKey, [number, number]>;
  /** draw sprite centred at (x, y) (canvas px), scaled so that 1 = one cell */
  draw(ctx: CanvasRenderingContext2D, key: SpriteKey, x: number, y: number, cellPx: number, sx?: number, sy?: number, rot?: number, alpha?: number): void;
  dispose(): void;
}

const svgUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
async function loadImage(svg: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.decoding = 'async';
  img.src = svgUrl(svg);
  try { await img.decode(); } catch { await new Promise<void>((res) => { img.onload = () => res(); img.onerror = () => res(); }); }
  return img;
}

export async function buildAtlas(size: number): Promise<Atlas> {
  const list = entries();
  const cols = 8, rows = Math.ceil(list.length / cols);
  const canvas = document.createElement('canvas');
  canvas.width = cols * size; canvas.height = rows * size;
  const ctx = canvas.getContext('2d')!;
  const rects = new Map<SpriteKey, [number, number]>();
  const imgs = await Promise.all(list.map((e) => (e.svg ? loadImage(e.svg) : Promise.resolve(null))));
  list.forEach((e, k) => {
    const x = (k % cols) * size, y = Math.floor(k / cols) * size;
    rects.set(e.key, [x, y]);
    ctx.save(); ctx.translate(x, y);
    ctx.beginPath(); ctx.rect(0, 0, size, size); ctx.clip();
    if (e.draw) e.draw(ctx, size);
    else if (imgs[k]) ctx.drawImage(imgs[k]!, 0, 0, size, size);
    ctx.restore();
  });
  return {
    size, canvas, rects,
    draw(c, key, x, y, cellPx, sx = 1, sy = 1, rot = 0, alpha = 1) {
      const r = rects.get(key); if (!r || alpha <= 0.002) return;
      const d = cellPx;
      if (rot === 0 && sx === 1 && sy === 1 && alpha === 1) { c.drawImage(canvas, r[0], r[1], size, size, x - d / 2, y - d / 2, d, d); return; }
      c.save();
      c.globalAlpha *= alpha;
      c.translate(x, y); if (rot) c.rotate(rot); c.scale(sx, sy);
      c.drawImage(canvas, r[0], r[1], size, size, -d / 2, -d / 2, d, d);
      c.restore();
    },
    dispose() { canvas.width = 0; canvas.height = 0; },
  };
}

/** SVG markup for DOM icons (goal cards, style board): gems / blockers by name */
export { gemSvg, rocketSvg, propSvg, bombSvg, crateSvg, iceSvg };
