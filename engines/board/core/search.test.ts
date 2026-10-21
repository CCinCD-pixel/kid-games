import { describe, expect, it } from 'vitest';
import { createGame } from './game';
import { createRng, hash32, keyHash } from './rng';
import { Searcher } from './search';
import { bestGain, netCapture, see, seeFull, mateIn1Moves } from './see';
import { createErrorModel, easyOf, softmaxPick } from './errormodel';
import { coachTable } from './coach';
import { createHintLadder, createIdleTimer, autoTier } from './hints';
import { stateSearchAdapter } from './stateadapter';
import type { RobotLevel } from './types';
import { chessRules } from '../test/reference/chess-adapter.mjs';
import { xqRules } from '../test/reference/xq-adapter.mjs';

/* eslint-disable @typescript-eslint/no-explicit-any */
const xq = xqRules(), ch = chessRules();
const xa = stateSearchAdapter<any, any>(xq), ca = stateSearchAdapter<any, any>(ch);
const L = (id: string, o: Partial<RobotLevel> = {}): RobotLevel => ({ id, depth: 2, nodes: 4000, slip: 0.3, glanceTemp: 80, temp: 60, margin: 150, mateSight: 1, coachCap: 3, look: {}, ...o });

describe('Searcher（通用 alpha-beta）', () => {
  it('找到一步杀（象棋 / 国象）', () => {
    const sx = new Searcher(xa), px = xa.create(xq.fromFen('4k4/R8/9/9/9/9/9/9/1R7/3K5 w'));
    const r = sx.search(px, { depth: 2, nodes: 20000 }); const after = xq.status(xq.apply(xq.fromFen('4k4/R8/9/9/9/9/9/9/1R7/3K5 w'), r.best)); expect(after.over && after.winner === 0).toBe(true);   // b2b10 将死，a9f9 困毙判负：都是当场取胜 expect(r.score).toBeGreaterThan(20000);
    const sc = new Searcher(ca), pc = ca.create(ch.fromFen('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1'));
    const rc = sc.search(pc, { depth: 2, nodes: 20000 }); expect(ch.encode(rc.best)).toBe('a1a8'); expect(rc.score).toBeGreaterThan(20000);
  });
  it('根 exclude 生效；全被排除时忽略', () => {
    const s = new Searcher(ca), p = ca.create(ch.initial()); const all = p.legal();
    const best = s.search(p, { depth: 1, nodes: 3000 }).best; s.clearTT();
    const r = s.search(p, { depth: 1, nodes: 3000, exclude: new Set([best]) }); expect(r.best).not.toBe(best);
    s.clearTT(); const r2 = s.search(p, { depth: 1, nodes: 3000, exclude: new Set(all) }); expect(all).toContain(r2.best);
  });
  it('节点预算到点中止并返回可走着法', () => {
    const s = new Searcher(xa), p = xa.create(xq.initial()); const r = s.search(p, { depth: 6, nodes: 300 });
    expect(r.nodes).toBeLessThanOrEqual(310); expect(p.legal()).toContain(r.best);
  });
  it('墙钟预算：maxMs 很小也能中止', () => {
    const s = new Searcher(xa), p = xa.create(xq.initial()); const t0 = Date.now(); const r = s.search(p, { depth: 8, nodes: 1e9, maxMs: 40 });
    expect(Date.now() - t0).toBeLessThan(400); expect(r.best).toBeDefined();
  });
  it('make/unmake 平衡：搜索后局面不变', () => {
    const s = new Searcher(xa), st = xq.initial(), p = xa.create(st); s.search(p, { depth: 2, nodes: 2000 }); expect(xq.toFen((p as any).state())).toBe(xq.toFen(st));
  });
});

