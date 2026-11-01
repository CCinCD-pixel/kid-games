/** Paper-cut crystal pictures (flat vector on the warm paper): 颗 = faceted gem, 根 = rod of ten gems, 箱 = crate of ten rods. Pure strings. */
export const GEM = (x: number, y: number, s: number, hue = 'var(--mb-gem, var(--xg-mars))'): string =>
  `<g class="pc-gem" transform="translate(${x},${y})"><path d="M0 ${-s} L${s * 0.8} ${-s * 0.3} L${s * 0.5} ${s * 0.8} L${-s * 0.5} ${s * 0.8} L${-s * 0.8} ${-s * 0.3}Z" fill="${hue}" stroke="var(--xg-ink-800)" stroke-width="1.6" stroke-linejoin="round"/><path d="M0 ${-s} L${s * 0.2} ${s * 0.1} L${-s * 0.5} ${s * 0.8}M0 ${-s} L${-s * 0.2} ${s * 0.1} L${s * 0.5} ${s * 0.8}" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="1.3"/></g>`;
export function rodSvg(x: number, y: number, w = 20, h = 78): string {
  const r = w / 2; let s = `<g class="pc-rod" transform="translate(${x},${y})"><rect x="${-r}" y="0" width="${w}" height="${h}" rx="${r * 0.55}" fill="var(--xg-gold-500)" stroke="var(--xg-ink-800)" stroke-width="1.8"/>`;
  for (let i = 1; i < 10; i++) s += `<line x1="${-r + 2}" y1="${(h * i) / 10}" x2="${r - 2}" y2="${(h * i) / 10}" stroke="var(--xg-gold-700)" stroke-width="1"/>`;
  return s + `<rect x="${-r + 3}" y="3" width="${w * 0.22}" height="${h - 6}" rx="2" fill="rgba(255,255,255,.4)"/></g>`;
}
export function boxSvg(x: number, y: number, s = 64): string {
  let g = `<g class="pc-box" transform="translate(${x},${y})"><rect x="0" y="0" width="${s}" height="${s}" rx="8" fill="var(--xg-jade-500)" stroke="var(--xg-ink-800)" stroke-width="2"/>`;
  for (let i = 1; i < 10; i++) g += `<line x1="${(s * i) / 10}" y1="4" x2="${(s * i) / 10}" y2="${s - 4}" stroke="var(--xg-jade-700)" stroke-width="1"/>`;
  return g + `<rect x="4" y="4" width="${s - 8}" height="${s * 0.18}" rx="4" fill="rgba(255,255,255,.35)"/></g>`;
}
export interface Parts { boxes?: number; rods?: number; crystals?: number }
function layoutOf(p: Parts, w: number, h: number) {
  const boxes = Math.max(0, p.boxes ?? 0), rods = Math.max(0, p.rods ?? 0), gems = Math.max(0, p.crystals ?? 0);
  const gemCols = Math.min(5, Math.max(1, gems)), gemRows = Math.ceil(gems / 5);
  const boxW = boxes * 78, rodW = rods ? rods * 26 + 14 : 0, gemW = gems ? gemCols * 30 + 10 : 0;
  const rodH = rods ? 96 : 0, gemH = gems ? 22 + (gemRows - 1) * 32 + 14 : 0;
  const restW = rodW + gemW, restH = Math.max(rodH, gemH, rods || gems ? 96 : 0);
  const oneW = boxW + restW, oneH = Math.max(boxes ? 96 : 0, restH, 96);
  const twoW = Math.max(boxW, restW), twoH = 96 + 10 + restH;
  const fit = (cw: number, ch: number): number => Math.min(1, (w - 16) / Math.max(1, cw), (h - 8) / Math.max(1, ch));
  const stacked = boxes > 0 && restW > 0 && fit(twoW, twoH) > fit(oneW, oneH) * 1.05;
  const W = stacked ? twoW : oneW, H = stacked ? twoH : oneH;
  return { boxes, rods, gems, restW, restH, W, H, stacked, sc: fit(W, H) };
}
/** the 1:1-or-smaller scale partsSvg would use for this picture in w×h */
export function partsScale(p: Parts, w: number, h: number): number { return layoutOf(p, w, h).sc; }
/**
 * A tray picture: boxes | rods | loose crystals, EVERY piece drawn (a picture that shows fewer pieces than the number is a wrong question: 935 used to show 4 boxes),
 * centred and scaled to fit w×h. One row (boxes, rods, gems left→right) when it fits at a good size, else boxes above and rods + gems below (a 9-box number).
 */
