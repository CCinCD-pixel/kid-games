// 鲁班的附加题 (3★ conditions) — port of proto/stars.mjs (rev d). 1★ = held; 2★ = held with ≤ 2 檑木;
// 3★ = held with ≤ 1 檑木 (守得稳) AND the condition. A checkpoint restore or an assist caps the result at 2★.
import { T, TPS } from './rules';
import type { SimEvent, SimState } from './types';

const ATT = new Set(['shooter', 'lobber', 'burner', 'beam', 'radial']);

export function starsOf(S: SimState): number {
  if (S.result !== 'win') return 0;
  const lg = S.stats.logsUsed;
  if (lg > 2) return 1;
  if (S.restored || S.assist) return 2;
  return lg <= 1 && cond(S) ? 3 : 2;
}
/** several keys = all must hold */
export function cond(S: SimState): boolean { const c = S.L.star3 || {}; const ks = Object.keys(c); return ks.length ? ks.every((k) => cond1(S, k, c[k])) : true; }
/** live progress of each 附加题 key for the HUD chip: { key, ok, n?, of? } */
export function condProgress(S: SimState): { key: string; ok: boolean }[] {
  const c = S.L.star3 || {}; return Object.keys(c).map((k) => ({ key: k, ok: cond1(S, k, c[k]) }));
}

/** live count for the 附加题 chip (spec §2.5: "禾田 3/4" "卡住 3/5" "烧到 6/8"); most = "at most" (lost once n > of) */
export function condCount(S: SimState, k: string, v0: unknown): { n: number; of: number; most: boolean } | null {
  const st = S.stats; const ev: SimEvent[] = S.ev || []; const v = v0 as number;
  const gone = (f: (e: SimEvent) => boolean): number => ev.filter((e) => e.type === 'unitGone' && e.why !== 'shovel' && e.why !== 'spent' && f(e)).length;
  switch (k) {
    case 'econAt60': return { n: st.econAt60 >= 0 ? st.econAt60 : S.units.filter((u) => u.k === 'farm' || u.k === 'bank').length, of: v, most: false };
    case 'attackersLost': return { n: gone((e) => ATT.has(e.k!)), of: v, most: true };
    case 'wallsLost': return { n: gone((e) => e.k === 'wall'), of: v, most: true };
    case 'unitsLost': return { n: st.unitsLost, of: v, most: true };
    case 'lostTo': { const [kind, n] = pair(v0); return { n: st.unitsLostBy[kind] || 0, of: n, most: true }; }
    case 'jammed': { const [kind, n] = pair(v0); return { n: new Set(ev.filter((e) => e.type === 'counter' && e.card === 'spikes' && e.k === kind).map((e) => e.id)).size, of: n, most: false }; }
    case 'captures': return { n: st.captured, of: v, most: false };
    case 'bestBurn': return { n: st.bestBurn, of: v, most: false };
    case 'bestSplash': return { n: st.bestSplash, of: v, most: false };
    case 'strikeMax': return { n: Math.max(0, ...st.strikeHits), of: v, most: false };
    case 'beltFull': return { n: st.beltFull, of: v, most: true };
    case 'econLost': return { n: st.econLost, of: v, most: true };
    default: return null;
  }
}
/** the 附加题 can no longer be done this run (HUD flips the chip grey once; never a popup) */
export function condLost(S: SimState): boolean {
  if (S.stats.logsUsed > 1) return true;
  const c = S.L.star3 || {};
  return Object.keys(c).some((k) => {
    const cc = condCount(S, k, c[k]); if (cc && cc.most) return cc.n > cc.of;
    if (k === 'minX') return Math.min(...S.stats.minX) < (c[k] as number) * T;
    if (k === 'minXOf') { const [kind, col] = pair(c[k]); return (S.stats.minXByKind[kind] ?? 1e9) < col * T; }
    if (k === 'econAt60') return S.stats.econAt60 >= 0 && S.stats.econAt60 < (c[k] as number);
    return false;
  });
}

function pair(v: unknown): [string, number] { const [k, n] = Object.entries(v as Record<string, number>)[0]; return [k, n]; }

