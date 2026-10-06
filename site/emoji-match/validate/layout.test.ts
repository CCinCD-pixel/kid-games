/** V15 layout (spec §2.3, §9.2): every rect inside the viewport, no two overlapping, cell minimums. */
import { describe, expect, it } from 'vitest';
import { LEVELS } from '../src/content';
import { inside, intersects, playLayout, type Rect } from '../src/view/layout';

describe('V15 layout', () => {
  const cases: [string, number, number, number, number, boolean][] = [];
  for (const d of LEVELS) for (const [vw, vh] of [[810, 1080], [1080, 810]]) for (const T of [20, 24]) for (const B of [0, 20]) for (const tools of [false, true]) cases.push([d.id, vw, vh, T, B, tools]);
  it(`${cases.length} combinations`, () => {
    const errs: string[] = [];
    for (const [id, vw, vh, T, B, tools] of cases) {
      const d = LEVELS.find((x) => x.id === id)!;
      const l = playLayout({ vw, vh, T, B, cols: d.grid[0].length, rows: d.grid.length, tools, goals: d.objectives.length, dock: !!d.exits?.length });
      const homeCorner: Rect = { x: 0, y: 0, w: 12 + 56, h: T + 12 + 56 };
      const named: [string, Rect][] = [['panel', l.panel], ['moves', l.moves], ['pause', l.pause], ['sub', l.sub], ['head', l.head], ['chip', l.chip], ...l.goals.map((g, k) => [`goal${k}`, g] as [string, Rect]), ...l.toolBtns.map((t, k) => [`tool${k}`, t] as [string, Rect])];
      for (const [n, r] of named) {
        if (!inside(r, vw, vh)) errs.push(`${id} ${vw}x${vh} T${T} B${B} ${tools}: ${n} outside`);
        if (intersects(r, homeCorner)) errs.push(`${id} ${vw}x${vh}: ${n} in the 🏠 corner`);
      }
      for (let a = 0; a < named.length; a += 1) for (let b = a + 1; b < named.length; b += 1) if (intersects(named[a][1], named[b][1])) errs.push(`${id} ${vw}x${vh} T${T} B${B} ${tools}: ${named[a][0]} × ${named[b][0]}`);
      const big = d.grid.length >= 9 || d.grid[0].length >= 9;
      if (big && vw < vh && l.cell < 76) errs.push(`${id} portrait 9x9 cell ${l.cell}`);
      if (big && vw > vh && l.cell < 80) errs.push(`${id} landscape 9x9 cell ${l.cell}`);
      if (l.sub.h < 56) errs.push(`${id} ${vw}x${vh} subtitle lane ${l.sub.h}`);
    }
    expect(errs.slice(0, 12)).toEqual([]);
  });
  it('spec numbers: portrait 9×9 = 78, landscape 9×9 = 80, 8×8 = 88, 7×7 = 96', () => {
    expect(playLayout({ vw: 810, vh: 1080, T: 24, B: 0, cols: 9, rows: 9, tools: true, goals: 2 }).cell).toBe(78);
    expect(playLayout({ vw: 1080, vh: 810, T: 24, B: 0, cols: 9, rows: 9, tools: true, goals: 2 }).cell).toBe(80);
    expect(playLayout({ vw: 810, vh: 1080, T: 24, B: 0, cols: 8, rows: 8, tools: true, goals: 2 }).cell).toBe(88);
    expect(playLayout({ vw: 810, vh: 1080, T: 24, B: 0, cols: 7, rows: 7, tools: true, goals: 2 }).cell).toBe(96);
  });
});
