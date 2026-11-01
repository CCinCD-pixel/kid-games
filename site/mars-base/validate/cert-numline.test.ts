/** V5 (embedded badge check discrimination) and V6 (a)(f)(g) (calibration scoring, degenerate detection, difficulty gates). Spec §9. */
import { describe, expect, it } from 'vitest';
import { createRng, type Rng } from '@kit/rng';
import { CERT_ITEMS, applyCert, evaluateCert, recordProvisional, startNodeOf, type CertAnswer } from '../src/app/cert';
import { CARDS, NODE_BY_ID, REMEDIAL_ORDER, CERT_MAP } from '../src/app/content';
import { defaultSave } from '../src/save/schema';
import { CALIBRATION_TARGETS, scoreCalibration } from '../src/families/nl';
import { GATE, g, nlNodes, nodeFirstTry, sdOf } from './lib/nlNoise';
import type { CardId } from '../src/app/types';

const FULL = !!process.env.MARS_FULL;
const N = FULL ? 100000 : 10000;
const normal = (r: Rng): number => { let u = 0; let v = 0; while (u === 0) u = r.next(); while (v === 0) v = r.next(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

/** One full check with the REAL protocol: items answered one by one with the probability of their tier; extras on exactly one wrong. */
function runCert(r: Rng, card: CardId, p1: number, p2: number) {
  const answers: CertAnswer[] = CERT_ITEMS[card].map((s) => ({ fam: s.fam, band: s.band, ok: r.chance(s.tier === 1 ? p1 : p2) }));
  let out = evaluateCert(card, answers);
  if (out.state === 'need-extra') {
    const t2 = CERT_ITEMS[card].filter((s) => s.tier === 2);
    for (let k = 0; k < 2; k++) answers.push({ fam: t2[k % t2.length].fam, band: t2[k % t2.length].band, ok: r.chance(p2) });
    out = evaluateCert(card, answers);
  }
  return { out, answers };
}
const PROFILES: Record<string, [number, number]> = { knower: [0.97, 0.93], partial: [0.85, 0.6], nonKnower: [0.7, 0.3], misconception: [0.9, 0.05] };

describe('V5 badge check discrimination (real cert.ts)', () => {
  for (const seed of [3, 4]) {
    it(`seed ${seed}: knowers light, others rarely do; provisional re-check bites partial knowers`, () => {
      const stats: Record<string, { lit: number; stays: number; reopened: number; items: number }> = {};
      for (const [name, [p1, p2]] of Object.entries(PROFILES)) {
        const r = createRng(`v5:${seed}:${name}`); const s = { lit: 0, stays: 0, reopened: 0, items: 0 };
        for (let k = 0; k < N; k++) {
          const card = CARDS[k % 3];
          const { out, answers } = runCert(r, card, p1, p2);
          s.items += answers.length;
          if (out.state === 'lit') {
            s.lit++;
            const save = defaultSave(); save.session.missions = 1; applyCert(save, card, answers, 1);
            let reopened = false;
            const t2 = CERT_ITEMS[card].filter((c) => c.tier === 2);
            for (let i = 0; i < 4; i++) { const slot = t2[i % t2.length]; if (recordProvisional(save, card, slot, r.chance(p2)).reopened) reopened = true; }
            if (reopened) s.reopened++; else s.stays++;
          }
        }
        stats[name] = s;
      }
      const rate = (n: string) => stats[n].lit / N;
      expect(rate('knower')).toBeGreaterThanOrEqual(0.9);
      expect(rate('nonKnower')).toBeLessThanOrEqual(0.2);
      expect(rate('misconception')).toBeLessThanOrEqual(0.05);
      expect(stats.partial.stays / N).toBeLessThanOrEqual(0.25);
      expect(stats.knower.reopened / Math.max(1, stats.knower.lit)).toBeLessThanOrEqual(0.1);
      expect(stats.knower.items / N).toBeLessThan(4.6);
    });
  }
  it('the start node is table-driven: the earliest remedial node any wrong item points to (all answers used)', () => {
    for (const card of CARDS) {
      const order = REMEDIAL_ORDER[card];
      const items = CERT_ITEMS[card];
      for (let mask = 1; mask < 16; mask++) {
        const wrong = items.filter((_, i) => mask & (1 << i));
        const want = Math.min(...wrong.map((w) => order.indexOf(CERT_MAP[card][`${w.fam}:${w.band}`])));
        expect(order.indexOf(startNodeOf(card, wrong))).toBe(want);
        if (wrong.length >= 2) expect(evaluateCert(card, items.map((s, i) => ({ fam: s.fam, band: s.band, ok: !(mask & (1 << i)) }))).startNode).toBe(order[want]);
      }
    }
  });
  it('no early stop: every verdict is computed from all 4 (or 6) answers; applyCert stores them all', () => {
    const save = defaultSave(); save.session.missions = 1;
    const bad = CERT_ITEMS.C2.map((s) => ({ fam: s.fam, band: s.band, ok: false }));
    const out = applyCert(save, 'C2', bad, 5);
    expect(out.state).toBe('half'); expect(save.cert.C2.answers).toBe('0000'); expect(save.cert.C2.state).toBe('half');
    // nodes before the start are skipped (cert), the start node is open
    expect(save.nodes['cert.C2.1']?.st ?? 'open').toBe('open');
    const half = defaultSave(); half.session.missions = 1;
    applyCert(half, 'C3', CERT_ITEMS.C3.map((s, i) => ({ fam: s.fam, band: s.band, ok: i !== 3 && i !== 0 })), 5);   // wrong: T1a (C3.1) and T2b (thinkAdd → C3.3)
    expect(half.cert.C3.state).toBe('half'); expect(half.nodes['cert.C3.1']?.st ?? 'open').toBe('open');
    const one = defaultSave(); one.session.missions = 1;
    expect(applyCert(one, 'C1', CERT_ITEMS.C1.map((s, i) => ({ fam: s.fam, band: s.band, ok: i !== 2 })), 5).state).toBe('need-extra');
    expect(one.cert.C1.state).toBe('none');
    const lit = defaultSave(); lit.session.missions = 1;
    applyCert(lit, 'C1', CERT_ITEMS.C1.map((s) => ({ fam: s.fam, band: s.band, ok: true })), 5);
    expect(lit.cert.C1.state).toBe('lit'); expect(Object.keys(lit.nodes).filter((k) => k.startsWith('cert.C1.') && lit.nodes[k].st === 'skipped').length).toBe(REMEDIAL_ORDER.C1.length);
  });
});

describe('V6 number line: scoring, degenerate detection, difficulty gates', () => {
  const profiles: Record<string, (L: number, t: number, r: Rng) => number> = {
    'linear σ=3%': (L, t, r) => t + normal(r) * 0.03 * L * g(Math.min(t, L - t) / L),
    'linear σ=6%': (L, t, r) => t + normal(r) * 0.06 * L * g(Math.min(t, L - t) / L),
    'linear σ=9%': (L, t, r) => t + normal(r) * 0.09 * L * g(Math.min(t, L - t) / L),
    'linear σ=12%': (L, t, r) => t + normal(r) * 0.12 * L * g(Math.min(t, L - t) / L),
    log: (L, t, r) => (L * Math.log(t + 1)) / Math.log(L + 1) + normal(r) * 0.06 * L,
    mixed: (L, t, r) => 0.5 * t + (0.5 * L * Math.log(t + 1)) / Math.log(L + 1) + normal(r) * 0.06 * L,
    compressed: (L, t, r) => 0.75 * t + 0.1 * L + normal(r) * 0.05 * L,
  };
  const passRate = (L: 100 | 1000, name: string) => {
    const r = createRng(`v6a:${L}:${name}`); let pass = 0; const n = FULL ? 10000 : 2000;
    for (let k = 0; k < n; k++) {
      const set = CALIBRATION_TARGETS[L][k % CALIBRATION_TARGETS[L].length];
      const est = set.map((t) => Math.max(0, Math.min(L, Math.round(profiles[name](L, t, r)))));
      if (scoreCalibration(L, set, est).pass) pass++;
    }
    return pass / n;
  };
  for (const L of [100, 1000] as const) {
    it(`(a) 0–${L}: linear σ ≤ 6 % passes ≥ 90 %, σ=12 % still ≥ 50 %; log / mixed / compressed ≤ 1 %`, () => {
      expect(passRate(L, 'linear σ=3%')).toBeGreaterThanOrEqual(0.9);
      expect(passRate(L, 'linear σ=6%')).toBeGreaterThanOrEqual(0.9);
      expect(passRate(L, 'linear σ=12%')).toBeGreaterThanOrEqual(0.5);
      for (const p of ['log', 'mixed', 'compressed']) expect(passRate(L, p), p).toBeLessThanOrEqual(0.01);
    });
  }
  it('(e) finger noise σ = 1.5 px does not break a σ = 6 % child (≥ 90 %)', () => {
    const r = createRng('v6e'); let pass = 0; const n = 2000; const L = 1000; const pxPerUnit = 358 / L;
    for (let k = 0; k < n; k++) {
      const set = CALIBRATION_TARGETS[1000][0];
      const est = set.map((t) => Math.max(0, Math.min(L, Math.round(t + normal(r) * 0.06 * L * g(Math.min(t, L - t) / L) + (normal(r) * 1.5) / pxPerUnit))));
      if (scoreCalibration(L, set, est).pass) pass++;
    }
    expect(pass / n).toBeGreaterThanOrEqual(0.9);
  });
  it('(f) degenerate calibrations (12 near-identical estimates) are invalid and never pass', () => {
    for (const L of [100, 1000] as const) {
      const set = CALIBRATION_TARGETS[L][0];
      for (const v of [0, L / 2, L]) { const s = scoreCalibration(L, set, set.map(() => v)); expect(s.degenerate).toBe(true); expect(s.pass).toBe(false); }
      const jitter = set.map((_, i) => Math.round(L * 0.5 + (i % 2 ? 3 : -3)));
      expect(scoreCalibration(L, set, jitter).degenerate).toBe(true);
      expect(scoreCalibration(L, set, [...set]).degenerate).toBe(false);
      expect(scoreCalibration(L, set, [...set]).pass).toBe(true);
    }
  });
  it('(g) difficulty gates per node (entry L3 / top L6 / floor L1) use the real tolerance table and the real target sampler', () => {
    const rows: string[] = [];
    for (const cfg of nlNodes()) {
      const e = [3, 6, 9].map((s) => nodeFirstTry(s / 100, cfg, GATE.entry.level));
      const t = [3, 6, 9].map((s) => nodeFirstTry(s / 100, cfg, GATE.top.level));
      const f = nodeFirstTry(0.12, cfg, GATE.floor.level);
      rows.push(`${cfg.id} entry ${e.map((x) => x.toFixed(2))} top ${t.map((x) => x.toFixed(2))} floor ${f.toFixed(2)}`);
      expect(e[1], `${cfg.id} entry σ6 ${e[1]}`).toBeGreaterThanOrEqual(GATE.entry.s6[0]); expect(e[1], `${cfg.id} entry σ6`).toBeLessThanOrEqual(GATE.entry.s6[1]);
      expect(e[2], `${cfg.id} entry σ9`).toBeGreaterThanOrEqual(GATE.entry.s9min);
      expect(t[0], `${cfg.id} top σ3`).toBeLessThanOrEqual(GATE.top.s3max); expect(t[1], `${cfg.id} top σ6`).toBeGreaterThanOrEqual(GATE.top.s6min); expect(t[2], `${cfg.id} top σ9`).toBeGreaterThanOrEqual(GATE.top.s9min);
      expect(f, `${cfg.id} floor σ12`).toBeGreaterThanOrEqual(GATE.floor.s12min);
    }
    if (process.env.MARS_VERBOSE) console.log(rows.join('\n'));
  });
  it('(g) expectedFirstTry in nodes.json is DERIVED from the model (σ=6 %, L3, rounded to .05), never hand-written', () => {
    for (const cfg of nlNodes()) {
      const want = Math.round(nodeFirstTry(0.06, cfg, 3) * 20) / 20;
      expect(NODE_BY_ID[cfg.id].expectedFirstTry, cfg.id).toBeCloseTo(want, 6);
    }
  });
  it('sdOf: error SD shrinks near labels and saturates at 25 % of L away from them', () => {
    expect(sdOf(0.06, 50, 100, 'half')).toBeLessThan(sdOf(0.06, 27, 100, 'half'));
    expect(sdOf(0.06, 25, 100, 'half')).toBeCloseTo(0.06 * 100, 6);
  });
});
