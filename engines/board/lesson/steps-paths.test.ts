// 走错 / 续播 / 取消 / 选择题 等"非主路径"的行为。
import { describe, expect, it, vi } from 'vitest';
import { xqRules } from '../test/reference/xq-adapter.mjs';
import { xqLessonData, xqLessons } from '../test/xq-lesson-data';
import { createPuzzlePlayer } from '../puzzle/player';
import type { Puzzle, StepResult } from '../core/types';
import { createLessonPlayer } from './player';
import { getRunner, nameMap, type LessonStep } from './steps';
import { lessonTask } from './steps-move';
import { mkCtx, tick, type TestCtx } from './test-kit';

const rules = xqRules(); const data = xqLessonData(rules); const names = nameMap(rules); const all = xqLessons.flatMap((l) => l.steps); type Ctx = TestCtx<unknown, unknown>;
const mkc = (o: { skip?: boolean } = {}): Ctx => mkCtx(rules as never, { data, wrongHoldMs: 1, ...o }) as unknown as Ctx;
const mount = (st: LessonStep, c: Ctx): Promise<StepResult> => (getRunner(st.k) as unknown as { mount(s: LessonStep, c: unknown): Promise<StepResult> }).mount(st, c.ctx);
async function play(tc: Ctx, enc: string): Promise<void> { for (let i = 0; i < 600; i++) { const m = rules.decode(tc.input.state() as never, enc); if (m !== null && (await tc.input.submit(m as never))) return; await tick(2); } throw new Error(`never-played:${enc}`); }

describe('走错与提示', () => {
  it('sweep：落在危险格 → 黑子吃掉（演示）→ 悔回；小眼睛按钮自动按下铺 sight', async () => {
    const s = all.find((x) => x.id === 'L24.1')!; const tc = mkc(); const T = lessonTask<unknown, unknown>('sweep', s, tc.ctx); const bad = rules.legalMoves(T.start.s as never).find((m) => T.judge(T.start, m).unsafe)!;
    const p = mount(s, tc); await tick(5); await play(tc, rules.encode(bad)); await vi.waitFor(() => expect(tc.view.animateUndo).toHaveBeenCalled()); expect(tc.view.animateMove.mock.calls.length).toBeGreaterThanOrEqual(2); expect(tc.ui.buttons).toContain('小眼睛'); expect(tc.view.mark.mock.calls.some((c: unknown[]) => c[0] === 'sight')).toBe(true);
    let node = T.start; for (let i = 0; i < 8; i++) { const m = T.best(node)!; const j = T.judge(node, m); await play(tc, rules.encode(m)); node = j.next; if (j.done) break; } const r = await p; expect(r.firstTry).toBe(false);
  });
  it('trade（找赚的）：吃亏的吃法 → 对方回吃 + 负筹码 → 悔回；赚的吃法 → 正筹码 → 完成', async () => {
    const s = all.find((x) => x.k === 'trade' && x.goal === 'win')!; const tc = mkc(); const opts = s.options as { m: string; net: number }[]; const lose = opts.find((o) => o.net <= 0)!, win = opts.find((o) => o.net > 0)!;
    const p = mount(s, tc); await tick(5); await play(tc, lose.m); await vi.waitFor(() => expect(tc.view.animateUndo).toHaveBeenCalled()); await play(tc, win.m); const r = await p; expect(r.firstTry).toBe(false); expect(tc.ui.chips).toEqual([lose.net, win.net]);
  });
  it('连续两步首试没对 → 下一步先亮 H1（assist）', async () => {
    const tc = mkc(); const tap = (id: string): LessonStep => ({ id, k: 'tap', pos: '9/9/9/9/9/9/9/9/9/9 w', targets: ['e5'] }); const pl = createLessonPlayer(tc.ctx as never);
    const run = pl.run({ id: 'A', steps: [tap('a1'), tap('a2'), tap('a3')] }); const miss = async (): Promise<void> => { await tick(8); tc.input.tapSquare(names.get('a1') as number); await tick(2); tc.input.tapSquare(names.get('e5') as number); };
    await miss(); await miss(); await tick(8); const before = tc.view.mark.mock.calls.length; await tick(8); tc.input.tapSquare(names.get('e5') as number); const r = await run; expect(r.results[2].result.hintTier).toBe(1); expect(before).toBeGreaterThan(0);
  });
});
describe('题组与选择题', () => {
  it('bank 续播：从 puzzleIx 起，每题存检查点；取消时放手', async () => {
    const s = all.find((x) => x.k === 'bank' && (x.ids as string[]).length >= 3)!; const ids = s.ids as string[]; const tc = mkc(); (tc.ctx as { resumeIx?: number }).resumeIx = 1; (tc.ctx as { lessonId?: string }).lessonId = 'LX';
    const p = mount(s, tc); await tick(5); for (const id of ids.slice(1)) { const pz = data.puzzle!(id, s)!; await play(tc, pz.solution[0][0]); await tick(5); } const r = await p; expect(r.stars).toBeGreaterThan(0); expect(tc.saved.map((x) => x.puzzleIx)).toEqual(ids.slice(1).map((_, i) => i + 1));
    const t2 = mkc(); const pl = createLessonPlayer(t2.ctx as never); const run = pl.run({ id: 'B', steps: [s] }); await tick(30); pl.cancel(); const rr = await run; expect(rr.completed).toBe(false);
  });
  it('bank 没有题（ids 空 / 缺）：不能白送 firstTry（摸底曾因此把 L25 一律判会）', async () => {
    const tc = mkc(); const r = await mount({ id: 'X.1', k: 'bank', theme: 'rook' } as LessonStep, tc); expect(r.firstTry).toBe(false); expect(r.stars).toBe(1);
    const t2 = mkc(); const r2 = await mount({ id: 'X.2', k: 'bank2', ids: [] } as unknown as LessonStep, t2); expect(r2.firstTry).toBe(false);
  });
  it('选择题谜题（kidPlies 0）：答偏 2 次点亮正解（H1）；4 次只留正解（H3）；firstTry 为假', async () => {
    const tc = mkc(); const pz: Puzzle = { id: 'c1', fen: 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w', theme: 'choice', tier: 1, solution: [], kidPlies: 0, answer: 'b', judge: 'list', meta: { options: ['a', 'b', 'c'] } };
    const pp = createPuzzlePlayer({ rules: rules as never, view: tc.view, input: tc.input as never, ui: tc.ctx.ui }); tc.ui.queue.push('a', 'c', 'a', 'c', 'b'); const r = await pp.play(pz, { hints: true });
    expect(r).toMatchObject({ firstTry: false, hintTier: 3 }); expect(tc.ui.log).toContain('b:hint'); expect(tc.ui.log).toContain('a:off'); expect(tc.ui.log).toContain('b:ok');
    const t2 = mkc(); const p2 = createPuzzlePlayer({ rules: rules as never, view: t2.view, input: t2.input as never, ui: t2.ctx.ui }); t2.ui.queue.push('b'); expect(await p2.play(pz, { hints: true })).toMatchObject({ firstTry: true, hintTier: 0 });
    const t3 = mkc(); const p3 = createPuzzlePlayer({ rules: rules as never, view: t3.view, input: t3.input as never }); await expect(p3.play(pz, { hints: true })).rejects.toThrow('no-choice-ui');
  });
});
