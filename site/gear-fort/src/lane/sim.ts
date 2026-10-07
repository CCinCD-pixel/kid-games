// 机关守城 · lane core — deterministic simulation. Line-by-line port of lane-defense-tools/proto/sim.mjs (rev d).
// Pure: no DOM, no Date, no Math.random, no transcendental math in state updates; integers only.
// One call to step(S, actions) = one 50 ms tick. The order of operations is part of the contract (spec §3.2):
// hash(S) must match the prototype at every flag of every golden run (lane.test.ts, determinism.spec.ts).
import {
  T, COLS, LANES, BOARD_X, SPAWN_X, FACE, PASS, BODY, FEET, AUTO_COLLECT, BITE_EVERY, GRACE,
  PARTS_PER_TOKEN, TOKEN_MAX, PARTS, SKY, FIRE, SWARM_N, ASSIST,
} from './rules';
import { UNITS, ENEMIES } from './tables';
import { mulberry } from './rng';
import * as BOSS from './boss';
import type {
  Action, CardId, Enemy, Level, SimApi, SimEvent, SimOptions, SimState, Src, Unit, Stats,
} from './types';

export { mulberry };
export function rngNext(S: SimState): number { const [s, v] = mulberry(S.rs); S.rs = s; return v; }
export function rngInt(S: SimState, lo: number, hi: number): number { return lo + (rngNext(S) % (hi - lo + 1)); }

const ECON = new Set(['farm', 'bank', 'salvage']);
export const xcOf = (u: Unit): number => u.col * T + 5000;
export const tileOf = (x: number): number => (x < 0 ? 0 : x >= BOARD_X ? COLS : Math.floor(x / T));

function newStats(): Stats {
  return { minX: [SPAWN_X, SPAWN_X, SPAWN_X, SPAWN_X, SPAWN_X], peak: 0, spent: 0, floatSum: 0, floatN: 0,
    kills: 0, captured: 0, logsUsed: 0, breachLanes: [], firstLeak: -1, grainIn: 0, placed: 0, placedByCard: {},
    dmgBy: {}, killsBy: {}, wasted: 0, strikeHits: [], tokenUses: 0, econAt60: -1, econAt90: -1, lostTo: null, lostLane: -1,
    bankAtFlag: [], minXByKind: {}, summons: 0, dug: 0, blindTicks: 0, auraTicks: 0, beltFull: 0, smokeCleared: 0, bestSplash: 0, bestBurn: 0, beltMax: 0, unitsLostBy: {}, coverAtFlag1: -1, unitsLost: 0, econLost: 0, pins: 0, ladders: 0, drums: 0, grainPeak: 0, maxFloat: 0 };
}

// ───────────────────────── create ─────────────────────────
export function createSim(level: Level, seed = 1, opt: SimOptions = {}): SimState {
  const L = level;
  const S: SimState = {
    L, seed, tick: 0, rs: (Math.imul(seed + 1, 2654435761) >>> 0) || 1,
    grain: 0, parts: 0, tokens: 0, logs: [0, 0, 0, 0, 0],
    units: [], enemies: [], bolts: [], lobs: [], hits: [], drops: [], strikes: [],
    grid: [0, 1, 2, 3, 4].map(() => new Array<number>(COLS).fill(0)),
    smoke: [0, 1, 2, 3, 4].map(() => new Array<number>(COLS).fill(0)),
    smokeHard: [0, 0, 0, 0, 0], waterNow: [0, 0, 0, 0, 0], water: [0, 0, 0, 0, 0], rock: [], highg: [],
    nextId: 1, si: 0, spawns: [], result: null, cdReady: {}, mark: 0,
    belt: [], beltNext: 0, beltI: 0, skyNext: -1, endTick: 0,
    im: opt.incomePct ?? L.incomePct ?? 100, imr: 0, assist: opt.assist ? (opt.assist === 2 ? 2 : 1) : 0,
    flags: (L.flags || []).slice(), dawnAt: L.env?.dawnAt ?? null, loadout: (L.loadout || []).slice(), drumUsed: [],
    logCap: opt.logCap ?? 1,
    flood: [0, 0, 0, 0, 0], floodI: 0, boss: null, wood: 0,
    ev: opt.events ? [] : null, byLane: [[], [], [], [], []],
    stats: newStats(),
  };
  S.water = (L.water || [0, 0, 0, 0, 0]).map((w) => (w ? 1 : 0));
  S.waterNow = S.water.slice();
  S.rock = new Array<number>(LANES * 16).fill(0); for (const [a, b] of L.rocks || []) S.rock[a * 16 + b] = 1;
  S.highg = new Array<number>(LANES * 16).fill(0); for (const [a, b] of L.high || []) S.highg[a * 16 + b] = 1;
  S.grain = (L.start ?? 60) + (L.belt ? 0 : opt.extraStart || 0);
  // scripted spawns with per-seed jitter (seed 0 = canonical timing, no jitter)
  let jr = (Math.imul(seed, 40503) + 7) >>> 0;
  const J = L.jitter ?? 10;
  S.spawns = (L.spawns || []).map((s, i) => {
    let t = s[0];
    if (seed !== 0 && !s[3]) { const [n, v] = mulberry(jr); jr = n; t = Math.max(0, t + (v % (2 * J + 1)) - J); }
    return { t, lane: s[1], k: s[2], fixed: !!s[3], i };
  }).sort((a, b) => a.t - b.t || a.i - b.i);
  const lastSpawn = S.spawns.length ? S.spawns[S.spawns.length - 1].t : 0;
  S.endTick = (L.endTick ?? lastSpawn + GRACE);
  for (const c of L.loadout || []) S.cdReady[c] = UNITS[c]?.startCd ?? 0;
  if (L.sky !== false) S.skyNext = L.skyAfterKill ? -2 : SKY.first; // -2: 1-1 — the first sky drop waits for the first dismantle
  if (L.belt) { S.beltNext = L.belt.first; S.beltPeriod = opt.assist ? Math.round((L.belt.period * 4) / 5) : L.belt.period; }
  if (L.boss) BOSS.init(S, L.boss);
  if (L.family) { S.wood = (L.family.start || 0) * 10; }
  if (L.puzzle) S.logs = [1, 1, 1, 1, 1]; // 锦囊谜题: no 檑木
  for (const p of L.preplace || []) addUnit(S, p[0], p[1], p[2]);
  return S;
}

// ───────────────────────── environment ─────────────────────────
export const isNight = (S: SimState): boolean => !!S.L.env?.night && !(S.dawnAt != null && S.tick >= S.dawnAt);
export const flagsOf = (S: SimState): number[] => S.flags || S.L.flags || [];
export const deckOf = (S: SimState): CardId[] => (S.L.belt ? [...new Set(S.belt)] : S.loadout || S.L.loadout || []);
export const inSmoke = (S: SimState, lane: number, col: number): boolean => col >= 0 && col < COLS && S.smoke[lane][col] > S.tick;
export const soaked = (S: SimState, lane: number): boolean => S.flood[lane] > S.tick;
export const laneActive = (S: SimState, lane: number): boolean => !!S.L.lanes[lane];
export function inc(S: SimState, v: number): number { // income multiplier with carried remainder (difficulty index D = m*)
  if (S.im === 100) return v;
  const t = v * S.im + S.imr; S.imr = t % 100; return (t - S.imr) / 100;
}
function ev(S: SimState, type: string, data: Partial<SimEvent>): void { if (S.ev) S.ev.push({ type, tick: S.tick, ...data }); }
export const unitById = (S: SimState, id: number): Unit | undefined => S.units.find((u) => u.id === id);
export const enemyById = (S: SimState, id: number): Enemy | undefined => S.enemies.find((e) => e.id === id);
export function occupant(S: SimState, lane: number, col: number): Unit | null | undefined { const id = S.grid[lane][col]; return id ? unitById(S, id) : null; }
/** the unit that is hit / acts on a tile (top of a raft stack, else the occupant) */
export function topAt(S: SimState, lane: number, col: number): Unit | null | undefined { const o = occupant(S, lane, col); if (!o) return null; if (o.k === 'raft' && o.top) return unitById(S, o.top); return o; }

