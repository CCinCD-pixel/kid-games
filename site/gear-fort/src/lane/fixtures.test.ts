// V4 — the TS kernel reproduces the prototype bit for bit: 22 design solutions (every flag hash + final hash),
// 22 ghost windows (hash at both window ends) and 8 synthetic scripts (shovel/mark/token/strike/hook/pit/
// checkpoint restore/suspend-resume). Fixtures: content/gear-fort/{dscripts,ghost,synthetic}/ (spec §8.9, §9.1).
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createSim, step, hash, snapshot, restore, resume, type Snapshot } from './sim';
import { levelFor } from '../bots/run';
import type { Action, Level, SimState } from './types';

const C = path.resolve(__dirname, '../../../../content/gear-fort');
const read = <T>(p: string): T => JSON.parse(fs.readFileSync(path.join(C, p), 'utf8')) as T;
const IDS = fs.readdirSync(path.join(C, 'levels')).map((f) => f.replace('.json', '')).sort((a, b) => { const [x1, y1] = a.split('-').map(Number); const [x2, y2] = b.split('-').map(Number); return x1 - x2 || y1 - y2; });
const level = (id: string): Level => read<Level>(`levels/${id}.json`);
type Log = [number, Action[]][];

describe('V4 design solutions (seed 0) replay bit-identically', () => {
  for (const id of IDS) it(id, () => {
    const ds = read<{ loadout: string[]; actions: Log; flagHashes: [number, string][]; finalHash: string }>(`dscripts/${id}.json`);
    const lv = { ...level(id), loadout: ds.loadout };
    const S = createSim(lv, 0); let i = 0; const hs: [number, string][] = [];
    while (!S.result && S.tick < 20 * 60 * 12) {
      const a = i < ds.actions.length && ds.actions[i][0] === S.tick ? ds.actions[i++][1] : null;
      if ((S.flags || []).includes(S.tick)) hs.push([S.tick, hash(S)]);
      step(S, a);
    }
    expect(hs).toEqual(ds.flagHashes);
    expect(hash(S)).toBe(ds.finalHash);
    expect(S.result).toBe('win');
  });
});

describe('V4 ghost windows replay bit-identically', () => {
  for (const id of IDS) it(id, () => {
    const g = read<{ bot: string; seed: number; loadout: string[]; w0: number; w1: number; actions: Log; hashW0: string; hashW1: string | null }>(`ghost/${id}.json`);
    const lv = { ...level(id), loadout: g.loadout };
    const R = createSim(lv, g.seed); let i = 0; let r0: string | null = null, r1: string | null = null;
    while (R.tick <= g.w1 && !R.result) {
      const a = i < g.actions.length && g.actions[i][0] === R.tick ? g.actions[i++][1] : null;
      if (R.tick === g.w0) r0 = hash(R); if (R.tick === g.w1) r1 = hash(R);
      step(R, a);
    }
    expect(r0).toBe(g.hashW0);
    if (g.hashW1 != null) expect(r1).toBe(g.hashW1);
  });
});

describe('V4 synthetic scripts (shovel, mark, token, strike, hook, snapshots)', () => {
  for (const f of fs.readdirSync(path.join(C, 'synthetic'))) it(f, () => {
    const sy = read<{ id: string; seed: number; patch: Partial<Level> | null; actions: [number, (Action | { t: string })[]][]; flagHashes: [number, string][]; finalHash: string; result: string }>(`synthetic/${f}`);
    const lv = { ...levelFor(level(sy.id), 'C', sy.seed), ...(sy.patch || {}) };
    let S: SimState = createSim(lv, sy.seed, { events: true }); let i = 0; let snap: Snapshot | null = null; const hs: [number, string][] = [];
    while (!S.result && S.tick < 20 * 60 * 12) {
      let a: Action[] | null = null;
      while (i < sy.actions.length && sy.actions[i][0] === S.tick) {
        const acts = sy.actions[i][1]; const p = acts[0]?.t;
        if (p === '#snapshot') snap = snapshot(S);
        else if (p === '#restore') S = restore(snap!, lv, { events: true })!;
        else if (p === '#suspend-resume') S = resume(snapshot(S), lv, { events: true })!;
        else a = (a || ([] as Action[])).concat(acts as Action[]);
        i++;
      }
      if ((S.flags || []).includes(S.tick)) hs.push([S.tick, hash(S)]);
      step(S, a);
    }
    expect(hs).toEqual(sy.flagHashes);
    expect(hash(S)).toBe(sy.finalHash);
    expect(S.result).toBe(sy.result);
  });
});
