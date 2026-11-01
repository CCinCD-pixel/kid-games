/** V4 adaptive simulation (spec §9): real scheduler / ladder / cert / machine; assumed learners; regression gates, not evidence. */
import { describe, expect, it, vi } from 'vitest';
import { ARCH, simulate, type Adv } from './lib/sim';
import { NODE_BY_ID } from '../src/app/content';
import { MAX_NODE_PLAYS } from '../src/app/tuning';

const FULL = !!process.env.MARS_FULL;
vi.setConfig({ testTimeout: FULL ? 1_800_000 : 120_000 });   // the full tier simulates 1000 learners × 30 visits × 3 seeds per archetype
const LEARNERS = Number(process.env.MARS_LEARNERS ?? (FULL ? 1000 : 60));
const SEEDS = FULL ? 3 : 2;
const VISITS = 30;
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const log = (...a: unknown[]) => { if (process.env.MARS_VERBOSE) process.stdout.write(a.join(' ') + '\n'); };

describe('V4 adaptive simulation', () => {
  for (const arch of Object.keys(ARCH)) {
    it(`${arch}: first-try mean in [75, 85] % over visits 3–30, nodes ≤ 2 plays, nobody exhausts the built line before visit 18`, () => {
      const perSeed: number[] = []; let maxPlays = 0; let ex18 = 0; const left18: number[] = []; const warm: number[] = []; let lit = 0; let halfN = 0; let cn = 0; let ops = 0;
      for (let sd = 0; sd < SEEDS; sd++) {
        const accs: number[] = [];
        for (let k = 0; k < LEARNERS; k++) {
          const s = simulate(`${arch}:${sd}:${k}`, arch, { visits: VISITS });
          if (s.acc !== null) accs.push(s.acc);
          maxPlays = Math.max(maxPlays, s.maxPlays); if (s.exhaustedAt !== null && s.exhaustedAt < 18) ex18++;
          if (s.leftAt18 !== null) left18.push(s.leftAt18); if (s.warm !== null) warm.push(s.warm);
          for (const c of Object.values(s.certs)) { cn++; if (c === 'lit') lit++; if (c === 'half') halfN++; }
          ops = Math.max(ops, s.opsMax);
          expect(s.bossSkipped, 'direct skipped a boss/breather').toBe(0);
        }
        perSeed.push(mean(accs));
      }
      log(`  ${arch.padEnd(9)} first-try ${perSeed.map((x) => (100 * x).toFixed(1)).join(' / ')} | warm ${(100 * mean(warm)).toFixed(1)} | cards lit ${(100 * lit / cn).toFixed(0)}% half ${(100 * halfN / cn).toFixed(0)}% | max plays ${maxPlays} | left@18 ${mean(left18).toFixed(1)} | ex<18 ${ex18} | max ops/item ${ops}`);
      for (const m of perSeed) { expect(m).toBeGreaterThanOrEqual(0.75); expect(m).toBeLessThanOrEqual(0.85); }
      expect(maxPlays).toBeLessThanOrEqual(MAX_NODE_PLAYS);
      expect(ex18).toBe(0);
      expect(ops).toBeLessThanOrEqual(5);     // hint key first + three misses + ✓; the per-mission average is gated below
    });
  }

  for (const adv of ['right', 'wrong', 'random', 'alt'] as Adv[]) {
    it(`adversary "${adv}": finishes, ≤4 actions per question, nodes ≤2 plays, 直达 never skips a Boss`, () => {
      let mp = 0; let ops = 0; let h3 = 0; let items = 0;
      for (let k = 0; k < Math.max(10, LEARNERS / 3); k++) {
        const s = simulate(`adv:${adv}:${k}`, 'medium', { visits: 30, adv });
        mp = Math.max(mp, s.maxPlays); ops = Math.max(ops, s.opsMax); h3 += s.h3Items; items += s.items;
        expect(s.bossSkipped).toBe(0);
        expect(s.opsPerMissionMax).toBeLessThanOrEqual(4);
        if ((adv as string) !== 'right') for (const c of ['C1', 'C2', 'C3']) expect(s.certs[c] === 'lit', `${adv} lit ${c}`).toBe(false);
      }
      expect(mp).toBeLessThanOrEqual(MAX_NODE_PLAYS); expect(ops).toBeLessThanOrEqual(4);   // always-wrong: ≤4 actions to an exit
      if (adv === 'wrong') expect(h3).toBeGreaterThan(items * 0.3);
      if (adv === 'right') expect(h3).toBe(0);
    });
  }

  it('dreamer (idle 40–100 s between actions): the whole save is byte-identical to the baseline', () => {
    for (let k = 0; k < 6; k++) {
      const a = simulate(`dream:${k}`, 'medium', { visits: 12 }); const b = simulate(`dream:${k}`, 'medium', { visits: 12, dream: true });
      expect(JSON.stringify(b.save)).toBe(JSON.stringify(a.save));
    }
  });

  it('coverage: every built main node and every remedial node is dealt to at least one learner', () => {
    const played = new Set<string>();
    for (const arch of Object.keys(ARCH)) for (let k = 0; k < Math.max(30, LEARNERS / 2); k++) for (const id of simulate(`cov:${arch}:${k}`, arch, { visits: 60, per: () => 2 }).played) played.add(id);
    const need = Object.values(NODE_BY_ID).filter((n) => ['orbit', 'vault', 'factory'].includes(n.zone) || n.chapter.startsWith('C')).map((n) => n.id);
    const missing = need.filter((id) => !played.has(id));
    log(`  coverage: ${need.length - missing.length}/${need.length}${missing.length ? ' missing ' + missing.join(' ') : ''}`);
    expect(missing).toEqual([]);
  }, 300_000);

  it('config C (1.5 missions/visit): the built line does not run out in 18 visits', () => {
    for (const arch of ['strong', 'knows100']) {
      const left: number[] = [];
      for (let k = 0; k < Math.max(20, LEARNERS / 3); k++) left.push(simulate(`C:${arch}:${k}`, arch, { visits: 18, per: (v) => (v % 2 ? 2 : 1) }).leftAt18 ?? 0);
      log(`  config C ${arch}: left@18 mean ${mean(left).toFixed(1)} min ${Math.min(...left)}`);
      expect(Math.min(...left)).toBeGreaterThanOrEqual(0);
    }
  });
});
