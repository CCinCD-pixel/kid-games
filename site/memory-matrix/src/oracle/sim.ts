// @ts-nocheck
// GENERATED from tools/memory-matrix/proto/sim.mjs by sync-core.mjs - the oracle's validator, pointed at the TS core.
import { __exit } from './harness';
// Adaptive-learner simulation (spec §11.2). Simulated children attempt the REAL generated stimuli (demand measured on the stimulus,
// not on the table). Models are capacity-with-noise "slot + guess" children; they test the CONTROLLER and the TABLES, not real children.
// v1.1: per-row slip budget, one free look-again (2-look task), fatigue after round 20 of a session, 5% lapses, concept-blind children,
// nights (6 rounds), gates as their own event, controller.classify / gateStep as the only sources of the rules.
// Usage: node sim.mjs [--runs=100] [--rounds=400] [--json=sim-report.json]
import fs from 'node:fs';
import { createRng } from '../core/rng';
import { makeHistory } from '../core/grid';
import { SECTOR_IDS, demand, tagsOf } from '../core/params';
import { generateSafe } from '../core/gen';
import { OUT } from './paths';
import { CFG, newSector, startNight, nextRound, report, gateStep, classify, clearedGates, nightDone, primerGhost, reportPrimer } from '../core/controller';

const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').split('=')[1] ?? d;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const SESSION = 24;      // rounds in one sitting (4 nights): fatigue applies from round 20 of the sitting

// theta = working "slots" per sector, sigma = trial-to-trial noise, eps = per-tap accidental slip, lapse = P(attention lapse -> the round is lost),
// fatigue = theta drop from round 20 of a sitting, rewatch = P(look again before the 1st tap when unsure), rewatch2 = P(a 2nd look when still unsure),
// blind = concept tags this child cannot do at all (chance level), gain/tau = slow learning.
// ALL theta / demand numbers are hypotheses (spec 11.3): the telemetry list there says how to recalibrate them.
const base = { sigma: 0.6, eps: 0.02, lapse: 0.05, fatigue: 0.3, rewatch: 0, rewatch2: 0, gain: 0.8, tau: 200, blind: null };
export const MODELS = {
  weak:     { ...base, theta: { s1: 2.9, s2: 2.8, s3: 2.5, s4: 2.4 } },
  medium:   { ...base, theta: { s1: 4.2, s2: 3.9, s3: 3.5, s4: 3.3 } },
  strong:   { ...base, theta: { s1: 6.0, s2: 5.5, s3: 5.0, s4: 4.7 } },
  expert:   { ...base, theta: { s1: 12, s2: 10, s3: 12, s4: 9 }, sigma: 0.5, eps: 0.01, lapse: 0.01, fatigue: 0, gain: 0 },
  fumbler:  { ...base, theta: { s1: 4.2, s2: 3.9, s3: 3.5, s4: 3.3 }, eps: 0.08, gain: 0 },
  cautious: { ...base, theta: { s1: 4.2, s2: 3.9, s3: 3.5, s4: 3.3 }, rewatch: 0.8, rewatch2: 0.4, gain: 0 },
  habit:    { ...base, theta: { s1: 4.2, s2: 3.9, s3: 3.5, s4: 3.3 }, rewatch: 1.0, rewatch2: 0, gain: 0 },     // always takes the one free look
  blind4:   { ...base, theta: { s1: 4.2, s2: 3.9, s3: 3.5, s4: 3.3 }, blind: ['LR', 'UD', 'CW', 'CCW', 'R180'] },   // memory like medium, cannot do mirror / turn at all
};
const binom = (rng, n, p) => { let k = 0; for (let i = 0; i < n; i += 1) if (rng.next() < p) k += 1; return k; };

