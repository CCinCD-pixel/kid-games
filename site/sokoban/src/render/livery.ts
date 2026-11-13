/**
 * 我的定制 for 星港搬运工: 小推's body and the 星港补给 kraft crate, painted in the shared 涂装台 (kit/livery).
 * Each part starts on its own colour (小推橙 / 纸箱色) with no pattern — that look is drawn by the original art,
 * untouched; anything else becomes a "paint" the renderers read: body / crate colours, a cached pattern layer
 * clipped to the surface, cached sticker images. Only colour 0 crates take the paint: the coloured crates carry
 * the pad-matching rule and are never repainted. The head keeps the hero amber (a paint job is for the body).
 */
import { liveryStore, type LiveryTarget, type Looks, type PartLook } from '@kit/livery/look';
import { colorsOf, partColor } from '@kit/livery/look';
import { patternLayer, stickerImage, hexRgb, mixRgb, shadeRgb, rgbCss } from '@kit/livery/paint';

export const SOKOBAN_LIVERY: LiveryTarget = {
  id: 'sokoban',
  parts: [
    { id: 'porter', label: '小推', ownColors: [{ id: 'amber', name: '小推橙', base: '#F9A726', trim: '#1D2647' }], defaults: { color: 'amber', pattern: 'plain', stickers: [] }, maxStickers: 2 },
    { id: 'crate', label: '箱子', ownColors: [{ id: 'kraft', name: '纸箱色', base: '#A27038', trim: '#F9A726' }], defaults: { color: 'kraft', pattern: 'plain', stickers: [] }, maxStickers: 1 },
  ],
};
const PORTER = SOKOBAN_LIVERY.parts[0], CRATE = SOKOBAN_LIVERY.parts[1];

/** what the renderers need for a painted surface */
export interface Paint {
  key: string;
  base: string; hi: string; shade: string; edge: string; trim: string;
  /** cached pattern image (null = 素色) */
  layer: HTMLCanvasElement | null;
  stickers: HTMLCanvasElement[];
}

const isDefault = (l: PartLook, d: PartLook) => l.color === d.color && l.pattern === 'plain' && l.stickers.length === 0;
const cache = new Map<string, Paint>();
function paintOf(part: typeof PORTER, l: PartLook): Paint | null {
  if (isDefault(l, part.defaults)) return null;
  const key = `${part.id}:${l.color}.${l.pattern}.${l.stickers.join('-')}`;
  let p = cache.get(key);
  if (!p) {
    const c = partColor(part, l.color), b = hexRgb(c.base);
    p = {
      key, base: c.base, trim: c.trim,
      hi: rgbCss(mixRgb(b, [255, 255, 255], 0.32)), shade: rgbCss(shadeRgb(b, 0.74)), edge: rgbCss(shadeRgb(b, 0.45)),
      layer: patternLayer(l.pattern, c, 192), stickers: l.stickers.map((id) => stickerImage(id, 128)),
    };
    cache.set(key, p);
  }
  return p;
}
export const porterPaintOf = (looks: Looks) => paintOf(PORTER, looks.porter);
export const cratePaintOf = (looks: Looks) => paintOf(CRATE, looks.crate);

let store: ReturnType<typeof liveryStore> | null = null;
let saved: Looks | null = null;
function savedLooks(): Looks {
  if (!store) { store = liveryStore(SOKOBAN_LIVERY); store.subscribe(() => { saved = null; }); }
  if (!saved) { try { saved = store.load(); } catch { saved = { porter: { ...PORTER.defaults }, crate: { ...CRATE.defaults } }; } }
  return saved;
}
/** the saved paint of 小推's body / the kraft crate (null = the original art) */
export const porterPaint = () => porterPaintOf(savedLooks());
export const cratePaint = () => cratePaintOf(savedLooks());
/** own colours first: for tests and the studio */
export const porterColors = () => colorsOf(PORTER);
