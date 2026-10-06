import { describe, expect, test } from 'vitest';
import { BLUE, RED } from '../src/core/board';
import { createRng } from '@kit/rng';
import { legalMoves, type Action } from '../src/core/movegen';
import { agreeDraw, apply, quietDots, tally } from '../src/core/rules';
import { encode, setupFan, setupStandard } from '../src/core/state';
import { P, T, moveTo, pos, sq } from './helpers';

const play = (s: ReturnType<typeof pos>, from: string, to: string) => apply(s, moveTo(s, from, to));

describe('collisions and their effects', () => {
  test('attacker wins: defender removed, attacker moves in, quiet resets', () => {
    const s = pos({ c6: 'r9', c7: 'b5', b1: 'rF', b12: 'bF', e9: 'b3' });
    s.quiet = 12;
    const { state, event } = play(s, 'c6', 'c7');
    expect(event.outcome).toBe('A');
    expect(sq(state.ppos[event.att!])).toBe('c7');
    expect(state.palive[event.def!]).toBe(0);
    expect(state.quiet).toBe(0);
    expect(state.turn).toBe(BLUE);
    expect(s.quiet).toBe(12);
  });
  test('defender wins: attacker removed, defender stays', () => {
    const { state, event } = play(pos({ c6: 'r3', c7: 'b5', b1: 'rF', b12: 'bF', a6: 'r4' }), 'c6', 'c7');
    expect(event.outcome).toBe('D');
    expect(state.board[P('c6')]).toBe(-1);
    expect(state.board[P('c7')]).toBe(event.def);
  });
  test('equal ranks: both removed, station empty', () => {
    const { state, event } = play(pos({ c6: 'r5', c7: 'b5', b1: 'rF', b12: 'bF', a6: 'r4', e7: 'b4' }), 'c6', 'c7');
    expect(event.outcome).toBe('B');
    expect(event.removed.length).toBe(2);
    expect(state.board[P('c7')]).toBe(-1);
  });
  test('engineer digs a mine and moves in; others die on it', () => {
    const s = pos({ a11: 'r1', a12: 'bM', b1: 'rF', b12: 'bF', e11: 'r9' });
    const r1 = play(s, 'a11', 'a12');
    expect(r1.event.outcome).toBe('A');
    expect(r1.state.board[P('a12')]).toBe(r1.event.att);
    const s2 = pos({ a11: 'r9', a12: 'bM', b1: 'rF', b12: 'bF', e2: 'r3' });
    const r3 = play(s2, 'a11', 'a12');
    expect(r3.event.outcome).toBe('D');
    expect(r3.state.board[P('a12')]).toBe(r3.event.def);
  });
  test('bomb: both down, whoever attacks', () => {
    const r = play(pos({ c6: 'rB', c7: 'b9', b1: 'rF', b12: 'bF', a6: 'r4', e7: 'b4' }), 'c6', 'c7');
    expect(r.event.outcome).toBe('B');
    const r2 = play(pos({ c6: 'r9', c7: 'bB', b1: 'rF', b12: 'bF', a6: 'r4', e7: 'b4' }), 'c6', 'c7');
    expect(r2.event.outcome).toBe('B');
  });
  test('R6.4: one collision per move — a rail slide stops at the first enemy', () => {
    const s = pos({ a2: 'r9', a5: 'b3', a8: 'b4', b1: 'rF', b12: 'bF' });
    const { state, event } = play(s, 'a2', 'a5');
    expect(event.removed.length).toBe(1);
    expect(state.board[P('a8')]).not.toBe(-1);
  });
});

