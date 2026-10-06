/** Saved match → starting position (and back), shared by the match screen, resume and tests. */
import { createRng } from '@kit/rng';
import { BLUE, RED, type Side } from '../core/board';
import { newKnowledge, observe, countsWithout, type Knowledge } from '../core/belief';
import { parseNote } from '../core/notation';
import { apply } from '../core/rules';
import { setupFan, setupStandard, type GameState, type RuleSet } from '../core/state';
import { restoreMatch, type Controller, type MatchCtx } from './match';
import type { SavedMatch } from './save';

/** the rules of a saved match: standard, plus the family's 家规 when it is a family game (§9.8) */
export function ruleSetFor(m: SavedMatch, opts: { fanFlagLock?: boolean } = {}): Partial<RuleSet> {
  const h = m.house;
  return {
    endByCount: m.ladder,
    fanFlagLock: h ? h.fanFlagLock : opts.fanFlagLock ?? true,
    ...(h?.quietLimit ? { quietLimit: h.quietLimit } : {}),
    ...(typeof h?.shuttleMax === 'number' ? { shuttleMax: h.shuttleMax } : {}),
  };
}

export function startState(m: SavedMatch, opts: { fanFlagLock?: boolean } = {}): GameState {
  const rules = ruleSetFor(m, opts);
  if (m.mode === 'fan') return setupFan(createRng(m.setup.fanSeed ?? `mc:fan:${m.id}`).next, rules, m.setup.firstPlayer ?? 0);
  return setupStandard(m.mode, { red: m.setup.red!, blue: m.setup.blue!, handicap: m.setup.handicap, firstMover: m.setup.firstMover, rules });
}

export function controllersFor(m: SavedMatch): [Controller, Controller] {
  return m.opponent.kind === 'family' ? ['human', 'human'] : ['human', 'ai'];
}

export function matchFromSave(m: SavedMatch, opts: { fanFlagLock?: boolean; coach?: MatchCtx['coach'] } = {}): MatchCtx {
  return restoreMatch(m.id, startState(m, opts), controllersFor(m), m.actions, parseNote, opts.coach ?? null);
}

/** 暗棋: both sides' knowledge, rebuilt by replaying the public events of the game so far */
export function knowledgeFor(start: GameState, notes: readonly string[]): [Knowledge, Knowledge] {
  const k: [Knowledge, Knowledge] = [newKnowledge(start, RED), newKnowledge(start, BLUE)];
  let s = start;
  for (const n of notes) {
    const a = parseNote(s, n);
    if (!a) break;
    const { state, event } = apply(s, a);
    observe(k[0], s, event);
    observe(k[1], s, event);
    s = state;
  }
  return k;
}

/** the per-type totals of a side (a handicap removes pieces before the game) */
export function countsOf(m: SavedMatch, side: Side): number[] {
  const h = m.setup.handicap ? (side === RED ? m.setup.handicap.red : m.setup.handicap.blue) : '';
  return countsWithout(h);
}