/** One first attempt. ctx = { t: rounds played so far in this sector, sr: index inside the sitting, inGate }. Returns { res, rw, slips }. */
export function attempt(sector, stim, child, ctx, rng) {
  const d = Math.max(1, demand[sector](stim) - (ctx.scaffold ? 1.0 : 0)), budget = stim.budget;       // scaffold = the first answer item is lit for free
  const theta = child.theta[sector] + child.gain * (1 - Math.exp(-ctx.t / child.tau)) - (ctx.sr >= 20 ? child.fatigue : 0);
  let K = theta + child.sigma * rng.gauss(), rwPre = 0;
  const blind = !!(child.blind && stim.tags.some((g) => child.blind.includes(g)));
  if (!blind && child.rewatch && K < d - 0.3 && rng.next() < child.rewatch) { rwPre = 1; K += 1.0; }
  if (!blind && !ctx.inGate && child.rewatch2 && K < d - 0.3 && rng.next() < child.rewatch2) { rwPre = 2; K += 0.6; }
  const f = blind ? 0 : clamp(K / d, 0, 1);
  let slips = 0;
  const motor = (taps) => { for (let i = 0; i < taps; i += 1) if (rng.next() < child.eps) slips += 1; };
  if (sector === 's1' || sector === 's4') {
    const n = stim.n, cellsN = sector === 's4' ? (stim.g * stim.g) / 2 : stim.g * stim.g, known = binom(rng, n, f); let unknown = n - known, left = cellsN - known;
    motor(n);
    while (unknown > 0 && slips <= budget) { if (rng.next() < unknown / left) unknown -= 1; else slips += 1; left -= 1; }
  } else if (sector === 's2') {
    motor(stim.L);
    for (let j = 0, left = stim.m; j < stim.L && slips <= budget; j += 1, left -= 1) {
      if (rng.next() < f) continue;                                        // item remembered
      let cand = left; while (slips <= budget) { if (rng.next() < 1 / cand) break; slips += 1; cand -= 1; if (cand < 1) break; }
    }
  } else {
    motor(stim.n);
    let freeHouses = stim.rows * stim.cols, tray = stim.n + stim.lures.length; const lures = stim.lures.length;
    const known = binom(rng, stim.n, f); freeHouses -= known; tray -= known;
    for (let u = stim.n - known; u > 0 && slips <= budget; u -= 1) {
      while (slips <= budget && rng.next() < lures / tray) slips += 1;                       // grabbed a visitor: put back
      let hit = false; while (!hit && slips <= budget) { if (rng.next() < 1 / freeHouses) hit = true; else slips += 1; }
      freeHouses -= 1; tray -= 1;
    }
  }
  if (rng.next() < child.lapse) slips = budget + 1;                         // attention lapse: the round is lost whatever the memory
  return { ...classify({ slips, budget, rwPre, hint: ctx.scaffold ? 1 : 0 }), slips };
}

let WIN = null;
const windows = () => { if (WIN === null) { try { WIN = JSON.parse(fs.readFileSync(`${OUT}/levels.json`, 'utf8')).window || {}; } catch { WIN = {}; } } return WIN; };
/** Play `rounds` regular rounds of ONE sector with the real controller + generators; returns the per-run log. */
export function playSector(sector, child, seed, rounds) {
  const rng = createRng(seed), st = newSector(sector, true), hist = {}, W = windows();
  const H = (D) => (hist[D] ??= makeHistory(W[`${sector}:${D}`] || 64, 6));
  const log = []; let t = 0, sr = 0, night = 0, fallbacks = 0, gates = { start: 0, passed: 0, rounds: 0, atGBelow3: 0 }, firstGateRound = null, regular = 0;
  const stim = (D) => { const x = generateSafe(sector, D, rng, H(D)); if (x.fallback) fallbacks += 1; return x; };
  const play = (D, inGate, scaffold = false) => { const x = stim(D), a = attempt(sector, x, child, { t, sr: sr % SESSION, inGate, scaffold }, rng); t += 1; sr += 1; return { a, x }; };
  while (regular < rounds) {
    startNight(st); night += 1;
    while (!nightDone(st) && regular < rounds) {
      const nr = nextRound(st);
      if (nr.kind === 'gate') {
        if (nr.i === 0) { gates.start += 1; if (st.tracks[st.cur].atG < CFG.atGMin) gates.atGBelow3 += 1; }
        const { a } = play(nr.D, true); gates.rounds += 1; log.push({ D: nr.D, res: a.res, kind: 'gate', night });
        const v = gateStep(st, a.res);
        if (v.verdict === 'passed') { gates.passed += 1; if (firstGateRound === null) firstGateRound = regular; }
        continue;
      }
      if (nr.kind === 'demo') { report(st, 'neutral', {}); log.push({ D: nr.D, res: 'neutral', kind: 'demo', night }); continue; }
      if (sector === 's4' && nr.kind === 'round') { const px = stim(nr.D), gh = primerGhost(st, px.axis); if (gh !== null) { reportPrimer(st, px.axis, !(child.blind && child.blind.includes(px.axis))); log.push({ D: nr.D, res: 'neutral', kind: 'primer', night }); continue; } }
      const { a, x } = play(nr.D, false, nr.kind === 'scaffold');
      log.push({ D: nr.D, res: a.res, kind: nr.kind, soft: nr.soft, night, slips: a.slips, rw: a.rw });
      report(st, a.res, { tags: tagsOf(sector, x) }); regular += 1;
    }
  }
  return { log, st, gates, firstGateRound, fallbacks };
}


