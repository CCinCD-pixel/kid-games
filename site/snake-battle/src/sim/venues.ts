/**
 * 限时赛 / 无尽 venues (spec §4.1–4.3), 赛场热度 roster lever (§3.17), roster names/colours (§4.2) and the
 * timed-match world setup shared by the page and the validators (port of the prototype `venues.mjs`).
 */
import venuesJson from '../../../../content/snake-battle/venues.json';
import { World, type WorldCfg } from './world';
import { Brain, heatTier, type GoalHook } from './brain';
import { createRng, type Snake, type RespawnRule } from './core';

export type VenueId = 'moon' | 'mars' | 'jupiter' | 'blackhole';
export const VENUE_IDS: VenueId[] = ['moon', 'mars', 'jupiter', 'blackhole'];
export interface Venue { id: VenueId; name: string; tier: string; R: number; startMass: number; ai: Record<string, number> }
export const VENUES = venuesJson.venues as unknown as Record<VenueId, Venue>;
export interface Trophy { id: string; name: string; icon: string; cond: { rankLE?: number; killsGE?: number; cutGE?: number; peakGE?: number } }
export const TROPHIES = venuesJson.trophies as unknown as Record<VenueId, Trophy[]>;
export const AI_NAMES = venuesJson.aiNames as { colors: string[]; persona: Record<string, string>; palette: Record<string, string> };
export const FLOORS = venuesJson.floors as unknown as Record<string, [string, string, string]>;
export const UNLOCK = venuesJson.unlock as Record<VenueId, null | { mission: string; orPodiums: { venue: VenueId; n: number } }>;
export const ENDLESS = venuesJson.endless as { venues: VenueId[]; playerStart: number; aiStart: [number, number]; nudgeMin: number };
export const HEAT = venuesJson.heat;
export const FOOD_DENSITY = 1 / 9000;
export const MATCH_SEC = venuesJson.matchSec as number;
export const RESPAWN = venuesJson.respawn as unknown as { timed: RespawnRule; endlessAi: { delay: number; keep: number; min: [number, number] } };

export function venueWorldCfg(v: Pick<Venue, 'R' | 'tier'>): WorldCfg {
  return {
    R: v.R, foodCount: Math.round(Math.PI * v.R * v.R * FOOD_DENSITY),
    pu: { max: v.tier === 'T1' ? 3 : 4, delay: [8, 12] }, meteors: { max: 2, delay: [10, 16] },
  };
}

/** 赛场热度的阵容杠杆 (spec §3.17): identical to the prototype `heatRoster` (G28). */
export function heatRoster(ai: Record<string, number>, h: number) {
  const r: Record<string, number> = { ...ai };
  if (!(h <= -1)) return r;
  const R = HEAT.roster;
  const k = String(Math.max(-2, h)) as '-1' | '-2', n0 = Object.values(ai).reduce((a, b) => a + b, 0);
  let swaps = R.swaps[k];
  for (const p of R.swapOrder) while (swaps > 0 && (r[p] ?? 0) > 0) { r[p]--; r[R.into] = (r[R.into] ?? 0) + 1; swaps--; }
  let rm = Math.min(Math.ceil(R.removeShare[k] * n0), Math.max(0, n0 - R.minAI));
  for (const p of R.removeOrder) while (rm > 0 && (r[p] ?? 0) > 1) { r[p]--; rm--; }
  for (const p of Object.keys(r)) if (!r[p]) delete r[p];
  return r;
}

/** heat after one more timed match (spec §3.17): 3 ranks all ≤2 → +1; all >3 → −1; window clears on change */
export function nextHeat(heat: number, recent: number[]): { heat: number; recent: number[] } {
  if (recent.length < HEAT.window) return { heat, recent };
  const last = recent.slice(-HEAT.window);
  if (last.every((r) => r <= 2) && heat < HEAT.max) return { heat: heat + 1, recent: [] };
  if (last.every((r) => r > 3) && heat > HEAT.min) return { heat: heat - 1, recent: [] };
  return { heat, recent: last };
}

/** display name rule (spec §3.19-12): empty → 小步步; > 6 chars → first 5 + … */
export function displayName(raw: string | undefined | null) {
  const s = [...(raw ?? '').trim()];
  if (!s.length) return '小步步';
  return s.length > 6 ? s.slice(0, 5).join('') + '…' : s.join('');
}

/**
 * Presentation-only roster colours (spec §4.2): a separate rng stream (never the sim's), every
 * (colour, persona) pair unique so names never repeat; `avoid` drops colours too close to his skin.
 */