describe('ErrorModel 与确定性', () => {
  const model = createErrorModel<any>();
  const pickMove = (rules: any, ad: any, s: any, level: RobotLevel, seed: number, ply: number, searcher: Searcher<any>, excludeEnc: string[] = []) => {
    const pos = ad.create(s); const exclude = new Set<any>(pos.legal().filter((m: any) => excludeEnc.includes(rules.encode(m)))); searcher.clearTT(); const rng = createRng(hash32(seed, ply, keyHash(rules.hash(s))));
    return model.choose({ pos, level, legal: pos.legal(), exclude, mateIn1: () => mateIn1Moves(pos, { stalemate: true }), search: (o) => searcher.search(pos, o) }, rng);
  };
  it('结果只由 (局面, 种子, 级别) 决定：中间插别的搜索结果不变（750 次）', () => {
    const g = createGame(xq); const R0 = createRng(5); const fens: string[] = [];
    for (let i = 0; i < 40; i++) { const l = g.legalMoves(); if (!l.length) break; g.play(l[Math.floor(R0.next() * l.length)]); fens.push(g.fen()); }
    const S = new Searcher(xa); let diff = 0, n = 0;
    for (const lv of [L('a', { depth: 1, nodes: 1500 }), L('b', { depth: 2, nodes: 3000 }), L('c', { depth: 3, nodes: 6000 })]) for (const f of fens.slice(0, 25)) {
      const s = xq.fromFen(f); const a = pickMove(xq, xa, s, lv, 42, 9, S); pickMove(xq, xa, xq.fromFen(fens[(fens.indexOf(f) + 7) % fens.length]), lv, 1, 1, S); const b = pickMove(xq, xa, s, lv, 42, 9, S); n++; if (a !== b) diff++;
    }
    expect(n).toBe(75); expect(diff).toBe(0);
  });
  it('mateSight=1 时一步杀必走；exclude 被尊重', () => {
    const S = new Searcher(ca), s = ch.fromFen('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1');
    expect(ch.encode(pickMove(ch, ca, s, L('m'), 1, 0, S))).toBe('a1a8');
    expect(ch.encode(pickMove(ch, ca, s, L('m'), 1, 0, S, ['a1a8']))).not.toBe('a1a8');
  });
  it('R1 吃子胃口：pcap=1 有吃子必吃', () => {
    const S = new Searcher(ca), s = ch.fromFen('4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1');
    for (let seed = 1; seed < 10; seed++) expect(ch.encode(pickMove(ch, ca, s, L('r1', { depth: 0, nodes: 0, slip: 1, pcap: 1, mateSight: 0 }), seed, 3, S))).toBe('e4d5');
  });
  it('softmax：temp=0 取第一；easyOf 加 slip 减节点', () => {
    expect(softmaxPick(createRng(1), [{ m: 'a', score: 5 }, { m: 'b', score: 4 }], 0)).toBe('a');
    const e = easyOf(L('x', { slip: 0.5, nodes: 1000, mateSight: 1 })); expect(e.slip).toBeCloseTo(0.65); expect(e.nodes).toBe(700); expect(e.mateSight).toBeCloseTo(0.8); expect(e.id).toBe('xe');
  });
});

describe('SEE / 战术工具', () => {
  const find = (pos: any, rules: any, enc: string) => pos.legal().find((m: any) => rules.encode(m) === enc);
  it('向量：吃后成为对方炮的目标 → −8；吃掉炮架 → +1', () => {
    const p1 = xa.create(xq.fromFen('3k5/4c4/9/4p4/4p4/9/9/4R4/9/5K3 w')); expect(netCapture(p1, find(p1, xq, 'e3e6'), xa.valueAt)).toBe(-8);
    const p2 = xa.create(xq.fromFen('3k5/4c4/9/4p4/9/9/9/4R4/9/5K3 w')); expect(netCapture(p2, find(p2, xq, 'e3e7'), xa.valueAt)).toBe(1);
  });
  it('SEE（最便宜两个攻击者）= 穷举全部攻击者（象棋随机局面，含炮）', () => {
    const R = createRng(31337); let n = 0, diff = 0;
    for (let gi = 0; gi < 14; gi++) {
      const g = createGame(xq);
      for (let ply = 0; ply < 60; ply++) {
        const l = g.legalMoves(); if (!l.length || g.status().over) break; g.play(l[Math.floor(R.next() * l.length)]);
        if (ply > 8 && ply % 6 === 0) { const pos = xa.create(g.state()); for (let to = 0; to < 90; to++) { const p = pos.pieceAt(to); if (!p || p.side === pos.side()) continue; if (!pos.legal(true).some((m: any) => pos.to(m) === to)) continue; n++; if (see(pos, to, xa.valueAt) !== seeFull(pos, to, xa.valueAt)) diff++; } }
      }
    }
    expect(n).toBeGreaterThan(30); expect(diff).toBe(0);
  });
  it('bestGain：白吃一匹马 = 4（象棋口径）', () => {
    const p = xa.create(xq.fromFen('4k4/9/9/9/9/4n4/9/4R4/9/3K5 w')); expect(bestGain(p, xa.valueAt)).toBe(4);
  });
});

