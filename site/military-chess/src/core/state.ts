/**
 * Game state (spec §8.2). Typed arrays; per-game immutable arrays (ptype, pside, pinit) are shared
 * between clones. Piece ids: RED 25 in layout order, then BLUE 25 (翻翻棋: in shuffled station order).
 */
import { BLUE, N, RED, SLOTS, isCamp, slotToIndex, type Side } from './board';
import { COUNTS, type PType, typeFromCode } from './pieces';
import { validateLayout, type Rand } from './layout';

export type Mode = 'ming' | 'an' | 'fan';
export const MAXP = 50;

export interface RuleSet {
  /** 明/暗 80, 翻 40 */
  quietLimit: number;
  /** 600 */
  plyCap: number;
  /** ladder: quiet / ply cap → 清点兵力; family: draw */
  endByCount: boolean;
  /** 翻翻棋: a flag is capturable only after all its mines are gone */
  fanFlagLock: boolean;
  /** max consecutive back-and-forth moves of one piece between two stations */
  shuttleMax: number;
  /** pieces inside any 大本营 never move again */
  hqFreeze: boolean;
  /** null | 'static' (blue only passes) | 'best' (blue answers from the reply book) */
  puzzle: null | 'static' | 'best';
}

export function defaultRules(mode: Mode, patch: Partial<RuleSet> = {}): RuleSet {
  return {
    quietLimit: mode === 'fan' ? 40 : 80,
    plyCap: 600,
    endByCount: false,
    fanFlagLock: true,
    shuttleMax: 4,
    hqFreeze: true,
    puzzle: null,
    ...patch,
  };
}

export interface Shuttle {
  pid: number;
  from: number;
  to: number;
  n: number;
}

export type ResultReason = 'flag' | 'no-moves' | 'both-immobile' | 'quiet' | 'ply-cap' | 'agreed' | 'count' | 'count-draw';
export interface GameResult {
  winner: Side | -1;
  reason: ResultReason;
  /** 清点兵力 totals [red, blue] */
  tally?: [number, number];
  /** for count results: what triggered the count */
  via?: 'quiet' | 'ply-cap';
}

export interface GameState {
  mode: Mode;
  /** station → piece id or −1 */
  board: Int8Array;
  np: number;
  ptype: Uint8Array;
  pside: Uint8Array;
  pinit: Int8Array;
  ppos: Int8Array;
  palive: Uint8Array;
  /** face-up (翻翻棋 flipped; always 1 in 明/暗 — hidden information in 暗棋 is a view concern) */
  pup: Uint8Array;
  pmoved: Uint8Array;
  /** side to move; −1 in 翻翻棋 before the first flip */
  turn: Side | -1;
  ply: number;
  quiet: number;
  flagShown: [boolean, boolean];
  shuttle: [Shuttle, Shuttle];
  /** 翻翻棋: player index → colour (−1 until the first flip) */
  colorOf: [Side | -1, Side | -1];
  /** 翻翻棋: the player who makes the first flip */
  toAct: 0 | 1;
  firstMover: Side;
  rules: RuleSet;
  result: GameResult | null;
}

const freshShuttle = (): Shuttle => ({ pid: -1, from: -1, to: -1, n: 0 });

export function newState(mode: Mode = 'ming', rules: Partial<RuleSet> = {}, firstMover: Side = RED): GameState {
  return {
    mode,
    board: new Int8Array(N).fill(-1),
    np: 0,
    ptype: new Uint8Array(MAXP),
    pside: new Uint8Array(MAXP),
    pinit: new Int8Array(MAXP).fill(-1),
    ppos: new Int8Array(MAXP).fill(-1),
    palive: new Uint8Array(MAXP),
    pup: new Uint8Array(MAXP),
    pmoved: new Uint8Array(MAXP),
    turn: firstMover,
    ply: 0,
    quiet: 0,
    flagShown: [false, false],
    shuttle: [freshShuttle(), freshShuttle()],
    colorOf: [-1, -1],
    toAct: 0,
    firstMover,
    rules: defaultRules(mode, rules),
    result: null,
  };
}