/** v1.2 (QA r1): the flawless child (every round clean, primers clean). Real controller + real generated stimuli; returns the sequence of regular-round levels,
 *  where the gates were offered (as the count of regular rounds played before), and how many guided primers fell into night 1. */
export function flawless(sector, rounds = 24) {
  const rng = createRng(`flawless:${sector}`), st = newSector(sector, true), hist = {}, W = windows();
  const H = (D) => (hist[D] ??= makeHistory(W[`${sector}:${D}`] || 64, 6));
  const seq = [], gates = [], night1 = []; let regular = 0, night = 0;
  while (regular < rounds) {
    startNight(st); night += 1;
    while (!nightDone(st) && regular < rounds) {
      const nr = nextRound(st);
      if (nr.kind === 'gate') { if (nr.i === 0) gates.push(regular); gateStep(st, 'pass'); continue; }
      if (nr.kind === 'demo') { report(st, 'neutral', {}); continue; }
      const x = generateSafe(sector, nr.D, rng, H(nr.D));
      if (sector === 's4' && nr.kind === 'round' && primerGhost(st, x.axis) !== null) { reportPrimer(st, x.axis, true); if (night === 1) night1.push('p'); continue; }
      if (night === 1) night1.push('r');
      report(st, 'pass', { tags: tagsOf(sector, x) }); regular += 1; seq.push(nr.D);
    }
  }
  return { seq, gates, night1: night1.join('') };
}
const maxRun = (xs) => { let m = 1, c = 1; for (let i = 1; i < xs.length; i += 1) { c = xs[i] === xs[i - 1] ? c + 1 : 1; m = Math.max(m, c); } return xs.length ? m : 0; };

