// Parent page metrics (spec §5.9; ≤ 3, written to the kit log through session.mark — numbers only, the parent page
// words them): ① 锦囊 mastered (no hint / assist / 怎么办 in that game), ② first-try holds per volume,
// ③ "worked it out alone" — 铜盾甲兵 answered within 15 s unaided, and drills solved at par.
import { CAMPAIGN, LEVELS } from './content';
import { masterySignals, counteredFast } from './lane/mastery';
import { TPS } from './lane/rules';
import type { SimState } from './lane/types';
import type { SaveV1 } from './save';

export interface ParentMetrics { jn: number; jnIds: string[]; ft: string[]; infer: boolean; pzPar: string }
export function parentMetrics(s: SaveV1): ParentMetrics {
  const jnIds = Object.entries(s.jinnang).filter(([, v]) => v.mastered).map(([k]) => k);
  const ft = CAMPAIGN.volumes.map((v) => `${v.levels.filter((id) => s.levels[id]?.firstTry === 'win').length}/${v.levels.length}`);
  return { jn: jnIds.length, jnIds, ft, infer: s.infer.solvedUnaided, pzPar: `${Object.values(s.puzzles).filter((p) => p.stars === 3).length}/12` };
}
/** fold one finished game into the save: jinnang mastery (§4.9) and the 举一反三 check (§5.9 ③) */
export function noteGame(s: SaveV1, levelId: string, S: SimState, o: { assist: number; asked: number; hints: number[] }): string[] {
  const fresh: string[] = [];
  const clean = !o.assist && !o.asked && !o.hints.length;
  // 知己知彼 (preview) is only evidence when the child picked the deck (fixed-deck levels hand it over)
  for (const id of masterySignals(S).filter((j) => j !== 'preview' || !LEVELS[levelId]?.loadout)) {
    const j = (s.jinnang[id] ||= { seen: true, mastered: null }); j.seen = true;
    if (clean && !j.mastered && (id !== 'infer' || levelId.startsWith('2-'))) { j.mastered = levelId; fresh.push(id); }
  }
  const seenAt = (S.ev || []).find((e) => e.type === 'spawn' && e.k === 'shielder_m');
  if (seenAt) {
    if (!s.infer.firstSeenAt) s.infer.firstSeenAt = levelId;
    const c = counteredFast(S, 'shielder_m', 15 * TPS);
    if (c.ok && !o.assist && !o.hints.some((t) => t >= seenAt.tick && t <= c.tick)) s.infer.solvedUnaided = true;
  }
  return fresh;
}
