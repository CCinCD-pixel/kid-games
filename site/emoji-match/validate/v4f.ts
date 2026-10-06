/**
 * V4f — fast difficulty tier (spec §9.1/§9.2), shared by levels.ep1..4.test.ts: every v1 level's K bot
 * (60 games, seeds 1000+) stays within its role band ± 0.12 at the shipped move limit, and H/B levels
 * stay winnable for the lookahead bot L (20 games, ≥ 0.60); teaching moves still do what they teach.
 *
 * Real engine: the simulator (tools/emoji-match/sim/simulate.ts → site/emoji-match/src/core) is
 * bundled from the current sources with the repo's rolldown at test time and imported as one module —
 * vitest's per-module import accessors make the bot loops ~4× slower than native, which would blow
 * the per-file budget. Full tier: `node tools/emoji-match/tune.mjs` (≈1 min, 4 workers).
 */
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { levelsOf } from '../src/content';
import { bandOf, FAST, rate } from '../../../tools/emoji-match/sim/difficulty';
import type * as Simulate from '../../../tools/emoji-match/sim/simulate';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

async function bundledSimulator(dir: string): Promise<typeof Simulate> {
  const { rolldown } = await import('rolldown');
  const b = await rolldown({
    input: path.join(ROOT, 'tools/emoji-match/sim/simulate.ts'),
    platform: 'node',
    resolve: { alias: { '@kit': path.join(ROOT, 'kit') } },
    logLevel: 'silent',
  });
  await b.write({ dir, format: 'esm', entryFileNames: 'simulate.mjs' });
  await b.close();
  return (await import(/* @vite-ignore */ pathToFileURL(path.join(dir, 'simulate.mjs')).href)) as typeof Simulate;
}

/** per-file budget: 12 s in the spec (prototype machine); measured here ≈ 2–4 s per episode */
export const V4F_BUDGET_MS = 12000;

export function v4fEpisode(ep: number): void {
  let sim: typeof Simulate;
  let dir = '';
  let t0 = 0;
  beforeAll(async () => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'em-v4f-'));
    sim = await bundledSimulator(dir);
    t0 = performance.now();
  }, 30000);
  afterAll(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });
  it.each(levelsOf(ep).map((d) => [d.id, d] as const))('%s', (_id, d) => {
    const hb = d.role === 'H' || d.role === 'B';
    const s = sim.simulateLevel(d, { bots: hb ? { K: FAST.K, L: FAST.L } : { K: FAST.K }, heldOut: false });
    const [lo, hi] = bandOf(d);
    const K = rate(s.need.K, d.moves);
    expect(K, `${d.id} K60 ${K.toFixed(2)} vs [${lo}, ${hi}] ± ${FAST.tolK}`).toBeGreaterThanOrEqual(lo - FAST.tolK);
    expect(K, `${d.id} K60 ${K.toFixed(2)} vs [${lo}, ${hi}] ± ${FAST.tolK}`).toBeLessThanOrEqual(hi + FAST.tolK);
    if (hb) expect(rate(s.need.L, d.moves), `${d.id} L20`).toBeGreaterThanOrEqual(FAST.minL);
    if (s.lesson) expect(s.lesson.ok, `${d.id} lesson`).toBe(true);
  }, 20000);
  it(`episode ${ep} stays within the ${V4F_BUDGET_MS / 1000} s budget`, () => { expect(performance.now() - t0).toBeLessThan(V4F_BUDGET_MS); });
}
