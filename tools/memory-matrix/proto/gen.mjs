// Round generators with explicit rejection rules (spec §6). Every generator is a pure function of (rng, table row, history).
// Returns the stimulus plus { tries, rej } so the stats tool can show WHY candidates were thrown away.
// generate() never throws in the page: generateSafe() relaxes the history, then falls back to a precomputed safe stimulus (spec 6).
import { apply, components8, symmetries, canon, isCollinear, hamming, halfOf, halfImages, makeHistory } from './grid.mjs';
import { TABLE, PIVOT } from './params.mjs';

export const MAX_TRIES = 4000;
export const NN_MAX = 0.5;       // s2: at most half of the steps may be "the nearest unvisited star" (spec 6, proximity-heuristic leak)
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const nb8 = (g, i) => { const r = Math.floor(i / g), c = i % g, out = []; for (let dr = -1; dr <= 1; dr += 1) for (let dc = -1; dc <= 1; dc += 1) { if ((dr || dc) && r + dr >= 0 && c + dc >= 0 && r + dr < g && c + dc < g) out.push((r + dr) * g + c + dc); } return out; };
const nb4 = (g, i) => nb8(g, i).filter((j) => Math.abs(Math.floor(j / g) - Math.floor(i / g)) + Math.abs((j % g) - (i % g)) === 1);

// ---- clusters (shared by s1, s4 and the stretch generator). `allowed` = optional Set of cells the pattern may use.
function composition(rng, n, k) {
  const maxPart = Math.ceil(n / k) + 1, sizes = Array(k).fill(1);
  for (let left = n - k; left > 0;) { const j = rng.int(0, k - 1); if (sizes[j] < maxPart) { sizes[j] += 1; left -= 1; } }
  return sizes;
}
function placeClusters(rng, g, sizes, allowed = null) {
  const occ = new Map(), ok = (i) => !allowed || allowed.has(i);
  for (let ci = 0; ci < sizes.length; ci += 1) {
    const seeds = []; for (let i = 0; i < g * g; i += 1) if (ok(i) && !occ.has(i) && nb8(g, i).every((j) => !occ.has(j))) seeds.push(i);
    if (!seeds.length) return null;
    const cl = [rng.pick(seeds)]; occ.set(cl[0], ci);
    while (cl.length < sizes[ci]) {
      const cand = new Set(), use4 = rng.chance(0.5);
      for (const a of cl) for (const b of (use4 ? nb4(g, a) : nb8(g, a))) if (ok(b) && !occ.has(b) && nb8(g, b).every((j) => !occ.has(j) || occ.get(j) === ci)) cand.add(b);
      if (!cand.size) return null;
      const pick = rng.pick([...cand]); cl.push(pick); occ.set(pick, ci);
    }
  }
  return [...occ.keys()].sort((a, b) => a - b);
}
const bboxOk = (g, cells) => { const rs = cells.map((i) => Math.floor(i / g)), cs = cells.map((i) => i % g); return Math.max(...rs) - Math.min(...rs) >= 1 && Math.max(...cs) - Math.min(...cs) >= 1; };

// ---- s1 星座复刻
export function genS1(rng, row, hist) {
  const rej = { place: 0, comps: 0, density: 0, symmetric: 0, collinear: 0, dup: 0, dupShape: 0 }; let tries = 0;
  while (tries < MAX_TRIES) {
    tries += 1;
    const cells = placeClusters(rng, row.g, composition(rng, row.n, row.k));
    if (!cells) { rej.place += 1; continue; }
    if (components8(row.g, cells).length !== row.k) { rej.comps += 1; continue; }
    if (cells.length / (row.g * row.g) > 0.4) { rej.density += 1; continue; }
    if (symmetries(row.g, cells).length) { rej.symmetric += 1; continue; }
    if (row.n >= 4 && isCollinear(row.g, cells)) { rej.collinear += 1; continue; }
    const key = `${row.g}:${cells.join(',')}`, shape = canon(row.g, cells);
    if (hist.has(key)) { rej.dup += 1; continue; }
    if (hist.hasShape(shape)) { rej.dupShape += 1; continue; }
    hist.push(key, shape);
    return { sector: 's1', g: row.g, n: row.n, cells, k: row.k, delayMs: row.delayMs, previewMs: row.previewMs, budget: row.budget, tags: row.tags, key, tries, rej };
  }
  throw new Error(`s1 D${row.D}: no pattern after ${MAX_TRIES} tries ${JSON.stringify(rej)}`);
}

