import { describe, expect, it } from 'vitest';
import { emptyTray, readyToShip, totalValue, trayErrors, trayStep, trayValue, type TrayAction, type TrayState } from './tray';

function act(state: TrayState, action: TrayAction): TrayState {
  const result = trayStep(state, action);
  expect(result).not.toBeNull();
  return result!;
}

describe('crystal tray', () => {
  it('packs the tenth crystal into a rod without changing the total', () => {
    let state = emptyTray({ crystal: 10 });
    for (let i = 0; i < 10; i++) state = act(state, { op: 'pour', cart: 'crystal' });
    expect(state.crystals).toBe(9);
    expect(state.pressEntry).toBe(1);
    expect(readyToShip(state)).toBe(false);
    state = act(state, { op: 'press' });
    expect(state.rods).toBe(1);
    expect(trayValue(state)).toBe(10);
    expect(totalValue(state)).toBe(10);
    expect(readyToShip(state)).toBe(true);
  });

  it('cuts two rods into visible groups while keeping their value', () => {
    let state = emptyTray();
    state.rods = 6;
    state.crystals = 3;
    state = act(state, { op: 'cutRod' });
    state = act(state, { op: 'cutRod' });
    expect(state.rods).toBe(4);
    expect(state.cutBundles).toBe(2);
    expect(trayValue(state)).toBe(63);
    state = act(state, { op: 'openBundle' });
    expect(state.stagedCrystals).toBe(10);
    expect(readyToShip(state)).toBe(false);
  });

  it('packs ten rods into a box, and can ship parts', () => {
    let state = emptyTray({ rod: 10 });
    for (let i = 0; i < 10; i++) state = act(state, { op: 'pour', cart: 'rod' });
    state = act(state, { op: 'pack' });
    expect(state.boxes).toBe(1);
    state = act(state, { op: 'ship', part: 'box' });
    expect(state.shipped).toBe(100);
    expect(totalValue(state)).toBe(100);
  });

  it('rejects overflowing carts and invalid moves', () => {
    const state = emptyTray({ crystal: 12 });
    expect(trayStep(state, { op: 'press' })).toBeNull();
    for (let i = 0, next = state; i < 10; i++) {
      next = act(next, { op: 'pour', cart: 'crystal' });
      if (i === 9) expect(trayStep(next, { op: 'pour', cart: 'crystal' })).toBeNull();
    }
    expect(trayErrors(state)).toEqual([]);
  });
});
