// Static drills (spec §3.18, §4.10): fixed grain = budget, fixed deck, no cooldowns, no economy, no logs (the first
// machine at the gate = not held), win = every machine dismantled or captured within 90 s of the last spawn.
// Port of proto/v1/puzzles-v1.mjs: the level builder the game plays, and the exact lane-separable solver the V9
// validator (puzzle.test.ts) uses to re-prove every shipped puzzle (P1-P7). Theme-free (no CJK, no DOM).
import { createSim, step, act } from './sim';
import { UNITS } from './tables';
import { sec } from './rules';
import { FEARS } from './tags';
import type { Level, SimState } from './types';

export type Wave = [number, string][];
export interface PuzzleLane { lane: number; wave: Wave; par: number; classes: string[]; best: Placement[] }
export interface Puzzle {
  id: string; group: number; groupName: string; jinnang: string; unlock: string; deck: string[];
  budget: number; par: number; star3: number; star2: number; randomHold: number; lanes: PuzzleLane[];
}
export interface Placement { card: string; col: number; lane?: number }

/** sensible columns per card (attackers 1-3, walls 4-6, pits/spikes 5-7, hook 3-4, gust 1-2; 0-based) */
export const COLS_OF: Record<string, number[]> = { shooter: [0, 1, 2], lobber: [0, 1, 2], burner: [0, 1, 2], beam: [0, 1, 2], wall: [3, 4, 5], pit: [4, 5, 6], spikes: [4, 5, 6], hook: [2, 3], gust: [0, 1] };
const MID = 2; // the solver plays every lane alone in the middle lane (geometry is identical for all lanes)

export const lastOf = (p: Puzzle): number => Math.max(...p.lanes.flatMap((l) => l.wave.map((w) => w[0])));

/** the level the game plays: all of the puzzle's lanes at once */
export function puzzleLevel(p: Puzzle): Level {
  const lanes = [0, 0, 0, 0, 0]; for (const l of p.lanes) lanes[l.lane] = 1;
  const spawns = p.lanes.flatMap((l) => l.wave.map(([t, k]) => [sec(t), l.lane, k, 1] as [number, number, string, number]));
  return {
    id: p.id, name: p.id, type: 'puzzle', lanes, sky: false, start: p.budget, puzzle: true, jitter: 0, env: {}, flags: [],
    endTick: sec(lastOf(p) + 90), clearOnly: true, loadout: p.deck.slice(), spawns,
  } as unknown as Level;
}

/** a fresh puzzle sim with the placements made at tick 0 (exactly what step(S, placements) does first) */
export function puzzleSim(p: Puzzle, placed: Required<Placement>[], opt: { events?: boolean } = {}): SimState {
  const S = createSim(puzzleLevel(p), 0, { events: !!opt.events });
  for (const q of placed) act(S, { t: 'place', card: q.card, lane: q.lane, col: q.col });
  return S;
}
export const costOf = (pl: Placement[]): number => pl.reduce((m, q) => m + UNITS[q.card].cost, 0);
/** stars by spend: <= par 3, <= par + 40 2, within budget 1 (spec §3.18) */
export const puzzleStars = (p: Puzzle, spent: number): 1 | 2 | 3 => (spent <= p.star3 ? 3 : spent <= p.star2 ? 2 : 1);