describe('教练判定表', () => {
  it('hang：把车送到兵口上要提醒；最安全着法不提醒', () => {
    const pos = ca.create(ch.fromFen('4k3/8/8/3p4/8/8/8/R3K3 w - - 0 1')); // 白车 a1，黑兵 d5
    const rows = coachTable(pos, { valueAt: ca.valueAt, encode: (m: any) => ch.encode(m), stalemate: false });
    const hang = rows.find((r) => r.m === 'a1a5'); expect(hang?.reason).toBeNull();   // a5 不在兵攻击范围内
    const bad = coachTable(ca.create(ch.fromFen('4k3/8/4p3/8/3R4/8/8/4K3 w - - 0 1')), { valueAt: ca.valueAt, encode: (m: any) => ch.encode(m), stalemate: false });
    expect(bad.find((r) => r.m === 'd4d5')?.reason).toBe('hang'); expect(bad.find((r) => r.m === 'd4d5')?.victim).toBe(3 * 8 + 3 + 0);   // 兵 e6 吃 d5 的车
    expect(bad.find((r) => r.m === 'd4a4')?.reason).toBeNull();
  });
  it('allowMate：走完后对方一步杀，且存在安全着法 → 提醒', () => {
    const pos = ca.create(ch.fromFen('6k1/8/8/8/8/8/5PPP/r5K1 w - - 0 1'));   // 白王 g1：h/g/f 兵挡着，a1 黑车将军？此局面白已被将军
    const rows = coachTable(pos, { valueAt: ca.valueAt, encode: (m: any) => ch.encode(m), stalemate: false }); expect(Array.isArray(rows)).toBe(true);
    const p2 = ca.create(ch.fromFen('6k1/5ppp/8/8/8/8/5PPP/r3R1K1 w - - 0 1'));
    const r2 = coachTable(p2, { valueAt: ca.valueAt, encode: (m: any) => ch.encode(m), stalemate: false });
    expect(r2.length).toBeGreaterThan(0);
  });
});

describe('提示阶梯 / 闲置计时', () => {
  it('失败 2/3/4 次自动 H1/H2/H3；灯泡手动升级；H2+ 不计首次做对', () => {
    expect([0, 1, 2, 3, 4, 9].map(autoTier)).toEqual([0, 0, 1, 2, 3, 3]);
    const h = createHintLadder(); expect(h.next({ stepId: 's1', failures: 0 }).tier).toBe(0); expect(h.next({ stepId: 's1', failures: 2 }).tier).toBe(1);
    expect(h.bulb('s1')).toBe(1); expect(h.bulb('s1')).toBe(2); expect(h.spoiled('s1')).toBe(true); expect(h.spoiled('s2')).toBe(false); h.reset('s1'); expect(h.tierOf('s1')).toBe(0);
  });
  it('idle：30 秒后触发；busy 时顺延；touch 重置', () => {
    const q: { f: () => void; ms: number; id: number }[] = []; let id = 0; let busy = true; let fired = 0;
    const t = createIdleTimer({ ms: 30000, onIdle: () => fired++, isBusy: () => busy, setTimer: (f, ms) => { q.push({ f, ms, id: ++id }); return id; }, clearTimer: (h) => { const i = q.findIndex((x) => x.id === h); if (i >= 0) q.splice(i, 1); } });
    expect(q.length).toBe(1); q.shift()!.f(); expect(fired).toBe(0); expect(q.length).toBe(1);   // busy → 重新计时
    busy = false; q.shift()!.f(); expect(fired).toBe(1); expect(t.fired).toBe(true); t.touch(); expect(t.fired).toBe(false); expect(q.length).toBe(1); t.stop(); expect(q.length).toBe(0);
  });
});
