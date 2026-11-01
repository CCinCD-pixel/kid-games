// V1 perft · V2 规则向量（重复 / 长将 / 限着 / 家规 / 哈希 / 撤销 / whyIllegal）· V15 引擎一致性套件 C01–C16。
// 来源：xiangqi-tools/{perft,rule-vectors}.mjs 的 TS 版，跑的是页面与 Worker 用的同一份 rules。XQ_FULL=1 加大模糊规模。
import { describe, expect, it } from 'vitest';
import { createGame, type GameImpl } from '@engines/board/core/game';
import { createRng } from '@engines/board/core/rng';
import { runConformance } from '@engines/board/test/run-conformance';
import { BLACK, Position, RED, START_FEN, WHY, fenOf, handicapFen, parseMove, perft, whyIllegal } from '../src/rules/position';
import { createRules, type XqCfg } from '../src/rules/rules';

const FULL = !!process.env.XQ_FULL;
const rules = createRules();
const mkGame = (fen: string, cfg: Partial<XqCfg> = {}): GameImpl<number, Position> => createGame(createRules(cfg), fen);
const st = (g: GameImpl<number, Position>): string => { const s = g.status(); return s.over ? `${s.reason}:${s.winner === null ? '-' : s.winner === RED ? 'R' : 'B'}` : 'go'; };
const step = (g: GameImpl<number, Position>, seq: string): string[] => seq.trim().split(/\s+/).map((t) => { const m = parseMove(t); if (!g.legalMoves().includes(m)) throw new Error(`非法着法 ${t} @ ${g.fen()}`); g.play(m); return st(g); });
const P1 = fenOf({ d1: 'K', a9: 'R', e10: 'k' }, 'w'); const CYC = 'a9a10 e10e9 a10a9 e9e10';

describe('V1 perft（开局 1–4 层）', () => {
  it('44 / 1920 / 79 666 / 3 290 240', () => {
    const p = Position.start();
    expect([1, 2, 3, 4].map((d) => perft(p, d))).toEqual([44, 1920, 79666, 3290240]);
  }, 60_000);
  it('让子起始局面可走；FEN 往返', () => {
    for (const k of ['knight', 'knights', 'rook', 'cannon'] as const) for (const side of [RED, BLACK]) { const p = Position.fromFen(handicapFen(k, side)); expect(perft(p, 1)).toBeGreaterThan(0); expect(p.fen()).toBe(handicapFen(k, side)); }
    expect(Position.fromFen(START_FEN).fen()).toBe(START_FEN);
  });
});

