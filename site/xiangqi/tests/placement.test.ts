// 摸底（小军师考考你）的判分：每题只证明它测过的课；没被测的课不被跳过；应将三法 / 将死 / 困毙判负永远被推荐、排最前。
import { describe, expect, it } from 'vitest';
import { gradePlacement, recommendAfter } from '../src/lesson/placement';
import { XQ_LESSONS, XQ_PLACEMENT, xqLessonData } from '../src/lesson/data';
import { getRunner, type LessonStep } from '@engines/board/lesson/steps';
import { mkCtx, tick } from '@engines/board/lesson/test-kit';
import { createLessonPlayer } from '@engines/board/lesson/player';
import type { StepResult } from '@engines/board/core/types';
import { createRules } from '../src/rules/rules';

const all = (ok: (id: string) => boolean) => XQ_PLACEMENT.map((s) => ({ stepId: s.id, correct: ok(s.id) }));
describe('摸底判分', () => {
  it('9 题都带 say（屏幕上有题目说明）和 tests（它测哪几课）；tests 里的课都存在', () => {
    expect(XQ_PLACEMENT.length).toBe(9); const ids = new Set(XQ_LESSONS.map((l) => l.id));
    for (const s of XQ_PLACEMENT) { expect(typeof s.say, s.id).toBe('string'); expect(s.tests.length, s.id).toBeGreaterThan(0); for (const t of s.tests) expect(ids.has(t), `${s.id}→${t}`).toBe(true); }
  });
  it('全部答对：只有被测过的课算会；L01–L03 / L12 / L18–L21 / L24 / L26 之后一律没被测', () => {
    const g = gradePlacement(all(() => true)); const known = new Set(g.known);
    for (const id of ['L04', 'L05', 'L06', 'L07', 'L08', 'L09', 'L10', 'L11', 'L13', 'L14', 'L15', 'L16', 'L17', 'L22', 'L23', 'L25']) expect(known.has(id), id).toBe(true);
    for (const id of ['L01', 'L02', 'L03', 'L12', 'L18', 'L19', 'L20', 'L21', 'L24', 'L26', 'L27', 'L28', 'L29', 'L30', 'L31', 'L32', 'L33']) expect(known.has(id), id).toBe(false);
    expect(g.known.length).toBe(16);                                                    // 不再是"全对 = 27 / 33"
  });
  it('一题没全对：它测的课都不算会，别的题不受影响', () => {
    const g = gradePlacement(all((id) => id !== 'PL.3')); const known = new Set(g.known); expect(known.has('L08')).toBe(false); expect(known.has('L09')).toBe(false); expect(known.has('L10')).toBe(true);
    const none = gradePlacement(all(() => false)); expect(none.known).toEqual([]);
  });
  it('推荐：全对之后 应将三法 / 将死 / 困毙判负 排在最前（接着学），之后才是没测的课', () => {
    const g = gradePlacement(all(() => true)); const known = new Set(g.known); const rec = recommendAfter((id) => known.has(id));
    expect(rec.slice(0, 3)).toEqual(['L18', 'L19', 'L20']); expect(rec).toContain('L01'); expect(rec).not.toContain('L04'); expect(new Set(rec).size).toBe(rec.length);
  });
});

// QA r2 M1：第 9 题（一步杀）没有 ids，题组执行器 2 秒后直接放行 → L25 恒被判会。下面锁死：9 道题每一道都必须"被问"并等孩子作答。
describe('摸底每题都要作答（QA r2 M1）', () => {
  const rules = createRules(); const data = xqLessonData(rules);
  const mount = (st: LessonStep, tc: ReturnType<typeof mkCtx>): Promise<StepResult> => (getRunner(st.k) as unknown as { mount(s: LessonStep, c: unknown): Promise<StepResult> }).mount(st, tc.ctx);
  it('每道题都带"要作答"的数据：capture 有 targets、quiz 有 answer、make / trade 有 accepted、bank 有可解析的 ids', () => {
    for (const s of XQ_PLACEMENT as unknown as (LessonStep & { tests: string[] })[]) {
      if (s.k === 'capture') expect((s.targets as string[]).length, s.id).toBeGreaterThan(0);
      else if (s.k === 'quiz' || s.k === 'qmoves') expect((s.answer as string[]).length, s.id).toBeGreaterThan(0);
      else if (s.k === 'make' || s.k === 'trade') expect((s.accepted as string[]).length, s.id).toBeGreaterThan(0);
      else if (s.k === 'bank') { const ids = s.ids as string[]; expect(Array.isArray(ids) && ids.length > 0, `${s.id} 缺 ids`).toBe(true); for (const id of ids) { const p = data.puzzle!(id, s); expect(p, `${s.id}:${id}`).not.toBeNull(); expect(p!.solution.length, id).toBeGreaterThan(0); } }
      else throw new Error(`未知题型 ${s.k}`);
    }
  });
  it('第 9 题：不作答就不会结束（等 600 ms 仍悬着）；答对一次过 = firstTry；先走错 = 非 firstTry → L25 不算会', async () => {
    const pl9 = (XQ_PLACEMENT as unknown as LessonStep[]).find((x) => x.id === 'PL.9')!;
    const a = mkCtx(rules as never, { data, wrongHoldMs: 1 }); let settled = false; const pa = mount(pl9, a as never).then((r) => { settled = true; return r; });
    await tick(300); await new Promise((r) => setTimeout(r, 300)); expect(settled, '没人作答，题却结束了').toBe(false);
    const sol = data.puzzle!('m1.rook.01', pl9)!.solution[0][0]; const play = async (tc: typeof a, enc: string): Promise<void> => { for (let i = 0; i < 600; i++) { const m = rules.decode(tc.input.state() as never, enc); if (m !== null && (await tc.input.submit(m as never))) return; await tick(2); } throw new Error(`never-played:${enc}`); };
    await play(a, sol); const ra = await pa; expect(ra.firstTry).toBe(true);
    // 先走一个别的合法着（不是杀棋），再走正解
    const b = mkCtx(rules as never, { data, wrongHoldMs: 1 }); const pb = mount(pl9, b as never); await tick(30);
    const st = b.input.state() as never; const wrong = rules.legalMoves(st).map((m) => rules.encode(m)).find((e) => e !== sol)!; await play(b, wrong); await tick(50); await play(b, sol); const rb = await pb; expect(rb.firstTry).toBe(false);
    const g = gradePlacement(XQ_PLACEMENT.map((x) => ({ stepId: x.id, correct: x.id === 'PL.9' ? rb.firstTry : true }))); expect(g.known).not.toContain('L25'); expect(g.known.length).toBe(15);
  }, 20000);
  it('一题都没答 / 全部答错：什么课都不算会（含 L25）', () => {
    expect(gradePlacement([]).known).toEqual([]); expect(gradePlacement(XQ_PLACEMENT.map((x) => ({ stepId: x.id, correct: false }))).known).toEqual([]);
  });
});