// ───────────────────────── placement ─────────────────────────
/** null = allowed; otherwise a reason code (spec §3.3): over off lane belt deck cd grain rock occupied needRaft noWater notWater */
export function canPlace(S: SimState, card: CardId, lane: number, col: number): string | null {
  const L = S.L;
  if (S.result) return 'over';
  if (lane < 0 || lane >= LANES || col < 0 || col >= COLS) return 'off';
  if (!L.lanes[lane]) return 'lane';
  if (L.belt) { if (!S.belt.includes(card)) return 'belt'; }
  else {
    if (!(S.loadout || []).includes(card)) return 'deck';
    if (S.tick < (S.cdReady[card] ?? 0) && !L.puzzle) return 'cd';
    if (S.grain < UNITS[card].cost) return 'grain';
  }
  if (card === 'strike') return null;               // instant: any tile of an active lane
  if (S.rock[lane * 16 + col]) return 'rock';
  const o = occupant(S, lane, col);
  if (S.waterNow[lane]) {
    if (card === 'raft') return o ? 'occupied' : null;
    if (!o || o.k !== 'raft') return 'needRaft';
    if (o.top) return 'occupied';
    if (UNITS[card].flat || card === 'farm' || card === 'bank') return 'noWater';
    return null;
  }
  if (card === 'raft') return 'notWater';
  if (o) return 'occupied';
  return null;
}

export function addUnit(S: SimState, card: CardId, lane: number, col: number): Unit {
  const D = UNITS[card];
  const u: Unit = { id: S.nextId++, k: card, lane, col, hp: D.hp, max: D.hp, t0: S.tick, next: S.tick, pin: 0, top: 0, onRaft: 0,
    ultUntil: 0, fortUntil: 0, wear: 0, armAt: 0, tgt: 0, tOn: 0 };
  switch (card) {
    case 'farm': u.next = S.tick + D.first!; break;
    case 'bank': u.next = S.tick + D.build! + D.period!; break;
    case 'gust': u.next = S.tick + D.first!; break;
    case 'shooter': u.next = S.tick + 10; break;
    case 'lobber': case 'burner': u.next = S.tick + 20; break;
    case 'radial': u.next = S.tick + 10; break;
    case 'pit': u.armAt = S.tick + D.arm!; break;
    default: break;
  }
  const o = occupant(S, lane, col);
  if (o && o.k === 'raft' && card !== 'raft') { o.top = u.id; u.onRaft = o.id; }
  else S.grid[lane][col] = u.id;
  S.units.push(u);
  return u;
}

function removeUnit(S: SimState, u: Unit, why: string, by?: string): void {
  if (u.dead) return;
  if (by && why !== 'shovel' && why !== 'spent') S.stats.unitsLostBy[by] = (S.stats.unitsLostBy[by] || 0) + 1;
  u.dead = true;
  if (u.onRaft) { const r = unitById(S, u.onRaft); if (r) r.top = 0; }
  else if (S.grid[u.lane][u.col] === u.id) S.grid[u.lane][u.col] = 0;
  if (u.k === 'raft' && u.top) { const t = unitById(S, u.top); if (t) removeUnit(S, t, why); }
  for (const e of S.enemies) { if (e.pinId === u.id) e.pinId = 0; if (e.perchId === u.id) e.perchId = 0; }
  if (why !== 'shovel' && why !== 'spent') {
    S.stats.unitsLost++; if (ECON.has(u.k)) S.stats.econLost++;
    if (UNITS[u.k].role === 'attack') { S.stats.attLostIn = S.stats.attLostIn || [0, 0, 0, 0, 0]; S.stats.attLostIn[u.lane]++; }
  }
  ev(S, 'unitGone', { id: u.id, k: u.k, lane: u.lane, col: u.col, why, by });
}

// ───────────────────────── enemies ─────────────────────────
export function spawnEnemy(S: SimState, k: string, lane: number, x: number = SPAWN_X, extra?: Partial<Enemy>): Enemy {
  const D = ENEMIES[k];
  const e: Enemy = { id: S.nextId++, k, lane, x, hp: D.hp, max: D.hp, sh: D.shield || 0, armor: D.armor || 0, mat: D.mat, wt: D.wt,
    layer: D.layer, spd: D.speed, biteNext: 0, contact: 0, stuckUntil: 0, stunUntil: 0, burnUntil: 0, burnAt: 0,
    run: 0, mode: 0, recoilLeft: 0, lad: 0, ladHp: D.ladderHp || 0, ladT: 0, ladOn: 0, pinId: 0,
    perchId: 0, downUntil: 0, cloudNext: 0, revealed: 0, digUntil: 0, sumNext: 0, sumN: 0, hookUntil: 0,
    seen: -1, lastTile: -1, boss: null, parts: PARTS[D.wt] };
  if (extra) Object.assign(e, extra);
  S.enemies.push(e);
  ev(S, 'spawn', { id: e.id, k, lane });
  return e;
}
function spawnScripted(S: SimState, s: { k: string; lane: number }): void {
  if (s.k === 'swarm') { for (let i = 0; i < SWARM_N; i++) spawnEnemy(S, 'ant', s.lane, SPAWN_X + i * 2500); return; }
  if (s.k.startsWith('boss:')) { BOSS.spawnBoss(S, s.k.slice(5), s.lane, API); return; }
  spawnEnemy(S, s.k, s.lane);
}

// ───────────────────────── damage (the tag grammar, spec §3.4) ─────────────────────────
// dtype: pierce (bolts) · blunt (stones) · fire (pots) · light (beam) · crush (strike, log) · burn
export function hurt(S: SimState, e: Enemy, dmg: number, dtype: string, src?: Src | null): number {
  if (e.hp <= 0 || e.gone) return 0;
  if (e.boss) return BOSS.hurt(S, e, dmg, dtype, src, API);
  return hurtRaw(S, e, dmg, dtype, src);
}
export function hurtRaw(S: SimState, e: Enemy, dmg: number, dtype: string, src?: Src | null): number {
  if (dtype === 'fire' || dtype === 'burn') {
    if (e.mat === 'metal') { e.dings = (e.dings || 0) + 1; return 0; }
    if (dtype === 'fire') dmg = Math.floor((dmg * FIRE.woodNum) / FIRE.woodDen);
  } else if (dtype === 'pierce' || dtype === 'blunt' || dtype === 'crush') {
    if (e.armor) { dmg = Math.max(1, dmg - e.armor); e.dings = (e.dings || 0) + 1; }
  }
  if (e.k === 'ladder' && e.lad === 2 && dtype !== 'fire' && dmg > 1) dmg = Math.floor(dmg / 2); // the cart hides under the wall
  if (!e.boss && e.k !== 'drummer' && ENEMIES.drummer.auraDef && dmg > 1 && inAura(S, e)) dmg = Math.max(1, Math.floor((dmg * ENEMIES.drummer.auraDef) / 100)); // 鼓声壮胆
  if (dmg > e.hp) dmg = e.hp;
  e.hp -= dmg;
  if (src) { const k = src.k || (src as unknown as string); S.stats.dmgBy[k] = (S.stats.dmgBy[k] || 0) + dmg; if (e.hp <= 0) e.killer = k; }
  return dmg;
}
/** a straight hit from the front: the shield takes it first */
function hitFront(S: SimState, e: Enemy, dmg: number, dtype: string, src?: Src | null): number {
  if (e.sh > 0) {
    const D = ENEMIES[e.k];
    let d = dmg;
    if (D.shieldArmor && (dtype === 'pierce' || dtype === 'blunt')) d = Math.max(1, d - D.shieldArmor);
    if (D.shieldMat === 'metal' && (dtype === 'fire' || dtype === 'light')) d = dtype === 'light' ? d : 0;
    e.sh = Math.max(0, e.sh - d); S.stats.shieldDmg = (S.stats.shieldDmg || 0) + d;
    if (src) { S.stats.blockedBy = S.stats.blockedBy || {}; S.stats.blockedBy[src.k] = (S.stats.blockedBy[src.k] || 0) + 1; }
    return 0;
  }
  return hurt(S, e, dmg, dtype, src);
}
function ignite(S: SimState, e: Enemy): void {
  if (e.mat !== 'wood' || e.boss) return;
  if (S.tick >= e.burnUntil) e.burnAt = S.tick;
  e.burnUntil = S.tick + FIRE.burnTicks;
}
function burnShield(e: Enemy, dmg: number): void { // fire on a wooden shield: ×2
  if (e.sh > 0 && ENEMIES[e.k]?.shieldMat !== 'metal') e.sh = Math.max(0, e.sh - dmg * FIRE.shieldMul);
}
function highMul(S: SimState, u: Unit, dmg: number): number { return S.highg[u.lane * 16 + u.col] ? Math.floor((dmg * 5) / 4) : dmg; }

