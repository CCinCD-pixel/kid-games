/**
 * Move notation: 'c6-c7' (move), 'c6xc7' (collision), '*c3' (flip), '…' (pass). Saves are replays
 * of these strings (spec §8.2), so parsing goes through the legal-move generator.
 */
import { mirrorSq, parseSq, sq } from './board';
import { isFlip, isPass, legalMoves, pieceMoves, type Action } from './movegen';
import { apply } from './rules';
import type { GameState } from './state';

export const PASS_NOTE = '…';

export function toNote(a: Action): string {
  if (isPass(a)) return PASS_NOTE;
  if (isFlip(a)) return '*' + sq(a.flip);
  return sq(a.from) + (a.kind === 'attack' ? 'x' : '-') + sq(a.to);
}

/** The legal action written as `note` in position `s`, or null. */
export function parseNote(s: GameState, note: string): Action | null {
  if (s.result) return null;
  if (note === PASS_NOTE) return legalMoves(s).find(isPass) ?? null;
  if (note[0] === '*') {
    const at = parseSq(note.slice(1));
    return legalMoves(s).find((a) => isFlip(a) && a.flip === at) ?? null;
  }
  const m = /^([a-e]\d{1,2})([-x])([a-e]\d{1,2})$/.exec(note);
  if (!m) return null;
  const from = parseSq(m[1]), to = parseSq(m[3]);
  const pid = s.board[from];
  if (pid < 0 || s.pside[pid] !== s.turn) return null;
  return pieceMoves(s, pid).find((mv) => mv.to === to) ?? null;
}

/** left↔right mirrored notation (twin puzzles) */
export function mirrorNote(note: string): string {
  if (note === PASS_NOTE) return note;
  return note.replace(/[a-e]\d{1,2}/g, (t) => sq(mirrorSq(parseSq(t))));
}

/** Replay notes from a start position; throws on the first illegal note. */
export function replay(start: GameState, notes: readonly string[]): GameState {
  let s = start;
  for (const n of notes) {
    const a = parseNote(s, n);
    if (!a) throw new Error(`illegal note ${n} at ply ${s.ply}`);
    s = apply(s, a).state;
  }
  return s;
}