describe('V2 规则向量（重复 / 长将 / 限着 / 家规）', () => {
  it('V01 红长将：第 8 步（起始局面第 3 次）判红负', () => { const s = step(mkGame(P1), CYC + ' ' + CYC); expect(s.slice(0, 7).every((x) => x === 'go')).toBe(true); expect(s[7]).toBe('perpetual-check:B'); });
  it('V02 预警：第 2 次出现且红走子 → warn；家规 off 不预警；黑走子时不预警', () => {
    const g = mkGame(P1); step(g, CYC); expect(g.warn()).toEqual({ warn: true, side: RED });
    const g0 = mkGame(P1, { perpetual: 'off' }); step(g0, CYC); expect(g0.warn().warn).toBe(false);
    const g2 = mkGame(P1); step(g2, CYC + ' a9a10'); expect(g2.warn().warn).toBe(false);
  });
  it('V03 第三次出现落在红（将军方）走完：黑先走起点', () => {
    const s = step(mkGame(fenOf({ d1: 'K', a10: 'R', e10: 'k' }, 'b')), 'e10e9 a10a9 e9e10 a9a10 e10e9 a10a9 e9e10 a9a10');
    expect(s[7]).toBe('perpetual-check:B'); expect(s.slice(0, 7).every((x) => x === 'go')).toBe(true);
  });
  it('V04 循环前有引入步（不将军）不影响：引入 2 步 + 2 个循环 → 红负，窗口起点 = 引入步之后', () => {
    const f = fenOf({ f1: 'K', a8: 'R', e10: 'k' }, 'w'); const seq = 'a8a9 e10d10 a9a10 d10d9 a10a9 d9d10 a9a10 d10d9 a10a9 d9d10';
    const g = mkGame(f); const s = step(g, seq); expect(s[9]).toBe('perpetual-check:B'); expect(s.slice(0, 9).every((x) => x === 'go')).toBe(true);
    expect(g.occurrences(3)?.[0]).toBe(2);
  });
  it('V05 窗口里红有一步不将军 → 判和（不是长将）', () => { const s = step(mkGame(fenOf({ f1: 'K', a8: 'R', e10: 'k' }, 'w')), 'a8a9 e10d10 a9a10 d10d9 a10a9 d9d10 a9a8 d10d9 a8a9 d9d10'); expect(s[9]).toBe('repetition:-'); });
  it('V06 悔棋跨越判决：undo 后继续；全部撤销回起点', () => {
    const g = mkGame(P1); step(g, CYC + ' ' + CYC); expect(st(g)).toBe('perpetual-check:B'); g.undo(); expect(st(g)).toBe('go'); g.play(parseMove('e9e10')); expect(st(g)).toBe('perpetual-check:B');
    while (g.moves.length) g.undo(); expect(g.keys.length).toBe(1); expect(g.noProgress()).toBe(0); expect(g.fen()).toBe(mkGame(P1).fen());
  });
  it('V07 让子起始局面参与重复（让左马）', () => { const s = step(mkGame(handicapFen('knight', BLACK)), 'b1c3 b10c8 c3b1 c8b10 b1c3 b10c8 c3b1 c8b10'); expect(s[7]).toBe('repetition:-'); expect(s[3]).toBe('go'); });
  it('V08 家规 perpetual：loss / warn / off', () => { for (const [mode, exp] of [['loss', 'perpetual-check:B'], ['warn', 'repetition:-'], ['off', 'repetition:-']] as const) expect(step(mkGame(P1, { perpetual: mode }), CYC + ' ' + CYC)[7]).toBe(exp); });
  it('V09 限着：第 N 步无吃子 → 和；吃子重置；limit=0 不限；undo 恢复', () => {
    const b2 = fenOf({ d1: 'K', f10: 'k', a2: 'R', i3: 'R' }, 'w'); const quiet = 'a2a3 f10f9 a3a4 f9f10 a4a5 f10f9 a5a6 f9f10';
    const g = mkGame(b2, { limit: 6 }); const s = step(g, quiet.split(' ').slice(0, 6).join(' ')); expect(s.slice(0, 5).every((x) => x === 'go')).toBe(true); expect(s[5]).toBe('no-capture-limit:-'); g.undo(); expect(st(g)).toBe('go'); expect(g.noProgress()).toBe(5);
    expect(step(mkGame(b2, { limit: 0 }), quiet).every((x) => x === 'go')).toBe(true);
    const g3 = mkGame(fenOf({ d1: 'K', f10: 'k', a2: 'R', a9: 'p', i3: 'R' }, 'w'), { limit: 4 }); const s3 = step(g3, 'a2a3 f10f9 a3a9 f9f10 a9a8 f10f9'); expect(s3.every((x) => x === 'go')).toBe(true); expect(g3.noProgress()).toBe(3);
    expect(createRules().meta.clockPlies).toBe(120); expect(createRules({ limit: 0 }).meta.clockPlies).toBeNull();
  });
  it('V10 将死优先于限着', () => { const g = mkGame(fenOf({ d1: 'K', e10: 'k', i1: 'R', i9: 'R' }, 'w'), { limit: 1 }); g.play(parseMove('i1i10')); expect(st(g)).toBe('checkmate:R'); });
  it('V11 困毙家规 loss / draw', () => { const f = fenOf({ e1: 'K', e2: 'R', a9: 'R', d10: 'k' }, 'b'); expect(st(mkGame(f, { stalemate: 'loss' }))).toBe('stalemate-loss:R'); expect(st(mkGame(f, { stalemate: 'draw' }))).toBe('stalemate-draw:-'); });
  it('V12 无进攻子力 → 和；有兵则不', () => { expect(st(mkGame(fenOf({ e1: 'K', d10: 'k', d1: 'A', f10: 'a' }, 'w')))).toBe('no-attackers:-'); expect(st(mkGame(fenOf({ e1: 'K', d10: 'k', d1: 'A', a5: 'P' }, 'w')))).toBe('go'); });
  it('V13 两车与将往返、无将军 → 第 3 次出现和棋（无长将）', () => { const s = step(mkGame(fenOf({ f1: 'K', e10: 'k', i1: 'R', i9: 'R' }, 'w')), 'i1i2 e10d10 i2i1 d10e10 i1i2 e10d10 i2i1 d10e10'); expect(s[7]).toBe('repetition:-'); expect(s.slice(0, 7).every((x) => x === 'go')).toBe(true); });
  it('V14 重复键含走子方', () => { expect(Position.fromFen(P1).key()).not.toBe(Position.fromFen(P1.replace(' w', ' b')).key()); });
  it('V15 互相长将（真实对局）：每步双方都将军 → 判和', () => {
    const g = mkGame('9/5k2N/9/4c4/4r4/9/9/4C4/4R4/n3K4 w'); const s = step(g, 'e2f2 e6f6 e3f3 f6e6 f3e3 e6f6 e3f3 f6e6 f3e3');
    expect(s[8]).toBe('repetition:-'); expect(s.slice(0, 8).every((x) => x === 'go')).toBe(true); expect(g.flags.every((f) => f.check)).toBe(true);
  });
  it('wouldEndBadly：这一步会让走子方自己被判长将负', () => { const g = mkGame(fenOf({ d1: 'K', a10: 'R', e10: 'k' }, 'b')); step(g, 'e10e9 a10a9 e9e10 a9a10 e10e9 a10a9 e9e10'); expect(g.wouldEndBadly(parseMove('a9a10'))).toBe(true); expect(g.wouldEndBadly(parseMove('d1e1'))).toBe(false); });
});

