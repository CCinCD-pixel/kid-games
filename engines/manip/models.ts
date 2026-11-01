/**
 * Small pure models behind the 千晶大仓 / 生产线 stages (spec §3.8.3, §8.3): counter (+仓灯), pods (equal groups), array, hop (skip counting),
 * belt (order cards). Each model: immutable states, operations return null when illegal, a `check*` returning violated invariants.
 * No DOM, no Math.random, no Date.now.
 */

// ---- counter: three rods (≤9 each) + the 仓灯 (= 1000, NOT a digit rod) ---------------------------------------------------------
export interface CounterState { h: number; t: number; o: number; lamp: 0 | 1 }
export type CounterPlace = 'h' | 't' | 'o';
export const counterValue = (s: CounterState): number => s.lamp * 1000 + s.h * 100 + s.t * 10 + s.o;
export function counterFrom(n: number): CounterState {
  if (!Number.isInteger(n) || n < 0 || n > 1000) throw new Error(`counter value out of range: ${n}`);
  if (n === 1000) return { h: 0, t: 0, o: 0, lamp: 1 };
  return { h: Math.floor(n / 100), t: Math.floor(n / 10) % 10, o: n % 10, lamp: 0 };
}
const PLACE_VALUE: Record<CounterPlace, number> = { h: 100, t: 10, o: 1 };
/** One bead up / down on a rod with the carry (9 → 10 lights the next rod) or the borrow (0 − 1 takes from the next rod / the 仓灯). */
export function counterBump(s: CounterState, place: CounterPlace, d: 1 | -1): CounterState | null {
  const v = counterValue(s) + d * PLACE_VALUE[place];
  return v < 0 || v > 1000 ? null : counterFrom(v);
}
/** Set one rod to a digit directly (tapping a bead). The lamp state forbids touching the rods (1000 has no digits). */
export function counterSet(s: CounterState, place: CounterPlace, digit: number): CounterState | null {
  if (!Number.isInteger(digit) || digit < 0 || digit > 9 || s.lamp) return null;
  return { ...s, [place]: digit };
}
export function checkCounter(s: CounterState): string[] {
  const e: string[] = [];
  for (const k of ['h', 't', 'o'] as const) if (!Number.isInteger(s[k]) || s[k] < 0 || s[k] > 9) e.push(`rod ${k} out of range`);
  if (s.lamp !== 0 && s.lamp !== 1) e.push('lamp invalid');
  if (s.lamp && (s.h || s.t || s.o)) e.push('lamp lit with digits (> 1000)');
  return e;
}

// ---- pods: equal groups ----------------------------------------------------------------------------------------------------------
export interface PodsState { pods: number[]; stock: number }
export const MAX_PODS = 10, MAX_POD_SIZE = 10;
export const podsTotal = (s: PodsState): number => s.stock + s.pods.reduce((a, x) => a + x, 0);
/** The size shared by every pod (and ≥1 pod), or null. */
export const podsEqual = (s: PodsState): number | null => (s.pods.length && s.pods.every((x) => x === s.pods[0]) ? s.pods[0] : null);
export function podsAdd(s: PodsState, size: number): PodsState | null {
  if (s.pods.length >= MAX_PODS || size < 1 || size > MAX_POD_SIZE || s.stock < size) return null;
  return { pods: [...s.pods, size], stock: s.stock - size };
}
export function podsGive(s: PodsState, i: number): PodsState | null {
  if (i < 0 || i >= s.pods.length || s.stock < 1 || s.pods[i] >= MAX_POD_SIZE) return null;
  const pods = s.pods.slice(); pods[i]++; return { pods, stock: s.stock - 1 };
}
export function podsTake(s: PodsState, i: number): PodsState | null {
  if (i < 0 || i >= s.pods.length || s.pods[i] < 1) return null;
  const pods = s.pods.slice(); pods[i]--; return { pods, stock: s.stock + 1 };
}
/** Hand every pod one crystal (the "发一圈" button). */
export function podsDeal(s: PodsState): PodsState | null {
  if (!s.pods.length || s.stock < s.pods.length || s.pods.some((x) => x >= MAX_POD_SIZE)) return null;
  return { pods: s.pods.map((x) => x + 1), stock: s.stock - s.pods.length };
}
export function podsRemove(s: PodsState, i: number): PodsState | null {
  if (i < 0 || i >= s.pods.length) return null;
  return { pods: s.pods.filter((_, j) => j !== i), stock: s.stock + s.pods[i] };
}
export function checkPods(s: PodsState): string[] {
  const e: string[] = [];
  if (s.pods.length > MAX_PODS) e.push('too many pods');
  if (s.pods.some((x) => !Number.isInteger(x) || x < 0 || x > MAX_POD_SIZE)) e.push('pod size out of range');
  if (!Number.isInteger(s.stock) || s.stock < 0) e.push('stock invalid');
  return e;
}

