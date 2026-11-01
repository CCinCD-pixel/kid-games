import { createStore, type Store } from '@kit/progress';
import { PASS_SCORE, QUESTIONS_PER_STAGE, STAGES, type Problem, type Stage } from './problems';

export interface Review { due: number; problem: Problem }
export interface MathRun { stageId: string; round: number; index: number; correct: number; retrying: boolean; attempts: number; reviews: Review[]; reviewed: number }
export interface MathSave { best: Record<string, number>; plays: Record<string, number>; run: MathRun | null }
export const defaults = (): MathSave => ({ best: {}, plays: {}, run: null });
export const MATH_SAVE_KEY = 'kg:v1:mars-arithmetic';

export function openMathStore(storage?: Storage): Store<MathSave> {
  return createStore<MathSave>('mars-arithmetic', { version: 1, defaults, ...(storage ? { storage } : {}) });
}

export function readMathSave(store: Store<MathSave>): MathSave {
  const raw = store.load();
  const best: Record<string, number> = {}, plays: Record<string, number> = {};
  const validId = (id: string) => STAGES.some((s) => s.id === id);
  for (const [id, score] of Object.entries(raw?.best ?? {})) if (validId(id) && Number.isInteger(score) && score >= 0 && score <= QUESTIONS_PER_STAGE) best[id] = score;
  for (const [id, count] of Object.entries(raw?.plays ?? {})) if (validId(id) && Number.isInteger(count) && count >= 0) plays[id] = count;
  const r = raw?.run;
  const stage = STAGES.find((s) => s.id === r?.stageId);
  const reviews = Array.isArray(r?.reviews) ? r.reviews.filter((item): item is Review => {
    const p = item?.problem;
    return Number.isInteger(item?.due) && item.due >= 1 && item.due <= QUESTIONS_PER_STAGE && p?.op === stage?.op &&
      Number.isInteger(p.a) && p.a > 0 && Number.isInteger(p.b) && p.b > 0 && Number.isInteger(p.answer) && p.answer >= 0 &&
      (p.op === 'add' ? p.a + p.b : p.op === 'sub' ? p.a - p.b : p.op === 'mul' ? p.a * p.b : p.a / p.b) === p.answer;
  }).slice(0, QUESTIONS_PER_STAGE) : [];
  const run = r && stage && Number.isInteger(r.round) && r.round > 0 && Number.isInteger(r.index) && r.index >= 0 && r.index <= QUESTIONS_PER_STAGE && Number.isInteger(r.correct) && r.correct >= 0 && r.correct <= r.index && (r.index < QUESTIONS_PER_STAGE || reviews.length > 0)
    ? { stageId: r.stageId, round: r.round, index: r.index, correct: r.correct, retrying: r.retrying === true, attempts: Number.isInteger(r.attempts) ? Math.max(0, Math.min(3, r.attempts)) : 0, reviews, reviewed: Number.isInteger(r.reviewed) ? Math.max(0, Math.min(QUESTIONS_PER_STAGE, r.reviewed)) : 0 } : null;
  return { best, plays, run };
}

export function stageOpen(save: MathSave, stage: Stage): boolean {
  if (stage.tier === 1) return true;
  return (save.best[`${stage.op}-${stage.tier - 1}`] ?? 0) >= PASS_SCORE;
}

export function startRun(save: MathSave, stage: Stage): MathRun {
  if (!stageOpen(save, stage)) throw new Error(`stage locked: ${stage.id}`);
  const round = (save.plays[stage.id] ?? 0) + 1;
  save.plays[stage.id] = round;
  save.run = { stageId: stage.id, round, index: 0, correct: 0, retrying: false, attempts: 0, reviews: [], reviewed: 0 };
  return save.run;
}

export function dueReview(run: MathRun): Review | null {
  return run.reviews[0]?.due <= run.index ? run.reviews[0] : null;
}

export function recordAnswer(save: MathSave, right: boolean): { finished: boolean; score: number; stageId: string } {
  const run = save.run;
  if (!run) throw new Error('no active run');
  if (dueReview(run)) { run.reviews.shift(); run.reviewed++; }
  else { if (right) run.correct += 1; run.index += 1; }
  run.retrying = false;
  run.attempts = 0;
  if (run.index === QUESTIONS_PER_STAGE && run.reviews.length === 0) {
    save.best[run.stageId] = Math.max(save.best[run.stageId] ?? 0, run.correct);
    save.run = null;
    return { finished: true, score: run.correct, stageId: run.stageId };
  }
  return { finished: false, score: run.correct, stageId: run.stageId };
}
