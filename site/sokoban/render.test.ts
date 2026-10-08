/**
 * Palette gates (spec §6.2: the same Machado 2009 + CIEDE2000 maths as palette.py; numbers within
 * 0.1 of the prototype), screen layout formula (§2.2) and gesture classification (§3.2).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { classify, swipeDir } from './src/input/boardInput';
import { HALLS } from './src/render/halls';
import { HEADROOM, WALL_H, boardGeom, mapLayout, playLayout, topWallPixel } from './src/render/layout';
import { CRATES, ROBOT, SIGNAL } from './src/render/palette';
import { VISIONS, deltaE, paletteGates, worstDeltaE, type Vision } from './src/dev/colour';

// colour science (port of palette.py): shared with the browser pixel test (site/sokoban/tests)
const de = (a: string, b: string, mode: Vision = 'normal') => deltaE(a, b, mode);
const worst = (a: string, b: string, modes: readonly Vision[] = VISIONS) => worstDeltaE(a, b, modes);
const MODES = VISIONS;

describe('palette gates (spec §6.2)', () => {
  const crates = CRATES.slice(0, 4); // supply, fuel, water, seed (purple is reserved)
  const floors = Object.values(HALLS).flatMap((h) => [h.floorA, h.floorB]);
  it('reproduces palette.py within 0.1', () => {
    expect(worst(CRATES[0].top, CRATES[1].top)).toBeCloseTo(12.2, 1);
    expect(worst(CRATES[2].top, CRATES[3].top)).toBeCloseTo(12.3, 1);
    expect(de(ROBOT.body, '#F4E7CD')).toBeCloseTo(24.1, 1);
    expect(de(ROBOT.body, CRATES[0].top)).toBeCloseTo(22.0, 1);
    expect(worst(ROBOT.body, CRATES[0].top, MODES.slice(1))).toBeCloseTo(18.6, 1);
  });
  it('G-crate: crate tops pairwise ≥ 12 in all four visions', () => {
    for (let i = 0; i < crates.length; i += 1) for (let j = i + 1; j < crates.length; j += 1) expect(worst(crates[i].top, crates[j].top)).toBeGreaterThanOrEqual(12);
  });
  it('G-floor: crates vs every hall floor ≥ 20 normal / ≥ 12 colour-blind', () => {
    for (const c of crates) for (const f of floors) for (const col of [c.top, c.front]) {
      expect(de(col, f)).toBeGreaterThanOrEqual(20);
      expect(worst(col, f, MODES.slice(1))).toBeGreaterThanOrEqual(12);
    }
  });
  it('G-robot: robot body vs crates ≥ 20 / ≥ 12 and vs floors ≥ 20', () => {
    for (const c of crates) for (const col of [c.top, c.front]) {
      expect(de(ROBOT.body, col)).toBeGreaterThanOrEqual(20);
      expect(worst(ROBOT.body, col, MODES.slice(1))).toBeGreaterThanOrEqual(12);
    }
    for (const f of floors) expect(de(ROBOT.body, f)).toBeGreaterThanOrEqual(20);
  });
  it('the shared gate function agrees (it also runs on rendered pixels in the browser test)', () => {
    const r = paletteGates({ crateTop: CRATES.map((c) => c.top), crateFront: CRATES.map((c) => c.front), robotBody: ROBOT.body, floors, signals: [SIGNAL] });
    expect(r.failures).toEqual([]);
    if (process.env.SOK_REPORT) {
      // spec §6.7.3: keep the gate margins on file (tools/sokoban/check-levels.mjs sets SOK_REPORT)
      const dir = path.join(os.homedir(), 'kid-games-work/reports/sokoban');
      fs.mkdirSync(dir, { recursive: true });
      const w = r.worst;
      fs.writeFileSync(path.join(dir, 'palette.txt'), [
        `星港搬运工 — palette gates (spec §6.2; Machado 2009 + CIEDE2000), ${new Date().toISOString()}`,
        `G-crate  crate tops pairwise, worst of 4 visions ≥ 12:          ${w.crate.toFixed(1)}`,
        `G-floor  crates vs hall floors ≥ 20 normal / ≥ 12 colour-blind: ${w.floor.toFixed(1)} / ${w.floorCvd.toFixed(1)}`,
        `G-robot  robot vs crates ≥ 20 / ≥ 12; vs floors ≥ 20:           ${w.robot.toFixed(1)} / ${w.robotCvd.toFixed(1)}; ${w.robotFloor.toFixed(1)}`,
        `G-signal night-blue signals vs crates, robot, floors ≥ 20:      ${w.signal.toFixed(1)}`,
        'Rendered pixels: site/sokoban/tests/sokoban.spec.ts "palette" (same gates on what the renderers draw).',
        '',
      ].join('\n'));
    }
  });
  it('G-signal: night-blue signals ≥ 20 against crates, robot and floors', () => {
    const targets = [...crates.flatMap((c) => [c.top, c.front]), ROBOT.body, ...floors];
    expect(Math.min(...targets.map((t) => de(SIGNAL, t)))).toBeGreaterThanOrEqual(20);
  });
});

describe('layout (spec §2.2)', () => {
  const T = 24;
  it('cell sizes match the spec table (T = 24)', () => {
    const p = playLayout(810, 1080, T);
    const l = playLayout(1080, 810, T);
    expect([p.board.x, p.board.y, p.board.w, p.board.h]).toEqual([16, T + 84, 778, 808 - T]);
    expect([l.board.x, l.board.y, l.board.w, l.board.h]).toEqual([16, T + 84, 808, 710 - T]);
    const cell = (area: typeof p.board, W: number, H: number) => boardGeom(area, W, H).s;
    expect([cell(p.board, 10, 10), cell(p.board, 9, 10), cell(p.board, 8, 8), cell(p.board, 9, 7), cell(p.board, 7, 5)]).toEqual([72, 72, 89, 82, 96]);
    expect([cell(l.board, 10, 10), cell(l.board, 9, 10), cell(l.board, 8, 8), cell(l.board, 9, 7)]).toEqual([63, 63, 78, 85]);
  });
  it('action slots and the companion strip sit where the spec puts them', () => {
    const p = playLayout(810, 1080, T);
    expect(p.actions.undo).toEqual({ x: 16, y: 994, w: 168, h: 76 });
    expect(p.actions.redo.x).toBe(196);
    expect(p.actions.restart.x).toBe(284);
    expect(p.actions.map.x).toBe(718);
    expect(p.side).toEqual({ x: 16, y: 900, w: 778, h: 72 });
    const l = playLayout(1080, 810, T);
    expect(l.actions.undo).toEqual({ x: 840, y: 718, w: 140, h: 76 });
    expect(l.actions.redo.x).toBe(988);
    expect(l.actions.restart).toEqual({ x: 840, y: 634, w: 106, h: 76 });
    expect(l.actions.map.x).toBe(958);
  });
  it('every board size: cell ≥ 48, the top wall clears the HUD, the shadow fits the canvas', () => {
    for (const [w, h] of [[810, 1080], [1080, 810]]) {
      const g = playLayout(w, h, T);
      for (const [W, H] of [[7, 5], [8, 8], [9, 7], [9, 10], [10, 10]]) {
        const b = boardGeom(g.board, W, H);
        expect(b.s).toBeGreaterThanOrEqual(48);
        expect(topWallPixel(b)).toBeGreaterThanOrEqual(g.hud.y + g.hud.h);
        expect(b.canvas.y + b.canvas.h).toBeLessThanOrEqual(g.board.y + g.board.h + 1);
        expect(b.canvas.x).toBeGreaterThanOrEqual(g.board.x - 1);
        expect(b.canvas.x + b.canvas.w).toBeLessThanOrEqual(g.board.x + g.board.w + 1);
        expect(HEADROOM).toBeGreaterThanOrEqual(WALL_H);
      }
    }
  });
  it('phones (Dad 2026-10-08): keys ≥ 44 px, inside the view, never on each other or the board', () => {
    type R = { x: number; y: number; w: number; h: number };
    const hit = (a: R, b: R) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    const inside = (r: R, w: number, h: number) => r.x >= 0 && r.y >= 0 && r.x + r.w <= w && r.y + r.h <= h;
    for (const [w, h] of [[390, 664], [320, 568], [844, 390], [667, 375]]) {
      const g = playLayout(w, h, 0);
      expect(g.phone).toBe(true);
      const keys = Object.values(g.actions);
      for (const k of keys) {
        expect(Math.min(k.w, k.h)).toBeGreaterThanOrEqual(44);
        expect(inside(k, w, h)).toBe(true);
        expect(hit(k, g.board)).toBe(false);
        expect(hit(k, g.side)).toBe(false);
      }
      for (let i = 0; i < keys.length; i += 1) for (let j = i + 1; j < keys.length; j += 1) expect(hit(keys[i], keys[j])).toBe(false);
      expect(hit(g.side, g.board)).toBe(false);
      // the board clears the 🏠 button (12 + 56 px) and the HUD row
      expect(g.board.y).toBeGreaterThanOrEqual(g.orientation === 'portrait' ? 112 : 70);
      // a 9×7 warehouse still gets thumb-sized cells
      expect(boardGeom(g.board, 9, 7).s).toBeGreaterThanOrEqual(w === 320 ? 28 : 34);
      const m = mapLayout(w, h, 0);
      expect(m.phone).toBe(true);
      for (const r of [m.card, m.road, m.tabs, m.strip!]) expect(inside(r, w, h)).toBe(true);
      expect(hit(m.card, m.road) || hit(m.tabs, m.road) || hit(m.strip!, m.road) || hit(m.card, m.tabs)).toBe(false);
    }
    // the iPad is not a phone
    expect(playLayout(810, 1080, T).phone).toBe(false);
    expect(mapLayout(1080, 810, T).phone).toBe(false);
  });
  it('map layout keeps the tab bar inside the screen', () => {
    const p = mapLayout(810, 1080, T);
    expect(p.tabs.y + p.tabs.h).toBe(1080);
    const l = mapLayout(1080, 810, T);
    expect(l.tabs.x).toBe(16);
  });
});

describe('gestures (spec §3.2)', () => {
  it('tap ≤ 20 px / 600 ms; swipe ≥ 48 px / 350 ms when on; otherwise a near miss', () => {
    expect(classify(5, 5, 200, true)).toBe('tap');
    expect(classify(0, 20, 600, false)).toBe('tap');
    expect(classify(60, 0, 200, true)).toBe('swipe');
    expect(classify(60, 0, 200, false)).toBe('miss');
    expect(classify(30, 0, 100, true)).toBe('miss');
    expect(classify(80, 0, 400, true)).toBe('miss');
    expect(swipeDir(60, 10)).toBe(3);
    expect(swipeDir(-60, 10)).toBe(2);
    expect(swipeDir(5, -60)).toBe(0);
    expect(swipeDir(5, 60)).toBe(1);
  });
});
