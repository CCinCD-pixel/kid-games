/**
 * 星晶消消乐 rules engine — shared types and constants. 1:1 port of
 * ~/kid-games-work/specs/emoji-match-tools/core.mjs (v1.1, spec §3/§8.3). Pure: no DOM.
 * Board: W x H (<= 9 x 9), cell index i = r * W + c, row 0 = top.
 */
export const EMPTY = 0, PIECE = 1, RH = 2, RV = 3, BOMB = 4, PROP = 5, ORB = 6, CRATE = 7, POD = 8, GOO = 9;
export type Kind = number;
export const KIND_NAMES = ['empty', 'piece', 'rocketH', 'rocketV', 'bomb', 'prop', 'orb', 'crate', 'pod', 'goo'] as const;
export const PALETTE = ['r', 'o', 'y', 'g', 'b', 'p'] as const; // 0..5 = 火晶 环星 太阳晶 叶晶 钻晶 月牙
export const isSpecial = (k: number): boolean => k >= RH && k <= ORB;

/** rule-engine version: bump on any rule change (resume snapshots are discarded on mismatch, §8.7) */
export const ENGINE_VERSION = 2;

export type Cell2 = [number, number];
export type ObjectiveDef =
  | { collect: string; n: number }
  | { dust: true }
  | { crate: true }
  | { ice: true }
  | { goo: true }
  | { pod: number }
  | { energy: number };

export type LessonDef = ({ from: Cell2; to: Cell2 } | { tap: Cell2 }) & { expect: string; mask?: true };
export type StepDef =
  | { from: Cell2; to: Cell2 }
  | { tap: Cell2 }
  | { booster: { t: 'drill' | 'ion' | 'tractor'; a: Cell2; b?: Cell2; dir?: 'H' | 'V' } };

/** A level / puzzle / intro definition (content/emoji-match/*.json, spec §8.2). */
export interface LevelDef {
  id: string;
  ep?: number;
  n?: number;
  role?: 'T' | 'E' | 'N' | 'H' | 'B' | 'R';
  teach?: string;
  intro?: string;
  feature?: 'vrocket' | 'priority' | 'crate';
  colors: string;
  grid: string[];
  dust?: string[];
  ice?: string[];
  exits?: number[];
  pods?: { total: number; max?: number; cols: number[]; gap?: number };
  objectives: ObjectiveDef[];
  fixedBoard?: boolean;
  refill?: boolean;
  lesson?: LessonDef;
  moves?: number;
  stars?: [number, number];
  release?: string;
  sim?: Record<string, unknown>;
}

export type Objective =
  | { t: 'collect'; c: number; n: number }
  | { t: 'crate' }
  | { t: 'dust' }
  | { t: 'ice' }
  | { t: 'goo' }
  | { t: 'pod'; n: number }
  | { t: 'energy'; n: number };

export interface Level {
  id: string;
  def: LevelDef;
  W: number;
  H: number;
  N: number;
  mask: Uint8Array;
  kind: Uint8Array;
  color: Int8Array;
  hp: Uint8Array;
  ice: Uint8Array;
  dust: Uint8Array;
  randomCell: Uint8Array;
  exit: Uint8Array;
  spawner: Uint8Array;
  colors: number[];
  refill: boolean;
  pods: { total: number; max: number; cols: number[]; gap: number } | null;
  objectives: Objective[];
  moves: number;
}

export interface RngState { seed: number; s: number }

export interface Stats {
  created: number[];
  fired: number;
  cascades: number;
  maxStep: number;
  shuffles: number;
  gifts: number;
  slides: number;
}

/** an engine event (always logged when `st.log` is an array: puzzle solver, recorder, tests) */
export type Ev = { e: string } & Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface GameState {
  L: Level;
  W: number;
  H: number;
  N: number;
  mask: Uint8Array;
  spawner: Uint8Array;
  exit: Uint8Array;
  kind: Uint8Array;
  color: Int8Array;
  hp: Uint8Array;
  ice: Uint8Array;
  dust: Uint8Array;
  refill: boolean;
  rFill: RngState;
  rInit: RngState;
  rProp: RngState;
  rGoo: RngState;
  rShuf: RngState;
  movesUsed: number;
  collected: Int32Array;
  crates: number;
  iceFreed: number;
  dustCleared: number;
  gooCleared: number;
  delivered: number;
  energy: number;
  podsReleased: number;
  lastPodMove: number;
  gooHit: boolean;
  evalMode: boolean;
  log: Ev[] | null;
  stats: Stats;
  initAttempts?: number;
  /** recorder only (view): a stable id per piece/special/pod; 0 = nothing. null when not recording. */
  uid: Int32Array | null;
  nextUid: number;
  /** recorder only: trigger of the special being queued right now (spec §8.3 `trigger`) */
  trig: Trigger | null;
  blastSeq: number;
}

export type Trigger = { blast: number } | { flight: number } | { match: number } | null;

export type ComboKind = 'RR' | 'RB' | 'BB' | 'PP' | 'P+' | 'OO' | 'OR' | 'OB' | 'OP';
export interface Act {
  k: number | ComboKind;
  at: number;
  col: number | null;
  carry?: number;
  carried?: boolean;
  /** recorder only */
  trig?: Trigger;
}

export type Move = { t: 'swap'; a: number; b: number } | { t: 'tap'; a: number };
export type BoosterUse = { t: 'drill'; a: number } | { t: 'ion'; a: number; dir: 'H' | 'V' } | { t: 'tractor'; a: number; b: number };
export interface MoveResult { ok: boolean; won?: boolean; steps?: number }

export interface Group {
  color: number;
  cells: number[];
  runs: { cells: number[]; dir: 'H' | 'V'; col: number }[];
  squares: number[][];
  type: number;
  inter: number[];
  longest: { cells: number[]; dir: 'H' | 'V'; col: number } | null;
}
