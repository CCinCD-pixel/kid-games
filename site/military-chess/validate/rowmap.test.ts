/**
 * S2 学堂 map spacing (regression: in landscape with the item strip open the 600×600 map box put
 * 保护军旗 and 布阵 ~90 px apart on the kit sine road and their labels collided). Near-square boxes now
 * use the serpentine `rowPoints`; every node keeps its icon badge (above), stars and name pill
 * (below) clear of every other node and inside the box.
 */
import { describe, expect, test } from 'vitest';
import { rowPoints } from '../src/view/rowmap-geom';

/** the S2 boxes that take the serpentine (w/h < 1.3): landscape strip open, portrait strip closed */
const BOXES = [
  { name: 'landscape, strip open', w: 600, h: 600, pad: 78 },
  { name: 'portrait, strip closed', w: 770, h: 800, pad: 64 },
];
/** footprint of a node with its labels: the longest name pill 炸弹、地雷和军旗 ≈ 164 px wide;
 *  icon badge 30 px above + 96 px current node + stars and pill ≈ 160 px tall */
const FOOT_W = 170;
const FOOT_H = 160;

describe('S2 lesson map geometry', () => {
  for (const b of BOXES) {
    test(`${b.name}: 9 nodes never overlap and stay in the box`, () => {
      const { pts, rows, cols } = rowPoints(b.w, b.h, 9, { pad: b.pad });
      expect(rows * cols).toBeGreaterThanOrEqual(9);
      for (let i = 0; i < pts.length; i++) {
        const [x, y] = pts[i];
        expect(x).toBeGreaterThanOrEqual(b.pad - 0.5);
        expect(x).toBeLessThanOrEqual(b.w - b.pad + 0.5);
        expect(y - 48 - 30).toBeGreaterThanOrEqual(0); // icon badge above the biggest node
        expect(y + 48 + 50).toBeLessThanOrEqual(b.h); // stars + name pill below
        for (let j = i + 1; j < pts.length; j++) {
          const dx = Math.abs(pts[j][0] - x), dy = Math.abs(pts[j][1] - y);
          expect(dx >= FOOT_W || dy >= FOOT_H, `nodes ${i} and ${j}: dx ${dx.toFixed(0)} dy ${dy.toFixed(0)}`).toBe(true);
        }
      }
    });
  }

  test('the road visits the nodes in lesson order (serpentine rows)', () => {
    const { pts, cols } = rowPoints(600, 600, 9, { pad: 78 });
    for (let i = 0; i + 1 < pts.length; i++) {
      const sameRow = Math.floor(i / cols) === Math.floor((i + 1) / cols);
      if (sameRow) expect(Math.abs(pts[i + 1][0] - pts[i][0])).toBeGreaterThan(150);
      else expect(Math.abs(pts[i + 1][0] - pts[i][0])).toBeLessThan(1); // U-turn: same column
    }
  });
});