// ---- s2 流星轨迹
const cross = (a, b, c, d) => { const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])); return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b); };
export function routeMetrics(pts, seq) {
  const P = seq.map((i) => pts[i]), hops = P.slice(1).map((p, i) => dist(p, P[i]));
  const meanHop = hops.reduce((s, h) => s + h, 0) / hops.length;
  let crossings = 0, sharp = 0;
  for (let i = 0; i + 1 < P.length; i += 1) for (let j = i + 2; j + 1 < P.length; j += 1) if (cross(P[i], P[i + 1], P[j], P[j + 1])) crossings += 1;
  for (let i = 0; i + 2 < P.length; i += 1) {
    const v1 = [P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]], v2 = [P[i + 2][0] - P[i + 1][0], P[i + 2][1] - P[i + 1][1]];
    const ang = Math.acos(Math.max(-1, Math.min(1, (v1[0] * v2[0] + v1[1] * v2[1]) / (Math.hypot(...v1) * Math.hypot(...v2))))) * 180 / Math.PI;
    if (ang > 120) sharp += 1;
  }
  return { meanHop, crossings, sharp, tangle: crossings + 0.5 * sharp + (meanHop > 0.5 ? 0.5 : 0), maxHop: Math.max(...hops) };
}
/** Share of steps (in TAP order) where the next star is the nearest not-yet-tapped star: how far "go to the closest one" predicts the route. */
export function nnShare(pts, order) {
  let hit = 0;
  for (let i = 1; i < order.length; i += 1) {
    const done = new Set(order.slice(0, i)); let best = -1, bd = 9;
    pts.forEach((p, k) => { if (done.has(k)) return; const d = dist(p, pts[order[i - 1]]); if (d < bd) { bd = d; best = k; } });
    if (best === order[i]) hit += 1;
  }
  return hit / (order.length - 1);
}
/** Baseline bot that remembers ONLY the first tap target and then always tries the nearest untapped star (feedback after each tap). Deterministic. */
export function nnBot(stim, budget = 1) {
  const { pts, target } = stim; let slips = 0; const vis = [target[0]];
  for (let j = 1; j < target.length; j += 1) {
    const cur = pts[vis[vis.length - 1]], cand = pts.map((_, k) => k).filter((k) => !vis.includes(k)).sort((a, b) => dist(pts[a], cur) - dist(pts[b], cur));
    let ok = false; for (const c of cand) { if (c === target[j]) { ok = true; vis.push(c); break; } slips += 1; if (slips > budget) return false; }
    if (!ok) return false;
  }
  return true;
}
const monotone = (xs) => xs.every((v, i) => i === 0 || v > xs[i - 1]) || xs.every((v, i) => i === 0 || v < xs[i - 1]);
export const S2_MIN_DIST = 0.2;   // fraction of the sky square -> >= 59 px on the smallest phone board (spec §2.2)
function layout(rng, m) {
  const pts = [];
  for (let i = 0; i < m; i += 1) {
    let best = null, bd = -1;
    for (let c = 0; c < 14; c += 1) { const p = [rng.float(0.08, 0.92), rng.float(0.08, 0.92)]; const d = pts.length ? Math.min(...pts.map((q) => dist(p, q))) : 1; if (d > bd) { bd = d; best = p; } }
    pts.push(best);
  }
  return pts;
}
export function genS2(rng, row, hist, opts = {}) {
  const rej = { layout: 0, band: 0, sweep: 0, nn: 0, dup: 0 }; let tries = 0;
  const tau = [0.18, 0.35, 2][row.c];
  while (tries < MAX_TRIES) {
    tries += 1;
    const pts = layout(rng, row.m);
    let md = 9; for (let i = 0; i < pts.length; i += 1) for (let j = i + 1; j < pts.length; j += 1) md = Math.min(md, dist(pts[i], pts[j]));
    if (md < S2_MIN_DIST) { rej.layout += 1; continue; }
    const seq = [rng.int(0, row.m - 1)];
    while (seq.length < row.L) {
      const free = pts.map((_, i) => i).filter((i) => !seq.includes(i));
      const w = free.map((i) => Math.exp(-dist(pts[i], pts[seq[seq.length - 1]]) / tau)), tot = w.reduce((s, v) => s + v, 0);
      let r = rng.next() * tot, pick = free[free.length - 1];
      for (let q = 0; q < free.length; q += 1) { r -= w[q]; if (r < 0) { pick = free[q]; break; } }
      seq.push(pick);
    }
    const mt = routeMetrics(pts, seq);
    const ok = row.c === 0 ? mt.tangle === 0 && mt.meanHop <= 0.5 : row.c === 1 ? mt.tangle >= 0.5 && mt.tangle <= 1.5 : mt.tangle >= 1.5 && mt.tangle <= 4;
    if (!ok) { rej.band += 1; continue; }
    if (row.L >= 3 && (monotone(seq.map((i) => pts[i][0])) || monotone(seq.map((i) => pts[i][1])))) { rej.sweep += 1; continue; }
    const target = row.dir === 'B' ? seq.slice().reverse() : seq;
    if (!opts.noNN && row.L >= 3 && (nnShare(pts, target) > NN_MAX || nnBot({ pts, target }, row.budget))) { rej.nn += 1; continue; }   // proximity heuristic must not solve it
    const key = pts.map((p) => p.map((v) => v.toFixed(2)).join(',')).join(';') + '|' + seq.join('');
    if (hist.has(key)) { rej.dup += 1; continue; }
    hist.push(key);
    return { sector: 's2', m: row.m, pts, seq, target, dir: row.dir, L: row.L, c: row.c, ...mt, nnShare: row.L >= 2 ? nnShare(pts, target) : 0, minDist: md, delayMs: 0, budget: row.budget, tags: row.tags, key, tries, rej };
  }
  throw new Error(`s2 D${row.D}: no route after ${MAX_TRIES} tries ${JSON.stringify(rej)}`);
}

