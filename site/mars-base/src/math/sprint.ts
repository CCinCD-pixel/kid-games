/** 超频 — ten questions drawn from the stages already passed on a line; no time limit, personal best only. */
import { SPRINT_QUESTIONS } from './constants';
import { problemKey, sampleFor, seededRandom, stageById, type Problem, type Stage, type TrackOp } from './problems';
import { passedTiers, type MathSave } from './save';

export interface SprintItem { stage: Stage; problem: Problem }

export function sprintQuestions(save: MathSave, op: TrackOp, seed: string): SprintItem[] {
  const tiers = passedTiers(save, op);
  if (!tiers.length) return [];
  const rng = seededRandom(seed);
  const weights = tiers.map((t) => t);               // harder (higher) passed stages come up more often
  const total = weights.reduce((a, b) => a + b, 0);
  const out: SprintItem[] = [];
  const seen = new Set<string>();
  for (let tries = 0; out.length < SPRINT_QUESTIONS && tries < 500; tries++) {
    let r = rng() * total, k = 0;
    while (k < tiers.length - 1 && r >= weights[k]) { r -= weights[k]; k++; }
    const stage = stageById(`${op}-${tiers[k]}`)!;
    const problem = sampleFor(stage, `${seed}:${tries}`, tries);
    const key = problemKey(problem);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ stage, problem });
  }
  return out;
}