// ───────────────────────── targeting helpers ─────────────────────────
type Ok = (S: SimState, e: Enemy) => boolean;
const groundish = (e: Enemy): boolean => (e.layer === 'ground' || e.layer === 'water' || (e.layer === 'air' && e.downUntil > 0)) && !e.gone;
export const isAirNow = (S: SimState, e: Enemy): boolean => e.layer === 'air' && !(e.downUntil > S.tick);
const onBoard = (e: Enemy): boolean => e.x < BOARD_X;
function firstAhead(S: SimState, u: Unit, ok: Ok, maxX = BOARD_X): Enemy | null {
  const x0 = u.col * T + 3000; let best: Enemy | null = null;
  for (const e of S.byLane[u.lane]) { if (e.x < x0 || e.x > maxX || !onBoard(e) || e.hp <= 0) continue; if (!ok(S, e)) continue; if (!best || e.x < best.x) best = e; }
  return best;
}
const okGround: Ok = (S, e) => groundish(e) && !isAirNow(S, e) && e.layer !== 'under' && !e.untargetable;
const okGroundClear: Ok = (S, e) => okGround(S, e) && !inSmoke(S, e.lane, tileOf(e.x));
const okBeam: Ok = (S, e) => e.layer !== 'under' && !e.untargetable && !inSmoke(S, e.lane, tileOf(e.x)) && !e.highOnly;
function markedFor(S: SimState, u: Unit, ok: Ok, sameLane: boolean): Enemy | null {
  if (!S.mark) return null;
  const m = S.enemies.find((e) => e.id === S.mark && e.hp > 0 && !e.gone);
  if (!m || !onBoard(m) || !ok(S, m)) return null;
  if (sameLane && (m.lane !== u.lane || m.x < u.col * T + 3000)) return null;
  return m;
}

// ───────────────────────── actions ─────────────────────────
export function act(S: SimState, a: Action): boolean {
  switch (a.t) {
    case 'place': return place(S, a.card, a.lane, a.col);
    case 'collect': {
      const i = S.drops.findIndex((d) => d.id === a.id); if (i < 0) return false;
      collect(S, i); return true;
    }
    case 'shovel': {
      const u = topAt(S, a.lane, a.col) || occupant(S, a.lane, a.col); if (!u) return false;
      // 防误触 (rev d): within 3 s of placing AND before the unit has done anything, it is taken back whole
      if (!S.L.belt && S.tick - u.t0 <= 60 && !u.acted && u.hp === u.max) { S.grain += UNITS[u.k].cost; S.stats.spent -= UNITS[u.k].cost; S.cdReady[u.k] = S.tick; S.stats.refunds = (S.stats.refunds || 0) + 1; }
      removeUnit(S, u, 'shovel'); return true;
    }
    case 'mark': S.mark = a.id || 0; return true;
    case 'token': {
      if (S.tokens <= 0) return false;
      const u = topAt(S, a.lane, a.col); if (!u || !ult(S, u)) return false;
      u.acted = 1; S.tokens--; S.stats.tokenUses++; ev(S, 'ult', { k: u.k, lane: u.lane, col: u.col }); return true;
    }
    case 'drum': return callEarly(S);
    case 'swap': return BOSS.swap(S, a, API);
    case 'send': return familySend(S, a);
    default: return false;
  }
}
function collect(S: SimState, i: number): void { const d = S.drops[i]; S.grain += d.v; S.stats.grainIn += d.v; S.drops.splice(i, 1); }

function place(S: SimState, card: CardId, lane: number, col: number): boolean {
  const why = canPlace(S, card, lane, col);
  if (why) { ev(S, 'reject', { card, lane, col, why }); return false; }
  const D = UNITS[card];
  if (S.L.belt) S.belt.splice(S.belt.indexOf(card), 1);
  else { S.grain -= D.cost; S.stats.spent += D.cost; S.cdReady[card] = S.tick + D.cd; }
  S.stats.placed++; S.stats.placedByCard[card] = (S.stats.placedByCard[card] || 0) + 1;
  if (card === 'pit') { S.stats.pitsIn = S.stats.pitsIn || [0, 0, 0, 0, 0]; S.stats.pitsIn[lane]++; }
  if (card === 'strike') { S.strikes.push({ lane, col, at: S.tick + D.delay! }); ev(S, 'strike', { lane, col }); return true; }
  const u = addUnit(S, card, lane, col);
  ev(S, 'place', { card, lane, col, id: u.id });
  return true;
}

function ult(S: SimState, u: Unit): boolean {
  const xc = xcOf(u);
  switch (u.k) {
    case 'shooter': u.ultUntil = S.tick + 60; return true;
    case 'farm': addGrain(S, 60); return true;
    case 'bank': addGrain(S, 100); return true;
    case 'salvage': addGrain(S, 50); return true;
    case 'wall': u.hp = u.max; u.fortUntil = S.tick + 240; return true;
    case 'lobber': {
      const t = firstAhead(S, u, okGround); if (!t) return false;
      for (const e of S.byLane[u.lane]) if (okGround(S, e) && Math.abs(e.x - t.x) <= 15000) hurt(S, e, 400, 'blunt', u);
      return true;
    }
    case 'spikes': u.ultUntil = S.tick + 300; return true;
    case 'pit': if (S.tick < u.armAt) { u.armAt = S.tick; return true; } return false;
    case 'burner': {
      const t = firstAhead(S, u, okGround); const cx = t ? t.x : xc + 30000;
      S.fires = S.fires || []; S.fires.push({ lane: u.lane, x0: cx - 10000, x1: cx + 20000, until: S.tick + 120, src: u.k }); return true;
    }
    case 'beam': u.ultUntil = S.tick + 100; return true;
    case 'radial':
      for (const e of S.enemies) if (e.layer !== 'under' && onBoard(e) && dist2(u, e) <= 30000 * 30000) hurt(S, e, 30, 'pierce', u);
      return true;
    case 'gust': gust(S, u, true); return true;
    case 'hook':
      for (const e of S.enemies) if (Math.abs(e.lane - u.lane) <= 1 && groundish(e) && !isAirNow(S, e) && e.x >= xc - 3000 && e.x <= xc + 25000) pushBack(S, e, 20000, u);
      return true;
    case 'repair':
      for (const v of S.units) if (!v.dead && Math.abs(v.lane - u.lane) <= 1 && Math.abs(v.col - u.col) <= 1 && v.max > 0) v.hp = v.max;
      return true;
    case 'listener': for (const e of S.enemies) if (e.layer === 'under') surface(S, e, 40); return true;
    default: return false;
  }
}
function addGrain(S: SimState, v: number): void { const g = inc(S, v); S.grain += g; S.stats.grainIn += g; }

// 敲鼓提前迎战 (v1.1; kernel ready): pull the next flag wave forward while the board is calm
function callEarly(S: SimState): boolean {
  if (!S.L.drumOk) return false;
  const fi = S.flags.findIndex((t) => t > S.tick);
  if (fi < 0 || S.flags[fi] - 60 <= S.tick || S.drumUsed.includes(fi) || S.enemies.some((e) => e.x < 5 * T && !e.gone)) return false;
  const next = S.flags[fi]; const d = next - S.tick - 60; if (d < 100) return false;
  for (let i = S.si; i < S.spawns.length; i++) if (S.spawns[i].t >= next - 40) S.spawns[i].t -= d;
  S.spawns.sort((a, b) => a.t - b.t || a.i - b.i);
  S.flags[fi] = next - d; S.drumUsed.push(fi);
  let r10 = S.skyNext >= 0 && !isNight(S) ? 25 : 0; for (const u of S.units) if (!u.dead) r10 += u.k === 'farm' ? (isNight(S) ? 6 : 11) : u.k === 'bank' ? 31 : 0;
  const g = Math.min(120, Math.ceil((Math.max(20, r10) * 5 * d) / (20 * 40))); addGrain(S, g); S.stats.drums++;
  const last = S.spawns.length ? S.spawns[S.spawns.length - 1].t : 0; S.endTick = Math.min(S.endTick, last + GRACE);
  ev(S, 'drum', { saved: d, grain: g }); return true;
}

