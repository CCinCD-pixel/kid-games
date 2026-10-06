/**
 * 暗棋 knowledge and belief (spec §3.11 R11.2, §8.5, §8.10 belief.test): every row of the event table
 * updates the mask as specified; badges follow the strongest constraint; 10 000 sampled assignments
 * all satisfy masks and counts; on a small instance the sampler (without the deployment prior)
 * matches exact enumeration (χ², p > 0.01).
 */
import { describe, expect, test } from 'vitest';
import { createRng } from '@kit/rng';
import { BLUE, RED, parseSq } from '../src/core/board';
import { ALL, badgeOf, bit, certainDead, feasible, inferMask, knowledgeConsistent, newKnowledge, observe, ranksAbove, ranksBelow, sampleAssignment, RANKED, type Knowledge } from '../src/core/belief';
import { parseNote } from '../src/core/notation';
import { BOMB, COUNTS, ENG, FLAG, MARSHAL, MINE, typeFromCode } from '../src/core/pieces';
import { apply } from '../src/core/rules';
import { addPiece, newState, type GameState } from '../src/core/state';

/** an 暗棋 position from { sq: 'r7' | 'bM' … } (pinit = the given square) */
function pos(p: Record<string, string>, turn: 0 | 1 = RED): GameState {
  const s = newState('an');
  for (const [k, v] of Object.entries(p)) addPiece(s, v[0] === 'r' ? RED : BLUE, typeFromCode(v[1]), parseSq(k), true);
  s.turn = turn;
  return s;
}
const pidAt = (s: GameState, at: string): number => s.board[parseSq(at)];
/** play `note` and update RED's knowledge about BLUE; returns the knowledge and the new state */
function play(s: GameState, k: Knowledge, note: string): GameState {
  const a = parseNote(s, note);
  expect(a, note).not.toBeNull();
  const { state, event } = apply(s, a!);
  observe(k, s, event);
  expect(knowledgeConsistent(k, state)).toBe(true);
  return state;
}

describe('belief: initial masks (deployment rules)', () => {
  test('outside a 大本营 → not the flag; not in the back two rows → not a mine; front row → not a bomb', () => {
    // BLUE's rows: row 12 = its back row (r = 6), row 7 = its front row (r = 1)
    const s = pos({ b12: 'bF', a12: 'bM', c11: 'bM', a7: 'b5', e8: 'b2', d10: 'b6', c1: 'rF' });
    const k = newKnowledge(s, RED);
    expect(k.mask[pidAt(s, 'b12')] & bit(FLAG)).toBeTruthy(); // HQ
    expect(k.mask[pidAt(s, 'a12')] & bit(FLAG)).toBe(0);
    expect(k.mask[pidAt(s, 'a12')] & bit(MINE)).toBeTruthy(); // back row
    expect(k.mask[pidAt(s, 'c11')] & bit(MINE)).toBeTruthy(); // second back row
    expect(k.mask[pidAt(s, 'd10')] & bit(MINE)).toBe(0); // r = 3
    expect(k.mask[pidAt(s, 'a7')] & bit(BOMB)).toBe(0); // front row
    expect(k.mask[pidAt(s, 'e8')] & bit(BOMB)).toBeTruthy();
    expect(k.mask[pidAt(s, 'c1')]).toBe(ALL); // own pieces are not tracked
  });
});

