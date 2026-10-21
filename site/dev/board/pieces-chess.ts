// site/dev/board/pieces-chess.ts — 游乐场用的 Staunton 剪影（几何来自 chess-tools-r/pieces.mjs，自有作品）。每种 × 每色一个 <symbol>，颜色写死在符号里
// （<stop> 里的 var() 不会继承 <use> 实例的自定义属性，WebKit 上会变黑）。真正的国象棋子在 games/chess/pieces.ts。
import type { Piece, PieceNode, PieceSprites } from '@engines/board/core/types';

type Prim = { k: 'rect'; x: number; y: number; w: number; h: number; rx?: number } | { k: 'ellipse'; cx: number; cy: number; rx: number; ry: number } | { k: 'circle'; cx: number; cy: number; r: number } | { k: 'path'; d: string };
type Det = { k: 'line'; x1: number; y1: number; x2: number; y2: number; w: number } | { k: 'dot'; cx: number; cy: number; r: number } | { k: 'dpath'; d: string; w: number };
const base: Prim[] = [{ k: 'rect', x: 19, y: 83, w: 62, h: 9, rx: 3.5 }, { k: 'ellipse', cx: 50, cy: 82, rx: 27, ry: 5 }, { k: 'rect', x: 24, y: 75, w: 52, h: 8, rx: 3 }];
const L = (x1: number, y1: number, x2: number, y2: number, w: number): Det => ({ k: 'line', x1, y1, x2, y2, w });
const PIECES: Record<string, { fill: Prim[]; detail: Det[] }> = {
  P: { fill: [...base, { k: 'path', d: 'M36 76 C39 66 43 59 44 52 L56 52 C57 59 61 66 64 76 Z' }, { k: 'ellipse', cx: 50, cy: 51, rx: 14.5, ry: 4.5 }, { k: 'circle', cx: 50, cy: 36, r: 12.5 }], detail: [L(27, 83, 73, 83, 1.6), L(38, 51, 62, 51, 1.4)] },
  R: { fill: [...base, { k: 'path', d: 'M32 76 L35 53 L65 53 L68 76 Z' }, { k: 'rect', x: 30, y: 47, w: 40, h: 7, rx: 2 }, { k: 'path', d: 'M30 48 L31 24 L39 24 L39 30 L46 30 L46 24 L54 24 L54 30 L61 30 L61 24 L69 24 L70 48 Z' }], detail: [L(27, 83, 73, 83, 1.6), L(32, 54, 68, 54, 1.4), L(31, 39, 69, 39, 1.4)] },
  B: { fill: [...base, { k: 'path', d: 'M37 76 C40 67 44 60 45 55 L55 55 C56 60 60 67 63 76 Z' }, { k: 'ellipse', cx: 50, cy: 54, rx: 15, ry: 4.5 }, { k: 'path', d: 'M50 17 C61 25 65 35 63 43 C61 49 56 51 50 51 C44 51 39 49 37 43 C35 35 39 25 50 17 Z' }, { k: 'circle', cx: 50, cy: 14, r: 4.5 }], detail: [L(27, 83, 73, 83, 1.6), L(37, 54, 63, 54, 1.4), L(56, 27, 47, 40, 2.8)] },
  Q: { fill: [...base, { k: 'path', d: 'M35 76 C38 66 42 57 43 50 L57 50 C58 57 62 66 65 76 Z' }, { k: 'ellipse', cx: 50, cy: 49, rx: 16.5, ry: 4.5 }, { k: 'path', d: 'M34 46 L26 21 L38 33 L41 16 L50 30 L59 16 L62 33 L74 21 L66 46 Z' }, { k: 'circle', cx: 26, cy: 20, r: 4 }, { k: 'circle', cx: 41, cy: 15, r: 4 }, { k: 'circle', cx: 59, cy: 15, r: 4 }, { k: 'circle', cx: 74, cy: 20, r: 4 }, { k: 'ellipse', cx: 50, cy: 45, rx: 17.5, ry: 4 }], detail: [L(27, 83, 73, 83, 1.6), L(35, 49, 65, 49, 1.4), L(34, 41, 66, 41, 1.4)] },
  K: { fill: [...base, { k: 'path', d: 'M35 76 C38 66 42 57 43 50 L57 50 C58 57 62 66 65 76 Z' }, { k: 'ellipse', cx: 50, cy: 49, rx: 16.5, ry: 4.5 }, { k: 'path', d: 'M33 46 C30 36 34 27 43 26 L57 26 C66 27 70 36 67 46 Z' }, { k: 'ellipse', cx: 50, cy: 45, rx: 17.5, ry: 4 }, { k: 'rect', x: 47, y: 6, w: 6, h: 21, rx: 1.2 }, { k: 'rect', x: 41.5, y: 11, w: 17, h: 6, rx: 1.2 }], detail: [L(27, 83, 73, 83, 1.6), L(35, 49, 65, 49, 1.4), L(34, 41, 66, 41, 1.4), L(50, 28, 50, 41, 1.2)] },
  N: { fill: [...base, { k: 'path', d: 'M29 76 C29 66 34 60 41 55 C35 56 28 57 23 53 C18 49 20 43 26 39 L38 28 C40 21 44 16 51 14 L53 8 L58 15 C69 19 76 31 76 46 C76 59 72 68 71 76 Z' }], detail: [L(27, 83, 73, 83, 1.6), { k: 'dot', cx: 43, cy: 29, r: 2.6 }, { k: 'dot', cx: 25.5, cy: 46.5, r: 1.6 }, { k: 'dpath', d: 'M60 20 C66 26 69 33 70 41', w: 1.6 }, { k: 'dpath', d: 'M64 46 C66 54 66 62 64 70', w: 1.6 }, { k: 'dpath', d: 'M41 55 C46 52 50 47 52 42', w: 1.4 }] },
  X: { fill: [{ k: 'path', d: 'M20 78 C14 66 18 52 28 44 C30 32 42 22 56 24 C70 24 82 34 82 48 C90 58 86 74 74 80 C60 88 36 88 20 78 Z' }], detail: [{ k: 'dpath', d: 'M34 54 C40 50 46 52 48 58', w: 2 }, { k: 'dpath', d: 'M58 44 C64 42 70 46 70 52', w: 2 }, { k: 'dot', cx: 44, cy: 70, r: 3 }, { k: 'dot', cx: 66, cy: 66, r: 2.2 }] },
};
const SCALE: Record<string, number> = { K: 1, Q: 0.98, R: 0.93, B: 0.95, N: 0.95, P: 0.86, X: 0.9 };
const COLORS = { w: { fill: '#f6ead0', hi: '#ffffff', shade: '#d4b983', line: '#2a1f33', detail: '#6b5a73' }, b: { fill: '#2b2144', hi: '#6a79da', shade: '#100b20', line: '#a9b8f2', detail: '#fdd877' } } as const;
const LET: Record<number, string> = { 1: 'K', 2: 'Q', 3: 'R', 4: 'B', 5: 'N', 6: 'P', 99: 'X' };
const NAMES: Record<string, string> = { K: '王', Q: '后', R: '车', B: '象', N: '马', P: '兵', X: '陨石' };
const prim = (p: Prim): string => (p.k === 'circle' ? `<circle cx="${p.cx}" cy="${p.cy}" r="${p.r}"/>` : p.k === 'ellipse' ? `<ellipse cx="${p.cx}" cy="${p.cy}" rx="${p.rx}" ry="${p.ry}"/>` : p.k === 'rect' ? `<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="${p.rx ?? 0}"/>` : `<path d="${p.d}"/>`);
const det = (p: Det, c: string): string => (p.k === 'line' ? `<line x1="${p.x1}" y1="${p.y1}" x2="${p.x2}" y2="${p.y2}" stroke-width="${p.w}"/>` : p.k === 'dpath' ? `<path d="${p.d}" stroke-width="${p.w}" fill="none"/>` : `<circle cx="${p.cx}" cy="${p.cy}" r="${p.r}" stroke="none" fill="${c}"/>`);

