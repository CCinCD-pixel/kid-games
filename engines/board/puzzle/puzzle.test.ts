import { describe, expect, it, vi } from 'vitest';
import { immediateWins, validateMate1, validateMate2, captureAnswerHasAlternatives } from './validate';
import { lazyHits, shortcutAudit, STRATS } from './audit';
import { createPuzzlePlayer } from './player';
import { createInputController } from '../input/input-controller';
import { createRng } from '../core/rng';
import { chessRules } from '../test/reference/chess-adapter.mjs';
import { xqRules } from '../test/reference/xq-adapter.mjs';
import type { Puzzle } from '../core/types';

const rules = chessRules();
const FOOL = 'rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2'; const BACK2 = '6k1/5ppp/8/8/8/8/8/RR2K3 w - - 0 1'; const BACK1 = '6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1';

describe('validateMate1 / immediateWins', () => {
  it('愚人杀：唯一取胜着 d8h4（真将死）；没有诱饵时按 minDecoys 判', () => {
    expect(immediateWins(rules, rules.fromFen(FOOL)).map((w) => w.enc)).toEqual(['d8h4']); const v0 = validateMate1(rules, FOOL, { minDecoys: 0 }); expect(v0.ok).toBe(true); expect(v0.winners[0]).toEqual({ enc: 'd8h4', kind: 'mate' });
    const v1 = validateMate1(rules, FOOL); expect(v1.ok).toBe(v1.decoys.length >= 1);
  });
  it('两个取胜着 → 不唯一；底线杀 + 诱饵', () => {
    const v = validateMate1(rules, BACK2, { minDecoys: 0 }); expect(v.ok).toBe(false); expect(v.winners.map((w) => w.enc).sort()).toEqual(['a1a8', 'b1b8']); expect(v.reasons.join()).toContain('取胜着 2');
    const w = validateMate1(rules, BACK1, { minDecoys: 0 }); expect(w.ok).toBe(true); expect(w.winners).toHaveLength(1);
  });
  it('象棋：困毙当场赢算"别的取胜着"（stalemateCounts），可关闭', () => {
    const xq = xqRules(); const fen = '3k5/9/9/9/9/9/9/9/4R4/3K5 w'; void fen; const v = validateMate1(xq, 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w', { minDecoys: 0 }); expect(v.ok).toBe(false); expect(v.reasons.join()).toContain('取胜着 0');
  });
  it('captureAnswerHasAlternatives：答案是吃子时必须还有别的吃子', () => {
    const fen = 'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2'; expect(captureAnswerHasAlternatives(rules, fen, 'e4d5')).toBe(false); expect(captureAnswerHasAlternatives(rules, fen, 'e4e5')).toBe(true);
  });
});

/** 随机 K+R vs K 局面（白先），种子固定 */
function krk(seed: number): string | null {
  const r = createRng(seed); const pick = (): number => Math.floor(r.next() * 64); const wk = pick(), wr = pick(), bk = pick(); if (new Set([wk, wr, bk]).size < 3) return null;
  const adj = (a: number, b: number): boolean => Math.abs((a >> 3) - (b >> 3)) <= 1 && Math.abs((a & 7) - (b & 7)) <= 1; if (adj(wk, bk)) return null;
  const rows: string[] = []; for (let rk = 7; rk >= 0; rk--) { let row = '', empty = 0; for (let f = 0; f < 8; f++) { const sq = rk * 8 + f; const ch = sq === wk ? 'K' : sq === wr ? 'R' : sq === bk ? 'k' : ''; if (!ch) empty++; else { if (empty) row += empty; empty = 0; row += ch; } } if (empty) row += empty; rows.push(row); }
  return `${rows.join('/')} w - - 0 1`;
}
describe('validateMate2（K+R vs K 随机 400 局的交叉复核）', () => {
  it('判定与独立的朴素三重循环一致；通过的局面确有唯一必胜首着', () => {
    let tried = 0, ok = 0, withF = 0; const oks: string[] = [];
    for (let seed = 1; tried < 400 && seed < 5000; seed++) {
      const fen = krk(seed); if (!fen) continue; let s; try { s = rules.fromFen(fen); } catch { continue; } if (rules.check(s, 1) || !rules.legalMoves(s).length) continue; tried++;
      const v = validateMate2(rules, fen);
      // 朴素复核：F = 首着 m，使得对方每个应着 r 之后己方都有"走完对方无合法着法且判己方胜"的着法
      const F: string[] = []; const immediate = rules.legalMoves(s).some((m) => { const s1 = rules.apply(s, m); return !rules.legalMoves(s1).length && rules.status(s1).over && (rules.status(s1) as { winner: number }).winner === 0; });
      for (const m of rules.legalMoves(s)) { const s1 = rules.apply(s, m); const R = rules.legalMoves(s1); if (!R.length) continue; if (R.every((r) => { const s2 = rules.apply(s1, r); return rules.legalMoves(s2).some((m2) => { const s3 = rules.apply(s2, m2); const st = rules.status(s3); return !rules.legalMoves(s3).length && st.over && (st as { winner: number }).winner === 0; }); })) F.push(rules.encode(m)); }
      expect(v.firstCandidates.sort()).toEqual(F.sort()); if (F.length) withF++; if (v.ok) { ok++; oks.push(fen); expect(immediate).toBe(false); expect(F).toHaveLength(1); expect(v.replies.length).toBeGreaterThanOrEqual(2); }
    }
    expect(tried).toBeGreaterThanOrEqual(300); expect(withF).toBeGreaterThanOrEqual(5); expect(ok).toBeLessThanOrEqual(withF);
  }, 60000);
});

describe('偷懒策略审计 lazyHits / shortcutAudit', () => {
  it('picks 一致性：只有一个将军着法时四种策略全中（吃子策略只在将军着法吃子时命中）；hits 与 picks 相等', () => {
    const r = lazyHits(rules, BACK1, 'a1a8'); expect(r.hits).toEqual(STRATS.filter((k) => k !== 'captureCheck')); expect(r.picks.captureCheck).toBeNull(); expect(r.seq).toBe(true);
    const r2 = lazyHits(rules, 'k7/8/8/8/8/8/1R4B1/Q3K3 w - - 0 1', 'a1a7'); for (const k of STRATS) expect(r2.hits.includes(k)).toBe(r2.picks[k] === 'a1a7');
  });
  it('审计报告：命中率 ≤ limit 才 ok；offenders 列出命中的题', () => {
    const rep = shortcutAudit(rules, [{ id: 'easy', fen: BACK1, answer: 'a1a8' }], 0.15); expect(rep.ok).toBe(false); expect(rep.offenders).toEqual(['easy']); expect(rep.n).toBe(1);
    const none = shortcutAudit(rules, [{ id: 'x', fen: BACK1, answer: 'a1a7' }], 0.15); expect(none.ok).toBe(true);
  });
});

// ───── 播放器 ─────
const noop = (): void => undefined;
function fakeView(): any { return { el: { style: {}, addEventListener: noop, removeEventListener: noop, getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 800 }) }, reduced: true, cellPx: 100, orientation: 'first-bottom', setState: vi.fn(), setLastMove: noop, finishAnimations: noop, animateMove: vi.fn(async () => undefined), animateUndo: vi.fn(async () => undefined), mark: vi.fn(() => ({ dispose: noop })), arrow: vi.fn(() => ({ dispose: noop })), rect: () => ({ left: 0, top: 0, width: 100, height: 100 }), hitTest: () => null, liftPiece: noop, showPreview: noop, showFocus: noop, bump: noop, announce: noop, refreshRect: noop }; } // eslint-disable-line @typescript-eslint/no-explicit-any
function setup(hooks = {}) {
  const view = fakeView(); const base = rules.initial(); const input = createInputController(view, rules, { state: () => base, seatToMove: () => 0, canAct: () => true, commit: async () => undefined, onIllegal: noop }, { keyboard: false });
  const ghost = { tap: vi.fn(async () => undefined), drag: vi.fn(async () => undefined), path: vi.fn(async () => undefined) }; const player = createPuzzlePlayer({ rules, view, input, ghost, hooks, wrongHoldMs: 1, opponentDelayMs: 1 }); return { view, input, player, ghost, base };
}
const P = (o: Partial<Puzzle>): Puzzle => ({ id: 'p', fen: BACK1, theme: 'mate1', tier: 1, solution: [['a1a8']], kidPlies: 1, judge: 'outcome', meta: {}, ...o });
const kid = (input: ReturnType<typeof setup>['input'], enc: string): Promise<boolean> => { const s = input.state(); return input.submit(rules.decode(s, enc)); };
const tick = (ms = 5): Promise<void> => new Promise((r) => setTimeout(r, ms));

