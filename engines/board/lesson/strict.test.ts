// strict（摸底 / 测验口径）与题组放宽的边界：QA r3 major——前两题没对之后，第 3 题（题组）走错 ≤ 2 步仍被判"一次做对"，摸底把 L25 白送。
import { describe, expect, it } from 'vitest';
import { xqRules } from '../test/reference/xq-adapter.mjs';
import { xqLessonData, xqLessons } from '../test/xq-lesson-data';
import type { StepResult } from '../core/types';
import { createLessonPlayer } from './player';
import { nameMap, type LessonStep } from './steps';
import { mkCtx, tick, type TestCtx } from './test-kit';

const rules = xqRules(); const data = xqLessonData(rules); const names = nameMap(rules); const all = xqLessons.flatMap((l) => l.steps); type Ctx = TestCtx<unknown, unknown>;
const mkc = (): Ctx => mkCtx(rules as never, { data, wrongHoldMs: 1 }) as unknown as Ctx;
const bank = all.find((x) => x.k === 'bank' && (x.ids as string[]).length >= 1)!; const puz = data.puzzle!((bank.ids as string[])[0], bank)!; const SOL = puz.solution[0][0];
const tap = (id: string): LessonStep => ({ id, k: 'tap', pos: '9/9/9/9/9/9/9/9/9/9 w', targets: ['e5'] });
const oneBank: LessonStep = { ...bank, id: 'bk', ids: [(bank.ids as string[])[0]] };
async function play(tc: Ctx, enc: string): Promise<void> { for (let i = 0; i < 600; i++) { const m = rules.decode(tc.input.state() as never, enc); if (m !== null && (await tc.input.submit(m as never))) return; await tick(2); } throw new Error(`never-played:${enc}`); }
const missTap = async (tc: Ctx): Promise<void> => { await tick(8); tc.input.tapSquare(names.get('a1') as number); await tick(2); tc.input.tapSquare(names.get('e5') as number); };
/** 两道点点题都先点错再点对（连续两步首试没对），然后第三步是题组；wrongs = 题组里先走错几步 */
async function run(strict: boolean, wrongs: number): Promise<{ r: StepResult; hintMarksAtBankStart: number }> {
  const tc = mkc(); const pl = createLessonPlayer(tc.ctx as never); const p = pl.run({ id: 'T', strict, steps: [tap('t1'), tap('t2'), oneBank] }); const hints = (): number => tc.view.mark.mock.calls.filter((c: unknown[]) => c[0] === 'hint').length;
  await missTap(tc); await missTap(tc); const h0 = hints(); await tick(40); const hint = hints() - h0;       // 只数题组开始之后新亮的提示（点点题自己的 lit 不算）
  for (let i = 0; i < wrongs; i++) { const st = tc.input.state() as never; const bad = rules.legalMoves(st).map((m) => rules.encode(m)).find((e) => e !== SOL)!; await play(tc, bad); await tick(30); }
  await play(tc, SOL); const res = await p; return { r: res.results[2].result, hintMarksAtBankStart: hint };
}
describe('题组放宽只放宽预先亮出的 H1，不赦免走错', () => {
  it('放宽档（连续两步没对）+ 一步不错：照旧算一次做对（行为不变）', async () => {
    const { r } = await run(false, 0); expect(r.firstTry).toBe(true); expect(r.hintTier).toBe(0); expect(r.stars).toBe(3);
  });
  it.each([1, 2])('放宽档 + 走错 %i 步：不再算一次做对，最多 ★★（以前被赦免，题组星级被抬高）', async (n) => {
    const { r } = await run(false, n); expect(r.firstTry).toBe(false); expect(r.stars).toBeLessThanOrEqual(2);
  });
  it('strict：连续两步没对也不放宽——没有预亮的提示；一步不错 = 一次做对', async () => {
    const { r, hintMarksAtBankStart } = await run(true, 0); expect(r.firstTry).toBe(true); expect(r.hintTier).toBe(0); expect(hintMarksAtBankStart, 'strict 下不该预亮 H1').toBe(0);
  });
  it.each([1, 2])('strict：前两题没对 + 题组走错 %i 步再走对 = 不是一次做对（摸底 L25 的回归）', async (n) => {
    const { r } = await run(true, n); expect(r.firstTry).toBe(false);
  });
  it('放宽档里预先亮出 H1 的那一刻确实亮了（对照 strict）', async () => {
    const { hintMarksAtBankStart } = await run(false, 0); expect(hintMarksAtBankStart).toBeGreaterThan(0);
  });
});
