/**
 * V1b (spec §9.2): the production sim reproduces the prototype's golden event stream bit for bit in Node.
 * Fast tier = the 6 fast cases (moon/blackhole KID timed; c1m4, c3m1, c4m3 KID and c5m7 EXPERT missions).
 * Full tier (SB_FULL=1) = every case in fixtures/golden.json (80 × 3-minute matches + 800 mission attempts).
 * Hash rules (prototype fixtures.mjs): event key = [step, type, ...sorted fields (numbers ×1000 rounded)],
 * chained FNV-1a; state hash every 60 steps over [id, alive, m·1000, x·100, y·100].
 */
import { describe, expect, it } from 'vitest';
import golden from '../../../content/snake-battle/fixtures/golden.json';
import { hashString } from '../src/sim/core';
import { VENUES, runVenueMatch, type VenueId } from '../src/sim/venues';
import { runMission } from '../src/sim/mission';
import type { World, SimEvent } from '../src/sim/world';

const PERS: Record<string, string> = { NOVICE: 'novice', KID: 'kid', EXPERT: 'expert' };
const num = (v: unknown) => (typeof v === 'number' ? Math.round(v * 1000) : v);
const evKey = (e: SimEvent) => {
  const r = e as unknown as Record<string, unknown>;
  return JSON.stringify([Math.round(e.t * 60), e.type, ...Object.keys(r).filter((k) => k !== 't' && k !== 'type').sort().map((k) => [k, num(r[k])])]);
};
const hex = (h: number) => (h >>> 0).toString(16).padStart(8, '0');
export function eventHash(events: SimEvent[]) { let h = 2166136261 >>> 0; for (const e of events) h = hashString(hex(h) + evKey(e)); return hex(h); }
export const stateOf = (w: World) => hex(hashString(JSON.stringify(w.snakes.map((s) => [s.id, s.alive ? 1 : 0, Math.round(s.mass * 1000), Math.round(s.x * 100), Math.round(s.y * 100)]))));

interface Case { mode: string; id: string; model: string; seed: number; steps?: number; eventHash: string; stateHash: string[]; summary: Record<string, number | boolean>; fast: boolean }
const all = golden.cases as unknown as Case[];
const cases = all.filter((c) => c.mode === 'timed' && (c.fast || process.env.SB_FULL));
const mcases = all.filter((c) => c.mode === 'mission' && (c.fast || process.env.SB_FULL));

describe('V1b golden event streams (timed)', () => {
  for (const c of cases) {
    it(`${c.id} ${c.model} seed ${c.seed}`, () => {
      const states: string[] = [];
      const r = runVenueMatch(VENUES[c.id as VenueId], c.model, PERS[c.model], c.seed, { probe: (w) => states.push(stateOf(w)) });
      const st = c.fast ? states : states.slice(-1);
      // first divergence (helps debugging a port mistake)
      const firstBad = st.findIndex((h, i) => h !== c.stateHash[i]);
      expect(firstBad, `state hash diverges at second ${firstBad}`).toBe(-1);
      expect(eventHash(r.world.events)).toBe(c.eventHash);
      expect({ rank: r.rank, kills: r.kills, deaths: r.deaths, peak: Math.round(r.peak) }).toEqual(c.summary);
    }, 120_000);
  }
});

describe('V1b golden event streams (missions)', () => {
  for (const c of mcases) {
    it(`${c.id} ${c.model} seed ${c.seed}`, () => {
      const states: string[] = [];
      const r = runMission(c.id, c.model, PERS[c.model], c.seed, { probe: (w) => states.push(stateOf(w)) });
      const st = c.fast ? states : states.slice(-1);
      const firstBad = st.findIndex((h, i) => h !== c.stateHash[i]);
      expect(firstBad, `state hash diverges at second ${firstBad}`).toBe(-1);
      expect(r.steps).toBe(c.steps);
      expect(eventHash(r.world.events)).toBe(c.eventHash);
      expect({ ok: r.ok, kills: r.kills, deaths: r.deaths, peak: Math.round(r.mass) }).toEqual(c.summary);
    }, 120_000);
  }
});
