/**
 * Hint fallback benchmark (spec §9.3; prototype hintbench.mjs). Env-gated:
 *   SOK_FULL=1 npx vitest run site/sokoban/tools/hint-bench.full.test.ts
 *
 * For every shipped push level with ≤ 3 crates (main, cert, classic C1–C9) and every 随机新仓库 fallback-pool
 * order (T1–T3), sample states a child can actually reach — 1..14 random legal pushes from the start, most of
 * them dead (the worst case) — and run the in-game fallback solver on each (A* `solvePushOptimal`, the
 * Worker's budget of 200 000 nodes). Gates: p95 ≤ 15 000 nodes and max ≤ 20 000 per level (≤ 3 crates).
 * C10 (5 crates) has no fallback gate: it is always answered from the pre-solved graph or the reference line.
 * Report: ~/kid-games-work/reports/sokoban/hint-bench.txt (nodes p50/p95/max, ms p95/max, dead samples).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { mulberry32 } from '@engines/puzzle/src/kid';
import { parseLevel } from '@engines/puzzle/src/level';
import { applyPush, canon, legalPushes } from '@engines/puzzle/src/rules';
import { pushDistances, solvePushOptimal } from '@engines/puzzle/src/solver';
import { allPushLevels } from '../src/data';
import pool from '../../../content/sokoban/random-fallback.json';

const BUDGET = { nodes: 200000, ms: 1e9 };
const GATE = { p95: 15000, max: 20000 };

interface Row { id: string; crates: number; p50: number; p95: number; max: number; msP95: number; msMax: number; dead: number; samples: number }

function bench(id: string, map: readonly string[], samples: number): Row {
  const l = parseLevel(map, id);
  const pd = pushDistances(l);
  const rng = mulberry32(99);
  const nodes: number[] = [];
  const ms: number[] = [];
  let dead = 0;
  for (let s = 0; s < samples; s += 1) {
    let player = l.start.player;
    let boxes = canon(l, l.start.boxes);
    const k = 1 + ((rng() * 14) | 0);
    for (let i = 0; i < k; i += 1) {
      const { pushes } = legalPushes(l, { player, boxes });
      if (!pushes.length) break;
      const pu = pushes[(rng() * pushes.length) | 0];
      boxes = applyPush(l, boxes, pu);
      player = pu.from;
    }
    const t = performance.now();
    const r = solvePushOptimal(l, { player, boxes }, BUDGET, pd);
    ms.push(performance.now() - t);
    nodes.push(r.nodes);
    if ('dead' in r) dead += 1;
  }
  nodes.sort((a, b) => a - b);
  ms.sort((a, b) => a - b);
  const q = (arr: number[], p: number) => arr[Math.min(arr.length - 1, Math.floor(p * arr.length))];
  return { id, crates: l.nBoxes, p50: q(nodes, 0.5), p95: q(nodes, 0.95), max: nodes[nodes.length - 1], msP95: +q(ms, 0.95).toFixed(1), msMax: +ms[ms.length - 1].toFixed(1), dead, samples };
}

const fmt = (r: Row) => `${r.id.padEnd(10)} b${r.crates} nodes p50 ${String(r.p50).padStart(6)} p95 ${String(r.p95).padStart(6)} max ${String(r.max).padStart(6)} | ms p95 ${r.msP95} max ${r.msMax} | dead samples ${r.dead}/${r.samples}`;

describe.skipIf(!process.env.SOK_FULL)('hint fallback bench (spec §9.3)', () => {
  it('shipped levels: ≤ 3 crates → p95 ≤ 15 000 and max ≤ 20 000 A* nodes', () => {
    const rows = allPushLevels().filter((L) => L.id !== 'C10').map((L) => bench(L.id, L.map, 150));
    const bad = rows.filter((r) => r.crates <= 3 && (r.p95 > GATE.p95 || r.max > GATE.max));
    const worst = rows.reduce((w, r) => (r.max > w.max ? r : w), rows[0]);
    const pr = (pool as unknown as { levels: { tier: number; seed: number; map: string[] }[] }).levels.map((L) => bench(`T${L.tier}-${L.seed}`, L.map, 40));
    const badPool = pr.filter((r) => r.crates <= 3 && (r.p95 > GATE.p95 || r.max > GATE.max));
    const worstPool = pr.reduce((w, r) => (r.max > w.max ? r : w), pr[0]);
    const dir = path.join(os.homedir(), 'kid-games-work/reports/sokoban');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'hint-bench.txt'), [
      `星港搬运工 — hint fallback bench (spec §9.3), ${new Date().toISOString()}`,
      `A* solvePushOptimal, budget ${BUDGET.nodes} nodes; samples: 1–14 random legal pushes from the start (mulberry32 seed 99)`,
      `gates (≤ 3 crates): p95 ≤ ${GATE.p95}, max ≤ ${GATE.max}; C10 = graph / reference line only`,
      '',
      ...rows.map(fmt),
      `WORST shipped: ${worst.id} max ${worst.max} nodes, ${worst.msMax} ms`,
      '',
      `随机新仓库 fallback pool (${pr.length} orders × 40 samples):`,
      ...pr.map(fmt),
      `WORST pool: ${worstPool.id} max ${worstPool.max} nodes, ${worstPool.msMax} ms`,
      '',
    ].join('\n'));
    console.log(`worst shipped ${worst.id} ${worst.max} nodes; worst pool ${worstPool.id} ${worstPool.max} nodes`);
    expect(bad.map(fmt)).toEqual([]);
    expect(badPool.map(fmt)).toEqual([]);
  }, 300_000);
});
