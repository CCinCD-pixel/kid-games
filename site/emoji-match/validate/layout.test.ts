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
  // Dad's feedback 2026-10-08: phones. Safari (390×664, 320×568, 844×390) and the home-screen app with
  // its safe areas (390×844 T47 B34, 844×390 L/R 47 B21); every level × toolbar 0–3 buttons
  it('phones: inside, apart, clear of 🏠, tap targets ≥ 44, cells ≥ 30', () => {
    const errs: string[] = [];
    const views: [number, number, number, number, number, number][] = [[390, 664, 0, 0, 0, 0], [320, 568, 0, 0, 0, 0], [844, 390, 0, 0, 0, 0], [390, 844, 47, 34, 0, 0], [844, 390, 0, 21, 47, 47], [375, 667, 20, 0, 0, 0]];
    for (const d of LEVELS) for (const [vw, vh, T, B, Lft, R] of views) for (const nTools of [0, 1, 2, 3]) {
      const l = playLayout({ vw, vh, T, B, Lft, R, cols: d.grid[0].length, rows: d.grid.length, tools: nTools > 0, nTools, goals: d.objectives.length, dock: !!d.exits?.length });
      const tag = `${d.id} ${vw}x${vh} T${T} B${B} L${Lft} tools${nTools}`;
      if (l.size !== 'phone') errs.push(`${tag}: not phone`);
      const named: [string, Rect][] = [['home', l.home], ['panel', l.panel], ['moves', l.moves], ['pause', l.pause], ['sub', l.sub], ['head', l.head], ['chip', l.chip], ...l.goals.map((g, k) => [`goal${k}`, g] as [string, Rect]), ...l.toolBtns.map((t, k) => [`tool${k}`, t] as [string, Rect])];
      for (const [n, r] of named) if (!inside(r, vw, vh)) errs.push(`${tag}: ${n} outside`);
      for (let a = 0; a < named.length; a += 1) for (let b = a + 1; b < named.length; b += 1) if (intersects(named[a][1], named[b][1])) errs.push(`${tag}: ${named[a][0]} × ${named[b][0]}`);
      for (const [n, r] of [['pause', l.pause], ...l.toolBtns.map((t, k) => [`tool${k}`, t])] as [string, Rect][]) if (r.w < 44 || r.h < 44) errs.push(`${tag}: ${n} ${r.w}x${r.h}`);
      if (l.sub.h < 48 || l.sub.w < 160) errs.push(`${tag}: subtitle lane ${l.sub.w}x${l.sub.h}`);
      if (l.cell < 30 || l.tooSmall) errs.push(`${tag}: cell ${l.cell}`);
      if (l.chip.w < 100) errs.push(`${tag}: chip ${l.chip.w}`);
    }
    expect(errs.slice(0, 12)).toEqual([]);
  });
  it('phones: 9×9 on an iPhone 13 ≥ 36 px cells, 7×7 ≥ 48', () => {
    expect(playLayout({ vw: 390, vh: 664, T: 0, B: 0, cols: 9, rows: 9, tools: true, nTools: 3, goals: 2 }).cell).toBeGreaterThanOrEqual(36);
    expect(playLayout({ vw: 390, vh: 664, T: 0, B: 0, cols: 7, rows: 7, tools: true, nTools: 3, goals: 2 }).cell).toBeGreaterThanOrEqual(48);
    expect(playLayout({ vw: 844, vh: 390, T: 0, B: 0, cols: 9, rows: 9, tools: true, nTools: 3, goals: 2 }).cell).toBeGreaterThanOrEqual(36);
  });
  it('spec numbers: portrait 9×9 = 78, landscape 9×9 = 80, 8×8 = 88, 7×7 = 96', () => {
    expect(playLayout({ vw: 810, vh: 1080, T: 24, B: 0, cols: 9, rows: 9, tools: true, goals: 2 }).cell).toBe(78);
    expect(playLayout({ vw: 1080, vh: 810, T: 24, B: 0, cols: 9, rows: 9, tools: true, goals: 2 }).cell).toBe(80);
    expect(playLayout({ vw: 810, vh: 1080, T: 24, B: 0, cols: 8, rows: 8, tools: true, goals: 2 }).cell).toBe(88);
    expect(playLayout({ vw: 810, vh: 1080, T: 24, B: 0, cols: 7, rows: 7, tools: true, goals: 2 }).cell).toBe(96);
  });
});
