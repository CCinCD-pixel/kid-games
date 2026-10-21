// 用 lessons.mjs 的最终数据（33 课 / 114 步）逐步跑引擎的步骤执行器：脚本机器人按"引擎答案"操作，必须每步 ★★★ 首次做对；
// 孪生（镜像）题同样跑一遍——证明字段名、par、答案、镜像改写都与最终 schema 对得上。同时校验数据里的答案 = 本引擎规则算出的答案。
import { describe, expect, it } from 'vitest';
import { xqRules } from '../test/reference/xq-adapter.mjs';
import { xqLessonData, xqLessons, xqPlacement } from '../test/xq-lesson-data';
import { netCapture } from '../core/see';
import { stateSearchAdapter } from '../core/stateadapter';
import type { StepResult } from '../core/types';
import { getRunner, nameMap, type LessonStep } from './steps';
import { lessonTask } from './steps-move';
import { forceSide } from './solo';
import { mkCtx, tick, type TestCtx } from './test-kit';
import { twinOf } from './twins';
import { createLessonPlayer } from './player';

const rules = xqRules(); const data = xqLessonData(rules); const names = nameMap(rules);
type Ctx = TestCtx<unknown, unknown>;
const mkc = (): Ctx => mkCtx(rules as never, { data, wrongHoldMs: 1 }) as unknown as Ctx;
async function playEnc(tc: Ctx, enc: string): Promise<void> { for (let i = 0; i < 600; i++) { const m = rules.decode(tc.input.state() as never, enc); if (m !== null && (await tc.input.submit(m as never))) return; await tick(2); } throw new Error(`never-played:${enc}`); }
async function act(step: LessonStep, tc: Ctx): Promise<void> {
  const k = step.k;
  if (['stars', 'capture', 'sweep', 'escape', 'make', 'trade'].includes(k)) {
    const T = lessonTask<unknown, unknown>(k as 'stars', step, tc.ctx); let node = T.start;
    for (let i = 0; i < 12; i++) { const m = T.best(node); if (m === null) throw new Error(`no-best:${step.id}`); const j = T.judge(node, m); await playEnc(tc, rules.encode(m as never)); node = j.next; if (j.done) return; }
    throw new Error(`not-done:${step.id}`);
  }
  if (k === 'tap') { for (const n of step.targets as string[]) { tc.input.tapSquare(names.get(n) as number); await tick(1); } return; }
  if (k === 'quiz') { if (Array.isArray(step.answer)) for (const n of step.answer as string[]) { tc.input.tapSquare(names.get(n) as number); await tick(1); } else tc.ui.queue.push(step.answer as string); return; }
  if (k === 'setup') { for (const [n] of data.setup!(step.part as string, step)!.place) { tc.input.tapSquare(names.get(n) as number); await tick(1); } return; }
  if (k === 'bank' || k === 'bank2') {
    for (const id of step.ids as string[]) { const p = data.puzzle!(id, step)!; for (let ply = 0; ply < p.kidPlies; ply++) await playEnc(tc, p.solution[2 * ply][0]); }
  }
}
async function solveStep(step: LessonStep): Promise<StepResult> {
  const tc = mkc(); const runner = getRunner(step.k) as unknown as { mount(s: LessonStep, c: unknown): Promise<StepResult> }; const p = runner.mount(step, tc.ctx); await tick(5); await act(step, tc); return p;
}
const byId = (l: { steps: readonly LessonStep[] }) => (id: string): LessonStep | null => l.steps.find((s) => s.id === id) ?? null;
const SKIP = new Set(['battle']);   // 小战场另测（battle.test.ts）

describe('lessons.v1.json 全部步骤（含孪生）可被引擎步骤执行器首次做对并拿 ★★★', () => {
  for (const lesson of xqLessons) {
    it(`${lesson.id} ${lesson.name}`, async () => {
      for (const step of lesson.steps) {
        if (SKIP.has(step.k)) continue;
        const r = await solveStep(step); expect(r, `${step.id} ${step.k}`).toMatchObject({ stars: 3, firstTry: true });
        if (step.twin === 'mirror') { let pos: string | null = step.pos ?? null; try { pos ??= data.position!(step); } catch { /* */ } const t = twinOf(step, rules as never, byId(lesson), pos); expect(t, `${step.id} 镜像`).not.toBeNull(); const r2 = await solveStep(t!); expect(r2, `${t!.id} 孪生`).toMatchObject({ stars: 3, firstTry: true }); }
      }
    }, 60000);
  }
  it('摸底任务（placement）用同一套执行器', async () => {
    for (const t of xqPlacement as unknown as LessonStep[]) { if (t.k === 'bank') continue; const step = { ...t, id: t.id } as LessonStep; const r = await solveStep(step); expect(r, t.id).toMatchObject({ stars: 3 }); }
  }, 60000);
});

