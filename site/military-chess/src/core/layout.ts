/**
 * Deployment (spec §3.4, R3): layout strings, validation, templates' grid form, mirror, random and
 * AI layouts. A layout is 25 type codes in SLOTS order (owner perspective, front row first); '.'
 * marks a slot emptied by a handicap (让子).
 */
import { KIND_CAMP, RED, SLOTS, isHQ, kind, slotToIndex } from './board';
import { BOMB, COUNTS, FLAG, MINE, NAMES, TYPE_CODES, typeFromCode } from './pieces';

export type Rand = () => number;

/** Error codes: length, bad-code, count-<名>-<n>, flag-not-in-hq, mine-row-<r>, bomb-front-row, handicap */
export function validateLayout(layout: string, handicap = ''): string[] {
  const errs: string[] = [];
  if (typeof layout !== 'string' || layout.length !== 25) return ['length'];
  const cnt = new Array(12).fill(0);
  let blanks = 0;
  for (let k = 0; k < 25; k++) {
    const ch = layout[k];
    if (ch === '.') {
      blanks++;
      continue;
    }
    const t = typeFromCode(ch);
    if (t < 0) {
      errs.push('bad-code');
      continue;
    }
    cnt[t]++;
    const [r, c] = SLOTS[k];
    const i = slotToIndex(RED, r, c);
    if (t === FLAG && !isHQ(i)) errs.push('flag-not-in-hq');
    if (t === MINE && r < 5) errs.push(`mine-row-${r}`);
    if (t === BOMB && r === 1) errs.push('bomb-front-row');
  }
  const removed = new Array(12).fill(0);
  for (const ch of handicap) {
    const t = typeFromCode(ch);
    if (t < 0 || t === FLAG || t === MINE) errs.push('handicap');
    else removed[t]++;
  }
  if (blanks !== handicap.length) errs.push('handicap');
  for (let t = 0; t < 12; t++) if (cnt[t] !== COUNTS[t] - removed[t]) errs.push(`count-${NAMES[t]}-${cnt[t]}`);
  return errs;
}

/** rule that a single placement breaks, for the UI ("军旗只能放在大本营" …); null if fine */
export function placementRule(code: string, k: number): 'flag' | 'mine' | 'bomb' | null {
  const t = typeFromCode(code);
  const [r, c] = SLOTS[k];
  if (t === FLAG && !isHQ(slotToIndex(RED, r, c))) return 'flag';
  if (t === MINE && r < 5) return 'mine';
  if (t === BOMB && r === 1) return 'bomb';
  return null;
}

/** pretty grid (owner view, front row first; '+' = camp) → layout string */
export function gridToLayout(rows: readonly string[]): string {
  let s = '';
  for (let r = 1; r <= 6; r++) {
    for (let c = 1; c <= 5; c++) {
      const ch = rows[r - 1][c - 1];
      if (kind[slotToIndex(RED, r, c)] === KIND_CAMP) {
        if (ch !== '+') throw new Error(`camp expected r${r}c${c}`);
        continue;
      }
      s += ch;
    }
  }
  return s;
}
export function layoutToGrid(layout: string): string[] {
  const rows: string[] = [];
  let k = 0;
  for (let r = 1; r <= 6; r++) {
    let row = '';
    for (let c = 1; c <= 5; c++) row += kind[slotToIndex(RED, r, c)] === KIND_CAMP ? '+' : layout[k++];
    rows.push(row);
  }
  return rows;
}
/** owner-perspective left↔right mirror (keeps legality: camps, HQs and rows are symmetric) */
export function mirrorLayout(layout: string): string {
  const g = layoutToGrid(layout).map((row) => row.split('').reverse().join(''));
  return gridToLayout(g);
}
/** swap two slots; returns the new layout */
export function swapSlots(layout: string, a: number, b: number): string {
  const arr = layout.split('');
  [arr[a], arr[b]] = [arr[b], arr[a]];
  return arr.join('');
}
/** apply a handicap: blank one slot per removed code (front-most occurrence first) */
export function applyHandicap(layout: string, handicap: string): string {
  const arr = layout.split('');
  for (const ch of handicap) {
    const k = arr.indexOf(ch);
    if (k >= 0) arr[k] = '.';
  }
  return arr.join('');
}

