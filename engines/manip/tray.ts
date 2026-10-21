/**
 * Crystal tray (spec §3.8.2): 9-slot places with a 10th-item machine entry, cut machines (rod → 10 crystals, box → 10 rods),
 * a staging tray / rack, a shipping pile and three supply carts. Pure model; every accepted operation preserves `totalValue`,
 * every rejected operation returns null and leaves the input untouched (V14 fuzz in models.test.ts).
 */
export type CartId = 'crystal' | 'rod' | 'box';

export interface TrayState {
  boxes: number;
  rods: number;
  crystals: number;
  pressEntry: 0 | 1;
  packEntry: 0 | 1;
  /** a cut rod: 10 loose crystals waiting on the staging tray (≤10) */
  stagedCrystals: number;
  /** cut rods lying beside the tray (each = 10 crystals, not yet opened) */
  cutBundles: number;
  /** a cut box: 10 rods waiting on the staging rack (≤10) */
  stagedRods: number;
  /** cut boxes lying beside the tray (each = 10 rods = 100, not yet opened) */
  cutBoxes: number;
  shipped: number;
  carts: Record<CartId, number>;
  vault1000: 0 | 1;
}

export type TrayAction =
  | { op: 'pour'; cart: CartId }
  | { op: 'press' }
  | { op: 'pack' }
  | { op: 'cutRod' }
  | { op: 'openBundle' }
  | { op: 'moveStaged' }
  | { op: 'cutBox' }
  | { op: 'openBoxBundle' }
  | { op: 'moveStagedRod' }
  | { op: 'ship'; part: CartId };

export const TRAY_OPS = ['pour', 'press', 'pack', 'cutRod', 'openBundle', 'moveStaged', 'cutBox', 'openBoxBundle', 'moveStagedRod', 'ship'] as const;

export function emptyTray(carts: Partial<Record<CartId, number>> = {}): TrayState {
  return {
    boxes: 0, rods: 0, crystals: 0, pressEntry: 0, packEntry: 0,
    stagedCrystals: 0, cutBundles: 0, stagedRods: 0, cutBoxes: 0, shipped: 0, vault1000: 0,
    carts: { crystal: carts.crystal ?? 0, rod: carts.rod ?? 0, box: carts.box ?? 0 },
  };
}
export const cloneTray = (s: TrayState): TrayState => ({ ...s, carts: { ...s.carts } });

/** What is physically on the tray (machines, staging and cut bundles included; carts and the shipping pile excluded). */
export function trayValue(state: TrayState): number {
  return state.vault1000 * 1000 + state.boxes * 100 + state.cutBoxes * 100 + state.stagedRods * 10 + state.rods * 10 + state.packEntry * 10
    + state.cutBundles * 10 + state.stagedCrystals + state.crystals + state.pressEntry;
}

export function totalValue(state: TrayState): number {
  return trayValue(state) + state.shipped + state.carts.crystal + state.carts.rod * 10 + state.carts.box * 100;
}

export function trayErrors(state: TrayState): string[] {
  const errors: string[] = [];
  for (const field of ['boxes', 'rods', 'crystals', 'stagedCrystals', 'cutBundles', 'stagedRods', 'cutBoxes', 'shipped'] as const) {
    if (!Number.isInteger(state[field]) || state[field] < 0) errors.push(`${field} must be a nonnegative integer`);
  }
  if (state.boxes > 9 || state.rods > 9 || state.crystals > 9 || state.stagedCrystals > 10 || state.stagedRods > 10) errors.push('a place or tray is over capacity');
  if (state.pressEntry !== 0 && state.pressEntry !== 1) errors.push('press entry is invalid');
  if (state.packEntry !== 0 && state.packEntry !== 1) errors.push('packer entry is invalid');
  if (state.vault1000 !== 0 && state.vault1000 !== 1) errors.push('thousand vault is invalid');
  for (const [cart, stock] of Object.entries(state.carts)) if (!Number.isInteger(stock) || stock < 0) errors.push(`${cart} cart stock is invalid`);
  if (trayValue(state) > 1000) errors.push('tray exceeds one thousand');
  return errors;
}

/** Delivery rule (§3.8.2): the staging area is empty and nothing waits at a machine entry. */
export function readyToShip(state: TrayState): boolean {
  return state.pressEntry === 0 && state.packEntry === 0 && state.stagedCrystals === 0 && state.cutBundles === 0 && state.stagedRods === 0 && state.cutBoxes === 0;
}
/** Canonical = nothing in staging / at entries, ≤9 loose, ≤9 rods. */
export const isCanonical = (s: TrayState): boolean => readyToShip(s) && s.crystals <= 9 && s.rods <= 9 && s.boxes <= 9;

