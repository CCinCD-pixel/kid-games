// V4b — the TS bots reproduce the prototype bit for bit (spec §8.9, review B2): every level × R/K/K+/Ka/K2/C × seeds
// 0–4 → same result, same action-log hash, same final state hash. Only after this passes may V8 (bands) run.
// Default run: seeds 0–1 (quick). GF_FULL=1: all five seeds (660 games).
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { runParity } from './run';
import type { Level } from '../lane/types';

const C = path.resolve(__dirname, '../../../../content/gear-fort');
const FULL = !!process.env.GF_FULL;
const IDS = fs.readdirSync(path.join(C, 'levels')).map((f) => f.replace('.json', ''));
interface Case { id: string; bot: string; seed: number; loadout: string[]; result: string; ticks: number; actions: number; actHash: string; finalHash: string; logs: number }

describe('V4b bot parity with the prototype', () => {
  for (const id of IDS) {
    const lv = JSON.parse(fs.readFileSync(path.join(C, `levels/${id}.json`), 'utf8')) as Level;
    const cases = (JSON.parse(fs.readFileSync(path.join(C, `parity/${id}.json`), 'utf8')) as { cases: Case[] }).cases.filter((c) => FULL || c.seed < 2);
    it(`${id} (${cases.length} games)`, () => {
      const bad: string[] = [];
      for (const c of cases) {
        const r = runParity(lv, c.bot, c.seed);
        if (r.result !== c.result || r.actHash !== c.actHash || r.finalHash !== c.finalHash || r.ticks !== c.ticks || r.logs !== c.logs || r.actions !== c.actions || JSON.stringify(r.loadout) !== JSON.stringify(c.loadout))
          bad.push(`${c.bot} s${c.seed}: ${r.result}/${c.result} act ${r.actHash}/${c.actHash} final ${r.finalHash}/${c.finalHash} ticks ${r.ticks}/${c.ticks} deck ${r.loadout.join(',')}/${c.loadout.join(',')}`);
      }
      expect(bad).toEqual([]);
    }, 240_000);
  }
});
