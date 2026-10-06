/**
 * Level parsing (XSB + colour letters, identical to the prototype sokoban.mjs parse()), the simple
 * dead squares per colour, and the board symmetries used for twins (镜子仓库) and canonical hashes.
 *
 * Map letters:
 *   #  wall           - _ or space  floor or outside (decided by the flood fill from the robot)
 *   @  robot          +  robot on a supply pad
 *   $  supply crate   .  supply pad      *  supply crate on a supply pad
 *   A B C D  crates of colour 1..4       a b c d  pads of colour 1..4
 *   1 2 3 4  colour crate on its own pad (internal use)
 */
import { fnv1a32 } from './fnv';
import { DC, DR, type Level } from './types';

export class LevelError extends Error {}

function cleanRows(src: string | readonly string[]): string[] {
  const rows = Array.isArray(src) ? [...src] : (src as string).split('\n');
  return rows.filter((r, i, a) => !(r.trim() === '' && (i === 0 || i === a.length - 1)));
}

/** Neighbour cell of p in direction d, or -1 off the grid. */
export function nb(l: Pick<Level, 'W' | 'H'>, p: number, d: number): number {
  const r = (p / l.W) | 0;
  const c = p % l.W;
  const rr = r + DR[d];
  const cc = c + DC[d];
  if (rr < 0 || rr >= l.H || cc < 0 || cc >= l.W) return -1;
  return rr * l.W + cc;
}

export function parseLevel(src: string | readonly string[], id = ''): Level {
  const rows = cleanRows(src);
  if (!rows.length) throw new LevelError('empty map');
  const H = rows.length;
  const W = Math.max(...rows.map((r) => r.length));
  const N = W * H;
  const wall = new Uint8Array(N);
  const goal = new Int8Array(N).fill(-1);
  const crates: { pos: number; color: number }[] = [];
  let player = -1;
  for (let r = 0; r < H; r += 1) {
    for (let c = 0; c < W; c += 1) {
      const ch = rows[r][c] ?? ' ';
      const i = r * W + c;
      switch (ch) {
        case '#': wall[i] = 1; break;
        case '@': player = i; break;
        case '+': player = i; goal[i] = 0; break;
        case '.': goal[i] = 0; break;
        case '$': crates.push({ pos: i, color: 0 }); break;
        case '*': crates.push({ pos: i, color: 0 }); goal[i] = 0; break;
        case 'A': case 'B': case 'C': case 'D': crates.push({ pos: i, color: ch.charCodeAt(0) - 64 }); break;
        case 'a': case 'b': case 'c': case 'd': goal[i] = ch.charCodeAt(0) - 96; break;
        case '1': case '2': case '3': case '4': { const k = ch.charCodeAt(0) - 48; goal[i] = k; crates.push({ pos: i, color: k }); break; }
        case '-': case '_': case ' ': break;
        default: throw new LevelError(`bad char ${JSON.stringify(ch)} at ${r},${c}`);
      }
    }
  }
  if (player < 0) throw new LevelError('no robot');
  const floor = new Uint8Array(N);
  const stack = [player];
  floor[player] = 1;
  while (stack.length) {
    const p = stack.pop()!;
    const r = (p / W) | 0;
    const c = p % W;
    for (let d = 0; d < 4; d += 1) {
      const rr = r + DR[d];
      const cc = c + DC[d];
      if (rr < 0 || rr >= H || cc < 0 || cc >= W) throw new LevelError('interior leaks to the map edge');
      const q = rr * W + cc;
      if (!wall[q] && !floor[q]) {
        floor[q] = 1;
        stack.push(q);
      }
    }
  }
  for (const b of crates) if (!floor[b.pos]) throw new LevelError('crate outside the interior');
  for (let i = 0; i < N; i += 1) if (goal[i] >= 0 && !floor[i]) throw new LevelError('pad outside the interior');
  const colors = [...new Set(crates.map((b) => b.color))].sort((a, b) => a - b);
  for (const k of colors) {
    const nbx = crates.filter((b) => b.color === k).length;
    let ng = 0;
    for (let i = 0; i < N; i += 1) if (goal[i] === k) ng += 1;
    if (nbx !== ng) throw new LevelError(`colour ${k}: ${nbx} crates vs ${ng} pads`);
  }
  for (let i = 0; i < N; i += 1) if (goal[i] >= 0 && !colors.includes(goal[i])) throw new LevelError(`pad colour ${goal[i]} without crates`);
  crates.sort((a, b) => a.color - b.color || a.pos - b.pos);
  const colorOf = Uint8Array.from(crates.map((b) => b.color));
  const groups: [number, number][] = [];
  for (let s = 0; s < colorOf.length; ) {
    let e = s;
    while (e < colorOf.length && colorOf[e] === colorOf[s]) e += 1;
    groups.push([s, e]);
    s = e;
  }
  let floorCount = 0;
  for (let i = 0; i < N; i += 1) floorCount += floor[i];
  const lvl: Level = {
    id, W, H, N, rows, wall, floor, goal, colorOf, groups, nBoxes: crates.length,
    start: { player, boxes: Uint16Array.from(crates.map((b) => b.pos)) },
    dead: {}, colored: colors.some((k) => k > 0), floorCount,
  };
  lvl.dead = deadSquares(lvl);
  return lvl;
}

