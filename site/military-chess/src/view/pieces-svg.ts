/**
 * Piece tiles (spec §6.4): lacquered tiles with engraved names and a gold rank badge.
 *  - wide 92×50 (portrait) / tall 52×88 (landscape), drawn into a padded viewBox (shadow + lift room)
 *  - RED = chamfered octagon outline, BLUE = plain rounded rectangle (shape cue, not only colour)
 *  - faces: 'up' (identity), 'back' (暗棋: coloured back with a shape emboss), 'fan' (翻翻棋: neutral wood back)
 *  - text rotation for face-to-face seating (0 / 180 / ±90; a tall tile rotated ±90 uses the wide layout)
 * Shared gradients live once in the document (`installPieceDefs`).
 */
import { BOMB, FLAG, MINE, NAMES, rankOf } from '../core/pieces';
import { iconPaths } from './icons';
import woodUrl from '../../assets/wood-512.webp';

export type Shape = 'wide' | 'tall';
export type Face = 'up' | 'back' | 'fan';
export const PAD = 6;
export const TILE: Record<Shape, { w: number; h: number }> = { wide: { w: 92, h: 50 }, tall: { w: 52, h: 88 } };

export function installPieceDefs(): void {
  if (document.getElementById('mc-piece-defs')) return;
  const host = document.createElement('div');
  host.innerHTML = `<svg id="mc-piece-defs" width="0" height="0" style="position:absolute;width:0;height:0;overflow:hidden" aria-hidden="true">
    <defs>
      <linearGradient id="mc-lac-0" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e86a55"/><stop offset=".55" stop-color="#c13b2e"/><stop offset="1" stop-color="#a52e23"/></linearGradient>
      <linearGradient id="mc-lac-1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6596e0"/><stop offset=".55" stop-color="#3262ac"/><stop offset="1" stop-color="#284f90"/></linearGradient>
      <linearGradient id="mc-lac-w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c79461"/><stop offset=".6" stop-color="#9a6638"/><stop offset="1" stop-color="#83552c"/></linearGradient>
      <linearGradient id="mc-gloss" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".34"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
      <pattern id="mc-wood-g" patternUnits="userSpaceOnUse" width="256" height="256"><image href="${woodUrl}" width="256" height="256"/></pattern>
      <radialGradient id="mc-badge" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#ffe7a3"/><stop offset=".7" stop-color="#f6c548"/><stop offset="1" stop-color="#d79a1c"/></radialGradient>
    </defs></svg>`;
  document.body.appendChild(host.firstElementChild!);
}

/** tile outline path in tile coordinates (0..w, 0..h) */
function outline(side: number, w: number, h: number): string {
  if (side === 0) {
    // chamfered octagon with softened joins
    const c = 7, r = 2.5;
    return `M${c} 0H${w - c}Q${w - c + r} 0 ${w - c + r * 1.4} ${r}L${w - r} ${c - r * 1.4}Q${w} ${c - r} ${w} ${c}V${h - c}Q${w} ${h - c + r} ${w - r} ${h - c + r * 1.4}L${w - c + r * 1.4} ${h - r}Q${w - c + r} ${h} ${w - c} ${h}H${c}Q${c - r} ${h} ${c - r * 1.4} ${h - r}L${r} ${h - c + r * 1.4}Q0 ${h - c + r} 0 ${h - c}V${c}Q0 ${c - r} ${r} ${c - r * 1.4}L${c - r * 1.4} ${r}Q${c - r} 0 ${c} 0Z`;
  }
  const r = 9;
  return `M${r} 0H${w - r}A${r} ${r} 0 0 1 ${w} ${r}V${h - r}A${r} ${r} 0 0 1 ${w - r} ${h}H${r}A${r} ${r} 0 0 1 0 ${h - r}V${r}A${r} ${r} 0 0 1 ${r} 0Z`;
}

function engraved(x: number, y: number, txt: string, size: number, cls = 'mc-tx'): string {
  return `<text class="${cls} mc-tx-sh" x="${x}" y="${y - 1}" font-size="${size}">${txt}</text>` +
    `<text class="${cls} mc-tx-hl" x="${x}" y="${y + 1}" font-size="${size}">${txt}</text>` +
    `<text class="${cls} mc-tx-f" x="${x}" y="${y}" font-size="${size}">${txt}</text>`;
}

function badge(cx: number, cy: number, type: number): string {
  const disc = `<circle cx="${cx}" cy="${cy + 1.2}" r="13" fill="#000" opacity=".25"/><circle cx="${cx}" cy="${cy}" r="13" fill="url(#mc-badge)" stroke="#8a5a00" stroke-opacity=".55" stroke-width="1"/>`;
  if (type === BOMB || type === MINE || type === FLAG) {
    const name = type === BOMB ? 'bomb' : type === MINE ? 'mine' : 'flag';
    return disc + `<g transform="translate(${cx - 10} ${cy - 10}) scale(${20 / 32})" color="#3a2606">${iconPaths(name)}</g>`;
  }
  return disc + `<text class="mc-rank" x="${cx}" y="${cy + 7.2}" font-size="20">${rankOf(type)}</text>`;
}

