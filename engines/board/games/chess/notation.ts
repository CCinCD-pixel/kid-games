// engines/board/games/chess/notation.ts — 记谱：'zh' = 给孩子 / 复盘列表看的中文着法；'san' / 'coord' 在 position.ts（san / uci）。
import { applyMove, inCheck, legalMoves, sqName, type ChessMove, type ChessState } from './position';

export const PIECE_ZH: Readonly<Record<string, string>> = { K: '王', Q: '后', R: '车', B: '象', N: '马', P: '兵' };

/** 例：马g1到f3 · 兵d4吃e5 · 兵e5吃过路兵d6 · 兵e7到e8，升变为后 · 王车易位（短）· 后d1到h5，将军 */
export function notationZh(s: ChessState, m: ChessMove): string {
  let out: string;
  if (m.castling) out = m.castling === 'K' ? '王车易位（短）' : '王车易位（长）';
  else {
    out = `${PIECE_ZH[m.piece.type]}${sqName(m.from.r, m.from.c)}${m.captured ? '吃' : '到'}${sqName(m.to.r, m.to.c)}`;
    if (m.enPassant) out = `${PIECE_ZH.P}${sqName(m.from.r, m.from.c)}吃过路兵${sqName(m.to.r, m.to.c)}`;
    if (m.promotion) out += `，升变为${PIECE_ZH[m.promotion]}`;
  }
  const ns = applyMove(s, m);
  if (inCheck(ns.board, ns.turn)) out += legalMoves(ns).length ? '，将军' : '，将死';
  return out;
}