/** Always-legal random layout (port of the reference; golden for seeds 1–3). */
export function randomLayout(rng: Rand): string {
  const slots = SLOTS.map((rc, k) => ({ k, r: rc[0], c: rc[1], hq: isHQ(slotToIndex(RED, rc[0], rc[1])) }));
  const out: (string | null)[] = new Array(25).fill(null);
  const free = new Set(slots.map((s) => s.k));
  const take = (pred: (s: (typeof slots)[number]) => boolean): number => {
    const cands = [...free].filter((k) => pred(slots[k]));
    const k = cands[Math.floor(rng() * cands.length)];
    free.delete(k);
    return k;
  };
  out[take((s) => s.hq)] = 'F';
  for (let m = 0; m < 3; m++) out[take((s) => s.r >= 5)] = 'M';
  for (let b = 0; b < 2; b++) out[take((s) => s.r >= 2)] = 'B';
  const rest: string[] = [];
  for (let t = 3; t < 12; t++) for (let n = 0; n < COUNTS[t]; n++) rest.push(TYPE_CODES[t]);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  for (const k of [...free].sort((a, b) => a - b)) out[k] = rest.pop()!;
  return out.join('');
}

// ---------------------------------------------------------------- AI layouts (spec §4.5)

export interface LayoutStyle {
  /** weight bonus for big officers (≥ 师长) on rail slots / outer files */
  bigOnRail: number;
  /** weight bonus for officers on the front rail row (铁蛋) */
  frontRail: number;
  /** decoy mine shapes allowed (level 4) */
  decoy: boolean;
}
export const LAYOUT_STYLES: Record<'plain' | 'rail' | 'hunter' | 'veteran', LayoutStyle> = {
  plain: { bigOnRail: 0.6, frontRail: 0, decoy: false },
  rail: { bigOnRail: 1.2, frontRail: 1.4, decoy: false },
  hunter: { bigOnRail: 0.9, frontRail: 0.4, decoy: false },
  veteran: { bigOnRail: 1.0, frontRail: 0.3, decoy: true },
};

/** slot index of an owner-perspective (r, c) */
const K = (r: number, c: number): number => SLOTS.findIndex(([rr, cc]) => rr === r && cc === c);
/** mine shapes for the flag in the LEFT HQ (6,2); mirrored for the right HQ */
function mineShapes(decoy: boolean): Array<{ w: number; mines: number[] }> {
  const ring = [K(6, 1), K(6, 3), K(5, 2)];
  const far = [K(5, 1), K(5, 3), K(5, 4), K(5, 5), K(6, 5)];
  const shapes: Array<{ w: number; mines: number[] }> = [{ w: 4, mines: ring }];
  for (let drop = 0; drop < 3; drop++) {
    const two = ring.filter((_, i) => i !== drop);
    for (const f of far) shapes.push({ w: 1, mines: [...two, f] });
  }
  if (decoy) {
    // decoy: one mine next to the real flag, two around the EMPTY right HQ (6,4) so the shape lies
    for (const near of ring) shapes.push({ w: 1.5, mines: [near, K(6, 5), K(5, 4)] });
  }
  return shapes;
}

function weightedIndex(rng: Rand, weights: number[]): number {
  let sum = 0;
  for (const w of weights) sum += w;
  let x = rng() * sum;
  for (let i = 0; i < weights.length; i++) {
    x -= weights[i];
    if (x < 0) return i;
  }
  return weights.length - 1;
}

