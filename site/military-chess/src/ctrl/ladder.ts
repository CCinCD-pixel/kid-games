/**
 * Ladder matches (spec §4.4): a SavedMatch for "the child vs robot N" in a mode. The robot's layout is
 * procedural (core/layout aiLayout, seeded `mc:deploy:<matchId>:1`) and decided before the child
 * deploys; the child always plays RED (near seat). The first mover alternates game by game.
 */
import { createRng } from '@kit/rng';
import { BLUE, RED } from '../core/board';
import { LAYOUT_STYLES, aiLayout, applyHandicap } from '../core/layout';
import type { Mode } from '../core/state';
import { LEVELS, type Level } from '../ai/levels';
import { newMatchId, type SaveV1, type SavedMatch } from './save';

/**
 * Ladder rules on top of the standard ones (§9.4 calibration, pre-approved step ③): 翻翻棋 against
 * the first two robots counts the forces after 30 quiet moves instead of 40, so a game stays
 * around eight minutes for a six-year-old. Shared with the calibration harness.
 */
export function ladderRuleOverrides(mode: Mode, level: number): { quietLimit?: number } {
  return mode === 'fan' && level <= 2 ? { quietLimit: 30 } : {};
}

/** handicap offers (§4.4): 1 = robot without its 军长; 2 = without 军长 and one 师长 */
export const HANDICAP_CODES: Record<1 | 2, string> = { 1: '8', 2: '87' };

export function gamesPlayed(save: SaveV1, mode: Mode): number {
  const t = save.ladder[mode];
  let n = 0;
  for (let i = 0; i < 4; i++) n += t.wins[i] + t.losses[i] + t.draws[i];
  return n;
}

export function newLadderMatch(save: SaveV1, mode: Mode, level: Level, o: { handicap?: 0 | 1 | 2; free?: boolean } = {}): SavedMatch {
  const id = newMatchId();
  const kidFirst = gamesPlayed(save, mode) % 2 === 0;
  const hc = o.handicap ? HANDICAP_CODES[o.handicap] : '';
  const base: SavedMatch = {
    v: 1,
    id,
    mode,
    setup: { firstMover: kidFirst ? RED : BLUE },
    actions: [],
    opponent: { kind: 'ai', level },
    kidSide: RED,
    kidSeat: 'near',
    tags: {},
    hints: 0,
    coachWarnings: 0,
    coachOverrides: 0,
    undos: 0,
    startedAt: Date.now(),
    ladder: true,
  };
  if (o.free) base.free = true;
  const q = ladderRuleOverrides(mode, level).quietLimit;
  // 家规 (§8.7, §9.8 item 3): the parent's 翻翻棋扛旗 rule applies to ladder 翻翻棋 too; stored in the
  // match so a resume / replay keeps the rule it started with
  const fanFlagLock = !(mode === 'fan' && save.settings.fanFlagRule === 'easy');
  if (q || !fanFlagLock) base.house = { fanFlagLock, ...(q ? { quietLimit: q } : {}), shuttleMax: 4 };
  if (mode === 'fan') {
    base.setup = { fanSeed: `mc:fan:${id}`, firstMover: RED, firstPlayer: kidFirst ? 0 : 1 };
    return base;
  }
  const style = LAYOUT_STYLES[LEVELS[mode][level].layout];
  let blue = aiLayout(style, createRng(`mc:deploy:${id}:1`).next);
  if (hc) blue = applyHandicap(blue, hc);
  base.setup = { ...base.setup, blue, handicap: hc ? { red: '', blue: hc } : undefined };
  return base;
}
