// 复盘精彩时刻 + 理由图标 + 棋盒棋局的单测（第 2 轮新增）。
import { describe, expect, it } from 'vitest';
import { detectHighlights, pickHighlights, type Highlight } from '../src/rules/highlights';
import { reasonSpots } from '../src/art/fx';
import { Position, SQ, parseMove, parseSq, whyIllegal } from '../src/rules/position';
import { createRules } from '../src/rules/rules';

const FEN_BOX_A = '1r7/9/9/1n3p3/9/4N4/8P/1C7/9/9 w', FEN_BOX_B = '4k4/R8/9/1R7/9/9/9/9/3P5/3K5 w';
describe('精彩时刻', () => {
  it('将死 → mate（正面 80）', () => { const h = detectHighlights(FEN_BOX_B, ['b7b10'], 0); expect(h.map((x) => x.kind)).toContain('mate'); expect(h.find((x) => x.kind === 'mate')?.score).toBe(80); });
  it('错过一步杀 → missMate（负面 70），箭头指向 b7b10', () => { const h = detectHighlights(FEN_BOX_B, ['a9a8'], 0); const m = h.find((x) => x.kind === 'missMate'); expect(m).toBeTruthy(); expect(m?.positive).toBe(false); expect(m?.arrow).toEqual([parseSq('b7'), parseSq('b10')]); expect(m?.ply).toBe(0); });
  it('白吃一车 → win', () => { const h = detectHighlights('4k4/9/9/9/9/9/9/9/r3R4/3K5 w', ['e2a2'], 0); expect(h.find((x) => x.kind === 'win')).toBeTruthy(); });
  it('走进对方车口被吃 → hang（在对方吃子后的局面 ply = 2）', () => { const h = detectHighlights('4k4/9/9/9/r8/9/9/9/1N7/3K5 w', ['b2a4', 'a6a4'], 0); const x = h.find((y) => y.kind === 'hang'); expect(x).toBeTruthy(); expect(x?.ply).toBe(2); expect(x?.squares).toEqual([parseSq('a4')]); });
  it('马叉双车 → fork（两个目标）', () => { const h = detectHighlights('4k4/2r6/5r3/9/9/2N6/9/9/9/3K5 w', ['c5d7'], 0); const x = h.find((y) => y.kind === 'fork'); expect(x).toBeTruthy(); expect(x?.squares.length).toBe(2); });
  it('只评孩子的着：孩子执黑时不会把红方的将死算给孩子', () => { const h = detectHighlights(FEN_BOX_B, ['b7b10'], 1); expect(h.length).toBe(0); });
  it('挑选：最高正面 → 最高负面 → 第二正面，≤3 条，同一步只留一条，按时间排序', () => {
    const mk = (kind: Highlight['kind'], positive: boolean, score: number, moveIx: number): Highlight => ({ kind, positive, score, ply: moveIx + 1, moveIx, line: 'r.mate', squares: [], text: '' });
    const all = [mk('win', true, 50, 3), mk('mate', true, 80, 9), mk('hang', false, 55, 5), mk('missMate', false, 70, 7), mk('fork', true, 70, 1), mk('win', true, 50, 9)];
    const p = pickHighlights(all); expect(p.length).toBe(3); expect(p.map((x) => x.kind)).toEqual(['fork', 'missMate', 'mate']); expect(new Set(p.map((x) => x.moveIx)).size).toBe(3); expect(p.map((x) => x.moveIx)).toEqual([1, 7, 9]);
  });
  it('随机整盘：不抛错、≤3 条、检测很快（20 盘 < 4 s）', () => {
    const t0 = Date.now(); let seed = 12345; const rnd = (): number => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    for (let g = 0; g < 20; g++) { const pos = Position.fromFen('rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w'); const mv: string[] = []; for (let i = 0; i < 60; i++) { const ms = pos.legal(); if (!ms.length) break; const m = ms[Math.floor(rnd() * ms.length)]; mv.push(`${'abcdefghi'[(m & 127) % 9]}${10 - Math.floor((m & 127) / 9)}${'abcdefghi'[(m >> 7) % 9]}${10 - Math.floor((m >> 7) / 9)}`); pos.make(m); }
      const hs = pickHighlights(detectHighlights('rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w', mv, 0)); expect(hs.length).toBeLessThanOrEqual(3); }
    expect(Date.now() - t0).toBeLessThan(4000);
  });
});
describe('理由图标的格子', () => {
  const P = (fen: string): Position => Position.fromFen(fen);
  it('马腿：图标落在别住它的子上', () => { const pos = P('4k4/9/9/9/9/9/9/4p4/4N4/3K5 w'); const from = parseSq('e2'), to = parseSq('d4'); expect(whyIllegal(pos, from, to)).toBe('horse'); const r = reasonSpots(pos, from, to, 'horse'); expect(r.icons).toEqual([{ kind: 'leg', sq: parseSq('e3') }]); });
  it('象眼：田字中心', () => { const pos = P('4k4/9/9/9/9/9/9/9/3p5/2BK5 w'); const from = parseSq('c1'), to = parseSq('e3'); expect(whyIllegal(pos, from, to)).toBe('eye'); expect(reasonSpots(pos, from, to, 'eye').icons).toEqual([{ kind: 'eye', sq: parseSq('d2') }]); });
  it('炮架：没有架子吃子 → 山图标在目标', () => { const pos = P('4k4/9/9/9/9/9/9/p8/9/C2K5 w'); const from = parseSq('a1'), to = parseSq('a3'); expect(whyIllegal(pos, from, to)).toBe('screen'); expect(reasonSpots(pos, from, to, 'screen').icons[0].kind).toBe('mount'); });
  it('见面：两个将帅连金线（将帅走到同一列也算）', () => { const pos = P('4k4/9/9/9/9/9/9/9/9/3K5 w'); const from = parseSq('d1'), to = parseSq('e1'); expect(whyIllegal(pos, from, to)).toBe('face'); const r = reasonSpots(pos, from, to, 'face'); expect(r.sight).toEqual([to, parseSq('e10')]); });
  it('路被挡：标出第一个挡路的子', () => { const pos = P('4k4/9/9/9/9/9/R3p4/9/9/3K5 w'); const r = reasonSpots(pos, parseSq('a4'), parseSq('i4'), 'block'); expect(r.block).toBe(parseSq('e4')); void SQ; });
});
describe('棋盒棋局', () => {
  it('棋盒 A：炮 b3 隔着马吃车 b10 合法；马 e5 → f7 合法；兵 i4 → i5 合法', () => { const rules = createRules(); const s = rules.fromFen(FEN_BOX_A); const ok = (a: string): boolean => rules.legalMoves(s).includes(parseMove(a)); expect(ok('b3b10')).toBe(true); expect(ok('e5f7')).toBe(true); expect(ok('i4i5')).toBe(true); expect(ok('b3b7')).toBe(false); });
  it('棋盒 B：只有"车 b7 → b10"（及等价）一步将死，其余都不将死', () => { const pos = Position.fromFen(FEN_BOX_B); const mates = pos.legal().filter((m) => { pos.make(m); const over = pos.legal().length === 0; pos.unmake(); return over; }); expect(mates).toEqual([parseMove('b7b10')]); });
});
