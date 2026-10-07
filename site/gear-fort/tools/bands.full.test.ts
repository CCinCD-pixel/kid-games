// V8 (volume 1 core) — acceptance bands re-run on the REAL TS kernel and bots (GF_FULL=1; ~3–5 min).
// Seeds 1..200 for R/K/K2/C/Ka/Kb and the K+ campaign chain (seeds 1..120) exactly as the prototype ran them, so every
// number must equal out/v1/report.json (tools/ref-report-v1.json) AND sit inside the bands of content/gear-fort/bands.json.
// Report → ~/kid-games-work/reports/gear-fort/bands-v1.txt
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { batch, chain, pct, star3, facts, type Tally } from '../src/bots/evaluate';
import type { Level } from '../src/lane/types';

const VOL = +(process.env.GF_VOL || 1);
// volume 2 is judged on K2h + the wide K band (tools/bands-v2.ts) by bands.rest.test.ts — never by the volume-1 rules here
if (process.env.GF_FULL && VOL !== 1) console.warn('[bands.full] GF_VOL=2: run GF_FULL=1 GF_VOL=2 bands.rest.test.ts instead — this file judges volume 1 only');
const FULL = !!process.env.GF_FULL && VOL === 1;
const C = path.resolve(__dirname, '../../../content/gear-fort');
const REF = JSON.parse(fs.readFileSync(path.join(__dirname, 'ref-report-v1.json'), 'utf8')) as Record<string, Record<string, number | number[] | string | string[]>>;
const BANDS = JSON.parse(fs.readFileSync(path.join(C, 'bands.json'), 'utf8')) as { TYPE: Record<string, Record<string, number | number[]>>; OVERRIDE: Record<string, Record<string, unknown>>; GLOBAL: Record<string, unknown> };
const CAMPAIGN = JSON.parse(fs.readFileSync(path.join(C, 'campaign.json'), 'utf8')) as { volumes: { levels: string[] }[] };
const ids = CAMPAIGN.volumes[VOL - 1].levels;
const lvOf = (id: string): Level => JSON.parse(fs.readFileSync(path.join(C, `levels/${id}.json`), 'utf8')) as Level;

describe.runIf(FULL)(`V8 volume ${VOL} bands on the TS kernel`, () => {
  it('every level: exact prototype numbers and inside the bands', () => {
    const N = 200; const lines: string[] = []; const fails: string[] = [];
    const chainT = chain(CAMPAIGN.volumes.slice(0, VOL).flatMap((v) => v.levels).map(lvOf), 120);
    const G = BANDS.GLOBAL as { Ka: number; KaBoss: number; Kb: number; steadyK2: number; star3K2: number[]; factsOk: number };
    for (const id of ids) {
      const lv = lvOf(id); const type = lv.type!; const B = { ...BANDS.TYPE[type], ...(BANDS.OVERRIDE[id] || {}) } as Record<string, number & number[]>;
      const t: Record<string, Tally> = {}; for (const b of ['R', 'K', 'K2', 'C', 'Ka', 'Kb']) t[b] = batch(lv, b, N);
      const kp = chainT[id];
      const r = { R: pct(t.R), K: pct(t.K), 'K+': pct(kp), K2: pct(t.K2), C: pct(t.C), Ka: pct(t.Ka), Kb: pct(t.Kb), steadyK2: pct(t.K2, 'steady'), star3K2: star3(t.K2), twoKp: pct(kp, 'two'), factsOk: facts(t.K) };
      const ref = REF[id];
      for (const [k, v] of Object.entries(r)) if (ref[k] !== v) fails.push(`${id} ${k}: TS ${v} ≠ proto ${String(ref[k])}`);
      const f: string[] = [];
      const inB = (name: string, val: number, b?: number[]): void => { if (b && (val < b[0] || val > b[1])) f.push(`${name}=${val}∉[${b[0]},${b[1]}]`); };
      inB('R', r.R, B.R); inB('K', r.K, B.K);
      if (r['K+'] < Math.max(B.kpMin, Math.min(r.K - 10, 100))) f.push(`K+=${r['K+']}`);
      if (r.C < B.C) f.push(`C=${r.C}<${B.C}`);
      if (B.K2 && r.K2 < B.K2) f.push(`K2=${r.K2}<${B.K2}`);
      if (type !== 'tutorial') {
        if (r.Ka < (type === 'boss' ? G.KaBoss : G.Ka)) f.push(`Ka=${r.Ka}`); if (r.Kb < G.Kb) f.push(`Kb=${r.Kb}`);
        if (r.steadyK2 < G.steadyK2) f.push(`K2稳=${r.steadyK2}`);
        inB('K2-3★', r.star3K2, (B.star3K2 as unknown as number[]) || G.star3K2);
        if (B.two && r.twoKp < B.two) f.push(`K+2★=${r.twoKp}<${B.two}`);
      }
      if (r.factsOk < G.factsOk) f.push(`facts=${r.factsOk}`);
      const timeouts = Object.values(t).reduce((a, x) => a + x.timeouts, 0); if (timeouts) f.push(`timeouts=${timeouts}`);
      lines.push(`${id.padEnd(5)} ${type.padEnd(9)} ${Object.entries(r).map(([k, v]) => `${k} ${v}`).join(' · ')}  ${f.length ? 'FAIL ' + f.join(' ') : 'in band'}`);
      fails.push(...f.map((x) => `${id} ${x}`));
    }
    const out = path.join(os.homedir(), 'kid-games-work/reports/gear-fort'); fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, `bands-v${VOL}.txt`), `V8 volume ${VOL} (TS kernel + TS bots, N=200, K+ chain 120) — ${new Date().toISOString()}\n` + lines.join('\n') + '\n' + (fails.length ? 'FAILS:\n' + fails.join('\n') : 'ALL IN BAND, ALL EQUAL TO THE PROTOTYPE') + '\n');
    expect(fails).toEqual([]);
  }, 900_000);
});
