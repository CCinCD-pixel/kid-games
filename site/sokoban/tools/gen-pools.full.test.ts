/**
 * 随机新仓库 offline tools (spec §4.8, §8.10), run with the SAME TypeScript generator the Worker uses:
 *
 *   SOK_GEN=1 npx vitest run site/sokoban/tools/gen-pools.full.test.ts
 *     → content/sokoban/random-fallback.json: 40 levels per tier T1–T3 (seeds 5000… / 6000… / 7000…,
 *       a seed that yields nothing is replaced by the next one), every level re-checked against
 *       G1–G9 + R0–R10 with the exact solver (the stored `opt`/`ref` are push- then move-optimal).
 *   SOK_FULL=1 (or SOK_GEN=1) … → ~/kid-games-work/reports/sokoban/random-v1.txt: 60 seeds per tier
 *       (1000·tier + i, the prototype's random-v1.mjs seeds): success rate, generation time
 *       p50/p95/max, candidates, push range, lesson mix, rejections.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { detectDeadlock } from '@engines/puzzle/src/deadlock';
import { GEN_BUDGET, TIERS, generatePuzzle, type GeneratedLevel, type Tier } from '@engines/puzzle/src/generator';
import { canonicalHash, parseLevel } from '@engines/puzzle/src/level';
import { greedy, sequential } from '@engines/puzzle/src/plan';
import { canon, replayLurd } from '@engines/puzzle/src/rules';
import { solveOptimal } from '@engines/puzzle/src/solver';
import { StateGraph } from '@engines/puzzle/src/stategraph';
import { allPushLevels, type PoolLevel } from '../src/data';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
const rooms = (JSON.parse(fs.readFileSync(path.join(ROOT, 'content/sokoban/rooms.json'), 'utf8')) as { rooms: Record<string, string[]> }).rooms;
const fixed = new Set(allPushLevels().map((l) => canonicalHash(l.map)));
const REPORTS = path.join(os.homedir(), 'kid-games-work/reports/sokoban');

/** G1–G9 + R rules on a stored pool level (exact solver for G3). */
export function checkPoolLevel(p: PoolLevel): string[] {
  const T = TIERS[p.tier];
  const errs: string[] = [];
  let l;
  try {
    l = parseLevel(p.map);
  } catch (e) {
    return [`G1 ${(e as Error).message}`];
  }
  const g = StateGraph.buildSync(l, { maxStates: GEN_BUDGET.forwardStates, maxMs: Number.POSITIVE_INFINITY, keepEdges: true });
  if (!g || g.startTogo < 0) return ['G2 unsolvable'];
  const exact = solveOptimal(l, 'push', { maxStates: 600000 });
  if (!exact || exact.pushes !== g.startTogo) errs.push('G3 exact optimum');
  else if (exact.pushes !== p.opt.pushes || exact.moves !== p.opt.moves) errs.push(`G3 opt ${p.opt.pushes}/${p.opt.moves} ≠ ${exact.pushes}/${exact.moves}`);
  const rp = replayLurd(l, p.ref);
  if (!(rp.ok && rp.solved && rp.pushes === p.opt.pushes && rp.moves === p.opt.moves)) errs.push('G3 ref replay');
  if (l.W > 10 || l.H > 9) errs.push(`G4 ${l.W}x${l.H}`);
  let falsePos = 0;
  for (let i = 0; i < g.size; i += 1) if (detectDeadlock(l, g.stateAt(i).boxes) && g.togoAt(i) >= 0) falsePos += 1;
  if (falsePos) errs.push(`G6 ${falsePos}`);
  if (detectDeadlock(l, canon(l, l.start.boxes))) errs.push('G8/R2 dead at start');
  for (const b of l.start.boxes) if (l.goal[b] >= 0) errs.push('G8 crate on a pad');
  if (l.goal[l.start.player] >= 0) errs.push('G8 robot on a pad');
  if (p.opt.moves > 3 * p.opt.pushes + 14) errs.push('G9 walking');
  if (p.opt.pushes < T.push[0] || p.opt.pushes > T.push[1]) errs.push('R1 range');
  const sq = sequential(l, { maxStates: GEN_BUDGET.sequentialStates });
  if (T.needInsight && greedy(l, null) === 'solved' && sq.firsts.length !== 1 && sq.firsts.length > 0) errs.push('R3');
  const trap = Array.from(g.successors(g.startIndex)).filter((j) => g.togoAt(j) < 0).length;
  if (trap < T.minTrap) errs.push('R4');
  const interior = p.map.slice(1, -1).map((x) => x.slice(1, -1)).join('');
  if ([...interior].filter((c) => c === '#').length > 0.3 * interior.replace(/ /g, '').length) errs.push('R7');
  if (canonicalHash(p.map) !== p.hash) errs.push('hash');
  if (fixed.has(p.hash)) errs.push('R8 fixed level');
  if (g.size > GEN_BUDGET.hintStates) errs.push('R9');
  if (l.colored) errs.push('v1 colour');
  return errs;
}

