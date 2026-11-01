// engines/board/games/chess/reasons.ts — 国象的"为什么不行"（whyIllegal 键）与终局原因的中文文案；接引擎的 createReasonText(overrides)。
// 文案与旁白 `ch.w.*` / `ch.g.*` 字幕一致（content/chess/narration.yaml，测试核对）；引擎状态里永远是原串，显示处才翻译。
import { createReasonText } from '../../play/reasons';
import type { WhyKey } from './position';

/** 旁白别名（chess.md §3.3）：noPiece → turn；shapeP / pawnBack → pawnFwd（旁白只有一句"兵只往前走"） */
export const WHY_NARRATION: Readonly<Record<WhyKey, string>> = {
  noPiece: 'turn', turn: 'turn', own: 'own', block: 'block', shapeR: 'shapeR', shapeB: 'shapeB', shapeN: 'shapeN', shapeQ: 'shapeQ', shapeK: 'shapeK', shapeP: 'pawnFwd',
  bishopColor: 'bishopColor', pawnBack: 'pawnFwd', pawnStraight: 'pawnStraight', pawnDouble: 'pawnDouble', pawnDiag: 'pawnDiag', kingDanger: 'kingDanger', kingsTouch: 'kingsTouch',
  pinned: 'pinned', stillCheck: 'stillCheck', castleMoved: 'castleMoved', castleBetween: 'castleBetween', castleCheck: 'castleCheck', castleThrough: 'castleThrough',
};

export const CHESS_REASON_ZH: Readonly<Record<string, string>> = {
  // whyIllegal（23 个键；与旁白字幕同文）
  noPiece: '现在不能动这个子。', turn: '现在不能动这个子。', own: '那里是你自己的子。', block: '路被挡住了。',
  shapeR: '车只走直线。', shapeB: '象只走斜线。', shapeN: '马走日字。', shapeQ: '后走直线或斜线。', shapeK: '王一次只走一格。', shapeP: '兵只往前走。', bishopColor: '象只走一种颜色。',
  pawnBack: '兵只往前走。', pawnStraight: '兵不能直着吃。', pawnDouble: '兵只有第一步能走两格。', pawnDiag: '兵斜着走，只能去吃子。',
  kingDanger: '王不能走进危险的格。', kingsTouch: '两个王不能挨着。', pinned: '它一走，王就被吃了。', stillCheck: '王还在被将军。',
  castleMoved: '王或车动过了，不能易位。', castleBetween: '中间还有子。', castleCheck: '被将军时，不能易位。', castleThrough: '王不能路过危险的格。',
  // Outcome.reason（Game.status：局面 → 重复 → 限着）；与终局说明卡键 g.mate / stale / insuff / rep / fifty 一一对应
  checkmate: '将死', stalemate: '逼和了，算和棋。', insufficient: '子不够了，算和棋。', repetition: '同样的局面三次，和棋。', 'fifty-move': '五十回合没吃子，和棋。',
  resign: '认输', 'resign-robot': '它认输了，这盘算你赢。', tired: '它累了，这盘算你赢。',
};
/** Outcome.reason → 终局说明卡键（旁白 `ch.g.<键>`） */
export const OUTCOME_CARD: Readonly<Record<string, string>> = { checkmate: 'mate', stalemate: 'stale', insufficient: 'insuff', repetition: 'rep', 'fifty-move': 'fifty' };

export const chessReasonText = createReasonText(CHESS_REASON_ZH);