const mean = (xs) => xs.reduce((s, v) => s + v, 0) / (xs.length || 1);
const quant = (xs, p) => { const s = xs.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const BURN = 40, RATE_LO = 0.78, RATE_HI = 0.88;      // 4-up/1-down converges on 84.1 % (+ lapses / fatigue pull it a little lower)
const MEASURED = (x) => x.kind !== 'demo' && x.kind !== 'scaffold';

export function evaluate(modelName, sector, RUNS, ROUNDS) {
  const child = MODELS[modelName], rates = [], levels = [], missRuns = [], gateAtt = [], firstGate = [], neutralRun = [], clearedAtEnd = [], D400 = [], D100 = [];
  const agg = { nights: 0, bad3: 0, gateRounds: 0, gateMiss: 0, regRounds: 0, regMiss: 0, gateStarts: 0, atGBelow3: 0, fallbacks: 0, total: 0, gateRoundsAll: 0, rw: 0, floorStuck: 0, top: 0, meas: 0, run5: 0, allRounds: 0 };
  for (let r = 0; r < RUNS; r += 1) {
    const p = playSector(sector, child, `sim:${modelName}:${sector}:${r}`, ROUNDS), tail = p.log.slice(BURN), meas = tail.filter(MEASURED);
    rates.push(meas.filter((x) => x.res === 'pass').length / meas.length); levels.push(mean(tail.map((x) => x.D)));
    let run = 0, mx = 0, nrun = 0, nmx = 0; const byNight = {};
    for (const x of p.log) { run = x.res === 'miss' ? run + 1 : 0; mx = Math.max(mx, run); if (run === 5) agg.run5 += 1; nrun = x.res === 'neutral' ? nrun + 1 : 0; nmx = Math.max(nmx, nrun); }
    for (const x of tail) {
      if (x.kind === 'gate') { agg.gateRounds += 1; if (x.res === 'miss') agg.gateMiss += 1; } else if (MEASURED(x)) { agg.regRounds += 1; if (x.res === 'miss') agg.regMiss += 1; (byNight[x.night] ??= []).push(x.res); }
      if (x.rw) agg.rw += 1;
      if (MEASURED(x)) { agg.meas += 1; if (x.D >= 14) agg.top += 1; }
    }
    for (const arr of Object.values(byNight)) if (arr.length === CFG.nightRounds) { agg.nights += 1; if (arr.filter((v) => v === 'miss').length >= 3) agg.bad3 += 1; }
    missRuns.push(mx); neutralRun.push(nmx); gateAtt.push(p.gates.start); agg.gateStarts += p.gates.start; agg.atGBelow3 += p.gates.atGBelow3; agg.fallbacks += p.fallbacks;
    agg.total += p.log.length; agg.allRounds += p.log.length; agg.gateRoundsAll += p.log.filter((x) => x.kind === 'gate').length;
    if (p.firstGateRound !== null) firstGate.push(p.firstGateRound);
    clearedAtEnd.push(clearedGates(p.st)); D100.push(p.log[99].D); D400.push(p.log[p.log.length - 1].D);
    let fl = 0; p.log.forEach((x) => { if ((x.D === 1 || x.D === 11) && x.res === 'miss') { fl += 1; if (fl === 4) agg.floorStuck += 1; } else fl = 0; });
  }
  return { model: modelName, sector, rate: mean(rates), rateLo: quant(rates, 0.05), rateHi: quant(rates, 0.95), meanD: mean(levels), D100: quant(D100, 0.5), D400: quant(D400, 0.5),
    missRunP99: quant(missRuns, 0.99), missRunMax: Math.max(...missRuns), gateAttemptsMean: mean(gateAtt), gatesClearedMedian: quant(clearedAtEnd, 0.5),
    firstGateMedian: firstGate.length ? quant(firstGate, 0.5) : null, firstGateShare: firstGate.length / RUNS, neutralRunMax: Math.max(...neutralRun),
    run5Rate: (1000 * agg.run5) / agg.allRounds, topShare: agg.top / agg.meas, badNight: agg.nights ? agg.bad3 / agg.nights : 0, gateShare: agg.gateRoundsAll / agg.total, gateMiss: agg.gateRounds ? agg.gateMiss / agg.gateRounds : null,
    regMiss: agg.regMiss / agg.regRounds, gateAtGBelow3: agg.atGBelow3, gateStarts: agg.gateStarts, fallbacks: agg.fallbacks, floorStuck: agg.floorStuck, rwRate: agg.rw / agg.total };
}

if ((process.argv[1] ?? '').endsWith('sim.mjs')) {
  const RUNS = Number(arg('runs', 100)), ROUNDS = Number(arg('rounds', 400)), jsonOut = arg('json', '');
  const fails = []; const need = (c, m) => { if (!c) fails.push(m); return c ? 'ok' : 'FAIL'; };
  const out = [];
  console.log(`runs=${RUNS} rounds=${ROUNDS} burn-in=${BURN} nights of ${CFG.nightRounds}; rate = first-attempt pass (a look-again before the 1st tap still counts as a pass)`);
  console.log('model     sector | rate [5%..95%]      | meanD D100 D400 | gates med/att  1st gate@ | missRun p99/max | bad-night | gate%/gateMiss/regMiss | neutral | floor | fb');
  for (const m of Object.keys(MODELS)) for (const s of SECTOR_IDS) {
    const e = evaluate(m, s, RUNS, ROUNDS); out.push(e);
    const main = ['medium', 'strong', 'weak', 'habit'].includes(m), ceiling = e.topShare >= 0.5; let verdict = '';
    if (main) verdict = ceiling ? 'CEIL' : need(e.rate >= RATE_LO && e.rate <= RATE_HI, `${m}/${s}: first-try rate ${(100 * e.rate).toFixed(1)}% outside ${100 * RATE_LO}..${100 * RATE_HI}%`);
    if (m === 'expert') verdict = need(e.gatesClearedMedian === 3, `${m}/${s}: expert should clear every gate (median ${e.gatesClearedMedian})`);
    if (m !== 'blind4') {
      need(e.missRunP99 <= 5 && e.missRunMax <= (main ? 6 : 7) && (main ? e.floorStuck === 0 && e.run5Rate <= 0.1 : true), `${m}/${s}: dead loop? miss run p99 ${e.missRunP99} max ${e.missRunMax}, >=5-in-a-row ${e.run5Rate.toFixed(2)} per 1000 rounds, floor-stuck runs ${e.floorStuck}`);
      if (main) need(e.badNight <= 0.08 || ceiling, `${m}/${s}: bad nights (>=3 misses in 6) ${(100 * e.badNight).toFixed(1)}% > 8%`);
    }
    need(e.gateAtGBelow3 === 0, `${m}/${s}: a gate started with < ${CFG.atGMin} rounds at its level (${e.gateAtGBelow3}x)`);
    need(e.neutralRunMax <= 12, `${m}/${s}: neutral run ${e.neutralRunMax} > 12`);
    if (m === 'blind4' && s === 's4') need(e.gateShare <= 0.15, `blind4/s4: gate rounds ${(100 * e.gateShare).toFixed(0)}% of play > 15% (unwinnable gate loop)`);
    if (m === 'habit') need(true, '');
    console.log(`${m.padEnd(9)} ${s} | ${(100 * e.rate).toFixed(1).padStart(5)}% [${(100 * e.rateLo).toFixed(0)}..${(100 * e.rateHi).toFixed(0)}] ${verdict.padEnd(4)} | ${e.meanD.toFixed(1).padStart(4)} ${String(e.D100).padStart(3)} ${String(e.D400).padStart(4)} | ${e.gatesClearedMedian}/${e.gateAttemptsMean.toFixed(1).padStart(4)}  ${String(e.firstGateMedian ?? '-').padStart(5)} (${(100 * e.firstGateShare).toFixed(0)}%) | ${e.missRunP99}/${e.missRunMax} (${e.run5Rate.toFixed(2)}) | ${(100 * e.badNight).toFixed(1)}% | ${(100 * e.gateShare).toFixed(0)}%/${e.gateMiss === null ? '-' : (100 * e.gateMiss).toFixed(0) + '%'}/${(100 * e.regMiss).toFixed(0)}% | ${e.neutralRunMax} | ${e.floorStuck} | ${e.fallbacks}`);
  }
  // gate rounds are a sequential test, so a failed gate is >= 40 % misses by construction: judged pooled over the four sectors
  for (const m of ['weak', 'medium', 'strong', 'habit']) { const xs = out.filter((x) => x.model === m && x.gateMiss !== null); const pooled = xs.reduce((a, x) => a + x.gateMiss * x.gateShare, 0) / xs.reduce((a, x) => a + x.gateShare, 0); need(pooled <= 0.35, `${m}: pooled gate-round miss rate ${(100 * pooled).toFixed(0)}% > 35%`); console.log(`pooled gate-round miss rate ${m}: ${(100 * pooled).toFixed(0)}% (regular rounds ~${(100 * mean(out.filter((x) => x.model === m).map((x) => x.regMiss))).toFixed(0)}%)`); }
  // habit-rewatch child must not sink: final level >= medium - 1 in every sector
  for (const s of SECTOR_IDS) { const h = out.find((x) => x.model === 'habit' && x.sector === s), m = out.find((x) => x.model === 'medium' && x.sector === s); need(h.meanD >= m.meanD - 1, `habit/${s}: mean D ${h.meanD.toFixed(1)} < medium ${m.meanD.toFixed(1)} - 1`); }
  // v1.2 (QA r1, "a strong child plays 11 identical D5 rounds"): the flawless child meets the first star gate within night 1-2 and keeps seeing new levels
  for (const sc of SECTOR_IDS) {
    const f = flawless(sc, 24), first = f.gates[0];
    console.log(`flawless ${sc}: gate@${f.gates.join(',')} levels ${f.seq.join(' ')} night1 ${f.night1}`);
    const lim = { s1: [4, 2, 4], s2: [4, 2, 4], s3: [5, 3, 4], s4: [9, 5, 5] }[sc];       // [first gate within, max run in the first 8 rounds, max run in the first 16]; s3/s4 gates also wait for >= 3 clean passes of each concept tag
    need(first !== undefined && first <= lim[0], `flawless/${sc}: first gate offered after ${first} regular rounds (must be <= ${lim[0]}, i.e. inside night 1-2)`);
    need(maxRun(f.seq.slice(0, 8)) <= lim[1], `flawless/${sc}: a level repeated more than ${lim[1]}x in a row within the first 8 rounds (${f.seq.slice(0, 8).join(',')})`);
    need(maxRun(f.seq.slice(0, 16)) <= lim[2], `flawless/${sc}: a level repeated ${maxRun(f.seq.slice(0, 16))} times in a row in the first 16 rounds`);
    need(new Set(f.seq.slice(0, 12)).size >= 5, `flawless/${sc}: only ${new Set(f.seq.slice(0, 12)).size} different levels in the first 12 rounds`);
    if (sc === 's4') need((f.night1.match(/p/g) || []).length <= 3, `flawless/s4: ${(f.night1.match(/p/g) || []).length} guided primers in night 1 (must be <= 3): ${f.night1}`);
  }
  console.log(`\nsim checks failed: ${fails.length}`); fails.forEach((f) => console.log('  FAIL', f));
  if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify({ RUNS, ROUNDS, BURN, out, fails }, null, 1));
  __exit(fails.length ? 1 : 0);
}
