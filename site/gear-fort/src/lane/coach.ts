// 墨子关内教练 (in-level coach) — port of proto/coach.mjs (rev d). Runs in the GAME (what 墨子 says, which card and
// cell glow) and in the validators (K+ follows a line with probability hintP). Reads only what the child can see.
// Outputs ids only (type / card / kind / lane / col); the theme pack maps them to line ids (spec §5.2, §8.2).
// Rules: ≤ 1 line per 20 s; only on a clear mistake; a (type, machine) pair retires after it was followed 3 times
// (lifetime, in the save); the first 2 lines about the level's new machine / card are always allowed.
import { T, TPS, COLS, FACE } from './rules';
import { UNITS } from './tables';
import { isNight, occupant } from './sim';
import { ATTACK, FEARS, reaches, litByBeam } from './tags';
import type { Enemy, SimState } from './types';

export { FEARS, reaches, litByBeam, ATTACK };
export const COACH_GAP = 20 * TPS;      // global: ≤ 1 line / 20 s
export const COACH_RETIRE = 3;          // a (type, machine) followed 3 times is retired (lifetime, in the save)

export interface CoachLine {
  type: 'lane' | 'counter' | 'flag' | 'econ' | 'night' | 'boss' | 'concept';
  key: string;
  card?: string;
  lane?: number;
  col?: number;
  kind?: string;
  swap?: boolean;
  replay?: boolean;
}
export interface CoachMemory {
  next: number;
  lifetime: Record<string, number>;
  said: Map<string, number>;
  saidN: Record<string, number>;
  bossNext?: number;
  gap?: number;
  last?: CoachLine;
}
export interface CoachOptions { ask?: boolean; ignoreRetire?: boolean; off?: string[] }

const visible = (S: SimState, e: Enemy): boolean => e.hp > 0 && !e.gone && e.x < COLS * T && !(S.L.env?.fogCol != null && e.x >= S.L.env.fogCol * T && !litByBeam(S, e)) && !(e.layer === 'under' && !e.revealed);
const attackersIn = (S: SimState, lane: number) => S.units.filter((u) => !u.dead && u.lane === lane && ATTACK.includes(u.k));
const cardsOf = (S: SimState): string[] => (S.L.belt ? [...new Set(S.belt)] : S.loadout || S.L.loadout || []);

/** the cell the ghost hand points at for a card in a lane (same template as the 墨子 demo) */
export function cellFor(S: SimState, card: string, lane: number): number {
  const free = (c: number): boolean => c >= 0 && c < COLS && !S.rock[lane * 16 + c] && (() => {
    const o = occupant(S, lane, c);
    if (S.waterNow[lane]) return (card !== 'raft' && !!o && o.k === 'raft' && !o.top) || (card === 'raft' && !o);
    return !o;
  })();
  let wall = -1; for (let c = COLS - 1; c >= 0; c--) { const o = occupant(S, lane, c); if (o && o.k === 'wall') { wall = c; break; } }
  let front = -1; for (let c = COLS - 1; c >= 0; c--) { const o = occupant(S, lane, c); if (o && !UNITS[o.k].flat && o.k !== 'raft') { front = c; break; } }
  const pref = ({
    shooter: [1, 2, 3, 0], lobber: [1, 2, 0, 3], burner: [2, 1, 3, 0], beam: [1, 2, 0], radial: [2, 3, 1],
    wall: [4, 5, 3], spikes: front >= 0 ? [front + 1, front + 2] : [], pit: [5, 6, 4], hook: wall >= 1 ? [wall - 1, 3] : [3, 4],
    gust: [0, 1, 4], listener: [6, 7, 5], repair: wall >= 1 ? [wall - 1, wall - 2] : [3], farm: [0, 1], bank: [0, 1], raft: [1, 2, 0, 3], salvage: [3, 2],
  } as Record<string, number[]>)[card] || [2];
  const nearest = S.enemies.filter((e) => e.lane === lane && e.hp > 0 && !e.gone && e.layer !== 'air' && e.layer !== 'under').reduce((m, e) => Math.min(m, e.x), 1e9);
  for (const c of pref) if (free(c) && (card === 'spikes' || card === 'pit' || nearest - (c * T + FACE) >= 15000)) return c;
  return -1;
}

