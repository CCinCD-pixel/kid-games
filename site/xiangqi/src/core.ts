import { Chess, type Color, type Move, type Square } from '@weshell/xiangqi.js';

export type Mode = 'local' | 'ai' | 'puzzle';
export type AiLevel = 'learner' | 'challenger';

export interface XiangqiSave {
  mode: Mode;
  level: AiLevel;
  human: Color;
  initialFen: string;
  moves: string[];
  flipped: boolean;
  autoRotate: boolean;
  puzzleId?: string;
  solved: string[];
}

export function defaultSave(): XiangqiSave {
  return { mode: 'local', level: 'learner', human: 'w', initialFen: new Chess().fen(), moves: [], flipped: false, autoRotate: false, solved: [] };
}

export function isValidSave(value: unknown): value is XiangqiSave {
  if (!value || typeof value !== 'object') return false;
  const save = value as Partial<XiangqiSave>;
  return (save.mode === 'local' || save.mode === 'ai' || save.mode === 'puzzle')
    && (save.level === 'learner' || save.level === 'challenger')
    && (save.human === 'w' || save.human === 'b')
    && typeof save.initialFen === 'string'
    && Array.isArray(save.moves) && save.moves.every((move) => typeof move === 'string')
    && typeof save.flipped === 'boolean' && typeof save.autoRotate === 'boolean'
    && (save.puzzleId === undefined || typeof save.puzzleId === 'string')
    && Array.isArray(save.solved) && save.solved.every((id) => typeof id === 'string');
}

export function restore(save: XiangqiSave): Chess {
  const game = new Chess(save.initialFen);
  for (const lan of save.moves) {
    if (!game.moves({ verbose: true }).some((move) => move.lan === lan)) throw new Error(`Invalid saved move ${lan}`);
    game.move(lan);
  }
  return game;
}

export function legalFrom(game: Chess, square: Square): Move[] {
  return game.moves({ verbose: true, square });
}

export function makeMove(game: Chess, from: Square, to: Square): Move | null {
  const move = legalFrom(game, from).find((candidate) => candidate.to === to);
  return move ? game.move(move.lan) : null;
}

export function turnLabel(game: Chess): string {
  if (game.isCheckmate()) return game.turn() === 'w' ? '黑方获胜 · 将死' : '红方获胜 · 将死';
  if (game.isStalemate()) return game.turn() === 'w' ? '黑方获胜 · 困毙' : '红方获胜 · 困毙';
  if (game.isDraw()) return '和棋';
  return `${game.turn() === 'w' ? '红方' : '黑方'}行棋${game.isCheck() ? ' · 正在被将军' : ''}`;
}

export function pieceName(type: string, color: Color): string {
  const names: Record<string, [string, string]> = {
    k: ['帅', '将'], a: ['仕', '士'], b: ['相', '象'], n: ['马', '马'], r: ['车', '车'], c: ['炮', '炮'], p: ['兵', '卒'],
  };
  return names[type]?.[color === 'w' ? 0 : 1] ?? type;
}
