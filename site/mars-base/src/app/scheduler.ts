/**
 * Which zone / node comes next and what the 3 warm-up slots hold (spec §3.7). Zones are never locked: this only decides the glow.
 * Pure over the save. `BUILT_ZONES` lets later rounds switch 称重台 / 谜题舱 on without touching the rules.
 */
import type { CardId, NodeDef, ZoneId } from './types';
import { MarsSaveV5 } from '../save/schema';
import { CARDS, MAIN_ORDER, NODE_BY_ID, REMEDIAL_ORDER } from './content';
import { dueTags } from './adaptive';
import { certForMission, provisionalDue } from './cert';
import { BUILT_ZONES, PUZZLE_AFTER_MISSIONS, RECOMMEND, WARM_SLOTS } from './tuning';
import { META, TAG_PREREQ, isBuilt } from '../families';

export const ZONE_ORDER: ZoneId[] = ['orbit', 'cert', 'vault', 'factory', 'balance', 'puzzle'];
const AHEAD: ZoneId[] = ['vault', 'factory', 'balance', 'puzzle'];
export const isZoneBuilt = (z: ZoneId): boolean => (BUILT_ZONES as readonly string[]).includes(z);
const st = (save: MarsSaveV5, id: string) => save.nodes[id]?.st ?? 'open';

/** The next playable node of a zone (cert = the first half-lit card's remedial chapter), or null. */
export function nextNodeFor(save: MarsSaveV5, zone: ZoneId): NodeDef | null {
  if (!isZoneBuilt(zone)) return null;
  if (zone === 'cert') {
    for (const c of CARDS) {
      if (save.cert[c].state !== 'half') continue;
      const id = REMEDIAL_ORDER[c].find((x) => st(save, x) === 'open');
      if (id) return NODE_BY_ID[id];
    }
    return null;
  }
  const id = MAIN_ORDER[zone].find((x) => st(save, x) === 'open' && NODE_BY_ID[x].items.every((i) => isBuilt(i.fam)));
  return id ? NODE_BY_ID[id] : null;
}
/** Remedial nodes the child may play from the 徽章站 even when the card is lit (a quietly re-opened node). */
export function playableRemedial(save: MarsSaveV5, card: CardId): string[] { return REMEDIAL_ORDER[card].filter((x) => st(save, x) === 'open'); }

export function openZones(save: MarsSaveV5): ZoneId[] {
  const m = save.session.missions;
  return ZONE_ORDER.filter((z) => {
    if (!isZoneBuilt(z) || !nextNodeFor(save, z)) return false;
    if (z === 'puzzle') return m >= PUZZLE_AFTER_MISSIONS;
    if (z === 'orbit' || z === 'cert') return true;
    return m >= 1;
  });
}
/** Score every open zone, take the best (ties by zone order). The first visit is always the orbit (O1.0). Advice, not a gate. */
export function recommend(save: MarsSaveV5): ZoneId | null {
  const open = openZones(save);
  if (!open.length) return null;
  if (save.session.missions === 0 && open.includes('orbit')) return 'orbit';
  const m = save.session.missions;
  const score = (z: ZoneId): number => {
    const last = save.lastPlayed[z];
    return RECOMMEND.gapW * Math.min(RECOMMEND.gapCap, m - (last ?? -RECOMMEND.gapCap))
      + (z === 'cert' ? RECOMMEND.remedialW : 0) + (AHEAD.includes(z) ? RECOMMEND.aheadW : 0)
      + (!save.visited.includes(z) && m <= RECOMMEND.freshVisits ? RECOMMEND.freshW : 0)
      - (last === m - 1 ? RECOMMEND.playedPenalty : 0);
  };
  return [...open].sort((a, b) => score(b) - score(a) || ZONE_ORDER.indexOf(a) - ZONE_ORDER.indexOf(b))[0];
}

export interface WarmSlot { kind: 'cert' | 'review' | 'prov' | 'direct' | 'prereq' | 'other'; tag?: string; card?: CardId; certIdx?: number; fam?: string; band?: number }
const nodeTagsOf = (n: NodeDef): Set<string> => new Set(n.items.map((i) => META[i.fam]?.tag).filter((t): t is string => !!t));

/** The warm-up slots of a mission on `node` (never for calibration; probe missions replace them with probes elsewhere). */
export function warmSlotsFor(save: MarsSaveV5, node: NodeDef, visit: number): WarmSlot[] {
  if (node.kind === 'calib') return [];
  const out: WarmSlot[] = [];
  const cert = certForMission(save);
  if (cert) {
    for (let i = 0; i < 3; i++) out.push({ kind: 'cert', card: cert.card, certIdx: i });
    return out;
  }
  const push = (s: WarmSlot) => { if (out.length < WARM_SLOTS && !(s.tag && out.some((o) => o.tag === s.tag))) out.push(s); };
  const here = nodeTagsOf(node);
  for (const tag of dueTags(save, visit).sort((a, b) => (save.tags[a].reviews[0] ?? 0) - (save.tags[b].reviews[0] ?? 0))) if (save.tags[tag].fam) push({ kind: 'review', tag });
  for (const p of provisionalDue(save)) if (out.length < WARM_SLOTS) out.push({ kind: 'prov', card: p.card, fam: p.slot.fam, band: p.slot.band });
  for (const d of save.direct.pending) for (const tag of d.tags) if (save.tags[tag]?.fam) push({ kind: 'direct', tag });
  for (const tag of [...here].flatMap((t) => TAG_PREREQ[t] ?? [])) if (save.tags[tag]?.fam && !here.has(tag)) push({ kind: 'prereq', tag });
  const others = Object.keys(save.tags).filter((t) => save.tags[t].fam && !here.has(t)).reverse();
  const zoneOf = (t: string) => save.tags[t].node?.split('.')[0];
  const nodeZone = node.zone;
  for (const tag of others.filter((t) => zoneOf(t) !== nodeZone)) push({ kind: 'other', tag });
  for (const tag of others) push({ kind: 'other', tag });
  return out;
}
