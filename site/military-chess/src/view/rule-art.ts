/**
 * Rule-card diagrams (spec §2.5 S14): each card shows a crop of the REAL board (same SVG as the
 * match) with real tiles, gold paths and verdict marks — so the picture is exactly what he will see
 * when he plays. Portrait geometry, cropped by viewBox; pure strings, cached per card.
 */
import { parseSq } from '../core/board';
import { cachedBoardSvg } from './board-svg';
import { iconPaths, type McIcon } from './icons';
import { boardGeom, stationLocal, type BoardGeom } from './layout';
import { TILE, tileMarkup, type Face } from './pieces-svg';

let G: BoardGeom | null = null;
const geom = (): BoardGeom => (G ??= boardGeom('portrait', 0));
const P = (s: string) => stationLocal(geom(), parseSq(s));

function tile(at: string, side: 0 | 1, type: number, face: Face = 'up', extra = ''): string {
  const p = P(at);
  const { w, h } = TILE.wide;
  return `<g transform="translate(${p.x - w / 2} ${p.y - h / 2})" ${extra}>${tileMarkup({ side, type, shape: 'wide', face })}</g>`;
}

function path(stations: string[], o: { colour?: string; dash?: boolean; head?: boolean } = {}): string {
  const pts = stations.map(P);
  const d = pts.map((q, i) => `${i ? 'L' : 'M'}${q.x} ${q.y}`).join('');
  const c = o.colour ?? '#f6b934';
  const last = pts[pts.length - 1], prev = pts[pts.length - 2] ?? pts[0];
  const ang = Math.atan2(last.y - prev.y, last.x - prev.x);
  const hx = last.x - Math.cos(ang) * 30, hy = last.y - Math.sin(ang) * 30;
  const head = o.head === false ? '' : `<path d="M${hx + Math.cos(ang + 2.5) * 18} ${hy + Math.sin(ang + 2.5) * 18}L${hx + Math.cos(ang) * 4} ${hy + Math.sin(ang) * 4}L${hx + Math.cos(ang - 2.5) * 18} ${hy + Math.sin(ang - 2.5) * 18}" fill="none" stroke="${c}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>`;
  return `<path d="${d}" fill="none" stroke="#3b2410" stroke-opacity=".35" stroke-width="15" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="${c}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" ${o.dash ? 'stroke-dasharray="16 12"' : ''}/>${head}`;
}

function mark(at: string, kind: 'ok' | 'no', dx = 46, dy = -30): string {
  const p = P(at);
  const x = p.x + dx, y = p.y + dy;
  const fill = kind === 'ok' ? '#1aa892' : '#e4513d';
  const glyph = kind === 'ok' ? `<path d="M${x - 9} ${y}l6 7 12-14" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>` : `<path d="M${x - 8} ${y - 8}l16 16M${x + 8} ${y - 8}l-16 16" stroke="#fff" stroke-width="5" stroke-linecap="round"/>`;
  return `<circle cx="${x}" cy="${y}" r="19" fill="${fill}" stroke="#fff" stroke-width="3"/>${glyph}`;
}

function badgeIcon(at: string, ico: McIcon, colour: string, dx = 0, dy = -48, r = 24): string {
  const p = P(at);
  const x = p.x + dx, y = p.y + dy;
  return `<circle cx="${x}" cy="${y}" r="${r}" fill="${colour}" stroke="#fff" stroke-width="3"/><g transform="translate(${x - r * 0.7} ${y - r * 0.7}) scale(${(r * 1.4) / 32})" color="#fff">${iconPaths(ico)}</g>`;
}

function plate(x: number, y: number, txt: string): string {
  return `<g><rect x="${x - 70}" y="${y - 30}" width="140" height="60" rx="16" fill="#fff8e8" stroke="#8f5d30" stroke-width="3"/><text x="${x}" y="${y + 13}" text-anchor="middle" font-size="36" font-weight="800" fill="#3b2410" font-family="Baloo 2, sans-serif">${txt}</text></g>`;
}

function glow(at: string, r = 40, colour = '#f6b934'): string {
  const p = P(at);
  return `<circle cx="${p.x}" cy="${p.y}" r="${r}" fill="${colour}" fill-opacity=".28" stroke="${colour}" stroke-width="5"/>`;
}

/** crop window in board-local coords around a set of stations */
function crop(a: string, b: string, pad = 70): [number, number, number, number] {
  const p = P(a), q = P(b);
  const x0 = Math.min(p.x, q.x) - pad, y0 = Math.min(p.y, q.y) - pad;
  const x1 = Math.max(p.x, q.x) + pad, y1 = Math.max(p.y, q.y) + pad;
  return [Math.max(0, x0), Math.max(0, y0), Math.min(652, x1) - Math.max(0, x0), Math.min(810, y1) - Math.max(0, y0)];
}

