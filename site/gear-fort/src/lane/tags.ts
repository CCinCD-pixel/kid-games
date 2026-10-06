// 机关守城 · the tag grammar's single implementation (spec §3.4, §4.4): 怕什么 (FEARS), the loadout "must" table,
// reach rules, and the bots' mental damage model. Used by the coach, the fail-cause analyser, 鲁班亮招 arrows,
// the almanac and the bots. Source: proto/coach.mjs (FEARS, reaches, litByBeam) and proto/bots/common.mjs (MUST, dpsVs, counterFor).
import { T } from './rules';
import { ENEMIES } from './tables';
import { isNight } from './sim';
import type { Enemy, SimState } from './types';

export const ATTACK = ['shooter', 'lobber', 'burner', 'beam', 'radial'];

/** 怕什么 (the almanac's counter line; same table drives 鲁班亮招 arrows and the fail-cause analyser) */
export const FEARS: Record<string, string[]> = {
  walker: ['shooter', 'lobber', 'burner', 'beam'], shielder: ['lobber', 'burner', 'beam'], ram: ['spikes'], ant: ['burner'],
  brute: ['beam', 'lobber'], flyer: ['radial', 'gust'], smoker: ['gust', 'lobber'], ladder: ['hook'], drummer: ['strike', 'lobber'],
  boat: ['hook', 'lobber'], carrier: ['lobber', 'beam'], tunneler: ['listener'], tower: ['lobber', 'beam'],
  shielder_m: ['lobber', 'burner', 'beam'], flyer_m: ['radial', 'gust'],
};

/** MUST[k] = alternatives of which a loadout needs at least one */
export const MUST: Record<string, string[]> = {
  walker: ['shooter', 'lobber', 'beam', 'burner'], shielder: ['lobber', 'burner'], ram: ['spikes'], ant: ['burner'],
  brute: ['lobber', 'beam'], flyer: ['radial', 'gust'], smoker: ['gust', 'lobber'], ladder: ['hook'], drummer: ['strike', 'lobber'],
  boat: ['hook', 'lobber'], carrier: ['lobber', 'beam'], tunneler: ['listener'], tower: ['lobber', 'beam'],
  shielder_m: ['lobber', 'burner', 'beam'], flyer_m: ['radial', 'gust'],
  rhino: ['lobber', 'beam'], owl: ['radial'], shiparm: ['hook'], shipdock: ['lobber'], shipdrum: ['lobber'], shiphull: ['lobber'],
};

/** can this card's attack reach that machine right now? */
export function reaches(S: SimState, card: string, e: Enemy): boolean {
  if (e.layer === 'under' || e.untargetable) return false;
  const air = e.layer === 'air' && !(e.downUntil > S.tick);
  switch (card) {
    case 'shooter': return !air && !e.highOnly;
    case 'lobber': return !air && !e.highOnly;
    case 'burner': return !air && !e.highOnly && e.mat !== 'metal';
    case 'beam': return !isNight(S) && !e.highOnly;
    case 'radial': return true;
    default: return false;
  }
}

/** fog: a working 阳燧 lights its own lane 5 tiles ahead */
export const litByBeam = (S: SimState, e: Enemy): boolean => !isNight(S) && S.units.some((u) => !u.dead && u.k === 'beam' && u.lane === e.lane && e.x <= u.col * T + 5000 + 5 * T);

/** damage per second of one card against one enemy kind (the bots' mental model of the tag grammar; floats) */
export function dpsVs(card: string, k: string, S?: SimState | null, e?: Enemy | null): number {
  const D = ENEMIES[k] || { mat: 'metal', wt: 'heavy', layer: 'ground', hp: 1000, armor: 6 };
  const armor = D.armor || 0, metal = D.mat === 'metal', air = D.layer === 'air', under = D.layer === 'under';
  const shield = (e ? e.sh > 0 : !!D.shield) ? 1 : 0;
  const night = S ? isNight(S) : false;
  if (under && !(e && e.layer === 'ground')) return 0;
  switch (card) {
    case 'shooter': if (air) return 0; return (Math.max(1, 18 - armor) / 1.3) * (shield ? 0.0 : 1);
    case 'lobber': if (air) return 0; return Math.max(1, 50 - armor) / 2.6;
    case 'burner': if (air || metal) return 0; return ((36 + 24) / 3.4) * (k === 'ant' ? 4 : 1) + (shield ? 10 : 0);
    case 'beam': if (night) return 0; return shield ? 8 : 35;
    case 'radial': return Math.max(1, 16 - armor) / 1.2;
    default: return 0;
  }
}

/** cards that answer an enemy kind (best first) */
export function counterFor(k: string, S?: SimState | null): string[] {
  const night = !!(S && S.L && S.L.env?.night && !(S.dawnAt != null && S.tick >= S.dawnAt));
  const out = (MUST[k] || ['shooter']).filter((c) => !(c === 'beam' && night));
  const extra = ({ ram: ['wall', 'lobber'], ant: ['gust', 'strike'], flyer: ['gust', 'beam'], ladder: ['burner', 'lobber'], smoker: ['lobber'], tunneler: ['radial'], drummer: ['radial'], flyer_m: ['strike'] } as Record<string, string[]>)[k] || [];
  return [...new Set([...out, ...extra.filter((c) => !(c === 'beam' && night))])];
}