/** `cap`: a scale limit, so that two pictures drawn side by side (7 + 8, 大的 / 小的) share ONE piece size and the bigger number really looks bigger */
export function partsSvg(p: Parts, w: number, h: number, cap = 1): string {
  const L = layoutOf(p, w, h); const { boxes, rods, gems, restW, restH, W, H, stacked } = L; const sc = Math.min(L.sc, cap);
  let s = `<svg class="pic" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"><g transform="translate(${((w - W * sc) / 2).toFixed(1)},${((h - H * sc) / 2).toFixed(1)}) scale(${sc.toFixed(4)})">`;
  let x = 0; let y = stacked ? 0 : (H - 96) / 2;
  for (let i = 0; i < boxes; i++) { s += boxSvg(x, y + 14, 64); x += 78; }
  if (stacked) { x = (W - restW) / 2; y = 96 + 10; } else { y = (H - restH) / 2; }
  for (let i = 0; i < rods; i++) { s += rodSvg(x + 10, y + 6, 18, 84); x += 26; }
  if (rods) x += 14;
  for (let i = 0; i < gems; i++) s += GEM(x + 14 + (i % 5) * 30, y + 22 + Math.floor(i / 5) * 32, 12);
  return s + '</g></svg>';
}
/** two pictures side by side, drawn at ONE piece size (the smaller of the two fits) */
export function partsPair(a: Parts, b: Parts, w: number, h: number): [string, string] { const cap = Math.min(partsScale(a, w, h), partsScale(b, w, h)); return [partsSvg(a, w, h, cap), partsSvg(b, w, h, cap)]; }
export const gemOnly = (n: number, w: number, h: number): string => partsSvg({ crystals: n }, w, h);
/** A pictured number: 12 → 1 rod + 2 gems, 345 → 3 boxes 4 rods 5 gems. */
export const numberParts = (n: number): Parts => ({ boxes: Math.floor(n / 100), rods: Math.floor(n / 10) % 10, crystals: n % 10 });

/** Stand-alone icons for the tray / pods / counter views (each a tiny self-contained svg; sizes in px). */
export const gemIcon = (px = 28, hue = 'var(--mb-gem, var(--xg-mars))'): string => `<svg class="ic ic-gem" viewBox="-14 -14 28 28" width="${px}" height="${px}" aria-hidden="true">${GEM(0, 1, 11, hue)}</svg>`;
export const rodIcon = (w = 14, h = 64): string => `<svg class="ic ic-rod" viewBox="-10 -1 20 82" width="${w}" height="${h}" preserveAspectRatio="none" aria-hidden="true">${rodSvg(0, 0, 16, 80)}</svg>`;
export const boxIcon = (px = 40): string => `<svg class="ic ic-box" viewBox="-2 -2 68 68" width="${px}" height="${px}" aria-hidden="true">${boxSvg(0, 0, 64)}</svg>`;
/** `n` gems in a dice-like fixed pattern inside a w×h box (货舱 pattern, n ≤ 10) — the same n always looks the same. */
export function podPattern(n: number, w: number, h: number, hue = 'var(--mb-gem, var(--xg-mars))'): string {
  const P: Record<number, [number, number][]> = {
    1: [[.5, .5]], 2: [[.3, .3], [.7, .7]], 3: [[.25, .25], [.5, .5], [.75, .75]], 4: [[.3, .3], [.7, .3], [.3, .7], [.7, .7]], 5: [[.28, .28], [.72, .28], [.5, .5], [.28, .72], [.72, .72]],
    6: [[.3, .22], [.7, .22], [.3, .5], [.7, .5], [.3, .78], [.7, .78]], 7: [[.3, .2], [.7, .2], [.3, .5], [.5, .5], [.7, .5], [.3, .8], [.7, .8]],
    8: [[.25, .2], [.5, .2], [.75, .2], [.25, .5], [.75, .5], [.25, .8], [.5, .8], [.75, .8]], 9: [[.25, .2], [.5, .2], [.75, .2], [.25, .5], [.5, .5], [.75, .5], [.25, .8], [.5, .8], [.75, .8]],
    10: [[.22, .2], [.5, .2], [.78, .2], [.22, .5], [.5, .5], [.78, .5], [.22, .8], [.5, .8], [.78, .8], [.5, .35]],
  };
  const s = Math.min(w, h) * (n >= 8 ? 0.17 : 0.2);
  return (P[Math.max(1, Math.min(10, n))] ?? []).slice(0, n).map(([x, y]) => GEM(x * w, y * h, s, hue)).join('');
}
