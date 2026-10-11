export type CartId = 'crystal' | 'rod' | 'box';

export interface TrayState {
  boxes: number;
  rods: number;
  crystals: number;
  pressEntry: 0 | 1;
  packEntry: 0 | 1;
  stagedCrystals: number;
  cutBundles: number;
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
  | { op: 'ship'; part: CartId };

export function emptyTray(carts: Partial<Record<CartId, number>> = {}): TrayState {
  return {
    boxes: 0, rods: 0, crystals: 0, pressEntry: 0, packEntry: 0,
    stagedCrystals: 0, cutBundles: 0, shipped: 0, vault1000: 0,
    carts: { crystal: carts.crystal ?? 0, rod: carts.rod ?? 0, box: carts.box ?? 0 },
  };
}

export function trayValue(state: TrayState): number {
  return state.vault1000 * 1000 + state.boxes * 100 + state.rods * 10 + state.packEntry * 10 + state.crystals + state.pressEntry + state.stagedCrystals + state.cutBundles * 10;
}

export function totalValue(state: TrayState): number {
  return trayValue(state) + state.shipped + state.carts.crystal + state.carts.rod * 10 + state.carts.box * 100;
}

export function trayErrors(state: TrayState): string[] {
  const errors: string[] = [];
  for (const field of ['boxes', 'rods', 'crystals', 'stagedCrystals', 'cutBundles', 'shipped'] as const) {
    if (!Number.isInteger(state[field]) || state[field] < 0) errors.push(`${field} must be a nonnegative integer`);
  }
  if (state.boxes > 9 || state.rods > 9 || state.crystals > 9 || state.stagedCrystals > 10) errors.push('a place or tray is over capacity');
  if (state.pressEntry !== 0 && state.pressEntry !== 1) errors.push('press entry is invalid');
  if (state.packEntry !== 0 && state.packEntry !== 1) errors.push('packer entry is invalid');
  if (state.vault1000 !== 0 && state.vault1000 !== 1) errors.push('thousand vault is invalid');
  for (const [cart, stock] of Object.entries(state.carts)) if (!Number.isInteger(stock) || stock < 0) errors.push(`${cart} cart stock is invalid`);
  if (trayValue(state) > 1000) errors.push('tray exceeds one thousand');
  return errors;
}

export function readyToShip(state: TrayState): boolean {
  return state.pressEntry === 0 && state.packEntry === 0 && state.stagedCrystals === 0 && state.cutBundles === 0;
}

/** Illegal operations leave the model untouched. Every accepted operation preserves totalValue. */
export function trayStep(state: TrayState, action: TrayAction): TrayState | null {
  const next: TrayState = { ...state, carts: { ...state.carts } };
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
