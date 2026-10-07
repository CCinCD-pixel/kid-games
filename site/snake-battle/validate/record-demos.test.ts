/**
 * 示范 seeds for H2/H3 (spec §5.1, §8.10, review D3/B1). For every level the 领航员 (EXPERT model + the level's
 * hook) runs on seeds 9001…9040. Only successes that CONTAIN the level's key moment (src/demo-key.ts) qualify;
 * candidates are ordered by distance from the median success time (fast wins tend to be atypical), and the
 * whole ordered list goes to the WebKit pass:
 *
 *   1. SB_DEMOS=1 npx vitest run site/snake-battle/validate/record-demos.test.ts
 *        → ~/kid-games-work/snake-battle/demo-candidates.json (≤ 8 per level, Node results)
 *   2. SB_DEMOS_PICK=1 npx playwright test -c tests/snake-battle/playwright.dev.config.ts demos --project=portrait-810x1080
 *        → replays the candidates in WebKit (the Safari engine: transcendental Math differs from V8, spec §8.1)
 *          and writes content/snake-battle/demos.json with the first candidate whose ok / t / keyT agree within
 *          ±0.2 s in BOTH engines
 *   3. V15: validate/determinism.test.ts (Node) + tests/demos.spec.ts (WebKit) replay all 40.
 *
 * The recorder fails if any level has no candidate with a key moment (every level must have an H2 clip).
 * The page replays a demo live from its seed and, as a guard against drift on other engines, ends the H3
 * demo quietly (→ the twin) if the run fails or overruns the recorded time (app.ts demoTick).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { MISSIONS, MissionRun, type Mission } from '../src/sim/mission';
import { hashString } from '../src/sim/core';
import { runDemo } from '../src/demo-key';

export const contentHash = (m: Mission) => (hashString(JSON.stringify(m)) >>> 0).toString(16).padStart(8, '0');
export const CANDIDATES = path.join(os.homedir(), 'kid-games-work/snake-battle/demo-candidates.json');
export type Candidate = { seed: number; model: 'EXPERT'; t: number; keyT: number; contentHash: string };

describe.skipIf(!process.env.SB_DEMOS)('record 示范 candidates', () => {
  it('candidates per level (key moment present, median-nearest first)', () => {
    const out: Record<string, Candidate[]> = {};
    const misses: string[] = [];
    const only = process.env.SB_DEMOS_ONLY?.split(',');
    for (const m of MISSIONS) {
      if (only && !only.includes(m.id)) continue;
      const wins: Candidate[] = [];
      for (let k = 1; k <= 40; k++) {
        const r = runDemo(m, 9000 + k, MissionRun);
        if (!r.ok || r.keyT === null) continue;
        // the H2 clip is keyT−4 … keyT+2: the key moment must leave room for the lead-in and fall inside the run
        if (r.keyT > r.t + 0.05) continue;
        wins.push({ seed: 9000 + k, model: 'EXPERT', t: r.t, keyT: r.keyT, contentHash: contentHash(m) });
      }
      if (!wins.length) { misses.push(m.id); continue; }
      const ts = wins.map((w) => w.t).sort((a, b) => a - b), med = ts[Math.floor(ts.length / 2)];
      // a key moment ≥ 3 s in leaves room for the clip's lead-in (keyT−4); then nearest the median
      wins.sort((a, b) => Number(a.keyT < 3) - Number(b.keyT < 3) || Math.abs(a.t - med) - Math.abs(b.t - med) || a.seed - b.seed);
      out[m.id] = wins.slice(0, Number(process.env.SB_DEMOS_KEEP ?? 8));
      console.log(`${m.id}: ${wins.length} qualifying wins, median ${med}s → ${out[m.id].map((c) => `${c.seed}(${c.t}/${c.keyT})`).join(' ')}`);
    }
    fs.mkdirSync(path.dirname(CANDIDATES), { recursive: true });
    const prev = only && fs.existsSync(CANDIDATES) ? JSON.parse(fs.readFileSync(CANDIDATES, 'utf8')) : {};
    fs.writeFileSync(CANDIDATES, JSON.stringify({ ...prev, ...out }, null, 1));
    expect(misses, `no EXPERT success with a key moment in 40 seeds: ${misses.join(', ')}`).toEqual([]);
  }, 3600_000);
});
