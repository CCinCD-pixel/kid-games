// Sand-table geometry: the iPad grid of spec §2.2 is unchanged; phones in landscape (Dad's phone, 2026-10-08) get the
// board between the tray column and the tools column with ≥ 44-px cells; a phone held upright never yields a broken
// (negative) board under its 把手机横过来玩 card.
import { describe, expect, it } from 'vitest';
import { makeGeo, phoneTrayW, PHONE } from './board';

describe('makeGeo', () => {
  it('iPad 9 landscape and portrait: the spec §2.2 grid, as before', () => {
    const l = makeGeo(1080, 810, 0, 2);
    expect([l.phone, l.w, l.h, l.by, l.bx]).toEqual([false, 110, 95, 164, Math.round((1080 - Math.round(9.52 * 110)) / 2)]);
    const p = makeGeo(810, 1080, 0, 2);
    expect([p.phone, p.w, p.h, p.by]).toEqual([false, 82, 78, 172]);
    // without phone insets a short landscape window keeps the old formula (other callers)
    expect(makeGeo(844, 390, 0, 3).phone).toBe(false);
  });
  for (const [W, H, l, r, cols] of [[844, 390, 0, 0, 1], [844, 390, 47, 47, 2], [667, 375, 0, 0, 1], [667, 375, 0, 0, 2], [568, 320, 0, 0, 2]] as const) {
    it(`phone landscape ${W}×${H} (insets ${l}/${r}, ${cols} tray column${cols > 1 ? 's' : ''}): big board, ≥ 44-px cells, clear of both columns`, () => {
      const g = makeGeo(W, H, 0, 3, { l, r, b: 0, trayCols: cols });
      expect(g.phone).toBe(true);
      if (H >= 375) { expect(g.w).toBeGreaterThanOrEqual(44); expect(g.h).toBeGreaterThanOrEqual(44); }
      expect(g.h).toBeGreaterThanOrEqual(Math.round(0.86 * g.w)); expect(g.h).toBeLessThanOrEqual(g.w);
      const fw = 8; const left = Math.max(8, l + 4) + phoneTrayW(cols); const right = W - Math.max(8, r + 4) - PHONE.tools;
      expect(g.bx - fw).toBeGreaterThanOrEqual(left); expect(g.bx + g.bw + fw).toBeLessThanOrEqual(right);
      expect(g.by - fw).toBeGreaterThanOrEqual(PHONE.top); expect(g.by + g.bh + fw).toBeLessThanOrEqual(H - 6);
      expect(g.x0).toBe(g.bx + g.wallW); expect(g.bh).toBe(5 * g.h);
    });
  }
  it('844×390 with one tray column: the board takes about half the screen', () => {
    const g = makeGeo(844, 390, 0, 3, { l: 0, r: 0, b: 0, trayCols: 1 });
    expect((g.bw * g.bh) / (844 * 390)).toBeGreaterThan(0.5);
  });
  it('a phone held upright (covered by 把手机横过来玩) still gets a sane board', () => {
    for (const [W, H] of [[390, 664], [320, 568]]) { const g = makeGeo(W, H, 0, 3, { l: 0, r: 0, b: 0, trayCols: 1 }); expect(g.phone).toBe(false); expect(g.w).toBeGreaterThan(0); expect(g.h).toBeGreaterThan(0); expect(g.bw).toBeLessThanOrEqual(W); }
  });
});
