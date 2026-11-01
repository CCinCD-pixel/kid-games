import { describe, expect, it } from 'vitest';
import { createGame, replayMoves } from './game';
import { chessRules } from '../test/reference/chess-adapter.mjs';
import { xqRules } from '../test/reference/xq-adapter.mjs';

/* eslint-disable @typescript-eslint/no-explicit-any */
const play = (rules: any, g: any, uci: string): any => { for (const u of uci.trim().split(/\s+/)) { const m = rules.decode(g.state(), u); if (!m && m !== 0) throw new Error('非法 ' + u + ' @ ' + g.fen()); g.play(m); } return g; };
const st = (g: any): string => { const s = g.status(); return s.over ? `${s.reason}:${s.winner === null ? '-' : s.winner}` : 'go'; };

describe('通用 Game · 国象向量', () => {
  const rules = chessRules();
  it('三次重复：第 2 次出现未结束，第 3 次和棋', () => {
    const g = createGame(rules); play(rules, g, 'g1f3 g8f6 f3g1 f6g8'); expect(st(g)).toBe('go');
    expect(g.repCount()).toBe(2); play(rules, g, 'g1f3 g8f6 f3g1 f6g8'); expect(st(g)).toBe('repetition:-');
  });
  it('第 100 个半回合 → 五十回合和；若恰好将死 → 将死优先', () => {
    const g = createGame(rules, '7k/8/6K1/8/8/8/8/R7 w - - 99 80'); expect(g.noProgress()).toBe(99);
    play(rules, g, 'a1a2'); expect(st(g)).toBe('fifty-move:-'); g.undo(); play(rules, g, 'a1a8'); expect(st(g)).toBe('checkmate:0');
  });
  it('子力不足 = 和棋；王车对王仍可赢', () => {
    expect(st(createGame(rules, 'k7/8/8/8/8/8/8/K6R w - - 0 1'))).toBe('go');
    expect(st(createGame(rules, 'k7/8/8/8/8/8/8/K7 w - - 0 1'))).toBe('insufficient:-');
  });
  it('王车易位：两个 move 效果、同阶段', () => {
    const g = createGame(rules, 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    const castle = rules.legalMoves(g.state()).find((m: any) => rules.encode(m) === 'e1g1'); const eff = rules.effects(g.state(), castle);
    expect(eff.filter((e: any) => e.k === 'move').length).toBe(2); expect(new Set(eff.map((e: any) => e.phase)).size).toBe(1);
  });
  it('吃过路兵：capture.sq ≠ to，重置限着', () => {
    const g = createGame(rules, 'rnbqkbnr/ppp1pppp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3');
    const info = rules.moveInfo(g.state(), rules.decode(g.state(), 'e5d6')); expect(info.capture).not.toBeNull(); expect(info.capture!.sq).not.toBe(info.to); expect(info.resetsClock).toBe(true);
  });
  it('升变：同 (from,to) 四条着法', () => {
    const g = createGame(rules, '8/P6k/8/8/8/8/8/K7 w - - 0 1');
    const all = rules.legalMoves(g.state()).filter((m: any) => rules.encode(m).startsWith('a7a8'));
    expect(all.length).toBe(4); expect(new Set(all.map((m: any) => rules.moveInfo(g.state(), m).promotion)).size).toBe(4);
  });
  it('过路兵格不合法时不入重复键', () => {
    const g = createGame(rules); play(rules, g, 'e2e4'); const g2 = createGame(rules, 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1');
    expect(g2.keys[0]).toEqual(g.keys[1]);
  });
  it('陨石：兵被挡', () => {
    const g = createGame(rules, '4k3/8/8/8/3X4/8/3P4/4K3 w - - 0 1'); const mm = rules.legalMoves(g.state()).map((m: any) => rules.encode(m));
    expect(mm).toContain('d2d3'); expect(mm).not.toContain('d2d4');
  });
  it('replayMoves 遇非法着法截断', () => {
    const r = replayMoves(rules, rules.toFen(rules.initial()), ['e2e4', 'e7e5', 'e2e4', 'g1f3']); expect(r.applied).toBe(2); expect(r.truncated).toBe(true); expect(r.game.ply()).toBe(2);
  });
  it('undo 精确恢复 captured / materialDiff', () => {
    const g = createGame(rules, 'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2'); play(rules, g, 'e4d5');
    expect(g.captured(1).length).toBe(1); expect(g.materialDiff(0)).toBe(1); expect(g.materialDiff(1)).toBe(-1); g.undo();
    expect(g.captured(1).length).toBe(0); expect(g.materialDiff(0)).toBe(0);
  });
});

describe('通用 Game · 象棋长将窗口', () => {
  const rules = xqRules();
  const P9 = '4k4/R8/9/9/9/9/9/9/9/3K5 w';
  const seq = 'a9a10 e10e9 a10a9 e9e10 a9a10 e10e9 a10a9 e9e10'.split(' ');
  it('第 8 步红长将判负（winner = 1），前 7 步未结束', () => {
    const g = createGame(rules, P9); const states: string[] = [];
    for (const u of seq) { g.play(rules.decode(g.state(), u)); states.push(st(g)); }
    expect(states[7]).toBe('perpetual-check:1'); expect(states.slice(0, 7).every((x) => x === 'go')).toBe(true);
  });
  it('第 2 次出现且走子方是长将方 → warn()', () => {
    const z = createGame(rules, P9); for (const u of seq.slice(0, 4)) z.play(rules.decode(z.state(), u));
    expect(z.warn()).toEqual({ warn: true, side: 0 });
  });
  it('wouldEndBadly：红再走 a9a10 立刻被判长将负，走 a9a8 不会', () => {
    const q = createGame(rules, 'R3k4/9/9/9/9/9/9/9/9/3K5 b');
    for (const u of 'e10e9 a10a9 e9e10 a9a10 e10e9 a10a9 e9e10'.split(' ')) q.play(rules.decode(q.state(), u));
    expect(q.wouldEndBadly(rules.decode(q.state(), 'a9a10'))).toBe(true); expect(q.wouldEndBadly(rules.decode(q.state(), 'a9a8'))).toBe(false);
  });
  it('窗口里插入安静着 → 不判长将（和棋）', () => {
    const g = createGame(rules, P9);
    for (const u of 'a9a10 e10e9 a10a9 e9e10 a9a8 e10e9 a8a9 e9e10 a9a10 e10e9'.split(' ')) g.play(rules.decode(g.state(), u));
    const o = g.status(); expect(o.over && o.winner !== null).toBe(false);
  });
  it('家规 cfg：stalemate=draw 的规则对象可创建并起局', () => {
    const r2 = xqRules({ stalemate: 'draw' }); const g = createGame(r2); expect(g.status().over).toBe(false); expect(g.legalMoves().length).toBe(44);
  });
});