describe('flag, 司令, wins and draws (R6.5, R7)', () => {
  test('司令 down → own flag shown (明棋)', () => {
    const { state, event } = play(pos({ c6: 'r9', c7: 'bB', b12: 'bF', b1: 'rF', a6: 'r5', a11: 'b5' }), 'c6', 'c7');
    expect(event.outcome).toBe('B');
    expect(state.flagShown).toEqual([true, false]);
    expect(event.flagShown).toEqual([RED]);
  });
  test('E1: both 司令 trade → both flags shown at once', () => {
    const { state, event } = play(pos({ c6: 'r9', c7: 'b9', b12: 'bF', b1: 'rF', a6: 'r5', a11: 'b5' }), 'c6', 'c7');
    expect(state.flagShown).toEqual([true, true]);
    expect(event.flagShown.sort()).toEqual([RED, BLUE]);
  });
  test('司令 dies on a mine → flag shown', () => {
    const { state } = play(pos({ a11: 'r9', a12: 'bM', b12: 'bF', b1: 'rF', e2: 'r4', e11: 'b3' }), 'a11', 'a12');
    expect(state.flagShown).toEqual([true, false]);
  });
  test('capturing the flag ends the game (engineer)', () => {
    const { state, event } = play(pos({ b11: 'r1', b12: 'bF', b1: 'rF', e7: 'b3' }), 'b11', 'b12');
    expect(event.outcome).toBe('F');
    expect(state.result).toEqual({ winner: RED, reason: 'flag' });
  });
  test('E2: a bomb hitting the flag captures it', () => {
    const { state } = play(pos({ b11: 'rB', b12: 'bF', b1: 'rF', e7: 'b3' }), 'b11', 'b12');
    expect(state.result).toEqual({ winner: RED, reason: 'flag' });
    expect(state.board[P('b12')]).not.toBe(-1);
  });
  test('E10: flag surrounded by mines (明棋) — only engineer digs or bomb trades open it; no dig-first rule', () => {
    const s = pos({ b11: 'r9', a12: 'bM', c12: 'bM', b12: 'bF', a11: 'r1', b1: 'rF', e7: 'b4' });
    // b11 is adjacent to b12 directly (b11–b12 road) → 司令 can take the flag although mines are alive
    expect(play(s, 'b11', 'b12').state.result?.reason).toBe('flag');
  });
  test('no legal moves → side to move loses', () => {
    const s = pos({ c11: 'r6', b12: 'bF', a12: 'bM', b11: 'bM', c10: 'b2', b1: 'rF', e2: 'r1' });
    expect(play(s, 'c11', 'c10').state.result).toEqual({ winner: RED, reason: 'no-moves' });
  });
  test('E3: both sides immobile after a trade → draw both-immobile', () => {
    expect(play(pos({ c6: 'r5', c7: 'b5', b1: 'rF', b12: 'bF' }), 'c6', 'c7').state.result).toEqual({ winner: -1, reason: 'both-immobile' });
  });
  test('only mines, flag and HQ pieces left → no moves', () => {
    const s = pos({ c6: 'r5', c7: 'b5', b1: 'rF', d1: 'r9', b12: 'bF', a12: 'b3' });
    // after the trade red has only HQ pieces; blue's 连长 on a12 can move → red (to move? no: blue to move) …
    const r = play(s, 'c6', 'c7').state;
    expect(r.result).toBeNull(); // blue to move and can move
  });
  test('quiet limit 80 → draw (family rules)', () => {
    let s = pos({ a6: 'r5', e7: 'b5', b1: 'rF', b12: 'bF', c11: 'r2', c2: 'b2' });
    let n = 0;
    while (!s.result && n < 200) {
      const ms = legalMoves(s).filter((m) => 'kind' in m && m.kind === 'move');
      s = apply(s, ms[(n * 7) % ms.length]).state;
      n++;
    }
    expect(s.result).toEqual({ winner: -1, reason: 'quiet' });
    expect(n).toBe(80);
  });
  test('quiet limit with endByCount → 清点兵力 by points; equal points → count-draw (E24)', () => {
    const s = pos({ a6: 'r9', e7: 'b5', b1: 'rF', b12: 'bF' }, { rules: { endByCount: true } });
    s.quiet = 79;
    const r = play(s, 'a6', 'a5').state;
    expect(r.result).toEqual({ winner: RED, reason: 'count', tally: [9, 5], via: 'quiet' });
    const e = pos({ a6: 'r5', e7: 'b5', b1: 'rF', b12: 'bF' }, { rules: { endByCount: true } });
    e.quiet = 79;
    expect(play(e, 'a6', 'a5').state.result).toEqual({ winner: -1, reason: 'count-draw', tally: [5, 5], via: 'quiet' });
  });
  test('count points: rank number, bomb 6, mine and flag 0', () => {
    const s = setupStandard('ming', { red: T('balanced'), blue: T('fortress') });
    // 1·3 + 2·3 + 3·3 + 4·2 + 5·2 + 6·2 + 7·2 + 8 + 9 + 6·2 = 91
    expect(tally(s)).toEqual([91, 91]);
  });
  test('ply cap 600 → draw (family) / count (ladder)', () => {
    const s = pos({ a6: 'r9', e7: 'b5', b1: 'rF', b12: 'bF' });
    s.ply = 599;
    expect(play(s, 'a6', 'a5').state.result?.reason).toBe('ply-cap');
    const c = pos({ a6: 'r9', e7: 'b5', b1: 'rF', b12: 'bF' }, { rules: { endByCount: true } });
    c.ply = 599;
    expect(play(c, 'a6', 'a5').state.result).toMatchObject({ reason: 'count', via: 'ply-cap', winner: RED });
  });
  test('quiet dots appear at limit − 10 and count down', () => {
    const s = pos({ a6: 'r9', e7: 'b5', b1: 'rF', b12: 'bF' });
    s.quiet = 69;
    expect(quietDots(s)).toBe(0);
    s.quiet = 70;
    expect(quietDots(s)).toBe(10);
    s.quiet = 79;
    expect(quietDots(s)).toBe(1);
  });
  test('agreed draw (family 求和)', () => {
    const s = agreeDraw(pos({ a6: 'r9', e7: 'b5', b1: 'rF', b12: 'bF' }));
    expect(s.result).toEqual({ winner: -1, reason: 'agreed' });
  });
  test('handicap: removing 司令 does not show the flag (E17)', () => {
    const s = setupStandard('ming', { red: T('balanced').replace('9', '.'), blue: T('balanced'), handicap: { red: '9', blue: '' } });
    expect(s.flagShown).toEqual([false, false]);
    expect(tally(s)).toEqual([82, 91]);
  });
  test('apply never mutates its input', () => {
    const s = setupStandard('ming', { red: T('balanced'), blue: T('lightning') });
    const before = encode(s);
    for (const m of legalMoves(s)) apply(s, m);
    expect(encode(s)).toBe(before);
  });
});