/** content (name + badge) laid out in a cw × ch box (wide or tall layout) */
function content(type: number, layout: Shape, cw: number, ch: number, numbers: boolean): string {
  const name = NAMES[type];
  if (!numbers) {
    if (layout === 'wide') return engraved(cw / 2, ch / 2 + 8.5, name, 24);
    return engraved(cw / 2, ch / 2 - 4, name[0], 24) + engraved(cw / 2, ch / 2 + 22, name[1], 24);
  }
  if (layout === 'wide') {
    const tx = 8 + 22; // text centre: 6 pad + 44 text
    return engraved(tx, ch / 2 + 8, name, 22) + badge(cw - 8 - 13, ch / 2, type);
  }
  const cx = cw / 2;
  return engraved(cx, 6 + 19, name[0], 22) + engraved(cx, 6 + 22 + 17, name[1], 22) + badge(cx, ch - 6 - 13, type);
}

function backEmboss(side: number, face: Face, w: number, h: number): string {
  const cx = w / 2, cy = h / 2;
  if (face === 'fan') {
    // neutral wood back + 星港 star medallion (does not leak the colour)
    return `<circle cx="${cx}" cy="${cy + 1}" r="12.5" fill="none" stroke="#3a2210" stroke-opacity=".45" stroke-width="1.4"/>
      <circle cx="${cx}" cy="${cy}" r="12.5" fill="none" stroke="#f3d3a4" stroke-opacity=".55" stroke-width="1.4"/>
      <g transform="translate(${cx - 8} ${cy - 8}) scale(.5)" color="#f6dcb0" opacity=".75">${iconPaths('star')}</g>`;
  }
  if (side === 0) {
    // square seal with four corner notches
    const s = 11;
    const sq = (dy: number, col: string, op: number) =>
      `<path d="M${cx - s + 3} ${cy - s + dy}H${cx + s - 3}L${cx + s} ${cy - s + 3 + dy}V${cy + s - 3 + dy}L${cx + s - 3} ${cy + s + dy}H${cx - s + 3}L${cx - s} ${cy + s - 3 + dy}V${cy - s + 3 + dy}Z" fill="none" stroke="${col}" stroke-opacity="${op}" stroke-width="1.6"/>` +
      `<rect x="${cx - 4.5}" y="${cy - 4.5 + dy}" width="9" height="9" fill="none" stroke="${col}" stroke-opacity="${op}" stroke-width="1.4"/>`;
    return sq(1, '#4a0f0a', 0.55) + sq(0, '#ffd7c9', 0.55);
  }
  const rings = (dy: number, col: string, op: number) =>
    `<circle cx="${cx}" cy="${cy + dy}" r="12" fill="none" stroke="${col}" stroke-opacity="${op}" stroke-width="1.6"/><circle cx="${cx}" cy="${cy + dy}" r="7" fill="none" stroke="${col}" stroke-opacity="${op}" stroke-width="1.4"/><circle cx="${cx}" cy="${cy + dy}" r="2.4" fill="${col}" fill-opacity="${op}"/>`;
  return rings(1, '#0b1d3d', 0.55) + rings(0, '#d6e4ff', 0.55);
}

export interface TileOpts {
  side: number;
  type: number;
  shape: Shape;
  face: Face;
  numbers?: boolean;
  /** text rotation in degrees (0, 180, 90, −90) */
  rot?: number;
}

/** inner markup of a tile svg (viewBox = −PAD … w+PAD) */
export function tileMarkup(o: TileOpts): string {
  const { w, h } = TILE[o.shape];
  const fill = o.face === 'fan' ? 'url(#mc-lac-w)' : `url(#mc-lac-${o.side})`;
  const deep = o.face === 'fan' ? '#5e3a1c' : o.side === 0 ? '#7a1d16' : '#18335f';
  const path = outline(o.face === 'fan' ? 1 : o.side, w, h);
  const parts: string[] = [];
  parts.push(`<path class="mc-shadow" d="${path}" transform="translate(0 3)" fill="#1e140a" opacity=".35"/>`);
  parts.push(`<path d="${path}" fill="${deep}"/>`); // bottom edge (thickness)
  parts.push(`<path d="${path}" transform="translate(0 -3) scale(1 ${(h) / h})" fill="${fill}"/>`);
  parts.push(`<path d="${path}" transform="translate(0 -3)" fill="none" stroke="${deep}" stroke-opacity=".6" stroke-width="1"/>`);
  parts.push(`<path d="${path}" transform="translate(0 -3) scale(1 .3)" fill="url(#mc-gloss)" opacity=".9"/>`);
  parts.push(`<g transform="translate(0 -3)">`);
  if (o.face === 'up') {
    const rot = o.rot ?? 0;
    const layout: Shape = o.shape === 'tall' && Math.abs(rot) === 90 ? 'wide' : o.shape === 'wide' ? 'wide' : 'tall';
    const cw = layout === o.shape ? w : h, ch = layout === o.shape ? h : w;
    parts.push(`<g transform="translate(${w / 2} ${h / 2}) rotate(${rot}) translate(${-cw / 2} ${-ch / 2})">${content(o.type, layout, cw, ch, o.numbers !== false)}</g>`);
  } else {
    parts.push(backEmboss(o.side, o.face, w, h));
  }
  parts.push('</g>');
  return parts.join('');
}

export function tileSvg(o: TileOpts, cls = 'mc-tile'): string {
  const { w, h } = TILE[o.shape];
  return `<svg class="${cls}" viewBox="${-PAD} ${-PAD} ${w + 2 * PAD} ${h + 2 * PAD}" width="${w + 2 * PAD}" height="${h + 2 * PAD}" aria-hidden="true">${tileMarkup(o)}</svg>`;
}
