// Negative controls (spec §11.1): the validators must FAIL on deliberately broken generators / controllers / tables. A band that cannot fail proves nothing.
// Usage: node negctl.mjs    exit code 1 if a broken component is NOT caught.
import { createRng } from './rng.mjs';
import { makeHistory, components8 } from './grid.mjs';
import { TABLE, nominal } from './params.mjs';
import { genS1, genS2 } from './gen.mjs';
import { reference, occ, tv, CELL_BAND, STEP, BOT_MAX } from './stats.mjs';
import { s2NN } from './bots.mjs';
import { CFG } from './controller.mjs';
import { evaluate } from './sim.mjs';
let bad = 0; const caught = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) bad += 1; };

// N1: the OLD centre-biased generator (every pattern hugs the middle of the board) must break the cell-occupancy band; the real generator must not
{
  const row = TABLE.s1[7], g = row.g, N = 1500, ref = reference('s1', row, 4000), ns = Math.min(N, ref.length >> 1), nullTV = tv(occ(g, ref.slice(0, ns)), occ(g, ref.slice(ns, 2 * ns)));
  const centre = new Set(); for (let r = 1; r < g - 1; r += 1) for (let c = 1; c < g - 1; c += 1) centre.add(r * g + c);
  const rng = createRng('neg:centre'), hist = makeHistory(64, 6), biased = [], honest = []; const rng2 = createRng('neg:honest'), hist2 = makeHistory(64, 6);
  while (biased.length < N) { const x = genS1(rng, row, hist); if (x.cells.filter((i) => centre.has(i)).length >= row.n - 1) biased.push(x.cells); }
  for (let i = 0; i < N; i += 1) honest.push(genS1(rng2, row, hist2).cells);
  const tvB = tv(occ(g, biased), occ(g, ref)), tvH = tv(occ(g, honest), occ(g, ref)), band = CELL_BAND(nullTV);
  caught(tvB > band, `N1 centre-biased generator FAILS the cell-occupancy band (distance ${tvB.toFixed(3)} > ${band.toFixed(3)})`);
  caught(tvH <= band, `N1 ...and the real generator passes it (${tvH.toFixed(3)} <= ${band.toFixed(3)})`);
}
// N2: a staircase that climbs on EVERY pass (no 4-up rule) must fall outside the first-try band
{
  const up0 = CFG.up; CFG.up = 1; const e = evaluate('medium', 's1', 20, 400); CFG.up = up0;
  caught(e.rate < 0.78, `N2 always-up controller (up=1) FAILS the first-try band (${(100 * e.rate).toFixed(1)}% < 78%)`);
}
// N3: a shuffled table must fail the ladder-monotone check
{
  const rng = createRng('neg:shuffle'), ok = (rows, s) => { const d = rows.map((r) => nominal(s, r)); return d.every((v, i) => i === 0 || (v - d[i - 1] >= STEP[s][0] && v - d[i - 1] <= STEP[s][1])); };
  caught(ok(TABLE.s1, 's1') && !ok(rng.shuffle(TABLE.s1), 's1') && !ok(rng.shuffle(TABLE.s3), 's3'), 'N3 shuffled s1 / s3 tables FAIL the ladder check; the real s1 passes');
}
// N4: an s2 generator without the nearest-star rejection leaks: a bot that remembers only the first star passes more than the allowed 5 %
{
  const row = { ...TABLE.s2[3], c: 0, L: 4, budget: 1 }, rng = createRng('neg:nn'), hist = makeHistory(64, 6); let pass = 0; const n = 400;
  for (let i = 0; i < n; i += 1) if (s2NN(genS2(rng, row, hist, { noNN: true }))) pass += 1;
  caught(pass / n > BOT_MAX.s2.nn, `N4 near-hop routes without the nn rejection FAIL the bot threshold (first-star + nearest-star bot passes ${(100 * pass / n).toFixed(0)}% > ${100 * BOT_MAX.s2.nn}%)`);
}
void components8;
console.log(`negative controls failed to catch: ${bad}`); process.exit(bad ? 1 : 0);
