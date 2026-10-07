/**
 * V15 in Node (spec §8.10/§9.2): every 示范 in demos.json replays with ok = true, the recorded finish time and the
 * key moment within ±0.2 s, for the current content (contentHash). Every level has a key moment (= an H2 clip).
 * The WebKit half is tests/demos.spec.ts. Full tier (≈ 40 mission runs): SB_FULL=1.
 */
import { describe, expect, it } from 'vitest';
import demosJson from '../../../content/snake-battle/demos.json';
import { MISSIONS, MissionRun, MISSION_BY_ID } from '../src/sim/mission';
import { runDemo } from '../src/demo-key';
import { contentHash } from './record-demos.test';

type Rec = { seed: number; t: number; keyT: number | null; contentHash: string };
const DEMOS = (demosJson as unknown as { demos: Record<string, Rec> }).demos;

describe('V15 demos (fast)', () => {
  it('one demo per level, each with a key moment inside the run and the current content hash', () => {
    expect(Object.keys(DEMOS).sort()).toEqual(MISSIONS.map((m) => m.id).sort());
    for (const m of MISSIONS) {
      const d = DEMOS[m.id];
      expect(d.keyT, `${m.id} has no key moment → no H2 clip`).not.toBeNull();
      expect(d.keyT!, m.id).toBeLessThanOrEqual(d.t + 0.05);
      expect(d.contentHash, `${m.id} content changed since the demo was recorded — re-record (record-demos.test.ts)`).toBe(contentHash(m));
    }
  });
  it.each(['c1m1', 'c2m1', 'c5m2'])('%s replays exactly', (id) => {
    const d = DEMOS[id], r = runDemo(MISSION_BY_ID[id], d.seed, MissionRun);
    expect(r.ok).toBe(true);
    expect(Math.abs(r.t - d.t)).toBeLessThanOrEqual(0.2);
    expect(Math.abs(r.keyT! - d.keyT!)).toBeLessThanOrEqual(0.2);
  });
});

describe.skipIf(!process.env.SB_FULL)('V15 demos (full, Node)', () => {
  it('all 40 replay: ok, t and keyT within ±0.2 s', () => {
    const bad: string[] = [];
    for (const m of MISSIONS) {
      const d = DEMOS[m.id], r = runDemo(m, d.seed, MissionRun);
      if (!r.ok || Math.abs(r.t - d.t) > 0.2 || r.keyT === null || Math.abs(r.keyT - d.keyT!) > 0.2) bad.push(`${m.id}: ${JSON.stringify(r)} vs ${d.t}/${d.keyT}`);
    }
    expect(bad).toEqual([]);
  }, 1800_000);
});
