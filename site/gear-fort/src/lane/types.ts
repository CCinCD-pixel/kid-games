// 机关守城 · lane core — data types (theme-agnostic: ids, tags and integers only).
// The kernel is a 1:1 port of the prototype (lane-defense-tools/proto/sim.mjs, boss.mjs); field names
// follow it so the per-flag state hashes stay bit-identical (spec §8.9).

export type CardId = string;
export type EnemyKind = string;
export type LevelId = string;

/** [tick, lane, kind, fixed]: kind = machine id | 'swarm' | 'boss:<type>'; fixed = 1 → first appearance (no jitter). */
export type SpawnRow = [number, number, string, number?];

export interface LevelEnv {
  night?: boolean;
  dawnAt?: number | null;
  fogCol?: number | null;
  floods?: { at: number; lane: number; dur: number }[];
}

export interface Belt { first: number; period: number; cap?: number; seq: CardId[] }
export interface Warn { t: number; lanes: number[]; feint?: boolean }

export interface FamilyCfg {
  start?: number;
  tenthsPerSec: number;
  window: number;
  open: number;
  windows: number;
  cost: Record<string, number>;
}

export interface Level {
  id: LevelId;
  vol?: number;
  idx?: number;
  name?: string;
  type?: string;
  newCard?: CardId | null;
  newEnemy?: EnemyKind | null;
  concept?: string;
  jinnang?: string | null;
  botJinnang?: string | null;
  loadout?: CardId[];
  slots?: number;
  star3?: Record<string, unknown>;
  star3Text?: string;
  ask?: string;
  lanes: number[];
  env?: LevelEnv;
  sky?: boolean;
  skyAfterKill?: boolean;
  start?: number;
  spawns: SpawnRow[];
  flags?: number[];
  preplace?: [CardId, number, number][];
  drumOk?: boolean;
  p?: number;
  known?: EnemyKind[];
  inn?: number | null;
  repair?: { art: string; line: string };
  voice?: { intro: string[]; preview: string; ask: string };
  choose?: boolean;
  pool?: CardId[];
  seal?: string | string[];
  prefill?: CardId[];
  infer?: EnemyKind;
  warn?: Warn[];
  belt?: Belt;
  boss?: { type: string };
  noHints?: boolean;
  water?: number[];
  rocks?: [number, number][];
  high?: [number, number][];
  incomePct?: number;
  jitter?: number;
  endTick?: number;
  family?: FamilyCfg;
  puzzle?: boolean;
  noEnd?: boolean;
  clearOnly?: boolean;
  minTicks?: number;
  maxTicks?: number;
}

export interface Src { k: string }

export interface Unit {
  id: number; k: CardId; lane: number; col: number; hp: number; max: number; t0: number; next: number;
  pin: number; top: number; onRaft: number; ultUntil: number; fortUntil: number; wear: number; armAt: number;
  tgt: number; tOn: number;
  acted?: number; dead?: boolean; beh?: string;
}

export interface BossPart {
  type: string;
  // rhino
  phase?: number; crack?: number; hornNext?: number; chargeNext?: number; tele?: number; dash?: number;
  hatchNext?: number; hatchI?: number; shellAt?: number;
  // owl
  state?: string; laneNext?: number; shadowLane?: number; shadowUntil?: number; swoopNext?: number; until?: number;
  bombNext?: number; birdsNext?: number; rs?: number; rage?: number; walking?: number; biteNext?: number;
  // ship / fortress parts
  part?: string;
}

export interface Enemy {
  id: number; k: EnemyKind; lane: number; x: number; hp: number; max: number; sh: number; armor: number;
  mat: string; wt: string; layer: string; spd: number; biteNext: number; contact: number; stuckUntil: number;
  stunUntil: number; burnUntil: number; burnAt: number; run: number; mode: number; recoilLeft: number;
  lad: number; ladHp: number; ladT: number; ladOn: number; pinId: number; perchId: number; downUntil: number;
  cloudNext: number; revealed: number; digUntil: number; sumNext: number; sumN: number; hookUntil: number;
  seen: number; lastTile: number; boss: BossPart | null; parts: number;
  // optional, created on demand (same as the prototype)
  dings?: number; killer?: string; gone?: boolean; captured?: boolean; byLog?: boolean; jamBy?: number; noRun?: number;
  pins?: number[]; pinsMax?: number; hookId?: number; guard?: number; chick?: boolean; body?: number;
  untargetable?: boolean; highOnly?: boolean; p2At?: number; crackMax?: number; proxy?: number; virtual?: number;
}

export interface Drop { id: number; v: number; t: number; lane: number; col: number; from: string }
export interface Bolt { lane: number; x: number; dmg: number; src: Src; pierce: number; hitIds: number[] | null }
export interface Lob { tgt: number; lane: number; x: number; land: number; dmg: number; src: Src; fire: boolean }
export interface Hit { tgt: number; at: number; dmg: number; src: Src; front: boolean }
export interface Strike { lane: number; col: number; at: number }
export interface FireWall { lane: number; x0: number; x1: number; until: number; src: string }
export interface ScriptedSpawn { t: number; lane: number; k: string; fixed: boolean; i: number }

export interface FortressMove { i: number; preview: number; start: number; end: number }
export interface BossCtl {
  type: string; cfg: { type: string }; done: boolean; spawned: boolean; id?: number;
  // fortress (v2)
  sch?: { moves: FortressMove[]; finale: number; end: number }; move?: number; swapOpen?: boolean; swapUsed?: boolean;
  core?: number; phase?: string;
  // ship (v2)
  x?: number; arm?: number; dock?: number; drum?: number; hull?: number; proxyId?: number; armNext?: number;
  dockNext?: number; dockI?: number; partsDown?: number;
}

