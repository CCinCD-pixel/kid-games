import { describe, expect, it } from 'vitest';
import { createRules } from '@engines/board/games/chess/rules';
import { sqName, type ChessState } from '@engines/board/games/chess/position';
import { ENDGAMES, MATE_PUZZLES, PIECE_LESSONS } from './src/lessons';

const rules = createRules();

function reachesGoal(start: ChessState, goal: string): boolean {
  const queue: { state: ChessState; depth: number }[] = [{ state: start, depth: 0 }];
  const seen = new Set<string>();
  for (let i = 0; i < queue.length; i++) {
    const { state, depth } = queue[i];
    if (depth >= 4) continue;
    for (const move of rules.legalMoves(state)) {
      if (sqName(move.to.r, move.to.c) === goal) return true;
      const next = { ...rules.apply(state, move), turn: 'w' as const };
      const fen = rules.toFen(next);
      if (!seen.has(fen)) { seen.add(fen); queue.push({ state: next, depth: depth + 1 }); }
    }
  }
  return false;
}

describe('棋手学院内容', () => {
  it('six piece courses each have two reachable targets', () => {
    expect(PIECE_LESSONS).toHaveLength(6);
    for (const lesson of PIECE_LESSONS) {
      expect(lesson.tasks, lesson.id).toHaveLength(2);
      for (const task of lesson.tasks) {
        const state = rules.fromFen(task.fen);
        expect(state.board.flat().some((piece) => piece?.color === 'w' && piece.type === lesson.piece), task.id).toBe(true);
        expect(reachesGoal(state, task.to), task.id).toBe(true);
      }
    }
  });

  it('all eight child endgames start with a legal move and are unfinished', () => {
    expect(ENDGAMES).toHaveLength(8);
    for (const puzzle of ENDGAMES) {
      const state = rules.fromFen(puzzle.fen);
      expect(state.turn, puzzle.id).toBe('w');
      expect(rules.status(state).over, puzzle.id).toBe(false);
      expect(rules.legalMoves(state).length, puzzle.id).toBeGreaterThan(0);
    }
  });

  it('all eight starter puzzles have a one-move checkmate', () => {
    expect(MATE_PUZZLES).toHaveLength(8);
    for (const puzzle of MATE_PUZZLES) {
      const state = rules.fromFen(puzzle.fen);
      expect(rules.status(state).over, puzzle.id).toBe(false);
      const mates = rules.legalMoves(state).filter((move) => {
        const result = rules.status(rules.apply(state, move));
        return result.over && result.winner === 0;
      });
      expect(mates.length, puzzle.id).toBeGreaterThan(0);
    }
  });
});
