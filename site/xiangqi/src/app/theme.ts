// site/xiangqi/src/app/theme.ts — 楚河棋院的 Theme：深靛漆面棋盘 + 金线 + 朱砂印章；棋子 = 车削木玩具（红：浅木；黑：乌木），字体就绪后烘焙位图（spec §6）。
import type { Geometry, Orientation, Piece, Theme } from '@engines/board/core/types';
import { createToySprites, type ToySpec } from '@engines/board/art/bake';

const NS = 'http://www.w3.org/2000/svg';
const el = <K extends keyof SVGElementTagNameMap>(tag: K, a: Record<string, string | number> = {}, kids: Element[] = []): SVGElementTagNameMap[K] => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(a)) e.setAttribute(k, String(v)); for (const c of kids) e.appendChild(c); return e; };
const stop = (o: number, c: string, op = 1): SVGStopElement => el('stop', { offset: o, 'stop-color': c, 'stop-opacity': op });
const lin = (id: string, x1: number, y1: number, x2: number, y2: number, stops: SVGStopElement[]): SVGLinearGradientElement => el('linearGradient', { id, x1, y1, x2, y2 }, stops);

export const XQ_PALETTE = { table: '#0c1230', frame: '#131b42', frame2: '#26346e', faceHi: '#4658a8', faceLo: '#3a4b96', line: '#e7c98a', gold: '#df9a1c', goldHi: '#fdd877' };
const MOTION: Theme['motion'] = { moveMs: (d) => Math.min(240, 150 + 24 * d), liftPx: 6, squash: [1.07, 0.93, 140], captureMs: 260, landMs: 120, maxMs: 240 };
const RED = { hi: '#f4d9a8', lo: '#e3b979', rim: '#a8703e', side: '#8a5530', ink: '#7d160f' };
const EBONY = { hi: '#231a3a', lo: '#100b20', rim: '#9fb0ee', side: '#0a0716', ink: '#fdd877' };
export const GLYPH: Record<number, [string, string]> = { 1: ['帅', '将'], 2: ['仕', '士'], 3: ['相', '象'], 4: ['马', '马'], 5: ['车', '车'], 6: ['炮', '炮'], 7: ['兵', '卒'] };
export const PIECE_NAME: Record<number, [string, string]> = { 1: ['红帅', '黑将'], 2: ['红仕', '黑士'], 3: ['红相', '黑象'], 4: ['红马', '黑马'], 5: ['红车', '黑车'], 6: ['红炮', '黑炮'], 7: ['红兵', '黑卒'] };
const FONT = { family: '"XG WenKai","LXGW WenKai GB","Kaiti SC",serif', weight: 600 };