// 家庭推演 (v1.1): Dad (as 鲁班) sends machines from his wood budget during an open window
function familySend(S: SimState, a: { k: string; lane: number }): boolean {
  const F = S.L.family; if (!F) return false;
  const cost = F.cost[a.k] * 10; const phase = S.tick % F.window; const open = phase >= F.window - F.open && S.tick < F.window * F.windows;
  if (!open || F.cost[a.k] == null || S.wood < cost || !S.L.lanes[a.lane]) return false;
  if (a.k === 'swarm') spawnScripted(S, { k: 'swarm', lane: a.lane }); else spawnEnemy(S, a.k, a.lane);
  S.wood -= cost; S.stats.sent = (S.stats.sent || 0) + 1; ev(S, 'send', { k: a.k, lane: a.lane }); return true;
}

// ───────────────────────── unit behaviours ─────────────────────────
function dist2(u: Unit, e: Enemy): number { const dx = e.x - xcOf(u); const dy = (e.lane - u.lane) * T; return dx * dx + dy * dy; }
function laneHasGust(S: SimState, lane: number): boolean { return S.units.some((v) => !v.dead && v.k === 'gust' && v.lane === lane && !v.pin && !soaked(S, lane)); }

function unitTick(S: SimState, u: Unit): void {
  const D = UNITS[u.k];
  if (u.dead || u.k === 'raft') return;
  if (u.pin || (soaked(S, u.lane) && !u.onRaft)) { if (u.k === 'farm' || u.k === 'bank') u.next++; return; }
  const xc = xcOf(u); const night = isNight(S);
  switch (u.beh || D.beh) {
    case 'shooter': {
      if (S.tick < u.next) return;
      if (inSmoke(S, u.lane, u.col)) { S.stats.blindTicks++; return; }
      const t = firstAhead(S, u, okGroundClear); if (!t) { if (firstAhead(S, u, okGround)) S.stats.blindTicks++; return; }
      const ultOn = u.ultUntil > S.tick;
      S.bolts.push({ lane: u.lane, x: xc + 1000, dmg: highMul(S, u, D.dmg!), src: u, pierce: ultOn ? 3 : 1, hitIds: ultOn ? [] : null }); u.acted = 1;
      u.next = S.tick + (ultOn ? 5 : D.period!); return;
    }
    case 'lobber': case 'burner': {
      if (S.tick < u.next) return;
      const t = markedFor(S, u, okGround, true) || firstAhead(S, u, okGround); if (!t) return;
      S.lobs.push({ tgt: t.id, lane: u.lane, x: t.x, land: S.tick + D.flight!, dmg: highMul(S, u, D.dmg!), src: u, fire: u.k === 'burner' }); u.acted = 1;
      u.next = S.tick + D.period!; return;
    }
    case 'beam': {
      const ultOn = u.ultUntil > S.tick;
      if (!ultOn && (night || inSmoke(S, u.lane, u.col))) { u.tgt = 0; u.tOn = 0; return; }
      if ((S.tick - u.t0) % 10 !== 0) return;
      if (ultOn) { for (const e of S.byLane[u.lane]) if (onBoard(e) && e.x >= xc - 3000 && okBeam(S, e)) { hurt(S, e, highMul(S, u, 25), 'light', u); ignite(S, e); } return; }
      const t = firstAhead(S, u, okBeam, xc + D.range!); if (!t) { u.tgt = 0; u.tOn = 0; return; }
      u.acted = 1;
      if (t.id === u.tgt) u.tOn += 10; else { u.tgt = t.id; u.tOn = 0; }
      const dmg = highMul(S, u, D.ramp![Math.min(4, Math.floor(u.tOn / 20))]);
      hitFront(S, t, dmg, 'light', u); if (t.sh <= 0) ignite(S, t);
      return;
    }
    case 'radial': {
      if (S.tick < u.next || inSmoke(S, u.lane, u.col)) return;
      const R2 = D.radius! * D.radius!;
      const okR: Ok = (_S2, e) => e.layer !== 'under' && !e.untargetable && !inSmoke(S, e.lane, tileOf(e.x)) && dist2(u, e) <= R2;
      let t = markedFor(S, u, okR, false);
      if (!t) { let bd = Infinity; for (const e of S.enemies) { if (e.hp <= 0 || e.gone || !onBoard(e) || !okR(S, e)) continue; const d = dist2(u, e); if (d < bd) { bd = d; t = e; } } }
      if (!t) return;
      S.hits.push({ tgt: t.id, at: S.tick + D.travel!, dmg: highMul(S, u, D.dmg!), src: u, front: t.lane === u.lane && t.x > xc }); u.acted = 1;
      u.next = S.tick + D.period!; return;
    }
    case 'farm': {
      if (S.tick < u.next) return;
      if (S.enemies.some((e) => e.perchId === u.id) || inSmoke(S, u.lane, u.col)) { u.next++; return; }
      dropGrain(S, night ? D.amtNight! : D.amt!, u.lane, u.col, u.k); u.acted = 1; u.next = S.tick + D.period!; return;
    }
    case 'bank': {
      if (S.tick < u.next) return;
      if (S.enemies.some((e) => e.perchId === u.id) || inSmoke(S, u.lane, u.col)) { u.next++; return; }
      dropGrain(S, D.amt!, u.lane, u.col, u.k); u.acted = 1; u.next = S.tick + D.period!; return;
    }
    case 'gust': if (S.tick >= u.next) { gust(S, u, false); u.acted = 1; u.next = S.tick + D.period!; } return;
    case 'hook': {
      if (S.tick < u.next) return;
      // 钩拒 goes for a ladder first (raised or raising), then a boat, then the frontmost machine in reach
      let t: Enemy | null = null; let tp = 9;
      for (const e of S.byLane[u.lane]) {
        if (e.hp <= 0 || e.gone || isAirNow(S, e) || e.layer === 'under') continue; if (e.x < xc - 3000 || e.x > xc + D.reach!) continue;
        const pr = e.lad === 1 || e.lad === 2 ? 0 : e.layer === 'water' ? 1 : 2; if (!t || pr < tp || (pr === tp && e.x < t.x)) { t = e; tp = pr; }
      }
      if (!t) return;
      const push = D.push as Record<string, number>;
      const amt = t.layer === 'water' ? push.water : push[t.wt];
      pushBack(S, t, amt, u); u.acted = 1; u.next = S.tick + D.period!; return;
    }
    case 'repair': {
      if ((S.tick - u.t0) % 10 !== 0) return;
      for (const v of S.units) if (!v.dead && v !== u && v.max > 0 && v.hp < v.max && Math.abs(v.lane - u.lane) <= 1 && Math.abs(v.col - u.col) <= 1) v.hp = Math.min(v.max, v.hp + D.heal!);
      return;
    }
    default: return;
  }
}

export function dropGrain(S: SimState, amt: number, lane: number, col: number, from: string): void {
  const v = inc(S, amt); if (v <= 0) return;
  S.drops.push({ id: S.nextId++, v, t: S.tick, lane, col, from }); ev(S, 'drop', { v, from });
}

export function gust(S: SimState, u: Unit, big: boolean): void {
  const D = UNITS.gust; const xc = xcOf(u); const push = D.push as number;
  const lanes = big ? [u.lane - 1, u.lane, u.lane + 1] : [u.lane];
  for (const ln of lanes) {
    if (ln < 0 || ln >= LANES) continue;
    let cleared = 0;
    if (!S.smokeHard[ln]) for (let c = big ? 0 : u.col; c < COLS; c++) { if (S.smoke[ln][c] > S.tick) { S.stats.smokeCleared++; cleared++; } S.smoke[ln][c] = 0; }
    if (cleared) for (const sm of S.enemies) if (sm.k === 'smoker' && sm.hp > 0 && !sm.gone && sm.lane === ln && sm.x < BOARD_X) ev(S, 'counter', { id: sm.id, k: 'smoker', card: 'gust' });
  }
  for (const e of S.enemies) {
    if (e.hp <= 0 || e.gone || !lanes.includes(e.lane)) continue;
    if (!big && e.x < xc - 3000 && !(e.layer === 'air' && !e.boss)) continue; // the bellows ground every bird in the lane
    if (e.boss) { BOSS.onGust(S, e, u, API); continue; }
    if (e.layer === 'air') { if (!(e.downUntil > S.tick)) { e.downUntil = S.tick + (big ? 160 : D.down!); e.perchId = 0; ev(S, 'grounded', { id: e.id, k: e.k }); ev(S, 'counter', { id: e.id, k: e.k, card: 'gust' }); } continue; }
    if (e.layer === 'under') { if (e.revealed) { surface(S, e, 30); e.x = Math.min(SPAWN_X, e.x + push); } continue; }
    if (e.layer === 'ground' && e.wt === 'light') { e.x = Math.min(SPAWN_X, e.x + (big ? 2 * push : push)); e.contact = 0; }
  }
}
function surface(S: SimState, e: Enemy, stun: number): void { e.layer = 'ground'; e.spd = ENEMIES[e.k].speedUp || e.spd; e.stunUntil = S.tick + stun; e.digUntil = 0; ev(S, 'surface', { id: e.id }); }
export function pushBack(S: SimState, e: Enemy, d: number, src?: Src | null): void {
  if (e.boss) { BOSS.onHook(S, e, d, src, API); return; }
  if (src && src.k === 'hook') ev(S, 'counter', { id: e.id, k: e.k, card: 'hook' });
  e.x = Math.min(SPAWN_X, e.x + d); e.contact = 0;
  if (e.k === 'ram') { e.run = 0; e.mode = 0; e.recoilLeft = 0; }
  if (e.lad === 1 || e.lad === 2) { dropLadder(S, e); S.stats.laddersHooked = (S.stats.laddersHooked || 0) + 1; }
  if (e.hookUntil) e.hookUntil = 0;
  ev(S, 'push', { id: e.id, d });
}
function dropLadder(S: SimState, e: Enemy): void {
  for (const id of e.pins || (e.pinId ? [e.pinId] : [])) { const p = unitById(S, id); if (p) p.pin = 0; }
  e.pins = []; e.pinId = 0; e.lad = 3; e.ladOn = 0; ev(S, 'ladderDown', { id: e.id });
}

