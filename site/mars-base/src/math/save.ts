import { createStore, type Store } from '@kit/progress';
import { PASS_SCORE, QUESTIONS_PER_STAGE, STAGES, type Stage } from './problems';

export interface MathRun { stageId: string; round: number; index: number; correct: number }
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
  const run = r && validId(r.stageId) && Number.isInteger(r.round) && r.round > 0 && Number.isInteger(r.index) && r.index >= 0 && r.index < QUESTIONS_PER_STAGE && Number.isInteger(r.correct) && r.correct >= 0 && r.correct <= r.index ? r : null;
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
  save.run = { stageId: stage.id, round, index: 0, correct: 0 };
  return save.run;
}

export function recordAnswer(save: MathSave, right: boolean): { finished: boolean; score: number; stageId: string } {
  const run = save.run;
  if (!run) throw new Error('no active run');
  if (right) run.correct += 1;
  run.index += 1;
  if (run.index === QUESTIONS_PER_STAGE) {
    save.best[run.stageId] = Math.max(save.best[run.stageId] ?? 0, run.correct);
    save.run = null;
    return { finished: true, score: run.correct, stageId: run.stageId };
  }
  return { finished: false, score: run.correct, stageId: run.stageId };
}
