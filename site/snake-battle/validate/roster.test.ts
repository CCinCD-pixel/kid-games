/**
 * Roster (spec §4.2): deterministic presentation-only colours, every (colour, persona) pair unique so names never
 * repeat, the skin-clash colours avoided; mission role names; and no snake ever shows an internal id as its name —
 * including the ones the mission script adds mid-level (蛇王 guards, c5m1 big swim-ins; QA r2).
 */
import { describe, expect, it } from 'vitest';
import { VENUES, heatRoster, rosterColors, setupTimed, AI_NAMES } from '../src/sim/venues';
import { Match, MissionNames } from '../src/match';
import { MISSION_BY_ID } from '../src/sim/mission';

const ORDER = ['forager', 'hunter', 'coiler', 'scavenger', 'skittish', 'daredevil'];
const INTERNAL = /^[a-z]+\d*$/;

describe('roster (spec §4.2)', () => {
  it('every venue × heat × 40 seeds: names unique, colours from the palette, deterministic', () => {
    for (const v of Object.values(VENUES)) for (const h of [-2, -1, 0, 1, 2]) for (let seed = 1; seed <= 40; seed++) {
      const ai = heatRoster(v.ai, h); const personas = ORDER.flatMap((p) => Array(ai[p] ?? 0).fill(p));
      const cols = rosterColors(personas, seed);
      expect(cols).toEqual(rosterColors(personas, seed));
      const names = cols.map((c, i) => c + AI_NAMES.persona[personas[i]]);
      expect(new Set(names).size).toBe(names.length);
      for (const c of cols) expect(AI_NAMES.colors).toContain(c);
    }
  });
  it('colours too close to his skin are never used', () => {
    const cols = rosterColors(Array(14).fill('forager').map((p, i) => ORDER[i % 6] ?? p), 9, ['黄', '橙']);
    expect(cols.some((c) => c === '黄' || c === '橙')).toBe(false);
  });
  it('timed setup: AI names are colour + persona word and unique', () => {
    for (const v of Object.values(VENUES)) {
      const { world } = setupTimed(v, 5, { name: '小步步' });
      const names = world.snakes.filter((s) => !s.isPlayer).map((s) => s.name);
      expect(new Set(names).size).toBe(names.length);
      for (const n of names) expect(n).not.toMatch(INTERNAL);
    }
  });
  it('mission role names: 蛇王 / 贪睡蛇 / 巡逻蛇 / 护卫', () => {
    expect(MissionNames.of({ king: true } as never, 1)).toBe('蛇王');
    expect(MissionNames.of({ missionPersona: 'guard', color: '红' } as never, 1)).toBe('红护卫');
    expect(MissionNames.of({ missionPersona: 'patrol', color: '蓝' } as never, 1)).toBe('蓝巡逻蛇');
  });
  it('late spawns get display names: c5m7 phase-2 guards and c5m1 big swim-ins (QA r2)', () => {
    const m7 = new Match({ mode: 'mission', venue: 'moon', seed: 3, name: '小步步', skin: 'venus', mission: MISSION_BY_ID.c5m7, countdown: false });
    const run = m7.run!, w = run.w, king = w.snakes.find((s) => s.king)!;
    const orig = w.step.bind(w);
    w.step = () => { orig(); king.crown = king.crownMax! - 1; w.emit({ type: 'gem', id: king.id, by: run.me.id, left: king.crown }); w.step = orig; };
    run.step();
    const guards = w.snakes.filter((s) => s.missionPersona === 'guard');
    expect(guards).toHaveLength(2);
    for (const s of w.snakes) if (!s.isPlayer) expect(s.name).not.toMatch(INTERNAL);
    expect(guards.every((g) => g.name.endsWith('护卫'))).toBe(true);

    const m1 = new Match({ mode: 'mission', venue: 'moon', seed: 11, name: '小步步', skin: 'venus', mission: MISSION_BY_ID.c5m1, countdown: false });
    const r1 = m1.run!;
    for (const s of r1.w.snakes) if (!s.isPlayer && !s.king) { s.alive = false; s.respawn = null; }
    r1.me.protect = 1e9;
    for (let i = 0; i < 60 * 30 && !r1.done; i++) r1.step();
    const bigs = r1.w.snakes.filter((s) => s.missionPersona === 'forager' && s.alive);
    expect(bigs.length).toBeGreaterThanOrEqual(1);
    for (const s of r1.w.snakes) if (!s.isPlayer) expect(s.name).not.toMatch(INTERNAL);
  });
});
