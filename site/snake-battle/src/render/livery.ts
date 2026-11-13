/**
 * 我的蛇: the snake he paints in the shared 涂装台 (kit/livery). It is one more skin id, `mine`, built from the saved
 * look (colour + pattern + up to 3 stickers) on a round head with the cute eyes; everything downstream (atlas,
 * lobby showcase, portraits, podium) goes through skinById like any other skin.
 *  - Patterns become segment variants: stripes = whole balls in the trim colour (2 on, 2 off); the other patterns
 *    are overlay marks (DECO sprites, rotated along the body) painted once per match into the atlas by the kit's
 *    paintBallMotif — nothing is drawn per frame that was not drawn before.
 *  - Stickers are atlas sprites too (`stk:<id>`), drawn upright in one extra pass over the body so they are never
 *    hidden by the segment in front (3 quads a frame at most).
 */
import { liveryStore, type LiveryTarget, type PartLook } from '@kit/livery/look';
import { colorById, COLORS } from '@kit/livery/catalog';
import { paintBallMotif, motifInkRgb, type Rgb } from '@kit/livery/paint';
import type { SkinDef } from './art';

export const MINE = 'mine';
export const SNAKE_LIVERY: LiveryTarget = {
  id: 'snake-battle',
  parts: [{ id: 'snake', label: '我的蛇', defaults: { color: 'sun', pattern: 'stripes', stickers: [] } }],
};

let store: ReturnType<typeof liveryStore> | null = null;
let cached: PartLook | null = null;
const st = () => {
  if (!store) { store = liveryStore(SNAKE_LIVERY); store.subscribe(() => { cached = null; }); }
  return store;
};
/** the saved look of his snake (defaults before the first 保存) */
export function myLook(): PartLook {
  if (!cached) { try { cached = st().load().snake; } catch { cached = { ...SNAKE_LIVERY.parts[0].defaults, stickers: [] }; } }
  return cached;
}
export const lookKey = (l: PartLook) => `${l.color}.${l.pattern}.${l.stickers.join('-')}`;

const skins = new Map<string, SkinDef>();
/** the `mine` skin for a look (the saved one by default); one object per look so callers may compare by identity */
export function mineSkin(l: PartLook = myLook()): SkinDef {
  const key = lookKey(l);
  let sk = skins.get(key);
  if (!sk) {
    const c = colorById(l.color) ?? COLORS[0];
    sk = { id: MINE, name: '我的蛇', base: c.base, accent: c.trim, pattern: `lv-${l.pattern}`, head: 'round', eyes: 'cute', stickers: [...l.stickers], lvKey: `mine-${key}` };
    skins.set(key, sk);
  }
  return sk;
}

/** AI colour words too close to his body colour (the same idea as 金星蛇 avoiding 黄 / 橙) */
const AVOID: Record<string, string[]> = { sun: ['黄', '橙'], rocket: ['红', '橙'], leaf: ['绿'], jade: ['青', '绿'], sky: ['蓝'], nebula: ['紫'], steel: ['银', '灰', '白'], night: [] };
export const avoidFor = (l: PartLook = myLook()) => AVOID[l.color] ?? [];

// ------------------------------------------------------------------ pattern → segment variants
const MOTIF: Record<string, [string, number]> = {
  lvDotA: ['dots', 0], lvDotB: ['dots', 1], lvStar: ['stars', 0], lvFlameA: ['flames', 0], lvFlameB: ['flames', 1],
  lvZigA: ['zigzag', 0], lvZigB: ['zigzag', 1], lvScaleA: ['scales', 0], lvScaleB: ['scales', 1],
};
/** overlay variants (they join skins.ts DECO) */
export const LV_DECO = Object.keys(MOTIF);
export function lvVariant(pattern: string, i: number): string {
  switch (pattern) {
    case 'lv-stripes': return i % 4 >= 2 ? 'alt' : 'plain';
    case 'lv-dots': return i % 2 ? 'lvDotB' : 'lvDotA';
    case 'lv-stars': return i % 3 === 1 ? 'lvStar' : 'plain';
    case 'lv-flames': return i % 2 ? 'lvFlameB' : 'lvFlameA';
    case 'lv-zigzag': return i % 2 ? 'lvZigB' : 'lvZigA';
    case 'lv-scales': return i % 2 ? 'lvScaleB' : 'lvScaleA';
    default: return 'plain';
  }
}
/** paint an overlay variant into a deco cell (Rb = the ball radius inside the cell; +x toward the head) */
export function paintLvDeco(c: CanvasRenderingContext2D, Rb: number, v: string, base: Rgb, acc: Rgb): boolean {
  const m = MOTIF[v];
  if (!m) return false;
  return paintBallMotif(c, m[0], Rb, motifInkRgb(base, acc), m[1]);
}

/** which body segments carry stickers 1–3: a few segments behind the head, spread out on a long body */
export function stickerSlots(n: number): number[] {
  const step = Math.max(1.5, Math.min(4, (n - 3) / 3));
  return [0, 1, 2].map((k) => Math.round(3 + k * step)).filter((i) => i < n - 1);
}
/** sticker size (full width incl. its white border) against the body radius */
export const STICKER_K = 1.9;
