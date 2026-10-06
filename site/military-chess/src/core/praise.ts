/**
 * Process praise (spec §7.3 mc.ok.1–8) matched to what the child actually did (QA r1: lines were picked
 * blindly by id length, so a capture puzzle heard the deploy line "摆好了，规矩都对").
 *
 *   ok.1 这步想得很周全      neutral fallback (order / compare cards, plain board items)
 *   ok.2 你先看了铁路，再出发  a winning line used the railway (a move of more than one step)
 *   ok.3 用对了子！          capture / flag goals: the right piece did the job
 *   ok.4 一步都没浪费        a multi-move board solved in exactly par
 *   ok.5 你守住了军旗        flag defence (survive-flag goals, lesson L6)
 *   ok.6 你从结果里猜出来了   infer cards
 *   ok.7 摆好了，规矩都对     deploy items only
 *   ok.8 换了个办法，成了     only after a failure, undo, reset or a twin
 */
import type { GoalKind } from './puzzle';

export type PraiseCtx =
  | { kind: 'board'; goal: GoalKind; guard?: string; lesson?: string | null; moves: number; par: number; rail: boolean; retried: boolean }
  | { kind: 'scene'; retried: boolean }
  | { kind: 'order' | 'compare' | 'infer'; retried: boolean }
  | { kind: 'deploy'; retried: boolean };

export function praiseLine(c: PraiseCtx): string {
  if (c.kind === 'deploy') return 'mc.ok.7';
  if (c.retried) return 'mc.ok.8';
  if (c.kind === 'infer') return 'mc.ok.6';
  if (c.kind !== 'board') return 'mc.ok.1';
  if ((c.goal === 'survive' && c.guard === 'flag') || c.lesson === 'L6') return 'mc.ok.5';
  if (c.rail) return 'mc.ok.2';
  if (c.par >= 2 && c.moves <= c.par) return 'mc.ok.4';
  if (c.goal === 'capture' || c.goal === 'flag') return 'mc.ok.3';
  return 'mc.ok.1';
}

/** the lines each kind may ever hear (unit-tested against every shipped item) */
export const PRAISE_ALLOWED: Record<PraiseCtx['kind'], readonly string[]> = {
  board: ['mc.ok.1', 'mc.ok.2', 'mc.ok.3', 'mc.ok.4', 'mc.ok.5', 'mc.ok.8'],
  scene: ['mc.ok.1', 'mc.ok.8'],
  order: ['mc.ok.1', 'mc.ok.8'],
  compare: ['mc.ok.1', 'mc.ok.8'],
  infer: ['mc.ok.6', 'mc.ok.8'],
  deploy: ['mc.ok.7'],
};
