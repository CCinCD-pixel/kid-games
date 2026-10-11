import { describe, expect, it } from 'vitest';
import { Chess } from '@weshell/xiangqi.js';
import { chooseAiMove } from './ai';
import { PUZZLES } from './puzzles';

describe('kid-friendly xiangqi AI', () => {
  it.each(['learner', 'challenger'] as const)('%s always selects a legal move', (level) => {
    const game = new Chess();
    for (let turn = 0; turn < 8; turn++) {
      const picked = chooseAiMove(game.fen(), level);
      expect(picked).not.toBeNull();
      expect(game.moves({ verbose: true }).map((move) => move.lan)).toContain(picked);
      game.move(picked!);
      if (game.isGameOver()) break;
    }
  });

  it('takes an immediate forced mate before ordinary material', () => {
    const game = new Chess(PUZZLES[0].fen);
    game.move(chooseAiMove(game.fen(), 'challenger')!);
    expect(game.isCheckmate()).toBe(true);
  });
});
