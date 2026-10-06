/**
 * V3 content structure (spec §9.2; prototype check.mjs incl. v1.1 R1–R6) + V8 start boards, on the
 * shipped content/emoji-match/levels.json and the real engine (src/core).
 */
import { describe, expect, it } from 'vitest';
// @ts-expect-error -- plain ESM helper (platform tool), read-only use
import { lintTone } from '../../../tools/check-content.mjs';
import { boardString, findGroups, listMoves, newGame, parseLevel } from '../src/core';
import { EPISODES, INTRO_ORDER, LEVELS, PUZZLES } from '../src/content';
import type { LevelDef } from '../src/core/types';

const tone = (t: string): string[] => lintTone(t) as string[];
export function elementsOf(def: LevelDef): Set<string> {
  const g = def.grid.join(''), d = (def.dust ?? []).join('');
  const e = new Set<string>();
  if (/[>^]/.test(g)) e.add('tap');
  if (/\*/.test(g)) e.add('bomb');
  if (/\+/.test(g)) e.add('prop');
  if (/&/.test(g)) e.add('orb');
  if (/1/.test(d)) e.add('dust');
  if (/2/.test(d)) e.add('dust2');
  if (/1/.test(g)) e.add('crate');
  if (/2/.test(g)) e.add('crate2');
  if (/3/.test(g)) e.add('crate3');
  if (/[iROYGBP]/.test(g)) e.add('ice');
  if (/I/.test(g)) e.add('ice2');
  if (/@/.test(g)) e.add('pod');
  if (/x/.test(g)) e.add('goo');
  if (def.colors.length >= 6) e.add('color6');
  if (def.objectives.some((o) => 'energy' in o)) e.add('energy');
  return e;
}

