// Loadout choice for 自选 levels (鲁班亮招 → 选牒) — port of proto/bots/loadout.mjs. C reads the preview through
// the tag grammar; K ignores it (favourites + newest); K+ takes 墨子's seals with probability p.
// recommend() is ALSO what the game's loadout screen uses for the 墨子印 seals and the pre-fill (spec §2.3).
import { MUST } from '../lane/tags';
import { CARD_UNLOCK } from '../lane/tables';
import type { Level } from '../lane/types';

export function previewOf(level: Level): string[] {
  const ks = new Set<string>();
  for (const s of level.spawns) { const k = s[2]; if (k.startsWith('boss:')) ks.add(k.slice(5)); else ks.add(k === 'swarm' ? 'ant' : k); }
  if (level.boss?.type === 'fortress') ks.add('fortress');
  return [...ks];
}
const night = (lv: Level): boolean => !!lv.env?.night && lv.env?.dawnAt == null;
const sealList = (lv: Level): string[] => ([] as string[]).concat(lv.seal || []);

export function chooseC(level: Level): string[] {
  const pool = level.pool || []; const n = level.slots || 0; const out: string[] = [];
  const add = (c: string): void => { if (pool.includes(c) && !out.includes(c) && out.length < n) out.push(c); };
  const pv = previewOf(level); const water = (level.water || []).some(Boolean);
  if (water) add('raft');
  if (level.env?.night && pool.includes('bank')) add('bank');
  if (!night(level)) add('farm');
  add('shooter'); add('lobber');
  for (const c of sealList(level).filter((x) => x !== 'counters')) add(c);
  if (level.env?.dawnAt != null) add('beam');
  if (pv.some((k) => ['ram', 'brute', 'carrier', 'tower', 'ladder', 'rhino', 'fortress'].includes(k))) add('wall');
  const isN = night(level);
  for (const k of pv) {
    if (k === 'rhino') { add('spikes'); add('wall'); add('burner'); continue; }
    if (k === 'owl') { add('radial'); add('gust'); add('strike'); continue; }
    if (k === 'ship') { add('hook'); add('burner'); add('radial'); continue; }
    if (k === 'fortress') { add('wall'); add('burner'); add('radial'); add('spikes'); add('strike'); continue; }
    const cs = (MUST[k] || []).filter((c) => !(c === 'beam' && isN) && pool.includes(c));
    if (cs.length && !cs.some((c) => out.includes(c))) add(cs[0]);
  }
  add('wall');
  if (pv.includes('ant') && !out.includes('burner')) add('burner');
  for (const c of ['wall', 'strike', 'burner', 'radial', isN ? 'farm' : 'beam', 'spikes', 'gust', 'bank', 'hook', 'pit']) add(c);
  return out;
}

const unlockKey = (c: string): number => { const [a, b] = CARD_UNLOCK[c].split('-').map(Number); return a * 100 + b; };

export function chooseK(level: Level, r: () => number): string[] {
  const pool = level.pool || []; const n = level.slots || 0;
  // a pre-filled deck (= the last deck) is kept; the veteran swaps in the newest unlocked card (p 0.6)
  if (level.prefill) {
    const lo = level.prefill.filter((c) => pool.includes(c)).slice(0, n);
    const fresh = pool.filter((c) => !lo.includes(c)).sort((a, b) => unlockKey(b) - unlockKey(a));
    for (const c of fresh) {
      if (lo.length < n) { lo.push(c); continue; }
      if (r() < 0.6) { const out = lo.filter((x) => !['shooter', 'farm', 'bank'].includes(x)); lo[lo.indexOf(out[Math.floor(r() * out.length)])] = c; }
      break;
    }
    return lo;
  }
  const out: string[] = [];
  const add = (c: string): void => { if (pool.includes(c) && !out.includes(c) && out.length < n) out.push(c); };
  if ((level.water || []).some(Boolean)) add('raft');
  add('shooter'); add('farm');
  const fav = ['wall', 'lobber'];
  const byNew = pool.slice().sort((a, b) => unlockKey(b) - unlockKey(a));
  const bossCounter = ({ rhino: 'lobber', owl: 'radial', ship: 'hook' } as Record<string, string>)[level.boss?.type || ''];
  if (bossCounter) add(bossCounter);
  if (level.env?.night && r() < 0.6) add('bank');
  for (const c of fav) if (r() < 0.85) add(c);
  for (const c of byNew) { if (r() < 0.75) add(c); }
  for (const c of [...fav, ...byNew]) add(c);
  return out;
}

