import type { Level, SimOptions } from './types';
import { BOSS_CFG } from './tables';

const rhinoCfg = {
  ...BOSS_CFG.rhino,
  hp: 1200, p2At: 700, crackMax: 50, shellClose: 200,
  hatchN: 2, hatchEvery: 300, chargeEvery: 420, tele: 70,
  dashDist: 15000, dashWallDmg: 800, hornDmg: [0, 200, 160, 260],
};

export function supportAfter(level: Level): number {
  return ['1-11', '2-3', '2-7', '2-11'].includes(level.id) ? 1 : 2;
}

/** The live campaign's pace; authored replays and static drills retain their original rules. */
export function campaignBalance(level: Level): SimOptions {
  if (level.id === '1-1' || level.puzzle) return {};
  if (level.belt) return { beltPeriodPct: level.id === '2-7' ? 80 : 85, ramHpPct: 88, ramImpactPct: 87 };
  if (level.id === '1-11') return { incomePct: 125, cooldownPct: 75, rhinoCfg };
  if (level.id === '2-3') return { incomePct: 115, cooldownPct: 85, ramHpPct: 88, ramImpactPct: 87 };
  return { incomePct: 110, cooldownPct: 90, ramHpPct: 88, ramImpactPct: 87 };
}