/** 2-10 举一反三: the machine the child must reason about gets no counter line for 30 s after it is first seen */
export const inferQuiet = (S: SimState, e: Enemy): boolean => e.k === S.L.infer && (e.seen < 0 || S.tick - e.seen < 30 * TPS);
export function makeCoachMemory(lifetime: Record<string, number> = {}): CoachMemory { return { next: 0, lifetime: { ...lifetime }, said: new Map(), saidN: {} }; }
export const lineKey = (line: CoachLine): string => line.type + ':' + (line.kind || (line.type === 'lane' || line.type === 'counter' ? line.card : '') || '');
/** the caller (game: when the child follows the ghost hand; bots: when K+ follows) records a followed line */
export function followed(mem: CoachMemory, line: CoachLine): void { const k = lineKey(line); mem.lifetime[k] = (mem.lifetime[k] || 0) + 1; }

export function coachLine(S: SimState, mem: CoachMemory, opt: CoachOptions = {}): CoachLine | null {
  if (S.L.noHints || S.result) return null;
  if (S.boss && S.tick >= (mem.bossNext || 0)) { const b = bossLine(S, mem); if (b) { mem.bossNext = S.tick + 6 * TPS; mem.said.set(b.key, S.tick); return b; } }
  if (S.tick < mem.next && !opt.ask) return null;
  const newKind = S.L.newEnemy === 'swarm' ? 'ant' : S.L.newEnemy;
  const retired = (t: string, kind = ''): boolean => {
    const k = t + ':' + kind;
    if ((opt.off || []).includes(t)) return true;
    if (opt.ignoreRetire || opt.ask) return false;
    if (kind && (kind === newKind || kind === S.L.newCard) && (mem.saidN[k] || 0) < 2) return false;
    return (mem.lifetime[k] || 0) >= COACH_RETIRE;
  };
  const near = opt.ask ? 8.5 * T : 6.5 * T;
  const cards = cardsOf(S);
  const night = isNight(S);
  let inc = S.skyNext >= 0 && !night ? 20 / 8 : 0;
  for (const u of S.units) if (!u.dead) inc += u.k === 'farm' ? (night ? 10 : 20) / 18 : u.k === 'bank' ? 50 / 16 : 0;
  const soon = (c: string): boolean => S.L.belt ? S.belt.includes(c) : cardsOf(S).includes(c) && UNITS[c].cost - S.grain <= 6 * inc && (S.cdReady[c] ?? 0) - S.tick <= 6 * TPS;
  const seen = S.enemies.filter((e) => visible(S, e) && !e.boss);
  const emit = (line: CoachLine): CoachLine => { mem.next = S.tick + COACH_GAP; mem.said.set(line.key, S.tick); const k = lineKey(line); mem.saidN[k] = (mem.saidN[k] || 0) + 1; return line; };
  const once = (key: string): boolean => !mem.said.has(key);
  // 1 空路告急: a ground/water machine in a lane that has no attacker, closer than 6.5 tiles
  for (const e of seen.sort((a, b) => a.x - b.x)) {
    if (retired('lane', e.k)) continue;
    if (e.layer === 'air' || e.x > near || attackersIn(S, e.lane).length) continue;
    const fe = inferQuiet(S, e) ? [] : FEARS[e.k] || [];
    const c = ATTACK.filter((k) => cards.includes(k) && reaches(S, k, e) && soon(k)).sort((a, b) => (fe.includes(a) ? 0 : 1) - (fe.includes(b) ? 0 : 1) || UNITS[a].cost - UNITS[b].cost)[0];
    if (!c) continue;
    const col = cellFor(S, c, e.lane); if (col < 0) continue;
    return emit({ type: 'lane', key: 'lane:' + e.lane + ':' + ((S.tick / (30 * TPS)) | 0), card: c, lane: e.lane, col, kind: e.k });
  }
  // 2 对症下药: a machine whose counter is in the deck but not working in its lane (radial: ±1 lane)
  for (const e of seen) {
    if (retired('counter', e.k) || inferQuiet(S, e)) continue;
    if (e.x > (opt.ask ? 8 * T : 7 * T)) continue;
    const fs0 = (FEARS[e.k] || []).filter((c) => cards.includes(c) && (!ATTACK.includes(c) || reaches(S, c, e)));
    if (!fs0.length) continue;
    const has = S.units.some((u) => !u.dead && fs0.includes(u.k) && (u.k === 'radial' ? Math.abs(u.lane - e.lane) <= 1 : u.lane === e.lane));
    const fs = fs0.filter(soon); if (!fs.length) continue;
    if (has) continue;
    if (e.k === 'walker' && attackersIn(S, e.lane).length) continue;
    const key = 'counter:' + e.k + ':' + e.lane; if (!once(key) && !opt.ask) continue;
    const c = fs[0]; const lane = c === 'radial' ? Math.max(0, Math.min(4, e.lane)) : e.lane; const col = cellFor(S, c, lane); if (col < 0) continue;
    return emit({ type: 'counter', key, card: c, lane, col, kind: e.k });
  }
  // 3 大波预备: 12 s before a flag, an active land lane without any attacker
  if (!retired('flag')) {
    const f = (S.flags || S.L.flags || []).find((t) => S.tick >= t - (opt.ask ? 30 : 12) * TPS && S.tick < t);
    if (f != null) for (let l = 0; l < 5; l++) {
      if (!S.L.lanes[l] || attackersIn(S, l).length) continue;
      const key = 'flag:' + f + ':' + l; if (!once(key)) continue;
      const c = ATTACK.filter((k) => cards.includes(k) && k !== 'radial' && !(k === 'beam' && isNight(S)))[0] || (cards.includes('radial') ? 'radial' : null); if (!c) break;
      const col = cellFor(S, c, l); if (col < 0) continue;
      return emit({ type: 'flag', key, card: c, lane: l, col });
    }
  }
  // 4 粮草先行 (day) / 5 夜里建粮仓
  const econ = S.units.filter((u) => !u.dead && (u.k === 'farm' || u.k === 'bank' || u.k === 'salvage')).length;
  if (!S.L.belt && !retired('econ') && !isNight(S) && cards.includes('farm') && S.tick >= 25 * TPS && S.tick < 60 * TPS && econ < 2 && once('econ')) {
    const lane = [2, 1, 3, 0, 4].find((l) => S.L.lanes[l] && cellFor(S, 'farm', l) >= 0);
    if (lane != null) return emit({ type: 'econ', key: 'econ', card: 'farm', lane, col: cellFor(S, 'farm', lane) });
  }
  if (!S.L.belt && !retired('night') && isNight(S) && cards.includes('bank') && S.tick >= 15 * TPS && S.tick < 50 * TPS && !S.units.some((u) => u.k === 'bank') && once('night')) {
    const lane = [2, 1, 3, 0, 4].find((l) => S.L.lanes[l] && cellFor(S, 'bank', l) >= 0);
    if (lane != null) return emit({ type: 'night', key: 'night', card: 'bank', lane, col: cellFor(S, 'bank', lane) });
  }
  return null;
}

