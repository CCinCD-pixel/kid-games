import { describe, expect, it } from 'vitest';
import { Chess } from '@weshell/xiangqi.js';
import { PUZZLES, matingMoves, puzzleSolved } from './puzzles';

describe('curated endgames', () => {
  it('has eight distinct legal positions with exactly one mate in one', () => {
    expect(PUZZLES).toHaveLength(8);
    expect(new Set(PUZZLES.map((puzzle) => puzzle.id)).size).toBe(PUZZLES.length);
    for (const puzzle of PUZZLES) {
      const game = new Chess(puzzle.fen);
      expect(game.turn(), puzzle.id).toBe('w');
      expect(game.isGameOver(), puzzle.id).toBe(false);
      const before = new Chess(puzzle.fen.replace(' w ', ' b '));
      expect(before.isCheck(), puzzle.id).toBe(false);
      const solutions = matingMoves(puzzle.fen);
      expect(solutions, puzzle.id).toHaveLength(1);
      game.move(solutions[0].lan);
      expect(puzzleSolved(game), puzzle.id).toBe(true);
    }
  });
});
