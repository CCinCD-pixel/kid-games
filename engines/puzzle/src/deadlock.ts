/**
 * The four visible deadlock rules (spec §3.6 layer 1). Conservative: every flagged state is truly
 * unsolvable (validator G6 checks all reachable states).
 *   corner — off-pad crate on a simple dead square with walls on two orthogonal sides
 *   wall   — off-pad crate on a simple dead square that is not a corner (slides along a padless wall)
 *   pair   — 2×2 block of 2 walls on one side + 2 crates side by side, ≥1 crate off its pad
 *   square — any other fully blocked 2×2 (walls/crates) with ≥1 crate off its pad
 */
import { nb } from './level';
import { boxMap } from './rules';
import type { DeadType, Level } from './types';

const isWallish = (l: Level, i: number) => i < 0 || !l.floor[i];

function block(l: Level, r0: number, c0: number): number[] {
  const out: number[] = [];
  for (const [rr, cc] of [[r0, c0], [r0, c0 + 1], [r0 + 1, c0], [r0 + 1, c0 + 1]]) {
    out.push(rr < 0 || cc < 0 || rr >= l.H || cc >= l.W ? -1 : rr * l.W + cc);
  }
  return out;
}

const CORNERS: readonly [number, number][] = [[0, 0], [-1, 0], [0, -1], [-1, -1]];

function deadSquareType(l: Level, p: number): DeadType {
  const u = isWallish(l, nb(l, p, 0));
  const d = isWallish(l, nb(l, p, 1));
  const lf = isWallish(l, nb(l, p, 2));
  const r = isWallish(l, nb(l, p, 3));
  return (u || d) && (lf || r) ? 'corner' : 'wall';
}

/** Is there an off-pad crate on a simple dead square of its colour? (terminal in the state graph) */
export function onDeadSquare(l: Level, boxes: ArrayLike<number>): boolean {
  for (let s = 0; s < boxes.length; s += 1) if (l.dead[l.colorOf[s]][boxes[s]]) return true;
  return false;
}

/**
 * Every crate the four rules flag, each once with the first type that flags it: dead squares first
 * (corner | wall), then every crate in a frozen 2×2 (pair | square). Sorted by cell.
 */
export function detectAll(l: Level, boxes: ArrayLike<number>): { cell: number; type: DeadType }[] {
  const bmap = boxMap(l, boxes);
  const off = (s: number) => l.goal[boxes[s]] !== l.colorOf[s];
  const out = new Map<number, DeadType>();
  for (let s = 0; s < boxes.length; s += 1) {
    if (!off(s)) continue;
    const p = boxes[s];
    if (l.dead[l.colorOf[s]][p]) out.set(p, deadSquareType(l, p));
  }
  for (let s = 0; s < boxes.length; s += 1) {
    const p = boxes[s];
    const r = (p / l.W) | 0;
    const c = p % l.W;
    for (const [dr, dc] of CORNERS) {
      const cells = block(l, r + dr, c + dc);
      let walls = 0;
      const crates: number[] = [];
      let full = true;
      let anyOff = false;
      for (const i of cells) {
        if (isWallish(l, i)) {
          walls += 1;
          continue;
        }
        if (bmap[i] >= 0) {
          crates.push(i);
          if (off(bmap[i])) anyOff = true;
          continue;
        }
        full = false;
        break;
      }
      if (!full || !anyOff || !crates.length) continue;
      let type: DeadType = 'square';
      if (walls === 2 && crates.length === 2) {
        const [a, b] = crates;
        if (((a / l.W) | 0) === ((b / l.W) | 0) || a % l.W === b % l.W) type = 'pair';
      }
      for (const i of crates) if (off(bmap[i]) && !out.has(i)) out.set(i, type);
    }
  }
  return [...out].map(([cell, type]) => ({ cell, type })).sort((a, b) => a.cell - b.cell);
}

/** The prototype's detect(): the first hit in prototype order (parity fixtures). */
export function detectDeadlock(l: Level, boxes: ArrayLike<number>): { type: DeadType; cells: number[] } | null {
  const bmap = boxMap(l, boxes);
  const off = (s: number) => l.goal[boxes[s]] !== l.colorOf[s];
  for (let s = 0; s < boxes.length; s += 1) {
    if (!off(s)) continue;
    const p = boxes[s];
    if (l.dead[l.colorOf[s]][p]) return { type: deadSquareType(l, p), cells: [p] };
  }
  for (let s = 0; s < boxes.length; s += 1) {
    const p = boxes[s];
    const r = (p / l.W) | 0;
    const c = p % l.W;
    for (const [dr, dc] of CORNERS) {
      const cells = block(l, r + dr, c + dc);
      let walls = 0;
      const crates: number[] = [];
      let anyOff = false;
      let full = true;
      for (const i of cells) {
        if (isWallish(l, i)) {
          walls += 1;
          continue;
        }
        if (bmap[i] >= 0) {
          crates.push(i);
          if (off(bmap[i])) anyOff = true;
          continue;
        }
        full = false;
        break;
      }
      if (!full || !anyOff || crates.length === 0) continue;
      let type: DeadType = 'square';
      if (walls === 2 && crates.length === 2) {
        const [a, b] = cells.filter((i) => !isWallish(l, i));
        if (((a / l.W) | 0) === ((b / l.W) | 0) || a % l.W === b % l.W) type = 'pair';
      }
      return { type, cells: crates };
    }
  }
  return null;
}

/** Priority for the single spoken line when several types appear in one push (spec §3.6). */
export const DEAD_PRIORITY: readonly DeadType[] = ['corner', 'wall', 'pair', 'square'];
