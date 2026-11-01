// Baseline bots: what a player passes WITHOUT the skill a sector claims to measure (spec §11.1 "baselines"). Each returns true = passes the round.
// A bot gets the REAL generated stimulus and the row's slip budget; the round ends at slip number budget+1. Thresholds live in stats.mjs.
import { nnBot } from './gen.mjs';

const nb8 = (g, i) => { const r = Math.floor(i / g), c = i % g, out = []; for (let dr = -1; dr <= 1; dr += 1) for (let dc = -1; dc <= 1; dc += 1) if ((dr || dc) && r + dr >= 0 && c + dc >= 0 && r + dr < g && c + dc < g) out.push((r + dr) * g + c + dc); return out; };

/** s1: knows `m` random stars exactly, then probes cells ranked by the number of confirmed 8-neighbours (a "constellations are clumps" heuristic). */
export function s1Bot(stim, m, rng) {
  const { g, cells, budget } = stim, S = new Set(cells), found = new Set(rng.shuffle(cells).slice(0, Math.min(m, cells.length))), tried = new Set(found);
  let slips = 0;
  while (found.size < cells.length && slips <= budget) {
    let best = [], bs = -1;
    for (let i = 0; i < g * g; i += 1) { if (tried.has(i)) continue; const sc = nb8(g, i).filter((j) => found.has(j)).length; if (sc > bs) { bs = sc; best = [i]; } else if (sc === bs) best.push(i); }
    const p = rng.pick(best); tried.add(p); if (S.has(p)) found.add(p); else slips += 1;
  }
  return slips <= budget;
}
/** s2: `chance` = random stars in random order; `nn` = remembers ONLY the first target, then always tries the nearest untapped star. */
export function s2Chance(stim, rng) {
  const { pts, target, budget } = stim; let slips = 0; const vis = [];
  for (const want of target) {
    const cand = rng.shuffle(pts.map((_, k) => k).filter((k) => !vis.includes(k)));
    let ok = false; for (const c of cand) { if (c === want) { ok = true; vis.push(c); break; } slips += 1; if (slips > budget) return false; }
    if (!ok) return false;
  }
  return true;
}
export const s2NN = (stim) => nnBot(stim, stim.budget);
/** s3: knowWho = knows which tray items are residents; knowOcc = knows which houses are occupied (not who lives where). */
export function s3Bot(st, rng, knowWho, knowOcc) {
  const budget = st.budget; let slips = 0;
  const tray = [...st.residents.map((r) => ({ r, res: true })), ...st.lures.map((l) => ({ l, res: false }))];
  const free = new Set([...Array(st.rows * st.cols).keys()]), occ = st.residents.map((r) => r.h);
  for (const r of rng.shuffle(st.residents.slice())) {
    if (!knowWho) { for (const t of rng.shuffle(tray.filter((x) => !x.done))) { if (t.res && t.r === r) { t.done = true; break; } slips += 1; if (slips > budget) return false; } }
    const cands = knowOcc ? rng.shuffle(occ.filter((h) => free.has(h))) : rng.shuffle([...free]);
    let ok = false; for (const h of cands) { if (h === r.h) { free.delete(h); ok = true; break; } slips += 1; if (slips > budget) return false; }
    if (!ok) return false;
  }
  return true;
}
/** s4: knows `m` of the n target cells exactly and guesses the rest inside the answer half. */
export function s4Bot(stim, m, rng) {
  const { g, target, budget } = stim, T = new Set(target), half = new Set();
  for (let i = 0; i < g * g; i += 1) { const r = Math.floor(i / g), c = i % g, k = stim.axis === 'LR' ? c : r, h = g / 2, srcHalf = stim.side === 0 ? k < h : k >= h; if (!srcHalf) half.add(i); }
  const known = new Set(rng.shuffle(target).slice(0, Math.min(m, target.length))), cand = rng.shuffle([...half].filter((i) => !known.has(i)));
  let slips = 0, found = known.size;
  for (const c of cand) { if (found >= target.length) break; if (T.has(c)) found += 1; else { slips += 1; if (slips > budget) return false; } }
  return found >= target.length;
}
