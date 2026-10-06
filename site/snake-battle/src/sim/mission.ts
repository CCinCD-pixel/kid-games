/**
 * 挑战关 (spec §3.20, §4.4, §5.1): mission setup, objectives, stars, the 孪生局 (twin) knobs, the 蛇王 crown
 * phases, the c5m1 "bigger snake swims in" script and the validation bot hook. Line-by-line port of the
 * prototype `missions.mjs` (buildMission / botHook / runMission / twinOf) so V1b stays bit-identical:
 * `MissionRun.step()` is exactly one iteration of the prototype's `runMission` loop, and the page drives the
 * same object (the player's input replaces the bot brain; the hook is validator/demo-only, §3.20).
 */
import missionsJson from '../../../../content/snake-battle/missions.json';
import { World } from './world';
import { Brain, TIERS, type GoalHook, type Tier } from './brain';
import { createRng, enclosedBy, angDiff, type Snake, type KillTagRec } from './core';

export type ObjType = 'rings' | 'length' | 'eat' | 'pu' | 'survive' | 'race' | 'kill' | 'streak' | 'loop';
export interface Objective {
  type: ObjType; points?: number[][]; radius?: number; n?: number; kind?: string; sec?: number; minMass?: number;
  rankLE?: number; killsGE?: number; tags?: string[]; tag?: string; target?: string; minRatio?: number;
}
export interface StarCond { type: string; n?: number; sec?: number; kind?: string; tag?: string }
export interface MissionAi {
  persona: string; tier: string; mass: number; n?: number; at?: [number, number, number]; target?: boolean; king?: boolean; crown?: number;
  respawn?: boolean; path?: number[][]; wake?: number; route?: number[][]; speedMul?: number; twin?: boolean;
}
export interface MissionArena {
  R: number; food: number; big?: number; bigCluster?: number; bigAt?: number[][]; markers?: number[][];
  obstacles?: { x: number; y: number; r: number }[]; pu?: { max: number; delay: [number, number]; kinds?: ('magnet' | 'shield' | 'speed')[] };
  meteors?: { max: number; delay: [number, number]; speed?: number };
}
export interface KingCharge { first: number; wind: number; run: number; cd: [number, number]; cd3: [number, number]; aim: string; leadMul: number; gemTag?: string; phase3?: boolean }
export type Role = 'start' | 'build' | 'turn' | 'boss' | 'breather';
export interface Mission {
  id: string; ch: number; role: Role; title: string; teaches: string; newElement: string | null; firstTouch?: boolean; hook?: string; coilAt?: number;
  arena: MissionArena; player: { mass: number; at?: [number, number, number] }; ai: MissionAi[]; objective: Objective; capSec: number;
  stars: [StarCond, StarCond]; lines: Record<string, string>; playerRespawn?: 'keep' | boolean; kingCharge?: KingCharge;
  isTwin?: boolean; twinShield?: boolean;
}

export const MISSIONS = (missionsJson as unknown as { missions: Mission[] }).missions;
export const MISSION_BY_ID: Record<string, Mission> = Object.fromEntries(MISSIONS.map((m) => [m.id, m]));
export const CHAPTERS = [1, 2, 3, 4, 5].map((ch) => MISSIONS.filter((m) => m.ch === ch));
/** chapter venue look (spec §4.4.1): 月球 / 火星 / 木星 / 土星 / 黑洞 */
export const CHAPTER_FLOOR = ['moon', 'mars', 'jupiter', 'saturn', 'blackhole'] as const;