export function rosterColors(personas: string[], seed: number | string, avoid: string[] = []) {
  const rng = createRng(`roster:${seed}`);
  const pal = AI_NAMES.colors.filter((c) => !avoid.includes(c));
  for (let i = pal.length - 1; i > 0; i--) { const j = Math.floor(rng.next() * (i + 1)); [pal[i], pal[j]] = [pal[j], pal[i]]; }
  const used = new Set<string>(), uses = new Map<string, number>();
  return personas.map((p) => {
    let best = pal[0], bu = Infinity;
    for (const c of pal) { if (used.has(c + p)) continue; const u = uses.get(c) ?? 0; if (u < bu) { bu = u; best = c; } }
    used.add(best + p); uses.set(best, (uses.get(best) ?? 0) + 1);
    return best;
  });
}

export interface TimedSetup { world: World; me: Snake; roster: string[] }

/**
 * Build a 限时赛 world exactly like the prototype's runVenueMatch (same rng forks, same order: AIs first,
 * then the player gets a clear spawn). `playerBrain` only for validators / demos; the page drives him.
 */
export function setupTimed(venue: Venue, seed: number, o: { heat?: number; playerTier?: string; playerPersona?: string; playerBrain?: boolean; name?: string; skin?: string; avoidColors?: string[]; extraAi?: string[]; hook?: (s: Snake) => ((s: Snake, w: World, b: Brain) => GoalHook | null) | null } = {}): TimedSetup {
  const w = new World(venueWorldCfg(venue), seed);
  const rng = createRng(`brains:${seed}`);
  const respawn = RESPAWN.timed;
  const roster: string[] = [];
  const h = o.heat ?? 0; const tierObj = heatTier(venue.tier, h);
  for (const [persona, n] of Object.entries(heatRoster(venue.ai, h))) for (let i = 0; i < n; i++) roster.push(persona);
  for (const p of o.extraAi ?? []) roster.push(p);   // perf stress only (?stress=25)
  const cols = rosterColors(roster, seed, o.avoidColors);
  roster.forEach((persona, i) => {
    const color = cols[i];
    const s = w.addSnake({ persona, tier: venue.tier, name: color + AI_NAMES.persona[persona], respawn, color }, venue.startMass);
    s.brain = new Brain({ tier: venue.tier, tierObj, persona, rng: rng.fork(`ai${i}`) });
  });
  w.rebuildHash();
  const me = w.addSnake({ persona: o.playerPersona ?? 'kid', tier: o.playerTier ?? 'KID', isPlayer: true, name: o.name ?? '小步步', respawn, skin: o.skin ?? 'venus' }, venue.startMass);
  const pb = new Brain({ tier: o.playerTier ?? 'KID', persona: o.playerPersona ?? 'kid', rng: rng.fork('player') });
  if (o.playerBrain) me.brain = pb;
  return { world: w, me, roster };
}

/** 无尽 (spec §4.3): one life; AIs respawn 2 s later at a random 10–90 length, AI count constant. */
export function setupEndless(venue: Venue, seed: number, o: { name?: string; skin?: string; avoidColors?: string[] } = {}): TimedSetup {
  const w = new World(venueWorldCfg(venue), seed);
  const rng = createRng(`brains:${seed}`);
  const sizeRng = createRng(`endless-size:${seed}`);
  const roster: string[] = [];
  for (const [persona, n] of Object.entries(venue.ai)) for (let i = 0; i < n; i++) roster.push(persona);
  const cols = rosterColors(roster, seed, o.avoidColors);
  const tierObj = heatTier(venue.tier, 0);
  roster.forEach((persona, i) => {
    const color = cols[i];
    const m0 = Math.round(ENDLESS.aiStart[0] + (ENDLESS.aiStart[1] - ENDLESS.aiStart[0]) * sizeRng.next());
    const s = w.addSnake({ persona, tier: venue.tier, name: color + AI_NAMES.persona[persona], respawn: { delay: RESPAWN.endlessAi.delay, keep: 0, min: 10 + Math.round(80 * sizeRng.next()) }, color }, m0);
    s.brain = new Brain({ tier: venue.tier, tierObj, persona, rng: rng.fork(`ai${i}`) });
  });
  w.rebuildHash();
  const me = w.addSnake({ persona: 'kid', tier: 'KID', isPlayer: true, name: o.name ?? '小步步', respawn: null, skin: o.skin ?? 'venus' }, ENDLESS.playerStart);
  return { world: w, me, roster };
}

/** validators: one full 限时赛 with a player model (= prototype runVenueMatch's core loop) */
export function runVenueMatch(venue: Venue, playerTier: string, playerPersona: string, seed: number, opts: { heat?: number; sec?: number; probe?: (w: World, me: Snake) => void } = {}) {
  const { world: w, me } = setupTimed(venue, seed, { heat: opts.heat, playerTier, playerPersona, playerBrain: true });
  const ticks = Math.round((opts.sec ?? MATCH_SEC) * 60);
  for (let i = 0; i < ticks; i++) {
    w.step();
    if (opts.probe && i % 60 === 0) opts.probe(w, me);
  }
  const rank = w.ranking().findIndex((r) => r.s === me) + 1;
  return { world: w, me, rank, kills: me.stats.kills, deaths: me.stats.deaths, peak: me.stats.peak };
}