/** Boss tips (one per boss state; not subject to the 20 s gap; never retired) */
function bossLine(S: SimState, mem: CoachMemory): CoachLine | null {
  const cards = cardsOf(S);
  const b = S.enemies.find((e) => e.boss && e.hp > 0 && !e.gone && e.x < COLS * T);
  if (b && b.k === 'rhino' && b.boss!.phase === 2) {
    const c = ['lobber', 'beam'].find((k) => cards.includes(k) && !(k === 'beam' && isNight(S)) && !S.units.some((u) => !u.dead && u.k === k && u.lane === b.lane));
    const key = 'boss:shell';
    if (c && !mem.said.has(key)) {
      const col = cellFor(S, c, b.lane); if (col >= 0) return { type: 'boss', key, card: c, lane: b.lane, col, kind: 'rhino' };
      // the lane is full: swap the front-most crossbow for the counter
      const sw = S.units.filter((u) => !u.dead && u.lane === b.lane && u.k === 'shooter' && b.x - (u.col * T + FACE) >= 15000).sort((a, b2) => b2.col - a.col)[0];
      if (sw) return { type: 'boss', key, card: c, lane: b.lane, col: sw.col, swap: true, kind: 'rhino' };
    }
  }
  if (b && b.k === 'rhino' && b.boss!.phase === 3 && cards.includes('spikes') && !S.units.some((u) => !u.dead && u.k === 'spikes' && u.lane === b.lane)) {
    const key = 'boss:charge'; if (!mem.said.has(key)) { const col = cellFor(S, 'spikes', b.lane); if (col >= 0) return { type: 'boss', key, card: 'spikes', lane: b.lane, col, kind: 'rhino' }; }
  }
  if (b && b.k === 'owl' && cards.includes('radial') && !S.units.some((u) => !u.dead && u.k === 'radial' && Math.abs(u.lane - b.lane) <= 1)) {
    const key = 'boss:owl:' + b.lane; if (!mem.said.has(key)) { const col = [5, 4, 6].find((c) => !occupant(S, b.lane, c)) ?? -1; if (col >= 0) return { type: 'boss', key, card: 'radial', lane: b.lane, col, kind: 'owl' }; }
  }
  if (b && b.k === 'owl' && (b.boss!.state === 'down' || b.boss!.state === 'landed') && !S.units.some((u) => !u.dead && ATTACK.includes(u.k) && u.lane === b.lane)) {
    const key = 'boss:owldown:' + b.boss!.state; const c = ['shooter', 'lobber', 'burner', 'beam'].find((k) => cards.includes(k) && reaches(S, k, b));
    if (c && !mem.said.has(key)) { const col = cellFor(S, c, b.lane); if (col >= 0) return { type: 'boss', key, card: c, lane: b.lane, col, kind: 'owl' }; }
  }
  if (b && b.k === 'owl' && b.boss!.state === 'swoopTele' && cards.includes('gust') && !S.units.some((u) => !u.dead && u.k === 'gust' && u.lane === b.lane)) {
    const key = 'boss:swoop:' + b.lane; if (!mem.said.has(key)) { const col = cellFor(S, 'gust', b.lane); if (col >= 0) return { type: 'boss', key, card: 'gust', lane: b.lane, col, kind: 'owl' }; }
  }
  return null;
}

/** The line 墨子 answers 「墨子，怎么办？」 with when the board has no concrete problem: the level's second voiced intro
 *  line (child copy, ≤15 字). The bubble always shows the text of the line that is spoken — never level.concept, which
 *  is the designer's summary (QA r4 major). */
export function conceptLineId(L: { voice?: { intro?: string[] } }): string { return L.voice?.intro?.[1] || 'fort.ui.choose'; }

/** 「墨子，怎么办？」: the best suggestion even below the trigger thresholds, else the level's concept line. */
export function askLine(S: SimState, mem: CoachMemory): CoachLine | null {
  if (S.L.noHints || S.result) return null;
  if (S.tick < mem.next && mem.last) return { ...mem.last, replay: true };
  const l = coachLine(S, mem, { ask: true });
  const line: CoachLine = l || { type: 'concept', key: 'concept:' + S.L.id };
  if (!l) mem.next = S.tick + COACH_GAP;
  mem.last = line; return line;
}