// ---------------------------------------------------------------- 孪生局 (H3 twin, spec §5.1)
/** Twin = same level, new seed, these knobs; at most ★★ (prototype `twinOf`, v1.1 knobs). */
export function twinOf(m: Mission): Mission {
  const o: Objective = { ...m.objective };
  const player = { ...m.player };
  let playerRespawn = m.playerRespawn, twinShield = false;
  if (o.type === 'rings') o.radius = Math.round(o.radius! * 1.3);
  if (o.type === 'eat' || o.type === 'pu') o.n = Math.max(1, Math.round(o.n! * 0.7));
  if (o.type === 'length') o.n = Math.round(m.player.mass + (o.n! - m.player.mass) * 0.7);
  if (o.type === 'survive') { o.sec = Math.round(o.sec! * 0.6); if (o.minMass) o.minMass = Math.round(m.player.mass + (o.minMass - m.player.mass) * 0.7); twinShield = m.ai.length > 0; }
  if (o.type === 'race') {
    if (o.killsGE) { o.rankLE = 99; o.sec = Math.round(o.sec! * 1.2); } else o.rankLE = o.rankLE === 1 ? 3 : o.rankLE! + 1;
    player.mass = Math.round(Math.max(m.player.mass * 1.3, m.player.mass + 40));
    twinShield = true;
  }
  if (!m.playerRespawn && o.type !== 'survive' && o.type !== 'race' && m.ai.length > 0) playerRespawn = 'keep';
  const arena = { ...m.arena };
  if (arena.meteors?.speed) arena.meteors = { ...arena.meteors, speed: Math.round(arena.meteors.speed * 0.9) };
  const ai = m.ai.map((a) => ({ ...a, twin: true, ...(a.speedMul ? { speedMul: Math.round(a.speedMul * 0.85 * 100) / 100 } : {}), ...(a.crown ? { crown: a.crown - 1 } : {}) }));
  const capSec = o.type === 'survive' || o.type === 'race' ? (o.sec ?? m.capSec) : Math.round(m.capSec * (m.playerRespawn === 'keep' ? 1.5 : 1.3));
  return { ...m, objective: o, player, playerRespawn, arena, ai, capSec, stars: m.stars, isTwin: true, twinShield };
}
/** AI tier for a twin: noise ×1.5, decision interval ×1.3, perception ×0.8; aggression ≥0.35 for hunters/king */
function twinTier(tierId: string, persona: string): Tier {
  const T = TIERS[tierId]; const o = { ...T, noise: T.noise * 1.5, dec: T.dec * 1.3, P: T.P * 0.8 };
  if ((persona === 'hunter' || persona === 'king') && o.aggr < 0.35) o.aggr = 0.35;
  return o;
}

// ---------------------------------------------------------------- setup
/**
 * missions.json stores numbers rounded to 3 decimals (export-content.mjs `r3`), so the prototype's exact
 * spawn headings (−π/2, π/2, 3π/4 …) arrive as −1.571 etc. Snap a heading back to its multiple of π/4 when
 * it is within rounding error — otherwise V1b drifts from step 1 (c1m4).
 */
const snapA = (a: number) => { const q = Math.round(a / (Math.PI / 4)) * (Math.PI / 4); return Math.abs(q - a) < 6e-4 ? q : a; };
export const atOf = (at?: [number, number, number]): [number, number, number] | null => (at ? [at[0], at[1], snapA(at[2])] : null);

export interface MissionWorld extends World { markers: { x: number; y: number; done: boolean }[]; meteorSpeed?: number }

