import { createStore } from '@kit/progress';
import { replayMoves } from '@engines/board/core/game';
import { createRules, START_FEN } from '@engines/board/games/chess/rules';

export type Mode = 'ai' | 'f2f' | 'puzzle';
export interface SavedGame { mode: Mode; startFen: string; moves: string[]; level: number; puzzleId?: string; completed?: boolean }
export interface ChessSave { lessons: string[]; lessonProgress: Record<string, number>; puzzles: string[]; played: number; wins: number; game: SavedGame | null }
export const defaults = (): ChessSave => ({ lessons: [], lessonProgress: {}, puzzles: [], played: 0, wins: 0, game: null });
export const store = createStore<ChessSave>('chess', { version: 1, defaults });

export function readSave(): ChessSave {
  const raw = store.load();
  const save: ChessSave = {
    lessons: Array.isArray(raw?.lessons) ? raw.lessons.filter((id): id is string => typeof id === 'string').slice(0, 80) : [],
    lessonProgress: Object.fromEntries(Object.entries(raw?.lessonProgress ?? {}).filter(([id, step]) => /^[A-Z]1$/.test(id) && Number.isInteger(step) && step >= 0 && step <= 3)),
    puzzles: Array.isArray(raw?.puzzles) ? raw.puzzles.filter((id): id is string => typeof id === 'string').slice(0, 80) : [],
    played: Number.isInteger(raw?.played) && raw.played >= 0 ? raw.played : 0,
    wins: Number.isInteger(raw?.wins) && raw.wins >= 0 ? raw.wins : 0,
    game: null,
  };
  const rec = raw?.game;
  if (rec && ['ai', 'f2f', 'puzzle'].includes(rec.mode) && typeof rec.startFen === 'string' && Array.isArray(rec.moves)) {
    try {
      const moves = rec.moves.filter((m): m is string => typeof m === 'string').slice(0, 500);
      const replay = replayMoves(createRules(), rec.startFen, moves);
      save.game = { mode: rec.mode, startFen: rec.startFen, moves: replay.game.encoded(), level: Number.isInteger(rec.level) ? Math.max(0, Math.min(2, rec.level)) : 0, ...(typeof rec.puzzleId === 'string' ? { puzzleId: rec.puzzleId } : {}), completed: rec.completed === true };
    } catch { save.game = null; }
  }
  return save;
}

export const freshGame = (mode: Mode, level = 0, startFen = START_FEN, puzzleId?: string): SavedGame =>
  ({ mode, startFen, moves: [], level, ...(puzzleId ? { puzzleId } : {}) });
