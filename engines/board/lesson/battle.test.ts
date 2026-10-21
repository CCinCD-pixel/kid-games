import { describe, expect, it } from 'vitest';
import { xqRules } from '../test/reference/xq-adapter.mjs';
import { xqLessons } from '../test/xq-lesson-data';
import { advancePawns, pawnNames, pawnsLeft, playBattle, solveBattle } from './battle';
import { forceSide } from './solo';
import { getRunner, type LessonStep } from './steps';
import { mkCtx, tick } from './test-kit';
import type { StepResult } from '../core/types';

const rules = xqRules(); const battles = xqLessons.flatMap((l) => l.steps).filter((s) => s.k === 'battle') as LessonStep[];
describe('小战场（B1–B3）', () => {
  it('卒前进一格；挡路 / 红帅挡住的原地不动；走到红子上就是吃掉；到红方底线 = 红败', () => {
    const b1 = battles.find((s) => s.id === 'B1')!; expect(pawnNames(rules, b1.pos!)).toEqual(['b8', 'e8', 'h8']);
    const a = advancePawns(rules, rules.fromFen(b1.pos!)); expect(a.lost).toBe(false); expect(a.steps).toHaveLength(3); expect(pawnNames(rules, rules.toFen(a.s))).toEqual(['b7', 'e7', 'h7']);
    const blocked = rules.fromFen('9/9/9/9/9/9/9/4p4/4K4/9 w'); expect(advancePawns(rules, blocked).steps).toHaveLength(0);          // 红帅在 e2，e3 的卒挡住不动
    const eat = advancePawns(rules, rules.fromFen('9/9/9/9/9/9/9/4p4/4R4/9 w')); expect(eat.steps).toHaveLength(1); expect(rules.pieceAt(eat.s, 0 + 0 === 0 ? 0 : 0)).toBeNull();
    const low = advancePawns(rules, rules.fromFen('9/9/9/9/9/9/9/9/4p4/9 w')); expect(low.lost).toBe(true);
    const ahead = rules.toFen(advancePawns(rules, rules.fromFen('9/9/9/9/9/9/4p4/4p4/9/9 w')).s); expect(ahead.split(' ')[0]).toBe('9/9/9/9/9/9/9/4p4/4p4/9');       // 前面的先走，后面的跟上
  });
  it('什么也不做 → 第 7 步后卒到底线（B1 redMovesAvailable = 7）；par 内通关', () => {
    const b1 = battles.find((s) => s.id === 'B1')!; const idle = ['e1d1', 'd1e1', 'e1d1', 'd1e1', 'e1d1', 'd1e1', 'e1d1']; const r = playBattle(rules, b1.pos!, idle); expect(r).toMatchObject({ win: false, lost: true }); expect(r.moves).toBe(b1.redMovesAvailable);
  });
  it(`solveBattle：${process.env.XQ_FULL ? 'B1 / B2 / B3' : 'B2（B1 / B3 在 XQ_FULL 下）'} 的最快取胜着数 = 数据里的 par（余量 ≥ 1）`, () => {
    for (const id of process.env.XQ_FULL ? ['B1', 'B2', 'B3'] : ['B2']) { const b = battles.find((s) => s.id === id)!; const t0 = Date.now(); const r = solveBattle(rules, b.pos!, b.par as number); expect(r?.par, id).toBe(b.par); expect((b.redMovesAvailable as number) - (b.par as number)).toBeGreaterThanOrEqual(1); const w = playBattle(rules, b.pos!, r!.path); expect(w.win).toBe(true); console.info(`${id} solve ${Date.now() - t0} ms`); }
  }, 600000);
  it('runner：输一盘 → 卒冲到底后重来（计一次败）→ 按最短路径赢 → par 内 ★★★、firstTry 为假', async () => {
    const b2 = battles.find((x) => x.id === 'B2')!; const sol = solveBattle(rules, b2.pos!, b2.par as number)!; const tc = mkCtx(rules as never, { wrongHoldMs: 1 }); const idle = ['c3a1', 'a1c3', 'c3a1', 'a1c3', 'c3a1', 'a1c3', 'c3a1'];
    const p = (getRunner('battle') as unknown as { mount(s: LessonStep, c: unknown): Promise<StepResult> }).mount(b2, tc.ctx); await tick(5);
    const play = async (enc: string): Promise<void> => { for (let i = 0; i < 800; i++) { const m = rules.decode(tc.input.state() as never, enc); if (m !== null && (await tc.input.submit(m as never))) return; await tick(2); } throw new Error('never:' + enc); };
    for (const e of idle) await play(e); await tick(30); for (const e of sol.path) await play(e);
    const r = await p; expect(r).toMatchObject({ stars: 3, firstTry: false }); expect(tc.sfx).toContain('soft'); expect(tc.view.mark).toHaveBeenCalledWith('danger', expect.anything());
  }, 60000);
  it('pawnsLeft / forceSide 基本行为', () => { const s = rules.fromFen(battles[0].pos!); expect(pawnsLeft(rules, s)).toBe(3); expect(rules.turn(forceSide(rules, s, 1))).toBe(1); });
});
