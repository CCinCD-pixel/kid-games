/**
 * Stage-1 rule checks (spec §3.17 heat, §3.19 edge cases, §8.9 incremental save, G28 heatRoster parity).
 */
import { describe, expect, it } from 'vitest';
import { heatRoster, nextHeat, displayName, VENUES, setupTimed, rosterColors } from '../src/sim/venues';
import { heatTier, TIERS } from '../src/sim/brain';
import { bodyLenOf, PHYS } from '../src/sim/core';
import { SaveCtl, commitDelta, defaults } from '../src/save';
import { zeroCounters } from '../src/match';

class Mem implements Storage {
  m = new Map<string, string>(); get length() { return this.m.size; }
  clear() { this.m.clear(); } getItem(k: string) { return this.m.get(k) ?? null; } key(i: number) { return [...this.m.keys()][i] ?? null; }
  removeItem(k: string) { this.m.delete(k); } setItem(k: string, v: string) { this.m.set(k, v); }
}

describe('heat (spec §3.17)', () => {
  it('roster lever matches the spec table for every venue', () => {
    // G28: identical to the prototype venues.mjs heatRoster (values printed from the prototype; v1.2: mars 4 foragers, h = −2 removes 40 %)
    const PROTO: Record<string, [Record<string, number>, Record<string, number>]> = {
      moon: [{ forager: 2, skittish: 2, scavenger: 1 }, { forager: 2, skittish: 2, scavenger: 1 }],
      mars: [{ forager: 2, scavenger: 2, skittish: 5, daredevil: 1 }, { forager: 1, scavenger: 1, skittish: 5 }],
      jupiter: [{ forager: 4, scavenger: 2, skittish: 4, hunter: 2, coiler: 2, daredevil: 3 }, { forager: 1, scavenger: 1, skittish: 4, coiler: 2, daredevil: 3 }],
      blackhole: [{ forager: 3, scavenger: 2, hunter: 5, coiler: 3, daredevil: 3, skittish: 2 }, { forager: 1, scavenger: 1, hunter: 3, coiler: 3, daredevil: 3, skittish: 1 }],
    };
    for (const [id, [m1, m2]] of Object.entries(PROTO)) { expect(heatRoster(VENUES[id as 'moon'].ai, -1)).toEqual(m1); expect(heatRoster(VENUES[id as 'moon'].ai, -2)).toEqual(m2); }
    expect(heatRoster(VENUES.moon.ai, 0)).toEqual(VENUES.moon.ai);
    for (const v of Object.values(VENUES)) for (const h of [-1, -2]) {
      const r = heatRoster(v.ai, h); const n = Object.values(r).reduce((a, b) => a + b, 0);
      expect(n).toBeGreaterThanOrEqual(5);
      for (const p of Object.keys(v.ai)) if (!['hunter', 'daredevil', 'coiler'].includes(p)) expect(r[p] ?? 0).toBeGreaterThanOrEqual(1);
    }
  });
  it('tier lerp: down 50 %·|h|, up 25 %·h, lapse never interpolated', () => {
    const t = heatTier('T2', -2); expect(t.P).toBeCloseTo(TIERS.T1.P); expect(t.lapse).toBe(TIERS.T2.lapse);
    expect(heatTier('T4', 2).P).toBeCloseTo(TIERS.T4.P + (TIERS.T4plus.P - TIERS.T4.P) * 0.5);
  });
  it('3 ranks ≤2 → +1, 3 ranks >3 → −1, window clears', () => {
    expect(nextHeat(0, [1, 2, 1])).toEqual({ heat: 1, recent: [] });
    expect(nextHeat(0, [5, 4, 9])).toEqual({ heat: -1, recent: [] });
    expect(nextHeat(0, [1, 5, 2]).heat).toBe(0);
    expect(nextHeat(2, [1, 1, 1]).heat).toBe(2);
    expect(nextHeat(-2, [9, 9, 9]).heat).toBe(-2);
  });
});

describe('edge cases (spec §3.19)', () => {
  it('display name: empty → 小步步, > 6 chars → 5 + …', () => {
    expect(displayName('')).toBe('小步步'); expect(displayName(null)).toBe('小步步');
    expect(displayName('一二三四五六七')).toBe('一二三四五…'); expect(displayName('乐乐')).toBe('乐乐');
  });
  it('path buffer never overflows at the mass cap (§3.19-19)', () => { expect(8192 * PHYS.pathStep).toBeGreaterThan(bodyLenOf(9999)); });
  it('AI names are unique; colours avoid his skin', () => {
    for (const v of Object.values(VENUES)) {
      const { world } = setupTimed(v, 7, { avoidColors: ['黄', '橙'], extraAi: ['hunter', 'forager', 'daredevil'] });
      const names = world.snakes.filter((s) => !s.isPlayer).map((s) => s.name);
      expect(new Set(names).size).toBe(names.length);
      expect(names.some((n) => n.startsWith('黄') || n.startsWith('橙'))).toBe(false);
    }
    expect(rosterColors(['forager', 'forager'], 1)).not.toEqual(['红', '红']);
  });
});

describe('save v1 incremental commit (spec §8.9, review B9)', () => {
  const c = (k: number) => ({ ...zeroCounters(), kills: k, eaten: k * 10, multiMax: k });
  it('background ×2 then match end counts every increment once', () => {
    const st = new Mem(); const s = new SaveCtl(st);
    s.startMatch('timed', 'moon');
    s.commitProgress(c(1)); s.commitProgress(c(3));
    s.endMatch({ mode: 'timed', venue: 'moon', rank: 2, of: 7, peak: 300, mass: 280, kills: 4, cut: 1, enc: 0, multiMax: 2, eaten: 40, lifeSec: 180, counters: c(4), banked: false, podium: [] });
    expect(s.data.life.kills).toBe(4); expect(s.data.life.eaten).toBe(40); expect(s.data.inProgress).toBeUndefined();
    expect(s.data.venues.moon.podiums).toBe(1); expect(s.data.owned).toContain('trophy:moon.podium');
  });
  it('killed in the background: increments survive, leftover inProgress is closed at boot', () => {
    const st = new Mem(); const s = new SaveCtl(st);
    s.startMatch('timed', 'moon'); s.commitProgress(c(2));
    const s2 = new SaveCtl(st);
    expect(s2.data.life.kills).toBe(2); expect(s2.data.inProgress).toBeUndefined(); expect(s2.data.venues.moon.played).toBe(0);
  });
  it('leaving mid-match commits the rest, no rank', () => {
    const s = new SaveCtl(new Mem()); s.startMatch('timed', 'mars'); s.commitProgress(c(1)); s.leaveMatch(c(2));
    expect(s.data.life.kills).toBe(2); expect(s.data.venues.mars.played).toBe(0);
  });
  it('mars opens after 2 moon podiums (§4.8)', () => {
    const s = new SaveCtl(new Mem()); expect(s.venueOpen('mars')).toBe(false);
    for (let i = 0; i < 2; i++) { s.startMatch('timed', 'moon'); s.endMatch({ mode: 'timed', venue: 'moon', rank: 3, of: 7, peak: 100, mass: 100, kills: 0, cut: 0, enc: 0, multiMax: 0, eaten: 1, lifeSec: 1, counters: zeroCounters(), banked: false, podium: [] }); }
    expect(s.venueOpen('mars')).toBe(true); expect(s.data.cardQueue).toContain('venue:mars');
  });
  it('commitDelta merges max counters by max', () => { const d = defaults(); commitDelta(d, c(5), c(0)); commitDelta(d, c(3), c(0)); expect(d.life.multiMax).toBe(5); });
});