// ---- array: rows × cols block board, ≤10×10 -------------------------------------------------------------------------------------
export interface ArrayState { rows: number; cols: number; /** split after this many rows (0 = not split) */ cut: number }
export const ARRAY_MAX = 10;
export const arrayArea = (s: ArrayState): number => s.rows * s.cols;
export function arraySet(s: ArrayState, rows: number, cols: number): ArrayState | null {
  if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows < 1 || cols < 1 || rows > ARRAY_MAX || cols > ARRAY_MAX) return null;
  return { rows, cols, cut: s.cut > 0 && s.cut < rows ? s.cut : 0 };
}
/** 转一转: rows ↔ cols (area conserved; two turns restore the board). */
export const arrayTurn = (s: ArrayState): ArrayState => ({ rows: s.cols, cols: s.rows, cut: 0 });
export function arraySplit(s: ArrayState, k: number): ArrayState | null { return Number.isInteger(k) && k >= 1 && k < s.rows ? { ...s, cut: k } : null; }
export const arrayParts = (s: ArrayState): [number, number] | null => (s.cut ? [s.cut * s.cols, (s.rows - s.cut) * s.cols] : null);
export function checkArray(s: ArrayState): string[] {
  const e: string[] = [];
  if (s.rows < 1 || s.rows > ARRAY_MAX || s.cols < 1 || s.cols > ARRAY_MAX) e.push('array out of range');
  if (s.cut < 0 || s.cut >= s.rows) e.push('cut out of range');
  const p = arrayParts(s); if (p && p[0] + p[1] !== arrayArea(s)) e.push('split parts do not add up');
  return e;
}

// ---- hop: skip counting on a track ----------------------------------------------------------------------------------------------
export interface HopState { start: number; step: number; hops: number }
export const HOP_MAX = 14;
export const hopLanding = (s: HopState): number => s.start + s.step * s.hops;
export const hopForward = (s: HopState): HopState | null => (s.hops >= HOP_MAX ? null : { ...s, hops: s.hops + 1 });
export const hopBack = (s: HopState): HopState | null => (s.hops <= 0 ? null : { ...s, hops: s.hops - 1 });
export function checkHop(s: HopState): string[] { return s.hops < 0 || s.hops > HOP_MAX || s.step < 1 ? ['hop out of range'] : []; }

// ---- belt: put cards in order -----------------------------------------------------------------------------------------------------
export interface BeltState { pool: number[]; slots: (number | null)[] }
export const beltNew = (cards: number[]): BeltState => ({ pool: cards.slice(), slots: cards.map(() => null) });
export function beltPlace(s: BeltState, card: number, slot: number): BeltState | null {
  const i = s.pool.indexOf(card);
  if (i < 0 || slot < 0 || slot >= s.slots.length || s.slots[slot] !== null) return null;
  const slots = s.slots.slice(); slots[slot] = card;
  return { pool: s.pool.filter((_, j) => j !== i), slots };
}
export function beltLift(s: BeltState, slot: number): BeltState | null {
  const c = s.slots[slot]; if (c === null || c === undefined) return null;
  const slots = s.slots.slice(); slots[slot] = null; return { pool: [...s.pool, c], slots };
}
export const beltFull = (s: BeltState): boolean => s.slots.every((x) => x !== null);
export const beltOrder = (s: BeltState): number[] | null => (beltFull(s) ? (s.slots as number[]) : null);
export function checkBelt(s: BeltState, cards: number[]): string[] {
  const all = [...s.pool, ...s.slots.filter((x): x is number => x !== null)].sort((a, b) => a - b);
  return JSON.stringify(all) === JSON.stringify(cards.slice().sort((a, b) => a - b)) ? [] : ['cards lost or duplicated'];
}
