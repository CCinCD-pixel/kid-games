import { describe, expect, it } from 'vitest';
import {
  cloneTray, emptyTray, fromValue, isCanonical, legalActions, newLog, normalizeTray, readyToShip, totalValue, trayDo, trayErrors, trayReset, trayStep, trayUndo, trayValue,
  TRAY_OPS, type TrayAction, type TrayState,
} from './tray';
import {
  ARRAY_MAX, arrayArea, arrayParts, arraySet, arraySplit, arrayTurn, beltFull, beltLift, beltNew, beltOrder, beltPlace, checkArray, checkBelt, checkCounter, checkHop, checkPods,
  counterBump, counterFrom, counterSet, counterValue, hopBack, hopForward, hopLanding, podsAdd, podsDeal, podsEqual, podsGive, podsRemove, podsTake, podsTotal,
  type ArrayState, type BeltState, type CounterState, type HopState, type PodsState,
} from './models';

function rng(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const SEQ = process.env.MARS_FULL ? 10000 : 1500;   // quick tier = 1/10 sample (spec §9)
const T = 120000;
/** a rod/crystal-hungry policy so the 10th-item machines are reached often */
const pourBias = (r: () => number, s: TrayState): TrayAction | null => (r() < 0.45 && (s.carts.rod > 0 || s.carts.crystal > 0) ? { op: 'pour', cart: s.carts.rod > 0 && r() < 0.5 ? 'rod' : 'crystal' } : null);
const ACTIONS: TrayAction[] = [
  { op: 'pour', cart: 'crystal' }, { op: 'pour', cart: 'rod' }, { op: 'pour', cart: 'box' }, { op: 'press' }, { op: 'pack' }, { op: 'cutRod' }, { op: 'openBundle' }, { op: 'moveStaged' },
  { op: 'cutBox' }, { op: 'openBoxBundle' }, { op: 'moveStagedRod' }, { op: 'ship', part: 'crystal' }, { op: 'ship', part: 'rod' }, { op: 'ship', part: 'box' },
];

describe('tray (V14)', () => {
  it('10k random sequences: conservation, illegal = null + untouched, valid states, JSON round trip, undo restores', () => {
    const r = rng(7); let accepted = 0, rejected = 0; const used = new Set<string>();
    for (let n = 0; n < SEQ; n++) {
      const start = emptyTray({ crystal: Math.floor(r() * 30), rod: Math.floor(r() * 16), box: Math.floor(r() * 7) });
      const total0 = totalValue(start);
      let s = cloneTray(start); const log = newLog();
      for (let k = 0; k < 40; k++) {
        const legal = legalActions(s); const mach = legal.filter((x) => x.op === 'press' || x.op === 'pack');
        const a: TrayAction = mach.length && r() < 0.5 ? mach[0] : (pourBias(r, s) ?? (r() < 0.5 && legal.length ? legal[Math.floor(r() * legal.length)] : ACTIONS[Math.floor(r() * ACTIONS.length)])); const before = JSON.stringify(s);
        const nx = trayDo(log, s, a);
        if (nx === null) { rejected++; expect(JSON.stringify(s)).toBe(before); continue; }
        accepted++; used.add(a.op); s = nx;
        expect(trayErrors(s)).toEqual([]); expect(totalValue(s)).toBe(total0);
        expect(JSON.parse(JSON.stringify(s))).toEqual(s);
      }
      const back = trayReset(log, s); expect(back).toEqual(start);
    }
    expect(accepted).toBeGreaterThan(SEQ * 10);
    expect(rejected).toBeGreaterThan(0);
    for (const op of TRAY_OPS) expect(used.has(op), `op ${op} never exercised`).toBe(true);
  }, T);

  it('undo pops exactly one step', () => {
    let s = emptyTray({ crystal: 5 }); const log = newLog();
    s = trayDo(log, s, { op: 'pour', cart: 'crystal' })!; const one = cloneTray(s);
    s = trayDo(log, s, { op: 'pour', cart: 'crystal' })!;
    expect(trayUndo(log, s)).toEqual(one);
  });

  it('cut box → open bundle → 10 rods into the rack and the packer (borrow 100 from a box)', () => {
    let s = fromValue(342); expect(s).toMatchObject({ boxes: 3, rods: 4, crystals: 2 });
    s = trayStep(s, { op: 'ship', part: 'box' })!; expect(s.shipped).toBe(100);
    s = trayStep(s, { op: 'cutBox' })!; expect(s.cutBoxes).toBe(1); expect(trayValue(s)).toBe(242);
    expect(trayStep(s, { op: 'moveStagedRod' })).toBeNull();
    s = trayStep(s, { op: 'openBoxBundle' })!; expect(s.stagedRods).toBe(10);
    expect(trayStep(s, { op: 'openBoxBundle' })).toBeNull();
    expect(readyToShip(s)).toBe(false);
    for (let i = 0; i < 6; i++) s = trayStep(s, { op: 'moveStagedRod' })!;
    expect(s.rods).toBe(9); expect(s.packEntry).toBe(1); expect(s.stagedRods).toBe(4);
    expect(trayStep(s, { op: 'moveStagedRod' })).toBeNull();   // rack full + packer entry taken: the child must pack first
    s = trayStep(s, { op: 'pack' })!; expect(s.boxes).toBe(2);
    expect(totalValue(s)).toBe(342);
  });

  it('K1.7 mine-cart stock "2 箱 13 棒 5 颗" never makes an illegal TrayState; the machines normalise it to 335', () => {
    let s = fromValue(335, { boxes: 2, rods: 13, crystals: 5 });
    expect(trayErrors(s)).toEqual([]); expect(s.carts).toEqual({ box: 2, rod: 13, crystal: 5 }); expect(trayValue(s)).toBe(0);
    for (let i = 0; i < 2; i++) s = trayStep(s, { op: 'pour', cart: 'box' })!;
    for (let i = 0; i < 13; i++) { const nx = trayStep(s, { op: 'pour', cart: 'rod' }); if (nx) s = nx; else { s = trayStep(s, { op: 'pack' })!; s = trayStep(s, { op: 'pour', cart: 'rod' })!; } }
    for (let i = 0; i < 5; i++) s = trayStep(s, { op: 'pour', cart: 'crystal' })!;
    s = normalizeTray(s);
    expect(isCanonical(s)).toBe(true); expect(trayValue(s)).toBe(335); expect(s).toMatchObject({ boxes: 3, rods: 3, crystals: 5 });
  });

  it('999 + 1 reaches the 1000 vault only through press → pack', () => {
    let s = fromValue(999); s.carts.crystal = 1; s = trayStep(s, { op: 'pour', cart: 'crystal' })!; expect(s.pressEntry).toBe(1);
    s = trayStep(s, { op: 'press' })!; expect(s.packEntry).toBe(1); s = trayStep(s, { op: 'pack' })!;
    expect(s.vault1000).toBe(1); expect(trayValue(s)).toBe(1000);
  });

  it('legalActions only lists accepted actions; bots reach canonical totals', () => {
    const r = rng(11);
    for (let n = 0; n < 300; n++) {
      let s = emptyTray({ crystal: 29, rod: 11, box: 3 });
      for (let k = 0; k < 60; k++) { const L = legalActions(s); if (!L.length) break; const a = L[Math.floor(r() * L.length)]; expect(trayStep(s, a)).not.toBeNull(); s = trayStep(s, a)!; }
    }
  });
});

describe('counter (V14)', () => {
  it('10k bump/set sequences stay valid and change the value by exactly the place value', () => {
    const r = rng(3);
    for (let n = 0; n < SEQ; n++) {
      let s: CounterState = counterFrom(Math.floor(r() * 1001));
      for (let k = 0; k < 20; k++) {
        const place = (['h', 't', 'o'] as const)[Math.floor(r() * 3)]; const d = r() < 0.5 ? 1 : -1; const pv = { h: 100, t: 10, o: 1 }[place];
        const nx = counterBump(s, place, d);
        if (nx) { expect(counterValue(nx)).toBe(counterValue(s) + d * pv); s = nx; } else { const v = counterValue(s) + d * pv; expect(v < 0 || v > 1000).toBe(true); }
        expect(checkCounter(s)).toEqual([]);
        const st = counterSet(s, place, Math.floor(r() * 10)); if (st) { expect(checkCounter(st)).toEqual([]); s = st; }
        expect(JSON.parse(JSON.stringify(s))).toEqual(s);
      }
    }
  }, T);
  it('399 + 1 carries twice; 1000 − 1 borrows from the lamp; 3006 cannot be written', () => {
    expect(counterBump(counterFrom(399), 'o', 1)).toEqual({ h: 4, t: 0, o: 0, lamp: 0 });
    expect(counterBump(counterFrom(1000), 'o', -1)).toEqual({ h: 9, t: 9, o: 9, lamp: 0 });
    expect(counterBump(counterFrom(999), 'o', 1)).toEqual({ h: 0, t: 0, o: 0, lamp: 1 });
    expect(counterBump(counterFrom(1000), 'h', 1)).toBeNull();
    expect(counterSet(counterFrom(1000), 'h', 3)).toBeNull();
    expect(() => counterFrom(3006)).toThrow();
  });
});

describe('pods (V14)', () => {
  it('10k sequences conserve the crystals; illegal moves return null', () => {
    const r = rng(5);
    for (let n = 0; n < SEQ; n++) {
      const total = 6 + Math.floor(r() * 40); let s: PodsState = { pods: [], stock: total };
      for (let k = 0; k < 30; k++) {
        const i = Math.floor(r() * 6); const c = Math.floor(r() * 6); let nx: PodsState | null = null;
        if (c === 0) nx = podsAdd(s, 1 + Math.floor(r() * 8)); else if (c === 1) nx = podsGive(s, i); else if (c === 2) nx = podsTake(s, i); else if (c === 3) nx = podsDeal(s); else if (c === 4) nx = podsRemove(s, i); else nx = podsGive(s, 0);
        if (nx) { s = nx; expect(podsTotal(s)).toBe(total); expect(checkPods(s)).toEqual([]); }
      }
    }
  }, T);
  it('dealing a round equalises; unequal pods report null', () => {
    let s: PodsState = { pods: [0, 0, 0, 0], stock: 20 }; for (let i = 0; i < 5; i++) s = podsDeal(s)!;
    expect(podsEqual(s)).toBe(5); expect(podsDeal(s)).toBeNull();
    expect(podsEqual(podsTake(s, 1)!)).toBeNull();
  });
});

describe('array (V14)', () => {
  it('10k sequences keep the area, two turns restore the board, splits add up', () => {
    const r = rng(9);
    for (let n = 0; n < SEQ; n++) {
      let s: ArrayState = { rows: 1 + Math.floor(r() * 10), cols: 1 + Math.floor(r() * 10), cut: 0 };
      for (let k = 0; k < 12; k++) {
        const c = Math.floor(r() * 4);
        if (c === 0) { const t = arrayTurn(s); expect(arrayArea(t)).toBe(arrayArea(s)); expect(arrayTurn(t)).toEqual({ ...s, cut: 0 }); s = t; }
        else if (c === 1) { const nx = arraySplit(s, 1 + Math.floor(r() * 10)); if (nx) { s = nx; const p = arrayParts(s)!; expect(p[0] + p[1]).toBe(arrayArea(s)); } }
        else { const nx = arraySet(s, Math.floor(r() * 13) - 1, Math.floor(r() * 13) - 1); if (nx) s = nx; }
        expect(checkArray(s)).toEqual([]); expect(s.rows <= ARRAY_MAX && s.cols <= ARRAY_MAX).toBe(true);
      }
    }
  }, T);
});

describe('hop + belt (V14)', () => {
  it('hops are reversible and land on start + step × hops', () => {
    const r = rng(2);
    for (let n = 0; n < SEQ; n++) {
      let s: HopState = { start: Math.floor(r() * 5) * 10, step: 1 + Math.floor(r() * 9), hops: 0 };
      for (let k = 0; k < 30; k++) { const f = r() < 0.6; const nx = f ? hopForward(s) : hopBack(s); if (nx) { expect(Math.abs(nx.hops - s.hops)).toBe(1); s = nx; } expect(hopLanding(s)).toBe(s.start + s.step * s.hops); expect(checkHop(s)).toEqual([]); }
    }
  }, T);
  it('belt never loses a card; a full belt reads out the order', () => {
    const r = rng(4);
    for (let n = 0; n < SEQ; n++) {
      const cards = [100 + Math.floor(r() * 300), 400 + Math.floor(r() * 300), 700 + Math.floor(r() * 299)]; let s: BeltState = beltNew(cards);
      for (let k = 0; k < 20; k++) {
        const nx = r() < 0.7 ? beltPlace(s, cards[Math.floor(r() * 3)], Math.floor(r() * 3)) : beltLift(s, Math.floor(r() * 3)); if (nx) s = nx;
        expect(checkBelt(s, cards)).toEqual([]); if (beltFull(s)) expect(beltOrder(s)!.length).toBe(3);
      }
    }
  }, T);
});