export function buildMission(m: Mission, seed: number | string, look: { colors?: string[] } = {}): MissionWorld {
  const a = m.arena;
  const w = new World({
    R: a.R, foodCount: a.food, obstacles: a.obstacles ?? [],
    pu: a.pu ? { max: a.pu.max, delay: a.pu.delay, kinds: a.pu.kinds } : null,
    meteors: a.meteors ? { max: a.meteors.max, delay: a.meteors.delay } : null,
  }, seed) as MissionWorld;
  if (a.meteors?.speed) w.meteorSpeed = a.meteors.speed;
  for (let i = 0; i < (a.big ?? 0); i++) {
    let x: number, y: number;
    if (a.bigCluster) { const rr = a.bigCluster * Math.sqrt(w.rng.next()), aa = w.rng.range(0, 6.283); x = Math.cos(aa) * rr; y = Math.sin(aa) * rr; }
    else [x, y] = w.randomPoint(80);
    w.addFood(x, y, 5, 'big');
  }
  for (const [x, y] of a.bigAt ?? []) w.addFood(x, y, 5, 'big');
  w.markers = (a.markers ?? []).map(([x, y]) => ({ x, y, done: false }));
  const rng = createRng(`mbrains:${m.id}:${seed}`);
  let k = 0;
  for (const e of m.ai) {
    for (let i = 0; i < (e.n ?? 1); i++) {
      const respawn = e.respawn === false ? null : { delay: 3, keep: 0, min: e.mass };
      const isSleeper = e.persona === 'sleeper';
      const s = w.addSnake({ persona: isSleeper ? 'skittish' : e.persona, tier: e.tier, respawn: isSleeper ? null : respawn, name: `${e.persona}${k}`, color: look.colors?.[k] }, e.mass, e.at && i === 0 ? atOf(e.at) : null);
      s.target_ = !!e.target; s.king = !!e.king; s.speedMul = e.speedMul;
      if (e.crown) { s.crown = e.crown; s.crownMax = e.crown; }
      const tierObj = e.twin ? twinTier(e.tier, e.persona) : undefined;
      if (isSleeper) {
        s.layPath(e.path!); s.sleep = true; s.protect = 0; s.wakeR = e.wake ?? 0;
        s.brainSpec = { tier: 'T1', persona: 'skittish', rng: rng.fork(`ai${k}`), tierObj: e.twin ? twinTier('T1', 'skittish') : undefined };
        s.sleeperPath = e.path; s.sleeperMass = e.mass; s.sleeperKind = e.wake ? 'light' : 'deep';
      } else s.brain = new Brain({ tier: e.tier, tierObj, persona: e.persona, rng: rng.fork(`ai${k}`), route: e.route });
      s.missionPersona = e.persona;
      k++;
    }
  }
  w.rebuildHash();
  return w;
}

/** how many AI snakes a mission spawns at the start (presentation: roster colours) */
export const aiCountOf = (m: Mission) => m.ai.reduce((n, e) => n + (e.n ?? 1), 0);

// ---------------------------------------------------------------- validation / demo bot hook
type HookFn = (s: Snake, w: MissionWorld, b?: Brain) => GoalHook | null;
/** what a child who understood the goal would try (spec §9 V3); also drives the 领航员 demo (H3) */
export function botHook(m: Mission, w: MissionWorld, me: Snake): HookFn | null {
  const o = m.objective; const st = me.m!;
  const tagged = (s: Snake) => !!s.target_;
  switch (m.hook ?? o.type) {
    case 'rings': {
      const p = o.points![st.ring] ?? o.points![o.points!.length - 1];
      const prev = st.ring > 0 ? o.points![st.ring - 1] : (m.player.at ?? [0, 0]);
      const dx = p[0] - prev[0], dy = p[1] - prev[1], dl = Math.hypot(dx, dy) || 1;
      let ap = [p[0] - (dx / dl) * 200, p[1] - (dy / dl) * 200];
      if ((w.obstacles ?? []).some((ob) => Math.hypot(ap[0] - ob.x, ap[1] - ob.y) < ob.r + 70)) { ap = p; st.lined = true; st.linedFor = st.ring; }
      if (!st.lined || st.linedFor !== st.ring) { st.linedFor = st.ring; st.lined = false; }
      if (!st.lined && Math.hypot(me.x - ap[0], me.y - ap[1]) < 90) st.lined = true;
      return () => ({ mode: 'goal', G: st.lined ? [p[0] + (dx / dl) * 120, p[1] + (dy / dl) * 120] : ap });
    }
    case 'eat':
      if (o.kind === 'meteor') return (s, ww) => { let b = null as null | { x: number; y: number; vx: number; vy: number }, bd = 1e9; for (const mt of ww.meteors) { const d = Math.hypot(mt.x - s.x, mt.y - s.y); if (d < bd) { bd = d; b = mt; } } return b ? { mode: 'goal', G: [b.x + b.vx * 0.5, b.y + b.vy * 0.5], boost: bd > 120 && s.mass > 30 ? 1 : 0 } : null; };
      return null;
    case 'pu': return (s, ww) => { let b = null as null | { x: number; y: number }, bd = 1e9; for (const p of ww.pus) { if (p.kind !== o.kind) continue; const d = Math.hypot(p.x - s.x, p.y - s.y); if (d < bd) { bd = d; b = p; } } return b ? { mode: 'goal', G: [b.x, b.y] } : null; };
    case 'hunt': return () => ({ mode: 'hunt', filter: m.ai.some((e) => e.target) ? tagged : (v: Snake) => !v.sleep });
    case 'hunt-big': return (s) => ({ mode: 'hunt', filter: (v: Snake) => v.mass >= 2 * s.mass && !v.king && !v.sleep });
    case 'hunt-hunters': return () => ({ mode: 'hunt', filter: (v: Snake) => v.persona === 'hunter' && !!v.target_ });
    case 'hunt-king': return (s, ww) => { const king = ww.snakes.find((x) => x.king && x.alive && !x.sleep); return king && Math.hypot(king.x - s.x, king.y - s.y) < 700 ? { mode: 'hunt', filter: (v: Snake) => !!v.king } : null; };
    case 'coil': return () => ({ mode: 'coil', filter: tagged });
    case 'defend': return (s, ww) => (ww.snakes.some((x) => x !== s && x.alive && x.persona === 'hunter' && Math.hypot(x.x - s.x, x.y - s.y) < 420) ? { mode: 'defend' } : null);
    case 'loop': return (s, ww) => { const mk = ww.markers.find((q) => !q.done); if (!mk) return null; const ang = Math.atan2(s.y - mk.y, s.x - mk.x) + 0.9; const rho = Math.max(120, (s.L / (2 * Math.PI)) * 0.7); return { mode: 'goal', orbitOk: true, G: [mk.x + Math.cos(ang) * rho, mk.y + Math.sin(ang) * rho] }; };
    case 'race-lead': return () => ({ mode: 'race-lead' });
    case 'race-hunt': return () => ({ mode: 'race', aggr: 0.6 });
    case 'race-coil': return (s) => (s.mass >= (m.coilAt ?? 110) ? { mode: 'coil', filter: (v: Snake) => v.persona === 'skittish' } : null);
    default: return null;
  }
}