// ───────────────────────── enemy behaviours ─────────────────────────
function blockerFor(S: SimState, e: Enemy): Unit | null { // nearest standing unit ahead in the lane that the enemy has not passed
  const row = S.grid[e.lane];
  for (let c = Math.min(COLS - 1, tileOf(e.x)); c >= 0; c--) {
    const id = row[c]; if (!id) continue;
    const u = unitById(S, id); if (!u || u.dead) continue;
    if (UNITS[u.k].flat) continue;
    if (c * T + PASS > e.x) continue;
    return u;
  }
  return null;
}
function inAura(S: SimState, e: Enemy): boolean {
  for (const d of S.enemies) if (d.k === 'drummer' && d.hp > 0 && !d.gone && Math.abs(d.lane - e.lane) <= 1 && Math.abs(d.x - e.x) <= ENEMIES.drummer.auraDx! && d.x < BOARD_X) return true;
  return false;
}
function auraPct(S: SimState, e: Enemy): number {
  if (e.k === 'drummer' || e.boss) return 100;
  for (const d of S.enemies) if (d.k === 'drummer' && d.hp > 0 && !d.gone && Math.abs(d.lane - e.lane) <= 1 && Math.abs(d.x - e.x) <= ENEMIES.drummer.auraDx! && onBoard(d)) return ENEMIES.drummer.auraPct!;
  if (S.boss && S.boss.type === 'ship' && e.k === 'boat' && S.enemies.some((x) => x.id === S.boss!.drum && x.hp > 0 && !x.gone)) return 120;
  return 100;
}
function biteUnit(S: SimState, e: Enemy, u: Unit, dmg: number): void {
  if (u.fortUntil > S.tick) dmg = dmg >> 1;
  else if (S.units.some((m) => m.k === 'repair' && !m.dead && !m.pin && m !== u && Math.abs(m.lane - u.lane) <= 1 && Math.abs(m.col - u.col) <= 1)) dmg = Math.floor((dmg * (100 - UNITS.repair.fortPct!)) / 100); // 墨匠加固
  const target = u.k === 'raft' && u.top ? unitById(S, u.top) || u : u;
  target.hp -= dmg;
  if (target.hp <= 0) removeUnit(S, target, 'bitten', e.k);
}