const SCENES: Array<() => { box: [number, number, number, number]; art: string }> = [
  // 1 大吃小: 旅长 (6) takes 连长 (3) across the middle bridge
  () => ({ box: crop('b8', 'd5', 60), art: path(['c6', 'c7']) + tile('c6', 0, 8) + tile('c7', 1, 5) + mark('c7', 'ok', 56, -6) + plate(P('c7').x + 104, P('c7').y + 62, '6 &gt; 3') }),
  // 2 炸弹 / 地雷: bomb + 司令 both go; the engineer digs the mine; a 师长 on a mine goes down
  () => ({ box: crop('a12', 'c10', 60), art: path(['c11', 'c12']) + tile('a11', 0, 2) + tile('a12', 1, 11) + badgeIcon('a12', 'smoke', '#7c8494', 0, 50, 22) + tile('c11', 0, 3) + tile('c12', 1, 1) + mark('c12', 'ok', 54, -4) + tile('b10', 0, 9) + badgeIcon('b10', 'mine', '#4e5544', 54, -2, 18) + mark('b10', 'no', 54, 34) }),
  // 3 公路 / 山界: only the three crossings
  () => ({ box: crop('a8', 'e5', 50), art: glow('a7') + glow('c7') + glow('e7') + path(['a6', 'a7']) + path(['c6', 'c7']) + path(['e6', 'e7']) + path(['b5', 'b6'], { colour: '#fff3d0' }) + mark('b6', 'no', 0, -62) + mark('d6', 'no', 0, -62) + tile('b5', 0, 5) }),
  // 4 行营 / 大本营: nobody can hit a piece in a camp; a piece in the HQ never moves again
  () => ({ box: crop('a4', 'c1', 60), art: path(['a4', 'b3'], { colour: '#e4513d', dash: true }) + tile('b3', 0, 7) + badgeIcon('b3', 'shield', '#1aa892', 56, -24, 20) + tile('a4', 1, 10) + mark('b3', 'no', -54, 26) + tile('b1', 0, 0) + badgeIcon('b1', 'lock', '#8f5d30', 56, -14, 20) }),
  // 5 铁路 / 工兵: straight along the rail; only the engineer turns
  () => ({ box: crop('a7', 'e2', 62), art: path(['a2', 'a3', 'a4', 'a5', 'a6']) + path(['e2', 'e3', 'e4', 'e5', 'e6', 'd6', 'c6'], { colour: '#6fd1ff' }) + tile('a2', 0, 8) + tile('e2', 0, 3) + mark('a6', 'ok', 0, -50) + mark('c6', 'ok', 0, -50) + badgeIcon('e2', 'shovel', '#3f7be6', -56, -24, 18) }),
  // 6 扛旗 / 亮旗: any piece carries the flag; a 司令 down shows its flag
  () => ({ box: crop('a12', 'c10', 60), art: glow('b12', 44) + path(['b11', 'b12']) + tile('b12', 1, 0) + tile('b11', 0, 4) + mark('b12', 'ok', 56, 4) + tile('c10', 1, 11, 'up', 'opacity=".4"') + mark('c10', 'no', 0, -40) + badgeIcon('b12', 'crown', '#f6b934', 0, -46, 18) }),
  // 7 布阵: flag in the HQ, mines in the last two rows, no bomb in the front row
  () => ({
    box: crop('a6', 'e1', 50),
    art: `<rect x="${P('a2').x - 66}" y="${P('a2').y - 34}" width="${P('e2').x - P('a2').x + 132}" height="${P('a1').y - P('a2').y + 68}" rx="14" fill="#5e3a1c" fill-opacity=".16" stroke="#f6b934" stroke-width="4" stroke-dasharray="12 8"/>` +
      glow('b1', 44) + tile('b1', 0, 0) + tile('a1', 0, 1) + tile('c1', 0, 1) + tile('b2', 0, 1) + tile('c6', 0, 2) + mark('c6', 'no', 54, -16) + tile('c5', 0, 2) + mark('c5', 'ok', 54, -16),
  }),
  // 8 翻翻棋: the first flip decides your colour; dig out the mines before the flag
  () => ({ box: crop('a12', 'c10', 60), art: path(['a11', 'a12'], { colour: '#6fd1ff' }) + tile('a10', 0, 4, 'fan') + tile('b10', 0, 7) + badgeIcon('b10', 'flipcard', '#8f5d30', 54, -18, 18) + tile('c10', 0, 4, 'fan') + tile('a12', 1, 1) + tile('c12', 1, 1) + tile('b12', 1, 0) + badgeIcon('b12', 'lock', '#e4513d', 0, 46, 20) + tile('a11', 0, 3) + mark('a12', 'ok', 52, 0) }),
];

const cache = new Map<number, string>();
/** the diagram of rule card n (1–8) as an <svg> no wider than maxW and no taller than maxH */
export function ruleArt(n: number, maxW: number, maxH = 9999): string {
  let inner = cache.get(n);
  const sc = SCENES[n - 1]();
  if (!inner) {
    inner = cachedBoardSvg(geom()).replace(/^<svg[^>]*>/, '<g>').replace(/<\/svg>$/, '</g>') + sc.art;
    cache.set(n, inner);
  }
  const [x, y, bw, bh] = sc.box;
  const w = Math.round(Math.min(maxW, (maxH * bw) / bh));
  const h = Math.round((w * bh) / bw);
  return `<svg class="mc-ruleart" viewBox="${x} ${y} ${bw} ${bh}" width="${w}" height="${h}" aria-hidden="true">${inner}</svg>`;
}
