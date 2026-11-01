import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { diffAgainst, type OracleGame } from './diff';
import { xqRules } from './reference/xq-adapter.mjs';
import puzzles from './fixtures/xq-puzzles.v1.json';

// @weshell/xiangqi.js 是 package.json 的 dependencies 之一（RULES-R 禁改依赖，只写明现状）；坐标：本引擎 a1..i10，库 a0..i9
const Chess = createRequire(import.meta.url)('@weshell/xiangqi.js').Chess as new (fen?: string) => { moves(o: { verbose: true }): { lan: string }[]; isCheck(): boolean; move(lan: string): unknown };
const toMine = (lan: string): string => lan.replace(/^([a-i])(\d)([a-i])(\d)$/, (_, a: string, b: string, c: string, d: string) => `${a}${+b + 1}${c}${+d + 1}`);
const toLib = (s: string): string => s.replace(/^([a-i])(\d+)([a-i])(\d+)$/, (_, a: string, b: string, c: string, d: string) => `${a}${+b - 1}${c}${+d - 1}`);
const make = (fen: string): OracleGame => { const lib = new Chess(fen.split(' ').length > 2 ? fen : `${fen} - - 0 1`); return { legalMoves: () => lib.moves({ verbose: true }).map((m) => toMine(m.lan)), inCheck: () => lib.isCheck(), play: (enc) => void lib.move(toLib(enc)) }; };
const rules = xqRules(); const full = !!process.env.XQ_FULL;
const startFen = rules.toFen(rules.initial());
const pz = [...puzzles.mate1, ...puzzles.mate2].map((p) => p.fen);

describe('差分测试：xq 参考规则 vs @weshell/xiangqi.js（独立实现）', () => {
  it(`随机对局 ${full ? 300 : 24} 局 + 谜题局面：合法着法集合与将军状态逐局面一致（0 不一致）`, () => {
    const r = diffAgainst(rules, make, { starts: [startFen], games: full ? 300 : 24, maxPly: full ? 160 : 70, seed: 20261013, extra: pz });
    console.info(`diff: ${r.positions} 个局面，其中被将军 ${r.checks}，终局 ${r.terminals}，不一致 ${r.mismatches}`);
    expect(r.first).toBeNull(); expect(r.mismatches).toBe(0); expect(r.positions).toBeGreaterThan(full ? 20000 : 1500); expect(r.checks).toBeGreaterThan(0);
  }, 600000);
  it('确实能抓到不一致（对 oracle 动手脚）', () => {
    const bad = (fen: string): OracleGame => { const o = make(fen); return { ...o, legalMoves: () => o.legalMoves().slice(1) }; };
    expect(diffAgainst(rules, bad, { starts: [startFen], games: 1, maxPly: 3 }).mismatches).toBe(1);
    const bad2 = (fen: string): OracleGame => { const o = make(fen); return { ...o, inCheck: () => true }; };
    expect(diffAgainst(rules, bad2, { starts: [startFen], games: 1, maxPly: 3 }).first?.what).toBe('check');
  });
});
