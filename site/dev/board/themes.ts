// site/dev/board/themes.ts — 游乐场的两套 Theme（星港夜色：深靛漆面 + 金线）。象棋 = 车削木玩具位图（engines/board/art）；国象 = 漆器 Staunton 剪影。
// 这里只是引擎的演示主题：真正的 games/xiangqi/theme.ts 与 games/chess/theme.ts 由游戏任务编写。
import type { Geometry, Orientation, Piece, Theme } from '@engines/board/core/types';
import { createToySprites, type ToySpec } from '@engines/board/art/bake';
import { chessSprites } from './pieces-chess';

const NS = 'http://www.w3.org/2000/svg';
const el = <K extends keyof SVGElementTagNameMap>(tag: K, a: Record<string, string | number> = {}, kids: Element[] = []): SVGElementTagNameMap[K] => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(a)) e.setAttribute(k, String(v)); for (const c of kids) e.appendChild(c); return e; };
const stop = (o: number, c: string, op = 1): SVGStopElement => el('stop', { offset: o, 'stop-color': c, 'stop-opacity': op });
const lin = (id: string, x1: number, y1: number, x2: number, y2: number, stops: SVGStopElement[]): SVGLinearGradientElement => el('linearGradient', { id, x1, y1, x2, y2 }, stops);
const MOTION: Theme['motion'] = { moveMs: (d) => 150 + 24 * d, liftPx: 20, squash: [1.07, 0.93, 150], captureMs: 260, landMs: 120, maxMs: 240 };

/* ───────────────────────── 象棋 ───────────────────────── */
const XQ_RED = { id: 'x', hi: '#f4d9a8', lo: '#e3b979', rim: '#a8703e', side: '#8a5530', ink: '#7d160f' };
const XQ_EBONY = { hi: '#231a3a', lo: '#100b20', rim: '#9fb0ee', side: '#0a0716', ink: '#fdd877' };
const XQ_GLYPH: Record<number, [string, string]> = { 1: ['帅', '将'], 2: ['仕', '士'], 3: ['相', '象'], 4: ['马', '马'], 5: ['车', '车'], 6: ['炮', '炮'], 7: ['兵', '卒'] };
const XQ_NAME: Record<number, [string, string]> = { 1: ['红帅', '黑将'], 2: ['红仕', '黑士'], 3: ['红相', '黑象'], 4: ['红马', '黑马'], 5: ['红车', '黑车'], 6: ['红炮', '黑炮'], 7: ['红兵', '黑卒'] };
const XQ_FONT = { family: '"XG WenKai","LXGW WenKai GB","Kaiti SC",serif', weight: 600 };