const passTags = (o: Objective, k: KillTagRec) => (!o.tag || k.tag === o.tag) && (!o.tags || o.tags.includes(k.tag));

export interface MissionStats {
  t: number; mass: number; kills: number; deaths: number; rank: number; near: number; bumps: number; big: number; eaten: number; pu: number;
  killTags: string[]; killRatio: number; aiMeteors: number; meteors: number; puKinds: Record<string, number>; shieldSaves: number; bestStreak: number;
  bestMulti: number; boostSec: number; goalTags: string[]; headonTargets: number; gemHits: number; orbitMax: number; unsticks: number; bigSpawns: number;
}
export interface MissionResult extends MissionStats { id: string; ok: boolean; why?: string; stars: number; steps: number; star2: boolean; star3: boolean }

export interface RunOpts {
  /** player model driving him (validators / demos); omit for the page (input drives him) */
  bot?: { tier: string; persona: string };
  noHook?: boolean; twin?: boolean; name?: string; skin?: string; colors?: string[];
}

/**
 * One mission attempt. `step()` = one iteration of the prototype loop (world step + mission rules + objective).
 * `done` turns true when the objective is met, he is out on an out-is-failure level, or the cap is reached.
 */
export class MissionRun {
  m: Mission; w: MissionWorld; me: Snake; brain: Brain | null = null;
  i = 0; ticks: number; done = false; outcome: { ok: boolean; why?: string; rank?: number } | null = null;
  aiMeteors = 0; headonTargets = 0; gemHits = 0; st8 = 0; bigSpawns = 0;
  king: Snake | undefined;
  /** c5m1: snakes that currently qualify for the gold outline (presentation reads it) */
  qualifies: (s: Snake) => boolean;
  private hd: [number, number, number, string, number][] = []; private orbitRun = 0; orbitMax = 0;
  private noHook: boolean; private seed: number | string;
  /** presentation hooks (page only): mission-level events the sim does not emit itself */
  onNote: (n: { kind: 'headonTarget' | 'phase2' | 'phase3' | 'bigSwimIn' | 'ring' | 'marker' | 'targetBack'; id?: number; n?: number }) => void = () => {};

