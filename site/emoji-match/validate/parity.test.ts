/**
 * V2 port conformance (spec §8.10): reproduce content/emoji-match/parity.json bit-exactly — start
 * boards (seed 7), the G bot's first 6 moves with boards, objective counts and hint checkpoints
 * (bestMove / hint1Candidates), and the K bot's moves-to-win over 20 seeds.
 */
import { describe, expect, it } from 'vitest';
import parity from '../../../content/emoji-match/parity.json';
import { applyMove, bestMove, boardString, chooseMove, hint1Candidates, newGame, parseLevel, playOut, rngNew, snapshot, type LevelDef, type Move } from '../src/core';

interface Entry { def: LevelDef; start: string; trace: { mv: Move; board: string; remaining: number[]; hint: { best: string | null; h1: string[] } }[]; needK: (number | null)[] }
const P = parity as unknown as { levels: Record<string, Entry> };
const key = (m: Move | null) => (m ? (m.t === 'tap' ? `t${m.a}` : `${m.a}-${m.b}`) : null);

describe('V2 parity', () => {
  it.each(Object.keys(P.levels))('%s: start board, G trace, hints', (id) => {
    const e = P.levels[id];
    const L = parseLevel(e.def);
    expect(boardString(newGame(L, 7))).toBe(e.start);
    const st = newGame(L, 7); const brng = rngNew('bot:G:7');
    for (const t of e.trace) {
      expect({ best: key(bestMove(st)), h1: hint1Candidates(st).map(key) }).toEqual(t.hint);
      const mv = chooseMove('G', st, brng)!;
      expect(mv).toEqual(t.mv);
      applyMove(st, mv);
      expect(boardString(st)).toBe(t.board);
      expect(snapshot(st)).toEqual(t.remaining);
    }
  });
  it.each(Object.keys(P.levels))('%s: K bot moves-to-win over 20 seeds', (id) => {
    const e = P.levels[id];
    const L = parseLevel(e.def);
    const got = Array.from({ length: 20 }, (_, s) => { const n = playOut(L, 1000 + s, 'K', 60).needed; return n === Infinity ? null : n; });
    expect(got).toEqual(e.needK);
  }, 30000);
});