/** Illegal operations return null. Every accepted operation preserves totalValue. */
export function trayStep(state: TrayState, action: TrayAction): TrayState | null {
  const next = cloneTray(state);
  switch (action.op) {
    case 'pour': {
      if (next.carts[action.cart] <= 0) return null;
      if (action.cart === 'crystal') {
        if (next.crystals < 9) next.crystals++;
        else if (!next.pressEntry) next.pressEntry = 1;
        else return null;
      } else if (action.cart === 'rod') {
        if (next.rods < 9) next.rods++;
        else if (!next.packEntry) next.packEntry = 1;
        else return null;
      } else if (next.boxes < 9) next.boxes++;
      else if (next.boxes === 9 && next.vault1000 === 0) { next.boxes = 0; next.vault1000 = 1; }   // the 10th box fills the 千舱 (K2.3)
      else return null;
      next.carts[action.cart]--;
      break;
    }
    case 'press':
      if (next.crystals !== 9 || !next.pressEntry) return null;
      if (next.rods < 9) next.rods++;
      else if (!next.packEntry) next.packEntry = 1;
      else return null;
      next.crystals = 0;
      next.pressEntry = 0;
      break;
    case 'pack':
      if (next.rods !== 9 || !next.packEntry) return null;
      if (next.boxes < 9) next.boxes++;
      else if (next.boxes === 9 && next.vault1000 === 0) { next.boxes = 0; next.vault1000 = 1; }
      else return null;
      next.rods = 0;
      next.packEntry = 0;
      break;
    case 'cutRod':
      if (next.rods <= 0) return null;
      next.rods--;
      next.cutBundles++;
      break;
    case 'openBundle':
      if (next.cutBundles <= 0 || next.stagedCrystals > 0) return null;
      next.cutBundles--;
      next.stagedCrystals = 10;
      break;
    case 'moveStaged':
      if (next.stagedCrystals <= 0) return null;
      if (next.crystals < 9) next.crystals++;
      else if (!next.pressEntry) next.pressEntry = 1;
      else return null;
      next.stagedCrystals--;
      break;
    case 'cutBox':
      if (next.boxes <= 0) return null;
      next.boxes--;
      next.cutBoxes++;
      break;
    case 'openBoxBundle':
      if (next.cutBoxes <= 0 || next.stagedRods > 0) return null;
      next.cutBoxes--;
      next.stagedRods = 10;
      break;
    case 'moveStagedRod':
      if (next.stagedRods <= 0) return null;
      if (next.rods < 9) next.rods++;
      else if (!next.packEntry) next.packEntry = 1;
      else return null;
      next.stagedRods--;
      break;
    case 'ship': {
      if (action.part === 'crystal') {
        if (!next.crystals) return null;
        next.crystals--;
        next.shipped++;
      } else if (action.part === 'rod') {
        if (!next.rods) return null;
        next.rods--;
        next.shipped += 10;
      } else {
        if (!next.boxes) return null;
        next.boxes--;
        next.shipped += 100;
      }
      break;
    }
  }
  if (trayErrors(next).length || totalValue(next) !== totalValue(state)) return null;
  return next;
}

/** The tray holding `n` canonical (n ≤ 1000). */
export function canonicalParts(n: number): { vault: 0 | 1; boxes: number; rods: number; crystals: number } {
  if (n >= 1000) return { vault: 1, boxes: 0, rods: 0, crystals: 0 };
  return { vault: 0, boxes: Math.floor(n / 100), rods: Math.floor(n / 10) % 10, crystals: n % 10 };
}
/**
 * A tray holding value `n`. With `parts` that are not canonical (more than 9 of a kind: the "2 箱 13 棒 5 颗" mine-cart stock of K1.7) the
 * parts go on the carts (never an illegal TrayState); canonical parts are placed on the tray. Without parts: canonical placement.
 */
export function fromValue(n: number, parts?: { boxes?: number; rods?: number; crystals?: number }): TrayState {
  if (parts) {
    const b = parts.boxes ?? 0, r = parts.rods ?? 0, c = parts.crystals ?? 0;
    if (100 * b + 10 * r + c !== n) throw new Error('fromValue: parts do not add up');
    if (b > 9 || r > 9 || c > 9) return emptyTray({ box: b, rod: r, crystal: c });
    const t = emptyTray(); t.boxes = b; t.rods = r; t.crystals = c; return t;
  }
  const p = canonicalParts(n); const t = emptyTray(); t.vault1000 = p.vault; t.boxes = p.boxes; t.rods = p.rods; t.crystals = p.crystals; return t;
}
/** Run every legal press / pack (the machines' forced normalisation) until nothing moves. */
export function normalizeTray(state: TrayState): TrayState {
  let s = cloneTray(state);
  for (let i = 0; i < 40; i++) {
    const a = trayStep(s, { op: 'press' }) ?? trayStep(s, { op: 'pack' });
    if (!a) break;
    s = a;
  }
  return s;
}

// ---- undo log -----------------------------------------------------------------------------------------------------------------
export interface TrayLog { past: TrayState[] }
export const newLog = (): TrayLog => ({ past: [] });
/** Apply an action and remember the previous state. */
export function trayDo(log: TrayLog, state: TrayState, action: TrayAction): TrayState | null {
  const n = trayStep(state, action);
  if (!n) return null;
  log.past.push(cloneTray(state));
  return n;
}
export const trayUndo = (log: TrayLog, state: TrayState): TrayState => log.past.pop() ?? state;
export function trayReset(log: TrayLog, state: TrayState): TrayState { const first = log.past[0]; log.past.length = 0; return first ?? state; }
/** Self-check used by the stage in dev builds and by fuzz tests. */
export const checkTray = (s: TrayState): string[] => trayErrors(s);
/** Legal actions from a state (for bots / fuzz). */
export function legalActions(s: TrayState): TrayAction[] {
  const out: TrayAction[] = [];
  const all: TrayAction[] = [
    { op: 'pour', cart: 'crystal' }, { op: 'pour', cart: 'rod' }, { op: 'pour', cart: 'box' }, { op: 'press' }, { op: 'pack' }, { op: 'cutRod' }, { op: 'openBundle' }, { op: 'moveStaged' },
    { op: 'cutBox' }, { op: 'openBoxBundle' }, { op: 'moveStagedRod' }, { op: 'ship', part: 'crystal' }, { op: 'ship', part: 'rod' }, { op: 'ship', part: 'box' },
  ];
  for (const a of all) if (trayStep(s, a)) out.push(a);
  return out;
}
