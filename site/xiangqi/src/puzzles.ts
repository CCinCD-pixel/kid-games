import { Chess, type Move } from '@weshell/xiangqi.js';
import puzzles from '../../../content/xiangqi/puzzles.json';

export interface Puzzle {
  id: string;
  title: string;
  fen: string;
  hint: string;
  lesson: string;
}

export const PUZZLES: Puzzle[] = puzzles;

export function puzzleSolved(game: Chess): boolean {
  return game.isCheckmate();
}

export function matingMoves(fen: string): Move[] {
  const game = new Chess(fen);
  return game.moves({ verbose: true }).filter((move) => {
    game.move(move.lan);
    const mate = puzzleSolved(game);
    game.undo();
    return mate;
  });
}