function enemyTick(S: SimState, e: Enemy): void {
  if (e.boss) { BOSS.tickPart(S, e, API); return; }
  const D = ENEMIES[e.k];
  // burn
  if (e.burnUntil > S.tick && (S.tick - e.burnAt) % 10 === 0 && S.tick > e.burnAt) hurt(S, e, FIRE.burnPerHalfSec, 'burn', { k: 'burn' });
  if (e.hp <= 0) return;
  if (e.stunUntil > S.tick || e.stuckUntil > S.tick) return;
  const aura = auraPct(S, e); if (aura > 100) S.stats.auraTicks++;
  // ── underground ──
  if (e.layer === 'under') {
    const jar = S.units.find((u) => !u.dead && u.k === 'listener' && u.lane === e.lane);
    if (jar) {
      e.revealed = 1;
      if (e.x <= jar.col * T + FACE) { surface(S, e, 30); ev(S, 'heard', { id: e.id }); return; }
    }
    if (e.x > 0) { e.x = Math.max(0, e.x - e.spd); return; }
    if (!e.digUntil) { e.digUntil = S.tick + D.dig!; S.stats.dug++; }
    if (S.tick >= e.digUntil) breach(S, e);
    return;
  }
  // ── air ──
  if (e.layer === 'air') {
    if (e.downUntil > S.tick) return;                       // knocked down: sits on the ground, hittable
    if (e.downUntil) e.downUntil = 0;
    if (e.perchId) {
      const p = unitById(S, e.perchId);
      if (!p || p.dead) { e.perchId = 0; }
      else { if (S.tick >= e.biteNext) { biteUnit(S, e, p, D.peck! >> 1); e.biteNext = S.tick + BITE_EVERY; } return; }
    }
    let target: Unit | null = null; // the econ unit with the largest column ahead of the bird; else the front-most standing unit
    for (let pass = 0; pass < 2 && !target; pass++) for (let c = Math.min(COLS - 1, tileOf(e.x)); c >= 0; c--) {
      const u = topAt(S, e.lane, c); if (!u || u.dead || UNITS[u.k].flat || u.k === 'raft') continue;
      if (pass === 0 && !ECON.has(u.k)) continue;
      if (c * T + FACE > e.x + 1) continue; target = u; break;
    }
    const v = Math.floor((e.spd * aura) / 100);
    if (e.chick && (!target || !ECON.has(target.k))) { e.gone = true; ev(S, 'flyHome', { id: e.id }); return; } // nothing to steal: back to the 木鸢
    if (target && e.x - v <= target.col * T + FACE) { e.x = target.col * T + FACE; e.perchId = target.id; e.biteNext = S.tick + BITE_EVERY; ev(S, 'perch', { id: e.id, on: target.id }); return; }
    e.x -= v; if (e.x < 0) breach(S, e);
    return;
  }
  // ── ground / water ──
  const tile = tileOf(e.x + FEET);
  let slow = 100;
  if (tile < COLS && e.layer === 'ground') {
    const h = occupant(S, e.lane, tile);
    if (h && h.k === 'spikes' && !h.dead) {
      slow = UNITS.spikes.slowPct!; h.acted = 1;
      if (e.k === 'ram' || e.k === 'ladder' || e.k === 'carrier' || e.k === 'tower') { if (e.jamBy !== h.id) { e.jamBy = h.id; ev(S, 'counter', { id: e.id, k: e.k, card: 'spikes' }); } e.run = 0; e.noRun = tile * T - UNITS.spikes.jam!; }
      if (e.lastTile !== tile && e.wt === 'heavy') { h.wear++; if (h.wear >= UNITS.spikes.wear! && h.ultUntil <= S.tick) removeUnit(S, h, 'spent'); }
    } else if (h && h.k === 'pit' && !h.dead && S.tick >= h.armAt) {
      if (e.wt === 'heavy') { e.stuckUntil = S.tick + UNITS.pit.stuck!; e.run = 0; removeUnit(S, h, 'spent'); ev(S, 'stuck', { id: e.id }); ev(S, 'counter', { id: e.id, k: e.k, card: 'pit' }); e.lastTile = tile; return; }
      removeUnit(S, h, 'spent'); ev(S, 'counter', { id: e.id, k: e.k, card: 'pit' }); capture(S, e); return;
    }
    // spikes ult: the next two tiles behave as spikes for 15 s
    for (let c = tile + 1; c <= tile + 2 && c < COLS; c++) {
      const s = occupant(S, e.lane, tile - (c - tile)); if (s && s.k === 'spikes' && s.ultUntil > S.tick) slow = UNITS.spikes.slowPct!;
    }
  }
  if (soaked(S, e.lane) && e.layer === 'ground') slow = Math.min(slow, 60);
  e.lastTile = tile;
  const v = Math.floor((Math.floor((e.spd * slow) / 100) * aura) / 100);
  const b = blockerFor(S, e);
  const face = b ? b.col * T + FACE : -1e9;
  // ram: momentum (speed grows with run; impact = f(run); recoil and charge again)
  if (e.k === 'ram') {
    if (e.mode === 1) { // recoiling
      e.x = Math.min(SPAWN_X, e.x + Math.floor(D.recoil! / D.recoilTicks!)); e.recoilLeft--;
      if (e.recoilLeft <= 0) { e.mode = 0; e.run = 0; }
      return;
    }
    const sp = Math.floor(((e.spd + Math.floor(((D.speedMax! - e.spd) * e.run) / D.runFull!)) * slow) / 100);
    const vv = Math.floor((sp * aura) / 100);
    const jammed = e.noRun && e.x > e.noRun; // 卡了蒺藜: no run-up until 1.5 tiles past the spikes
    if (b && e.x - vv <= face) {
      const moved = Math.max(0, e.x - face); e.x = face;
      if (slow === 100 && !jammed) e.run = Math.min(D.runFull!, e.run + moved);
      const dmg = Math.floor(((D.impactMin! + Math.floor(((D.impactMax! - D.impactMin!) * e.run) / D.runFull!)) * aura) / 100);
      biteUnit(S, e, b, dmg); ev(S, 'impact', { id: e.id, dmg, run: e.run });
      e.run = 0; e.mode = 1; e.recoilLeft = D.recoilTicks!; return;
    }
    e.x -= vv; if (slow === 100 && !jammed) e.run = Math.min(D.runFull!, e.run + vv); else e.run = 0;
    if (e.x < 0) breach(S, e);
    return;
  }
  // boat: hooks rafts instead of biting (v2)
  if (e.k === 'boat') {
    if (b && e.x - v <= face) {
      e.x = face;
      if (!e.hookUntil) { e.hookUntil = S.tick + D.hookTicks!; e.hookId = b.id; ev(S, 'hookRaft', { id: e.id }); }
      else if (S.tick >= e.hookUntil) { const r = unitById(S, e.hookId!); if (r && !r.dead) removeUnit(S, r, 'hooked'); e.hookUntil = 0; }
      return;
    }
    e.hookUntil = 0; e.x -= v; if (e.x < 0) breach(S, e); return;
  }
  // ladder: plants on the first blocker, pins the units behind it (up to 3 columns back)
  if (e.k === 'ladder' && b && e.x - v <= face) {
    e.x = face;
    if (e.lad === 0) { e.lad = 1; e.ladT = S.tick + D.raise!; e.ladOn = b.id; ev(S, 'ladderRaise', { id: e.id }); return; }
    if (e.lad === 1) {
      if (e.ladOn !== b.id) { e.ladOn = b.id; e.ladT = S.tick + D.raise!; return; }
      if (S.tick >= e.ladT) {
        e.lad = 2; S.stats.ladders++;
        e.pins = [];
        for (let c = b.col - 1; c >= Math.max(0, b.col - 3) && e.pins.length < D.pinMax!; c--) { const p = topAt(S, e.lane, c); if (p && !p.dead && !UNITS[p.k].flat) { p.pin = e.id; e.pins.push(p.id); S.stats.pins++; } }
        e.pinId = e.pins[0] || 0; e.pinsMax = Math.max(e.pinsMax || 0, e.pins.length);
        ev(S, 'ladderUp', { id: e.id, pin: e.pinId });
      }
      return;
    }
    if (e.lad === 2 && e.ladOn !== b.id) dropLadder(S, e);
    if (S.tick >= e.biteNext) { biteUnit(S, e, b, Math.floor((D.bite! * aura) / 200)); e.biteNext = S.tick + BITE_EVERY; }
    return;
  }
  if (e.k === 'ladder' && e.lad === 2) dropLadder(S, e);
  // smoke cart
  if (e.k === 'smoker' && onBoard(e)) {
    if (!e.cloudNext) e.cloudNext = S.tick + D.cloudFirst!;
    if (S.tick >= e.cloudNext) { emitCloud(S, e.lane, tileOf(e.x), D.cloudDur!); e.cloudNext = S.tick + D.cloudEvery!; }
  }
  // tower (v2): drops a walker every 10 s while on the board
  if (e.k === 'tower' && onBoard(e)) {
    if (!e.sumNext) e.sumNext = S.tick + D.summonEvery!;
    if (S.tick >= e.sumNext && e.sumN < D.summonMax!) { spawnEnemy(S, 'walker', e.lane, e.x); e.sumN++; S.stats.summons++; e.sumNext = S.tick + D.summonEvery!; ev(S, 'summon', { id: e.id }); }
  }
  // generic mover / biter
  if (b && e.x <= face) {
    if (S.tick >= e.biteNext) { biteUnit(S, e, b, Math.floor((D.bite! * aura) / 200)); e.biteNext = S.tick + BITE_EVERY; }
    return;
  }
  // drum cart: keeps one tile behind the nearest machine ahead in its lane
  if (e.k === 'drummer' && onBoard(e)) {
    let ahead: Enemy | null = null;
    for (const o of S.byLane[e.lane]) if (o !== e && o.hp > 0 && !o.gone && o.x < e.x && (o.layer === 'ground' || o.layer === 'water') && (!ahead || o.x > ahead.x)) ahead = o;
    if (ahead && e.x - v < ahead.x + D.follow!) { e.x = Math.max(e.x - Math.max(0, Math.min(v, e.x - (ahead.x + D.follow!))), b ? face : -1e9); if (b && e.x === face) e.biteNext = S.tick + BITE_EVERY; return; }
  }
  e.x = b ? Math.max(face, e.x - v) : e.x - v;
  if (b && e.x === face) e.biteNext = S.tick + BITE_EVERY;
  if (e.x < 0) breach(S, e);
}
/** the cloud covers the cart's own lane only (3 cells: its tile and the 2 in front); wide = v2 万机城 */
export function emitCloud(S: SimState, lane: number, col: number, dur: number, wide = false): void {
  for (let ln = wide ? lane - 1 : lane; ln <= (wide ? lane + 1 : lane); ln++) {
    if (ln < 0 || ln >= LANES || !S.L.lanes[ln]) continue;
    S.smokeSeen = S.smokeSeen || [-1e9, -1e9, -1e9, -1e9, -1e9]; S.smokeSeen[ln] = S.tick + dur;
    for (let c = col - 2; c <= col; c++) if (c >= 0 && c < COLS) S.smoke[ln][c] = Math.max(S.smoke[ln][c], S.tick + dur);
  }
  ev(S, 'cloud', { lane, col });
}

function capture(S: SimState, e: Enemy): void { e.captured = true; e.hp = 0; S.stats.captured++; ev(S, 'captured', { id: e.id, k: e.k }); }

export function laneKinds(S: SimState, ln: number): string[] { return S.units.filter((u) => !u.dead && u.lane === ln).map((u) => u.k); }
/** facts about a breach, read from the live state (the fail-cause self-check V12b compares the verdict against these) */
export function breachFacts(S: SimState, e: Enemy): Partial<SimEvent> {
  const ln = e.lane;
  return { id: e.id, seen: e.seen, guard: e.guard ?? -1, units: laneKinds(S, ln),
    near: S.units.filter((u) => !u.dead && Math.abs(u.lane - ln) === 1).map((u) => u.k),
    smoky: S.smoke[ln].some((t) => t > S.tick) || (S.smokeSeen?.[ln] ?? -1e9) > S.tick - 400,
    drum: S.enemies.some((d) => d.k === 'drummer' && d.hp > 0 && !d.gone && Math.abs(d.lane - ln) <= 1 && d.x < BOARD_X),
    pits: S.stats.pitsIn?.[ln] || 0, pins: e.k === 'ladder' ? (e.pinsMax || 0) : 0, attLost: S.stats.attLostIn?.[ln] || 0 };
}
export function breach(S: SimState, e: Enemy): void {
  const ln = e.lane;
  if (e.boss) { BOSS.onBreach(S, e, API); return; }
  if (S.logs[ln] < (S.logCap || 1)) {
    S.logs[ln]++; S.stats.logsUsed++; S.stats.breachLanes.push(ln);
    if (S.stats.firstLeak < 0) S.stats.firstLeak = S.tick;
    ev(S, 'log', { lane: ln, by: e.k, ...breachFacts(S, e) });
    e.hp = 0; e.byLog = true;
    for (const o of S.enemies) {
      if (o.lane !== ln || o.hp <= 0 || o.gone) continue;
      if (o.boss) { BOSS.onLog(S, o, API); continue; }
      if (o.layer === 'ground' || o.layer === 'water' || (o.layer === 'air' && (o.downUntil > S.tick || o.x < T))) { o.hp = 0; o.byLog = true; }
    }
    return;
  }
  S.result = 'lose'; S.stats.lostTo = e.k; S.stats.lostLane = ln; ev(S, 'lose', { lane: ln, by: e.k, ...breachFacts(S, e) });
}

