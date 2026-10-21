/** Stage plans (tray helper reaches every target legally), base meta-progress (§5.4) and the parent summary (§5.3). Pure Node. */
import { describe, expect, it } from 'vitest';
import { createRng } from '@kit/rng';
import { normalizeMetrics } from './lib/metricsShape';
import { isCanonical, trayStep, trayValue, totalValue, type TrayState } from '@engines/manip/tray';
import { FAMILIES } from '../src/families';
import { trayConfig, trayPlan } from '../src/stages/trayPlan';
import { defaultSave } from '../src/save/schema';
import { MAIN_ORDER, NODE_BY_ID } from '../src/app/content';
import { BASE_DENOM, baseLevelOf, earnedCards, metricsOf, tierOf, updateBase } from '../src/app/base';

const N = process.env.MARS_FULL ? 600 : 120;
function run(cfgStart: TrayState, plan: ReturnType<typeof trayPlan>): TrayState {
  let s = cfgStart; for (const a of plan) { const n = trayStep(s, a); expect(n, `illegal ${JSON.stringify(a)}`).not.toBeNull(); s = n!; } return s;
}

describe('tray hands-on plans (H2/H3 helper)', () => {
  const FAMS = ['pv2.build', 'pv3.build', 'pv3.pack', 'add.tens', 'add.carry1', 'add.2d2d', 'sub.tens', 'sub.borrow1', 'sub.2d2d', 'pv3.addHund', 'pv2.read', 'pv3.read'];
  for (const id of FAMS) {
    it(`${id}: the plan is legal, conserves the total and reaches the order canonically`, () => {
      const f = FAMILIES[id]; const rng = createRng(`stages:${id}`);
      for (let i = 0; i < N; i++) {
        const band = 1 + (i % f.bands); const out = f.gen(rng, { band, level: 3, rep: 'C', ask: undefined, knobs: {}, l6: i % 7 === 0 });
        const p = out.params as any; const key = id === 'pv3.addHund' ? (p.op === '+' ? 'add.2d2d' : 'sub.2d2d') : id;
        const cfg = trayConfig(key, p, true, true); expect(cfg, `${id} has a hands-on tray`).not.toBeNull();
        const start = cfg!.start; const before = totalValue(start);
        const end = run(start, trayPlan(cfg!));
        expect(isCanonical(end), `${id} ${JSON.stringify(p)} canonical`).toBe(true);
        if (cfg!.mode === 'sub') { expect(trayValue(end)).toBe(cfg!.target); expect(totalValue(end)).toBe(before); }
        else if (cfg!.mode === 'read') expect(trayValue(end)).toBe(cfg!.target);
        else expect(trayValue(end)).toBe(cfg!.target);
      }
    });
  }
});

describe('base meta-progress (§5.4)', () => {
  const lit = { state: 'lit' as const, attempts: 1 };
  it('a fresh save sits at tier 1 / level 1; tiers are capped at 1 until a VALID calibration exists', () => {
    const s = defaultSave(0); const ev = updateBase(s);
    expect(s.baseLevel).toBe(1); for (const k of ['orbit', 'vault', 'factory', 'cert']) expect(s.buildings[k]).toBe(1); expect(ev.tierUps).toEqual([]);
    for (const id of MAIN_ORDER.vault) s.nodes[id] = { st: 'done', stars: 1, plays: 1, ft: [] };
    expect(tierOf(s, 'vault')).toBe(1);   // capped
    s.orbit.tests.push({ node: 'orbit.O1.0', L: 100, at: 1, targets: [], est: [], r2: 0.99, slope: 1, pae: 0.04, pass: true, valid: true });
    expect(tierOf(s, 'vault')).toBe(3);
  });
  it('half the scored nodes → tier 2, all → tier 3; cards light the 徽章站; the level never goes backwards', () => {
    const s = defaultSave(0); s.orbit.tests.push({ node: 'orbit.O1.0', L: 100, at: 1, targets: [], est: [], r2: 0.99, slope: 1, pae: 0.04, pass: true, valid: true });
    const ids = MAIN_ORDER.factory.filter((id) => NODE_BY_ID[id].kind !== 'calib' && NODE_BY_ID[id].kind !== 'breather');
    ids.slice(0, Math.ceil(ids.length / 2)).forEach((id) => { s.nodes[id] = { st: 'done', stars: 1, plays: 1, ft: [] }; });
    expect(tierOf(s, 'factory')).toBe(2); ids.forEach((id) => { s.nodes[id] = { st: 'skipped', stars: 0, plays: 0, ft: [] }; }); expect(tierOf(s, 'factory')).toBe(3);
    s.cert.C1 = { ...lit }; s.cert.C2 = { ...lit }; expect(tierOf(s, 'cert')).toBe(3);
    const ev = updateBase(s); expect(ev.tierUps.map((t) => t.site)).toContain('factory'); const lv = s.baseLevel; expect(lv).toBeGreaterThanOrEqual(2);
    s.nodes = {}; s.cert.C1 = { state: 'none', attempts: 0 }; updateBase(s); expect(s.baseLevel).toBe(lv); expect(s.buildings.factory).toBe(3);
    expect(baseLevelOf(defaultSave(0))).toBe(1); expect(BASE_DENOM).toBe(58);
  });
  it('knowledge cards come from the earn rules (verified:false cards are earned but the archive hides them)', () => {
    const s = defaultSave(0); expect(earnedCards(s)).toEqual([]); s.onboarded = true; expect(earnedCards(s)).toContain('card.1');
    s.session.missions = 1; expect(earnedCards(s)).toContain('card.2'); s.cert.C1 = { ...lit }; expect(earnedCards(s)).toContain('card.6');
  });
});

describe('parent summary (§5.3)', () => {
  it('≤ 3 metrics, ≤ 4 KB after the kit clamps them, and no age norms', () => {
    const s = defaultSave(0); s.session.missions = 3; s.cert.C1 = { state: 'lit', attempts: 1 };
    s.orbit.tests.push({ node: 'orbit.O1.0', L: 100, at: 1, targets: [5, 50], est: [8, 47], r2: 0.98, slope: 1, pae: 0.06, pass: true, valid: true });
    const m = metricsOf(s); expect(m.metrics.length).toBeGreaterThanOrEqual(2); expect(m.metrics.length).toBeLessThanOrEqual(3);
    const norm = normalizeMetrics(m.metrics); expect(norm.length).toBe(m.metrics.length); expect(JSON.stringify({ metrics: norm, data: m.data }).length).toBeLessThan(4096);
    expect(JSON.stringify(m)).not.toMatch(/年级|常模|百分位/);
  });
});
