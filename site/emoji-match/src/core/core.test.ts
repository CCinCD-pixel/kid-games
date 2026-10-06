/**
 * V1 golden rule cases (spec §8.10). G1–G16 + G31–G36 are core.test.mjs verbatim (the prototype's
 * `blast.cells` count is `blast.cells.length` here: the port logs the hit list for the view);
 * G17–G30 are the port's additions. Boards use refill:false so results are exact.
 */
import { describe, expect, it } from 'vitest';
import { createRng } from '@kit/rng';
import {
  BOMB, CRATE, EMPTY, GOO, ORB, PIECE, POD, PROP, RH, RV,
  applyBooster, applyMove, bestMove, boardString, countMoves, findGroups, hint1Candidates, isWon, listMoves,
  newGame, parseLevel, placeAssist, rngBelow, rngNew, rngNext, settle, shuffle, starsFor, cloneState, remaining,
  type Ev, type GameState, type LevelDef,
} from './index';

const lv = (grid: string[], extra: Partial<LevelDef> = {}) => parseLevel({ id: 't', colors: 'roygbp', grid, objectives: [{ energy: 9999 }], refill: false, ...extra });
const at = (st: { W: number }, r: number, c: number) => r * st.W + c;
const groupsOf = (grid: string[]) => { const L = lv(grid); return findGroups({ W: L.W, H: L.H, N: L.N, kind: L.kind.slice(), color: L.color.slice() }); };
const blasts = (st: GameState) => (st.log ?? []).filter((e) => e.e === 'blast');

describe('rng', () => {
  it('engine streams are bit-identical to kit/rng createRng', () => {
    for (const seed of ['em:1-01:1', 'bot:K:1000', 12345]) {
      const a = rngNew(seed), b = createRng(seed);
      for (let k = 0; k < 200; k += 1) expect(rngNext(a)).toBe(b.next());
    }
  });
});