/** one lane alone (proto playLane): placements at tick 0, run to the end */
export function playLane(wave: Wave, placements: Placement[]): boolean {
  const last = Math.max(...wave.map((w) => w[0]));
  const level = { id: 'pz', lanes: [0, 0, 1, 0, 0], sky: false, start: 99999, puzzle: true, jitter: 0, env: {}, endTick: sec(last + 90), clearOnly: true,
    loadout: [...new Set(placements.map((q) => q.card))], spawns: wave.map(([t, k]) => [sec(t), MID, k, 1]) } as unknown as Level;
  const S = createSim(level, 0);
  step(S, placements.map((q) => ({ t: 'place' as const, card: q.card, lane: MID, col: q.col })));
  while (!S.result && S.tick < sec(last + 120)) step(S, null);
  return S.result === 'win';
}
function* configs(deck: string[], maxUnits: number): Generator<Placement[]> {
  const opts: Placement[] = []; for (const c of deck) for (const col of COLS_OF[c] || [3]) opts.push({ card: c, col });
  const n = opts.length; yield [];
  for (let a = 0; a < n; a++) {
    yield [opts[a]]; if (maxUnits < 2) continue;
    for (let b = a + 1; b < n; b++) {
      if (opts[b].col === opts[a].col) continue; yield [opts[a], opts[b]]; if (maxUnits < 3) continue;
      for (let c = b + 1; c < n; c++) {
        if (opts[c].col === opts[a].col || opts[c].col === opts[b].col) continue; yield [opts[a], opts[b], opts[c]]; if (maxUnits < 4) continue;
        for (let d = c + 1; d < n; d++) { if ([a, b, c].some((x) => opts[x].col === opts[d].col)) continue; yield [opts[a], opts[b], opts[c], opts[d]]; }
      }
    }
  }
}
const kindOf = (k: string): string => (k === 'swarm' ? 'ant' : k);
/** P7: every non-walker machine whose feared card is in the deck meets one of those cards in the placement */
export function p7ok(wave: Wave, deck: string[], pl: Placement[]): boolean {
  const cards = new Set(pl.map((q) => q.card));
  for (const [, k0] of wave) { const k = kindOf(k0); if (k === 'walker') continue; const fe = (FEARS[k] || []).filter((c) => deck.includes(c)); if (fe.length && !fe.some((c) => cards.has(c))) return false; }
  return true;
}
export const classOf = (pl: Placement[]): string => pl.map((q) => q.card).sort().join('+');
/** exact cheapest solutions of one lane (proto solveLane) */
export function solveLane(wave: Wave, deck: string[], maxUnits = 3): { par: number; classes: string[]; atPar: Placement[][]; p7all: boolean } {
  const all = [...configs(deck, maxUnits)].sort((x, y) => costOf(x) - costOf(y));
  let par = Infinity; const sols: { cost: number; pl: Placement[] }[] = [];
  for (const pl of all) { const c = costOf(pl); if (c > par + 60) break; if (playLane(wave, pl)) { if (c < par) par = c; sols.push({ cost: c, pl }); } }
  const atPar = sols.filter((s) => s.cost === par).map((s) => s.pl);
  return { par, classes: [...new Set(atPar.map(classOf))], atPar, p7all: atPar.every((pl) => p7ok(wave, deck, pl)) };
}
/** P2: the PvZ habit (crossbows only, plus a wall from group 2 on) must not hold the lane within par + 20 */
export function naiveHolds(wave: Wave, budget: number, withWall: boolean): boolean {
  const tries: Placement[][] = [[{ card: 'shooter', col: 1 }], [{ card: 'shooter', col: 0 }, { card: 'shooter', col: 1 }], [{ card: 'shooter', col: 0 }, { card: 'shooter', col: 1 }, { card: 'shooter', col: 2 }]];
  if (withWall) tries.push([{ card: 'shooter', col: 1 }, { card: 'wall', col: 4 }], [{ card: 'shooter', col: 0 }, { card: 'shooter', col: 1 }, { card: 'wall', col: 4 }]);
  return tries.some((pl) => costOf(pl) <= budget && playLane(wave, pl));
}
function hashStr(s: string): number { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** P6: share of 200 uniformly random placements within the budget that hold every lane (proto randomHolds, same RNG) */
export function randomHolds(lanes: { wave: Wave }[], deck: string[], budget: number, n = 200): number {
  const r = rng(hashStr('rand:' + lanes.map((l) => l.wave.map((w) => w.join('')).join('')).join('|'))); let held = 0;
  for (let i = 0; i < n; i++) {
    let left = budget; let all = true;
    for (const L of lanes) {
      const pl: Placement[] = []; const used = new Set<number>();
      for (let j = 0; j < 4; j++) { const c = deck[Math.floor(r() * deck.length)]; const cols = COLS_OF[c] || [3]; const col = cols[Math.floor(r() * cols.length)]; if (used.has(col) || UNITS[c].cost > left || r() < 0.3) continue; used.add(col); pl.push({ card: c, col }); left -= UNITS[c].cost; }
      if (!playLane(L.wave, pl)) { all = false; break; }
    }
    if (all) held++;
  }
  return held / n;
}
