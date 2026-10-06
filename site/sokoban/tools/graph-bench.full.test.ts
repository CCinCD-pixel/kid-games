/**
 * Full-graph pre-solve and A* fallback benchmark (spec §9.3, Node). Env-gated:
 *   SOK_FULL=1 npx vitest run site/sokoban/tools/graph-bench.full.test.ts
 * Gates: main ≤ 50 000 states and ≤ 0.8 s; C10 ≤ 200 000 states, ≤ 5 s, ≤ 15 MB retained.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseLevel } from '@engines/puzzle/src/level';
import { StateGraph } from '@engines/puzzle/src/stategraph';
import { solvePushOptimal } from '@engines/puzzle/src/solver';
import { allPushLevels } from '../src/data';

describe.skipIf(!process.env.SOK_FULL)('graph bench (Node)', () => {
  it('builds every shipped level within the gates', () => {
    const rows: string[] = [];
    for (const L of allPushLevels()) {
      const l = parseLevel(L.map);
      const t = performance.now();
      const g = StateGraph.buildSync(l, { maxStates: 200000, maxMs: 1e9 })!;
      const ms = performance.now() - t;
      const t2 = performance.now();
      const a = solvePushOptimal(l, l.start, { nodes: 200000, ms: 1e9 });
      const ms2 = performance.now() - t2;
      rows.push(`${L.id.padEnd(4)} states ${String(g.n).padStart(6)} build ${ms.toFixed(1).padStart(7)} ms  retained ${(g.bytes / 1024).toFixed(0).padStart(6)} KB  A* nodes ${String(a.nodes).padStart(6)} ${ms2.toFixed(1)} ms`);
      if (L.id === 'C10') {
        expect(g.n).toBeLessThanOrEqual(200000);
        expect(ms).toBeLessThan(5000);
        expect(g.bytes).toBeLessThan(15 * 1024 * 1024);
      } else {
        expect(g.n).toBeLessThanOrEqual(50000);
        expect(ms).toBeLessThan(800);
      }
    }
    const dir = path.join(os.homedir(), 'kid-games-work/reports/sokoban');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'graph-bench.txt'), rows.join('\n') + '\n');
    console.log(rows.join('\n'));
  }, 120_000);
});
