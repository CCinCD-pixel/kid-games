/**
 * V3 / V0(missions) / V3-twin (spec §4.4.2, §9.2) with the production sim: every level × NOVICE/KID/EXPERT
 * (hook on), plus the NOVICE first twin. Production rule = Wilson 95 % intervals (fail only when the whole
 * interval is outside a band; inversions only when intervals do not overlap). The prototype tuned with
 * N = 120 and a stricter point rule (check-missions.mjs). Full tier only: SB_FULL=1 (N = 200; SB_N overrides;
 * SB_LEVELS=c3m1,c4m3 limits the levels).
 */
import { describe, expect, it } from 'vitest';
import { FULL, N_OVERRIDE, wilson, ciInBand, writeReport, P } from './bots';
import { MISSIONS, runMission, type Mission } from '../src/sim/mission';

const BAND: Record<string, [number, number]> = { start: [0.75, 1.0], build: [0.60, 1.0], turn: [0.50, 0.95], boss: [0.40, 0.80], breather: [0.90, 1.0] };
const STAR = { normal: [[0.30, 0.75], [0.10, 0.45]], boss: [[0.15, 0.60], [0.05, 0.35]] } as Record<string, [number, number][]>;
const MODELS = [['NOVICE', 'novice'], ['KID', 'kid'], ['EXPERT', 'expert']] as const;
const lessonTags = (m: Mission) => (m.objective.tags ?? (m.objective.tag ? [m.objective.tag] : null));

interface Row { ok: number; n: number; p: number; ci: [number, number]; s2: [number, number]; s3: [number, number]; s2p: number; s3p: number; timeouts: [number, number]; fid: [number, number] | null; orbit: [number, number] }
function measure(m: Mission, model: string, persona: string, N: number, twin = false): Row {
  let ok = 0, s2 = 0, s3 = 0, to = 0, orb = 0, fidOk = 0;
  const L = lessonTags(m);
  for (let i = 0; i < N; i++) {
    const r = runMission(m.id, model, persona, (twin ? 7000 : 5300) + i, { twin });
    if (r.ok) { ok++; if (L && r.goalTags.length > 0 && r.goalTags.every((t) => L.includes(t))) fidOk++; }
    if (r.stars >= 2) s2++; if (r.stars >= 3) s3++;
    if (!r.ok && r.why === 'cap') to++;
    if (r.orbitMax >= 4) orb++;
  }
  return { ok, n: N, p: ok / N, ci: wilson(ok, N), s2: wilson(s2, N), s3: wilson(s3, N), s2p: s2 / N, s3p: s3 / N, timeouts: wilson(to, N), fid: L ? wilson(fidOk, Math.max(1, ok)) : null, orbit: wilson(orb, N) };
}

describe.skipIf(!FULL)('V3 mission difficulty (production sim)', () => {
  it('bands, feasibility, steps, stars, timeouts, lesson fidelity, orbit, ordering, twins', () => {
    const N = N_OVERRIDE || 200; const t0 = Date.now();
    const only = process.env.SB_LEVELS ? process.env.SB_LEVELS.split(',') : null;
    const fails: string[] = []; const table: Record<string, unknown> = {}; const lines: string[] = [];
    let prev: { id: string; ch: number; K: Row } | null = null;
    for (const m of MISSIONS) {
      if (only && !only.includes(m.id)) continue;
      const R = Object.fromEntries(MODELS.map(([model, persona]) => [model, measure(m, model, persona, N)])) as Record<string, Row>;
      const T = measure(m, 'NOVICE', 'novice', N, true);
      const K = R.KID, E = R.EXPERT, No = R.NOVICE; const chk: string[] = [];
      const band = m.ch === 1 ? (m.role === 'boss' ? [0.55, 0.85] as [number, number] : [0.85, 1.0] as [number, number]) : BAND[m.role];
      if (!ciInBand(K.ci, band)) chk.push(`band KID [${P(K.ci[0])}–${P(K.ci[1])}] outside ${P(band[0])}–${P(band[1])}`);
      const isRace = m.objective.type === 'race';
      const hunted = m.objective.type === 'survive' && m.ai.some((a) => a.persona === 'hunter');
      const need = isRace ? 0.5 : hunted || m.role === 'boss' ? 0.75 : 0.85;
      const best = K.p >= E.p ? K : E;
      if (best.ci[1] < need) chk.push(`feasible: best ${P(best.p)} < ${P(need)}`);
      if (prev && prev.ch === m.ch && prev.K.ci[0] - K.ci[1] > (m.role === 'boss' ? 0.35 : 0.30)) chk.push(`step after ${prev.id}`);
      if (m.role === 'boss' && No.ci[0] > 0.70) chk.push(`boss NOVICE ${P(No.p)} > 70%`);
      if (m.stars[0].type !== 'clear') {
        const [b2, b3] = m.role === 'boss' ? STAR.boss : STAR.normal;
        if (!ciInBand(K.s2, b2)) chk.push(`2★ KID ${P(K.s2p)} not in ${P(b2[0])}–${P(b2[1])}`);
        if (!ciInBand(K.s3, b3)) chk.push(`3★ KID ${P(K.s3p)} not in ${P(b3[0])}–${P(b3[1])}`);
      }
      const deathFail = !m.playerRespawn && !['survive', 'race'].includes(m.objective.type);
      if (deathFail && (K.timeouts[0] > 0.05 || No.timeouts[0] > 0.15)) chk.push('timeouts');
      if (K.fid && K.ok > 0 && K.fid[1] < 0.70) chk.push(`lesson fidelity < 70%`);
      if (Math.max(K.orbit[0], No.orbit[0], E.orbit[0]) > 0.02) chk.push('orbit ≥4 s > 2%');
      if (No.ci[0] > K.ci[1] || K.ci[0] > E.ci[1]) chk.push(`V0 inversion N ${P(No.p)} K ${P(K.p)} E ${P(E.p)}`);
      const tNeed = isRace ? 0.60 : 0.80;
      if (T.ci[1] < tNeed) chk.push(`twin NOVICE ${P(T.p)} < ${P(tNeed)}`);
      if (T.fid && T.ok > 0 && T.fid[1] < 0.60) chk.push('twin fidelity < 60%');
      table[m.id] = { role: m.role, N: No.p, K: K.p, E: E.p, K2: K.s2p, K3: K.s3p, twinN: T.p };
      lines.push(`${m.id} ${m.role.padEnd(8)} N ${P(No.p)} K ${P(K.p)} [${P(K.ci[0])}–${P(K.ci[1])}] E ${P(E.p)} K2★ ${P(K.s2p)} K3★ ${P(K.s3p)} twinN ${P(T.p)} ${chk.length ? 'FAIL ' + chk.join('; ') : 'ok'}`);
      if (chk.length) fails.push(`${m.id}: ${chk.join('; ')}`);
      prev = { id: m.id, ch: m.ch, K };
    }
    writeReport(only ? `v3-missions-${only.join('_')}` : 'v3-missions', {   // a subset run never overwrites the full report
       N, sec: Math.round((Date.now() - t0) / 1000), table, lines, fails });
    expect(fails, fails.join('\n')).toEqual([]);
  }, 12 * 3600_000);
});
