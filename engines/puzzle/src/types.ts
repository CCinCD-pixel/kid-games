/**
 * PuzzleKit core types. Directions follow the prototype order (sokoban.mjs DIRS): 0 up, 1 down,
 * 2 left, 3 right. Cells are numbered row-major: i = r·W + c.
 */

/** 0 up · 1 down · 2 left · 3 right */
export type Dir = 0 | 1 | 2 | 3;
export const DIRS: readonly Dir[] = [0, 1, 2, 3];
export const DR: readonly number[] = [-1, 1, 0, 0];
export const DC: readonly number[] = [0, 0, -1, 1];
/** LURD letter per direction (lower case = walk, upper case = push) */
export const DIR_CH: readonly string[] = ['u', 'd', 'l', 'r'];
/** the opposite direction */
export const OPP: readonly Dir[] = [1, 0, 3, 2];

export type DeadType = 'corner' | 'wall' | 'pair' | 'square';
export const DEAD_TYPES: readonly DeadType[] = ['corner', 'wall', 'pair', 'square'];

export interface Level {
  id: string;
  W: number;
  H: number;
  N: number;
  /** the map rows as given (ragged rows allowed) */
  rows: string[];
  wall: Uint8Array;
  /** interior: flood fill from the player through non-wall cells */
  floor: Uint8Array;
  /** -1 no pad; 0..4 pad colour */
  goal: Int8Array;
  /** slot → crate colour (slots sorted by colour, then start position) */
  colorOf: Uint8Array;
  /** [start, end) slot ranges of equal colour */
  groups: [number, number][];
  nBoxes: number;
  start: { player: number; boxes: Uint16Array };
  /** per colour: simple dead squares (a crate of that colour there can never reach a pad of its colour) */
  dead: Record<number, Uint8Array>;
  /** any crate colour > 0 */
  colored: boolean;
  floorCount: number;
}

/** A push-level state. `boxes[s]` is the cell of slot s (crates of one colour are interchangeable). */
export interface State {
  player: number;
  boxes: Uint16Array;
}

/** A legal push: crate `slot` moves from `from` to `to` in `dir`; the robot first walks `walk` cells. */
export interface Push {
  slot: number;
  from: number;
  to: number;
  dir: Dir;
  walk: number;
}