/** Procedural AI layout: random flag side, a mine shape from the table, bombs in rows 2–5, officers by prior. */
export function aiLayout(style: LayoutStyle, rng: Rand): string {
  const out: string[] = new Array(25).fill('');
  const right = rng() < 0.5;
  const mir = (k: number): number => (right ? K(SLOTS[k][0], 6 - SLOTS[k][1]) : k);
  out[mir(K(6, 2))] = 'F';
  const shapes = mineShapes(style.decoy);
  const shape = shapes[weightedIndex(rng, shapes.map((s) => s.w))];
  for (const k of shape.mines) out[mir(k)] = 'M';
  const free = (): number[] => out.map((v, k) => (v ? -1 : k)).filter((k) => k >= 0);
  // bombs: rows 2–5, prefer the middle files
  for (let b = 0; b < 2; b++) {
    const cands = free().filter((k) => SLOTS[k][0] >= 2 && SLOTS[k][0] <= 5);
    const k = cands[weightedIndex(rng, cands.map((kk) => (SLOTS[kk][1] === 3 ? 2 : 1)))];
    out[k] = 'B';
  }
  // officers: big ones first, weighted toward rails / outer files
  const order = ['9', '8', '7', '7', '6', '6', '5', '5', '4', '4', '3', '3', '3', '2', '2', '2', '1', '1', '1'];
  const isRailSlot = (k: number): boolean => {
    const [r, c] = SLOTS[k];
    return r === 1 || r === 5 || c === 1 || c === 5;
  };
  for (const code of order) {
    const cands = free();
    const t = typeFromCode(code);
    const big = t >= 9;
    const ws = cands.map((k) => {
      const [r] = SLOTS[k];
      let w = 1;
      if (isHQ(slotToIndex(RED, SLOTS[k][0], SLOTS[k][1]))) w *= big ? 0.05 : 0.5; // officers rarely sit frozen in the HQ
      if (big && isRailSlot(k)) w += style.bigOnRail;
      if (t >= 7 && r === 1) w += style.frontRail;
      if (code === '1' && r <= 2) w += 0.5; // engineers like the front rails
      return w;
    });
    out[cands[weightedIndex(rng, ws)]] = code;
  }
  return out.join('');
}

// ---------------------------------------------------------------- 学堂 deploy items (spec §2.5b, L7)

/** slot index of an owner-perspective (row, column) blank */
export const slotOf = (r: number, c: number): number => SLOTS.findIndex(([rr, cc]) => rr === r && cc === c);

/**
 * Can a partially filled deploy item still be completed legally? `base` = the template layout as an
 * array (blank slots hold anything), `idxs` = blank slots, `filled` = slot → code placed so far,
 * `rest` = codes still in the tray. Exhaustive (≤ 5! orders), identical pieces tried once.
 */
export function completable(base: readonly string[], idxs: readonly number[], filled: Map<number, string>, rest: readonly string[]): boolean {
  const free = idxs.filter((k) => !filled.has(k));
  if (!free.length) {
    const b = base.slice();
    for (const [k, v] of filled) b[k] = v;
    return validateLayout(b.join('')).length === 0;
  }
  const seen = new Set<string>();
  for (let i = 0; i < rest.length; i++) {
    if (seen.has(rest[i])) continue;
    seen.add(rest[i]);
    const k = free[0];
    filled.set(k, rest[i]);
    const ok = completable(base, idxs, filled, rest.filter((_, j) => j !== i));
    filled.delete(k);
    if (ok) return true;
  }
  return false;
}

/**
 * Why may `code` not go into blank slot `k` right now? null = accepted. A placement is accepted only
 * if it keeps the item completable; the reason is the piece's own rule if it breaks one, else 'keep'
 * ("这里要留给别的子").
 */
export function placementVerdict(base: readonly string[], idxs: readonly number[], filled: Map<number, string>, rest: readonly string[], code: string, k: number): null | 'flag' | 'mine' | 'bomb' | 'keep' {
  const own = placementRule(code, k);
  if (own) return own;
  const trial = new Map(filled);
  trial.set(k, code);
  const r2 = rest.slice();
  r2.splice(r2.indexOf(code), 1);
  return completable(base, idxs, trial, r2) ? null : 'keep';
}
