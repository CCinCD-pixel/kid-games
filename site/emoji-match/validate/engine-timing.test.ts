/**
 * Engine timing budgets (spec §8.9, QA r1): on iPad 9 (A13) bestMove ≤ 15 ms, hint1Candidates ≤ 20 ms,
 * the puzzle hint solve ≤ 5 ms. The spec's conversion is A13 ≈ Node × 8 (§8.9), so the asserted p95 here is
 * budget / DEVICE (8) — QA r2: the old ÷3 let a 2–5× regression pass. Each figure is the BEST of 5 p95
 * (p99 for applyMove) runs after a warm-up: other agents on the shared dev Mac can only make a run slower,
 * so the fastest run is the honest estimate of the engine's own cost, and a real 2–5× regression still
 * shows in every run. applyMove ≤ 2 ms on the iPad (V9's timing, moved here out of the fuzz invariants).
 * Boards: the heaviest v1 levels (9×9, blockers, inner gates) over 20 seeds and a few moves into play.
 */
import { describe, expect, it } from 'vitest';
import { applyMove, bestMove, cloneState, hint1Candidates, hintFrom, listMoves, newGame, parseLevel, type GameState, type Move } from '../src/core';
import { LEVELS, PUZZLES, puzzleDef } from '../src/content';

const DEVICE = 8;
const best5 = (f: () => number) => Math.min(f(), f(), f(), f(), f());
const p99 = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * 0.99))]; };
const p95 = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * 0.95))]; };
const time = (f: () => unknown) => { const t = performance.now(); f(); return performance.now() - t; };
const HEAVY = ['2-10', '3-08', '3-10', '4-06', '4-09', '4-10'];

describe('engine timing (best-of-5 p95, budget / 8 on the dev Mac)', () => {
  const boards: GameState[] = [];
  for (const id of HEAVY) {
    const L = parseLevel(LEVELS.find((d) => d.id === id)!);
    for (let seed = 1; seed <= 20; seed += 1) {
      const st = newGame(L, seed);
      for (let k = 0; k < 3; k += 1) { const m = bestMove(st); if (!m || !applyMove(st, m).ok) break; }
      boards.push(st);
    }
  }
  for (const st of boards.slice(0, 5)) { bestMove(st); hint1Candidates(st); } // warm-up (JIT)
  it(`applyMove p99 ≤ ${(2 / DEVICE).toFixed(2)} ms`, () => {
    const cases: [GameState, Move][] = [];
    for (const st of boards) for (const m of listMoves(st).slice(0, 6)) cases.push([st, m]);
    for (const [st, m] of cases.slice(0, 20)) applyMove(cloneState(st), m); // warm-up
    const run = () => p99(cases.map(([st, m]) => { const c = cloneState(st); return time(() => applyMove(c, m)); }));
    const t = best5(run);
    console.log(`applyMove p99 ${t.toFixed(3)} ms over ${cases.length} moves`);
    expect(t).toBeLessThanOrEqual(2 / DEVICE);
  });
  it(`bestMove ≤ ${(15 / DEVICE).toFixed(1)} ms`, () => {
    const t = best5(() => p95(boards.map((st) => time(() => bestMove(st)))));
    console.log(`bestMove p95 ${t.toFixed(2)} ms over ${boards.length} boards`);
    expect(t).toBeLessThanOrEqual(15 / DEVICE);
  });
  it(`hint1Candidates ≤ ${(20 / DEVICE).toFixed(1)} ms`, () => {
    const t = best5(() => p95(boards.map((st) => time(() => hint1Candidates(st)))));
    console.log(`hint1Candidates p95 ${t.toFixed(2)} ms`);
    expect(t).toBeLessThanOrEqual(20 / DEVICE);
  });
  it(`puzzle hint solve ≤ ${(5 / DEVICE).toFixed(1)} ms`, () => {
    const run = () => {
      const xs: number[] = [];
      for (const p of PUZZLES) {
        const def = puzzleDef(p);
        const st = newGame(parseLevel(def), 0);
        hintFrom(def, st, p.par); // warm
        for (let k = 0; k < 10; k += 1) xs.push(time(() => hintFrom(def, st, p.par)));
      }
      return p95(xs);
    };
    const t = best5(run);
    console.log(`puzzle hintFrom p95 ${t.toFixed(2)} ms`);
    expect(t).toBeLessThanOrEqual(5 / DEVICE);
  });
});
