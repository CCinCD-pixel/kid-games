import { describe, expect, test } from 'vitest';
import { N, adj } from '../src/core/board';
import { STAGE, boardGeom, fitStage, nearestStation, rectInside, rectsOverlap, seatRotation, stageGeom, stationAt, stationLocal, stationXY, type Orientation } from '../src/view/layout';
import { TILE } from '../src/view/pieces-svg';

const ORIENTS: Orientation[] = ['portrait', 'landscape'];

describe('view layout (spec §2.2, pure)', () => {
  for (const o of ORIENTS) {
    test(`${o}: board size and position match the spec constants`, () => {
      const g = boardGeom(o, 20);
      if (o === 'portrait') expect([g.rect.w, g.rect.h, g.rect.x, g.rect.y]).toEqual([652, 810, 79, 96]);
      else expect([g.rect.w, g.rect.h, g.rect.x, g.rect.y]).toEqual([808, 672, 12, 111]);
    });
    test(`${o}: all 60 stations inside the board's playing field; tiles stay inside the frame`, () => {
      const g = boardGeom(o, 20);
      const t = TILE[g.tile.shape];
      for (let i = 0; i < N; i++) {
        const p = stationLocal(g, i);
        expect(p.x - t.w / 2).toBeGreaterThanOrEqual(g.frame - 0.01);
        expect(p.y - t.h / 2).toBeGreaterThanOrEqual(g.frame - 0.01);
        expect(p.x + t.w / 2).toBeLessThanOrEqual(g.rect.w - g.frame + 0.01);
        expect(p.y + t.h / 2).toBeLessThanOrEqual(g.rect.h - g.frame + 0.01);
      }
    });
    test(`${o}: neighbouring stations are at least one hit cell apart; hit cells ≥ 48 px`, () => {
      const g = boardGeom(o, 20);
      expect(Math.min(g.hit.w, g.hit.h)).toBeGreaterThanOrEqual(48);
      for (let i = 0; i < N; i++) {
        for (const j of adj[i]) {
          const a = stationLocal(g, i), b = stationLocal(g, j);
          const dx = Math.abs(a.x - b.x), dy = Math.abs(a.y - b.y);
          expect(dx >= g.hit.w - 0.01 || dy >= g.hit.h - 0.01).toBe(true);
        }
      }
    });
    test(`${o}: every station's centre hit-tests to itself; snapping finds it`, () => {
      const g = boardGeom(o, 20);
      for (let i = 0; i < N; i++) {
        const p = stationXY(g, i);
        expect(stationAt(g, p.x, p.y)).toBe(i);
        expect(stationAt(g, p.x + g.hit.w / 2 - 2, p.y)).toBe(i);
        expect(nearestStation(g, p.x + 20, p.y + 10, 60)).toBe(i);
      }
    });
    test(`${o}: HUD, panel, intel, caption and buttons do not overlap the board and stay on stage`, () => {
      const s = stageGeom(o, 20);
      const stage = { x: 0, y: 0, w: STAGE[o].w, h: STAGE[o].h };
      const parts = [s.turnBar, s.intel, s.companion, ...s.buttons];
      for (const r of [s.board.rect, ...parts]) expect(rectInside(r, stage)).toBe(true);
      for (const r of parts) expect(rectsOverlap(r, s.board.rect)).toBe(false);
      expect(rectsOverlap(s.turnBar, s.intel)).toBe(false);
      for (const b of s.buttons) {
        expect(rectsOverlap(b, s.turnBar)).toBe(false);
        expect(b.w).toBeGreaterThanOrEqual(56);
      }
      // the 🏠 corner (12 + 56 + safe area) stays free
      const home = { x: 0, y: 0, w: 12 + 56, h: 20 + 12 + 56 };
      for (const r of [s.board.rect, ...parts]) expect(rectsOverlap(r, home)).toBe(false);
    });
  }
  test('tile sizes: wide 92×50, tall 52×88; 22 px names + 26 px badge fit (6+44+6+26+6 = 88)', () => {
    expect(TILE.wide).toEqual({ w: 92, h: 50 });
    expect(TILE.tall).toEqual({ w: 52, h: 88 });
    expect(6 + 2 * 22 + 6 + 26 + 6).toBeLessThanOrEqual(TILE.wide.w);
    expect(6 + 2 * 22 + 6 + 26 + 6).toBeLessThanOrEqual(TILE.tall.h);
  });
  test('seat rotation: side by side 0; face to face portrait far 180, landscape near +90 / far −90', () => {
    expect(seatRotation('portrait', 'side', 'far')).toBe(0);
    expect(seatRotation('portrait', 'face', 'near')).toBe(0);
    expect(seatRotation('portrait', 'face', 'far')).toBe(180);
    expect(seatRotation('landscape', 'face', 'near')).toBe(90);
    expect(seatRotation('landscape', 'face', 'far')).toBe(-90);
  });
  test('fitStage: scale 1 on the iPad 9 viewports; letterboxed elsewhere', () => {
    expect(fitStage('portrait', 810, 1080)).toEqual({ scale: 1, ox: 0, oy: 0 });
    expect(fitStage('landscape', 1080, 810)).toEqual({ scale: 1, ox: 0, oy: 0 });
    const f = fitStage('landscape', 1366, 1024);
    expect(f.scale).toBeCloseTo(1024 / 810, 5);
    expect(f.ox).toBeGreaterThan(0);
  });
});
