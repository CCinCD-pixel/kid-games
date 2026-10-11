import type { Level, SimOptions } from './types';

/** The live campaign's pace; authored replays and static drills retain their original rules. */
export function campaignBalance(level: Level): Pick<SimOptions, 'incomePct' | 'cooldownPct' | 'beltPeriodPct'> {
  if (level.id === '1-1' || level.puzzle) return {};
  if (level.belt) return { beltPeriodPct: 85 };
  if (level.id === '1-11') return { incomePct: 125, cooldownPct: 75 };
  if (level.id === '2-3') return { incomePct: 115, cooldownPct: 85 };
  return { incomePct: 110, cooldownPct: 90 };
}
