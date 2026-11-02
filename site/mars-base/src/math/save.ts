import { createStore, type Store } from '@kit/progress';
import {
  OPS, PASS_SCORE, QUESTIONS_PER_STAGE, STAGES, WARMUP_QUESTIONS, checkProblem, inStage, questionsFor, stageById, warmupFor,
  type Operation, type Problem, type Stage, type TrackOp,
} from './problems';
import { splittable } from './split';

export interface Review { due: number; problem: Problem }
export interface MathRun {
  stageId: string; round: number; index: number; correct: number; retrying: boolean; attempts: number; reviews: Review[]; reviewed: number;
  /** guided warm-up questions still to do before the scored eight (never counted in the score) */
  warm: number; warmDone: number;
  /** active seconds spent on this round so far */
  sec: number;
}
export interface FastRecord { best: number; last?: number; runs?: number }
export interface MathSave {
  best: Record<string, number>; plays: Record<string, number>; run: MathRun | null;
  /** 测起点: the tier a line starts at (every tier below it counts as passed) */
  placed: Partial<Record<Operation, number>>;
  /** 超频: personal best seconds per line */
  fast: Partial<Record<TrackOp, FastRecord>>;
  /** seconds the previous finished round of a stage took */
  lastSec: Record<string, number>;
}
export const defaults = (): MathSave => ({ best: {}, plays: {}, run: null, placed: {}, fast: {}, lastSec: {} });
export const MATH_SAVE_KEY = 'kg:v1:mars-arithmetic';
/** v2 adds placed / fast / lastSec and run.warm / sec. v1 saves load unchanged (see readMathSave). */
export const MATH_SAVE_VERSION = 2;

export function openMathStore(storage?: Storage): Store<MathSave> {
  return createStore<MathSave>('mars-arithmetic', { version: MATH_SAVE_VERSION, defaults, migrate: (old) => old as MathSave, ...(storage ? { storage } : {}) });
}

const int = (n: unknown, low: number, high: number): n is number => typeof n === 'number' && Number.isInteger(n) && n >= low && n <= high;
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Rebuild a problem from untrusted data (saves from v1 have no `kind`). Null when it is not a valid problem. */
export function normalizeProblem(raw: unknown): Problem | null {
  if (!isObject(raw)) return null;
  const op = raw.op;
  if (op !== 'add' && op !== 'sub' && op !== 'mul' && op !== 'div') return null;
  const kind = raw.kind ?? 'calc';
  const expr = (e: unknown) => (isObject(e) && Array.isArray(e.nums) && Array.isArray(e.ops) ? { nums: e.nums as number[], ops: e.ops as Operation[] } : null);
  let p: Problem | null = null;
  if (kind === 'calc' && int(raw.a, 0, 999) && int(raw.b, 0, 999) && int(raw.answer, 0, 999)) p = { kind: 'calc', op, a: raw.a, b: raw.b, answer: raw.answer };
  else if (kind === 'rem' && op === 'div' && int(raw.a, 0, 999) && int(raw.b, 0, 999) && int(raw.answer, 0, 999) && int(raw.rem, 0, 999)) p = { kind: 'rem', op: 'div', a: raw.a, b: raw.b, answer: raw.answer, rem: raw.rem };
  else if (kind === 'fill' && (raw.a === null || int(raw.a, 0, 999)) && (raw.b === null || int(raw.b, 0, 999)) && int(raw.c, 0, 999) && int(raw.answer, 0, 999)) p = { kind: 'fill', op, a: raw.a as number | null, b: raw.b as number | null, c: raw.c, answer: raw.answer };
  else if (kind === 'expr' && Array.isArray(raw.nums) && Array.isArray(raw.ops) && int(raw.answer, 0, 999)) p = { kind: 'expr', op, nums: raw.nums as number[], ops: raw.ops as Operation[], answer: raw.answer };
  else if (kind === 'cmp' && (raw.answer === -1 || raw.answer === 0 || raw.answer === 1)) { const left = expr(raw.left), right = expr(raw.right); if (left && right) p = { kind: 'cmp', op, left, right, answer: raw.answer }; }
  return p && checkProblem(p) ? p : null;
}