describe('PuzzlePlayer', () => {
  it('一次对：firstTry、hintTier 0；走对后恢复钩子（输入回到底层）', async () => {
    const { player, input, base, view } = setup(); const done = player.play(P({}), { hints: true }); await tick(); expect(input.state()).not.toBe(base); expect(await kid(input, 'a1a8')).toBe(true);
    const r = await done; expect(r).toMatchObject({ firstTry: true, hintTier: 0 }); expect(input.state()).toBe(base); expect(view.animateMove).toHaveBeenCalledTimes(1); expect(player.active).toBe(false);
  });
  it('走错：走过去 → onWrong → 悔回；不扣星（firstTry=false）；2 次错 → H1 高亮；3 次 → H2 箭头；4 次 → H3 幽灵手', async () => {
    const wrongs: number[] = []; const hints: number[] = []; const { player, input, view, ghost } = setup({ onWrong: (i: { wrong: number }) => void wrongs.push(i.wrong), onHint: (i: { tier: number }) => void hints.push(i.tier) });
    const done = player.play(P({}), { hints: true }); await tick();
    await kid(input, 'e1e2'); await tick(15); expect(wrongs).toEqual([1]); expect(view.animateUndo).toHaveBeenCalledTimes(1); expect(hints).toEqual([]);
    await kid(input, 'e1d1'); await tick(15); expect(hints).toEqual([1]); await kid(input, 'e1e2'); await tick(15); expect(hints).toEqual([1, 2]); expect(view.arrow).toHaveBeenCalled();
    await kid(input, 'e1d1'); await tick(15); expect(hints).toEqual([1, 2, 3]); expect(ghost.drag).toHaveBeenCalledTimes(1);
    await kid(input, 'a1a8'); const r = await done; expect(r.firstTry).toBe(false); expect(r.hintTier).toBe(3);
  });
  it('outcome 判定：别的当场取胜着也算对（alsoWins）；list 判定：非答案算错', async () => {
    const seen: boolean[] = []; const a = setup({ onCorrect: (i: { alsoWins: boolean }) => void seen.push(i.alsoWins) }); const d1 = a.player.play(P({ fen: BACK2, solution: [['a1a8']] }), { hints: false }); await tick(); await kid(a.input, 'b1b8'); await d1; expect(seen).toEqual([true]);
    const b = setup(); const d2 = b.player.play(P({ fen: BACK2, solution: [['a1a8']], judge: 'list' }), { hints: false }); await tick(); await kid(b.input, 'b1b8'); await tick(15); expect(b.player.active).toBe(true); await kid(b.input, 'a1a8'); expect((await d2).firstTry).toBe(false);
  });
  it('两步题：第一步对 → 对手应着 → 第二步；手动 requestHint 逐档升级；cancel 释放并 reject', async () => {
    const a = setup(); const fen = 'k7/8/8/8/8/8/8/KR6 w - - 0 1'; void fen;
    const p = P({ fen: BACK2, solution: [['e1d1'], ['g8f8'], ['a1a8']], kidPlies: 2, judge: 'outcome' }); const done = a.player.play(p, { hints: false }); await tick(); await kid(a.input, 'e1d1'); await tick(20); expect(a.view.animateMove).toHaveBeenCalledTimes(2);
    a.player.requestHint(); a.player.requestHint(); expect(a.view.mark).toHaveBeenCalled(); expect(a.view.arrow).toHaveBeenCalled(); await kid(a.input, 'a1a8'); expect((await done).hintTier).toBe(2);
    const b = setup(); const d = b.player.play(P({}), { hints: true }); const rej = d.catch((e: { cancelled?: boolean }) => e.cancelled); b.player.cancel(); expect(await rej).toBe(true); expect(b.input.state()).toBe(b.base); expect(b.player.active).toBe(false);
    const c = setup(); void c.player.play(P({}), { hints: true }).catch(noop); await expect(c.player.play(P({}), { hints: true })).rejects.toThrow('puzzle-busy'); c.player.cancel();
  });
});
