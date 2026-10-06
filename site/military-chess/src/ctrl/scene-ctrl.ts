/**
 * 翻翻棋入门 scenes (spec §8.3 scene controller, §4.1 `scene`): a real 翻翻棋 position and a script.
 * `kid` steps accept only the scripted action, `ai` steps are played after a pause, `ref` steps only
 * speak. Every step goes through the real `rules.apply`; the content test replays the same scripts.
 */
import { BLUE, RED, parseSq } from '../core/board';
import { isFlip, legalMoves, type Action } from '../core/movegen';
import { parseNote } from '../core/notation';
import { typeFromCode } from '../core/pieces';
import { addPiece, newState, type GameState } from '../core/state';
import type { SceneItem, SceneStep } from '../content';

export function sceneStart(it: SceneItem): GameState {
  const s = newState('fan', { quietLimit: 1000, plyCap: 1000 });
  const side = (ch: string) => (ch === 'R' ? RED : BLUE);
  for (const [k, v] of Object.entries(it.setup.up || {})) addPiece(s, side(v[0]), typeFromCode(v[1]), parseSq(k), true);
  for (const [k, v] of Object.entries(it.setup.down || {})) addPiece(s, side(v[0]), typeFromCode(v[1]), parseSq(k), false);
  s.colorOf = it.setup.kid ? [RED, BLUE] : [-1, -1];
  s.toAct = 0;
  s.turn = it.setup.kid ? RED : -1;
  return s;
}

/** the legal action of a script step ('flip c6' / 'c6xc7'), or null */
export function sceneAction(s: GameState, act: string): Action | null {
  if (act.startsWith('flip ')) {
    const at = parseSq(act.slice(5));
    return legalMoves(s).find((a) => isFlip(a) && a.flip === at) ?? null;
  }
  if (act.startsWith('select ')) return null;
  return parseNote(s, act);
}

/** stations the child may touch in a kid step (the gold rings) */
export function sceneTargets(step: SceneStep): { from: number; to: number } | null {
  if (!step.act) return null;
  if (step.act.startsWith('flip ')) {
    const at = parseSq(step.act.slice(5));
    return { from: at, to: at };
  }
  if (step.act.startsWith('select ')) {
    const at = parseSq(step.act.slice(7));
    return { from: at, to: step.reject ? parseSq(step.reject) : at };
  }
  const m = /^([a-e]\d{1,2})[-x]([a-e]\d{1,2})$/.exec(step.act);
  if (!m) return null;
  return { from: parseSq(m[1]), to: parseSq(m[2]) };
}