const BOSS_REC: Record<string, string[]> = { rhino: ['lobber', 'spikes'], owl: ['radial', 'gust'], ship: ['hook', 'lobber'], fortress: ['wall', 'burner', 'radial'] };
/** 墨子推荐: counters for every previewed machine + the boss's lesson cards (the loadout screen's seals) */
export function recommend(level: Level): string[] {
  const pool = level.pool || []; const pv = previewOf(level); const isN = night(level); const out: string[] = [];
  const add = (c: string): void => { if (pool.includes(c) && !out.includes(c)) out.push(c); };
  if ((level.water || []).some(Boolean)) add('raft');
  if (!isN) add('farm'); else add('bank');
  add('shooter');
  for (const c of sealList(level).filter((x) => x !== 'counters')) add(c);
  for (const k of pv) {
    if (k === level.infer) continue; // 举一反三: no seal for the machine the child must reason about
    if (BOSS_REC[k]) { BOSS_REC[k].forEach(add); continue; }
    const cs = (MUST[k] || []).filter((c) => !(c === 'beam' && isN) && pool.includes(c));
    if (cs.length && !cs.some((c) => out.includes(c))) add(cs[0]);
  }
  return out.slice(0, level.slots);
}

/** a K-type child with the recommendation seals: swaps each missing sealed counter in with probability p */
export function chooseKRec(level: Level, r: () => number, p: number): string[] {
  const lo = chooseK(level, r); const pool = level.pool || []; const pv = previewOf(level); const isN = night(level);
  const BOSS: Record<string, string[]> = { rhino: ['lobber', 'beam'], owl: ['radial', 'gust'], ship: ['hook', 'lobber'], fortress: ['wall', 'burner', 'radial'] };
  const need: string[] = [];
  const mode = level.seal;
  const counters = mode === 'counters' || (Array.isArray(mode) && mode.includes('counters'));
  if (Array.isArray(mode)) for (const c of mode) if (c !== 'counters' && pool.includes(c) && !lo.includes(c)) need.push(c);
  for (const k of pv) {
    if (k === level.infer) continue;
    if (BOSS[k]) { for (const c of BOSS[k]) if (pool.includes(c) && !lo.includes(c) && !need.includes(c)) need.push(c); continue; }
    if (!counters) continue;
    const cs = (MUST[k] || []).filter((c) => !(c === 'beam' && isN) && pool.includes(c));
    if (cs.length && !cs.some((c) => lo.includes(c) || need.includes(c))) need.push(cs[0]);
  }
  const keep = new Set(['shooter', 'farm', 'bank', 'raft']);
  if (pv.some((k) => ['ram', 'ant', 'brute', 'ladder', 'rhino'].includes(k))) keep.add('wall');
  for (const c of need) {
    if (r() >= p) continue;
    let i = -1; for (let j = lo.length - 1; j >= 0; j--) if (!keep.has(lo[j]) && !need.includes(lo[j]) && !pv.some((k) => (MUST[k] || []).includes(lo[j]))) { i = j; break; }
    if (i < 0) for (let j = lo.length - 1; j >= 0; j--) if (!keep.has(lo[j]) && !need.includes(lo[j])) { i = j; break; }
    if (i >= 0) lo[i] = c; else if (lo.length < (level.slots || 0)) lo.push(c);
  }
  return lo;
}
