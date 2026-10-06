/**
 * Shared helpers for the full-tier statistical validators (spec §9.1–9.2): Wilson intervals, the V16
 * AI-against-AI ladder / persona matches (port of the prototype `ladder.mjs`), and the report writer.
 * Everything runs the real sim (`src/sim/**`) on the real content (GAME_AUTHORING §8: no copies).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { World } from '../src/sim/world';
import { Brain } from '../src/sim/brain';
import { createRng, type Rng } from '../src/sim/core';
import { VENUES, venueWorldCfg, MATCH_SEC, type VenueId } from '../src/sim/venues';

export const FULL = !!process.env.SB_FULL;
/** sample size override for a quicker smoke run of the statistical tier: SB_N=40 */
export const N_OVERRIDE = process.env.SB_N ? Number(process.env.SB_N) : 0;
export const wilson = (k: number, n: number, z = 1.96): [number, number] => {
  if (!n) return [0, 1];
  const p = k / n, d = 1 + (z * z) / n, c = p + (z * z) / (2 * n), h = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [(c - h) / d, (c + h) / d];
};
export const P = (x: number) => `${(100 * x).toFixed(0)}%`;
/** fail only when the whole interval lies outside the band (spec §9.1) */
export const ciInBand = (ci: [number, number], [lo, hi]: [number, number]) => !(ci[1] < lo - 1e-9 || ci[0] > hi + 1e-9);

export function writeReport(name: string, data: unknown) {
  const dir = path.join(os.homedir(), 'kid-games-work', 'snake-battle');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `validate-${name}.json`), JSON.stringify(data, null, 1));
}

// ---------------------------------------------------------------- V16 (prototype ladder.mjs)
const RESPAWN = { delay: 3, keep: 0.25, min: 10 };
const shuffle = <T>(rng: Rng, xs: T[]) => { for (let i = xs.length - 1; i > 0; i--) { const j = rng.int(0, i); [xs[i], xs[j]] = [xs[j], xs[i]]; } return xs; };
export const LADDER = { R: 2150, tiers: ['T1', 'T2', 'T3', 'T4'], personas: ['forager', 'hunter', 'scavenger', 'daredevil'] };
export interface LadderRow { tier: string; persona: string; kills: number; deaths: number; peak: number; finalPct: number; avgPct: number; cut: number; enc: number; headon: number; boostSec: number; eaten: number; drops: number; meteors: number; pu: number; decisions: number; modes: Record<string, number> }

function play(w: World, sec: number): LadderRow[] {
  const ticks = Math.round(sec * 60);
  const standing = new Map(w.snakes.map((s) => [s.id, 0])); let samples = 0;
  for (let i = 0; i < ticks; i++) {
    w.step();
    if (i % 600 === 599) { const r = w.ranking(); const n = r.length - 1; r.forEach((x, k) => standing.set(x.s.id, standing.get(x.s.id)! + k / n)); samples++; }
  }
  const fin = w.ranking(); const n = fin.length - 1;
  const finalPct = new Map(fin.map((x, k) => [x.s.id, k / n]));
  return w.snakes.map((s) => {
    const st = s.stats; const tags = st.killTags.map((k) => k.tag); const b = s.brain as Brain;
    return {
      tier: s.tier, persona: s.persona, kills: st.kills, deaths: st.deaths, peak: Math.round(st.peak), finalPct: finalPct.get(s.id)!, avgPct: standing.get(s.id)! / Math.max(1, samples),
      cut: tags.filter((t) => t === 'cut').length, enc: tags.filter((t) => t === 'encircle').length, headon: tags.filter((t) => t === 'headon').length,
      boostSec: st.boostTime, eaten: st.eaten, drops: st.eatenByKind.drop ?? 0, meteors: st.eatenByKind.meteor ?? 0, pu: st.pu ?? 0,
      decisions: b.trace.decisions, modes: { ...b.trace.modes },
    };
  });
}
export function runLadderMatch(seed: number) {
  const w = new World(venueWorldCfg({ R: LADDER.R, tier: 'T2' }), 9100 + seed);
  const rng = createRng(`ladder:${seed}`);
  const roster: { tier: string; persona: string }[] = [];
  for (const tier of LADDER.tiers) for (const persona of LADDER.personas) roster.push({ tier, persona });
  shuffle(rng, roster);
  roster.forEach(({ tier, persona }, i) => { const s = w.addSnake({ persona, tier, respawn: RESPAWN }, 20); s.brain = new Brain({ tier, persona, rng: rng.fork(`b${i}`) }); w.rebuildHash(); });
  return play(w, MATCH_SEC);
}
export function runPersonaMatch(venueId: VenueId, seed: number) {
  const v = VENUES[venueId];
  const w = new World(venueWorldCfg(v), 9300 + seed);
  const rng = createRng(`persona:${venueId}:${seed}`);
  const roster: string[] = [];
  for (const [persona, n] of Object.entries(v.ai)) for (let k = 0; k < n; k++) roster.push(persona);
  shuffle(rng, roster);
  roster.forEach((persona, i) => { const s = w.addSnake({ persona, tier: v.tier, respawn: RESPAWN }, v.startMass); s.brain = new Brain({ tier: v.tier, persona, rng: rng.fork(`b${i}`) }); w.rebuildHash(); });
  return play(w, MATCH_SEC);
}
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
export function aggLadder(rows: LadderRow[]) {
  const kills = sum(rows.map((r) => r.kills)), deaths = sum(rows.map((r) => r.deaths));
  return {
    n: rows.length, kills: kills / rows.length, deaths: deaths / rows.length, kd: kills / Math.max(1, deaths),
    avgPct: mean(rows.map((r) => r.avgPct)), peak: mean(rows.map((r) => r.peak)),
    cutShare: sum(rows.map((r) => r.cut)) / Math.max(1, kills), boostSec: mean(rows.map((r) => r.boostSec)),
    dropShare: sum(rows.map((r) => r.drops)) / Math.max(1, sum(rows.map((r) => r.eaten))),
    modes: Object.fromEntries(['hunt', 'coil', 'flee', 'defend', 'scav', 'meteor', 'pu', 'forage', 'wander'].map((m) => [m, sum(rows.map((r) => r.modes[m] ?? 0)) / Math.max(1, sum(rows.map((r) => r.decisions)))])) as Record<string, number>,
  };
}
