import { describe, expect, test } from 'vitest';
import { createRng } from '@kit/rng';
import { BLUE, RED, SLOTS, isHQ, slotToIndex } from '../src/core/board';
import { LAYOUT_STYLES, aiLayout, applyHandicap, gridToLayout, layoutToGrid, mirrorLayout, placementRule, randomLayout, swapSlots, validateLayout } from '../src/core/layout';
import { setupStandard } from '../src/core/state';
import { TEMPLATES, T } from './helpers';

const bad = (rows: string[]) => validateLayout(gridToLayout(rows));

describe('deployment (spec §3.4 R3)', () => {
  test('all 6 templates are legal; the 3 kid templates come first', () => {
    for (const t of TEMPLATES) expect(validateLayout(t.layout), t.id).toEqual([]);
    expect(TEMPLATES.slice(0, 3).map((t) => t.id)).toEqual(['balanced', 'fortress', 'lightning']);
    expect(TEMPLATES.slice(0, 3).every((t) => t.kid)).toBe(true);
  });
  test('grid round trip', () => {
    for (const t of TEMPLATES) expect(gridToLayout(layoutToGrid(t.layout))).toBe(t.layout);
    expect(layoutToGrid(T('balanced'))).toEqual(['52736', '9+B+8', '41+37', '1+6+5', '2M41B', 'MFM32']);
  });
  test('error codes', () => {
    expect(bad(['52736', '9+B+8', '41+37', '1+6+5', '2M41B', 'MFM32'])).toEqual([]);
    expect(bad(['B2736', '9+5+8', '41+37', '1+6+5', '2M41B', 'MFM32'])).toContain('bomb-front-row');
    expect(bad(['52736', '9+B+8', '4M+37', '1+6+5', '2141B', 'MFM32'])).toContain('mine-row-3');
    expect(bad(['52736', '9+B+8', '41+37', '1+6+5', '2M41B', 'FMM32'])).toContain('flag-not-in-hq');
    expect(validateLayout('123')).toEqual(['length']);
    expect(validateLayout(T('balanced').replace('5', 'X'))).toContain('bad-code');
    expect(validateLayout(T('balanced').replace('5', '4'))).toEqual(expect.arrayContaining(['count-团长-1', 'count-营长-3']));
  });
  test('handicap: "." blanks only for the removed pieces', () => {
    const h = applyHandicap(T('balanced'), '98');
    expect(h.split('.').length - 1).toBe(2);
    expect(validateLayout(h, '98')).toEqual([]);
    expect(validateLayout(h)).toContain('handicap');
    expect(validateLayout(h, '9')).toContain('handicap');
    expect(validateLayout(applyHandicap(T('balanced'), 'F'), 'F')).toContain('handicap');
  });
  test('placementRule mirrors the validator for single placements', () => {
    const front = SLOTS.findIndex(([r]) => r === 1);
    expect(placementRule('B', front)).toBe('bomb');
    expect(placementRule('M', front)).toBe('mine');
    expect(placementRule('F', front)).toBe('flag');
    const hq = SLOTS.findIndex(([r, c]) => isHQ(slotToIndex(RED, r, c)));
    expect(placementRule('F', hq)).toBeNull();
    expect(placementRule('9', front)).toBeNull();
  });
  test('mirror keeps legality and is an involution', () => {
    for (const t of TEMPLATES) {
      expect(validateLayout(mirrorLayout(t.layout))).toEqual([]);
      expect(mirrorLayout(mirrorLayout(t.layout))).toBe(t.layout);
    }
  });
  test('swapSlots swaps', () => {
    expect(swapSlots('ab' + 'c'.repeat(23), 0, 1).slice(0, 2)).toBe('ba');
  });
  test('2 000 random layouts are legal', () => {
    const rng = createRng(7);
    for (let k = 0; k < 2000; k++) expect(validateLayout(randomLayout(rng.next))).toEqual([]);
  });
  test('the same layout string is legal for RED and BLUE (BLUE = RED rotated 180°)', () => {
    const s = setupStandard('ming', { red: T('fortress'), blue: T('fortress') });
    for (let p = 0; p < 25; p++) {
      const b = p + 25;
      expect(s.ptype[p]).toBe(s.ptype[b]);
      expect(s.ppos[p] + s.ppos[b]).toBe(59);
    }
    expect(s.pside[30]).toBe(BLUE);
  });
  test('aiLayout: 1 000 seeds legal, flag left 45–55 %, ≥8 mine shapes, most common ≤25 %', () => {
    let left = 0;
    const shapes = new Map<string, number>();
    const flagLeftK = SLOTS.findIndex(([r, c]) => r === 6 && c === 2);
    for (let seed = 0; seed < 1000; seed++) {
      const style = Object.values(LAYOUT_STYLES)[seed % 4];
      const l = aiLayout(style, createRng('mc:deploy:' + seed + ':1').next);
      expect(validateLayout(l)).toEqual([]);
      if (l[flagLeftK] === 'F') left++;
      const key = [...l].map((ch, k) => (ch === 'M' ? k : -1)).filter((k) => k >= 0).join(',');
      shapes.set(key, (shapes.get(key) ?? 0) + 1);
    }
    expect(left / 1000).toBeGreaterThanOrEqual(0.45);
    expect(left / 1000).toBeLessThanOrEqual(0.55);
    expect(shapes.size).toBeGreaterThanOrEqual(8);
    expect(Math.max(...shapes.values()) / 1000).toBeLessThanOrEqual(0.25);
  });
});
