import { describe, expect, it } from 'vitest';
import { Chess } from '@weshell/xiangqi.js';
import { defaultSave, isValidSave, legalFrom, makeMove, restore, turnLabel } from './core';

describe('xiangqi rules integration', () => {
  it('matches known initial move counts and rejects occupied horse legs', () => {
    const game = new Chess();
    expect(game.perft(1)).toBe(44);
    expect(game.perft(2)).toBe(1920);
    expect(legalFrom(game, 'b0').map((move) => move.to).sort()).toEqual(['a2', 'c2']);
    expect(makeMove(game, 'b0', 'd1')).toBeNull();
    expect(game.turn()).toBe('w');
  });

  it('replays saved moves and preserves turn, notation and legal undo', () => {
    const save = defaultSave();
    const game = restore(save);
    const first = makeMove(game, 'b0', 'c2');
    expect(first?.zh).toBe('马八进七');
    save.moves.push(first!.lan);
    expect(restore(save).fen()).toBe(game.fen());
    expect(turnLabel(game)).toBe('黑方行棋');
    game.undo();
    expect(game.fen()).toBe(save.initialFen);
  });

  it('rejects corrupt saved histories', () => {
    const save = defaultSave();
    save.moves = ['b0d1'];
    expect(() => restore(save)).toThrow('Invalid saved move');
  });

  it('rejects incomplete saved data before rendering it', () => {
    expect(isValidSave({ ...defaultSave(), solved: undefined })).toBe(false);
    expect(isValidSave({ ...defaultSave(), moves: [null] })).toBe(false);
    expect(isValidSave(defaultSave())).toBe(true);
  });
});