describe('数据里的答案 = 引擎规则算出的答案', () => {
  const all = xqLessons.flatMap((l) => l.steps);
  it('moves / incheck / mated / stalemate 的答案', () => {
    for (const s of all.filter((x) => x.k === 'quiz')) {
      const fen = s.pos ?? data.position!(s)!; const side = s.side === 'b' ? 1 : 0;
      if (s.q === 'moves') { const st = rules.fromFen(fen); const got = rules.legalFrom(st, names.get(s.from as string)!).map((m) => rules.geometry.name(rules.moveInfo(st, m).to)).sort(); expect(got, s.id).toEqual([...(s.answer as string[])].sort()); }
      if (s.q === 'incheck') expect(!!rules.check(forceSide(rules, rules.fromFen(fen), side)) ? 'yes' : 'no', s.id).toBe(s.answer);
      if (s.q === 'mated') { const st = forceSide(rules, rules.fromFen(fen), s.puzSel ? rules.turn(rules.fromFen(fen)) : side); const chk = !!rules.check(st); const n = rules.legalMoves(st).length; expect(chk && n === 0 ? 'mate' : chk ? 'check-only' : 'no-check', s.id).toBe(s.answer); }
      if (s.q === 'stalemate') { const st = forceSide(rules, rules.fromFen(fen), side); expect(!rules.check(st) && rules.legalMoves(st).length === 0 ? 'stalemate' : 'moves-left', s.id).toBe(s.answer); }
    }
  });
  it('make 的 accepted、trade 的 options.net', () => {
    const sa = stateSearchAdapter(rules);
    for (const s of all.filter((x) => x.k === 'make')) { const T = lessonTask<unknown, unknown>('make', s, mkc().ctx); const acc = rules.legalMoves(T.start.s as never).filter((m) => T.judge(T.start, m).ok).map((m) => rules.encode(m)).sort(); expect(acc, s.id).toEqual([...(s.accepted as string[])].sort()); }
    for (const s of all.filter((x) => x.k === 'trade')) { const st = rules.fromFen(s.pos!); for (const o of s.options as { m: string; net: number }[]) { const m = rules.decode(st, o.m)!; expect(netCapture(sa.create(st), m, sa.valueAt), `${s.id} ${o.m}`).toBe(o.net); } }
  });
  it('stars / capture / sweep：BFS par 与数据一致；sweep 的 parUnsafe 不依赖 avoid', () => {
    for (const s of all.filter((x) => ['stars', 'capture', 'sweep'].includes(x.k))) { const T = lessonTask<unknown, unknown>(s.k as 'stars', s, mkc().ctx); expect(T.best(T.start), s.id).not.toBeNull(); }
  });
});

describe('整课播放', () => {
  it('L05 车吃子（capture ×4）从头到尾：存检查点、旁白、课星 ★★★', async () => {
    const lesson = xqLessons.find((l) => l.id === 'L05')!; const tc = mkc(); const player = createLessonPlayer(tc.ctx as never);
    const run = player.run(lesson as never);
    // 机器人跟着播放器走：每步开始后用 act 操作
    let done = false; void run.then(() => { done = true; });
    for (const step of lesson.steps) { for (let i = 0; i < 400 && !tc.saved.some((s) => s.stepId === step.id); i++) await tick(2); await tick(8); await act(step, tc); }
    const r = await run; expect(done).toBe(true); expect(r).toMatchObject({ completed: true, stars: 3 }); expect(tc.saved.map((s) => s.stepId)).toEqual(lesson.steps.map((s) => s.id)); expect(tc.said).toContain('p.capture');
  }, 30000);
});
