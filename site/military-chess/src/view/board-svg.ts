/**
 * The board as one static SVG per orientation (spec §6.3): wood frame, printed field, roads,
 * black-and-white railways with rounded corners, camps, HQs, the mountain band with ink mountains
 * and three railway bridges. Generated once per orientation and cached.
 */
import { N, X, Y, edges, isCamp, isHQ, isRail, isRailEdge, half, idx } from '../core/board';
import { stationLocal, type BoardGeom } from './layout';
import woodUrl from '../../assets/wood-512.webp';
import grainUrl from '@kit/textures/grain-overlay.webp';

const f = (n: number): string => (Math.round(n * 10) / 10).toString();

function P(g: BoardGeom, x: number, y: number) {
  return stationLocal(g, idx(x, y));
}

/** path through rail stations with rounded corners where the direction changes */
function railPath(g: BoardGeom, pts: Array<[number, number]>, closed: boolean, r: number): string {
  const xy = pts.map(([x, y]) => P(g, x, y));
  const n = xy.length;
  const seg = (i: number) => xy[(i + n) % n];
  let d = '';
  const corner = (i: number) => {
    const a = seg(i - 1), b = seg(i), c = seg(i + 1);
    const v1 = { x: b.x - a.x, y: b.y - a.y }, v2 = { x: c.x - b.x, y: c.y - b.y };
    const l1 = Math.hypot(v1.x, v1.y), l2 = Math.hypot(v2.x, v2.y);
    const p1 = { x: b.x - (v1.x / l1) * r, y: b.y - (v1.y / l1) * r };
    const p2 = { x: b.x + (v2.x / l2) * r, y: b.y + (v2.y / l2) * r };
    return { p1, p2, b };
  };
  if (closed) {
    const c0 = corner(0);
    d += `M${f(c0.p2.x)} ${f(c0.p2.y)}`;
    for (let i = 1; i <= n; i++) {
      const c = corner(i);
      d += `L${f(c.p1.x)} ${f(c.p1.y)}Q${f(c.b.x)} ${f(c.b.y)} ${f(c.p2.x)} ${f(c.p2.y)}`;
    }
    return d + 'Z';
  }
  d += `M${f(xy[0].x)} ${f(xy[0].y)}`;
  for (let i = 1; i < n; i++) d += `L${f(xy[i].x)} ${f(xy[i].y)}`;
  return d;
}

function mountain(cx: number, cy: number, w: number, h: number, rot: number): string {
  // two ink peaks with a paper ridge line; fixed path scaled to w × h
  const sx = w / 70, sy = h / 40;
  const t = `translate(${f(cx)} ${f(cy)}) rotate(${rot}) scale(${f(sx)} ${f(sy)})`;
  return `<g transform="${t}">
    <path d="M-35 16 L-14 -14 L-4 -2 L8 -18 L35 16 Z" fill="#3e5129"/>
    <path d="M-35 16 L-14 -14 L-9 -8 L-20 16 Z" fill="#2c3b1c" opacity=".85"/>
    <path d="M-4 -2 L8 -18 L13 -11 L2 16 L-8 16 Z" fill="#2c3b1c" opacity=".7"/>
    <path d="M-14 -14 L-16 -6 M8 -18 L5 -8 L9 -2" fill="none" stroke="#f4ecd3" stroke-width="1.6" stroke-linecap="round" opacity=".75"/>
    <path d="M-30 16 Q0 10 30 16" fill="none" stroke="#2a3818" stroke-width="2" opacity=".6"/>
  </g>`;
}

