/** V10(a) pure-layout half: regions pairwise disjoint, inside the usable rect, tap targets, lens clearance, stage slack, key sizes. Spec §2.2. */
import { describe, expect, it } from 'vitest';
import { ACCEPTANCE, KIT_BACK, checkLayout, classOf, computeLayout, keyGeometry, layoutVars, slackOf, vpOf, type LayoutKind } from '../src/app/layout';

describe('computeLayout (pure)', () => {
  for (const a of ACCEPTANCE) for (const ins of a.ins) for (const kind of ['keypad', 'folded'] as LayoutKind[]) {
    it(`${a.name} insets(${ins.t},${ins.r},${ins.b},${ins.l}) ${kind}: no overlap, inside, ≥44/56 taps, stage slack ≥ 8`, () => {
      const L = computeLayout(a.vp, ins, kind);
      expect(checkLayout(L, a.vp, kind)).toEqual([]);
      expect(L.reg.kitBack).toMatchObject({ w: KIT_BACK, h: KIT_BACK });
      expect(L.reg.kitBack.x).toBe(Math.max(a.vp.cls.startsWith('phone') ? (a.vp.w <= 320 ? 12 : 16) : 16, ins.l));
      expect(L.reg.kitBack.y).toBe(Math.max(12, ins.t));
      expect(slackOf(L, a.vp, kind)).toBeGreaterThanOrEqual(8);
      if (kind === 'keypad') { const k = keyGeometry(L, a.vp)!; expect(k.w).toBeGreaterThanOrEqual(a.vp.cls.startsWith('phone') ? 44 : 72); }
      // the CSS variables are derived from the same rectangles
      const v = layoutVars(L, a.vp); expect(v['--mb-stage-h']).toBe(`${L.reg.stage.h}px`);
    });
  }
  it('class boundaries follow the platform rule (shorter side < 600 = phone)', () => {
    expect(classOf(390, 664)).toBe('phone-p'); expect(classOf(844, 390)).toBe('phone-l'); expect(classOf(810, 1080)).toBe('ipad-p'); expect(classOf(1080, 810)).toBe('ipad-l'); expect(classOf(599, 900)).toBe('phone-p');
  });
  it('prototype numbers (stage W×H) are reproduced', () => {
    const z = { t: 0, r: 0, b: 0, l: 0 };
    const stage = (w: number, h: number, kind: LayoutKind, ins = z) => { const s = computeLayout(vpOf(w, h), ins, kind).reg.stage; return `${Math.round(s.w)}×${Math.round(s.h)}`; };
    expect(stage(810, 1080, 'keypad')).toBe('778×392'); expect(stage(810, 1080, 'folded')).toBe('778×694'); expect(stage(1080, 810, 'keypad')).toBe('632×518');
    expect(stage(390, 664, 'keypad')).toBe('358×276'); expect(stage(390, 664, 'folded')).toBe('358×428'); expect(stage(320, 568, 'keypad')).toBe('296×198'); expect(stage(320, 568, 'folded')).toBe('296×344');
    expect(stage(844, 390, 'keypad')).toBe('450×284'); expect(stage(844, 390, 'folded')).toBe('586×284');
  });
});