  constructor(m0: Mission, seed: number | string, o: RunOpts = {}) {
    let m = m0; if (o.twin) m = twinOf(m);
    this.m = m; this.seed = seed; this.noHook = !!o.noHook;
    const w = buildMission(m, seed, { colors: o.colors });
    this.w = w;
    const pm = m.player;
    const respawn = m.playerRespawn === 'keep' ? { delay: 2, keep: 1, min: 10 } : m.playerRespawn ? { delay: 3, keep: 0.25, min: 10 } : null;
    const me = w.addSnake({ persona: o.bot?.persona ?? 'kid', tier: o.bot?.tier ?? 'KID', isPlayer: true, name: o.name ?? '小步步', respawn, skin: o.skin }, pm.mass, atOf(pm.at));
    me.m = { ring: 0, kills: 0, start: w.t };
    if (m.twinShield) me.shield = 1e6;
    if (o.bot) { this.brain = new Brain({ tier: o.bot.tier, persona: o.bot.persona, rng: createRng(`player:${m.id}:${seed}`) }); me.brain = this.brain; }
    this.me = me;
    this.king = w.snakes.find((s) => (s.crown ?? 0) > 0);
    if (m.kingCharge) w.kingCharge = { ...m.kingCharge, ...(m.isTwin ? { wind: m.kingCharge.wind * 1.4 } : {}) };
    this.ticks = Math.round(m.capSec * 60);
    const ob = m.objective;
    this.qualifies = (s) => !!ob.minRatio && s !== me && s.alive && !s.sleep && !s.king && s.mass >= ob.minRatio * me.mass;
  }