function sheet(): string {
  let defs = '';
  for (const side of ['w', 'b'] as const) { const C = COLORS[side];
    defs += `<linearGradient id="pc-sheen-${side}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${C.hi}" stop-opacity=".55"/><stop offset=".38" stop-color="${C.hi}" stop-opacity="0"/><stop offset=".62" stop-color="${C.shade}" stop-opacity="0"/><stop offset="1" stop-color="${C.shade}" stop-opacity=".75"/></linearGradient>`;
    for (const [t, P] of Object.entries(PIECES)) { const body = P.fill.map(prim).join(''); const k = SCALE[t];
      defs += `<symbol id="pc-${t}-${side}" viewBox="0 0 100 100"><g transform="translate(${50 - 50 * k} ${92 - 92 * k}) scale(${k})"><clipPath id="pc-clip-${t}-${side}">${body}</clipPath>` +
        `<g fill="${C.line}" stroke="${C.line}" stroke-width="5.5" stroke-linejoin="round">${body}</g><g fill="${C.fill}">${body}</g>` +
        `<g clip-path="url(#pc-clip-${t}-${side})"><rect x="0" y="0" width="100" height="100" fill="url(#pc-sheen-${side})"/></g>` +
        `<g stroke="${C.detail}" stroke-linecap="round" fill="none">${P.detail.map((d) => det(d, C.detail)).join('')}</g></g></symbol>`; } }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute" aria-hidden="true"><defs>${defs}</defs></svg>`;
}
let injected = false;
export function chessSprites(): PieceSprites {
  return {
    async prepare() { if (injected && document.getElementById('bd-chess-sheet')) return; const d = document.createElement('div'); d.id = 'bd-chess-sheet'; d.innerHTML = sheet(); document.body.appendChild(d); injected = true; },
    make(p: Piece): PieceNode {
      const NS = 'http://www.w3.org/2000/svg'; const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', '0 0 100 100'); const use = document.createElementNS(NS, 'use'); svg.appendChild(use);
      const set = (q: Piece): void => { use.setAttribute('href', `#pc-${LET[q.type] ?? 'X'}-${q.side === 0 ? 'w' : 'b'}`); };
      set(p); return { el: svg as unknown as HTMLElement, setPiece: set, dispose() { svg.remove(); } };
    },
    label: (p) => `${p.type === 99 ? '' : p.side === 0 ? '白' : '黑'}${NAMES[LET[p.type] ?? 'X']}`,
  };
}