/** Simple dead squares per colour: pull a crate backwards from every pad of that colour. */
function deadSquares(l: Level): Record<number, Uint8Array> {
  const out: Record<number, Uint8Array> = {};
  for (const k of new Set(l.colorOf)) {
    const live = new Uint8Array(l.N);
    const q: number[] = [];
    for (let i = 0; i < l.N; i += 1) {
      if (l.goal[i] === k) {
        live[i] = 1;
        q.push(i);
      }
    }
    while (q.length) {
      const x = q.pop()!;
      for (let d = 0; d < 4; d += 1) {
        const y = nb(l, x, d); // crate pulled from x to y, robot steps on to z
        if (y < 0 || !l.floor[y]) continue;
        const z = nb(l, y, d);
        if (z < 0 || !l.floor[z]) continue;
        if (!live[y]) {
          live[y] = 1;
          q.push(y);
        }
      }
    }
    const dead = new Uint8Array(l.N);
    for (let i = 0; i < l.N; i += 1) if (l.floor[i] && !live[i]) dead[i] = 1;
    out[k] = dead;
  }
  return out;
}

/** Back to text rows (robot/crates/pads re-encoded; void stays a space, floor a '-'). */
export function serialize(l: Level, state: { player: number; boxes: ArrayLike<number> } = l.start): string[] {
  const at = new Map<number, number>();
  for (let s = 0; s < state.boxes.length; s += 1) at.set(state.boxes[s], l.colorOf[s]);
  const rows: string[] = [];
  for (let r = 0; r < l.H; r += 1) {
    let row = '';
    for (let c = 0; c < l.W; c += 1) {
      const i = r * l.W + c;
      const g = l.goal[i];
      const crate = at.get(i);
      if (l.wall[i]) row += '#';
      else if (i === state.player) row += g === 0 ? '+' : '@';
      else if (crate !== undefined) row += crate === 0 ? (g === 0 ? '*' : '$') : g === crate ? String(crate) : String.fromCharCode(64 + crate);
      else if (g >= 0) row += g === 0 ? '.' : String.fromCharCode(96 + g);
      else row += l.floor[i] ? '-' : ' ';
    }
    rows.push(row.replace(/\s+$/, ''));
  }
  return rows;
}

// ---------------------------------------------------------------- symmetries

const widthOf = (rows: readonly string[]) => Math.max(...rows.map((r) => r.length));

/** Left–right mirror (same as the prototype mirrorRows: pad, reverse, trim the right). */
export function mirrorRows(rows: readonly string[]): string[] {
  const W = widthOf(rows);
  return rows.map((r) => r.padEnd(W, ' ').split('').reverse().join('').replace(/\s+$/, ''));
}
/** Upside down. */
export function flipRows(rows: readonly string[]): string[] {
  return rows.slice().reverse();
}
export function rot180Rows(rows: readonly string[]): string[] {
  return flipRows(mirrorRows(rows));
}
/** Transpose (used for the 8 symmetries of the canonical hash). */
export function transposeRows(rows: readonly string[]): string[] {
  const W = widthOf(rows);
  const out: string[] = [];
  for (let c = 0; c < W; c += 1) {
    let row = '';
    for (const r of rows) row += r[c] ?? ' ';
    out.push(row.replace(/\s+$/, ''));
  }
  return out;
}

/** Normalised robot cell: the smallest cell index it can reach with the crates as obstacles. */
function normalisedStart(l: Level): number {
  const occupied = new Uint8Array(l.N);
  for (const b of l.start.boxes) occupied[b] = 1;
  const seen = new Uint8Array(l.N);
  const stack = [l.start.player];
  seen[l.start.player] = 1;
  let min = l.start.player;
  while (stack.length) {
    const p = stack.pop()!;
    if (p < min) min = p;
    for (let d = 0; d < 4; d += 1) {
      const q = nb(l, p, d);
      if (q < 0 || !l.floor[q] || occupied[q] || seen[q]) continue;
      seen[q] = 1;
      stack.push(q);
    }
  }
  return min;
}

/** "Same puzzle" fingerprint: the static picture without the robot + the normalised robot cell. */
function puzzleFingerprint(rows: readonly string[]): string {
  const W = widthOf(rows);
  const pic = rows.map((r) => r.padEnd(W, ' ').replace(/@/g, '-').replace(/\+/g, '.')).join('\n');
  return `${pic}|${normalisedStart(parseLevel(rows))}`;
}

export type TwinKind = 'mirror' | 'flip' | 'rot180';

/** The 镜子仓库 twin: the first of mirror / flip / rot180 that is a different puzzle (spec G7). */
export function twinOf(rows: readonly string[]): { kind: TwinKind; rows: string[] } | null {
  const own = puzzleFingerprint(rows);
  const candidates: [TwinKind, (r: readonly string[]) => string[]][] = [['mirror', mirrorRows], ['flip', flipRows], ['rot180', rot180Rows]];
  for (const [kind, f] of candidates) {
    const t = f(rows);
    if (puzzleFingerprint(t) !== own) return { kind, rows: t };
  }
  return null;
}

/** Apply a named twin transform. */
export function transformRows(rows: readonly string[], kind: TwinKind): string[] {
  return kind === 'mirror' ? mirrorRows(rows) : kind === 'flip' ? flipRows(rows) : rot180Rows(rows);
}

/** Smallest FNV-1a over the 8 symmetries of the puzzle fingerprint (random-warehouse dedupe). */
export function canonicalHash(rows: readonly string[]): number {
  let best = 0xffffffff;
  let cur = [...rows];
  for (let t = 0; t < 2; t += 1) {
    for (const v of [cur, mirrorRows(cur), flipRows(cur), rot180Rows(cur)]) {
      const h = fnv1a32(puzzleFingerprint(v));
      if (h < best) best = h;
    }
    cur = transposeRows(rows);
  }
  return best >>> 0;
}
