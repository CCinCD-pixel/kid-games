// rules.test.ts — 国象 GameRules：一致性 C01–C16、FEN 往返、终局与特殊规则向量（经通用 Game）、effects / moveInfo / 记谱 / 家规 / 陨石 / 中文原因。
import { describe, expect, it } from 'vitest';
import { createGame } from '../../core/game';
import { runConformance } from '../../test/run-conformance';
import { createRules } from './rules';
import { START_FEN, fromFEN, toFEN } from './position';
import { CHESS_REASON_ZH, OUTCOME_CARD, WHY_NARRATION, chessReasonText } from './reasons';
import { WHY_KEYS } from './position';
import { chessFixtures, contentFens, readContentText, sq } from './test-util';

const rules = createRules();
const label = (g: { status(): { over: boolean; winner?: number | null; reason?: string } }): string => { const s = g.status(); return s.over ? `${s.reason}:${s.winner === null ? '-' : s.winner}` : 'go'; };
/** 从 fen 起按 UCI 串逐着走（经 Game），返回 Game；遇非法着法抛错 */
function play(fen: string, seq = '', r = rules) {
  const g = createGame(r, fen);
  for (const u of seq.split(' ').filter(Boolean)) { const m = r.decode(g.state(), u); if (!m) throw new Error('非法着法 ' + u + ' @ ' + g.fen()); g.play(m); }
  return g;
}

runConformance(rules, chessFixtures, { title: 'chess（games/chess/rules.ts）' });

describe('FEN', () => {
  it('起始局面与 toFen 往返；内容里全部 FEN 往返幂等', () => {
    expect(rules.toFen(rules.initial())).toBe(START_FEN);
    const fens = contentFens(); expect(fens.length).toBeGreaterThan(1000);
    for (const f of fens) { const a = rules.toFen(rules.fromFen(f)); expect(rules.toFen(rules.fromFen(a))).toBe(a); }
  });
  it('四段 FEN 补默认值；带陨石 X / 无王的局面不抛', () => {
    expect(toFEN(fromFEN('8/8/8/8/8/8/8/K6k w - -'))).toBe('8/8/8/8/8/8/8/K6k w - - 0 1');
    expect(rules.toFen(rules.fromFen('4k3/8/8/3x4/8/8/8/4K3 w - - 0 1'))).toBe('4k3/8/8/3X4/8/8/8/4K3 w - - 0 1');
    expect(rules.legalMoves(rules.fromFen('8/8/8/R3p3/8/8/8/8 w - - 0 1')).length).toBeGreaterThan(0);
  });
  it('坏 FEN 抛错（行数 / 棋子字母 / 行宽 / 走子方）', () => {
    for (const f of ['8/8/8/8/8/8/8 w - - 0 1', '8/8/8/8/8/8/8/K6z w - - 0 1', '8/8/8/8/8/8/8/K7k w - - 0 1', '8/8/8/8/8/8/8/K6k x - - 0 1']) expect(() => rules.fromFen(f), f).toThrow();
  });
  it('initial(variant)：FEN 原样接受，其余 = 标准开局', () => {
    expect(rules.toFen(rules.initial('4k3/8/8/8/8/8/8/4K3 w - - 0 1'))).toBe('4k3/8/8/8/8/8/8/4K3 w - - 0 1');
    expect(rules.toFen(rules.initial('none'))).toBe(START_FEN);
  });
});

