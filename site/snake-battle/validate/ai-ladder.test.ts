/**
 * V16 (spec §9.2) — AI against AI, no player: (a) tier ladder T1–T4 (16 snakes, R 2150) and (b) persona
 * signatures on the jupiter roster (T3, 19 snakes). Full tier only (SB_FULL=1; N = 96 each, SB_N overrides).
 * The thresholds are the prototype gates.mjs V16 lines; the report goes to ~/kid-games-work/snake-battle/.
 */
import { describe, expect, it } from 'vitest';
import { FULL, N_OVERRIDE, LADDER, runLadderMatch, runPersonaMatch, aggLadder, writeReport, P, type LadderRow } from './bots';

describe.skipIf(!FULL)('V16 AI ladder + persona signatures', () => {
  it('tiers climb and personas behave as named', () => {
    const N = N_OVERRIDE || 96;
    const lr: LadderRow[] = [], pr: LadderRow[] = [];
    const t0 = Date.now();
    for (let k = 0; k < N; k++) { lr.push(...runLadderMatch(k + 1)); pr.push(...runPersonaMatch('jupiter', k + 1)); }
    const L = LADDER.tiers.map((t) => aggLadder(lr.filter((r) => r.tier === t)));
    const PS = Object.fromEntries(['forager', 'hunter', 'coiler', 'scavenger', 'skittish', 'daredevil'].map((p) => [p, aggLadder(pr.filter((r) => r.persona === p))]));
    const fo = PS.forager;
    const others = (m: string, self: string) => Math.max(...Object.entries(PS).filter(([k]) => k !== self).map(([, a]) => a.modes[m]));
    const upKD = (L[2].kills * L[2].n + L[3].kills * L[3].n) / (L[2].deaths * L[2].n + L[3].deaths * L[3].n);
    const f2 = (x: number) => x.toFixed(2);
    const gates: [boolean, string][] = [
      [L[0].kills < L[1].kills && L[1].kills < L[2].kills && L[3].kills >= L[2].kills - 0.2, `tier ladder kills/snake/match T1 < T2 < T3, T4 ≥ T3 − 0.2: ${L.map((x) => f2(x.kills)).join(' → ')}`],
      [L[0].kd < L[1].kd && L[1].kd < L[2].kd && L[3].kd >= L[2].kd - 0.15, `tier ladder K/D T1 < T2 < T3, T4 ≥ T3 − 0.15: ${L.map((x) => f2(x.kd)).join(' → ')}`],
      [upKD >= 1.4 * L[0].kd, `upper tiers (T3+T4) K/D ${f2(upKD)} ≥ 1.4 × T1 ${f2(L[0].kd)}`],
      [(L[2].peak + L[3].peak) / 2 >= 1.05 * L[0].peak, `upper tiers grow longer: mean peak T3/T4 ${((L[2].peak + L[3].peak) / 2).toFixed(0)} ≥ 1.05 × T1 ${L[0].peak.toFixed(0)}`],
      [PS.hunter.modes.hunt >= 1.8 * fo.modes.hunt && PS.hunter.cutShare >= 1.1 * fo.cutShare, `hunter: hunt decisions ${P(PS.hunter.modes.hunt)} ≥ 1.8 × forager ${P(fo.modes.hunt)}; cut share ${P(PS.hunter.cutShare)} ≥ 1.1 × forager ${P(fo.cutShare)}`],
      [PS.coiler.modes.coil >= 0.10 && PS.coiler.modes.coil >= 4 * others('coil', 'coiler'), `coiler: coil decisions ${P(PS.coiler.modes.coil)} ≥ 10% and ≥ 4 × any other persona (${P(others('coil', 'coiler'))})`],
      [PS.scavenger.modes.scav >= 1.4 * fo.modes.scav && PS.scavenger.dropShare >= 1.1 * fo.dropShare, `scavenger: drop-chasing ${P(PS.scavenger.modes.scav)} ≥ 1.4 × forager ${P(fo.modes.scav)}; drops in diet ${P(PS.scavenger.dropShare)} ≥ 1.1 × forager ${P(fo.dropShare)}`],
      [PS.skittish.modes.hunt === 0 && PS.skittish.deaths <= 0.8 * fo.deaths, `skittish: never hunts (${P(PS.skittish.modes.hunt)}); deaths/match ${f2(PS.skittish.deaths)} ≤ 0.8 × forager ${f2(fo.deaths)}`],
      [PS.daredevil.boostSec >= 3 * fo.boostSec && PS.daredevil.deaths >= 1.2 * fo.deaths, `daredevil: boost ${PS.daredevil.boostSec.toFixed(1)} s/match ≥ 3 × forager ${fo.boostSec.toFixed(1)} s; deaths ${f2(PS.daredevil.deaths)} ≥ 1.2 × forager ${f2(fo.deaths)}`],
    ];
    writeReport('v16-ai-ladder', { N, sec: Math.round((Date.now() - t0) / 1000), ladder: Object.fromEntries(LADDER.tiers.map((t, i) => [t, L[i]])), persona: PS, gates: gates.map(([ok, s]) => `${ok ? '✓' : '✗'} ${s}`) });
    const bad = gates.filter(([ok]) => !ok).map(([, s]) => s);
    expect(bad, bad.join('\n')).toEqual([]);
  }, 4 * 3600_000);
});