  /** one prototype loop iteration; returns `done` */
  step(): boolean {
    if (this.done) return true;
    const m = this.m, w = this.w, me = this.me, o = m.objective, i = this.i, brain = this.brain;
    if (brain) {
      const hookFn = this.noHook ? null : botHook(m, w, me);
      brain.goalHook = hookFn ? (s, ww) => hookFn(s, ww as MissionWorld, brain) : null;
    }
    const ne = w.events.length;
    if (w.meteorSpeed) for (const mt of w.meteors) { const sp = Math.hypot(mt.vx, mt.vy); if (Math.abs(sp - w.meteorSpeed) > 1) { mt.vx *= w.meteorSpeed / sp; mt.vy *= w.meteorSpeed / sp; } }
    w.step();
    this.probe?.(w, me, i);
    for (const sl of w.snakes) if (sl.sleep && (sl.wakeR ?? 0) > 0 && me.alive && (Math.hypot(me.x - sl.x, me.y - sl.y) < sl.wakeR! + me.r || (i % 6 === 0 && enclosedBy(me, sl.x, sl.y)))) {
      sl.sleep = false; sl.brain = new Brain(sl.brainSpec!); w.emit({ type: 'wake', id: sl.id });
    }
    const evs = w.events.slice(ne);
    for (const e of evs) if (e.type === 'kill') {
      const v = w.snakes[e.victim];
      if (v.target_ && v.sleeperPath && !v.respawning) { v.respawning = true; w.respawnQueue.push({ s: v, t: w.t + 2, mass: v.sleeperMass!, sleeper: true }); }
      if (v.target_ && e.killer === me.id && e.tag === 'headon' && (o.tags && !o.tags.includes('headon'))) { this.headonTargets++; this.onNote({ kind: 'headonTarget', id: v.id }); }
    }
    const king = this.king;
    for (const e of evs) if (e.type === 'gem' && e.by === me.id) {
      this.gemHits++;
      if (king && king.crownMax! - king.crown! === 1 && !king.phase2) {
        king.phase2 = true;
        for (let g = 0; g < 2; g++) { const s = w.addSnake({ persona: 'hunter', tier: 'T2', respawn: { delay: 3, keep: 0, min: 110 }, name: `guard${g}`, color: this.guardColors?.[g] }, 110); s.brain = new Brain({ tier: 'T2', tierObj: m.isTwin ? twinTier('T2', 'hunter') : undefined, persona: 'hunter', rng: createRng(`guard:${m.id}:${this.seed}:${g}`) }); s.missionPersona = 'guard'; }
        this.onNote({ kind: 'phase2' });
      }
      if (king && king.crownMax! - king.crown! >= 2 && !king.phase3 && king.brain) {
        king.phase3 = true; if (w.kingCharge) w.kingCharge.phase3 = true;
        const kb = king.brain as Brain; kb.p = { ...kb.p, boostBias: kb.p.boostBias * 1.6, coil: 1.5, safety: kb.p.safety * 0.8 };
        this.onNote({ kind: 'phase3' });
      }
    }
    for (const e of evs) if (e.type === 'meteor' && e.id !== me.id) this.aiMeteors++;
    if (o.minRatio && i % 30 === 0 && me.alive) {
      const q = w.snakes.some((x) => x !== me && x.alive && !x.sleep && !x.king && x.mass >= o.minRatio! * me.mass);
      this.st8 = q ? 0 : this.st8 + 0.5;
      if (this.st8 >= 8 && this.bigSpawns < 3) {
        this.st8 = 0; this.bigSpawns++;
        const s = w.addSnake({ persona: 'forager', tier: 'T0', respawn: null, name: `big${this.bigSpawns}`, color: this.bigColors?.[this.bigSpawns - 1] }, Math.min(2000, Math.round(1.5 * o.minRatio * me.mass)));
        s.brain = new Brain({ tier: 'T0', persona: 'forager', rng: createRng(`big:${m.id}:${this.seed}:${this.bigSpawns}`) });
        s.missionPersona = 'forager';
        this.onNote({ kind: 'bigSwimIn', id: s.id });
      }
    }
    this.i++;
    if (!me.alive && !m.playerRespawn) { this.outcome = { ok: false, why: 'out' }; this.done = true; return true; }
    if (i % 15 === 0 && me.alive) {
      const hd = this.hd;
      hd.push([me.angle, me.x, me.y, brain?.mode ?? 'human', me.stats.eaten]); if (hd.length > 17) hd.shift();
      if (hd.length === 17) {
        let turn = 0; for (let j = 1; j < hd.length; j++) turn += angDiff(hd[j - 1][0], hd[j][0]);
        const net = Math.hypot(hd[16][1] - hd[0][1], hd[16][2] - hd[0][2]);
        const okMode = hd.every((x) => x[3] !== 'defend' && x[3] !== 'coil') && m.hook !== 'loop';
        if (okMode && Math.abs(turn) >= 4 * Math.PI && net < 300 && hd[16][4] - hd[0][4] < 3) { this.orbitRun += 0.25; this.orbitMax = Math.max(this.orbitMax, this.orbitRun + 4); } else this.orbitRun = 0;
      }
    }
    // objective progress
    const st = me.m!;
    if (o.type === 'rings' && me.alive) { const p = o.points![st.ring]; if (p && Math.hypot(me.x - p[0], me.y - p[1]) < o.radius!) { st.ring++; this.onNote({ kind: 'ring', n: st.ring }); if (st.ring >= o.points!.length) this.outcome = { ok: true }; } }
    if (o.type === 'length' && me.alive && me.mass >= o.n!) this.outcome = { ok: true };
    if (o.type === 'eat') { if (this.eatCount() >= o.n!) this.outcome = { ok: true }; }
    if (o.type === 'pu' && ((me.stats.puKinds ?? {})[o.kind!] ?? 0) >= o.n!) this.outcome = { ok: true };
    if (o.type === 'loop' && me.alive && i % 6 === 0) {
      for (const mk of w.markers) if (!mk.done && enclosedBy(me, mk.x, mk.y)) { mk.done = true; this.onNote({ kind: 'marker' }); }
      if (w.markers.filter((q) => q.done).length >= o.n!) this.outcome = { ok: true };
    }
    if (o.type === 'kill' || o.type === 'streak') {
      const ks = this.goalKills();
      if (o.type === 'kill' && ks.length >= o.n!) this.outcome = { ok: true };
      if (o.type === 'streak') { const life = me.stats.killTags.filter((k) => k.t >= me.lifeStart && passTags(o, k)); if (life.length >= o.n!) this.outcome = { ok: true }; }
    }
    if (this.outcome || this.i >= this.ticks) this.done = true;
    return this.done;
  }