function cond1(S: SimState, k: string, v0: unknown): boolean {
  const v = v0 as number;
  const st = S.stats; const ev: SimEvent[] = S.ev || [];
  const placed = ev.filter((e) => e.type === 'place'); const gone = ev.filter((e) => e.type === 'unitGone' && e.why !== 'shovel' && e.why !== 'spent');
  switch (k) {
    case 'minX': return Math.min(...st.minX) >= v * T;
    case 'econAt60': return st.econAt60 >= v;
    case 'attackersLost': return gone.filter((g) => ATT.has(g.k!)).length <= v;
    case 'minXOf': { const [kind, col] = pair(v0); return (st.minXByKind[kind] ?? 1e9) >= col * T; }
    case 'unitsLost': return st.unitsLost <= v;
    case 'captures': return st.captured >= v;
    case 'bestSplash': return st.bestSplash >= v;
    case 'bestBurn': return st.bestBurn >= v;
    case 'windBurn': return (st.windBurn || 0) >= v;
    case 'lostTo': { const [kind, n] = pair(v0); return (st.unitsLostBy[kind] || 0) <= n; }
    case 'beltMax': return st.beltMax <= v;
    case 'strikeMax': return Math.max(0, ...st.strikeHits) >= v;
    case 'maxCards': return new Set(placed.map((p) => p.card)).size <= v;
    case 'downed': { const done = new Set(ev.filter((e) => e.type === 'gone' && !e.log).map((e) => e.id)); return new Set(ev.filter((e) => e.type === 'counter' && e.card === 'gust' && (e.k === 'flyer' || e.k === 'flyer_m') && done.has(e.id)).map((e) => e.id)).size >= v; }
    case 'jammed': { const [kind, n] = pair(v0); return new Set(ev.filter((e) => e.type === 'counter' && e.card === 'spikes' && e.k === kind).map((e) => e.id)).size >= n; }
    case 'dashSpiked': return ev.filter((e) => e.type === 'dashStopped' && e.by === 'spikes').length >= v;
    case 'banksBy50': return placed.filter((p) => p.card === 'bank' && p.tick <= 50 * TPS).length >= v;
    case 'econLost': return st.econLost <= v;
    case 'grounded': return ev.filter((e) => e.type === 'grounded').length >= v;
    case 'smokeCleared': return st.smokeCleared >= v;
    case 'coverAtFlag1': return st.coverAtFlag1 >= v;
    case 'laddersHooked': return (st.laddersHooked || 0) >= v;
    case 'beltFull': return st.beltFull <= v;
    case 'wallsLost': return gone.filter((g) => g.k === 'wall').length <= v;
    case 'beamAfterDawn': { const d = S.L.env?.dawnAt ?? 0; const b = placed.find((p) => p.card === 'beam' && p.tick >= d); return !!b && b.tick - d <= v * TPS; }
    case 'owlDown': return (st.owlDown || 0) >= v;
    case 'waterAttackerBy': { const w = S.L.water || []; const b = placed.find((p) => w[p.lane!] && ATT.has(p.card!)); return !!b && b.tick <= v * TPS; }
    case 'raftsHooked': return gone.filter((g) => g.k === 'raft' && g.why === 'hooked').length <= v;
    case 'floodLost': { const fl = S.L.env?.floods || []; return !gone.some((g) => fl.some((f) => f.lane === g.lane && g.tick >= f.at && g.tick <= f.at + f.dur)); }
    case 'heavyLaneLost': return gone.filter((g) => g.lane === 1).length <= v;
    case 'spentMax': return st.spent <= v;
    case 'armReset': return (st.armReset || 0) >= v;
    case 'highUsed': { const hi = S.L.high || []; return placed.filter((p) => ATT.has(p.card!) && hi.some(([a, b]) => a === p.lane && b === p.col)).length >= v; }
    case 'dug': return st.dug <= v;
    case 'summonsMax': return st.summons <= v;
    case 'feintReady': { const t = 106 * TPS; const n = placed.filter((p) => p.lane === 4 && ATT.has(p.card!) && p.tick < t).length - gone.filter((g) => g.lane === 4 && ATT.has(g.k!) && g.tick < t).length; return n >= v; }
    case 'windFire': return (st.windFire || 0) >= v;
    default: return true;
  }
}