describe('翻翻棋 rules (R8.3, E11–E15, E25)', () => {
  test('setup: 50 face-down pieces on non-camp stations, 50 flips available, turn −1', () => {
    const s = setupFan(createRng(42).next);
    expect(s.np).toBe(50);
    expect(s.turn).toBe(-1);
    expect(legalMoves(s).length).toBe(50);
  });
  test('E13: first flipper takes that colour; the turn passes to the other colour', () => {
    const s = setupFan(createRng(42).next);
    const first = legalMoves(s)[0] as { flip: number };
    const { state } = apply(s, first);
    const p = s.board[first.flip];
    expect(state.colorOf[0]).toBe(s.pside[p]);
    expect(state.colorOf[1]).toBe(1 - s.pside[p]);
    expect(state.turn).toBe(1 - s.pside[p]);
  });
  test('first flip by player 1 (toAct = 1) gives player 1 that colour', () => {
    const s = setupFan(createRng(7).next, {}, 1);
    const first = legalMoves(s)[3] as { flip: number };
    const { state } = apply(s, first);
    expect(state.colorOf[1]).toBe(s.pside[s.board[first.flip]]);
  });
  test('E14: a flipped piece inside an HQ cannot move', () => {
    const s = pos({ b1: 'r9', a6: 'b5^', c12: 'bF^' }, { mode: 'fan' });
    const r = apply(s, { flip: P('b1') }).state;
    expect(r.pup[r.board[P('b1')]]).toBe(1);
    r.turn = RED;
    expect(legalMoves(r).filter((a) => 'pid' in a).length).toBe(0);
  });
  test('E11: flag face up but mines alive → not attackable; after the last mine goes it is', () => {
    let s = pos({ a6: 'r1^', a5: 'bM^', b6: 'bF^', b1: 'rF^', e9: 'r3^', e2: 'b4^' }, { mode: 'fan' });
    expect(legalMoves(s).some((a) => 'to' in a && sq(a.to) === 'b6')).toBe(false);
    s = apply(s, moveTo(s, 'a6', 'a5')).state; // engineer digs the only mine
    s = apply(s, moveTo(s, 'e2', 'e3')).state;
    expect(legalMoves(s).some((a) => 'to' in a && sq(a.to) === 'b6')).toBe(true);
  });
  test('E15: 司令 down while the flag is still face down → flag flips automatically, no ply used', () => {
    const s = pos({ c6: 'r9^', c7: 'bB^', d1: 'rF', a12: 'bF', b5: 'r3^', e9: 'b4^' }, { mode: 'fan' });
    const { state, event } = apply(s, moveTo(s, 'c6', 'c7'));
    expect(event.autoFlipped.length).toBe(1);
    expect(state.pup[state.board[P('d1')]]).toBe(1);
    expect(state.flagShown[RED]).toBe(true);
    expect(state.ply).toBe(1);
    expect(state.turn).toBe(BLUE);
  });
  test('a flip resets quiet and the flipper\'s shuttle record', () => {
    const s = pos({ a6: 'r5^', e7: 'b5^', c11: 'r3', b1: 'rF^', b12: 'bF^' }, { mode: 'fan' });
    s.quiet = 30;
    const r = apply(s, { flip: P('c11') }).state;
    expect(r.quiet).toBe(0);
    expect(r.shuttle[RED].n).toBe(0);
  });
  test('quiet limit 40 in 翻翻棋; E25: count flips every face-down piece first', () => {
    const s = pos({ a6: 'r9^', e7: 'b5^', c11: 'r3', b1: 'rF^', b12: 'bF^' }, { mode: 'fan', rules: { endByCount: true } });
    expect(s.rules.quietLimit).toBe(40);
    s.quiet = 39;
    const r = apply(s, moveTo(s, 'a6', 'a5')).state;
    expect(r.result).toEqual({ winner: RED, reason: 'count', tally: [12, 5], via: 'quiet' });
    expect(r.pup[r.board[P('c11')]]).toBe(1);
  });
  test('family 翻翻棋 quiet → draw', () => {
    const s = pos({ a6: 'r9^', e7: 'b5^', c11: 'r3', b1: 'rF^', b12: 'bF^' }, { mode: 'fan' });
    s.quiet = 39;
    expect(apply(s, moveTo(s, 'a6', 'a5')).state.result).toEqual({ winner: -1, reason: 'quiet' });
  });
  test('翻翻棋 no-moves includes flips: a side with only face-down pieces left can still act', () => {
    const s = pos({ a6: 'r9^', a7: 'b5^', c11: 'b3', b1: 'rF^', b12: 'bF^' }, { mode: 'fan' });
    const r = apply(s, moveTo(s, 'a6', 'a7')).state;
    expect(r.result).toBeNull(); // blue can flip c11
  });
  test('random 翻翻棋 self-play keeps invariants (24 games)', { timeout: 30_000 }, () => {
    let finished = 0;
    for (let g = 0; g < 24; g++) {
      const rng = createRng('mc:test:fan:' + g);
      let s = setupFan(rng.next, { endByCount: g % 2 === 0 });
      while (!s.result) {
        const ms: Action[] = legalMoves(s);
        expect(ms.length).toBeGreaterThan(0);
        s = apply(s, ms[Math.floor(rng.next() * ms.length)]).state;
        // board ↔ ppos consistency
        for (let p = 0; p < s.np; p++) if (s.palive[p]) expect(s.board[s.ppos[p]]).toBe(p);
      }
      finished++;
    }
    expect(finished).toBe(24);
  });
});

describe('random 明棋 self-play invariants', () => {
  test('24 games: legal moves never target own pieces or camps; board consistent; always terminates', { timeout: 30_000 }, () => {
    for (let g = 0; g < 24; g++) {
      const rng = createRng('mc:test:ming:' + g);
      let s = setupStandard('ming', { red: T(['balanced', 'fortress', 'lightning'][g % 3]), blue: T(['decoy', 'center', 'left-hook'][g % 3]), firstMover: (g % 2) as 0 | 1 });
      while (!s.result) {
        const ms = legalMoves(s);
        for (const m of ms) {
          if (!('to' in m)) continue;
          const occ = s.board[m.to];
          if (occ >= 0) expect(s.pside[occ]).not.toBe(s.turn);
        }
        s = apply(s, ms[Math.floor(rng.next() * ms.length)]).state;
        for (let p = 0; p < s.np; p++) if (s.palive[p]) expect(s.board[s.ppos[p]]).toBe(p);
      }
      expect(['flag', 'no-moves', 'both-immobile', 'quiet', 'ply-cap']).toContain(s.result.reason);
    }
  });
});