describe('V3 content structure', () => {
  it('v1 = 4 episodes × 10 levels, level 6 = R, level 10 = B, ids E-NN, teach ≤ 40 and tone-clean', () => {
    const errs: string[] = [];
    expect(EPISODES.map((e) => e.ep)).toEqual([1, 2, 3, 4]);
    for (const ep of EPISODES) {
      const lv = LEVELS.filter((d) => d.ep === ep.ep);
      if (lv.length !== 10) errs.push(`ep${ep.ep} has ${lv.length}`);
      lv.forEach((d, k) => { if (d.n !== k + 1) errs.push(`${d.id} n order`); });
      if (lv[9]?.role !== 'B') errs.push(`ep${ep.ep} boss`);
      if (lv[5]?.role !== 'R') errs.push(`ep${ep.ep} rest`);
    }
    const ids = new Set<string>();
    for (const d of LEVELS) {
      if (ids.has(d.id)) errs.push(`${d.id} dup`); ids.add(d.id);
      if (d.id !== `${d.ep}-${String(d.n).padStart(2, '0')}`) errs.push(`${d.id} id`);
      if (!d.teach || d.teach.length > 40) errs.push(`${d.id} teach`);
      errs.push(...tone(d.teach).map((t) => `${d.id} ${t}`));
    }
    for (const p of PUZZLES) errs.push(...tone(p.teach).map((t) => `${p.id} ${t}`));
    expect(errs).toEqual([]);
  });
  it('boards 5..9, no fully-void column, 4–6 colours, 1–3 objectives that match real obstacles', () => {
    const errs: string[] = [];
    for (const d of LEVELS) {
      const L = parseLevel(d);
      if (L.W < 5 || L.H < 5) errs.push(`${d.id} small`);
      for (let c = 0; c < L.W; c += 1) { let any = false; for (let r = 0; r < L.H; r += 1) if (L.mask[r * L.W + c]) any = true; if (!any) errs.push(`${d.id} col ${c} void`); }
      if (d.colors.length < 4 || d.colors.length > 6) errs.push(`${d.id} colours`);
      if (d.objectives.length < 1 || d.objectives.length > 3) errs.push(`${d.id} objectives`);
      const g = d.grid.join(''), du = (d.dust ?? []).join('');
      for (const o of d.objectives) {
        if ('collect' in o && (!d.colors.includes(o.collect) || !(o.n > 0))) errs.push(`${d.id} collect`);
        if ('crate' in o && !/[123]/.test(g)) errs.push(`${d.id} crate obj`);
        if ('ice' in o && !/[iIROYGBP]/.test(g)) errs.push(`${d.id} ice obj`);
        if ('dust' in o && !/[12]/.test(du)) errs.push(`${d.id} dust obj`);
      }
      if (!d.fixedBoard && d.lesson) errs.push(`${d.id} lesson needs fixedBoard`);
      if (d.role === 'T' && !d.intro) errs.push(`${d.id} T without intro`);
      if (d.moves < 9 || d.moves > 29) errs.push(`${d.id} moves ${d.moves}`);
    }
    expect(errs).toEqual([]);
  });
  it('elements first appear on their intro level, in INTRO_ORDER', () => {
    const firstSeen = new Map<string, string>();
    for (const d of LEVELS) { const els = elementsOf(d); if (d.intro) els.add(d.intro); for (const e of els) if (!firstSeen.has(e)) firstSeen.set(e, d.id); }
    const errs: string[] = [];
    for (const [e, id] of firstSeen) { const il = LEVELS.find((d) => d.intro === e); if (!il) errs.push(`${e} has no intro`); else if (il.id !== id) errs.push(`${e} before ${il.id}`); }
    expect(errs).toEqual([]);
    expect(LEVELS.filter((d) => d.intro).map((d) => d.intro)).toEqual(INTRO_ORDER);
  });
  it('R1 rhythm + sub-element practice; R2 mask only 1-01..1-03; R3 no strategy claims without a feature tag', () => {
    const errs: string[] = [];
    for (const ep of EPISODES) {
      const lv = LEVELS.filter((d) => d.ep === ep.ep);
      const roles = lv.map((d) => d.role).join('');
      if (ep.ep === 1 && roles !== 'TTTTTRTTNB') errs.push(`ep1 ${roles}`);
      if (ep.ep > 1 && roles !== 'TETNHRTNHB') errs.push(`ep${ep.ep} ${roles}`);
      if (ep.ep > 1 && lv[2]?.intro && !elementsOf(lv[3]).has(lv[2].intro)) errs.push(`${lv[3].id} practice`);
    }
    for (const d of LEVELS) if (d.lesson?.mask && !['1-01', '1-02', '1-03'].includes(d.id)) errs.push(`${d.id} mask`);
    const CLAIM = /最有用|先做|先挑|留着|从里往外|从缺口|最好/;
    for (const d of LEVELS) if (CLAIM.test(d.teach) && !d.feature) errs.push(`${d.id} claim`);
    expect(errs).toEqual([]);
  });
  it('R6 puzzles only use elements introduced before they unlock', () => {
    const errs: string[] = [];
    for (const p of PUZZLES) {
      const unlock = LEVELS.findIndex((d) => d.id === `${p.ep}-05`);
      const known = new Set(LEVELS.slice(0, unlock + 1).flatMap((d) => [...elementsOf(d), ...(d.intro ? [d.intro] : [])]));
      known.add('swap'); known.add('tap');
      for (const e of elementsOf(p)) if (!known.has(e)) errs.push(`${p.id} ${e}`);
    }
    expect(errs).toEqual([]);
  });
});

describe('V8 start boards (1000 seeds per level)', () => {
  it.each(LEVELS.map((d) => [d.id, d] as const))('%s', (_id, d) => {
    const L = parseLevel(d);
    const boards = new Set<string>();
    let maxAttempts = 0;
    for (let s = 0; s < 1000; s += 1) {
      const st = newGame(L, s);
      expect(findGroups(st).length).toBe(0);
      expect(listMoves(st).length).toBeGreaterThan(0);
      maxAttempts = Math.max(maxAttempts, st.initAttempts ?? 0);
      if (s < 200) boards.add(boardString(st));
    }
    expect(maxAttempts).toBeLessThanOrEqual(10);
    if (d.fixedBoard) expect(boards.size).toBe(1);
    else expect(boards.size).toBeGreaterThanOrEqual(150);
  });
});
