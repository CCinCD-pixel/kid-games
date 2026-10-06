/**
 * 星图谜题 solver (spec §3.16/§4.5; puzzles.mjs `solve`/`accept`/`hintFrom` 1:1): exhaustive DFS to
 * `maxDepth` on the real engine (no refill, seed 0). Used by V6 and by the state-relative puzzle hint.
 */
import { parseLevel } from './level';
import { applyMove, listMoves } from './moves';
import { cloneState, isWon, newGame } from './state';
import type { Ev, GameState, LevelDef, Move, MoveResult, StepDef } from './types';

interface LineInfo { created: boolean; fired: boolean; slides: number; depth: number; trick: boolean; iceMatched: number[] }
type TrickFn = (ev: Ev[], res: MoveResult, line: LineInfo, iced: Set<number>, goal: number | undefined) => boolean;

export const TRICKS: Record<string, TrickFn | 'line'> = {
  cascade: (_ev, res) => (res.steps ?? 0) >= 2,
  cascadeGoal: (ev, _res, _line, _iced, goal) => !ev.some((e) => e.e === 'match' && e.step === 0 && e.color === goal) && ev.some((e) => e.e === 'match' && e.step >= 1 && e.color === goal),
  rocketH: (ev) => ev.some((e) => e.e === 'blast' && e.k === 2),
  makeAndUse: (_ev, _res, line) => line.created && line.fired,
  iceMatch: (ev, _res, _line, iced) => ev.some((e) => e.e === 'match' && (e.cells as number[]).some((i) => iced.has(i))),
  drone: (ev) => ev.some((e) => e.e === 'fly'),
  iceAllByMatch: 'line',
};

export interface SolveLine { moves: StepDef[]; first: string; len: number; slides: number; depth: number; trick: boolean; usedSpecial: boolean }
export interface SolveResult { minDepth: number; lines: SolveLine[]; winningFirst: string[]; nodes: number; legalFirst: number; solution: StepDef[] | null; shorter: boolean }

export function solve(def: LevelDef, maxDepth: number, trickName: string | null = null, fromState: GameState | null = null): SolveResult {
  const L = parseLevel({ ...def, refill: false, fixedBoard: true });
  const root = fromState ?? newGame(L, 0);
  const firstMoves = listMoves(root);
  const t = trickName ? TRICKS[trickName] : undefined;
  const trick = typeof t === 'function' ? t : null;
  const lineTrick = trickName === 'iceAllByMatch';
  const iced0: number[] = []; for (let i = 0; i < root.N; i += 1) if (root.kind[i] === 1 && root.ice[i] > 0) iced0.push(i);
  const goal = (L.objectives.find((o) => o.t === 'collect') as { c: number } | undefined)?.c;
  let minDepth = Infinity; let nodes = 0;
  const lines: SolveLine[] = [];
  const key = (m: Move) => (m.t === 'tap' ? `t${m.a}` : `${m.a}-${m.b}`);
  const rc = (i: number): [number, number] => [Math.floor(i / L.W), i % L.W];
  const asStep = (m: Move): StepDef => (m.t === 'tap' ? { tap: rc(m.a) } : { from: rc(m.a), to: rc(m.b) });
  function dfs(st: GameState, depth: number, path: Move[], info: LineInfo) {
    if (depth >= maxDepth) return;
    for (const mv of listMoves(st)) {
      nodes += 1;
      const c = cloneState(st); c.evalMode = false; c.refill = false; c.log = [];
      const iced = new Set<number>(); for (let i = 0; i < c.N; i += 1) if (c.kind[i] === 1 && c.ice[i] > 0) iced.add(i);
      const created0 = c.stats.created.reduce((a, b) => a + b, 0), fired0 = c.stats.fired, slides0 = c.stats.slides;
      const res = applyMove(c, mv);
      if (!res.ok) continue;
      const step: LineInfo = {
        created: info.created || c.stats.created.reduce((a, b) => a + b, 0) > created0,
        fired: info.fired || c.stats.fired > fired0,
        slides: info.slides + (c.stats.slides - slides0),
        depth: Math.max(info.depth, (res.steps ?? 0) - 1),
        iceMatched: [...info.iceMatched, ...c.log!.filter((e) => e.e === 'match').flatMap((e) => (e.cells as number[]).filter((i) => iced.has(i)))],
        trick: false,
      };
      step.trick = lineTrick ? (!step.fired && iced0.every((i) => step.iceMatched.includes(i))) : (info.trick || (trick ? !!trick(c.log!, res, step, iced, goal) : true));
      const p2 = [...path, mv];
      if (isWon(c)) {
        if (depth + 1 < minDepth) minDepth = depth + 1;
        lines.push({ moves: p2.map(asStep), first: key(p2[0]), len: depth + 1, slides: step.slides, depth: step.depth, trick: step.trick, usedSpecial: step.created || step.fired });
        continue;
      }
      c.log = null;
      dfs(c, depth + 1, p2, step);
    }
  }
  dfs(root, 0, [], { created: false, fired: false, slides: 0, depth: 0, trick: false, iceMatched: [] });
  const winning = lines.filter((l) => l.len === minDepth);
  return { minDepth, lines: winning, winningFirst: [...new Set(winning.map((l) => l.first))], nodes, legalFirst: firstMoves.length, solution: winning[0]?.moves ?? null, shorter: lines.some((l) => l.len < maxDepth) };
}

export function accept(r: SolveResult, o: { par: number; maxDepth: number; minLegal: number }): { ok: boolean; why: string[] } {
  const why: string[] = [];
  if (r.minDepth !== o.par) why.push(`min ${r.minDepth} != par ${o.par}`);
  if (r.lines.length < 1 || r.lines.length > 3) why.push(`${r.lines.length} winning lines`);
  if (r.lines.some((l) => l.slides > 0)) why.push('diagonal slide in a solution');
  if (r.lines.some((l) => l.depth > o.maxDepth)) why.push(`cascade depth > ${o.maxDepth}`);
  if (r.lines.some((l) => !l.trick)) why.push('a winning line skips the trick');
  if (r.legalFirst < o.minLegal) why.push(`only ${r.legalFirst} legal first moves`);
  return { ok: why.length === 0, why };
}

/** state-relative hint: next move of a winning line from the CURRENT state, or null (off-path) */
export function hintFrom(def: LevelDef, st: GameState, movesLeft: number): StepDef | null {
  const r = solve(def, movesLeft, null, st);
  return r.minDepth <= movesLeft ? r.lines[0].moves[0] : null;
}
