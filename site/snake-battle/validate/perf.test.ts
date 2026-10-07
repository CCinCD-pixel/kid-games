/**
 * V11 Node step time (spec §8.5, §8.11): production vs the prototype in the same process on the same seeds — the
 * busiest venue (黑洞场, 22 snakes) and the 25-snake stress roster, 3 × 3-minute matches each, steps after the first
 * 10 s. Relative gates (machine-independent): p95 / p99 ≤ 1.15 × prototype, p99.9 ≤ 1.3 ×, spikes (> 4 ms) ≤
 * max(3, 1.5 × prototype); the max step is reported only. Judged with SB_PERF=1 and a 1-minute load average < 2;
 * otherwise the numbers are only written to the report (a loaded machine says nothing about the code).
 */
import fs from 'node:fs';
import os from 'node:os';
import { describe, expect, it } from 'vitest';
import { writeReport } from './bots';
import { World } from '../src/sim/world';
import { Brain } from '../src/sim/brain';
import { createRng } from '../src/sim/core';
import { VENUES, venueWorldCfg } from '../src/sim/venues';

const PROTO = `${os.homedir()}/kid-games-work/specs/snake-battle-tools`;
type Impl = { World: any; Brain: any; createRng: any; VENUES: any; venueWorldCfg: any };
function stepTimes(I: Impl, vid: string) {
  const base = I.VENUES.blackhole;
  const v = vid === 'stress25' ? { ...base, ai: { ...base.ai, hunter: base.ai.hunter + 1, forager: base.ai.forager + 1, daredevil: base.ai.daredevil + 1 } } : base;
  const ts: number[] = [];
  for (let seed = 1; seed <= 3; seed++) {
    const w = new I.World(I.venueWorldCfg(v), 8100 + seed); const rng = I.createRng(`st${seed}`); let i = 0;
    for (const [p, c] of Object.entries(v.ai) as [string, number][]) for (let k = 0; k < c; k++) { const s = w.addSnake({ persona: p, tier: v.tier, respawn: { delay: 3, keep: 0.25, min: 10 } }, 20); s.brain = new I.Brain({ tier: v.tier, persona: p, rng: rng.fork('a' + i++) }); }
    w.rebuildHash();
    const me = w.addSnake({ persona: 'kid', tier: 'KID', isPlayer: true, respawn: { delay: 3, keep: 0.25, min: 10 } }, 20); me.brain = new I.Brain({ tier: 'KID', persona: 'kid', rng: rng.fork('me') });
    for (let t = 0; t < 180 * 60; t++) { const t0 = performance.now(); w.step(); if (t > 600) ts.push(performance.now() - t0); }
  }
  ts.sort((a, b) => a - b); const q = (p: number) => ts[Math.floor(p * (ts.length - 1))];
  return { p95: q(0.95), p99: q(0.99), p999: q(0.999), max: ts[ts.length - 1], spikes: ts.filter((x) => x > 4).length };
}

describe.skipIf(!(process.env.SB_PERF === '1' || process.env.SB_FULL) || !fs.existsSync(`${PROTO}/world.mjs`))('V11 Node step time vs the prototype', () => {
  it('production is no slower than the prototype', async () => {
    const proto: Impl = { ...(await import(/* @vite-ignore */ `${PROTO}/world.mjs`)), ...(await import(/* @vite-ignore */ `${PROTO}/brain.mjs`)), ...(await import(/* @vite-ignore */ `${PROTO}/core.mjs`)), ...(await import(/* @vite-ignore */ `${PROTO}/venues.mjs`)) };
    const prod: Impl = { World, Brain, createRng, VENUES, venueWorldCfg };
    const load = os.loadavg()[0], judge = process.env.SB_PERF === '1' && load < 2;
    const rows: Record<string, unknown> = {}; const bad: string[] = [];
    for (const vid of ['blackhole', 'stress25']) {
      const a = stepTimes(proto, vid), b = stepTimes(prod, vid);   // prototype first, then production (spec §8.11)
      rows[vid] = { proto: a, prod: b };
      if (b.p95 > 1.15 * a.p95 + 0.002) bad.push(`${vid} p95 ${b.p95.toFixed(3)} > 1.15 × ${a.p95.toFixed(3)}`);
      if (b.p99 > 1.15 * a.p99 + 0.002) bad.push(`${vid} p99 ${b.p99.toFixed(3)} > 1.15 × ${a.p99.toFixed(3)}`);
      if (b.p999 > 1.3 * a.p999 + 0.002) bad.push(`${vid} p99.9 ${b.p999.toFixed(3)} > 1.3 × ${a.p999.toFixed(3)}`);
      if (b.spikes > Math.max(3, 1.5 * a.spikes)) bad.push(`${vid} spikes ${b.spikes} > max(3, 1.5 × ${a.spikes})`);
    }
    writeReport('v11-steptime', { load, judged: judge, machine: `${os.cpus()[0].model} × ${os.cpus().length}`, rows, bad });
    if (judge) expect(bad, bad.join('\n')).toEqual([]);
  }, 1800_000);
});
