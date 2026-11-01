/** Save v6 (spec star-pets §9.4): key `kg:v1:mars-base`. Plain JSON only (≤ 64 KB). */
import type { CardId, DiagClass, Item, ItemResult, SlotKind } from '../app/types';
import type { PendingAward } from '@kit/economy/data';
import { META } from '../families';
import type { MissionPlan } from '../app/planMission';
import { RECENT_RING } from '../app/tuning';

export const SAVE_VERSION = 6;
export type NodeStatus = 'open' | 'done' | 'skipped';
export interface NodeState { st: NodeStatus; stars: number; plays: number; ft: number[]; bridge?: boolean; why?: 'calib' | 'cert' | 'direct' | 'probe' | 'voided' }
export interface TagState {
  level: number; streak: number; window: string; tailNoHint: number; mastered: boolean; reviews: number[]; shaky?: boolean; shakyOk?: number;
  repDown: number; wrongRun: number; /** family + node of the latest main item (warm-ups regenerate from them) */ fam?: string; node?: string;
  lastAt?: number; reviewAt?: number[];
}
export interface CertState {
  state: 'none' | 'lit' | 'half'; at?: number; attempts: number; answers?: string;
  /** provisional re-check after lighting: items still to be dealt / wrong so far */
  prov?: { left: number; wrong: number; nodes: string[] }; reopenNode?: string; recheck?: boolean; remedialPlays?: number;
}
export interface OrbitTest { node: string; L: number; at: number; targets: number[]; est: number[]; r2: number; slope: number; pae: number; pass: boolean; valid: boolean }
export interface MissionState {
  node: string; kind: 'node' | 'probe' | 'wall' | 'challenge' | 'check'; idx: number; items: Item[]; results: ItemResult[]; stage?: unknown; startedAt: number; activeMs: number;
  /** fact keys already dealt this mission (no repeats) + the slot plan is re-derivable from (salt, session, missions) */
  facts: string[]; seedBase: string; certCard?: CardId; extra?: number; twins?: number; targets?: number[];
  /** the slot plan (persisted: warm-up slots depend on the save at planning time) + pending twins + cert answers + calibration estimates */
  plan?: MissionPlan; queue?: Item[]; certAnswers?: { fam: string; band: number; ok: boolean; card?: CardId }[]; est?: number[]; probeScore?: number; visit?: number;
}
export interface ErrorStat { n: number; recent: { fam: string; at: number }[] }
export interface MarsSaveV5 {
  onboarded: boolean; tutorials: Record<string, boolean>; salt: number;
  session: { index: number; lastActiveAt: number; missions: number };
  nodes: Record<string, NodeState>;
  tags: Record<string, TagState>;
  cert: Record<CardId, CertState>;
  probes: Record<'factory' | 'balance' | 'vault', { done: boolean; score?: number }>;
  orbit: { tests: OrbitTest[] };
  mission: MissionState | null;
  /** per-zone first-try ratios of the last missions (直达 rule) */
  zoneHist: Record<string, number[]>;
  /** zone → last mission number played (recommendation gap) */
  lastPlayed: Record<string, number>;
  visited: string[];
  buildings: Record<string, number>; baseLevel: number; cards: string[]; checker: number; race: { games: number; inProgress: unknown | null };
  errors: Partial<Record<DiagClass, ErrorStat>>;
  /** ring of the last 300 delivered items, compact strings (see `pushRecent` / `readRecent`) */
  recent: string[];
  settings: { music: boolean; liveReadout: boolean };
  /** 挑战订单 (app/challenge.ts): plays so far + best first-try count */
  challenge?: { plays: number; best: number };
  /** an offered 直达 (two equal buttons) waiting for the child's answer */
  directOffer?: { zone: string } | null;
  /** nodes skipped by 直达: their tags come back as L3 warm-ups; a miss re-opens the node */
  direct: { pending: { node: string; tags: string[] }[] };
  /** Awards stay here until the independent coin ledger confirms the write. */
  eco: { retro: boolean; pending: PendingAward[] };
  daily: { runSeq: number; run: unknown | null; lastFT: number; recent: string[] };
}

export function defaultSave(salt = 0): MarsSaveV5 {
  return {
    onboarded: false, tutorials: {}, salt, session: { index: 0, lastActiveAt: 0, missions: 0 }, nodes: {}, tags: {},
    cert: { C1: { state: 'none', attempts: 0 }, C2: { state: 'none', attempts: 0 }, C3: { state: 'none', attempts: 0 } },
    probes: { factory: { done: false }, balance: { done: false }, vault: { done: false } }, orbit: { tests: [] }, mission: null,
    zoneHist: {}, lastPlayed: {}, visited: [], buildings: {}, baseLevel: 1, cards: [], checker: 0, race: { games: 0, inProgress: null }, errors: {}, recent: [],
    settings: { music: true, liveReadout: true }, directOffer: null, direct: { pending: [] },
    eco: { retro: false, pending: [] }, daily: { runSeq: 0, run: null, lastFT: 0, recent: [] },
  };
}
export const nodeState = (s: MarsSaveV5, id: string): NodeState => (s.nodes[id] ??= { st: 'open', stars: 0, plays: 0, ft: [] });
export const isPassed = (s: MarsSaveV5, id: string): boolean => { const n = s.nodes[id]; return !!n && (n.st === 'done' || n.st === 'skipped'); };
const SLOT_CODE: Record<string, string> = { main: 'm', warm: 'w', cert: 'c', probe: 'p', twin: 't', check: 'd' };
const CODE_SLOT: Record<string, SlotKind> = { m: 'main', w: 'warm', c: 'cert', p: 'probe', t: 'twin', d: 'check' };
/** The compact form of a delivered item: keyHash|fam|level|firstTry|misses|hint|assisted|slot|visit|node|diag  (≈55 bytes instead of ≈170). */
export interface RecentRec { keyHash: string; fam: string; tag: string | null; level: number; firstTry: boolean; misses: number; hint: number; assisted: boolean; slot: SlotKind; visit: number; node: string; diag: string }
export function pushRecent(s: MarsSaveV5, r: ItemResult, visit = s.session.index): void {
  s.recent.push([r.keyHash, r.fam, r.level, r.firstTry ? 1 : 0, r.misses, r.hint, r.assisted ? 1 : 0, SLOT_CODE[r.slot] ?? 'm', visit, r.node, r.diag ?? ''].join('|'));
  if (s.recent.length > RECENT_RING) s.recent.splice(0, s.recent.length - RECENT_RING);
}
export function readRecent(s: MarsSaveV5): RecentRec[] {
  return s.recent.map((x) => {
    const [keyHash, fam, level, ft, misses, hint, as, slot, visit, node, diag] = x.split('|');
    return { keyHash, fam, tag: META[fam]?.tag ?? null, level: +level, firstTry: ft === '1', misses: +misses, hint: +hint, assisted: as === '1', slot: CODE_SLOT[slot] ?? 'main', visit: +visit, node, diag: diag ?? '' };
  });
}
/** 8-char hash of an item key (kept small in `recent`). */
export function hash8(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
}