// ---- s3 星球住户 (residents are {s: shape 0..5, c: colour 0..5, h: house index})
export const featPairs = (res) => { let t = 0; for (let i = 0; i < res.length; i += 1) for (let j = i + 1; j < res.length; j += 1) t += (res[i].s === res[j].s) + (res[i].c === res[j].c); return t; };
export function genS3(rng, row, hist) {
  const rej = { twins: 0, ident: 0, adjacent: 0, lures: 0, dup: 0 }; let tries = 0;
  const cells = row.rows * row.cols;
  while (tries < MAX_TRIES) {
    tries += 1;
    const sh = rng.shuffle([0, 1, 2, 3, 4, 5]).slice(0, row.n), co = rng.shuffle([0, 1, 2, 3, 4, 5]).slice(0, row.n);
    const res = sh.map((s, i) => ({ s, c: co[i] }));
    for (let t = 0; t < row.twins; t += 1) { const i = rng.int(0, row.n - 1); let j = rng.int(0, row.n - 1); if (j === i) j = (j + 1) % row.n; const f = rng.chance(0.5) ? 's' : 'c'; res[i][f] = res[j][f]; }
    if (new Set(res.map((r) => r.s * 6 + r.c)).size !== row.n) { rej.ident += 1; continue; }
    if (featPairs(res) !== row.twins) { rej.twins += 1; continue; }
    const houses = rng.shuffle([...Array(cells).keys()]).slice(0, row.n); res.forEach((r, i) => { r.h = houses[i]; });
    const adj = (a, b) => Math.max(Math.abs(Math.floor(a / row.cols) - Math.floor(b / row.cols)), Math.abs((a % row.cols) - (b % row.cols))) <= 1;
    let bad = false; for (let i = 0; i < res.length && !bad; i += 1) for (let j = i + 1; j < res.length; j += 1) if ((res[i].s === res[j].s || res[i].c === res[j].c) && adj(res[i].h, res[j].h)) { bad = true; break; }
    if (bad) { rej.adjacent += 1; continue; }
    const RS = new Set(res.map((r) => r.s)), RC = new Set(res.map((r) => r.c)), have = new Set(res.map((r) => r.s * 6 + r.c));
    const nearPool = [], farPool = [];
    for (let s = 0; s < 6; s += 1) for (let c = 0; c < 6; c += 1) { if (have.has(s * 6 + c)) continue; if (RS.has(s) && RC.has(c)) nearPool.push({ s, c }); else if (!RS.has(s) && !RC.has(c)) farPool.push({ s, c }); }
    if (nearPool.length < row.near || farPool.length < row.far) { rej.lures += 1; continue; }
    const lures = [...rng.shuffle(nearPool).slice(0, row.near).map((l) => ({ ...l, kind: 'near' })), ...rng.shuffle(farPool).slice(0, row.far).map((l) => ({ ...l, kind: 'far' }))];
    const key = res.map((r) => `${r.s}.${r.c}@${r.h}`).sort().join('|') + '/' + lures.map((l) => `${l.s}.${l.c}`).sort().join('|');
    if (hist.has(key)) { rej.dup += 1; continue; }
    hist.push(key);
    return { sector: 's3', rows: row.rows, cols: row.cols, n: row.n, residents: res, lures, twins: featPairs(res), near: row.near, far: row.far, delayMs: row.delayMs, showMs: row.showMs, budget: row.budget, tags: row.tags, key, tries, rej };
  }
  throw new Error(`s3 D${row.D}: no town after ${MAX_TRIES} tries ${JSON.stringify(rej)}`);
}

