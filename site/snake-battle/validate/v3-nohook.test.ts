/**
 * V3-baseline (spec §9.1–9.2): KID without the per-level `hook` on every tactics level (chapters 3–4 + c5m1/c5m3/
 * c5m6/c5m7), 200 runs each on V3's seeds — report only: how much the "kid who understood the goal" hook adds.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { FULL, N_OVERRIDE, writeReport, P } from './bots';
import { runMission } from '../src/sim/mission';

const TACTIC = ['c3m1', 'c3m2', 'c3m3', 'c3m4', 'c3m6', 'c3m7', 'c4m2', 'c4m3', 'c4m4', 'c4m5', 'c4m7', 'c5m1', 'c5m3', 'c5m6', 'c5m7'];
describe.skipIf(!FULL)('V3-baseline (no hook)', () => {
  it('reports KID success with → without the hook', () => {
    const N = N_OVERRIDE || 200; const t0 = Date.now();
    const v3file = path.join(os.homedir(), 'kid-games-work', 'snake-battle', 'validate-v3-missions.json');
    const withHook = fs.existsSync(v3file) ? (JSON.parse(fs.readFileSync(v3file, 'utf8')).table ?? {}) : {};
    const rows: Record<string, number> = {}; const lines: string[] = [];
    for (const id of TACTIC) {
      let ok = 0; for (let i = 0; i < N; i++) if (runMission(id, 'KID', 'kid', 5300 + i, { noHook: true }).ok) ok++;
      rows[id] = ok / N; lines.push(`${id} KID ${withHook[id] ? P(withHook[id].K) : '?'} → ${P(ok / N)} without hook`);
    }
    writeReport('v3-nohook', { N, sec: Math.round((Date.now() - t0) / 1000), rows, lines });
    expect(Object.keys(rows).length).toBe(TACTIC.length);
  }, 6 * 3600_000);
});