describe('belief: the §3.11 event table', () => {
  test('it moved → not a mine or flag (badge: footprints)', () => {
    let s = pos({ c7: 'b5', c1: 'rF', a1: 'r3', d12: 'bF' }, BLUE);
    const k = newKnowledge(s, RED);
    const p = pidAt(s, 'c7');
    s = play(s, k, 'c7-c8');
    expect(k.mask[p] & (bit(MINE) | bit(FLAG))).toBe(0);
    expect(badgeOf(k, p)?.icon).toBe('foot');
  });
  test('it turned a corner on the railway → an engineer ("工")', () => {
    let s = pos({ a7: 'b1', c1: 'rF', b1: 'r3', d12: 'bF' }, BLUE);
    const k = newKnowledge(s, RED);
    const p = pidAt(s, 'a7');
    s = play(s, k, 'a7-e11');
    expect(k.mask[p]).toBe(bit(ENG));
    expect(badgeOf(k, p)?.text).toBe('工');
  });
  test('a trade with a front-row piece is certain (no bombs in the front row): the badge is the rank itself', () => {
    let s = pos({ c6: 'r6', c7: 'b6', c1: 'rF', d12: 'bF' });
    const k = newKnowledge(s, RED);
    const p = pidAt(s, 'c7');
    s = play(s, k, 'c6xc7');
    expect(k.mask[p]).toBe(bit(typeFromCode('6')));
    expect(badgeOf(k, p)?.text).toBe('6');
  });
  test('my rank-r piece attacks it: win → smaller; lose → bigger or a mine; trade → equal or a bomb', () => {
    for (const [mine, theirs, expectMask, txt] of [
      ['r7', 'b4', ranksBelow(7), '7↓'],
      ['r5', 'b8', ranksAbove(5) | bit(MINE), '5↑'],
      ['r6', 'b6', bit(typeFromCode('6')) | bit(BOMB), '6='],
    ] as const) {
      // BLUE's piece on its second row (r = 2): neither a mine nor excluded from being a bomb
      let s = pos({ c7: mine, c8: theirs, c1: 'rF', d12: 'bF' });
      const k = newKnowledge(s, RED);
      const p = pidAt(s, 'c8');
      s = play(s, k, 'c7xc8');
      expect(k.mask[p] & ~expectMask, `${mine}→${theirs}`).toBe(0);
      expect(badgeOf(k, p)?.text).toBe(txt);
    }
  });
  test('my engineer: wins only against a mine; loses only to bigger ranks (never a mine)', () => {
    let s = pos({ c11: 'r1', c12: 'bM', a1: 'rF', b12: 'bF', a12: 'bM' });
    let k = newKnowledge(s, RED);
    const m = pidAt(s, 'c12');
    s = play(s, k, 'c11xc12');
    expect(k.mask[m]).toBe(bit(MINE));
    expect(badgeOf(k, m)?.icon).toBe('mine');
    s = pos({ c6: 'r1', c7: 'b3', a1: 'rF', b12: 'bF' });
    k = newKnowledge(s, RED);
    const q = pidAt(s, 'c7');
    s = play(s, k, 'c6xc7');
    expect(k.mask[q] & bit(MINE)).toBe(0);
    expect(k.mask[q] & ~ranksAbove(1)).toBe(0);
    expect(badgeOf(k, q)?.text).toBe('1↑');
  });
  test('it attacks my rank-r piece: wins → bigger; trade → equal or bomb; loses → smaller (not a bomb)', () => {
    for (const [theirs, mine, expectMask, txt] of [
      ['b8', 'r6', ranksAbove(6), '6↑'],
      ['b6', 'r6', bit(typeFromCode('6')) | bit(BOMB), '6='],
      ['b3', 'r7', ranksBelow(7), '7↓'],
    ] as const) {
      let s = pos({ c8: theirs, c7: mine, c1: 'rF', d12: 'bF' }, BLUE);
      const k = newKnowledge(s, RED);
      const p = pidAt(s, 'c8');
      s = play(s, k, 'c8xc7');
      expect(k.mask[p] & ~expectMask, `${theirs}→${mine}`).toBe(0);
      expect(badgeOf(k, p)?.text).toBe(txt);
    }
  });
  test('it attacks my mine: wins → engineer; trade → bomb; loses → a rank other than engineer', () => {
    for (const [theirs, expectMask] of [['b1', bit(ENG)], ['bB', bit(BOMB)], ['b7', RANKED & ~bit(ENG)]] as const) {
      let s = pos({ c2: theirs, c1: 'rM', a1: 'rF', d12: 'bF', b1: 'rM' }, BLUE);
      const k = newKnowledge(s, RED);
      const p = pidAt(s, 'c2');
      s = play(s, k, 'c2xc1');
      expect(k.mask[p] & ~expectMask, theirs).toBe(0);
    }
  });
  test('my bomb takes part → no information', () => {
    let s = pos({ c6: 'rB', c7: 'b8', c1: 'rF', d12: 'bF' });
    const k = newKnowledge(s, RED);
    const p = pidAt(s, 'c7');
    const before = k.mask[p];
    s = play(s, k, 'c6xc7');
    expect(k.mask[p]).toBe(before);
  });
  test('the enemy flag is shown when its 司令 goes down: the flag is certain, the piece that went down was the 司令', () => {
    let s = pos({ c6: 'rB', c7: 'b9', a12: 'bM', b12: 'bF', d12: 'b4', c1: 'rF' });
    const k = newKnowledge(s, RED);
    const marshal = pidAt(s, 'c7'), flag = pidAt(s, 'b12'), other = pidAt(s, 'd12');
    s = play(s, k, 'c6xc7');
    expect(k.mask[marshal]).toBe(bit(MARSHAL));
    expect(k.mask[flag]).toBe(bit(FLAG));
    expect(k.mask[other] & bit(FLAG)).toBe(0);
    expect(badgeOf(k, flag)?.icon).toBe('flag');
    expect(certainDead(k, s)[MARSHAL]).toBe(1);
  });
  test('infer cards use the same logic (inferMask)', () => {
    expect(inferMask([{ my: '5', act: 'attack', outcome: 'A' }])).toBe(ranksBelow(5));
    expect(inferMask([{ moved: true }]) & (bit(MINE) | bit(FLAG))).toBe(0);
    expect(inferMask([{ moved: true, from: 'a7', to: 'e11' }])).toBe(bit(ENG));
    expect(inferMask([{ my: 'B', act: 'attack', outcome: 'B', flagShown: true }])).toBe(bit(MARSHAL));
  });
});