// ───────────────────────── step ─────────────────────────
export function step(S: SimState, actions?: Action[] | null): SimState {
  if (S.result) return S;
  const L = S.L;
  if (actions) for (const a of actions) act(S, a);
  // spawns
  while (S.si < S.spawns.length && S.spawns[S.si].t <= S.tick) spawnScripted(S, S.spawns[S.si++]);
  // floods (v2; telegraphed by the UI 5 s before)
  const fl = L.env?.floods;
  if (fl) for (const f of fl) {
    if (S.tick === f.at) {
      S.flood[f.lane] = f.at + f.dur;
      for (const u of S.units) if (!u.dead && u.lane === f.lane && UNITS[u.k].flat) removeUnit(S, u, 'washed');
      ev(S, 'flood', { lane: f.lane });
    }
  }
  if (S.boss) BOSS.tick(S, API);
  // sky grain
  if (S.skyNext >= 0 && S.tick >= S.skyNext) {
    if (!isNight(S)) dropGrain(S, SKY.amt, -1, -1, 'sky');
    const j = S.seed === 0 ? 0 : rngInt(S, -SKY.jitter, SKY.jitter);
    S.skyNext = S.tick + SKY.period + j;
  }
  // conveyor
  if (L.belt && S.tick >= S.beltNext) {
    if (S.belt.length < (L.belt.cap || 6)) { S.belt.push(L.belt.seq[S.beltI % L.belt.seq.length]); S.beltI++; } else S.stats.beltFull++;
    if (S.belt.length > S.stats.beltMax) S.stats.beltMax = S.belt.length;
    S.beltNext = S.tick + (S.beltPeriod || L.belt.period);
  }
  // family wood (v1.1)
  if (L.family && S.tick % 20 === 0) S.wood += L.family.tenthsPerSec;
  // auto-collect
  for (let i = S.drops.length - 1; i >= 0; i--) if (S.tick - S.drops[i].t >= AUTO_COLLECT) collect(S, i);
  // per-lane enemy lists
  S.byLane = [[], [], [], [], []];
  for (const e of S.enemies) if (!e.gone && e.hp > 0) S.byLane[e.lane].push(e);
  // units act
  for (const u of S.units) unitTick(S, u);
  // bolts
  for (let i = S.bolts.length - 1; i >= 0; i--) {
    const b = S.bolts[i]; const x0 = b.x; b.x += 5000;
    let hit: Enemy | null = null;
    for (const e of S.byLane[b.lane]) {
      if (e.hp <= 0 || e.gone || !okGroundClear(S, e)) continue;
      if (b.hitIds && b.hitIds.includes(e.id)) continue;
      if (e.x <= b.x && e.x + (e.body || BODY) >= x0 && (!hit || e.x < hit.x)) hit = e;
    }
    if (hit) {
      hitFront(S, hit, b.dmg, 'pierce', b.src);
      if (b.hitIds) { b.hitIds.push(hit.id); b.pierce--; }
      if (!b.hitIds || b.pierce <= 0) { S.bolts.splice(i, 1); continue; }
    }
    if (b.x > BOARD_X + T) S.bolts.splice(i, 1);
  }
  // lobs
  for (let i = S.lobs.length - 1; i >= 0; i--) {
    const l = S.lobs[i]; const t = S.enemies.find((e) => e.id === l.tgt);
    if (t && t.hp > 0 && !t.gone) l.x = t.x;
    if (S.tick < l.land) continue;
    S.lobs.splice(i, 1);
    if (l.fire) {
      const r = laneHasGust(S, l.lane) ? Math.floor((UNITS.burner.radius! * UNITS.gust.fireMulPct!) / 100) : UNITS.burner.radius!;
      let n = 0;
      for (const e of S.byLane[l.lane]) {
        if (e.hp <= 0 || e.gone || !okGround(S, e) || Math.abs(e.x - l.x) > r) continue;
        if (e.boss) { BOSS.hurt(S, e, l.dmg, 'fire', l.src, API); n++; continue; }
        burnShield(e, l.dmg); hurt(S, e, l.dmg, 'fire', l.src); ignite(S, e); n++;
        if (e.lad === 1 || e.lad === 2) { e.ladHp -= Math.floor((l.dmg * 3) / 2); if (e.ladHp <= 0) dropLadder(S, e); }
      }
      let dead = 0; for (const e of S.byLane[l.lane]) if (e.hp <= 0 && !e.gone && Math.abs(e.x - l.x) <= r) dead++;
      if (dead > S.stats.bestSplash) S.stats.bestSplash = dead;
      if (n > S.stats.bestBurn) S.stats.bestBurn = n;
      if (r > UNITS.burner.radius! && n > (S.stats.windBurn || 0)) S.stats.windBurn = n; // 火借风势
      if (r > UNITS.burner.radius!) BOSS.onWindFire(S, l.lane, API);
      if (!n) S.stats.wasted++;
    } else if (t && t.hp > 0 && !t.gone && okGround(S, t)) hurt(S, t, l.dmg, 'blunt', l.src);
    else S.stats.wasted++;
  }
  // radial hits
  for (let i = S.hits.length - 1; i >= 0; i--) {
    const h = S.hits[i]; if (S.tick < h.at) continue; S.hits.splice(i, 1);
    const t = S.enemies.find((e) => e.id === h.tgt); if (!t || t.hp <= 0 || t.gone) { S.stats.wasted++; continue; }
    if (h.front) hitFront(S, t, h.dmg, 'pierce', h.src); else hurt(S, t, h.dmg, 'pierce', h.src);
  }
  // strikes (礌石): 3×3 tiles centred on the target tile
  for (let i = S.strikes.length - 1; i >= 0; i--) {
    const s = S.strikes[i]; if (S.tick < s.at) continue; S.strikes.splice(i, 1);
    let n = 0;
    for (const e of S.enemies) {
      if (e.hp <= 0 || e.gone || e.layer === 'under' || e.highOnly || e.untargetable || Math.abs(e.lane - s.lane) > 1) continue;
      if (e.x + (e.body || BODY) < (s.col - 1) * T || e.x > (s.col + 2) * T) continue;
      hurt(S, e, UNITS.strike.dmg!, 'crush', { k: 'strike' }); n++;
      if (e.lad === 1 || e.lad === 2) dropLadder(S, e);
    }
    S.stats.strikeHits.push(n); ev(S, 'strikeLand', { lane: s.lane, col: s.col, n });
  }
  // fire walls (burner ult)
  if (S.fires) for (let i = S.fires.length - 1; i >= 0; i--) {
    const f = S.fires[i]; if (S.tick >= f.until) { S.fires.splice(i, 1); continue; }
    if (S.tick % 10 !== 0) continue;
    for (const e of S.byLane[f.lane]) if (e.hp > 0 && okGround(S, e) && e.x >= f.x0 && e.x <= f.x1) { hurt(S, e, 12, 'fire', { k: 'burner' }); ignite(S, e); }
  }
  // enemies act
  for (const e of S.enemies) if (e.hp > 0 && !e.gone) enemyTick(S, e);
  // deaths
  for (let i = S.enemies.length - 1; i >= 0; i--) {
    const e = S.enemies[i];
    if (e.gone) { S.enemies.splice(i, 1); continue; }
    if (e.hp > 0) continue;
    if (e.boss && !BOSS.onDeath(S, e, API)) continue;
    S.enemies.splice(i, 1);
    if (!e.byLog) {
      S.parts += e.parts; while (S.parts >= PARTS_PER_TOKEN) { S.parts -= PARTS_PER_TOKEN; if (S.tokens < TOKEN_MAX) S.tokens++; }
      salvagePay(S, e);
    }
    S.stats.kills++; if (e.killer) S.stats.killsBy[e.killer] = (S.stats.killsBy[e.killer] || 0) + 1;
    if (!e.byLog && !e.captured && e.killer && !e.boss) ev(S, 'counter', { id: e.id, k: e.k, card: e.killer === 'burn' ? 'burner' : e.killer, kill: 1 });
    if (S.skyNext === -2 && !e.byLog) S.skyNext = S.tick + 20;
    if (e.k === 'carrier') for (let j = 0; j < ENEMIES.carrier.carry!; j++) spawnEnemy(S, 'walker', e.lane, Math.max(0, e.x + j * 3000));
    for (const u of S.units) if (u.pin === e.id) u.pin = 0;
    if (S.mark === e.id) S.mark = 0;
    ev(S, 'gone', { id: e.id, k: e.k, lane: e.lane, x: e.x, captured: !!e.captured, log: !!e.byLog, by: e.killer || null });
  }
  for (let i = S.units.length - 1; i >= 0; i--) if (S.units[i].dead) S.units.splice(i, 1);
  // stats
  const st = S.stats;
  let onScreen = 0;
  for (const e of S.enemies) {
    if (e.gone || e.hp <= 0) continue;
    if (e.x < st.minX[e.lane]) st.minX[e.lane] = e.x;
    if (st.minXByKind[e.k] == null || e.x < st.minXByKind[e.k]) st.minXByKind[e.k] = e.x;
    if (onBoard(e)) onScreen += e.k === 'ant' ? 1 : 3;
    if (e.seen < 0 && onBoard(e)) { e.seen = S.tick; e.guard = S.units.filter((u) => !u.dead && u.lane === e.lane && (UNITS[u.k].role === 'attack')).length; }
  }
  if (onScreen > st.peak * 3) st.peak = Math.ceil(onScreen / 3);
  {
    let raw = 0; for (const e of S.enemies) if (!e.gone && e.hp > 0 && onBoard(e)) raw++; if (raw > (st.peakRaw || 0)) st.peakRaw = raw;
    if (S.units.length > (st.peakUnits || 0)) st.peakUnits = S.units.length; const pr = S.bolts.length + S.lobs.length + S.hits.length; if (pr > (st.peakProj || 0)) st.peakProj = pr;
  }
  if (S.tick % 20 === 0) { st.floatSum += S.grain; st.floatN++; if (S.grain > st.maxFloat) st.maxFloat = S.grain; }
  if (st.coverAtFlag1 < 0 && S.flags.length && S.tick === S.flags[0]) {
    let mn = 99; for (let l = 0; l < LANES; l++) if (L.lanes[l]) mn = Math.min(mn, S.units.filter((u) => u.lane === l && ['shooter', 'lobber', 'burner', 'beam', 'radial'].includes(u.k)).length);
    st.coverAtFlag1 = mn;
  }
  if (S.tick === 1200 || S.tick === 1800) {
    const n = S.units.filter((u) => ECON.has(u.k)).length; if (S.tick === 1200) st.econAt60 = n; else st.econAt90 = n;
  }
  // end
  if (!S.result && !S.L.noEnd) {
    const allSpawned = S.si >= S.spawns.length && (!S.boss || S.boss.done);
    const clear = S.enemies.every((e) => e.gone || e.hp <= 0);
    if (allSpawned && (clear || (S.tick >= S.endTick && !S.L.clearOnly)) && !(S.L.minTicks && S.tick < S.L.minTicks)) { S.result = 'win'; ev(S, 'win', {}); }
    if (!S.result && S.L.clearOnly && S.tick >= S.endTick) { S.result = 'lose'; S.stats.lostTo = 'time'; ev(S, 'lose', { by: 'time' }); }
    if (!S.result && S.L.maxTicks && S.tick >= S.L.maxTicks) { S.result = 'win'; }
  }
  S.tick++;
  return S;
}

