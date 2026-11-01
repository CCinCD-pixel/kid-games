/** Node data access (content/mars-base/nodes.json): v1 filtering, zone order, remedial chapters, probes, cert map. */
import nodesJson from '../../../../content/mars-base/nodes.json';
import type { CardId, NodeDef, ZoneId } from './types';
import { MAIN_CHAPTERS, REMEDIAL_CHAPTERS } from './tuning';

interface ProbeDef { items: { fam: string; band?: number; ask?: string }[]; skip: Record<string, string[]> }
const J = nodesJson as unknown as { chapters: Record<string, string>; nodes: NodeDef[]; probes: Record<string, ProbeDef>; certMap: Record<CardId, Record<string, string>>; v1Order: Record<string, string[]> };

export const CHAPTER_NAMES = J.chapters;
const isMainV1 = (n: NodeDef): boolean => (MAIN_CHAPTERS as readonly string[]).includes(n.chapter) && (n.chapter !== 'B1' || n.zone === 'balance') || n.id === 'balance.B2.1';
const isRemedialV1 = (n: NodeDef): boolean => (REMEDIAL_CHAPTERS as readonly string[]).includes(n.chapter);

/** All v1 nodes (main line + remedial), in file order. */
export const NODES: NodeDef[] = J.nodes.filter((n) => isMainV1(n) || isRemedialV1(n));
export const NODE_BY_ID: Record<string, NodeDef> = Object.fromEntries(NODES.map((n) => [n.id, n]));
export const ALL_NODE_BY_ID: Record<string, NodeDef> = Object.fromEntries(J.nodes.map((n) => [n.id, n]));

const mainOf = (zone: ZoneId): NodeDef[] => {
  const base = NODES.filter((n) => n.zone === zone && isMainV1(n));
  const ord = J.v1Order?.[zone];
  return ord ? ord.map((id) => base.find((n) => n.id === id)).filter((n): n is NodeDef => !!n) : base;
};
/** Main-line nodes per zone in play order (the `cert` zone has no main line: its nodes are the remedial chapters). */
export const MAIN_ORDER: Record<ZoneId, string[]> = {
  orbit: mainOf('orbit').map((n) => n.id), cert: [], vault: mainOf('vault').map((n) => n.id), factory: mainOf('factory').map((n) => n.id),
  balance: mainOf('balance').map((n) => n.id), puzzle: mainOf('puzzle').map((n) => n.id),
};
/** Remedial nodes per badge card (never `breather`s; they have none). */
export const REMEDIAL_ORDER: Record<CardId, string[]> = {
  C1: NODES.filter((n) => n.chapter === 'C1').map((n) => n.id),
  C2: NODES.filter((n) => n.chapter === 'C2').map((n) => n.id),
  C3: NODES.filter((n) => n.chapter === 'C3').map((n) => n.id),
};
export const CARDS: CardId[] = ['C1', 'C2', 'C3'];
export const PROBES = J.probes as Record<string, ProbeDef>;
export const CERT_MAP = J.certMap;
export const cardOfNode = (n: NodeDef): CardId | null => (n.chapter === 'C1' || n.chapter === 'C2' || n.chapter === 'C3' ? (n.chapter as CardId) : null);
export const zoneOfNode = (n: NodeDef): ZoneId => (cardOfNode(n) ? 'cert' : (n.zone as ZoneId));
export const scoredNodes = (ids: string[]): NodeDef[] => ids.map((id) => NODE_BY_ID[id]).filter((n) => n.kind !== 'calib' && n.kind !== 'breather');
/** Number of items a node deals (6 / 8 / 4 / 12). */
export const nodeSize = (n: NodeDef): number => n.items.reduce((s, i) => s + i.count, 0);