export function boardSvg(g: BoardGeom): string {
  const W = g.rect.w, H = g.rect.h, fr = g.frame;
  const portrait = g.o === 'portrait';
  const out: string[] = [];
  out.push(`<svg class="mc-board-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true">`);
  out.push(`<defs>
    <pattern id="mc-wood-${g.o}" patternUnits="userSpaceOnUse" width="256" height="256" patternTransform="${portrait ? '' : 'rotate(90)'}">
      <image href="${woodUrl}" width="256" height="256" preserveAspectRatio="none"/>
    </pattern>
    <pattern id="mc-grain-${g.o}" patternUnits="userSpaceOnUse" width="256" height="256">
      <image href="${grainUrl}" width="256" height="256"/>
    </pattern>
    <linearGradient id="mc-bevel-${g.o}" x1="0" y1="0" x2="${portrait ? 0 : 1}" y2="${portrait ? 1 : 0}">
      <stop offset="0" stop-color="#e2b07a" stop-opacity=".55"/>
      <stop offset=".5" stop-color="#c08a52" stop-opacity="0"/>
      <stop offset="1" stop-color="#3a2210" stop-opacity=".45"/>
    </linearGradient>
    <radialGradient id="mc-vign-${g.o}" cx=".5" cy=".5" r=".75">
      <stop offset=".6" stop-color="#000" stop-opacity="0"/>
      <stop offset="1" stop-color="#1b2210" stop-opacity=".28"/>
    </radialGradient>
  </defs>`);
  // 1) wood frame
  out.push(`<rect x="0" y="0" width="${W}" height="${H}" rx="18" fill="#5e3a1c"/>`);
  out.push(`<rect x="1.5" y="1.5" width="${W - 3}" height="${H - 3}" rx="17" fill="url(#mc-wood-${g.o})"/>`);
  out.push(`<rect x="1.5" y="1.5" width="${W - 3}" height="${H - 3}" rx="17" fill="url(#mc-bevel-${g.o})"/>`);
  out.push(`<rect x="2.5" y="2.5" width="${W - 5}" height="${H - 5}" rx="16" fill="none" stroke="#f0c48c" stroke-opacity=".45" stroke-width="1.2"/>`);
  out.push(`<rect x="${fr - 2}" y="${fr - 2}" width="${W - 2 * fr + 4}" height="${H - 2 * fr + 4}" rx="7" fill="#3a2210"/>`);
  // 2) field: two halves + band
  const fx = fr, fy = fr, fw = W - 2 * fr, fh = H - 2 * fr;
  if (portrait) {
    const bandY = fy + 6 * g.rowStep;
    out.push(`<rect x="${fx}" y="${fy}" width="${fw}" height="${6 * g.rowStep}" fill="#748a49"/>`);
    out.push(`<rect x="${fx}" y="${bandY}" width="${fw}" height="${g.band}" fill="#5d6f3c"/>`);
    out.push(`<rect x="${fx}" y="${bandY + g.band}" width="${fw}" height="${6 * g.rowStep}" fill="#7f9452"/>`);
  } else {
    const bandX = fx + 6 * g.rowStep;
    out.push(`<rect x="${fx}" y="${fy}" width="${6 * g.rowStep}" height="${fh}" fill="#7f9452"/>`);
    out.push(`<rect x="${bandX}" y="${fy}" width="${g.band}" height="${fh}" fill="#5d6f3c"/>`);
    out.push(`<rect x="${bandX + g.band}" y="${fy}" width="${6 * g.rowStep}" height="${fh}" fill="#748a49"/>`);
  }
  out.push(`<rect x="${fx}" y="${fy}" width="${fw}" height="${fh}" fill="url(#mc-grain-${g.o})" opacity=".10" style="mix-blend-mode:multiply"/>`);
  out.push(`<rect x="${fx}" y="${fy}" width="${fw}" height="${fh}" fill="url(#mc-vign-${g.o})"/>`);
  out.push(`<rect x="${fx + 1.5}" y="${fy + 1.5}" width="${fw - 3}" height="${fh - 3}" rx="5" fill="none" stroke="#1c2410" stroke-opacity=".35" stroke-width="3"/>`);
  // band: subtle river-ish texture lines
  // 3) roads (non-rail edges)
  const roads: string[] = [], diags: string[] = [];
  for (const [a, b] of edges()) {
    if (isRailEdge(a, b)) continue;
    const pa = stationLocal(g, a), pb = stationLocal(g, b);
    const seg = `M${f(pa.x)} ${f(pa.y)}L${f(pb.x)} ${f(pb.y)}`;
    if (X(a) !== X(b) && Y(a) !== Y(b)) diags.push(seg);
    else roads.push(seg);
  }
  out.push(`<path d="${roads.join('')}" fill="none" stroke="#f4ecd3" stroke-width="2.5" stroke-linecap="round" opacity=".92"/>`);
  out.push(`<path d="${diags.join('')}" fill="none" stroke="#f4ecd3" stroke-width="2" stroke-dasharray="4 4" stroke-linecap="round" opacity=".85"/>`);
  // 4) mountain band ornaments: ink mountains at b and d, bridges at a, c, e
  {
    const pb6 = P(g, 1, 6), pb7 = P(g, 1, 5), pd6 = P(g, 3, 6), pd7 = P(g, 3, 5);
    const mw = portrait ? 70 : 46, mh = portrait ? 34 : 34;
    out.push(mountain((pb6.x + pb7.x) / 2, (pb6.y + pb7.y) / 2 + 2, mw, mh, 0));
    out.push(mountain((pd6.x + pd7.x) / 2, (pd6.y + pd7.y) / 2 + 2, mw, mh, 0));
    for (const x of [0, 2, 4]) {
      const a = P(g, x, 6), b = P(g, x, 5);
      const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      const len = Math.hypot(a.x - b.x, a.y - b.y) - 34;
      const along = portrait ? 'v' : 'h';
      const sleepers: string[] = [];
      for (let k = -len / 2 + 4; k <= len / 2 - 2; k += 8) {
        if (along === 'v') sleepers.push(`M${f(cx - 9)} ${f(cy + k)}L${f(cx + 9)} ${f(cy + k)}`);
        else sleepers.push(`M${f(cx + k)} ${f(cy - 9)}L${f(cx + k)} ${f(cy + 9)}`);
      }
      const rails = along === 'v'
        ? `M${f(cx - 13)} ${f(cy - len / 2)}V${f(cy + len / 2)}M${f(cx + 13)} ${f(cy - len / 2)}V${f(cy + len / 2)}`
        : `M${f(cx - len / 2)} ${f(cy - 13)}H${f(cx + len / 2)}M${f(cx - len / 2)} ${f(cy + 13)}H${f(cx + len / 2)}`;
      const deck = along === 'v'
        ? `<rect x="${f(cx - 15)}" y="${f(cy - len / 2)}" width="30" height="${f(len)}" rx="3" fill="#6b4a2a" opacity=".9"/>`
        : `<rect x="${f(cx - len / 2)}" y="${f(cy - 15)}" width="${f(len)}" height="30" rx="3" fill="#6b4a2a" opacity=".9"/>`;
      out.push(`<g class="mc-bridge">${deck}<path d="${sleepers.join('')}" stroke="#3e2914" stroke-width="3" stroke-linecap="round"/><path d="${rails}" stroke="#d9c39a" stroke-width="3" stroke-linecap="round"/></g>`);
    }
  }
  // 5) railways: outer loop with rounded corners, rows 6 and 7 (y 6 and 5), centre crossing c6–c7
  const loop = railPath(g, [[0, 1], [4, 1], [4, 10], [0, 10]], true, 22);
  const rows = railPath(g, [[0, 5], [4, 5]], false, 0) + railPath(g, [[0, 6], [4, 6]], false, 0) + railPath(g, [[2, 5], [2, 6]], false, 0);
  const rail = loop + rows;
  out.push(`<path d="${rail}" fill="none" stroke="#2a241d" stroke-width="9" stroke-linejoin="round"/>`);
  out.push(`<path d="${rail}" fill="none" stroke="#f1e8cf" stroke-width="5.5" stroke-dasharray="10 10" stroke-dashoffset="10" stroke-linejoin="round"/>`);
  // 6) station dots (ordinary stations), camps, HQs
  const dots: string[] = [];
  for (let i = 0; i < N; i++) {
    if (isCamp(i) || isHQ(i)) continue;
    const p = stationLocal(g, i);
    dots.push(`<circle cx="${f(p.x)}" cy="${f(p.y)}" r="${isRail(i) ? 4.2 : 3.4}" fill="${isRail(i) ? '#2a241d' : '#f4ecd3'}" ${isRail(i) ? 'stroke="#f1e8cf" stroke-width="1.6"' : ''}/>`);
  }
  out.push(dots.join(''));
  const campR = 0.34 * Math.min(g.rowStep, g.colStep) + 4;
  for (let i = 0; i < N; i++) {
    if (!isCamp(i)) continue;
    const p = stationLocal(g, i);
    out.push(`<g class="mc-camp"><circle cx="${f(p.x)}" cy="${f(p.y + 1.5)}" r="${f(campR + 1)}" fill="#1c2410" opacity=".25"/>
      <circle cx="${f(p.x)}" cy="${f(p.y)}" r="${f(campR)}" fill="#f7efdc" fill-opacity=".9" stroke="#5e3a1c" stroke-width="2"/>
      <circle cx="${f(p.x)}" cy="${f(p.y)}" r="${f(campR - 4)}" fill="none" stroke="#5e3a1c" stroke-width="1" stroke-opacity=".7"/>
      <text x="${f(p.x)}" y="${f(p.y + 4.5)}" text-anchor="middle" class="mc-board-glyph">营</text></g>`);
  }
  for (let i = 0; i < N; i++) {
    if (!isHQ(i)) continue;
    const p = stationLocal(g, i);
    const cw = portrait ? g.colStep * 0.82 : g.rowStep * 0.9;
    const ch = portrait ? g.rowStep * 0.74 : g.colStep * 0.74;
    const col = half(i) === 0 ? '#c4553f' : '#3f6fb5';
    const bg = half(i) === 0 ? '#f2d6cc' : '#d3dff0';
    const roof = portrait
      ? `M${f(p.x - 16)} ${f(p.y - ch / 2 + 1)}L${f(p.x)} ${f(p.y - ch / 2 - 9)}L${f(p.x + 16)} ${f(p.y - ch / 2 + 1)}`
      : `M${f(p.x - cw / 2 + 1)} ${f(p.y - 16)}L${f(p.x - cw / 2 - 9)} ${f(p.y)}L${f(p.x - cw / 2 + 1)} ${f(p.y + 16)}`;
    out.push(`<g class="mc-hq"><rect x="${f(p.x - cw / 2)}" y="${f(p.y - ch / 2 + 1.5)}" width="${f(cw)}" height="${f(ch)}" rx="8" fill="#1c2410" opacity=".22"/>
      <rect x="${f(p.x - cw / 2)}" y="${f(p.y - ch / 2)}" width="${f(cw)}" height="${f(ch)}" rx="8" fill="${bg}" stroke="${col}" stroke-width="3"/>
      <path d="${roof}" fill="${col}" stroke="${col}" stroke-width="2" stroke-linejoin="round"/>
      <text x="${f(p.x)}" y="${f(p.y + 4.5)}" text-anchor="middle" class="mc-board-glyph">本</text></g>`);
  }
  // 7) side seals in landscape (red square seal left, blue round seal right)
  if (!portrait) {
    out.push(`<g class="mc-seal"><rect x="${f(fr / 2 - 7)}" y="${f(H / 2 - 7)}" width="14" height="14" rx="2" fill="#b8342a"/><text x="${f(fr / 2)}" y="${f(H / 2 + 3.5)}" text-anchor="middle" class="mc-seal-t">红</text></g>`);
    out.push(`<g class="mc-seal"><circle cx="${f(W - fr / 2)}" cy="${f(H / 2)}" r="7.5" fill="#2d5ba3"/><text x="${f(W - fr / 2)}" y="${f(H / 2 + 4)}" text-anchor="middle" class="mc-seal-t">蓝</text></g>`);
  }
  out.push('</svg>');
  return out.join('');
}

const cache = new Map<string, string>();
export function cachedBoardSvg(g: BoardGeom): string {
  const key = `${g.o}:${g.rect.w}x${g.rect.h}`;
  let s = cache.get(key);
  if (!s) {
    s = boardSvg(g);
    cache.set(key, s);
  }
  return s;
}
