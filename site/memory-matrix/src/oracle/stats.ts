// @ts-nocheck
// GENERATED from tools/memory-matrix/proto/stats.mjs by sync-core.mjs - the oracle's validator, pointed at the TS core.
import { __exit } from './harness';
// Generator statistics: >= N samples per (sector, D) with the page's real no-repeat history, checked against the acceptance bands of spec §11.1,
// plus baseline bots (what you pass without the skill) and the generator's rejection statistics.
// Usage: node stats.mjs [--n=2000] [--json=stats-report.json] [--sector=s1] [--stretch]    exit code 1 if any band fails.
import fs from 'node:fs';
import { createRng } from '../core/rng';
import { makeHistory, components8, symmetries, canon, apply, hamming, NON_ID, isCollinear, halfOf, halfImages } from '../core/grid';
import { TABLE, SECTOR_IDS, demand, trackIdx, PREVIEW_MIN_MS, STRETCH, NDIFF } from '../core/params';
import { generate, genRot, S2_MIN_DIST, featPairs, NN_MAX } from '../core/gen';
import { s1Bot, s2Chance, s2NN, s3Bot, s4Bot } from './bots';

const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').split('=')[1] ?? d;
const N = Number(arg('n', 2000)), only = arg('sector', ''), jsonOut = arg('json', ''), STRETCH_ON = process.argv.includes('--stretch');
const mean = (xs) => xs.reduce((s, v) => s + v, 0) / xs.length;
const q = (xs, p) => { const s = xs.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const NOHIST = { has: () => false, hasShape: () => false, push() {} };
const pct = (x) => `${(100 * x).toFixed(1)}%`;
export const STEP = { s1: [0.15, 1.1], s2: [0.15, 1.3], s3: [0.15, 1.1], s4: [0.15, 1.1] };      // allowed demand step between neighbouring D inside a wing
export const BOT_MAX = { s1: { m0: 0.03, m2: 0.3 }, s2: { chance: 0.1, nn: 0.05 }, s3: { chance: 0.1, occ: 0.25, whoOcc: 0.25 }, s4: { chance: 0.1, known1: 0.35 } };
export const CELL_BAND = (nullTV) => Math.max(0.08, 2 * nullTV);      // occupancy distance to the uniform reference sampler (spec text says exactly this)

// ---- reference sampler: uniform over ALL admissible patterns (rejection sampling; the validator's ground truth)
export function reference(sector, row, count) {
  const g = row.g, all = [...Array(g * g).keys()], r = createRng(`ref:${sector}:${row.D}`), acc = [], byK = {};
  for (let d = 0; d < 600000 && (sector === 's4' || acc.length < count); d += 1) {
    if (sector === 's1') {
      const cells = r.shuffle(all).slice(0, row.n).sort((a, b) => a - b);
      if (components8(g, cells).length !== row.k || symmetries(g, cells).length || (row.n >= 4 && isCollinear(g, cells))) continue;
      acc.push(cells);
    } else {                                                           // s4 mirror: uniform axis, side, subset of the source half, STRATIFIED by cluster count (k drawn uniformly like the generator does)
      const axis = r.pick(row.axes), side = r.int(0, 1), half = halfOf(g, axis, side), cells = r.shuffle(half).slice(0, row.n).sort((a, b) => a - b), k = components8(g, cells).length;
      if (k < row.kLo || k > Math.min(row.kHi, row.n) || (row.n >= 3 && isCollinear(g, cells))) continue;
      const im = halfImages(g, axis, side, cells); if (hamming(im.copy, im.target) < 4 || [im.flip, im.rot].some((w) => hamming(w, im.target) < 2)) continue;     // the same admissibility rules as the generator
      (byK[k] ??= []).push(cells); if (Object.keys(byK).length >= Math.min(row.kHi, row.n) - row.kLo + 1 && Object.values(byK).every((a) => a.length >= count)) break;
    }
  }
  if (sector === 's4') { const ks = Object.keys(byK); for (let i = 0; i < count && ks.length; i += 1) { const pool = byK[r.pick(ks)]; acc.push(pool[r.int(0, pool.length - 1)]); } }
  return acc;
}
export const occ = (g, list) => { const f = Array(g * g).fill(0); list.forEach((c) => c.forEach((i) => { f[i] += 1; })); const s = f.reduce((a, b) => a + b, 0); return f.map((v) => v / s); };
export const tv = (a, b) => 0.5 * a.reduce((s, v, i) => s + Math.abs(v - b[i]), 0);

export const fails = [];
const need = (cond, msg) => { if (!cond) fails.push(msg); return cond ? 'ok' : 'FAIL'; };
const BOTN = 600;

function run(sector, D) {
  const row = TABLE[sector][D - 1];
  const raw = []; { const r2 = createRng(`raw:${sector}:${D}`); for (let i = 0; i < N; i += 1) raw.push(generate(sector, D, r2, NOHIST).key); }
  const seen = new Map(); let pairs = 0; raw.forEach((k) => { const c = seen.get(k) || 0; pairs += c; seen.set(k, c + 1); });
  let rawRep = 0; raw.forEach((k, i) => { for (let j = Math.max(0, i - 63); j < i; j += 1) if (raw[j] === k) { rawRep += 1; break; } });
  const effPool = pairs ? Math.round((N * (N - 1)) / (2 * pairs)) : Infinity;
  const W = Math.min(64, Math.max(5, Math.floor(effPool / 3)));      // exact no-repeat window actually used = min(64, pool/3)
  const rng = createRng(`stats:${sector}:${D}`), hist = makeHistory(W, 6);
  const out = []; for (let i = 0; i < N; i += 1) out.push(generate(sector, D, rng, hist));
  const tries = out.map((x) => x.tries), rej = {}; out.forEach((x) => { for (const [k, v] of Object.entries(x.rej)) rej[k] = (rej[k] || 0) + v; });
  let dupExact = 0, dupShape = 0;
  out.forEach((x, i) => { for (let j = Math.max(0, i - W + 1); j < i; j += 1) if (out[j].key === x.key) { dupExact += 1; break; } });
  if (sector === 's1' || sector === 's4') out.forEach((x, i) => { const c = canon(x.g, x.cells); for (let j = Math.max(0, i - 6); j < i; j += 1) if (canon(out[j].g, out[j].cells) === c) { dupShape += 1; break; } });
  const base = { sector, D, N, W, triesMean: mean(tries), triesP99: q(tries, 0.99), triesMax: Math.max(...tries), dupExact, dupShape, rawRepeat64: rawRep / N, effPool, demand: 0, rej, ok: [], bots: {} };
  const ck = (cond, msg) => base.ok.push(need(cond, `${sector} D${D}: ${msg}`));
  ck(dupExact === 0, `repeat within ${W} rounds = ${dupExact}`);
  ck(base.triesMax < 2000, `generation tries max ${base.triesMax} (cap 4000)`);
  ck(out.every((x) => x.budget === row.budget), 'slip budget = row budget');
  const botRng = createRng(`bots:${sector}:${D}`), B = out.slice(0, Math.min(BOTN, N)), rate = (f) => B.filter((x) => f(x)).length / B.length;
  if (sector === 's1' || sector === 's4') {
    const g = row.g, ring = 1 - ((g - 2) / g) ** 2, area = sector === 's4' ? (g * g) / 2 : g * g;
    const dens = out.map((x) => x.cells.length / area), ks = out.map((x) => components8(g, x.cells).length);
    const border = mean(out.map((x) => x.cells.filter((i) => { const r = Math.floor(i / g), c = i % g; return r === 0 || c === 0 || r === g - 1 || c === g - 1; }).length / x.cells.length));
    Object.assign(base, { densityMax: Math.max(...dens), kMean: mean(ks), kMin: Math.min(...ks), kMax: Math.max(...ks), symmetric: sector === 's1' ? out.filter((x) => symmetries(g, x.cells).length).length : 0, collinear: out.filter((x) => isCollinear(g, x.cells)).length, borderRatio: border / ring });
    ck(base.densityMax <= (sector === 's1' ? 0.4 : 0.5), `density max ${pct(base.densityMax)} (s1 <= 40% of the board, s4 <= 50% of the source half)`);
    ck(base.symmetric === 0 && (row.n < 3 || base.collinear === 0 || (sector === 's1' && row.n < 4)), `symmetric ${base.symmetric}, collinear ${base.collinear}`);
    const ref = reference(sector, row, 4000);
    if (ref.length >= 1500) {
      const ns = Math.min(N, Math.floor(ref.length / 2)), nullTV = tv(occ(g, ref.slice(0, ns)), occ(g, ref.slice(ns, 2 * ns)));   // noise floor measured at the SAME sample size as the generator
      base.refN = ref.length; base.cellTV = tv(occ(g, out.map((x) => x.cells)), occ(g, ref)); base.nullTV = nullTV;
      ck(base.cellTV <= CELL_BAND(nullTV), `cell-occupancy distance to the uniform reference sampler ${base.cellTV.toFixed(3)} > max(0.08, 2 x noise floor ${nullTV.toFixed(3)}): no fixed centre like the old generator`);
    } else base.cellTV = NaN;
    ck(dupShape === 0, `same shape (rotated/mirrored) within 6 rounds = ${dupShape}`);
    ck(row.n === Math.min(...out.map((x) => x.cells.length)) && row.n === Math.max(...out.map((x) => x.cells.length)), 'lit count n exact');
    if (sector === 's1') {
      ck(base.kMin === row.k && base.kMax === row.k, `components exactly k=${row.k}, got ${base.kMin}..${base.kMax}`);
      ck(row.previewMs >= PREVIEW_MIN_MS, `preview ${row.previewMs} ms >= ${PREVIEW_MIN_MS}`);
      base.demand = mean(out.map((x) => demand.s1(x)));
      base.bots = { m0: rate((x) => s1Bot(x, 0, botRng)), m2: rate((x) => s1Bot(x, 2, botRng)) };
      if (row.n >= 4) { ck(base.bots.m0 <= BOT_MAX.s1.m0, `chance bot passes ${pct(base.bots.m0)} > ${pct(BOT_MAX.s1.m0)}`); ck(base.bots.m2 <= BOT_MAX.s1.m2, `2-stars-known bot passes ${pct(base.bots.m2)} > ${pct(BOT_MAX.s1.m2)}`); }
    } else {
      const inHalf = out.every((x) => { const h = new Set(halfOf(x.g, x.axis, x.side)), o = new Set(halfOf(x.g, x.axis, 1 - x.side)); return x.cells.every((c) => h.has(c)) && x.target.every((c) => o.has(c)); });
      const copyH = out.map((x) => hamming(x.copy, x.target)), wrongDistinct = out.every((x) => [x.copy, x.flip, x.rot].every((w) => hamming(w, x.target) >= 2));
      const reflOk = out.every((x) => x.target.join() === apply(x.axis, x.g, x.cells).join());
      Object.assign(base, { copyHamMin: Math.min(...copyH), wrongDistinct, axisShare: Object.fromEntries(row.axes.map((a) => [a, out.filter((x) => x.axis === a).length / N])), sideShare: out.filter((x) => x.side === 0).length / N });
      ck(inHalf, 'source stars all in the source half, answer cells all in the other half');
      ck(reflOk, 'answer = exact reflection across the mirror axis');
      ck(base.copyHamMin >= 4 && wrongDistinct, `"slide it across" differs from the answer by >= 2 cells (min ${base.copyHamMin / 2}) and flip / half-turn answers are distinguishable`);
      ck(Math.abs(base.sideShare - 0.5) < 0.05 && Object.values(base.axisShare).every((s) => s > 0.5 / row.axes.length), `axis / side balanced ${JSON.stringify(base.axisShare)} side0 ${base.sideShare.toFixed(2)}`);
      ck(base.kMin >= row.kLo && base.kMax <= Math.min(row.kHi, row.n), `clusters ${base.kMin}..${base.kMax} within [${row.kLo},${Math.min(row.kHi, row.n)}]`);
      base.demand = mean(out.map((x) => demand.s4(x)));
      base.bots = { chance: rate((x) => s4Bot(x, 0, botRng)), known1: rate((x) => s4Bot(x, 1, botRng)) };
      if (D >= 3 && row.n >= 3) { ck(base.bots.chance <= BOT_MAX.s4.chance, `chance bot passes ${pct(base.bots.chance)} > ${pct(BOT_MAX.s4.chance)}`); ck(base.bots.known1 <= BOT_MAX.s4.known1, `1-star-known bot passes ${pct(base.bots.known1)} > ${pct(BOT_MAX.s4.known1)}`); }
    }
  } else if (sector === 's2') {
    const first = out.map((x) => x.pts[x.seq[0]]);
    Object.assign(base, { meanHop: mean(out.map((x) => x.meanHop)), crossings: mean(out.map((x) => x.crossings)), sharp: mean(out.map((x) => x.sharp)), tangle: mean(out.map((x) => x.tangle)), nnShare: mean(out.map((x) => x.nnShare)), nnShareMax: Math.max(...out.map((x) => x.nnShare)), minDist: Math.min(...out.map((x) => x.minDist)), firstX: mean(first.map((p) => p[0])), firstY: mean(first.map((p) => p[1])) });
    ck(out.every((x) => x.L === row.L && x.seq.length === row.L && new Set(x.seq).size === row.L), 'sequence length exact, no repeated star');
    ck(base.minDist >= S2_MIN_DIST, `closest two stars ${base.minDist.toFixed(3)} >= ${S2_MIN_DIST}`);
    ck(out.every((x) => (row.c === 0 ? x.tangle === 0 && x.meanHop <= 0.5 : row.c === 1 ? x.tangle >= 0.5 && x.tangle <= 1.5 : x.tangle >= 1.5)), `route class c${row.c} respected`);
    ck(out.every((x) => (row.dir === 'B' ? x.target[0] === x.seq[row.L - 1] && x.target.join() !== x.seq.join() : x.target.join() === x.seq.join())), 'target order matches direction (B = reverse, and differs from the shown order)');
    ck(Math.abs(base.firstX - 0.5) < 0.1 && Math.abs(base.firstY - 0.5) < 0.1, `first star not biased to a side (mean ${base.firstX.toFixed(2)}, ${base.firstY.toFixed(2)})`);
    if (row.L >= 3) ck(base.nnShareMax <= NN_MAX, `"next = nearest untapped star" share max ${base.nnShareMax.toFixed(2)} > ${NN_MAX}`);
    if (row.c === 0) ck(row.L <= 3, 'c0 (near-hop) routes only for L <= 3');
    base.demand = mean(out.map((x) => demand.s2(x)));
    base.bots = { chance: rate((x) => s2Chance(x, botRng)), nn: rate((x) => s2NN(x)) };
    if (row.L >= 4) ck(base.bots.chance <= BOT_MAX.s2.chance, `chance bot passes ${pct(base.bots.chance)} > ${pct(BOT_MAX.s2.chance)}`);
    if (row.L >= 3) ck(base.bots.nn <= BOT_MAX.s2.nn, `remember-only-the-first-star + nearest-star bot passes ${pct(base.bots.nn)} > ${pct(BOT_MAX.s2.nn)}`);
  } else {
    const cells = row.rows * row.cols, occH = Array(cells).fill(0); out.forEach((x) => x.residents.forEach((r) => { occH[r.h] += 1; }));
    const tw = out.map((x) => featPairs(x.residents));
    Object.assign(base, { twinsMin: Math.min(...tw), twinsMax: Math.max(...tw), houseRatio: Math.min(...occH) / Math.max(...occH), lureOk: out.every((x) => x.lures.length === row.near + row.far) });
    ck(out.every((x) => x.residents.length === row.n && new Set(x.residents.map((r) => r.s * 6 + r.c)).size === row.n), 'n residents, all identities distinct');
    ck(base.twinsMin === row.twins && base.twinsMax === row.twins, `twin pairs exactly ${row.twins}`);
    ck(base.lureOk && out.every((x) => x.lures.every((l) => !x.residents.some((r) => r.s === l.s && r.c === l.c))), 'lure count exact and no lure equals a resident');
    ck(out.every((x) => x.lures.filter((l) => l.kind === 'near').every((l) => x.residents.some((r) => r.s === l.s) && x.residents.some((r) => r.c === l.c)) && x.lures.filter((l) => l.kind === 'far').every((l) => !x.residents.some((r) => r.s === l.s || r.c === l.c))), 'near lures = mix-and-match of resident features; far lures share nothing');
    ck(base.houseRatio > 0.55, `every house is used (min/max ${base.houseRatio.toFixed(2)}; < 1 is inherent to the no-adjacent-twins rule)`);
    base.demand = mean(out.map((x) => demand.s3(x)));
    base.bots = { chance: rate((x) => s3Bot(x, botRng, false, false)), who: rate((x) => s3Bot(x, botRng, true, false)), occ: rate((x) => s3Bot(x, botRng, false, true)), whoOcc: rate((x) => s3Bot(x, botRng, true, true)) };
    if (D >= 3) { ck(base.bots.chance <= BOT_MAX.s3.chance, `chance bot passes ${pct(base.bots.chance)} > ${pct(BOT_MAX.s3.chance)}`); ck(base.bots.occ <= BOT_MAX.s3.occ, `knows-only-which-houses-are-occupied bot passes ${pct(base.bots.occ)} > ${pct(BOT_MAX.s3.occ)}`); ck(base.bots.whoOcc <= BOT_MAX.s3.whoOcc, `knows who + which houses, not who lives where, passes ${pct(base.bots.whoOcc)} > ${pct(BOT_MAX.s3.whoOcc)}`); }
  }
  return base;
}

function main() {
  const rows = [];
  for (const s of SECTOR_IDS) { if (only && only !== s) continue; for (let D = 1; D <= NDIFF; D += 1) rows.push(run(s, D)); }
  // ladder: mean demand of the ACTUAL samples must rise at every step inside a wing; NN-bot pass must not rise with D inside a wing
  for (const s of SECTOR_IDS) {
    if (only && only !== s) continue;
    const r = rows.filter((x) => x.sector === s), [lo, hi] = STEP[s];
    for (let D = 2; D <= NDIFF; D += 1) {
      if (trackIdx(s, D) !== trackIdx(s, D - 1)) continue;
      const step = r[D - 1].demand - r[D - 2].demand; r[D - 1].step = step;
      need(step >= lo && step <= hi, `${s} D${D}: demand step ${step.toFixed(2)} outside [${lo}, ${hi}]`);
      if (s === 's2') need(r[D - 1].bots.nn <= r[D - 2].bots.nn + 0.03, `s2 D${D}: nearest-star bot pass rose ${pct(r[D - 2].bots.nn)} -> ${pct(r[D - 1].bots.nn)} (route-class cliff)`);
    }
  }
  // stretch tier (rotation about a marked pivot): the generator + image rules must hold so the tier can ship later
  const stretch = [];
  if (STRETCH_ON) for (const row of STRETCH) {
    const rng = createRng(`stretch:${row.D}`), hist = makeHistory(32, 6), out = []; for (let i = 0; i < Math.min(N, 1000); i += 1) out.push(genRot(rng, row, hist));
    const okImg = out.every((x) => new Set(['id', ...NON_ID].map((o) => apply(o, x.g, x.cells).join(','))).size === 8 && !x.cells.includes(12) && hamming(x.target, x.cells) >= 4);
    stretch.push({ D: row.D, tries: mean(out.map((x) => x.tries)), max: Math.max(...out.map((x) => x.tries)), ok: okImg });
    need(okImg && Math.max(...out.map((x) => x.tries)) < 2000, `stretch T${row.D}: 8 images distinct, pivot empty, target differs >= 2 cells, tries < 2000`);
  }
  const fmt = (x, d = 2) => (typeof x === 'number' && Number.isFinite(x) ? x.toFixed(d) : String(x));
  for (const s of SECTOR_IDS) {
    if (only && only !== s) continue;
    console.log(`\n== ${s}  (N=${N} per D)   D | tries mean/p99/max | repeat64 (raw w/o history) | effPool W | demand(step) | specifics | bots | ok`);
    for (const r of rows.filter((x) => x.sector === s)) {
      const sp = s === 's1' ? `k ${r.kMin}-${r.kMax} dens<=${pct(r.densityMax)} sym ${r.symmetric} cellTV ${fmt(r.cellTV, 3)}`
        : s === 's4' ? `k ${r.kMin}-${r.kMax} copyHam>=${r.copyHamMin} cellTV ${fmt(r.cellTV, 3)}`
        : s === 's2' ? `hop ${fmt(r.meanHop)} cross ${fmt(r.crossings)} sharp ${fmt(r.sharp)} tangle ${fmt(r.tangle)} nn ${fmt(r.nnShare)} minDist ${fmt(r.minDist, 3)}`
        : `twins ${r.twinsMin}-${r.twinsMax} houses min/max ${fmt(r.houseRatio)}`;
      const bt = Object.entries(r.bots).map(([k, v]) => `${k} ${pct(v)}`).join(' ');
      console.log(`D${String(r.D).padStart(2)} | ${fmt(r.triesMean, 1)}/${r.triesP99}/${r.triesMax} | W${r.W}:${r.dupExact} (${pct(r.rawRepeat64)}) | ${r.effPool === Infinity ? '>' + (N * N / 2 | 0) : r.effPool} | ${fmt(r.demand)}${r.step !== undefined ? `(+${fmt(r.step)})` : ''} | ${sp} | ${bt} | ${r.ok.every((v) => v === 'ok') ? 'ok' : 'FAIL'}`);
    }
  }
  // rejection statistics per sector (spec 11.1): which rule throws candidates away, and how often
  const rejStats = {};
  for (const s of SECTOR_IDS) {
    const x = rows.filter((r) => r.sector === s), tot = {}; x.forEach((r) => { for (const [k, v] of Object.entries(r.rej)) tot[k] = (tot[k] || 0) + v; });
    const all = Object.values(tot).reduce((a, b) => a + b, 0); rejStats[s] = { total: all, perAccepted: all / (x.length * N), share: Object.fromEntries(Object.entries(tot).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, v / all])) };
    console.log(`\nrejections ${s}: ${(all / (x.length * N)).toFixed(1)} rejected candidates per accepted stimulus; ` + Object.entries(rejStats[s].share).filter(([, v]) => v > 0.005).map(([k, v]) => `${k} ${pct(v)}`).join(', '));
  }
  if (stretch.length) console.log('\nstretch (rotation) generator:', stretch.map((x) => `T${x.D} tries ${x.tries.toFixed(1)}/${x.max}`).join('  '));
  console.log(`\nchecks failed: ${fails.length}`); fails.forEach((f) => console.log('  FAIL', f));
  if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify({ N, rows, rejStats, stretch, fails }, null, 1));
  __exit(fails.length ? 1 : 0);

}
if ((process.argv[1] ?? '').endsWith('stats.mjs')) main();
