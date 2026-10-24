import type { CPiece, PType } from '@engines/board/games/chess/position';

const base = '<path d="M20 82h60v10H20zM25 74h50v9H25z"/>';
const shapes: Record<PType, string> = {
  P: '<path d="M35 75q8-16 10-26h10q2 10 10 26z"/><circle cx="50" cy="36" r="13"/>',
  R: '<path d="M30 75l5-25h30l5 25zM30 49V23h9v8h8v-8h7v8h8v-8h9v26z"/>',
  B: '<path d="M36 75q8-17 9-24h10q1 7 9 24zM50 17q16 12 14 27-1 8-14 8t-14-8q-2-15 14-27z"/><circle cx="50" cy="14" r="5"/>',
  Q: '<path d="M35 75q8-18 8-26h14q0 8 8 26zM33 46 25 22l14 11 3-17 8 15 8-15 3 17 14-11-8 24z"/><circle cx="25" cy="21" r="4"/><circle cx="42" cy="15" r="4"/><circle cx="58" cy="15" r="4"/><circle cx="75" cy="21" r="4"/>',
  K: '<path d="M35 75q8-18 8-26h14q0 8 8 26zM33 46q-5-20 10-22h14q15 2 10 22zM47 6h6v22h-6zM41 12h18v6H41z"/>',
  N: '<path d="M28 75q0-13 12-21-12 4-18-3-6-8 4-15l14-10q2-10 12-14l6 4q20 9 19 30-1 16-6 29z"/><circle cx="44" cy="30" r="3" fill="var(--cx-eye)"/>',
  X: '<path d="M20 65 35 30h30l15 35-15 15H35z"/>',
};
const names: Record<PType, string> = { K: '王', Q: '后', R: '车', B: '象', N: '马', P: '兵', X: '石头' };
export const pieceName = (p: CPiece) => `${p.color === 'w' ? '白' : '黑'}${names[p.type]}`;
export const pieceSvg = (p: CPiece): string => `<svg class="cx-piece cx-piece--${p.color}" viewBox="0 0 100 100" aria-hidden="true"><g stroke="var(--cx-edge)" stroke-width="4" stroke-linejoin="round" fill="var(--cx-fill)">${base}${shapes[p.type]}</g></svg>`;
