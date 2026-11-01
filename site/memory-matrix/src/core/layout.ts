// Round-screen geometry (spec §2.2). The board is always one square of side S = min(640, availW, availH); every other region is carved from the
// rest. Same formulas as tools/memory-matrix/proto/layout.mjs (the validator), but fed with the real viewport and the real safe-area insets.
export interface Safe { top: number; right: number; bottom: number; left: number }
export interface RoundLayout {
  kind: 'tablet-portrait' | 'tablet-landscape' | 'phone-portrait' | 'phone-landscape';
  phone: boolean; landscape: boolean;
  /** board side in CSS px and its top-left corner */
  S: number; x: number; y: number;
  top: number; strip: number; act: number; colW: number; rail: number; gutter: number; gap: number; minHit: number;
  /** side column rectangle (landscape) or the strip / action bar rectangles (portrait) */
  side: { x: number; y: number; w: number; h: number } | null;
  stripRect: { x: number; y: number; w: number; h: number } | null;
  actRect: { x: number; y: number; w: number; h: number } | null;
  mirror: number;
}
export const CAP = 640;
export const HOME = 56;

export function computeLayout(w: number, h: number, safe: Safe = { top: 0, right: 0, bottom: 0, left: 0 }): RoundLayout {
  const landscape = w > h, phone = Math.min(w, h) < 600;
  const kind = (phone ? 'phone' : 'tablet') + (landscape ? '-landscape' : '-portrait') as RoundLayout['kind'];
  let top: number, strip: number, act: number, colW: number, rail: number, gutter: number, gap: number, pad: number;
  if (!phone && !landscape) { top = safe.top + 64; strip = 120; act = 88; colW = 0; rail = 0; gutter = 24; gap = 8; pad = 8; }
  else if (!phone) { top = safe.top + 64; strip = 0; act = 24; colW = 300; rail = 0; gutter = 24; gap = 8; pad = 8; }
  else if (!landscape) { top = safe.top + 60; strip = h >= 640 ? 56 : 48; act = h >= 640 ? 64 : 56; colW = 0; rail = 0; gutter = 12; gap = 4; pad = 8; }
  else { top = 0; strip = 0; act = 0; colW = w < 760 ? 168 : 200; rail = HOME + 8; gutter = 8; gap = 4; pad = 16; }      // 667x375 / 568x320: a narrower column keeps the 6x6 cells >= 44 px
  const availW = w - safe.left - safe.right - rail - 2 * gutter - colW - (landscape ? gutter : 0);
  const availH = h - top - strip - act - safe.bottom - pad - (phone && landscape ? Math.max(0, safe.top) : 0);
  const S = Math.max(160, Math.floor(Math.min(CAP, availW, availH)));
  const x0 = safe.left + rail + gutter;
  const x = landscape ? x0 : Math.round((w - S) / 2);
  const y = landscape ? (phone ? Math.round(Math.max(safe.top, (h - safe.bottom - S) / 2)) : top + Math.max(0, Math.round((availH - S) / 2))) : top + strip;
  const side = landscape ? { x: x + S + gutter, y: phone ? safe.top + 8 : top, w: colW, h: h - (phone ? safe.top + 8 : top) - safe.bottom - 8 } : null;
  const stripRect = !landscape ? { x: gutter, y: top, w: w - 2 * gutter, h: strip } : null;
  const actRect = !landscape ? { x: gutter, y: y + S + 8, w: w - 2 * gutter, h: Math.max(act - 8, h - safe.bottom - (y + S + 8) - 6) } : null;
  return { kind, phone, landscape, S, x, y, top, strip, act, colW, rail, gutter, gap, minHit: phone ? 44 : 56, side, stripRect, actRect, mirror: phone ? 8 : 12 };
}

/** cell size of a g x g board with an optional mirror strip through the middle */
export const cellSize = (S: number, g: number, gap: number, extra = 0): number => Math.floor((S - (g - 1) * gap - extra) / g);
/** tap radius of an s2 star: the closest two stars are 0.2 S apart */
export const starHit = (S: number): number => Math.floor(Math.min(64, 0.2 * S - 8));

/** the kit's subtitle bar (fixed on <body>, 56 px tall, 10 px above the bottom safe inset): the strip no primary control of the station / sector page / atlas may enter (styles.css reserves it; the Playwright layout contract measures it) */
export const SUBTITLE_BAR = 56;
export const subtitleStrip = (h: number, safeBottom = 0): { top: number; height: number } => ({ top: h - safeBottom - 10 - SUBTITLE_BAR, height: SUBTITLE_BAR });
