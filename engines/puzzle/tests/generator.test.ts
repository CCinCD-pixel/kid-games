/**
 * 随机新仓库 generator (spec §8.10 generator.test.ts): T1–T3 × 20 seeds — the same seed gives the
 * same warehouse bit for bit, every R rule holds, the optimum lies in the tier's range and an
 * independent solver confirms it. Tier 4 (v2) only with SOK_FULL=1.
 */
import { describe, expect, it } from 'vitest';
import { detectDeadlock } from '../src/deadlock';
import { GEN_BUDGET, TIERS, generatePuzzle, type GeneratedLevel, type Tier } from '../src/generator';
import { canonicalHash, parseLevel } from '../src/level';
import { greedy, sequential } from '../src/plan';
import { canon, replayLurd } from '../src/rules';
import { solvePushOptimal } from '../src/solver';
import { StateGraph } from '../src/stategraph';
import { FULL, contentLevels, contentRooms } from './helpers';

const rooms = contentRooms();
const fixedHashes = new Set(contentLevels().map((l) => canonicalHash(l.map)));

function checkR(g: GeneratedLevel, tier: Tier): string[] {
  const T = TIERS[tier];
  const errs: string[] = [];
  const l = parseLevel(g.rows);
  // G1 (parse) passed; G8-like start checks
  if (detectDeadlock(l, canon(l, l.start.boxes))) errs.push('R2 dead at start');
  for (const b of l.start.boxes) if (l.goal[b] >= 0) errs.push('crate starts on a pad');
  if (l.goal[l.start.player] >= 0) errs.push('robot starts on a pad');
  if (l.colored) errs.push('v1 random levels have no colour');
  if (l.nBoxes < T.boxes[0] || l.nBoxes > T.boxes[T.boxes.length - 1]) errs.push(`crates ${l.nBoxes}`);
  // R1: solvable, optimum in range (independent A*)
  const r = solvePushOptimal(l, l.start, { nodes: 400000, ms: 60000 });
  if (!('pushes' in r)) errs.push('R1 unsolvable (A*)');
  else if (r.pushes.length !== g.pushes) errs.push(`R1 A* ${r.pushes.length} ≠ ${g.pushes}`);
  if (g.pushes < T.push[0] || g.pushes > T.push[1]) errs.push(`R1 pushes ${g.pushes} ∉ [${T.push}]`);
  // the reference line solves it with the optimum
  const rp = replayLurd(l, g.lurd);
  if (!(rp.ok && rp.solved && rp.pushes === g.pushes && rp.moves === g.moves)) errs.push(`ref ${JSON.stringify(rp)}`);
  // R3 / R4
  const graph = StateGraph.buildSync(l, { maxStates: GEN_BUDGET.forwardStates, maxMs: Number.POSITIVE_INFINITY, keepEdges: true })!;
  const sq = sequential(l, { maxStates: GEN_BUDGET.sequentialStates });
  if (T.needInsight && greedy(l, null) === 'solved' && sq.firsts.length !== 1 && sq.firsts.length > 0) errs.push('R3 no idea needed');
  const trap = Array.from(graph.successors(graph.startIndex)).filter((j) => graph.togoAt(j) < 0).length;
  if (trap !== g.trapFirst) errs.push(`trapFirst ${trap} ≠ ${g.trapFirst}`);
  if (trap < T.minTrap) errs.push('R4 no tension');
  // R5, R7, R8, R9
  if (g.moves > 3 * g.pushes + 12) errs.push('R5 walky');
  const interior = g.rows.slice(1, -1).map((x) => x.slice(1, -1)).join('');
  if ([...interior].filter((c) => c === '#').length > 0.3 * interior.replace(/ /g, '').length) errs.push('R7 cluttered');
  if (canonicalHash(g.rows) !== g.hash) errs.push('hash');
  if (fixedHashes.has(g.hash)) errs.push('R8 equals a fixed v1 level');
  if (graph.size > GEN_BUDGET.hintStates) errs.push('R9 hint budget');
  // G4 size (random ≤ 10×9), G9 walking
  if (l.W > 10 || l.H > 9) errs.push(`G4 ${l.W}x${l.H}`);
  return errs;
}

describe('generatePuzzle (T1–T3, v1 without colours)', () => {
  for (const tier of [1, 2, 3] as Tier[]) {
    it(`T${tier} ${TIERS[tier].name}: 20 seeds, deterministic, R rules`, () => {
      let ok = 0;
      for (let i = 0; i < 20; i += 1) {
        const seed = 9000 + 100 * tier + i;
        const a = generatePuzzle(tier, seed, rooms, { colors: false, avoid: fixedHashes });
        const b = generatePuzzle(tier, seed, rooms, { colors: false, avoid: fixedHashes });
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
        if (!a.ok) continue;
        ok += 1;
        expect(checkR(a, tier), `T${tier} seed ${seed}\n${a.rows.join('\n')}`).toEqual([]);
      }
      expect(ok).toBeGreaterThanOrEqual(19);
    }, 120_000);
  }

  it('avoids canonical hashes it is told to avoid (R8)', () => {
    const a = generatePuzzle(1, 4242, rooms, { colors: false });
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    const b = generatePuzzle(1, 4242, rooms, { colors: false, avoid: new Set([a.hash]) });
    expect(b.ok && b.hash).not.toBe(a.hash);
  });

  it.skipIf(!FULL)('T4 (v2) still generates with colours (data format ready)', () => {
    let ok = 0;
    for (let i = 0; i < 4; i += 1) {
      const g = generatePuzzle(4, 4000 + i, rooms, { colors: true });
      if (g.ok) ok += 1;
    }
    expect(ok).toBeGreaterThan(0);
  }, 600_000);
});
