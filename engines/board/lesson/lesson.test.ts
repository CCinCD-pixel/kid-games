import { describe, expect, it, vi } from 'vitest';
import { mirrorSquares, mirrorStep, twinOf } from './twins';
import { getRunner, starsFor, stepKinds, registerStep, type LessonStep } from './steps';
import { createLessonPlayer, rollStars } from './player';
import { fakeView, mkCtx, tick } from './test-kit';
import { chessRules } from '../test/reference/chess-adapter.mjs';
import { xqRules } from '../test/reference/xq-adapter.mjs';
import type { StepResult } from '../core/types';

const chess = chessRules(); const xq = xqRules();
const step = (o: Partial<LessonStep> & { k: string; id: string }): LessonStep => ({ pos: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', ...o }) as LessonStep;
const idx = (n: string): number => { for (let q = 0; q < 64; q++) if (chess.geometry.name(q) === n) return q; return -1; };
const mount = (st: LessonStep, ctx: unknown): Promise<StepResult> => (getRunner(st.k) as unknown as { mount(s: LessonStep, c: unknown): Promise<StepResult> }).mount(st, ctx);
const dec = (input: { state(): unknown }, enc: string): unknown => chess.decode(input.state(), enc);

describe('孪生题（镜像）', () => {
  it('mirrorSquares 是对合；国象 a↔h、象棋 a↔i', () => {
    for (const r of [chess, xq]) { const m = mirrorSquares(r.geometry as never); for (let q = 0; q < r.geometry.squares; q++) expect(m[m[q]]).toBe(q); }
    const mc = mirrorSquares(chess.geometry as never); expect(chess.geometry.name(mc[idx('a2')])).toBe('h2'); expect(chess.geometry.name(mc[idx('b1')])).toBe('g1');
    const mx = mirrorSquares(xq.geometry as never); let a1 = -1, i1 = -1; for (let q = 0; q < 90; q++) { if (xq.geometry.name(q) === 'a1') a1 = q; if (xq.geometry.name(q) === 'i1') i1 = q; } expect(mx[a1]).toBe(i1);
  });
  it('mirrorStep：局面与格名 / 着法串 / options 一起镜像；twinOf 按 id / mirror / 不可镜像回退；无 pos 时用 posFen', () => {
    const s = step({ k: 'capture', id: 'c1', pos: '4k3/8/8/8/8/2p5/1P6/4K3 w - - 0 1', hero: 'b2', targets: ['c3'], twin: 'mirror' }); const t = mirrorStep(s, chess)!; expect(t.targets).toEqual(['f3']); expect(t.hero).toBe('g2'); expect(t.id).toBe('c1~m'); expect(t.pos!.split(' ')[0]).toBe('3k4/8/8/8/8/5p2/6P1/3K4'); expect(t.twin).toBeUndefined();
    const other = step({ k: 'capture', id: 'c2', twin: 'c3' }); expect(twinOf(other, chess, (id) => (id === 'c3' ? step({ k: 'capture', id: 'c3' }) : null))?.id).toBe('c3'); expect(twinOf(step({ k: 'tap', id: 'x' }), chess, () => null)).toBeNull();
    const noMirror = { ...chess, mirror: undefined } as unknown as typeof chess; expect(mirrorStep(s, noMirror)).toBeNull();
    const mv = mirrorStep(step({ k: 'demo', id: 'd', ghost: ['e2e4', 'b1c3'], options: [{ m: 'b1c3', net: 1 }] }), chess)!; expect(mv.ghost).toEqual(['d2d4', 'g1f3']); expect(mv.options).toEqual([{ m: 'g1f3', net: 1 }]);
    const noPos = { k: 'quiz', id: 'q', puzSel: ['a', 0, false], twin: 'mirror', answer: 'mate' } as unknown as LessonStep; expect(mirrorStep(noPos, chess)).toBeNull(); expect(mirrorStep(noPos, chess, '4k3/8/8/8/8/2p5/1P6/4K3 w - - 0 1')?.puzSel).toBeUndefined();
  });
});
describe('星级', () => {
  it('starsFor：有 par 看着数；无 par 看提示与失败', () => {
    expect(starsFor(3, 3, 0, 0)).toBe(3); expect(starsFor(3, 3, 3, 0)).toBe(2); expect(starsFor(5, 3, 0, 0)).toBe(2); expect(starsFor(9, 3, 0, 0)).toBe(1); expect(starsFor(1, undefined, 0, 0)).toBe(3); expect(starsFor(2, undefined, 1, 1)).toBe(2); expect(starsFor(2, undefined, 3, 4)).toBe(1);
  });
  it('rollStars：平均向上取整', () => { const r = (n: 1 | 2 | 3): StepResult => ({ stars: n, firstTry: true, hintTier: 0 }); expect(rollStars([r(3), r(2)])).toBe(3); expect(rollStars([r(1), r(2), r(2)])).toBe(2); expect(rollStars([])).toBe(0); });
});

describe('步型执行器（国象局面，只测通用语义）', () => {
  it('注册表含引擎自带的 15 种；registerStep 可扩展', () => {
    for (const k of ['tap', 'quiz', 'setup', 'stars', 'capture', 'sweep', 'escape', 'make', 'trade', 'demo', 'card', 'bank', 'bank2', 'battle', 'play']) expect(stepKinds()).toContain(k);
    registerStep('zz-test', { hint: () => ({}), async demo() { /* */ }, async mount() { return { stars: 3, firstTry: true, hintTier: 0 }; } }); expect(getRunner('zz-test')).toBeDefined();
  });
  it('capture：目标全吃掉才算完成；吃进死胡同 → 走过去 → 悔回 → 提示阶梯（2 次失误 H1）', async () => {
    const { ctx, view, input, sfx } = mkCtx(chess); const st = step({ k: 'capture', id: 'cap', pos: '4k3/8/8/3p1p2/4P3/8/8/4K3 w - - 0 1', hero: 'e4', targets: ['f5'], par: 1 });
    const p = mount(st, ctx); await tick(); await input.submit(dec(input, 'e4d5')); await tick(); expect(view.animateUndo).toHaveBeenCalledTimes(1); expect(sfx).toContain('soft'); await input.submit(dec(input, 'e4e5')); await tick(); expect(view.animateUndo).toHaveBeenCalledTimes(2); expect(view.mark).toHaveBeenCalled();
    await input.submit(dec(input, 'e4f5')); const r = await p; expect(r.firstTry).toBe(false); expect(r.hintTier).toBe(1); expect(r.stars).toBeLessThanOrEqual(2);
  });
  it('stars：收齐星；movers 之外的子点了不动；par 内 ★★★', async () => {
    const { ctx, input, view } = mkCtx(chess); const st = step({ k: 'stars', id: 'st', pos: '4k3/8/8/8/8/8/8/R3K3 w - - 0 1', hero: 'a1', stars: ['a5', 'e5'], par: 2 }); const p = mount(st, ctx); await tick();
    input.tapSquare(idx('e1')); await tick(); expect(input.selected).toBeNull(); await input.submit(dec(input, 'a1a5')); await tick(); await input.submit(dec(input, 'a5e5')); const r = await p; expect(r).toMatchObject({ stars: 3, firstTry: true }); expect(view.animateMove).toHaveBeenCalledTimes(2);
  });
  it('make（check / mate 目标）：不算数的着法悔回；escape：任何合法着法', async () => {
    const a = mkCtx(chess); const pc = mount(step({ k: 'make', id: 'mk', pos: '7k/8/8/8/8/8/8/R3K3 w - - 0 1', goal: 'check' }), a.ctx); await tick(); await a.input.submit(dec(a.input, 'a1a7')); await tick(); expect(a.view.animateUndo).toHaveBeenCalledTimes(1); await a.input.submit(dec(a.input, 'a1a8')); const rc = await pc; expect(rc.firstTry).toBe(false);
    const b = mkCtx(chess); const pm = mount(step({ k: 'make', id: 'mk2', pos: '6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1', goal: 'mate' }), b.ctx); await tick(); await b.input.submit(dec(b.input, 'a1a8')); expect((await pm).firstTry).toBe(true);
    const c = mkCtx(chess); const pe = mount(step({ k: 'escape', id: 'es', pos: '4k3/4r3/8/8/8/8/8/4K3 w - - 0 1', mode: 'king' }), c.ctx); await tick(); expect(c.view.mark).toHaveBeenCalledWith('check', expect.anything()); await c.input.submit(dec(c.input, 'e1d1')); expect(await pe).toMatchObject({ firstTry: true, stars: 3 });
  });
  it('tap：点全目标才算完成；点别处记失误', async () => {
    const a = mkCtx(chess); const pt = mount(step({ k: 'tap', id: 't', targets: ['e4', 'd5'] }), a.ctx); await tick();
    a.input.tapSquare(idx('a1')); a.input.tapSquare(idx('e4')); await tick(); a.input.tapSquare(idx('d5')); const rt = await pt; expect(rt.firstTry).toBe(false); expect(a.sfx.filter((s) => s === 'ok')).toHaveLength(2);
  });
  it('quiz 点格子：palace 答对 ★★★，答偏计失误；选答案类用 ui.choose，答偏后点亮正解', async () => {
    const b = mkCtx(chess); const pq = mount(step({ k: 'quiz', id: 'q', q: 'palace', opts: ['a1', 'h1'], answer: ['h1'] }), b.ctx); await tick(); b.input.tapSquare(idx('a1')); await tick(); b.input.tapSquare(idx('a1')); await tick(); b.input.tapSquare(idx('h1')); expect((await pq).firstTry).toBe(false);
    const c = mkCtx(chess); const p3 = mount(step({ k: 'quiz', id: 'q2', q: 'palace', opts: ['a1', 'h1'], answer: ['h1'] }), c.ctx); await tick(); c.input.tapSquare(idx('h1')); expect(await p3).toMatchObject({ stars: 3, firstTry: true });
    const d = mkCtx(chess); d.ui.queue.push('no', 'no', 'yes'); const r = await mount(step({ k: 'quiz', id: 'q3', q: 'incheck', pos: '4k3/4r3/8/8/8/8/8/4K3 w - - 0 1', side: 'w', answer: 'yes' }), d.ctx); expect(r).toMatchObject({ firstTry: false, hintTier: 1 }); expect(d.ui.log).toContain('yes:hint');
  });
});

describe('LessonPlayer', () => {
  it('按步骤 id 存进度；从 progress 续播；skip() 跳过 demo / card；未知步型抛错', async () => {
    const { ctx, saved, said, ghost } = mkCtx(chess, { skip: true }); const lesson = { id: 'L1', steps: [step({ k: 'card', id: 's1', say: 'a' }), step({ k: 'demo', id: 's2', ghost: ['e2e4'] }), step({ k: 'card', id: 's3', say: 'b' })] };
    const r = await createLessonPlayer(ctx).run(lesson); expect(saved.map((s) => s.stepId)).toEqual(['s1', 's2', 's3']); expect(r.completed).toBe(true); expect(r.results.every((x) => x.skipped)).toBe(true); expect(said).toEqual([]); expect(ghost.drag).not.toHaveBeenCalled();
    const b = mkCtx(chess); const r2 = await createLessonPlayer(b.ctx).run(lesson, { lessonId: 'L1', stepId: 's3' }); expect(b.saved.map((s) => s.stepId)).toEqual(['s3']); expect(b.said).toEqual(['b']); expect(r2.stars).toBe(3);
    await expect(createLessonPlayer(b.ctx).run({ id: 'L2', steps: [step({ k: 'nope', id: 'x' })] })).rejects.toThrow('unknown-step-kind:nope');
  });
  it('quiz 孪生确认：首次对 + 孪生也对 → ★★★；孪生答偏 → 最多 ★★', async () => {
    const q = (id: string) => step({ k: 'quiz', id, q: 'palace', pos: '4k3/8/8/8/8/8/8/R3K3 w - - 0 1', opts: ['a1', 'h1'], answer: ['a1'], twin: 'mirror' });
    const a = mkCtx(chess); const pa = createLessonPlayer(a.ctx).run({ id: 'Q', steps: [q('q1')] }); await tick(); a.input.tapSquare(idx('a1')); await tick(); a.input.tapSquare(idx('h1')); expect((await pa).results[0].result.stars).toBe(3);
    const b = mkCtx(chess); const pb = createLessonPlayer(b.ctx).run({ id: 'Q', steps: [q('q2')] }); await tick(); b.input.tapSquare(idx('a1')); await tick(); b.input.tapSquare(idx('a1')); await tick(); b.input.tapSquare(idx('h1')); expect((await pb).results[0].result.stars).toBeLessThanOrEqual(2);
  });
  it('cancel()：在途步骤放手输入并以 completed=false 结束；可选步问游戏、跳过的不计星', async () => {
    const a = mkCtx(chess); const pl = createLessonPlayer(a.ctx); const run = pl.run({ id: 'C', steps: [step({ k: 'tap', id: 't1', targets: ['e4'] }), step({ k: 'card', id: 't2' })] }); await tick(); pl.cancel(); const r = await run; expect(r.completed).toBe(false); expect(r.results).toHaveLength(0);
    const b = mkCtx(chess); const asked: string[] = []; const r2 = await createLessonPlayer(b.ctx, { askOptional: async (s) => { asked.push(s.id); return false; } }).run({ id: 'O', steps: [step({ k: 'card', id: 'c1' }), step({ k: 'battle', id: 'B1', optional: true })] }); expect(asked).toEqual(['B1']); expect(r2.results[1]).toMatchObject({ skipped: true, optional: true }); expect(r2.stars).toBe(3);
  });
  it('fakeView 与 ctx 夹具自洽', () => { expect(typeof fakeView().mark).toBe('function'); expect(vi.isMockFunction(fakeView().animateMove)).toBe(true); });
});