// ---- s4 照镜子: single board, mirror strip in the middle, source stars in one half (side 0 = left/top, 1 = right/bottom), answer = reflections in the other half
export function genS4(rng, row, hist) {
  const rej = { place: 0, comps: 0, density: 0, collinear: 0, bbox: 0, images: 0, dup: 0, dupShape: 0 }; let tries = 0;
  const g = row.g;
  while (tries < MAX_TRIES) {
    tries += 1;
    const axis = rng.pick(row.axes), side = rng.int(0, 1), half = halfOf(g, axis, side), allowed = new Set(half);
    const k = rng.int(row.kLo, Math.min(row.kHi, row.n));
    const cells = placeClusters(rng, g, composition(rng, row.n, k), allowed);
    if (!cells) { rej.place += 1; continue; }
    if (components8(g, cells).length !== k) { rej.comps += 1; continue; }
    if (cells.length / half.length > 0.5) { rej.density += 1; continue; }
    if (row.n >= 3 && isCollinear(g, cells)) { rej.collinear += 1; continue; }
    if (row.n >= 3 && !bboxOk(g, cells)) { rej.bbox += 1; continue; }
    const im = halfImages(g, axis, side, cells);
    if (hamming(im.copy, im.target) < 4 || [im.flip, im.rot].some((w) => hamming(w, im.target) < 2)) { rej.images += 1; continue; }   // "slide it across" differs by >= 2 cells; the other wrong answers are at least distinguishable
    const key = `${g}:${axis}${side}:${cells.join(',')}`, shape = canon(g, cells);
    if (hist.has(key)) { rej.dup += 1; continue; }
    if (hist.hasShape(shape)) { rej.dupShape += 1; continue; }
    hist.push(key, shape);
    return { sector: 's4', g, n: row.n, axis, op: axis, side, cells, k, target: im.target, copy: im.copy, flip: im.flip, rot: im.rot, axes: row.axes, mode: row.mode, delayMs: row.delayMs, previewMs: row.previewMs, budget: row.budget, tags: [axis], key, tries, rej };
  }
  throw new Error(`s4 D${row.D}: no pattern after ${MAX_TRIES} tries ${JSON.stringify(rej)}`);
}