describe('belief: sampling (PIMC worlds)', () => {
  test('10 000 sampled assignments all satisfy the masks and the per-type counts', () => {
    // a mid-game knowledge state: some masks narrowed
    const masks: number[] = [];
    const pieces: number[] = [];
    const pinit: number[] = [];
    const moved: boolean[] = [];
    const rng0 = createRng('belief:setup');
    let k = 0;
    for (let t = 0; t < 12; t++) {
      for (let n = 0; n < COUNTS[t]; n++) {
        pieces.push(k);
        // squares: back two rows for mines / the flag, anything else for the rest
        pinit.push(t === MINE ? parseSq(['a12', 'c12', 'e11'][n]) : t === FLAG ? parseSq('b12') : parseSq(['a7', 'b7', 'c7', 'd7', 'e7', 'a8', 'c8', 'e8', 'a9', 'b9', 'd9', 'e9', 'a10', 'c10', 'e10', 'b11', 'c11', 'd11', 'a11', 'b10', 'd10'][k % 21]));
        let m = ALL;
        if (t !== FLAG) m &= ~bit(FLAG);
        if (t !== MINE) m &= ~bit(MINE);
        // narrow a few true-type-consistent constraints
        if (rng0.next() < 0.3 && t >= ENG) m &= t >= 8 ? ranksAbove(4) : ranksBelow(7);
        masks.push(m | bit(t));
        moved.push(t !== MINE && t !== FLAG && rng0.next() < 0.5);
        k++;
      }
    }
    expect(feasible(masks, COUNTS)).toBe(true);
    const rng = createRng('belief:sample');
    for (let i = 0; i < 10_000; i++) {
      const a = sampleAssignment({ pieces, masks, pinit, moved }, () => rng.next());
      const cnt = new Array(12).fill(0);
      for (const [p, t] of a) {
        expect(masks[pieces.indexOf(p)] & bit(t)).toBeTruthy();
        cnt[t]++;
      }
      expect(cnt).toEqual(COUNTS);
    }
  }, 20_000);

  test('small instance: the sampler without the prior matches its exact law by enumeration (χ², p > 0.01)', () => {
    // 4 pieces, types {工兵, 排长, 连长} with counts {2, 1, 1}; masks with ties in size (random order)
    const masks = [bit(3) | bit(4), bit(3) | bit(5), bit(3) | bit(4) | bit(5), bit(4) | bit(5)];
    const counts = new Array(12).fill(0);
    counts[3] = 2;
    counts[4] = 1;
    counts[5] = 1;
    // exact law of sampleAssignment(usePrior = false): pieces in order of mask size (ties in a
    // uniformly random order), each takes a type with weight = remaining capacity among the types
    // that keep the rest feasible
    const size = (m: number) => [...Array(12).keys()].filter((t) => m & bit(t)).length;
    const groups = new Map<number, number[]>();
    masks.forEach((m, i) => groups.set(size(m), [...(groups.get(size(m)) ?? []), i]));
    const perms = (xs: number[]): number[][] => (xs.length <= 1 ? [xs] : xs.flatMap((x, i) => perms([...xs.slice(0, i), ...xs.slice(i + 1)]).map((r) => [x, ...r])));
    let orders: number[][] = [[]];
    for (const g of [...groups.keys()].sort((a, b) => a - b)) orders = orders.flatMap((o) => perms(groups.get(g)!).map((p) => [...o, ...p]));
    const law = new Map<string, number>();
    const walk = (order: number[], i: number, cap: number[], assign: number[], prob: number): void => {
      if (i === order.length) {
        const key = assign.join(',');
        law.set(key, (law.get(key) ?? 0) + prob / orders.length);
        return;
      }
      const p = order[i];
      const rest = order.slice(i + 1).map((q) => masks[q]);
      const cands: Array<[number, number]> = [];
      for (let t = 0; t < 12; t++) {
        if (!(masks[p] & bit(t)) || cap[t] === 0) continue;
        cap[t]--;
        const ok = feasible(rest, cap);
        cap[t]++;
        if (ok) cands.push([t, cap[t]]);
      }
      const tot = cands.reduce((a, c) => a + c[1], 0);
      for (const [t, w] of cands) {
        cap[t]--;
        const a2 = assign.slice();
        a2[p] = t;
        walk(order, i + 1, cap, a2, (prob * w) / tot);
        cap[t]++;
      }
    };
    for (const o of orders) walk(o, 0, counts.slice(), [0, 0, 0, 0], 1);
    const N = 8000;
    const rng = createRng('belief:chi');
    const seen = new Map<string, number>();
    for (let i = 0; i < N; i++) {
      const a = sampleAssignment({ pieces: [0, 1, 2, 3], masks, pinit: [0, 0, 0, 0], moved: [false, false, false, false], counts }, () => rng.next(), false);
      const key = [0, 1, 2, 3].map((p) => a.get(p)).join(',');
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    for (const key of seen.keys()) expect(law.has(key), key).toBe(true);
    let chi = 0;
    for (const [key, p] of law) chi += ((seen.get(key) ?? 0) - N * p) ** 2 / (N * p);
    const df = law.size - 1;
    const crit = [0, 6.63, 9.21, 11.34, 13.28, 15.09, 16.81, 18.48, 20.09, 21.67][df] ?? 30; // χ²(df) at 1 %
    expect(law.size).toBeGreaterThan(2);
    expect(chi).toBeLessThan(crit);
  });

  test('infeasible masks throw (the caller falls back to counts only, R6 §10.2)', () => {
    const masks = [bit(3), bit(3), bit(3), bit(3)];
    const counts = new Array(12).fill(0);
    counts[3] = 3;
    counts[4] = 1;
    expect(feasible(masks, counts)).toBe(false);
    const rng = createRng('belief:inf');
    expect(() => sampleAssignment({ pieces: [0, 1, 2, 3], masks, pinit: [0, 0, 0, 0], moved: [false, false, false, false], counts }, () => rng.next())).toThrow('belief infeasible');
  });
});