function boardArt(g: Geometry, _o: Orientation): SVGSVGElement {
  const W = g.viewBox.w, H = g.viewBox.h, u = g.unit, m = g.margin * u; const x = (c: number): number => m + c * u, y = (r: number): number => m + r * u; const P = XQ_PALETTE;
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'xMidYMid meet' });
  const moon = el('radialGradient', { id: 'xq-moon', cx: 0.22, cy: 0.1, r: 0.95 }, [stop(0, '#ffffff', 0.17), stop(0.55, '#ffffff', 0)]);
  const sheen = el('pattern', { id: 'xq-sheen', width: 22, height: 22, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(32)' }, [el('rect', { width: 22, height: 22, fill: 'none' }), el('rect', { width: 1.2, height: 22, fill: '#ffffff', opacity: 0.035 })]);
  svg.appendChild(el('defs', {}, [lin('xq-frame', 0, 0, 1, 1, [stop(0, P.frame2), stop(1, P.frame)]), lin('xq-face', 0, 0, 1, 1, [stop(0, P.faceHi), stop(1, P.faceLo)]), lin('xq-gold', 0, 0, 1, 1, [stop(0, P.goldHi), stop(1, P.gold)]), moon, sheen,
    lin('xq-river', 0, 0, 0, 1, [stop(0, '#7f93e0', 0.04), stop(0.5, '#a9b8f2', 0.17), stop(1, '#7f93e0', 0.04)]), el('radialGradient', { id: 'xq-rivet', cx: 0.35, cy: 0.3, r: 0.8 }, [stop(0, '#fff3c9'), stop(0.5, P.goldHi), stop(1, '#a86a00')])]));
  svg.appendChild(el('rect', { x: 0, y: 0, width: W, height: H, rx: 30, fill: 'url(#xq-frame)' }));
  svg.appendChild(el('rect', { x: 6, y: 6, width: W - 12, height: H - 12, rx: 25, fill: 'none', stroke: 'url(#xq-gold)', 'stroke-width': 3, opacity: 0.92 }));
  svg.appendChild(el('rect', { x: 14, y: 14, width: W - 28, height: H - 28, rx: 19, fill: 'none', stroke: '#0a0f2c', 'stroke-width': 1.4, opacity: 0.6 }));
  for (const [cx, cy] of [[26, 26], [W - 26, 26], [26, H - 26], [W - 26, H - 26]]) { svg.appendChild(el('circle', { cx, cy: cy + 1.2, r: 7.5, fill: '#000', opacity: 0.35 })); svg.appendChild(el('circle', { cx, cy, r: 7, fill: 'url(#xq-rivet)' })); }
  svg.appendChild(el('rect', { x: 34, y: 34, width: W - 68, height: H - 68, rx: 10, fill: 'url(#xq-face)' }));
  svg.appendChild(el('rect', { x: 34, y: 34, width: W - 68, height: H - 68, rx: 10, fill: 'url(#xq-sheen)' }));
  svg.appendChild(el('rect', { x: 34, y: 34, width: W - 68, height: H - 68, rx: 10, fill: 'url(#xq-moon)' }));
  svg.appendChild(el('rect', { x: x(0), y: y(4), width: 8 * u, height: u, fill: 'url(#xq-river)' }));
  for (const k of [0, 1]) { let d = `M ${x(0)} ${y(4) + u * (0.32 + 0.34 * k)}`; for (let i = 0; i < 16; i++) d += ` q ${u * 0.25} ${i % 2 ? u * 0.07 : -u * 0.07} ${u * 0.5} 0`; svg.appendChild(el('path', { d, fill: 'none', stroke: 'rgba(183,193,236,.32)', 'stroke-width': 1.6, 'stroke-linecap': 'round' })); }
  const lines: string[] = [];
  for (let r = 0; r < 10; r++) lines.push(`M${x(0)} ${y(r)}H${x(8)}`);
  for (let c = 0; c < 9; c++) { if (c === 0 || c === 8) lines.push(`M${x(c)} ${y(0)}V${y(9)}`); else lines.push(`M${x(c)} ${y(0)}V${y(4)}M${x(c)} ${y(5)}V${y(9)}`); }
  for (const [r0, r1] of [[0, 2], [7, 9]]) lines.push(`M${x(3)} ${y(r0)}L${x(5)} ${y(r1)}M${x(5)} ${y(r0)}L${x(3)} ${y(r1)}`);
  const cross = (r: number, c: number): void => { const a = u * 0.08, b = u * 0.2; for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { if ((c === 0 && sx < 0) || (c === 8 && sx > 0)) continue; lines.push(`M${x(c) + sx * a} ${y(r) + sy * b}V${y(r) + sy * a}H${x(c) + sx * b}`); } };
  for (const r of [3, 6]) for (const c of [0, 2, 4, 6, 8]) cross(r, c); for (const r of [2, 7]) for (const c of [1, 7]) cross(r, c);
  svg.appendChild(el('path', { d: lines.join(''), fill: 'none', stroke: P.line, 'stroke-width': 2.2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
  svg.appendChild(el('rect', { x: x(0), y: y(0), width: 8 * u, height: 9 * u, fill: 'none', stroke: P.line, 'stroke-width': 3.6 }));
  for (const [t, cx] of [['楚河', x(2)], ['汉界', x(6)]] as const) { const tx = el('text', { x: cx, y: y(4) + u * 0.5, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': u * 0.46, fill: 'url(#xq-gold)', 'letter-spacing': u * 0.5, opacity: 0.95, style: 'font-family: var(--xg-font-title, "XG KuaiLe", serif)' }); tx.textContent = t; svg.appendChild(tx); }
  return svg;
}

export function createXqTheme(): Theme {
  const variants: Piece[] = []; for (let t = 1; t <= 7; t++) for (const side of [0, 1] as const) variants.push({ type: t, side });
  const sprites = createToySprites({
    variants, label: (p) => PIECE_NAME[p.type]?.[p.side] ?? '棋子',
    fonts: [{ font: `${FONT.weight} 40px ${FONT.family}`, text: '帅仕相马车炮兵将士象卒' }],
    describe: (p, px): ToySpec => { const red = p.side === 0; const c = red ? RED : EBONY; const ring = px >= 44;
      return { hi: c.hi, lo: c.lo, rim: red ? RED.rim : EBONY.rim, side: c.side, ink: c.ink, glyph: GLYPH[p.type]?.[p.side] ?? '?', ...FONT, ring, grain: red ? 'wood' : 'lacquer', edge: red ? undefined : '#6f7fcf', halo: red ? undefined : 'rgba(159,176,238,.25)', seed: 7 + p.type * 3 + p.side }; },
  });
  return { id: 'xiangqi', pieces: sprites, motion: MOTION, boardArt,
    tokens: { '--bk-piece-scale': '1', '--bk-legal': 'rgba(253,216,119,.92)', '--bk-legal-edge': 'rgba(12,18,48,.5)', '--bk-capture': '#f39a85', '--bk-capture-fill': 'rgba(243,154,133,.18)', '--bk-select': '#fdd877', '--bk-select-fill': 'rgba(253,216,119,.22)', '--bk-last': 'rgba(123,216,198,.32)', '--bk-checker': '#ff9a4a', '--bk-hint': '#fdd877', '--bk-sight': '#fdd877', '--bk-focus': '#fdd877', '--bk-stamp-bg': '#c93a2c', '--bk-stamp-ink': '#fff3d6' } };
}