export function readMathSave(store: Store<MathSave>): MathSave {
  const raw = store.load() as unknown;
  const src = isObject(raw) ? raw : {};
  const out = defaults();
  const validId = (id: string) => STAGES.some((s) => s.id === id);
  if (isObject(src.best)) for (const [id, score] of Object.entries(src.best)) if (validId(id) && int(score, 0, QUESTIONS_PER_STAGE)) out.best[id] = score;
  if (isObject(src.plays)) for (const [id, count] of Object.entries(src.plays)) if (validId(id) && int(count, 0, 1_000_000)) out.plays[id] = count;
  if (isObject(src.lastSec)) for (const [id, sec] of Object.entries(src.lastSec)) if (validId(id) && int(sec, 0, 36000)) out.lastSec[id] = sec;
  if (isObject(src.placed)) for (const [op, tier] of Object.entries(src.placed)) if ((op === 'add' || op === 'sub' || op === 'mul' || op === 'div') && int(tier, 1, 10)) out.placed[op] = tier;
  if (isObject(src.fast)) for (const [op, rec] of Object.entries(src.fast)) {
    if (!(OPS as string[]).includes(op) || !isObject(rec) || !int(rec.best, 1, 36000)) continue;
    out.fast[op as TrackOp] = { best: rec.best, ...(int(rec.last, 1, 36000) ? { last: rec.last } : {}), ...(int(rec.runs, 1, 1_000_000) ? { runs: rec.runs } : {}) };
  }
  const r = isObject(src.run) ? src.run : null;
  const stage = r && typeof r.stageId === 'string' ? stageById(r.stageId) : undefined;
  if (r && stage) {
    const reviews: Review[] = [];
    if (Array.isArray(r.reviews)) for (const item of r.reviews) {
      const problem = isObject(item) ? normalizeProblem(item.problem) : null;
      if (isObject(item) && problem && int(item.due, 1, QUESTIONS_PER_STAGE) && inStage(stage, problem)) reviews.push({ due: item.due as number, problem });
    }
    const keep = reviews.slice(0, QUESTIONS_PER_STAGE);
    // a run can only be on a stage that is open (a hand-edited save must not skip the locks)
    if (stageOpen(out, stage) && int(r.round, 1, 1_000_000) && int(r.index, 0, QUESTIONS_PER_STAGE) && int(r.correct, 0, QUESTIONS_PER_STAGE) && r.correct <= r.index && (r.index < QUESTIONS_PER_STAGE || keep.length > 0)) {
      out.run = {
        stageId: stage.id, round: r.round, index: r.index, correct: r.correct, retrying: r.retrying === true,
        attempts: int(r.attempts, 0, 3) ? r.attempts : 0, reviews: keep, reviewed: int(r.reviewed, 0, QUESTIONS_PER_STAGE) ? r.reviewed : 0,
        warm: int(r.warm, 0, WARMUP_QUESTIONS) ? r.warm : 0, warmDone: int(r.warmDone, 0, WARMUP_QUESTIONS) ? r.warmDone : 0,
        sec: int(r.sec, 0, 36000) ? r.sec : 0,
      };
    }
  }
  return out;
}

// ---------------------------------------------------------------- stage state
export type StageStatus = 'locked' | 'open' | 'passed' | 'placed';

