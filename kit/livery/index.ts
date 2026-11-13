/**
 * 我的定制 · 涂装台 (shared by every game that lets him paint something of his own).
 *
 *   import { openLiveryStudio, liveryStore, type LiveryTarget } from '@kit/livery';
 *   const TARGET: LiveryTarget = { id: 'snake-battle', parts: [{ id: 'snake', label: '我的蛇', defaults: { color: 'sun', pattern: 'stripes', stickers: [] } }] };
 *   const looks = liveryStore(TARGET).load();                  // what he saved last (defaults before the first 保存)
 *   const res = await openLiveryStudio({ target: TARGET, title: '我的蛇', preview: { draw(ctx, w, h, t, looks, info) { … } } });
 *
 * Parts: one per paintable thing (a snake; a porter + a crate; later a rover body, a flag). A part can narrow the
 * choice (`colors`, `patterns`, `stickers`, `maxStickers: 0`). Every option is open from the start — no unlocks.
 * Painters for games: drawSticker / stickerSvg / paintBallMotif / paintSwatch / motifInk (paint.ts).
 */
export { COLORS, PATTERNS, STICKERS, colorById, patternById, stickerById } from './catalog';
export type { LiveryColor, LiveryPattern, LiverySticker, StickerLayer } from './catalog';
export {
  MAX_STICKERS, LIVERY_VERSION, liveryStore, defaultLooks, sanitizeLook, sanitizeLooks, randomLook, toggleSticker,
  cloneLook, sameLook, sameLooks, colorsOf, patternsOf, stickersOf, maxStickersOf,
} from './look';
export type { PartLook, Looks, LiveryPart, LiveryTarget, LiverySave, LiveryStore } from './look';
export { drawSticker, stickerSvg, paintBallMotif, paintSwatch, paintBall, motifInk, motifInkRgb, hexRgb, rgbCss, mixRgb, shadeRgb, STICKER_PAD } from './paint';
export type { MotifInk, Rgb } from './paint';
export { openLiveryStudio, describeLook } from './studio';
export type { StudioOptions, StudioResult, CanvasPreview, MountPreview, MountedPreview, PreviewInfo, StudioSfx } from './studio';
