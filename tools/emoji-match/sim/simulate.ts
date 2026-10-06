/**
 * Headless level simulation on the REAL game logic (site/emoji-match/src/core — the same modules the
 * page runs): every bot plays full games through `playOut` (applyMove / settle / refill / shuffle
 * exactly as in play), and the teaching move of lesson levels is checked on the fixed start board.
 * Same seeds as the prototype tune.mjs, so the numbers reproduce the evidence in levels.json.
 */
import { lessonMet, stepToOp } from '../../../site/emoji-match/src/core/expect';
import { newGame, parseLevel, playOut } from '../../../site/emoji-match/src/core';
import type { BotName } from '../../../site/emoji-match/src/core/bots';
import type { LevelData } from '../../../site/emoji-match/src/content';
import { BOTS, HELD_OUT, HELD_OUT_BASE, PLAYOUT_CAP, SEED_BASE, type LessonCheck, type Needs } from './difficulty';

export interface SimOptions {
  /** multiplies every bot's game count (min 20 per bot) */
  scale?: number;
  /** override the bot table, e.g. { K: 60 } for the fast tier */
  bots?: Partial<Record<string, number>>;
  /** include the held-out K run (seeds 5000+) */
  heldOut?: boolean;
}
export interface SimResult { id: string; need: Needs; lesson: LessonCheck | null; W: number; H: number; ms: Record<string, number> }

export function simulateLevel(def: LevelData, o: SimOptions = {}): SimResult {
  const scale = o.scale ?? 1;
  const L = parseLevel(def);
  const need: Needs = {};
  const ms: Record<string, number> = {};
  const table: Record<string, number> = o.bots ? { ...o.bots } as Record<string, number> : { ...BOTS, ...(def.feature ? { [`K:${def.feature}`]: 400 } : {}) };
  for (const [bot, n0] of Object.entries(table)) {
    const n = o.bots ? n0 : Math.max(20, Math.round(n0 * scale));
    const t0 = performance.now();
    const arr: number[] = [];
    for (let s = 0; s < n; s += 1) arr.push(playOut(L, SEED_BASE + s, bot as BotName, PLAYOUT_CAP).needed);
    need[bot] = arr;
    ms[bot] = performance.now() - t0;
  }
  if (o.heldOut ?? !o.bots) {
    const t0 = performance.now();
    const arr: number[] = [];
    for (let s = 0; s < Math.max(20, Math.round(HELD_OUT * scale)); s += 1) arr.push(playOut(L, HELD_OUT_BASE + s, 'K', PLAYOUT_CAP).needed);
    need.Kho = arr;
    ms.Kho = performance.now() - t0;
  }
  let lesson: LessonCheck | null = null;
  if (def.lesson) {
    const st = newGame(L, 1);
    const ls = def.lesson;
    const mv = stepToOp(st, 'tap' in ls ? { tap: ls.tap } : { from: ls.from, to: ls.to }).move!;
    lesson = lessonMet(ls.expect, st, mv);
  }
  return { id: def.id, need, lesson, W: L.W, H: L.H, ms };
}
