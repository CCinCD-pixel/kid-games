import { BLUE, RED, parseSq, sq } from '../src/core/board';
import { pieceMoves, type Move } from '../src/core/movegen';
import { typeFromCode } from '../src/core/pieces';
import { addPiece, newState, type GameState, type Mode, type RuleSet } from '../src/core/state';
import templates from '../../../content/military-chess/templates.json';

export const P = parseSq;
export { sq };

/**
 * Position from a map { 'c6': 'r7', 'b12': 'bF', 'a5': 'b3^' } — side r/b, type code, and in 翻翻棋
 * a trailing '^' marks a face-up piece (everything else is face down there).
 */
export function pos(pieces: Record<string, string>, opts: { mode?: Mode; turn?: 0 | 1 | -1; rules?: Partial<RuleSet> } = {}): GameState {
  const mode = opts.mode ?? 'ming';
  const s = newState(mode, opts.rules);
  for (const [k, v] of Object.entries(pieces)) {
    addPiece(s, v[0] === 'r' ? RED : BLUE, typeFromCode(v[1]), P(k), mode !== 'fan' || v[2] === '^');
  }
  s.turn = opts.turn ?? RED;
  if (mode === 'fan' && s.turn !== -1) s.colorOf = [RED, BLUE];
  return s;
}

export const movesOf = (s: GameState, at: string): Move[] => pieceMoves(s, s.board[P(at)]);
export const dests = (s: GameState, at: string): string[] => movesOf(s, at).map((m) => sq(m.to)).sort();
export const moveTo = (s: GameState, from: string, to: string): Move => {
  const m = movesOf(s, from).find((mm) => sq(mm.to) === to);
  if (!m) throw new Error(`no move ${from}→${to}; have ${dests(s, from).join(' ')}`);
  return m;
};

export const TEMPLATES = templates as Array<{ id: string; name: string; blurb: string; kid: boolean; layout: string }>;
export const T = (id: string): string => TEMPLATES.find((t) => t.id === id)!.layout;