function xqArt(g: Geometry, o: Orientation): SVGSVGElement {
  const W = g.viewBox.w, H = g.viewBox.h, u = g.unit, m = g.margin * u; const x = (c: number): number => m + c * u, y = (r: number): number => m + r * u;
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'xMidYMid meet' });
  const rg = el('radialGradient', { id: 'xq-moon', cx: 0.22, cy: 0.12, r: 0.9 }, [stop(0, '#ffffff', 0.16), stop(0.55, '#ffffff', 0)]);
  svg.appendChild(el('defs', {}, [lin('xq-frame', 0, 0, 1, 1, [stop(0, '#2f3f84'), stop(1, '#131b42')]), lin('xq-face', 0, 0, 1, 1, [stop(0, '#4658a8'), stop(1, '#3a4b96')]), lin('xq-gold', 0, 0, 1, 1, [stop(0, '#fdd877'), stop(1, '#df9a1c')]), rg,
    lin('xq-river', 0, 0, 0, 1, [stop(0, '#7f93e0', 0.05), stop(0.5, '#a9b8f2', 0.16), stop(1, '#7f93e0', 0.05)])]));
  svg.appendChild(el('rect', { x: 0, y: 0, width: W, height: H, rx: 30, fill: 'url(#xq-frame)' }));
  svg.appendChild(el('rect', { x: 6, y: 6, width: W - 12, height: H - 12, rx: 25, fill: 'none', stroke: 'url(#xq-gold)', 'stroke-width': 3, opacity: 0.9 }));
  svg.appendChild(el('rect', { x: 22, y: 22, width: W - 44, height: H - 44, rx: 12, fill: 'url(#xq-face)' }));
  svg.appendChild(el('rect', { x: 22, y: 22, width: W - 44, height: H - 44, rx: 12, fill: 'url(#xq-moon)' }));
  svg.appendChild(el('rect', { x: x(0), y: y(4), width: 8 * u, height: u, fill: 'url(#xq-river)' }));
  for (const k of [0, 1]) { let d = `M ${x(0)} ${y(4) + u * (0.35 + 0.3 * k)}`; for (let i = 0; i < 16; i++) d += ` q ${u * 0.25} ${i % 2 ? u * 0.07 : -u * 0.07} ${u * 0.5} 0`; svg.appendChild(el('path', { d, fill: 'none', stroke: 'rgba(183,193,236,.34)', 'stroke-width': 1.6, 'stroke-linecap': 'round' })); }
  const ink = '#e7c98a'; const lines: string[] = [];
  for (let r = 0; r < 10; r++) lines.push(`M${x(0)} ${y(r)}H${x(8)}`);
  for (let c = 0; c < 9; c++) { if (c === 0 || c === 8) lines.push(`M${x(c)} ${y(0)}V${y(9)}`); else lines.push(`M${x(c)} ${y(0)}V${y(4)}M${x(c)} ${y(5)}V${y(9)}`); }
  for (const [r0, r1] of [[0, 2], [7, 9]]) { lines.push(`M${x(3)} ${y(r0)}L${x(5)} ${y(r1)}M${x(5)} ${y(r0)}L${x(3)} ${y(r1)}`); }
  const cross = (r: number, c: number): void => { const a = u * 0.08, b = u * 0.2; for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { if ((c === 0 && sx < 0) || (c === 8 && sx > 0)) continue; lines.push(`M${x(c) + sx * a} ${y(r) + sy * b}V${y(r) + sy * a}H${x(c) + sx * b}`); } };
  for (const r of [3, 6]) for (const c of [0, 2, 4, 6, 8]) cross(r, c); for (const r of [2, 7]) for (const c of [1, 7]) cross(r, c);
  svg.appendChild(el('path', { d: lines.join(''), fill: 'none', stroke: ink, 'stroke-width': 2.2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
  svg.appendChild(el('rect', { x: x(0), y: y(0), width: 8 * u, height: 9 * u, fill: 'none', stroke: ink, 'stroke-width': 3.6 }));
  for (const [t, cx] of [['楚河', x(2)], ['汉界', x(6)]] as const) { const tx = el('text', { x: cx, y: y(4) + u * 0.5, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': u * 0.46, 'font-family': '"XG KuaiLe","ZCOOL KuaiLe","XG WenKai",serif', fill: 'url(#xq-gold)', 'letter-spacing': u * 0.5, opacity: 0.95 }); tx.textContent = t; svg.appendChild(tx); }
  void o; return svg;
}
export function xqTheme(): Theme {
  const variants: Piece[] = []; for (let t = 1; t <= 7; t++) for (const side of [0, 1] as const) variants.push({ type: t, side });
  const sprites = createToySprites({
    variants, label: (p) => XQ_NAME[p.type]?.[p.side] ?? '棋子',
    fonts: [{ font: `600 40px ${XQ_FONT.family}`, text: '帅仕相马车炮兵将士象卒' }],
    describe: (p, px): ToySpec => { const red = p.side === 0; const c = red ? XQ_RED : XQ_EBONY; const ring = px >= 44;
      return { hi: c.hi, lo: c.lo, rim: red ? XQ_RED.rim : XQ_EBONY.rim, side: c.side, ink: c.ink, glyph: XQ_GLYPH[p.type]?.[p.side] ?? '?', ...XQ_FONT, ring, grain: red ? 'wood' : 'lacquer', edge: red ? undefined : '#6f7fcf', halo: red ? undefined : 'rgba(159,176,238,.25)', seed: 7 + p.type * 3 + p.side }; },
  });
  return { id: 'xq-demo', pieces: sprites, motion: MOTION, boardArt: xqArt,
    tokens: { '--bk-piece-scale': '1', '--bk-legal': 'rgba(253,216,119,.92)', '--bk-legal-edge': 'rgba(12,18,48,.5)', '--bk-capture': '#f39a85', '--bk-capture-fill': 'rgba(243,154,133,.18)', '--bk-select': '#fdd877', '--bk-select-fill': 'rgba(253,216,119,.22)', '--bk-last': 'rgba(123,216,198,.32)', '--bk-checker': '#ff9a4a', '--bk-hint': '#fdd877', '--bk-sight': '#fdd877', '--bk-focus': '#fdd877', '--bk-stamp-bg': '#c93a2c', '--bk-stamp-ink': '#fff3d6' } };
}

/* ───────────────────────── 国际象棋 ───────────────────────── */
function chessArt(g: Geometry, o: Orientation): SVGSVGElement {
  const W = g.viewBox.w, H = g.viewBox.h, u = g.unit, m = g.margin * u; const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'xMidYMid meet' });
  svg.appendChild(el('defs', {}, [lin('cx-frame', 0, 0, 1, 1, [stop(0, '#2f3f84'), stop(1, '#131b42')]), lin('cx-gold', 0, 0, 1, 1, [stop(0, '#fdd877'), stop(1, '#df9a1c')]),
    lin('cx-light', 0, 0, 1, 1, [stop(0, '#f6ead0'), stop(1, '#e6d3a8')]), lin('cx-dark', 0, 0, 1, 1, [stop(0, '#5568b5'), stop(1, '#43559f')]), el('radialGradient', { id: 'cx-moon', cx: 0.2, cy: 0.1, r: 0.95 }, [stop(0, '#ffffff', 0.18), stop(0.6, '#ffffff', 0)])]));
  svg.appendChild(el('rect', { x: 0, y: 0, width: W, height: H, rx: 28, fill: 'url(#cx-frame)' }));
  svg.appendChild(el('rect', { x: 10, y: 10, width: W - 20, height: H - 20, rx: 20, fill: 'none', stroke: 'url(#cx-gold)', 'stroke-width': 3, opacity: 0.9 }));
  for (const [cx, cy] of [[26, 26], [W - 26, 26], [26, H - 26], [W - 26, H - 26]]) svg.appendChild(el('circle', { cx, cy, r: 4.5, fill: 'url(#cx-gold)' }));
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) svg.appendChild(el('rect', { x: m + c * u, y: m + r * u, width: u, height: u, fill: (r + c) % 2 === 0 ? 'url(#cx-light)' : 'url(#cx-dark)' }));
  svg.appendChild(el('rect', { x: m, y: m, width: 8 * u, height: 8 * u, fill: 'url(#cx-moon)' }));
  svg.appendChild(el('rect', { x: m, y: m, width: 8 * u, height: 8 * u, fill: 'none', stroke: 'url(#cx-gold)', 'stroke-width': 3 }));
  void o; return svg;
}
export function chessTheme(): Theme {
  return { id: 'chess-demo', pieces: chessSprites(), motion: { ...MOTION, liftPx: 22 }, boardArt: chessArt,
    tokens: { '--bk-piece-scale': '1', '--bk-legal': 'rgba(253,216,119,.95)', '--bk-legal-edge': 'rgba(12,18,48,.55)', '--bk-capture': '#ff8a70', '--bk-capture-fill': 'rgba(255,138,112,.2)', '--bk-select': '#fdd877', '--bk-select-fill': 'rgba(253,216,119,.3)', '--bk-last': 'rgba(123,216,198,.34)', '--bk-coord': 'rgba(226,231,251,.72)', '--bk-stamp-bg': '#c93a2c', '--bk-stamp-ink': '#fff3d6', '--bk-focus': '#fdd877' } };
}