// QA r3 major：前两题（第 7、8 题）没对 → 引擎的辅助档给第 9 题预亮 H1，并赦免 ≤ 2 步走错 → 第 9 题被判一次做对 → L25 白送（"全错"摸底还说"有 1 课你已经会了"）。
describe('摸底严格计分：前两题没对之后，第 9 题走错就不是一次做对（QA r3 major）', () => {
  const rules = createRules(); const data = xqLessonData(rules); const steps = (ids: string[]): LessonStep[] => ids.map((id) => (XQ_PLACEMENT as unknown as LessonStep[]).find((x) => x.id === id)!);
  const sol = data.puzzle!('m1.rook.01', steps(['PL.9'])[0])!.solution[0][0];
  /** 第 7 题（将军）先走一个不是将军的着再走对；第 8 题（换子）先选亏的再选赚的；第 9 题走错 `wrong9` 步后走对。strict 与否都跑，两种口径下第 9 题都不能算一次做对。 */
  async function wrongRun(strict: boolean, wrong9: number): Promise<Record<string, StepResult>> {
    const tc = mkCtx(rules as never, { data, wrongHoldMs: 1 }); const pl = createLessonPlayer(tc.ctx as never); const p = pl.run({ id: 'PL', strict, steps: steps(['PL.7', 'PL.8', 'PL.9']) });
    const board = (fen: string): string => fen.split(' ')[0];
    /** 等这一题的局面真的摆上盘、输入也交给这一题（以免拿上一题的局面算"走错的着法"） */
    const until = async (fen: string): Promise<void> => { for (let i = 0; i < 1500; i++) { if (board(rules.toFen(tc.input.state() as never)) === board(fen)) { await tick(15); return; } await tick(2); } throw new Error(`board-never-shown:${fen}`); };
    const play = async (enc: string): Promise<void> => { for (let i = 0; i < 800; i++) { const m = rules.decode(tc.input.state() as never, enc); if (m !== null && (await tc.input.submit(m as never))) return; await tick(2); } throw new Error(`never-played:${enc}`); };
    const other = (accepted: string[]): string => rules.legalMoves(tc.input.state() as never).map((m) => rules.encode(m)).find((e) => !accepted.includes(e))!;
    const [s7, s8, s9] = steps(['PL.7', 'PL.8', 'PL.9']) as (LessonStep & { pos: string })[]; const fen9 = data.puzzle!('m1.rook.01', s9)!.fen;
    await until(s7.pos); await play(other(['a5a10', 'a5f5'])); await tick(40); await play('a5a10');                       // 第 7 题：先错后对
    await until(s8.pos); await play('e5e8'); await tick(40); await play('e5a5');                                          // 第 8 题：先选亏的再选赚的
    await until(fen9); for (let i = 0; i < wrong9; i++) { await play(other([sol])); await tick(40); } await play(sol);   // 第 9 题
    const res = await p; return Object.fromEntries(res.results.map((x) => [x.stepId, x.result]));
  }
  it.each([[true, 1], [true, 2], [false, 1], [false, 2]])('strict=%s，第 9 题走错 %i 步再走对：PL.7 / PL.8 / PL.9 都不是一次做对 → 什么课都不算会', async (strict, n) => {
    const r = await wrongRun(strict, n); expect(r['PL.7'].firstTry).toBe(false); expect(r['PL.8'].firstTry).toBe(false); expect(r['PL.9'].firstTry, 'PL.9 被放宽成一次做对了').toBe(false);
    const g = gradePlacement(XQ_PLACEMENT.map((x) => ({ stepId: x.id, correct: !!r[x.id]?.firstTry && r[x.id].hintTier === 0 }))); expect(g.known).toEqual([]);
  }, 30000);
  it('对照：前两题没对，第 9 题一步不错（strict，没有任何提示）= 一次做对 = L25 算会（真会做的孩子不被冤枉）', async () => {
    const r = await wrongRun(true, 0); expect(r['PL.9'].firstTry).toBe(true); expect(r['PL.9'].hintTier).toBe(0);
    const g = gradePlacement(XQ_PLACEMENT.map((x) => ({ stepId: x.id, correct: !!r[x.id]?.firstTry && r[x.id].hintTier === 0 }))); expect(g.known).toEqual(['L25']);
  }, 30000);
});
