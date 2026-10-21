// Six-week pacing check (spec §11.4): one child plays 3 sittings a week x 4 nights of 6 rounds (24 rounds, ~10 minutes); every night is in ONE sector,
// the least recently played open sector; sectors open in a chain (reach D4 in the previous one); gates are their own event at the start of a night.
// Counts gates, station upgrades and star-atlas cards week by week, and measures minutes per night with a tap-time model.
// Usage: node pacing.mjs [--runs=60] [--weeks=6] [--json=pacing-report.json]
import fs from 'node:fs';
import { createRng } from './rng.mjs';
import { makeHistory } from './grid.mjs';
import { generateSafe } from './gen.mjs';
import { SECTOR_IDS, tagsOf } from './params.mjs';
import { newSector, startNight, nextRound, report, gateStep, nightDone, nightValid, recommend, CFG, clearedGates } from './controller.mjs';
import { MODELS, attempt, SESSION } from './sim.mjs';
import { CARDS, unlocked, waiting } from './cards.mjs';
const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').split('=')[1] ?? d;
const SITTINGS = 3, NIGHTS = 4;

/** Seconds one round takes (hypothesis, spec 11.3): 3 ready + show + 0.6 fog + 4 think + 0.9 per tap + 3 result (+6 reveal after a miss). */
export function roundSeconds(s, x, res) {
  const show = s === 's1' ? x.previewMs / 1000 : s === 's2' ? x.L + 1 : s === 's3' ? x.showMs / 1000 + 1 : x.mode === 'vis' ? 3 : x.previewMs / 1000;
  const taps = s === 's1' || s === 's4' ? x.n : s === 's2' ? x.L : 2 * x.n + x.lures.length * 0.3;
  return 3 + show + 0.6 + 4 + 0.9 * taps + 3 + (res === 'miss' ? 6 : 0);
}
const med = (xs) => { const s = xs.slice().sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const pct = (xs, p) => { const s = xs.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };

export function simulate(modelName, seed, WEEKS = 6) {
  const child = MODELS[modelName], rng = createRng(seed), S = Object.fromEntries(SECTOR_IDS.map((s, i) => [s, newSector(s, i === 0)])), hist = {}, t = {}, last = {}, badStreak = {}, firstPass = {};
  const weekly = [], minutes = Object.fromEntries(SECTOR_IDS.map((s) => [s, []])), gateMin = []; let nights = 0, anyNights = 0, clock = 0, sr = 0, cardsPrev = 0, gateRounds = {}, sectorRounds = {};
  const H = (s, D) => (hist[`${s}${D}`] ??= makeHistory(64, 6));
  const maxL = (s) => Math.max(...S[s].tracks.map((x) => x.maxL));
  const milestone = (s, kind, n) => (kind === 'first' ? !!firstPass[s] : kind === 'level' ? maxL(s) >= n : S[s].tracks.some((tr) => tr.gates.slice(0, tr.cleared).includes(n)));
  const cardsNow = () => unlocked({ milestone, nights, veteran: false }).length;
  const refresh = () => SECTOR_IDS.forEach((s, i) => { if (i > 0 && !S[s].open && maxL(SECTOR_IDS[i - 1]) >= CFG.openAtL) S[s].open = true; });
  const playNight = (s) => {
    const st = S[s]; startNight(st); last[s] = clock++; const recs = []; let sec = 0, nightMisses = 0;
    while (!nightDone(st)) {
      const nr = nextRound(st); t[s] = t[s] || 0;
      if (nr.kind === 'gate') {
        const x = generateSafe(s, nr.D, rng, H(s, nr.D)), a = attempt(s, x, child, { t: t[s]++, sr: sr++ % SESSION, inGate: true }, rng), v = gateStep(st, a.res);
        const gs = roundSeconds(s, x, a.res); sec += gs; gateMin.push(gs / 60); gateRounds[s] = (gateRounds[s] || 0) + 1; continue;
      }
      if (nr.kind === 'demo') { report(st, 'neutral', {}); sec += 40; continue; }
      const x = generateSafe(s, nr.D, rng, H(s, nr.D)), a = attempt(s, x, child, { t: t[s]++, sr: sr++ % SESSION, inGate: false, scaffold: nr.kind === 'scaffold' }, rng);
      if (a.res === 'pass') firstPass[s] = true;
      if (a.res === 'miss') nightMisses += 1; report(st, a.res, { tags: tagsOf(s, x) }); sectorRounds[s] = (sectorRounds[s] || 0) + 1;
      recs.push({ showAnswer: a.res === 'miss' && rng.next() < 0.25 }); sec += roundSeconds(s, x, a.res);
    }
    badStreak[s] = nightMisses >= 3 ? (badStreak[s] || 0) + 1 : 0; anyNights += 1; if (nightValid(recs)) nights += 1; minutes[s].push(sec / 60); refresh();
  };
  refresh();
  for (let w = 1; w <= WEEKS; w += 1) {
    for (let k = 0; k < SITTINGS; k += 1) {
      sr = 0;
      for (let n = 0; n < NIGHTS; n += 1) { playNight(recommend(SECTOR_IDS.map((s) => ({ id: s, open: S[s].open, last: last[s] ?? -1, badStreak: badStreak[s] || 0 })), clock)); }
    }
    const c = cardsNow();
    weekly.push({ week: w, open: SECTOR_IDS.filter((s) => S[s].open).length, gates: SECTOR_IDS.reduce((a, s) => a + clearedGates(S[s]), 0), cards: c, newCards: c - cardsPrev, waiting: waiting({ milestone, nights, veteran: false }).length, upgrades: SECTOR_IDS.reduce((a, s) => a + clearedGates(S[s]), 0), wall: c });
    cardsPrev = c;
  }
  return { weekly, final: cardsNow(), minutes, gateMin, nights, anyNights, gateRounds, sectorRounds, S };
}

if (process.argv[1].endsWith('pacing.mjs')) {
  const RUNS = Number(arg('runs', 60)), WEEKS = Number(arg('weeks', 6)), jsonOut = arg('json', '');
  const report = { RUNS, WEEKS, models: {}, fails: [] }; const need = (c, m) => { if (!c) report.fails.push(m); };
  console.log(`${RUNS} runs, ${SITTINGS} sittings/week x ${NIGHTS} nights x ${CFG.nightRounds} rounds; earnable cards = 28 (+1 元老 from the old save); a gate is its own event outside the night`);
  for (const m of ['weak', 'medium', 'strong', 'habit', 'blind4']) {
    const all = Array.from({ length: RUNS }, (_, i) => simulate(m, `pace:${m}:${i}`, WEEKS));
    const col = (w, k) => med(all.map((r) => r.weekly[w - 1][k]));
    const wk = Array.from({ length: WEEKS }, (_, i) => ({ week: i + 1, open: col(i + 1, 'open'), gates: col(i + 1, 'gates'), cards: col(i + 1, 'cards'), newCardsMedian: col(i + 1, 'newCards'), newCardsP90: pct(all.map((r) => r.weekly[i].newCards), 0.9), waiting: col(i + 1, 'waiting') }));
    console.log(`${m.padEnd(7)} weekly median [open sectors / gates cleared (= station upgrades, max 12) / cards of 28 (= wall stars) | new cards median, p90 | waiting for nights]: ` + wk.map((x) => `w${x.week}:${x.open}/${x.gates}/${x.cards} | +${x.newCardsMedian},${x.newCardsP90} | ${x.waiting}`).join('   '));
    const fin = all.map((r) => r.final); console.log(`        final cards  p10 ${pct(fin, 0.1)}  median ${med(fin)}  p90 ${pct(fin, 0.9)}   valid nights median ${med(all.map((r) => r.nights))} of ${med(all.map((r) => r.anyNights))}`);
    const mins = Object.fromEntries(SECTOR_IDS.map((s) => [s, med(all.flatMap((r) => r.minutes[s]).length ? all.flatMap((r) => r.minutes[s]) : [0])]));
    console.log(`        minutes per night (median, gates included): ${SECTOR_IDS.map((s) => `${s} ${mins[s].toFixed(1)}`).join('  ')}; gate round median ${(60 * med(all.flatMap((r) => r.gateMin).length ? all.flatMap((r) => r.gateMin) : [0])).toFixed(0)} s`);
    report.models[m] = { weekly: wk, finalMedian: med(fin), finalP10: pct(fin, 0.1), finalP90: pct(fin, 0.9), minutesPerNight: mins };
    if (m === 'medium' || m === 'strong') { for (const x of wk) { need(x.newCardsP90 <= (x.week === 1 ? 7 : 5), `${m} week ${x.week}: p90 new cards ${x.newCardsP90} > ${x.week === 1 ? 7 : 5}`); need(x.week === 1 || x.newCardsMedian <= 4, `${m} week ${x.week}: median new cards ${x.newCardsMedian} > 4`); } need(report.models[m].finalP90 <= 28, 'cards > 28'); }
    if (m === 'strong') need(wk[WEEKS - 1].cards <= 25 && wk[1].cards <= 12, `strong: ${wk[1].cards} cards after week 2, ${wk[WEEKS - 1].cards} after ${WEEKS} (front-loading)`);
    if (m === 'blind4') {
      const gs = all.map((r) => (r.gateRounds.s4 || 0) / ((r.sectorRounds.s4 || 0) + (r.gateRounds.s4 || 0) || 1)), others = all.map((r) => r.weekly[WEEKS - 1].gates - clearedGates(r.S.s4)), mediumRef = med(Array.from({ length: Math.min(RUNS, 20) }, (_, i) => { const r = simulate('medium', `pace:medium:${i}`, WEEKS); return r.weekly[WEEKS - 1].gates - clearedGates(r.S.s4); }));
      const s4share = med(all.map((r) => (r.sectorRounds.s4 || 0) / Object.values(r.sectorRounds).reduce((a, b) => a + b, 0)));
      console.log(`        concept-blind (mirror) child: s4 gate rounds = ${(100 * med(gs)).toFixed(0)}% of its s4 play; gates cleared in s1-s3 median ${med(others)} (medium child ${mediumRef}); s4 gates cleared median ${med(all.map((r) => clearedGates(r.S.s4)))}; share of all rounds spent in s4 ${(100 * s4share).toFixed(0)}%`);
      need(med(gs) <= 0.15, `blind4: s4 gate rounds ${(100 * med(gs)).toFixed(0)}% > 15%`); need(med(others) >= mediumRef - 1, `blind4: s1-s3 progress ${med(others)} vs medium ${mediumRef}: blocked elsewhere`);
      report.models[m].blind = { s4GateShare: med(gs), othersGates: med(others), mediumGates: mediumRef, s4Share: s4share };
    }
  }
  console.log(`pacing checks failed: ${report.fails.length}`); report.fails.forEach((f) => console.log('  FAIL', f));
  if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(report, null, 1));
  process.exit(report.fails.length ? 1 : 0);
}