describe('V2 哈希 / 撤销 / 长将模糊', () => {
  it('Zobrist 增量 = 重算；撤销往返；keys 不变量；无碰撞', () => {
    const R = createRng(20261013); let bad = 0, coll = 0, inv = 0; const seen = new Map<string, string>(); const kinds = ['knight', 'knights', 'rook', 'cannon'] as const;
    for (let gi = 0; gi < (FULL ? 400 : 120); gi++) {
      const g = mkGame(gi % 7 === 0 ? handicapFen(kinds[gi % 4], gi % 2 ? RED : BLACK) : START_FEN); const snap: { fen: string; k: string; np: number; n: number }[] = [];
      for (let ply = 0; ply < 120; ply++) {
        const L = g.legalMoves(); if (!L.length) break; g.play(L[Math.floor(R.next() * L.length)]);
        const p = g.state(); if (Position.fromFen(p.fen()).key() !== p.key()) bad++;
        const f = p.fen(), k = p.key(), prev = seen.get(k); if (prev === undefined) seen.set(k, f); else if (prev !== f) coll++;
        if (g.keys.length !== g.moves.length + 1) inv++; snap.push({ fen: f, k, np: g.noProgress(), n: g.moves.length });
      }
      while (g.moves.length) { g.undo(); const s = snap[g.moves.length - 1]; if (s && (g.fen() !== s.fen || g.state().key() !== s.k || g.noProgress() !== s.np || g.keys.length !== s.n + 1)) { bad++; break; } }
    }
    expect([bad, coll, inv]).toEqual([0, 0, 0]);
  }, 120_000);
  it('长将窗口与暴力参考逐局一致（将军偏好的随机序列）', () => {
    const R = createRng(777); let n = 0, diff = 0;
    const ref = (g: GameImpl<number, Position>): string => {
      const keys = g.keys, k = keys[keys.length - 1], idx: number[] = []; keys.forEach((x, i) => { if (x[0] === k[0] && x[1] === k[1]) idx.push(i); });
      const s = idx[idx.length - 3], e = keys.length - 1, first = g.turn(); let a = true, b = true;
      for (let i = s; i < e; i++) { const c = g.flags[i].check; if (((i - s) & 1) === 0) a = a && c; else b = b && c; }
      return a && !b ? 'perpetual-check:' + (first === 0 ? 'B' : 'R') : b && !a ? 'perpetual-check:' + (first === 0 ? 'R' : 'B') : 'repetition:-';
    };
    const boards = [fenOf({ d1: 'K', a9: 'R', e10: 'k' }, 'w'), fenOf({ d1: 'K', a9: 'R', h9: 'R', e10: 'k' }, 'w'), fenOf({ d1: 'K', a8: 'R', e10: 'k', d10: 'a' }, 'w'), fenOf({ d1: 'K', f1: 'A', a9: 'R', c9: 'C', e10: 'k', f10: 'a' }, 'w'), fenOf({ d1: 'K', a2: 'R', i9: 'R', e10: 'k', h2: 'r' }, 'w'), fenOf({ e1: 'K', a5: 'R', c9: 'R', d10: 'k', i4: 'r', i8: 'c' }, 'w')];
    for (let t = 0; t < (FULL ? 20000 : 4000); t++) {
      const g = mkGame(boards[t % boards.length]); const len = 6 + Math.floor(R.next() * 24);
      for (let i = 0; i < len; i++) {
        const L = g.legalMoves(); if (!L.length) break; const chk = L.filter((m) => { const q = g.state().clone(); q.make(m); return q.inCheck(q.side); }); const pool = R.next() < 0.75 && chk.length ? chk : L; g.play(pool[Math.floor(R.next() * pool.length)]);
        const s = g.status(); if (s.over) { if (s.reason === 'perpetual-check' || s.reason === 'repetition') { n++; if (st(g) !== ref(g)) diff++; } break; }
      }
    }
    expect(diff).toBe(0); expect(n).toBeGreaterThan(FULL ? 100 : 15);
  }, 120_000);
});