export function addPiece(s: GameState, side: Side, type: number, pos: number, up = true): number {
  if (s.np >= MAXP) throw new Error('too many pieces');
  if (s.board[pos] !== -1) throw new Error('occupied ' + pos);
  const id = s.np++;
  s.ptype[id] = type;
  s.pside[id] = side;
  s.ppos[id] = pos;
  s.pinit[id] = pos;
  s.palive[id] = 1;
  s.pup[id] = up ? 1 : 0;
  s.pmoved[id] = 0;
  s.board[pos] = id;
  return id;
}

/** Place a side's layout ('.' = handicap blank). */
export function deploy(s: GameState, side: Side, layout: string, handicap = ''): void {
  const e = validateLayout(layout, handicap);
  if (e.length) throw new Error('illegal layout: ' + e.join(','));
  SLOTS.forEach(([r, c], k) => {
    if (layout[k] === '.') return;
    addPiece(s, side, typeFromCode(layout[k]), slotToIndex(side, r, c), s.mode !== 'fan');
  });
}

export interface StandardSetup {
  red: string;
  blue: string;
  handicap?: { red: string; blue: string };
  firstMover?: Side;
  rules?: Partial<RuleSet>;
}
export function setupStandard(mode: 'ming' | 'an', o: StandardSetup): GameState {
  const s = newState(mode, o.rules, o.firstMover ?? RED);
  deploy(s, RED, o.red, o.handicap?.red ?? '');
  deploy(s, BLUE, o.blue, o.handicap?.blue ?? '');
  s.turn = s.firstMover;
  return s;
}

/** 翻翻棋 opening: 50 pieces shuffled (Fisher–Yates, one rng() per step) face down on the 50 non-camp stations. */
export function setupFan(rng: Rand, rules: Partial<RuleSet> = {}, firstPlayer: 0 | 1 = 0): GameState {
  const s = newState('fan', rules, RED);
  const pieces: Array<[Side, number]> = [];
  for (const side of [RED, BLUE] as Side[]) for (let t = 0; t < 12; t++) for (let n = 0; n < COUNTS[t]; n++) pieces.push([side, t]);
  for (let i = pieces.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pieces[i], pieces[j]] = [pieces[j], pieces[i]];
  }
  let k = 0;
  for (let i = 0; i < N; i++) {
    if (isCamp(i)) continue;
    const [side, t] = pieces[k++];
    addPiece(s, side, t, i, false);
  }
  s.turn = -1;
  s.colorOf = [-1, -1];
  s.toAct = firstPlayer;
  return s;
}

export function clone(s: GameState): GameState {
  return {
    ...s,
    board: s.board.slice(),
    ppos: s.ppos.slice(),
    palive: s.palive.slice(),
    pup: s.pup.slice(),
    pmoved: s.pmoved.slice(),
    flagShown: [s.flagShown[0], s.flagShown[1]],
    shuttle: [{ ...s.shuttle[0] }, { ...s.shuttle[1] }],
    colorOf: [s.colorOf[0], s.colorOf[1]],
  };
}

/** the colour a player (0/1) plays; in 明/暗 player index = colour */
export const colourOfPlayer = (s: GameState, player: 0 | 1): Side | -1 => (s.mode === 'fan' ? s.colorOf[player] : player);
/** the player (0/1) who acts now */
export function playerToAct(s: GameState): 0 | 1 {
  if (s.mode !== 'fan') return s.turn as 0 | 1;
  if (s.turn === -1) return s.toAct;
  return (s.colorOf[0] === s.turn ? 0 : 1) as 0 | 1;
}

/** Compact, stable text form of a position (tests, resume hash). */
export function encode(s: GameState): string {
  let b = '';
  for (let i = 0; i < N; i++) {
    const p = s.board[i];
    b += p === -1 ? '..' : (s.pside[p] ? 'b' : 'r') + (s.pup[p] ? '' : '~') + 'FMB123456789'[s.ptype[p]];
  }
  return `${s.mode}|${b}|t${s.turn}|p${s.ply}|q${s.quiet}|f${+s.flagShown[0]}${+s.flagShown[1]}|c${s.colorOf.join(',')}|r${s.result ? s.result.winner + s.result.reason : '-'}`;
}

export type { PType };