  /** read-only probe after each step (V1b fixtures: every 60th) */
  probe?: (w: World, me: Snake, i: number) => void;
  /** presentation-only colours for snakes the script adds later */
  guardColors?: string[]; bigColors?: string[];

  eatCount() { const o = this.m.objective, me = this.me; return o.kind === 'any' ? me.stats.eaten : (me.stats.eatenByKind[o.kind!] ?? 0); }
  goalKills() { const o = this.m.objective, w = this.w; return this.me.stats.killTags.filter((k) => (!o.target || w.snakes[k.victim].target_) && passTags(o, k) && (!o.minRatio || k.victimMass >= o.minRatio * k.killerMass)); }
  lifeGoalKills() { const o = this.m.objective, me = this.me; return me.stats.killTags.filter((k) => k.t >= me.lifeStart && passTags(o, k)).length; }

  /** objective progress for the HUD bar: cur / n (survive: seconds left of sec) */
  progress(): { cur: number; n: number } {
    const o = this.m.objective, me = this.me, w = this.w;
    switch (o.type) {
      case 'rings': return { cur: me.m!.ring, n: o.points!.length };
      case 'length': return { cur: Math.floor(me.alive ? me.mass : 0), n: o.n! };
      case 'eat': return { cur: Math.min(o.n!, this.eatCount()), n: o.n! };
      case 'pu': return { cur: Math.min(o.n!, (me.stats.puKinds ?? {})[o.kind!] ?? 0), n: o.n! };
      case 'survive': return { cur: Math.min(o.sec!, w.t), n: o.sec! };
      case 'race': return { cur: this.rankNow(), n: o.rankLE! };
      case 'kill': return this.king ? { cur: this.king.crownMax! - (this.king.alive ? this.king.crown! : 0), n: this.king.crownMax! } : { cur: Math.min(o.n!, this.goalKills().length), n: o.n! };
      case 'streak': return { cur: Math.min(o.n!, this.lifeGoalKills()), n: o.n! };
      case 'loop': return { cur: w.markers.filter((q) => q.done).length, n: o.n! };
    }
  }
  private rankCache = 0; private rankTick = -99;
  rankNow() { if (this.w.tick - this.rankTick >= 15) { this.rankTick = this.w.tick; this.rankCache = this.w.ranking().findIndex((r) => r.s === this.me) + 1; } return this.rankCache; }

  /** live state of the two star conditions (HUD small stars, spec §3.20 table) */
  starLive(c: StarCond): boolean {
    const me = this.me, t = this.w.t, st = me.stats;
    switch (c.type) {
      case 'clear': return true;
      case 'timeLE': return t <= c.sec! + 1e-6;
      case 'massGE': return me.alive && me.mass >= c.n!;
      case 'eatGE': return (c.kind === 'any' ? st.eaten : (st.eatenByKind[c.kind!] ?? 0)) >= c.n!;
      case 'puGE': return ((st.puKinds ?? {})[c.kind!] ?? 0) >= c.n!;
      case 'killsGE': return st.kills >= c.n!;
      case 'killTagGE': return st.killTags.filter((k) => k.tag === c.tag).length >= c.n!;
      case 'killRatioGE': return Math.max(0, ...st.killTags.map((k) => k.victimMass / k.killerMass)) >= c.n!;
      case 'rankLE': return this.rankNow() <= c.n!;
      case 'deathsLE': return st.deaths <= c.n!;
      case 'nearGE': return st.nearMiss >= c.n!;
      case 'bumpsLE': return (me.bumps ?? 0) <= c.n!;
      case 'aiMeteorsLE': return this.aiMeteors <= c.n!;
      case 'multiGE': return st.bestMulti >= c.n!;
      case 'shieldSavesGE': return (st.shieldSaves ?? 0) >= c.n!;
      default: return false;
    }
  }