describe('golden G1–G16 (prototype)', () => {
  it('G1 3-match clears, pieces fall, no refill', () => {
    const st = newGame(lv(['yro', 'rgr', 'obb']), 1);
    expect(applyMove(st, { t: 'swap', a: at(st, 1, 1), b: at(st, 0, 1) }).ok).toBe(true);
    expect(boardString(st)).toBe('___\nygo\nobb');
    expect(st.collected[0]).toBe(3);
    expect(st.movesUsed).toBe(1);
  });
  it('G2 swap that makes nothing is refused and costs no move', () => {
    const st = newGame(lv(['yro', 'rgr', 'obb']), 1);
    expect(applyMove(st, { t: 'swap', a: at(st, 0, 0), b: at(st, 0, 1) }).ok).toBe(false);
    expect(st.movesUsed).toBe(0);
    expect(boardString(st)).toBe('yro\nrgr\nobb');
  });
  it('G3 four in a row -> rocket with the line orientation, on the moved cell', () => {
    const st = newGame(lv(['rrbrg', 'gyrob', 'oygbo']), 1);
    applyMove(st, { t: 'swap', a: at(st, 1, 2), b: at(st, 0, 2) });
    expect(boardString(st)).toBe('__>_g\ngybob\noygbo');
  });
  it('G4 shape table', () => {
    expect(groupsOf(['rrr', 'rgb', 'rbg'])[0].type).toBe(BOMB);
    expect(groupsOf(['grg', 'brb', 'rrr'])[0].type).toBe(BOMB);
    expect(groupsOf(['rrrrr', 'gbgbg'])[0].type).toBe(ORB);
    expect(groupsOf(['rrg', 'rrb', 'gbg'])[0].type).toBe(PROP);
    expect(groupsOf(['rrrr', 'gbgb'])[0].type).toBe(RH);
    expect(groupsOf(['rg', 'rb', 'rg', 'rb'])[0].type).toBe(RV);
    expect(groupsOf(['rrrg', 'gbrb'])[0].type).toBe(0);
  });
  it('G5 L-shape around a 2-layer crate: one side hit per step; bomb at the moved cell', () => {
    const st = newGame(lv(['rrgr', 'o2rb', 'ybro']), 1);
    applyMove(st, { t: 'swap', a: at(st, 0, 3), b: at(st, 0, 2) });
    expect(boardString(st)).toBe('___g\no1_b\nyb*o');
  });
  it('G6 iced piece matches in place: ice cracks, piece stays', () => {
    const st = newGame(lv(['rRgr', 'gbyb']), 1);
    applyMove(st, { t: 'swap', a: at(st, 0, 3), b: at(st, 0, 2) });
    expect(boardString(st)).toBe('_r_g\ngbyb');
    expect(st.collected[0]).toBe(2);
    expect(st.iceFreed).toBe(1);
  });
  it('G7 pod falls onto its exit and is delivered', () => {
    const st = newGame(lv(['@ybg', 'rror'], { exits: [0], objectives: [{ pod: 1 }] }), 1);
    applyMove(st, { t: 'swap', a: at(st, 1, 3), b: at(st, 1, 2) });
    expect(st.delivered).toBe(1);
    expect(boardString(st)).toBe('___g\n_ybo');
  });
  it('G8 orb swapped with a piece clears every piece of that colour', () => {
    const st = newGame(lv(['&brg', 'yrbo', 'bgyr']), 1);
    applyMove(st, { t: 'swap', a: at(st, 0, 0), b: at(st, 0, 1) });
    expect(st.collected[4]).toBe(3);
  });
  it('G9 bomb tap hits the 13-cell diamond', () => {
    const st = newGame(lv(['rgbyo', 'gbyor', 'by*rg', 'yorgb', 'orgby']), 1, { log: true });
    applyMove(st, { t: 'tap', a: at(st, 2, 2) });
    expect(blasts(st)[0].cells.length).toBe(13);
  });
  it('G10 rocket + rocket = row + column through the drop cell', () => {
    const st = newGame(lv(['rgbyo', 'gbyor', 'by>^g', 'yorgb', 'orgby']), 1, { log: true });
    applyMove(st, { t: 'swap', a: at(st, 2, 3), b: at(st, 2, 2) });
    const b = blasts(st)[0];
    expect(b.k).toBe('RR');
    expect(b.cells.length).toBe(9);
  });
  it('G11 diagonal slide fills a hole shadowed by a crate', () => {
    const st = newGame(lv(['1rg', '_by', '>gb']), 1);
    settle(st);
    expect(boardString(st)).toBe('1_g\nrby\n>gb');
  });
  it('G12 listMoves == brute force over all neighbour swaps in BOTH directions (+ taps)', () => {
    const grid = ['rbgyb', 'gyrbg', 'ybgro', 'b+>og', 'orbgy'];
    const st = newGame(lv(grid), 1);
    const listed = new Set(listMoves(st).map((m) => (m.t === 'tap' ? `t${m.a}` : `${m.a}-${m.b}`)));
    const brute = new Set<string>();
    const spec = (i: number) => st.kind[i] >= RH && st.kind[i] <= ORB;
    for (let i = 0; i < st.N; i += 1) {
      for (const j of [i + 1, i + st.W, i - 1, i - st.W]) {
        if (j < 0 || j >= st.N) continue;
        if ((j === i + 1 && j % st.W === 0) || (j === i - 1 && i % st.W === 0)) continue;
        const c = newGame(lv(grid), 1);
        if (!applyMove(c, { t: 'swap', a: i, b: j }).ok) continue;
        if (j > i || (spec(i) && spec(j))) brute.add(`${i}-${j}`);
      }
      if (spec(i)) brute.add(`t${i}`);
    }
    expect([...listed].sort()).toEqual([...brute].sort());
    expect(listed.has(`${at(st, 3, 1)}-${at(st, 3, 2)}`) && listed.has(`${at(st, 3, 2)}-${at(st, 3, 1)}`)).toBe(true);
  });
  it('G13 drill takes one layer off a crate and costs no move', () => {
    const st = newGame(lv(['2gb', 'ybr', 'g>y']), 1);
    expect(applyBooster(st, { t: 'drill', a: at(st, 0, 0) }).ok).toBe(true);
    expect(st.hp[0]).toBe(1);
    expect(st.movesUsed).toBe(0);
    expect(applyBooster(st, { t: 'drill', a: at(st, 0, 0) }).ok).toBe(true);
    expect(st.kind[0] === CRATE).toBe(false);
  });
  it('G14 tractor swaps without needing a match and does not fire specials', () => {
    const st = newGame(lv(['rgb', 'ybr', 'g>y']), 1);
    expect(applyBooster(st, { t: 'tractor', a: at(st, 2, 1), b: at(st, 2, 2) }).ok).toBe(true);
    expect(boardString(st)).toBe('rgb\nybr\ngy>');
    expect(st.movesUsed).toBe(0);
  });
  it('G15 ion cannon hits a whole column', () => {
    const st = newGame(lv(['rgby', 'ybry', 'g>yb', 'bryg']), 1, { log: true });
    applyBooster(st, { t: 'ion', a: at(st, 0, 0), dir: 'V' });
    expect(st.collected.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(4);
  });
  it('G16 assist tiers place 1/2/3 specials deterministically, never on exit cells', () => {
    const L = parseLevel({ id: 'a', colors: 'rygbp', grid: Array(6).fill('......'), exits: [2], objectives: [{ energy: 50 }] });
    for (const tier of [1, 2, 3]) {
      const st = newGame(L, 3);
      const p1 = placeAssist(st, tier, 'em:a:3:assist');
      const st2 = newGame(L, 3);
      const p2 = placeAssist(st2, tier, 'em:a:3:assist');
      expect(p1).toEqual(p2);
      expect(p1.length).toBe(tier);
      for (const i of p1) expect(st.exit[i] || st.exit[i + st.W] ? 1 : 0).toBe(0);
    }
  });
});

describe('golden G31–G36 (prototype v1.1)', () => {
  it('G31 a propeller never targets a cell inside its own blast cross', () => {
    const st = newGame(lv(['rgbyo', 'gb+2r', 'byrog', 'yorgb'], { objectives: [{ crate: true }] }), 1, { log: true });
    applyMove(st, { t: 'tap', a: at(st, 1, 2) });
    expect(st.hp[at(st, 1, 3)]).toBe(1);
    const fly = st.log!.find((e) => e.e === 'fly');
    const cross = new Set([at(st, 1, 2), at(st, 0, 2), at(st, 2, 2), at(st, 1, 1), at(st, 1, 3)]);
    expect(fly && !cross.has(fly.to)).toBe(true);
    const st2 = newGame(lv(['rgbyor', 'gb++ry', 'byrogb', 'yorgbr'], { objectives: [{ collect: 'r', n: 50 }] }), 1, { log: true });
    applyMove(st2, { t: 'swap', a: at(st2, 1, 2), b: at(st2, 1, 3) });
    const flies = st2.log!.filter((e) => e.e === 'fly').map((e) => e.to as number);
    const cross2 = new Set([at(st2, 1, 3), at(st2, 0, 3), at(st2, 2, 3), at(st2, 1, 2), at(st2, 1, 4)]);
    expect(flies.length).toBe(3);
    expect(new Set(flies).size).toBe(3);
    for (const t of flies) expect(cross2.has(t)).toBe(false);
  });
  it('G32 special+special: the combo fires at b (directions differ)', () => {
    const g = ['rgbyo', 'gbyor', 'by>^g', 'yorgb', 'orgby'];
    const s1 = newGame(lv(g), 1), s2 = newGame(lv(g), 1);
    applyMove(s1, { t: 'swap', a: at(s1, 2, 3), b: at(s1, 2, 2) });
    applyMove(s2, { t: 'swap', a: at(s2, 2, 2), b: at(s2, 2, 3) });
    expect(boardString(s1)).not.toBe(boardString(s2));
  });
  it('G33 free mode = objectives [{ energy: 1e9 }]: never won, never stuck', () => {
    const L = parseLevel({ id: 'free', colors: 'rygbp', grid: Array(8).fill('........'), objectives: [{ energy: 1e9 }] });
    const st = newGame(L, 5);
    const r = rngNew('g33');
    for (let k = 0; k < 300; k += 1) {
      const mv = listMoves(st);
      expect(mv.length).toBeGreaterThan(0);
      applyMove(st, mv[rngBelow(r, mv.length)]);
      expect(isWon(st)).toBe(false);
    }
    expect(st.energy).toBeGreaterThan(300);
  });
  it('G34 shuffle last resort: gift rocket + the standing match is resolved', () => {
    const L = parseLevel({ id: 'g34', colors: 'r', grid: ['rgrrg'], objectives: [{ energy: 9999 }] });
    const st = newGame(L, 1);
    st.color[3] = 3; st.kind[4] = CRATE; st.hp[4] = 1; st.color[4] = -1;
    shuffle(st);
    expect(st.stats.gifts).toBe(1);
    expect(findGroups(st).length).toBe(0);
    expect(countMoves(st)).toBeGreaterThan(0);
  });
  it('G35 boosters: no goo spread after a tool; tractor refuses special+special and same-colour pairs', () => {
    const st = newGame(lv(['rgbyo', 'gxyor', 'byrog', 'yorgb'], { objectives: [{ goo: true }] }), 1);
    applyBooster(st, { t: 'drill', a: at(st, 3, 4) });
    let goo = 0; for (let i = 0; i < st.N; i += 1) if (st.kind[i] === GOO) goo += 1;
    expect(goo).toBe(1);
    const st2 = newGame(lv(['r>^', 'gbr', 'ryb']), 1);
    expect(applyBooster(st2, { t: 'tractor', a: at(st2, 0, 1), b: at(st2, 0, 2) }).ok).toBe(false);
    const st3 = newGame(lv(['rrg', 'gbr', 'ryb']), 1);
    expect(applyBooster(st3, { t: 'tractor', a: at(st3, 0, 0), b: at(st3, 0, 1) }).ok).toBe(false);
  });
  it('G36 assists avoid lesson cells and only use specials the child has met', () => {
    const L = parseLevel({ id: 'a', colors: 'rygbp', grid: Array(6).fill('......'), objectives: [{ energy: 50 }] });
    const avoid = [0, 1, 2, 3, 4, 5, 6, 7];
    for (let s = 0; s < 40; s += 1) {
      const st = newGame(L, s);
      const placed = placeAssist(st, 3, `em:a:${s}:assist`, { avoid, allow: new Set() });
      expect(placed.length).toBe(3);
      for (const i of placed) { expect(avoid.includes(i)).toBe(false); expect(st.kind[i] === RH || st.kind[i] === RV).toBe(true); }
    }
  });
});

describe('golden G17–G30 (port additions, spec §8.10)', () => {
  it('G17 combo coverage: RR 9x9 = 17 cells, BB = 49, PP = cross + 3 drones, OR converts the most common colour, OO = whole board', () => {
    const g9 = Array.from({ length: 9 }, (_, r) => Array.from({ length: 9 }, (_, c) => 'rgbyp'[(r * 2 + c) % 5]).join(''));
    const rr = g9.slice(); rr[4] = rr[4].slice(0, 3) + '>^' + rr[4].slice(5);
    let st = newGame(lv(rr), 1, { log: true });
    applyMove(st, { t: 'swap', a: at(st, 4, 3), b: at(st, 4, 4) });
    expect(blasts(st)[0].k).toBe('RR'); expect(blasts(st)[0].cells.length).toBe(17);
    const bb = g9.slice(); bb[4] = bb[4].slice(0, 3) + '**' + bb[4].slice(5);
    st = newGame(lv(bb), 1, { log: true });
    applyMove(st, { t: 'swap', a: at(st, 4, 3), b: at(st, 4, 4) });
    expect(blasts(st)[0].k).toBe('BB'); expect(blasts(st)[0].cells.length).toBe(49);
    const pp = g9.slice(); pp[4] = pp[4].slice(0, 3) + '++' + pp[4].slice(5);
    st = newGame(lv(pp), 1, { log: true });
    applyMove(st, { t: 'swap', a: at(st, 4, 3), b: at(st, 4, 4) });
    expect(blasts(st)[0].k).toBe('PP'); expect(blasts(st)[0].cells.length).toBe(5 + 3);
    const or = g9.slice(); or[4] = or[4].slice(0, 3) + '&>' + or[4].slice(5);
    st = newGame(lv(or), 1, { log: true });
    const before = new Int32Array(6); for (let i = 0; i < st.N; i += 1) if (st.kind[i] === PIECE) before[st.color[i]] += 1;
    applyMove(st, { t: 'swap', a: at(st, 4, 3), b: at(st, 4, 4) });
    const conv = st.log!.filter((e) => e.e === 'convert');
    expect(conv.length).toBe(Math.max(...before));
    const oo = g9.slice(); oo[4] = oo[4].slice(0, 3) + '&&' + oo[4].slice(5);
    st = newGame(lv(oo), 1, { log: true });
    applyMove(st, { t: 'swap', a: at(st, 4, 3), b: at(st, 4, 4) });
    expect(blasts(st)[0].k).toBe('OO'); expect(blasts(st)[0].cells.length).toBe(81);
  });
  it('G18 drone targets follow the objective order (first objective with candidates)', () => {
    const g = ['rgbyo', 'gb+yr', 'byrog', 'yorgb', 'pgbyo'];
    const st = newGame(lv(g, { objectives: [{ collect: 'p', n: 5 }, { collect: 'r', n: 5 }] }), 1, { log: true });
    applyMove(st, { t: 'tap', a: at(st, 1, 2) });
    const fly = st.log!.find((e) => e.e === 'fly')!;
    expect(fly.to).toBe(at(st, 4, 0)); // the only 'p'
  });
  it('G19 orb tap takes the most common free colour; ties go to the earlier level colour', () => {
    const st = newGame(lv(['&rr', 'bgb', 'ygy'], { colors: 'rgby' }), 1, { log: true });
    applyMove(st, { t: 'tap', a: 0 });
    expect(blasts(st)[0].col).toBe(0); // r(2) b(2) g(2) y(2): tie -> 'r' (first of colors)
    const st2 = newGame(lv(['&rb', 'bgb', 'ygy'], { colors: 'rgby' }), 1, { log: true });
    applyMove(st2, { t: 'tap', a: 0 });
    expect(blasts(st2)[0].col).toBe(4); // b = 3
  });
  it('G20 ice is never side-hit', () => {
    const st = newGame(lv(['rrgr', 'oGyb', 'ybro']), 1);
    applyMove(st, { t: 'swap', a: at(st, 0, 3), b: at(st, 0, 2) });
    expect(st.ice[at(st, 1, 1)]).toBe(1);
  });
  it('G21 a crate takes at most one side hit per round even when two groups touch it', () => {
    const st = newGame(lv(['rrygg', 'rg3yr', 'bbybr', 'gryyg']), 1, { log: true });
    applyMove(st, { t: 'swap', a: 12, b: 13 });
    expect(st.log!.filter((e) => e.e === 'match' && e.step === 0).length).toBe(2);
    expect(st.hp[at(st, 1, 2)]).toBe(2);
  });
  it('G22 a cell hit by two blasts in the same round loses two layers', () => {
    // RH row hits the 3-layer crate and the bomb; the chained bomb's diamond hits the crate again
    const st = newGame(lv(['rgbyo', 'g>3*r', 'byrog', 'yorgb'], { objectives: [{ crate: true }] }), 1, { log: true });
    applyMove(st, { t: 'tap', a: at(st, 1, 1) });
    expect(blasts(st).map((b) => b.k)).toEqual([RH, BOMB]);
    expect(blasts(st)[1].trig).toEqual({ blast: blasts(st)[0].idx });
    expect(st.hp[at(st, 1, 2)]).toBe(1);
  });
  it('G23 pods: not swappable, never slide diagonally, stop on ice', () => {
    const st = newGame(lv(['@gyy', 'Rgbb', 'ryrr'], { exits: [0], objectives: [{ pod: 1 }] }), 1);
    expect(applyMove(st, { t: 'swap', a: 0, b: 1 }).ok).toBe(false);
    expect(listMoves(st).some((m) => m.a === 0 || (m.t === 'swap' && m.b === 0))).toBe(false);
    settle(st);
    expect(st.kind[0]).toBe(POD); // ice below: the pod waits
    const s2 = newGame(lv(['1@yg', '_rby', 'grgg'], { exits: [1], objectives: [{ pod: 1 }] }), 1);
    settle(s2);
    expect(s2.kind[at(s2, 1, 0)]).toBe(EMPTY); // the shadowed hole is NOT filled by the pod sliding
    expect(s2.kind[at(s2, 0, 1)]).toBe(POD);
  });
  it('G24 goo: a touched blob does not spread; an untouched one spreads 1 cell (seeded); no spread after a tool', () => {
    const g = ['xggbg', 'rgbry', 'gbyyb', 'rgbyb'];
    const mk = () => newGame(lv(g, { objectives: [{ goo: true }] }), 1);
    const count = (s: GameState) => { let n = 0; for (let i = 0; i < s.N; i += 1) if (s.kind[i] === GOO) n += 1; return n; };
    const touch = mk(); applyMove(touch, { t: 'swap', a: 3, b: 4 });
    expect(count(touch)).toBe(0);
    const a = mk(), b = mk();
    applyMove(a, { t: 'swap', a: 8, b: 9 }); applyMove(b, { t: 'swap', a: 8, b: 9 });
    expect(count(a)).toBe(2);
    expect(boardString(a)).toBe(boardString(b));
    const t = mk(); applyBooster(t, { t: 'drill', a: at(t, 3, 4) });
    expect(count(t)).toBe(1);
  });
  it('G25 shuffle: no standing match, at least one move, ice and specials untouched', () => {
    const L = parseLevel({ id: 'g25', colors: 'rgb', grid: ['rgbrg', 'bR>gb', 'gbrgr', 'rgbrb'], objectives: [{ energy: 999 }] });
    const st = newGame(L, 1);
    shuffle(st);
    expect(findGroups(st).length).toBe(0);
    expect(countMoves(st)).toBeGreaterThan(0);
    expect(st.kind[at(st, 1, 2)]).toBe(RH);
    expect(st.ice[at(st, 1, 1)]).toBe(1);
    expect(st.color[at(st, 1, 1)]).toBe(0);
  });
  it('G26 star lines (1-01 = [0,0] → always 3★)', () => {
    expect(starsFor({ stars: [0, 0] }, 0)).toBe(3);
    expect(starsFor({ stars: [3, 5] }, 2)).toBe(1);
    expect(starsFor({ stars: [3, 5] }, 3)).toBe(2);
    expect(starsFor({ stars: [3, 5] }, 5)).toBe(3);
  });
  it('G27 replay: same seed + same ops (with tools) = same board', () => {
    const L = parseLevel({ id: 'g27', colors: 'rygbp', grid: Array(7).fill('.......'), objectives: [{ collect: 'r', n: 99 }], moves: 30 });
    const a = newGame(L, 9); const ops: ({ m: ReturnType<typeof listMoves>[number] } | { b: { t: 'drill'; a: number } })[] = [];
    const r = rngNew('g27');
    for (let k = 0; k < 12; k += 1) {
      if (k === 5) { const use = { t: 'drill' as const, a: 10 }; applyBooster(a, use); ops.push({ b: use }); continue; }
      const mv = listMoves(a); const m = mv[rngBelow(r, mv.length)]; applyMove(a, m); ops.push({ m });
    }
    const b = newGame(L, 9);
    for (const op of ops) if ('m' in op) expect(applyMove(b, op.m).ok).toBe(true); else expect(applyBooster(b, op.b).ok).toBe(true);
    expect(boardString(b)).toBe(boardString(a));
    expect(remaining(b, L.objectives[0])).toBe(remaining(a, L.objectives[0]));
  });
  it('G28 hint1Candidates only advance objectives (energy level = every move)', () => {
    const L = parseLevel({ id: 'g28', colors: 'rygbp', grid: Array(7).fill('.......'), objectives: [{ collect: 'r', n: 30 }] });
    for (let s = 1; s <= 5; s += 1) {
      const st = newGame(L, s);
      const c = hint1Candidates(st);
      const all = listMoves(st);
      const adv = all.filter((m) => { const x = cloneState(st, true); applyMove(x, m); return x.collected[0] > 0; });
      if (adv.length) expect(c.length).toBe(adv.length);
    }
    const E = parseLevel({ id: 'g28e', colors: 'rygbp', grid: Array(7).fill('.......'), objectives: [{ energy: 100 }] });
    const se = newGame(E, 2);
    expect(hint1Candidates(se).length).toBe(listMoves(se).length);
  });
  it('G29 bestMove: ties go to the first move in listMoves order', () => {
    const st = newGame(lv(['ryrby', 'gbgrg', 'ybyry'], { objectives: [{ energy: 999 }] }), 1);
    const bm = bestMove(st)!;
    const moves = listMoves(st);
    expect(moves.indexOf(moves.find((m) => JSON.stringify(m) === JSON.stringify(bm))!)).toBeGreaterThanOrEqual(0);
    // all candidate swaps make exactly one 3-match: the first listed wins the tie
    expect(JSON.stringify(bm)).toBe(JSON.stringify(moves[0]));
  });
  it('G30 uids follow pieces through swaps, falls and slides and stay unique', () => {
    const L = parseLevel({ id: 'g30', colors: 'rygbp', grid: ['.......', '...1...', '.......', '..-....', '.......', '.......', '.......'], objectives: [{ collect: 'r', n: 99 }] });
    const st = newGame(L, 4, { record: true });
    const r = rngNew('g30');
    for (let k = 0; k < 25; k += 1) {
      const mv = listMoves(st); const m = mv[rngBelow(r, mv.length)];
      const ua = st.uid![m.a];
      applyMove(st, m);
      const seen = new Set<number>();
      for (let i = 0; i < st.N; i += 1) {
        const has = st.kind[i] === PIECE || st.kind[i] === POD || (st.kind[i] >= RH && st.kind[i] <= ORB);
        expect(has ? st.uid![i] > 0 : st.uid![i] === 0).toBe(true);
        if (has) { expect(seen.has(st.uid![i])).toBe(false); seen.add(st.uid![i]); }
      }
      expect(ua).toBeGreaterThan(0);
    }
    // events carry the uids the view animates
    const ev: Ev[] = st.log!;
    expect(ev.some((e) => e.e === 'fall' && e.uid > 0)).toBe(true);
    expect(ev.some((e) => e.e === 'spawn' && e.uid > 0)).toBe(true);
    expect(EMPTY).toBe(0);
  });
  it('kit rng.int(0,n-1) == rngBelow', () => {
    const a = rngNew('x'), b = createRng('x');
    for (let k = 0; k < 100; k += 1) expect(rngBelow(a, 7)).toBe(b.int(0, 6));
  });
});