// ---- stretch (rotation about a marked pivot; NOT in v1, spec 5.5): 5x5, pivot = centre cell, kept empty; two boards (source | answer)
export function genRot(rng, row, hist) {
  const rej = { place: 0, comps: 0, density: 0, symmetric: 0, collinear: 0, bbox: 0, close: 0, dup: 0, dupShape: 0 }; let tries = 0;
  const allowed = new Set([...Array(row.g * row.g).keys()].filter((i) => i !== PIVOT));
  while (tries < MAX_TRIES) {
    tries += 1;
    const k = rng.int(row.kLo, Math.min(row.kHi, row.n));
    const cells = placeClusters(rng, row.g, composition(rng, row.n, k), allowed);
    if (!cells) { rej.place += 1; continue; }
    if (components8(row.g, cells).length !== k) { rej.comps += 1; continue; }
    if (cells.length / (row.g * row.g) > 0.4) { rej.density += 1; continue; }
    if (symmetries(row.g, cells).length) { rej.symmetric += 1; continue; }
    if (isCollinear(row.g, cells)) { rej.collinear += 1; continue; }
    if (!bboxOk(row.g, cells)) { rej.bbox += 1; continue; }
    if (row.ops.some((o) => hamming(apply(o, row.g, cells), cells) < 4)) { rej.close += 1; continue; }
    const key = `${row.g}:${cells.join(',')}`, shape = canon(row.g, cells);
    if (hist.has(key)) { rej.dup += 1; continue; }
    if (hist.hasShape(shape)) { rej.dupShape += 1; continue; }
    hist.push(key, shape);
    const op = rng.pick(row.ops);
    return { sector: 's4', rot: true, g: row.g, n: row.n, cells, k, op, ops: row.ops, target: apply(op, row.g, cells), mode: row.mode, delayMs: 0, previewMs: 0, budget: row.budget, tags: [op], key, tries, rej };
  }
  throw new Error(`rot D${row.D}: no pattern after ${MAX_TRIES} tries ${JSON.stringify(rej)}`);
}

export const GEN = { s1: genS1, s2: genS2, s3: genS3, s4: genS4 };
export const generate = (sector, D, rng, hist) => GEN[sector](rng, TABLE[sector][D - 1], hist);

// ---- never throw mid-round (spec 6): normal -> drop the same-shape window -> drop the whole history -> precomputed safe stimulus -> last valid one
let SAFE_CACHE = null;
export function buildSafe() {
  const out = {};
  for (const s of Object.keys(TABLE)) for (const row of TABLE[s]) out[`${s}:${row.D}`] = GEN[s](createSafeRng(`safe:${s}:${row.D}`), row, makeHistory(64, 6));
  return out;
}
import { createRng } from './rng.mjs';
const createSafeRng = (seed) => createRng(seed);
export function generateSafe(sector, D, rng, hist, opts = {}) {
  const row = opts.row || TABLE[sector][D - 1], gen = GEN[sector];
  const attempts = [
    [hist, 0],
    [{ has: (k) => hist.has(k), hasShape: () => false, push: (k, s) => hist.push(k, s) }, 1],
    [{ has: () => false, hasShape: () => false, push: (k, s) => hist.push(k, s) }, 2],
  ];
  for (const [h, level] of attempts) {
    try { const x = gen(rng, row, h); if (level) x.fallback = level; hist.last = x; return x; } catch { /* relax and retry */ }
  }
  SAFE_CACHE ??= buildSafe();
  const safe = opts.safe || SAFE_CACHE, x = safe[`${sector}:${D}`] || hist.last;
  if (!x) throw new Error(`generateSafe: nothing to fall back on for ${sector} D${D}`);   // unreachable in the page: the safe table has every (sector, D)
  return { ...x, fallback: 3 };
}