  /** the prototype's post-loop block: final outcome, stats and stars */
  result(): MissionResult {
    const m = this.m, w = this.w, me = this.me, o = m.objective;
    let result = this.outcome;
    const t = w.t;
    const raceKills = me.stats.killTags.filter((k) => passTags(o, k)).length;
    if (!result) {
      if (o.type === 'survive') result = { ok: me.alive && me.mass >= (o.minMass ?? 0), why: me.alive ? 'short' : 'out' };
      else if (o.type === 'race') {
        const rank = w.ranking().findIndex((r) => r.s === me) + 1;
        result = { ok: rank <= o.rankLE! && raceKills >= (o.killsGE ?? 0), rank, why: rank <= o.rankLE! ? 'kills' : 'rank' };
      } else result = { ok: false, why: 'cap' };
    }
    const rank = w.ranking().findIndex((r) => r.s === me) + 1;
    const tags = me.stats.killTags.map((k) => k.tag);
    const stats: MissionStats = {
      t, mass: me.alive ? me.mass : 0, kills: me.stats.kills, deaths: me.stats.deaths, rank, near: me.stats.nearMiss, bumps: me.bumps ?? 0,
      big: me.stats.eatenByKind.big ?? 0, eaten: me.stats.eaten, pu: me.stats.pu ?? 0, killTags: tags, killRatio: Math.max(0, ...me.stats.killTags.map((k) => k.victimMass / k.killerMass)), aiMeteors: this.aiMeteors,
      meteors: me.stats.eatenByKind.meteor ?? 0, puKinds: me.stats.puKinds ?? {}, shieldSaves: me.stats.shieldSaves ?? 0, bestStreak: me.stats.bestStreak ?? 0, bestMulti: me.stats.bestMulti, boostSec: me.stats.boostTime,
      goalTags: me.stats.killTags.filter((k) => (!o.target || w.snakes[k.victim].target_) && passTags(o, k)).map((k) => k.tag),
      headonTargets: this.headonTargets, gemHits: this.gemHits, orbitMax: this.orbitMax, unsticks: this.brain?.unsticks ?? 0, bigSpawns: this.bigSpawns,
    };
    const pass = (c: StarCond) => {
      switch (c.type) {
        case 'clear': return true;
        case 'timeLE': return t <= c.sec! + 1e-6;
        case 'massGE': return stats.mass >= c.n!;
        case 'eatGE': return (c.kind === 'any' ? me.stats.eaten : (me.stats.eatenByKind[c.kind!] ?? 0)) >= c.n!;
        case 'puGE': return ((me.stats.puKinds ?? {})[c.kind!] ?? 0) >= c.n!;
        case 'killsGE': return stats.kills >= c.n!;
        case 'killTagGE': return tags.filter((x) => x === c.tag).length >= c.n!;
        case 'killRatioGE': return stats.killRatio >= c.n!;
        case 'rankLE': return rank <= c.n!;
        case 'deathsLE': return stats.deaths <= c.n!;
        case 'nearGE': return stats.near >= c.n!;
        case 'bumpsLE': return stats.bumps <= c.n!;
        case 'aiMeteorsLE': return this.aiMeteors <= c.n!;
        case 'multiGE': return me.stats.bestMulti >= c.n!;
        case 'shieldSavesGE': return stats.shieldSaves >= c.n!;
        default: throw new Error(`star ${c.type}`);
      }
    };
    let stars = 0; let star2 = false, star3 = false;
    if (result.ok) {
      stars = 1; star2 = pass(m.stars[0]); star3 = pass(m.stars[1]);
      if (star2) { stars = 2; if (star3) stars = 3; }
      if (m.isTwin && stars > 2) stars = 2;
    }
    return { id: m.id, ok: result.ok, why: result.why, stars, star2, star3, ...stats, steps: Math.round(t * 60) };
  }
}

/** validators: one whole attempt with a player model (= prototype `runMission`) */
export function runMission(id: string, tier: string, persona: string, seed: number | string, opts: { twin?: boolean; noHook?: boolean; probe?: (w: World, me: Snake, i: number) => void } = {}) {
  const run = new MissionRun(MISSION_BY_ID[id], seed, { bot: { tier, persona }, twin: opts.twin, noHook: opts.noHook });
  run.w.keepEvents = true;
  if (opts.probe) { const p = opts.probe; run.probe = (w, me, i) => { if (i % 60 === 0) p(w, me, i); }; }
  while (!run.step());
  return { ...run.result(), world: run.w, run };
}