const q = (a: number[], p: number) => {
  const s = a.slice().sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};

describe.skipIf(!process.env.SOK_GEN && !process.env.SOK_FULL)('random generator statistics (60 seeds per tier)', () => {
  it('T1–T3 succeed, within budget, with the lesson mix', () => {
    const out: string[] = [`星港搬运工 — 随机新仓库 generator statistics (TS engine, Node), ${new Date().toISOString()}`, ''];
    for (const tier of [1, 2, 3] as Tier[]) {
      const ms: number[] = [];
      const tries: number[] = [];
      const push: number[] = [];
      const lessons: Record<string, number> = {};
      const rej: Record<string, number> = {};
      let ok = 0;
      for (let i = 0; i < 60; i += 1) {
        const t0 = performance.now();
        const r = generatePuzzle(tier, 1000 * tier + i, rooms, { colors: false, avoid: fixed });
        ms.push(performance.now() - t0);
        tries.push(r.stats.tries);
        for (const [k, v] of Object.entries(r.stats.rej)) rej[k] = (rej[k] ?? 0) + v;
        if (r.ok) {
          ok += 1;
          push.push(r.pushes);
          lessons[r.lesson] = (lessons[r.lesson] ?? 0) + 1;
        }
      }
      out.push(`T${tier} ${TIERS[tier].name}: ok ${ok}/60  ms p50 ${q(ms, 0.5).toFixed(0)} p95 ${q(ms, 0.95).toFixed(0)} max ${Math.max(...ms).toFixed(0)}  candidates p50 ${q(tries, 0.5)} max ${Math.max(...tries)}  pushes ${Math.min(...push)}..${Math.max(...push)} median ${q(push, 0.5)}  lessons ${JSON.stringify(lessons)}`);
      out.push(`   rejections ${JSON.stringify(rej)}`);
      expect(ok).toBeGreaterThanOrEqual(58);
    }
    fs.mkdirSync(REPORTS, { recursive: true });
    fs.writeFileSync(path.join(REPORTS, 'random-v1.txt'), out.join('\n') + '\n');
    console.log(out.join('\n'));
  }, 600_000);
});

describe.skipIf(!process.env.SOK_GEN)('fallback pool (writes content/sokoban/random-fallback.json)', () => {
  it('40 levels per tier, every one passing G1–G9 + R', () => {
    const levels: PoolLevel[] = [];
    const seen = new Set<number>(fixed);
    for (const tier of [1, 2, 3] as Tier[]) {
      let seed = 4000 + 1000 * tier;
      let n = 0;
      while (n < 40) {
        const g = generatePuzzle(tier, seed, rooms, { colors: false, avoid: seen }) as GeneratedLevel;
        seed += 1;
        if (!g.ok) continue;
        const l = parseLevel(g.rows);
        const exact = solveOptimal(l, 'push', { maxStates: 600000 })!;
        const p: PoolLevel = { tier, seed: g.seed, map: g.rows, opt: { pushes: exact.pushes, moves: exact.moves }, ref: exact.lurd, lesson: g.lesson, hash: g.hash };
        expect(checkPoolLevel(p), `T${tier} seed ${g.seed}`).toEqual([]);
        seen.add(g.hash);
        levels.push(p);
        n += 1;
      }
    }
    const body = { version: 1, generatedBy: 'site/sokoban/tools/gen-pools.full.test.ts (SOK_GEN=1) — engines/puzzle/src/generator.ts, colours off (v1)', levels };
    fs.writeFileSync(path.join(ROOT, 'content/sokoban/random-fallback.json'), JSON.stringify(body) + '\n');
    expect(levels.length).toBe(120);
  }, 900_000);
});

describe.skipIf(!process.env.SOK_FULL)('shipped fallback pool (read-only, spec §9.1 R)', () => {
  it('content/sokoban/random-fallback.json: 40 per tier, distinct, every order passes G1–G9 + R', () => {
    const pool = (JSON.parse(fs.readFileSync(path.join(ROOT, 'content/sokoban/random-fallback.json'), 'utf8')) as { levels: PoolLevel[] }).levels;
    const bad: string[] = [];
    for (const p of pool) {
      const errs = checkPoolLevel(p);
      if (errs.length) bad.push(`T${p.tier} seed ${p.seed}: ${errs.join('; ')}`);
    }
    for (const tier of [1, 2, 3]) expect(pool.filter((p) => p.tier === tier).length, `T${tier}`).toBe(40);
    expect(new Set(pool.map((p) => p.hash)).size).toBe(pool.length);
    fs.mkdirSync(REPORTS, { recursive: true });
    fs.writeFileSync(path.join(REPORTS, 'random-pool-check.txt'), `星港搬运工 — shipped 随机新仓库 fallback pool, ${new Date().toISOString()}\n${pool.length} orders, ${bad.length} failing\n${bad.join('\n')}\n`);
    expect(bad).toEqual([]);
  }, 600_000);
});