describe('终局与特殊规则向量（经通用 Game；Outcome.reason ↔ 终局说明卡键）', () => {
  const V: [name: string, fen: string, seq: string, want: string][] = [
    ['愚人杀 = 将死', START_FEN, 'f2f3 e7e5 g2g4 d8h4', 'checkmate:1'],
    ['逼和', '7k/5Q2/6K1/8/8/8/8/8 b - - 0 1', '', 'stalemate:-'],
    ['K 对 K', '8/8/4k3/8/8/3K4/8/8 w - - 0 1', '', 'insufficient:-'],
    ['K+马 对 K', '8/8/4k3/8/8/3KN3/8/8 w - - 0 1', '', 'insufficient:-'],
    ['K+象 对 K', '8/8/4k3/8/8/3KB3/8/8 w - - 0 1', '', 'insufficient:-'],
    ['K+象 对 K+象（同色格）', '8/8/2b1k3/8/4B3/3K4/8/8 w - - 0 1', '', 'insufficient:-'],
    ['K+象 对 K+象（异色格）未结束', '8/8/2b1k3/8/8/3KB3/8/8 w - - 0 1', '', 'go'],
    ['K+马+马 对 K 不自动和', '8/8/4k3/8/8/2NKN3/8/8 w - - 0 1', '', 'go'],
    ['K+兵 对 K 未结束', '8/8/4k3/8/8/3KP3/8/8 w - - 0 1', '', 'go'],
    ['K+车 对 K 未结束（子力不足不含车）', 'k7/8/8/8/8/8/8/K6R w - - 0 1', '', 'go'],
    ['三次重复：第 8 步和', START_FEN, 'g1f3 g8f6 f3g1 f6g8 g1f3 g8f6 f3g1 f6g8', 'repetition:-'],
    ['过路兵格不合法不拆分重复（第 9 步第 3 次）', START_FEN, 'e2e4 g8f6 g1f3 f6g8 f3g1 g8f6 g1f3 f6g8 f3g1', 'repetition:-'],
    ['…第 8 步还没到第 3 次', START_FEN, 'e2e4 g8f6 g1f3 f6g8 f3g1 g8f6 g1f3 f6g8', 'go'],
    ['五十回合：第 100 个半回合安静着 → 和', '7k/8/6K1/8/8/8/8/R7 w - - 99 80', 'a1a2', 'fifty-move:-'],
    ['第 100 个半回合将死 → 将死优先', '7k/8/6K1/8/8/8/8/R7 w - - 99 80', 'a1a8', 'checkmate:0'],
    ['FEN 时钟 98 → 第 1 步才到 99，未结束', '7k/8/6K1/8/8/8/8/R7 w - - 98 80', 'a1a2', 'go'],
    ['KQ 对 K 逼和陷阱：Qf7 → 逼和', '7k/8/6K1/8/8/8/8/5Q2 w - - 0 1', 'f1f7', 'stalemate:-'],
    ['同局面 Qf8# → 将死', '7k/8/6K1/8/8/8/8/5Q2 w - - 0 1', 'f1f8', 'checkmate:0'],
    ['背靠背易位后继续', 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', 'e1g1 e8c8', 'go'],
  ];
  for (const [name, fen, seq, want] of V) it(name, () => { expect(label(play(fen, seq))).toBe(want); });
  it('终局原因 ↔ 说明卡键：5 个 reason 都有卡与中文', () => {
    expect(OUTCOME_CARD).toEqual({ checkmate: 'mate', stalemate: 'stale', insufficient: 'insuff', repetition: 'rep', 'fifty-move': 'fifty' });
    const yaml = readContentText('narration.yaml');
    for (const [reason, card] of Object.entries(OUTCOME_CARD)) {
      expect(chessReasonText(reason), reason).not.toBe(reason); expect(yaml, `ch.g.${card}`).toMatch(new RegExp(`id: ch\\.g\\.${card === 'mate' ? 'mate\\.win' : card}\\b`));
    }
  });
  it('过路兵暴露己方王 = 非法，原因 pinned', () => {
    const s = rules.fromFen('8/8/8/KPp4r/8/8/8/7k w - c6 0 1');
    expect(rules.legalMoves(s).some((m) => rules.encode(m) === 'b5c6')).toBe(false); expect(rules.whyIllegal(s, sq('b5'), sq('c6'))).toBe('pinned');
  });
  it('吃车后双方后翼易位权消失（FEN 易位权 = Kk）', () => {
    expect(play('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', 'a1a8').fen().split(' ')[2]).toBe('Kk');
    expect(play('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', 'h1h8').fen().split(' ')[2]).toBe('Qq');
    expect(play('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', 'e1d1').fen().split(' ')[2]).toBe('kq');
  });
  it('升变给出 后 / 车 / 象 / 马 四条（type 2,3,4,5）；升变吃子同时有 capture 与 promotion', () => {
    const s = rules.fromFen('8/4P3/8/8/8/2k5/8/4K3 w - - 0 1');
    expect(rules.legalMoves(s).filter((m) => rules.moveInfo(s, m).promotion).map((m) => rules.moveInfo(s, m).promotion).sort()).toEqual([2, 3, 4, 5]);
    const s2 = rules.fromFen('1r5k/P7/8/8/8/8/8/K7 w - - 0 1'); const pc = rules.legalMoves(s2).filter((m) => rules.encode(m).startsWith('a7b8'));
    expect(pc).toHaveLength(4); const i = rules.moveInfo(s2, pc[0]); expect(i.capture && i.promotion).toBeTruthy();
    expect(rules.effects(s2, pc[0]).map((e) => e.k).sort().join()).toBe('capture,move,promote');
  });
  it('不能路过被攻击的格易位（castleThrough）', () => {
    const s = rules.fromFen('r3k2r/ppp2ppp/b1np1n2/4p3/4P3/2N2N2/PPPP1PPP/R3K2R w KQkq - 0 1');
    expect(rules.legalMoves(s).some((m) => rules.encode(m) === 'e1g1')).toBe(false); expect(rules.whyIllegal(s, sq('e1'), sq('g1'))).toBe('castleThrough');
  });
  it('hash：过路兵格不合法时键与无 ep 相同；合法时不同', () => {
    const a = createGame(rules, 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1'), b = createGame(rules, 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1');
    expect(a.keys[0]).toEqual(b.keys[0]);
    const c = createGame(rules, 'rnbqkbnr/ppp1pppp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3'), d = createGame(rules, 'rnbqkbnr/ppp1pppp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq - 0 3');
    expect(c.keys[0]).not.toEqual(d.keys[0]);
  });
  it('hash：易位权不同 → 键不同；走子方不同 → 键不同', () => {
    const k = (f: string) => JSON.stringify(rules.hash(rules.fromFen(f)));
    expect(k('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1')).not.toBe(k('r3k2r/8/8/8/8/8/8/R3K2R w Qkq - 0 1'));
    expect(k('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1')).not.toBe(k('r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 0 1'));
  });
});

describe('moveInfo / effects / check / attackersOf', () => {
  it('过路兵：capture.sq(d5) ≠ to(d6)，resetsClock；effects 含 capture(sq ≠ to) + move', () => {
    const s = rules.fromFen('rnbqkbnr/ppp1pppp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3'); const m = rules.decode(s, 'e5d6')!; const i = rules.moveInfo(s, m);
    expect(i.capture?.sq).toBe(sq('d5')); expect(i.to).toBe(sq('d6')); expect(i.resetsClock).toBe(true);
    const ef = rules.effects(s, m); expect(ef.some((e) => e.k === 'capture' && e.sq !== i.to)).toBe(true); expect(ef.some((e) => e.k === 'move')).toBe(true);
  });
  it('易位：effects = 王 + 车两个 move，同阶段，车 arc', () => {
    const s = rules.fromFen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    for (const [u, rook] of [['e1g1', ['h1', 'f1']], ['e1c1', ['a1', 'd1']]] as const) {
      const ef = rules.effects(s, rules.decode(s, u)!); const mv = ef.filter((e) => e.k === 'move');
      expect(mv).toHaveLength(2); expect(new Set(ef.map((e) => e.phase)).size).toBe(1);
      expect(mv.find((e) => e.k === 'move' && e.piece.type === 3)).toMatchObject({ from: sq(rook[0]), to: sq(rook[1]), arc: true });
    }
  });
  it('马 arc；其它着法无 arc；resetsClock = 吃子或兵动', () => {
    const s = rules.initial();
    expect(rules.effects(s, rules.decode(s, 'g1f3')!)[0]).toMatchObject({ k: 'move', arc: true }); expect(rules.effects(s, rules.decode(s, 'e2e4')!)[0]).toMatchObject({ k: 'move', arc: false });
    expect(rules.moveInfo(s, rules.decode(s, 'g1f3')!).resetsClock).toBe(false); expect(rules.moveInfo(s, rules.decode(s, 'e2e4')!).resetsClock).toBe(true);
  });
  it('check()：单将 / 闪击暗子 / 双将都列全 by；side 参数；无王 = null', () => {
    const s1 = rules.fromFen('4k3/8/8/8/8/8/4r3/4K3 w - - 0 1'); expect(rules.check(s1)).toEqual({ king: sq('e1'), by: [sq('e2')] }); expect(rules.check(s1, 1)).toBeNull();
    const s2 = rules.fromFen('4k3/4r3/8/8/8/2b5/8/4K3 w - - 0 1'); expect(rules.check(s2)?.by).toEqual([sq('c3'), sq('e7')].sort((a, b) => a - b));
    expect(rules.check(rules.fromFen('8/8/8/R3p3/8/8/8/8 w - - 0 1'))).toBeNull();
  });
  it('attackersOf：兵斜攻、车暗子、空格也算', () => {
    const s = rules.fromFen('4k3/8/8/3p4/8/4P3/8/R3K3 w - - 0 1');
    expect(rules.attackersOf!(s, sq('d5'), 1)).toEqual([]); expect(rules.attackersOf!(s, sq('d4'), 0)).toEqual([sq('e3')]); expect(rules.attackersOf!(s, sq('e4'), 1)).toEqual([sq('d5')]);
    expect(rules.attackersOf!(s, sq('a8'), 0)).toEqual([sq('a1')]);
  });
});

describe('记谱：san / coord / zh', () => {
  const nt = (fen: string, u: string, st: 'san' | 'zh' | 'coord') => { const s = rules.fromFen(fen); return rules.notation(s, rules.decode(s, u)!, st); };
  it('SAN：易位、同格两个子的消歧义、升变将军、将死、兵吃子', () => {
    expect(nt('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', 'e1g1', 'san')).toBe('O-O'); expect(nt('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', 'e1c1', 'san')).toBe('O-O-O');
    expect(nt('4k3/8/8/8/8/5N2/8/1N2K3 w - - 0 1', 'b1d2', 'san')).toBe('Nbd2'); expect(nt('4k3/8/8/8/8/5N2/8/1N2K3 w - - 0 1', 'f3d2', 'san')).toBe('Nfd2');
    expect(nt('6k1/4P3/8/8/8/8/8/4K3 w - - 0 1', 'e7e8q', 'san')).toBe('e8=Q+');
    expect(nt('rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq g3 0 2', 'd8h4', 'san')).toBe('Qh4#');
    expect(nt('rnbqkbnr/ppp1pppp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3', 'e5d6', 'san')).toBe('exd6');
  });
  it('coord = UCI；zh = 中文着法，含将军 / 将死 / 易位 / 升变 / 过路兵', () => {
    expect(nt(START_FEN, 'e2e4', 'coord')).toBe('e2e4'); expect(nt(START_FEN, 'g1f3', 'zh')).toBe('马g1到f3'); expect(nt(START_FEN, 'e2e4', 'zh')).toBe('兵e2到e4');
    expect(nt('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', 'e1g1', 'zh')).toBe('王车易位（短）'); expect(nt('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', 'e1c1', 'zh')).toBe('王车易位（长）');
    expect(nt('6k1/4P3/8/8/8/8/8/4K3 w - - 0 1', 'e7e8q', 'zh')).toBe('兵e7到e8，升变为后，将军');
    expect(nt('rnbqkbnr/ppp1pppp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3', 'e5d6', 'zh')).toBe('兵e5吃过路兵d6');
    expect(nt('rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq g3 0 2', 'd8h4', 'zh')).toBe('后d8到h4，将死');
  });
  it('encode / decode：升变带小写字母；非法串 = null；前后空白容忍', () => {
    const s = rules.fromFen('1r5k/P7/8/8/8/8/8/K7 w - - 0 1');
    expect(rules.decode(s, 'a7a8q')).not.toBeNull(); expect(rules.encode(rules.decode(s, ' a7b8n ')!)).toBe('a7b8n'); expect(rules.decode(s, 'a7a8')).toBeNull(); expect(rules.decode(s, 'zz')).toBeNull();
  });
});

describe('家规 createRules(cfg) 与 mirror', () => {
  it('fifty off → clockPlies null；repetition off → 第 3 次重复不判和；默认判', () => {
    expect(createRules({ fifty: 'off' }).meta.clockPlies).toBeNull(); expect(rules.meta).toMatchObject({ kingType: 1, repeatN: 3, clockPlies: 100, clockReason: 'fifty-move' });
    const off = createRules({ repetition: 'off' }); const seq = 'g1f3 g8f6 f3g1 f6g8 g1f3 g8f6 f3g1 f6g8';
    expect(label(play(START_FEN, seq, off))).toBe('go'); expect(label(play(START_FEN, seq))).toBe('repetition:-');
    expect(label(play('7k/8/6K1/8/8/8/8/R7 w - - 99 80', 'a1a2', createRules({ fifty: 'off' })))).toBe('go');
    const warn = createRules({ repetition: 'warn' }); expect(warn.meta.repeatN).toBe(3);
  });
  it('mirror：左右翻转、丢易位权、过路兵列翻转；两次 = 原布局', () => {
    const s = rules.fromFen('rnbqkbnr/ppp1pppp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3'); const m = rules.mirror!(s)!;
    expect(rules.toFen(m)).toBe('rnbkqbnr/pppp1ppp/8/3Pp3/8/8/PPP1PPPP/RNBKQBNR w - e6 0 3'); expect(rules.toFen(rules.mirror!(m)!).split(' ').slice(0, 2).join(' ')).toBe(rules.toFen(s).split(' ').slice(0, 2).join(' '));
  });
});

describe('陨石 OBSTACLE（FEN 字母 X）', () => {
  it('d2 兵前面有陨石 → 只能走 d3；车 / 后不能越过也不能吃；陨石不攻击也不将军', () => {
    const mv = (f: string) => rules.legalMoves(rules.fromFen(f)).map((m) => rules.encode(m));
    expect(mv('4k3/8/8/8/3X4/8/3P4/4K3 w - - 0 1')).toEqual(expect.arrayContaining(['d2d3'])); expect(mv('4k3/8/8/8/3X4/8/3P4/4K3 w - - 0 1')).not.toContain('d2d4');
    expect(mv('4k3/8/8/8/8/8/8/R2X3K w - - 0 1').filter((u) => u.startsWith('a1'))).toEqual(['a1a2', 'a1a3', 'a1a4', 'a1a5', 'a1a6', 'a1a7', 'a1a8', 'a1b1', 'a1c1']);
    expect(mv('4k3/8/8/8/3q4/8/8/2X1K3 b - - 0 1').some((u) => u === 'd4c3' || u === 'd4b2')).toBe(true);
    expect(mv('4k3/8/8/8/3q4/2X5/8/4K3 b - - 0 1')).not.toContain('d4c3');
    const s = rules.fromFen('4k3/8/8/8/3X4/8/3P4/4K3 w - - 0 1'); expect(rules.pieceAt(s, sq('d4'))).toEqual({ type: 99, side: 0 }); expect(rules.value(s, sq('d4'))).toBe(0);
  });
});

describe('原因中文：23 个 whyIllegal 键 + 旁白 id 齐全', () => {
  it('每个键都有中文文案、别名指向的 ch.w.* 旁白都在 narration.yaml 里', () => {
    const yaml = readContentText('narration.yaml');
    for (const k of WHY_KEYS) { expect(CHESS_REASON_ZH[k], k).toBeTruthy(); expect(chessReasonText(k)).toBe(CHESS_REASON_ZH[k]); expect(yaml, `ch.w.${WHY_NARRATION[k]}`).toContain(`id: ch.w.${WHY_NARRATION[k]},`); }
    expect(WHY_KEYS).toHaveLength(23); expect(chessReasonText(null)).toBe(''); expect(chessReasonText('nope')).toBe('nope');
  });
  it('旁白字幕与 reasons.ts 的文案一致（别名除外时逐句相等）', () => {
    const yaml = readContentText('narration.yaml');
    for (const k of WHY_KEYS) { const m = new RegExp(`id: ch\\.w\\.${WHY_NARRATION[k]}, role: companion, text: "([^"]+)"`).exec(yaml); expect(m?.[1], k).toBe(CHESS_REASON_ZH[k]); }
  });
});