export function stageOpen(save: MathSave, stage: Stage): boolean {
  if (stage.tier === 1) return true;
  if (stage.op !== 'mix' && stage.tier <= (save.placed[stage.op] ?? 1)) return true;
  return (save.best[`${stage.op}-${stage.tier - 1}`] ?? 0) >= PASS_SCORE;
}
export function stageStatus(save: MathSave, stage: Stage): StageStatus {
  if ((save.best[stage.id] ?? 0) >= PASS_SCORE) return 'passed';
  if (stage.op !== 'mix' && stage.tier < (save.placed[stage.op] ?? 1)) return 'placed';
  return stageOpen(save, stage) ? 'open' : 'locked';
}
export const stageDone = (save: MathSave, stage: Stage): boolean => { const s = stageStatus(save, stage); return s === 'passed' || s === 'placed'; };
export const doneCount = (save: MathSave): number => STAGES.filter((stage) => stageDone(save, stage)).length;
/** 超频 opens once tier 3 of a line is passed (by playing or by 测起点). */
export function sprintOpen(save: MathSave, op: TrackOp): boolean {
  const third = stageById(`${op}-3`);
  return !!third && op !== 'mix' && stageDone(save, third);
}
export const passedTiers = (save: MathSave, op: TrackOp): number[] => STAGES.filter((s) => s.op === op && stageDone(save, s)).map((s) => s.tier);

export const highestOpen = (save: MathSave, op: TrackOp): number => Math.max(1, ...STAGES.filter((s) => s.op === op && stageOpen(save, s)).map((s) => s.tier));

/** 测起点 only ever raises what is open. Returns whether the line now opens further than before. */
export function applyPlacement(save: MathSave, op: Operation, start: number): boolean {
  if (start <= highestOpen(save, op)) return false;
  save.placed[op] = Math.max(save.placed[op] ?? 1, start);
  return true;
}

// ---------------------------------------------------------------- a run
export function startRun(save: MathSave, stage: Stage): MathRun {
  if (!stageOpen(save, stage)) throw new Error(`stage locked: ${stage.id}`);
  const round = (save.plays[stage.id] ?? 0) + 1;
  save.plays[stage.id] = round;
  const needsWarmup = (save.best[stage.id] ?? 0) < PASS_SCORE && questionsFor(stage, round).some((p) => splittable(stage, p));
  save.run = { stageId: stage.id, round, index: 0, correct: 0, retrying: false, attempts: 0, reviews: [], reviewed: 0, warm: needsWarmup ? WARMUP_QUESTIONS : 0, warmDone: 0, sec: 0 };
  return save.run;
}

export function dueReview(run: MathRun): Review | null {
  return run.reviews[0]?.due <= run.index && run.warm === 0 ? run.reviews[0] : null;
}

export interface Current { problem: Problem; stage: Stage; kind: 'warm' | 'review' | 'scored' }
export function currentOf(save: MathSave): Current | null {
  const run = save.run;
  const stage = run && stageById(run.stageId);
  if (!run || !stage) return null;
  if (run.warm > 0) return { problem: warmupFor(stage, run.round, run.warmDone, (p) => splittable(stage, p)), stage, kind: 'warm' };
  const review = dueReview(run);
  if (review) return { problem: review.problem, stage, kind: 'review' };
  return { problem: questionsFor(stage, run.round)[run.index], stage, kind: 'scored' };
}

export interface RecordResult { finished: boolean; score: number; stageId: string; sec: number; before: { best: number | undefined; lastSec: number | undefined } }
/** Record the end of a question. `seconds` is the active time spent on it. */
export function recordAnswer(save: MathSave, right: boolean, seconds = 0): RecordResult {
  const run = save.run;
  if (!run) throw new Error('no active run');
  run.sec = Math.min(36000, run.sec + Math.max(0, Math.round(seconds)));
  if (run.warm > 0) { run.warm -= 1; run.warmDone += 1; }
  else if (dueReview(run)) { run.reviews.shift(); run.reviewed++; }
  else { if (right) run.correct += 1; run.index += 1; }
  run.retrying = false;
  run.attempts = 0;
  const before = { best: save.best[run.stageId], lastSec: save.lastSec[run.stageId] };
  if (run.warm === 0 && run.index === QUESTIONS_PER_STAGE && run.reviews.length === 0) {
    save.best[run.stageId] = Math.max(save.best[run.stageId] ?? 0, run.correct);
    save.lastSec[run.stageId] = Math.max(1, run.sec);
    save.run = null;
    return { finished: true, score: run.correct, stageId: run.stageId, sec: run.sec, before };
  }
  return { finished: false, score: run.correct, stageId: run.stageId, sec: run.sec, before };
}
