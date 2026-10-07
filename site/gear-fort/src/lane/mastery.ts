// Jinnang mastery signals (spec section 4.9, parent metric 1): which of the 15 strategy ideas a finished game shows,
// read from the kernel event log + stats. The caller only counts a signal as mastery when the game had no coach hint,
// no assist and no "what now?" ask. Theme-free and deterministic like the rest of src/lane.
import type { SimState, SimEvent } from './types';
import { TPS, COLS } from './rules';
import { FEARS } from './tags';

const ECON = ['farm', 'bank'];
const evs = (S: SimState, type: string): SimEvent[] => (S.ev || []).filter((e) => e.type === type);
const at = (s: number): number => Math.round(s * TPS);

/** first appearance (tick, lane) of every enemy kind in this game */
export function firstSeen(S: SimState): Map<string, { tick: number; lane: number }> {
  const m = new Map<string, { tick: number; lane: number }>();
  for (const e of evs(S, 'spawn')) if (e.k && !m.has(e.k)) m.set(e.k, { tick: e.tick, lane: e.lane ?? 0 });
  return m;
}
/** a card it fears was placed in that lane within `win` ticks of the kind's first appearance */
export function counteredFast(S: SimState, kind: string, win: number): { ok: boolean; tick: number } {
  const f = firstSeen(S).get(kind); if (!f) return { ok: false, tick: -1 };
  const fear = FEARS[kind] || [];
  const p = evs(S, 'place').find((e) => e.lane === f.lane && fear.includes(e.card || '') && e.tick >= f.tick && e.tick <= f.tick + win);
  return { ok: !!p, tick: p ? p.tick : -1 };
}
const placedBefore = (S: SimState, cards: string[], tick: number): SimEvent[] => evs(S, 'place').filter((e) => cards.includes(e.card || '') && e.tick <= tick);

export function masterySignals(S: SimState): string[] {
  const out: string[] = []; const st = S.stats; const night = !!S.L.env?.night; const won = S.result === 'win';
  const seen = firstSeen(S);
  // 1 econ: economy at 60 s (day: >= 4 economy units; night: >= 2 granaries)
  if (night ? placedBefore(S, ['bank'], at(60)).length >= 2 : st.econAt60 >= 4) out.push('econ');
  // 2 invest: a night level with >= 2 granaries before 50 s
  if (night && placedBefore(S, ['bank'], at(50)).length >= 2) out.push('invest');
  // 3 counter: a new machine (not the plain walker) answered in its lane within 10 s
  if ([...seen.keys()].some((k) => k !== 'walker' && k !== 'chick' && counteredFast(S, k, at(10)).ok)) out.push('counter');
  // 4 aoe: one burner / strike hits >= 4
  if (Math.max(st.bestSplash || 0, st.bestBurn || 0, ...evs(S, 'strikeLand').map((e) => e.n || 0)) >= 4) out.push('aoe');
  // 5 timing: strikes average >= 3 hits, and any token used inside a big wave / boss window
  const sh = st.strikeHits || []; const ults = evs(S, 'ult'); const f0 = S.flags?.[0] ?? Infinity; const bossIn = evs(S, 'bossIn')[0]?.tick ?? Infinity;
  const strikesOk = sh.length > 0 && sh.reduce((a, b) => a + b, 0) / sh.length >= 3;
  const ultOk = ults.length === 0 || ults.some((e) => e.tick >= Math.min(f0, bossIn) - at(5));
  if (strikesOk && ultOk) out.push('timing');
  // 6 guard: flyers came and no economy unit was pecked away
  if (seen.has('flyer') && won && !evs(S, 'unitGone').some((e) => ECON.includes(e.k || '') && (e.by === 'flyer' || e.why === 'peck'))) out.push('guard');
  // 7 control: every ram impact <= 160 (spikes first), or >= 2 fliers blown down
  const imp = evs(S, 'impact'); if ((imp.length > 0 && imp.every((e) => (e.dmg ?? 0) <= 160)) || evs(S, 'grounded').length >= 2) out.push('control');
  // 8 depth: before every big wave, the wave's lanes already had a pit or a wall
  const flags = S.flags || []; const sp = evs(S, 'spawn');
  if (flags.length && flags.every((f) => { const lanes = new Set(sp.filter((e) => e.tick >= f && e.tick <= f + at(8)).map((e) => e.lane)); return [...lanes].some((l) => placedBefore(S, ['pit', 'wall'], f).some((p) => p.lane === l)); })) out.push('depth');
  // 9 smoke: >= 3 smoke clouds cleared
  if ((st.smokeCleared || 0) >= 3) out.push('smoke');
  // 10 cover: at the first big wave every lane had an attacking card
  if (flags.length && st.coverAtFlag1 >= 1) out.push('cover'); // coverAtFlag1 = fewest attackers in any open lane at flag 1
  // 11 preview: the deck answers every previewed machine
  const kinds = [...seen.keys()].filter((k) => (FEARS[k] || []).length);
  if (kinds.length && kinds.every((k) => FEARS[k].some((c) => S.loadout.includes(c)))) out.push('preview');
  // 12 daynight: a mirror (beam) within 20 s after dawn
  if (S.dawnAt != null && evs(S, 'place').some((e) => e.card === 'beam' && e.tick >= S.dawnAt! && e.tick <= S.dawnAt! + at(20))) out.push('daynight');
  // 13 improvise: a courier level held and the belt never filled up
  if (won && S.belt && S.L.type === 'conveyor' && (st.beltFull || 0) === 0) out.push('improvise');
  // 14 priority: every drummer taken down before it walked past the 4th cell
  const drums = evs(S, 'gone').filter((e) => e.k === 'drummer' && !e.captured);
  if (seen.has('drummer') && drums.length && drums.every((e) => (e.x ?? 0) >= COLS - 4)) out.push('priority');
  // 15 infer: the bronze shielder answered within 15 s of its first appearance (hint check is the caller's)
  if (counteredFast(S, 'shielder_m', at(15)).ok) out.push('infer');
  return out.filter((id, i, a) => a.indexOf(id) === i);
}