describe('V2 whyIllegal 与合法着法互为充要；理由集合 ⊆ WHY', () => {
  it('抽样局面的全部 (from,to)', () => {
    const R = createRng(99); const seen: Record<string, number> = {}; let mism = 0; const fens: string[] = [];
    for (let gi = 0; gi < (FULL ? 150 : 40); gi++) { const g = mkGame(START_FEN); for (let ply = 0; ply < 40 + (gi % 40); ply++) { const L = g.legalMoves(); if (!L.length) break; g.play(L[Math.floor(R.next() * L.length)]); if (ply % 5 === 0) fens.push(g.fen()); } }
    fens.push(fenOf({ e1: 'K', e2: 'R', e10: 'k', e9: 'a' }, 'w'), fenOf({ d1: 'K', e10: 'k', a5: 'r', e5: 'R' }, 'w'), fenOf({ e1: 'K', e10: 'k', e5: 'C', e7: 'p', e9: 'a' }, 'w'));
    for (const f of fens) for (const side of [RED, BLACK]) {
      const q = Position.fromFen(f); q.side = side; q.rehash(); const legal = new Set(q.legal());
      for (let from = 0; from < 90; from++) { if (!q.b[from]) continue; for (let to = 0; to < 90; to++) { if (to === from) continue; const w = whyIllegal(q, from, to); if ((w === null) !== legal.has(from | (to << 7))) mism++; if (w) seen[w] = (seen[w] || 0) + 1; } }
    }
    expect(mism).toBe(0); expect(Object.keys(seen).every((k) => (WHY as readonly string[]).includes(k))).toBe(true);
    expect(WHY.filter((k) => !seen[k])).toEqual([]);
  }, 120_000);
});

describe('V15 引擎一致性套件（C01–C16）', () => {
  runConformance(rules, {
    fens: [START_FEN, 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR b', handicapFen('knight', BLACK), handicapFen('rook', RED), fenOf({ d1: 'K', a9: 'R', e10: 'k' }, 'w'), fenOf({ e1: 'K', e2: 'R', a9: 'R', d10: 'k' }, 'b'), '3k5/9/9/9/9/9/9/9/4R4/3K5 w'],
    noKing: [fenOf({ a1: 'R', a5: 'p' }, 'w'), fenOf({ b3: 'C', b5: 'P', b9: 'p' }, 'w')], obstacle: null, fenKey: (f) => f.split(' ').slice(0, 2).join(' '),
    perft: [{ fen: START_FEN, counts: [44, 1920, 79666] }], randomGames: FULL ? 150 : 80, maxPly: 90,
  }, { title: 'xiangqi（本作适配器）' });
});