export interface Stats {
  minX: number[]; peak: number; spent: number; floatSum: number; floatN: number; kills: number; captured: number;
  logsUsed: number; breachLanes: number[]; firstLeak: number; grainIn: number; placed: number;
  placedByCard: Record<string, number>; dmgBy: Record<string, number>; killsBy: Record<string, number>; wasted: number;
  strikeHits: number[]; tokenUses: number; econAt60: number; econAt90: number; lostTo: string | null; lostLane: number;
  bankAtFlag: number[]; minXByKind: Record<string, number>; summons: number; dug: number; blindTicks: number;
  auraTicks: number; beltFull: number; smokeCleared: number; bestSplash: number; bestBurn: number; beltMax: number;
  unitsLostBy: Record<string, number>; coverAtFlag1: number; unitsLost: number; econLost: number; pins: number;
  ladders: number; drums: number; grainPeak: number; maxFloat: number;
  // created on demand
  attLostIn?: number[]; pitsIn?: number[]; refunds?: number; shieldDmg?: number; blockedBy?: Record<string, number>;
  laddersHooked?: number; windBurn?: number; salvaged?: number; sent?: number; peakRaw?: number; peakUnits?: number;
  peakProj?: number; crack?: number; owlDown?: number; armReset?: number; windFire?: number; swaps?: number;
  logsRestored?: number;
}

/** Kernel events (opt.events): one flat record type; fields depend on `type`. */
export interface SimEvent {
  type: string; tick: number;
  id?: number; k?: string; lane?: number; col?: number; card?: string; why?: string; by?: string | null;
  x?: number; v?: number; from?: string; n?: number; d?: number; dmg?: number; run?: number; on?: number;
  pin?: number; kill?: number; captured?: boolean; log?: boolean; saved?: number; grain?: number;
  seen?: number; guard?: number; units?: string[]; near?: string[]; smoky?: boolean; drum?: boolean; pits?: number;
  pins?: number; attLost?: number; out?: string; in?: string; i?: number;
}

export type Action =
  | { t: 'place'; card: CardId; lane: number; col: number }
  | { t: 'collect'; id: number }
  | { t: 'shovel'; lane: number; col: number }
  | { t: 'mark'; id: number }
  | { t: 'token'; lane: number; col: number }
  | { t: 'drum' }
  | { t: 'send'; k: string; lane: number }
  | { t: 'swap'; out: CardId; in: CardId };

export interface SimState {
  L: Level; seed: number; tick: number; rs: number;
  grain: number; parts: number; tokens: number; logs: number[];
  units: Unit[]; enemies: Enemy[]; bolts: Bolt[]; lobs: Lob[]; hits: Hit[]; drops: Drop[]; strikes: Strike[];
  grid: number[][]; smoke: number[][]; smokeHard: number[]; waterNow: number[]; water: number[];
  rock: number[]; highg: number[];
  nextId: number; si: number; spawns: ScriptedSpawn[]; result: null | 'win' | 'lose' | 'timeout';
  cdReady: Record<string, number>; mark: number;
  belt: CardId[]; beltNext: number; beltI: number; beltPeriod?: number; skyNext: number; endTick: number;
  im: number; imr: number; assist: number;
  flags: number[]; dawnAt: number | null; loadout: CardId[]; drumUsed: number[]; logCap: number;
  flood: number[]; floodI: number; boss: BossCtl | null; wood: number;
  ev: SimEvent[] | null; byLane: Enemy[][];
  stats: Stats;
  fires?: FireWall[]; smokeSeen?: number[]; restored?: number;
}

export interface SimOptions {
  incomePct?: number;
  assist?: number;
  logCap?: number;
  events?: boolean;
  extraStart?: number;
}

/** Functions sim.ts hands to boss.ts (avoids an import cycle, same as the prototype). */
export interface SimApi {
  breachFacts(S: SimState, e: Enemy): Partial<SimEvent>;
  blockerFor(S: SimState, e: Enemy): Unit | null;
  biteUnit(S: SimState, e: Enemy, u: Unit, dmg: number): void;
  spawnEnemy(S: SimState, k: string, lane: number, x?: number, extra?: Partial<Enemy>): Enemy;
  hurtRaw(S: SimState, e: Enemy, dmg: number, dtype: string, src?: Src | null): number;
  hurt(S: SimState, e: Enemy, dmg: number, dtype: string, src?: Src | null): number;
  emitCloud(S: SimState, lane: number, col: number, dur: number, wide?: boolean): void;
  breach(S: SimState, e: Enemy): void;
  pushBack(S: SimState, e: Enemy, d: number, src?: Src | null): void;
  addUnit(S: SimState, card: CardId, lane: number, col: number): Unit;
  removeUnit(S: SimState, u: Unit, why: string, by?: string): void;
  unitById(S: SimState, id: number): Unit | undefined;
  topAt(S: SimState, lane: number, col: number): Unit | null | undefined;
  occupant(S: SimState, lane: number, col: number): Unit | null | undefined;
  ev(S: SimState, type: string, data: Partial<SimEvent>): void;
  dropGrain(S: SimState, amt: number, lane: number, col: number, from: string): void;
  isNight(S: SimState): boolean;
  inSmoke(S: SimState, lane: number, col: number): boolean;
  tileOf(x: number): number;
  xcOf(u: Unit): number;
  surface(S: SimState, e: Enemy, stun: number): void;
}
