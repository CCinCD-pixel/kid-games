/**
 * V2 + V0(venues) (spec §9.2): each venue × player model plays 3-minute 限时赛 at heat 0; KID top-3 rate in the
 * band (Wilson 95 % — fail only when the whole interval is outside), not rising moon→blackhole, NOVICE moon
 * ≥15 % / blackhole ≤15 %, best model ≥25 %, EXPERT ≥ KID ≥ NOVICE (non-overlapping inversions fail).
 * Full tier only (SB_FULL=1; N = 120 per spec, SB_N overrides for a smoke run).
 */
import { describe, expect, it } from 'vitest';
import { FULL, N_OVERRIDE, wilson, ciInBand, writeReport, P } from './bots';
import { VENUES, VENUE_IDS, runVenueMatch } from '../src/sim/venues';

const BAND = { moon: [0.60, 0.92], mars: [0.35, 0.65], jupiter: [0.20, 0.55], blackhole: [0.12, 0.40] } as Record<string, [number, number]>;
const MODELS = [['NOVICE', 'novice'], ['KID', 'kid'], ['EXPERT', 'expert']] as const;

describe.skipIf(!FULL)('V2 venue ladder', () => {
  it('KID podium bands, ordering, week-one reach', () => {
    const N = N_OVERRIDE || 120; const t0 = Date.now();
    const res: Record<string, Record<string, { k: number; n: number; p: number; ci: [number, number] }>> = {};
    for (const v of VENUE_IDS) {
      res[v] = {};
      for (const [model, persona] of MODELS) {
        let k = 0;
        for (let i = 0; i < N; i++) { const r = runVenueMatch(VENUES[v], model, persona, 20000 + i); if (r.rank <= 3) k++; }
        res[v][model] = { k, n: N, p: k / N, ci: wilson(k, N) };
      }
    }
    const gates: [boolean, string][] = [];
    for (const v of VENUE_IDS) {
      const K = res[v].KID, E = res[v].EXPERT, No = res[v].NOVICE;
      gates.push([ciInBand(K.ci, BAND[v]), `${v} KID top3 ${P(K.p)} [${P(K.ci[0])}–${P(K.ci[1])}] in ${P(BAND[v][0])}–${P(BAND[v][1])} (N ${N})`]);
      gates.push([!(No.ci[0] > K.ci[1]) && !(K.ci[0] > E.ci[1]), `${v} V0 order NOVICE ${P(No.p)} ≤ KID ${P(K.p)} ≤ EXPERT ${P(E.p)} (no non-overlapping inversion)`]);
      const best = Math.max(No.p, K.p, E.p), bestCi = [No, K, E].find((x) => x.p === best)!.ci;
      gates.push([bestCi[1] >= 0.25, `${v} best-bot top3 ${P(best)} ≥ 25%`]);
    }
    for (let i = 1; i < VENUE_IDS.length; i++) { const a = res[VENUE_IDS[i - 1]].KID, b = res[VENUE_IDS[i]].KID; gates.push([!(b.ci[0] > a.ci[1]), `KID top3 does not rise ${VENUE_IDS[i - 1]} ${P(a.p)} → ${VENUE_IDS[i]} ${P(b.p)}`]); }
    gates.push([res.moon.NOVICE.ci[1] >= 0.15, `moon NOVICE top3 ${P(res.moon.NOVICE.p)} ≥ 15% (week one can reach the podium)`]);
    gates.push([res.blackhole.NOVICE.ci[0] <= 0.15, `blackhole NOVICE top3 ${P(res.blackhole.NOVICE.p)} ≤ 15% (endgame is not trivial)`]);
    writeReport('v2-venues', { N, sec: Math.round((Date.now() - t0) / 1000), res, gates: gates.map(([ok, s]) => `${ok ? '✓' : '✗'} ${s}`) });
    const bad = gates.filter(([ok]) => !ok).map(([, s]) => s);
    expect(bad, bad.join('\n')).toEqual([]);
  }, 6 * 3600_000);
});