function salvagePay(S: SimState, e: Enemy): void {
  let best: Unit | null = null;
  for (const u of S.units) {
    if (u.dead || u.k !== 'salvage' || u.lane !== e.lane || u.pin) continue;
    const xc = xcOf(u); if (e.x < xc - 3000 || e.x > xc + UNITS.salvage.reach!) continue;
    if (!best || Math.abs(e.x - xc) < Math.abs(e.x - xcOf(best))) best = u;
  }
  if (!best) return;
  const base = e.boss ? UNITS.salvage.pay!.boss : UNITS.salvage.pay![e.wt];
  const pay = Math.floor((base * (4 + best.col)) / 4);
  dropGrain(S, pay, best.lane, best.col, 'salvage'); S.stats.salvaged = (S.stats.salvaged || 0) + pay;
}

// ───────────────────────── snapshot / hash (spec §3.14) ─────────────────────────
export type Snapshot = Omit<SimState, 'L' | 'byLane' | 'ev'> & { h: string };
/** the snapshot carries its own hash, computed on the live state before anything is re-hung */
export function snapshot(S: SimState): Snapshot {
  const { L: _L, byLane: _b, ev: _e, ...rest } = S;
  void _L; void _b; void _e;
  const o = JSON.parse(JSON.stringify(rest)) as Snapshot; o.h = hash(S); return o;
}
/** 暂停 / 🏠 / 切到后台: exact resume. Returns null if the hash check fails. */
export function resume(snap: Snapshot, L: Level, opt: { events?: boolean } = {}): SimState | null {
  const S = JSON.parse(JSON.stringify(snap)) as SimState & { h?: string }; const h = S.h; delete S.h;
  S.L = L; S.ev = opt.events ? [] : null; S.byLane = [[], [], [], [], []]; relink(S);
  return h == null || hash(S) === h ? S : null;
}
/** 从第 N 面战鼓重来: back to the checkpoint; every gate gets its 檑木 back; the attempt is marked restored (≤ 2★). */
export function restore(snap: Snapshot, L: Level, opt: { events?: boolean; assist?: number } = {}): SimState | null {
  const S = resume(snap, L, opt); if (!S) return null;
  S.logs = [0, 0, 0, 0, 0]; S.restored = (S.restored || 0) + 1; if (opt.assist && !S.assist) { S.grain += ASSIST.startGrain; S.assist = 1; } // spec §3.14/§3.21-14: tier one only (+150), once per run — a checkpoint already taken with assist keeps its grain, no stacking (game-local errata GF-E1, not the spec's E7: proto said +50 and stacked; never exercised by its tools — pinned by synthetic/checkpoint-restore-assisted.json)
  return S;
}
function relink(S: SimState): void { // bolts/lobs keep their source as {k, id} after a JSON round trip
  for (const arr of [S.bolts, S.lobs, S.hits] as { src: Src }[][]) for (const b of arr) if (b.src && !b.src.k) b.src = { k: 'unknown' };
}
/** FNV-1a over the canonical integer state (order-sensitive). */
export function hash(S: SimState): string {
  let h = 0x811c9dc5;
  const mix = (v: number): void => { v |= 0; for (let i = 0; i < 4; i++) { h ^= (v >>> (i * 8)) & 0xff; h = Math.imul(h, 0x01000193); } };
  mix(S.tick); mix(S.grain); mix(S.parts); mix(S.tokens); mix(S.rs); mix(S.si);
  for (const l of S.logs) mix(l);
  for (const f of S.flags || []) mix(f); mix(S.dawnAt == null ? -1 : S.dawnAt); for (const c of S.loadout || []) mix(c.length * 131 + c.charCodeAt(0) * 7 + c.charCodeAt(c.length - 1));
  for (const u of S.units) { mix(u.id); mix(u.col + u.lane * 16); mix(u.hp); mix(u.next); mix(u.pin); }
  for (const e of S.enemies) { mix(e.id); mix(e.lane); mix(e.x); mix(e.hp); mix(e.sh); mix(e.run || 0); mix(e.lad || 0); }
  for (const d of S.drops) { mix(d.id); mix(d.v); }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function runToEnd(S: SimState, bot?: ((S: SimState) => Action[] | null) | null, maxTicks = 20 * 60 * 15): SimState {
  while (!S.result && S.tick < maxTicks) step(S, bot ? bot(S) : null);
  if (!S.result) S.result = 'timeout';
  return S;
}

/** API object handed to boss.ts */
export const API: SimApi = {
  breachFacts, blockerFor, biteUnit, spawnEnemy, hurtRaw, hurt, emitCloud, breach, pushBack, addUnit,
  removeUnit: (S, u, w, by) => removeUnit(S, u, w, by), unitById, topAt, occupant, ev: (S, t, d) => ev(S, t, d), dropGrain,
  isNight, inSmoke, tileOf, xcOf, surface: (S, e, s) => surface(S, e, s),
};
