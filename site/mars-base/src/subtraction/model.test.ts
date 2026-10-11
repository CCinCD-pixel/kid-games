import { describe, expect, it } from 'vitest';
import { emptyTray, readyToShip, trayStep, trayValue, type TrayState } from '@engines/manip/tray';
import { SUBTRACTION_NODES, makeSubtractionItems } from './model';

describe('C3 subtraction bank', () => {
  it('builds eight reproducible stations with unique, valid questions', () => {
    expect(SUBTRACTION_NODES).toHaveLength(8);
    for (const node of SUBTRACTION_NODES) for (let seed = 0; seed < 80; seed++) {
      const items = makeSubtractionItems(node, seed);
      expect(items).toEqual(makeSubtractionItems(node, seed));
      expect(items).toHaveLength(node.kind === 'boss' ? 8 : 6);
      expect(new Set(items.map((item) => item.id)).size).toBe(items.length);
      for (const item of items) {
        expect(item.a).toBeGreaterThan(item.b);
        expect(item.a).toBeLessThan(100);
        expect(item.b).toBeGreaterThan(0);
        expect(item.answer).toBe(item.a - item.b);
        if (item.family === 'sub.borrow1' || item.family === 'col.sub') expect(item.borrow).toBe(true);
        if (item.family === 'sub.thinkAdd') expect(item.answer).toBeLessThanOrEqual(9);
        if (item.family === 'sub.compensate') expect(item.rounded! - item.b).toBeLessThanOrEqual(2);
      }
    }
  });

  it('lets every tray order be shipped and normalized with the shared crystal engine', () => {
    for (const node of SUBTRACTION_NODES) for (let seed = 0; seed < 80; seed++) {
      for (const item of makeSubtractionItems(node, seed).filter((entry) => entry.strategy === 'tray')) {
        let state: TrayState = emptyTray();
        state.rods = Math.floor(item.a / 10);
        state.crystals = item.a % 10;
        for (let i = 0; i < Math.floor(item.b / 10); i++) state = trayStep(state, { op: 'ship', part: 'rod' })!;
        for (let i = 0; i < item.b % 10; i++) {
          if (!state.crystals && !state.stagedCrystals) {
            state = trayStep(state, { op: 'cutRod' })!;
            state = trayStep(state, { op: 'openBundle' })!;
          }
          if (!state.crystals) state = trayStep(state, { op: 'moveStaged' })!;
          state = trayStep(state, { op: 'ship', part: 'crystal' })!;
        }
        while (state.stagedCrystals) state = trayStep(state, { op: 'moveStaged' })!;
        expect(state.shipped, item.id).toBe(item.b);
        expect(trayValue(state), item.id).toBe(item.answer);
        expect(readyToShip(state), item.id).toBe(true);
      }
    }
  });
});
