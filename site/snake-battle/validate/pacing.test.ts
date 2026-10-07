/**
 * V13 节奏 (spec §4.7, §9.2) on the SHIPPED meta-progression code. Five profiles × 400 playthroughs of 30 sessions
 * (12 min of active play each, 3 per week) replay recorded match / mission / twin / endless outcomes, and every bit
 * of bookkeeping goes through production code: SaveCtl.startMatch/endMatch (trophies, heat, venue unlocks),
 * SaveCtl.startMission/endMission (stars, counters only until a level's first clear, chapter gating via
 * missionOpen), and collection.evalUnlocks (every skin / trail / badge / crown rule). Full tier only.
 *
 * Outcome pools: `$SB_PACING_RAW` or ~/kid-games-work/snake-battle/raw/{venues,missions,twin,endless}.json when a
 * production dump exists, else the prototype's out-*-raw.json (~/kid-games-work/specs/snake-battle-tools). The
 * production sim reproduces the prototype bit for bit (V1b, 886/886 golden streams), so the per-seed outcomes are
 * the production outcomes. The replay itself (profiles, session budget, venue choice, twins after 3 misses,
 * 拿星重玩) is the prototype's run-pacing.mjs.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { FULL, writeReport } from './bots';
import { SaveCtl } from '../src/save';
import { allItems } from '../src/collection';
import { MISSIONS, type Mission } from '../src/sim/mission';
import { TROPHIES, VENUE_IDS, type VenueId } from '../src/sim/venues';
import { createRng, type Rng } from '../src/sim/core';
import { zeroCounters, type MatchCounters, type MatchResult } from '../src/match';

type Raw = Record<string, number | boolean | string[] | Record<string, number>>;
type Pools = { V: Record<string, Raw[]>; M: Record<string, Raw[]>; TW: Record<string, Raw[]>; E: Record<string, Raw[]> };

function loadPools(): { pools: Pools; src: string } | null {
  const dirs = [process.env.SB_PACING_RAW, path.join(os.homedir(), 'kid-games-work/snake-battle/raw'), path.join(os.homedir(), 'kid-games-work/specs/snake-battle-tools')].filter(Boolean) as string[];
  const names = [['venues.json', 'missions.json', 'twin.json', 'endless.json'], ['out-venues-raw.json', 'out-missions-raw.json', 'out-missions-twin-raw.json', 'out-endless-raw.json']];
  for (const d of dirs) for (const n of names) {
    const f = n.map((x) => path.join(d, x));
    if (!f.every((x) => fs.existsSync(x))) continue;
    const [V, M, TW, E] = f.map((x) => JSON.parse(fs.readFileSync(x, 'utf8')) as Record<string, Raw[]>);
    return { pools: { V, M, TW, E }, src: d };
  }
  return null;
}

class Mem implements Storage {
  m = new Map<string, string>(); get length() { return this.m.size; }
  clear() { this.m.clear(); } getItem(k: string) { return this.m.get(k) ?? null; } key(i: number) { return [...this.m.keys()][i] ?? null; }
  removeItem(k: string) { this.m.delete(k); } setItem(k: string, v: string) { this.m.set(k, v); }
}

const SESSIONS = 30, WEEKS = 6, BUDGET = 720;
const OVER = { match: 35, mission: 20, endless: 20 };
const MISSION_ATTEMPTS = 3;
const PROFILES = ['growing', 'mission-first', 'race-only', 'NOVICE', 'KID'] as const;
type Profile = typeof PROFILES[number];
const SKILL = (s: number, rng: Rng) => (s <= 6 ? 'NOVICE' : s <= 12 ? (rng.chance(0.5) ? 'KID' : 'NOVICE') : 'KID');
const botFor = (p: Profile, s: number, rng: Rng) => (p === 'NOVICE' || p === 'KID' ? p : SKILL(s, rng));
const ITEM_IDS = [...allItems().map((x) => x.key), ...VENUE_IDS.flatMap((v) => TROPHIES[v].map((t) => `trophy:${v}.${t.id}`))];
const num = (r: Raw, k: string) => (typeof r[k] === 'number' ? (r[k] as number) : 0);

function counters(r: Raw, playSec: number, peakGrown: number): MatchCounters {
  return { ...zeroCounters(), kills: num(r, 'kills'), cut: num(r, 'cut'), enc: num(r, 'enc'), headon: num(r, 'headon'), meteors: num(r, 'meteors'), speedPu: num(r, 'speedPu'),
    shieldSaves: num(r, 'shieldSaves'), near: num(r, 'near'), boostSec: num(r, 'boostSec'), multiMax: num(r, 'multi'), streakMax: num(r, 'streak'), peakGrown, eaten: num(r, 'eaten'), playSec };
}

interface Week { cleared: number; boss: number; venues: number; stars: number; skins: number; trails: number; badges: number; trophies: number; newThisWeek: number; raceNew: number; missionShare: number }

function playthrough(P: Pools, profile: Profile, seed: number) {
  const rng = createRng(`pace:${profile}:${seed}`);
  const save = new SaveCtl(new Mem());
  const d = save.data;
  const got: Record<string, number> = {}; const by: Record<string, string> = {};
  const weekly: Week[] = [];
  let missionSec = 0, playSec = 0;
  for (const k of d.owned) got[k] = 1;   // defaults count as session-1 unlocks (as in the prototype)
  const note = (s: number, kind: string) => { for (const k of d.owned) if (!(k in got)) { got[k] = s; by[k] = kind; } d.cardQueue.length = 0; };
  const cleared = (id: string) => (d.missions[id]?.clears ?? 0) > 0;
  const nextMission = () => MISSIONS.find((m) => save.missionOpen(m.id) && !cleared(m.id));
  const replayPick = () => MISSIONS.filter((m) => cleared(m.id) && (d.missions[m.id]?.stars ?? 0) < 3).sort((a, b) => (d.missions[a.id]?.stars ?? 0) - (d.missions[b.id]?.stars ?? 0))[0];
  const openVenues = () => VENUE_IDS.filter((v) => save.venueOpen(v));
  const playMission = (bot: string, m: Mission) => {
    const f = d.missions[m.id]?.failStreak ?? 0;
    const twin = f >= 3 && !!P.TW[`${m.id}/NOVICE`];          // after H3 every attempt is a twin (spec §5.1)
    const r = rng.pick(twin ? P.TW[`${m.id}/NOVICE`] : P.M[`${m.id}/${bot}`]);
    let stars = num(r, 'stars'); if (twin && stars > 2) stars = 2;
    const t = num(r, 't');
    save.startMission(m.id);
    save.endMission(m.id, { ok: !!r.ok, stars, t, why: r.ok ? undefined : 'out' }, counters(r, t, 0), { twin });
    const sec = t + OVER.mission; missionSec += sec; return sec;
  };
  const playMatch = (bot: string) => {
    const open = openVenues(); const v = rng.chance(0.6) ? open[open.length - 1] : rng.pick(open);
    const r = rng.pick(P.V[`${v}/${bot}`]);
    save.startMatch('timed', v);
    const peak = num(r, 'peak');
    save.endMatch({ mode: 'timed', venue: v, rank: num(r, 'rank'), of: num(r, 'n'), peak, mass: peak, kills: num(r, 'kills'), cut: num(r, 'cut'), enc: num(r, 'enc'), multiMax: num(r, 'multi'),
      eaten: num(r, 'eaten'), lifeSec: 180, counters: counters(r, 180, peak), banked: false, podium: [] } as MatchResult);
    return 180 + OVER.match;
  };
  const playEndless = (bot: string) => {
    const open = openVenues(); const v: VenueId = rng.chance(0.6) ? 'moon' : rng.pick(open);
    const r = rng.pick(P.E[`${v}/${bot}`]);
    const life = num(r, 'life'), peak = num(r, 'peak');
    save.startMatch('endless', v);
    save.endMatch({ mode: 'endless', venue: v, rank: 1, of: 1, peak, mass: peak, kills: num(r, 'kills'), cut: num(r, 'cut'), enc: num(r, 'enc'), multiMax: num(r, 'multi'),
      eaten: num(r, 'eaten'), lifeSec: life, counters: counters(r, life, peak), banked: false, podium: [] } as MatchResult);
    return Math.min(life, 600) + OVER.endless;
  };
  for (let s = 1; s <= SESSIONS; s++) {
    const bot = botFor(profile, s, rng);
    let left = BUDGET;
    if (s === 1 && profile !== 'race-only') for (const id of ['c1m1', 'c1m2', 'c1m3']) { left -= playMission(bot, MISSIONS.find((m) => m.id === id)!); note(s, 'mission'); }
    if (profile === 'mission-first') {
      let m: Mission | undefined;
      while (left >= 60 && left > BUDGET * 0.3 - 1e-9 && (m = nextMission())) { left -= playMission(bot, m); note(s, 'mission'); }
      while (left >= 120) { left -= s % 3 === 0 && left >= 300 ? playEndless(bot) : playMatch(bot); note(s, 'race'); }
    } else if (profile === 'race-only') {
      const plan = s % 3 === 0 ? ['endless', 'match', 'match'] : ['match', 'match', 'match'];
      for (const step of plan) if (left >= 120) { left -= step === 'endless' ? playEndless(bot) : playMatch(bot); note(s, 'race'); }
    } else {
      const plan = s % 3 === 0 ? ['endless', 'match', 'missions'] : ['match', 'match', 'missions'];
      for (const step of plan) {
        if (step === 'match' && left >= 120) { left -= playMatch(bot); note(s, 'race'); }
        else if (step === 'endless' && left >= 120) { left -= playEndless(bot); note(s, 'race'); }
        else if (step === 'missions') {
          let m: Mission | undefined, k = 0;
          while (k < MISSION_ATTEMPTS && left >= 60 && (m = nextMission())) { left -= playMission(bot, m); k++; note(s, 'mission'); }
          while (k < MISSION_ATTEMPTS && left >= 60 && !nextMission() && (m = replayPick())) { left -= playMission(bot, m); k++; note(s, 'mission'); }   // 拿星重玩 (§5.3)
        }
      }
    }
    playSec += BUDGET - left;
    if (s % 3 === 0) {
      const has = (pre: string) => Object.keys(got).filter((k) => k.startsWith(pre)).length;
      weekly.push({ cleared: MISSIONS.filter((m) => cleared(m.id)).length, boss: Math.max(0, ...[1, 2, 3, 4, 5].filter((c) => cleared(`c${c}m7`))), venues: openVenues().length,
        stars: Object.values(d.missions).reduce((a, x) => a + (x.stars ?? 0), 0), skins: has('skin:'), trails: has('trail:'), badges: has('badge:'), trophies: has('trophy:'),
        newThisWeek: Object.values(got).filter((x) => x > s - 3 && x <= s).length, raceNew: Object.entries(got).filter(([k, x]) => x > s - 3 && x <= s && by[k] === 'race').length, missionShare: missionSec / Math.max(1, playSec) });
    }
  }
  return { got, weekly };
}

const q = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };

describe.skipIf(!FULL)('V13 pacing on the production unlock code', () => {
  it('weekly unlocks, no long droughts, skins last 4–6 weeks, every collectible reachable', () => {
    const lp = loadPools();
    if (!lp) { console.warn('[V13] no outcome pools found (run the full tier V2/V3/V6 dumps or the prototype run-all) — skipped'); return; }
    const RUNS = Number(process.env.SB_PACING_RUNS ?? 400);
    const t0 = Date.now();
    const gates: [boolean, string][] = []; const table: Record<string, unknown> = {};
    const med = (rows: Week[][], w: number, k: keyof Week) => q(rows.map((r) => r[w][k]), 0.5);
    for (const profile of PROFILES) {
      const runs = Array.from({ length: RUNS }, (_, i) => playthrough(lp.pools, profile, i + 1));
      const W = runs.map((r) => r.weekly);
      const weeks = Array.from({ length: WEEKS }, (_, w) => ({ week: w + 1, cleared: [q(W.map((r) => r[w].cleared), 0.25), med(W, w, 'cleared'), q(W.map((r) => r[w].cleared), 0.75)], boss: med(W, w, 'boss'), venues: med(W, w, 'venues'),
        stars: med(W, w, 'stars'), skins: med(W, w, 'skins'), trails: med(W, w, 'trails'), badges: med(W, w, 'badges'), trophies: med(W, w, 'trophies'), newThisWeek: med(W, w, 'newThisWeek'), raceNew: med(W, w, 'raceNew'), missionShare: Math.round(100 * med(W, w, 'missionShare')) }));
      const drought = runs.map((r) => { const ss = new Set(Object.values(r.got)); let best = 0, cur = 0; for (let s = 1; s <= 18; s++) { if (ss.has(s)) cur = 0; else { cur++; best = Math.max(best, cur); } } return best; });
      const items = Object.fromEntries(ITEM_IDS.map((id) => [id, runs.filter((r) => (r.got[id] ?? 99) <= 30).length / RUNS]));
      table[profile] = { weeks, drought: { p50: q(drought, 0.5), p90: q(drought, 0.9) }, items };
      const news = weeks.map((x) => x.newThisWeek);
      if (profile === 'growing') {
        const w1 = weeks[0];
        gates.push([w1.newThisWeek >= 4, `growing week 1: ≥4 unlocks (median ${w1.newThisWeek}: ${w1.skins} skins + ${w1.trails} trails + ${w1.badges} badges + ${w1.trophies} trophies)`]);
        gates.push([news.every((x) => x >= 1), `growing: every week 1–6 brings ≥1 new unlock (median new: ${news.join(' / ')})`]);
        gates.push([q(drought, 0.9) <= 4, `growing: longest stretch without an unlock p90 ${q(drought, 0.9)} ≤ 4 sessions`]);
        gates.push([weeks[3].skins <= 15 && weeks[5].skins >= 12 && weeks[5].skins <= 17, `growing skins: week 4 ${weeks[3].skins}/18 ≤ 15, week 6 ${weeks[5].skins}/18 in 12–17`]);
        gates.push([weeks[5].cleared[1] >= 28, `growing week 6 missions cleared median ${weeks[5].cleared[1]} ≥ 28`]);
        const low = Object.entries(items).sort((a, b) => a[1] - b[1]);
        gates.push([low[0][1] >= 0.25, `every collectible reached by ≥25% of growing playthroughs within 30 sessions (lowest ${low.slice(0, 3).map(([k, p]) => `${k} ${Math.round(p * 100)}%`).join(', ')})`]);
      }
      if (profile === 'mission-first' || profile === 'race-only') {
        const race = weeks.slice(2).map((x) => x.raceNew);
        gates.push([news.every((x) => x >= 1), `${profile}: every week 1–6 brings ≥1 new unlock (median new: ${news.join(' / ')})`]);
        gates.push([race.every((x) => x >= 1), `${profile}: weeks 3–6 each bring ≥1 race-driven unlock (median: ${race.join(' / ')})`]);
      }
      console.log(`[V13] ${profile}: new/week ${news.join('/')} · skins ${weeks.map((x) => x.skins).join('/')} · cleared ${weeks.map((x) => x.cleared[1]).join('/')} · drought p90 ${q(drought, 0.9)}`);
    }
    writeReport('v13-pacing', { sec: Math.round((Date.now() - t0) / 1000), runs: RUNS, pools: lp.src, table, gates: gates.map(([ok, s]) => `${ok ? '✓' : '✗'} ${s}`) });
    for (const [ok, s] of gates) console.log(`${ok ? 'PASS' : 'FAIL'} V13  ${s}`);
    const bad = gates.filter(([ok]) => !ok).map(([, s]) => s);
    expect(bad, bad.join('\n')).toEqual([]);
  }, 30 * 60_000);
});
