/**
 * Embedded badge check (spec §3.6): a card's 4 items sit in the mission — 3 warm-up slots + 1 closing "验货单" — all abstract (A),
 * one attempt each, deferred feedback, nothing stops early; the result is announced once at the end. Exactly one wrong → the 验货单
 * grows by 2 tier-2 items; ≥2 wrong → the badge lights half and the remedial chapter starts at the EARLIEST node a wrong item points to.
 * After lighting: a provisional re-check (4 tier-2 warm-ups, ≤2 per mission): ≥2 wrong re-opens ONE remedial node, never the badge.
 */
import type { CardId, Item } from './types';
import { MarsSaveV5, nodeState } from '../save/schema';
import { CARDS, CERT_MAP, REMEDIAL_ORDER } from './content';
import { CERT } from './tuning';

export interface CertSlot { fam: string; band: number; tier: 1 | 2 }
/** [T1a, T2a, T1b, T2b]: slots 0–2 are warm-ups, slot 3 is the closing 验货单. */
export const CERT_ITEMS: Record<CardId, CertSlot[]> = {
  C1: [{ fam: 'pv2.read', band: 1, tier: 1 }, { fam: 'pv2.split', band: 2, tier: 2 }, { fam: 'pv2.compare', band: 2, tier: 1 }, { fam: 'pv2.read', band: 2, tier: 2 }],
  C2: [{ fam: 'add.tens', band: 2, tier: 1 }, { fam: 'add.2d2d', band: 2, tier: 2 }, { fam: 'add.carry1', band: 1, tier: 1 }, { fam: 'add.compensate', band: 1, tier: 2 }],
  C3: [{ fam: 'sub.tens', band: 2, tier: 1 }, { fam: 'sub.2d2d', band: 2, tier: 2 }, { fam: 'sub.borrow1', band: 1, tier: 1 }, { fam: 'sub.thinkAdd', band: 2, tier: 2 }],
};
export const CERT_TAGS: Record<CardId, string[]> = {
  C1: ['pv2.rep', 'pv2.cmp', 'pv2.step', 'pv2.split'], C2: ['add.tens', 'add.carry', 'add.2d', 'add.comp'], C3: ['sub.tens', 'sub.borrow', 'sub.2d', 'sub.think', 'sub.comp'],
};
export const tier2 = (card: CardId): CertSlot[] => CERT_ITEMS[card].filter((s) => s.tier === 2);

/** The next card that is waiting for its check (one at a time, C1 → C2 → C3), or null. Needs ≥ 1 finished mission. */
export function pendingCard(save: MarsSaveV5): CardId | null {
  if (save.session.missions < 1) return null;
  return CARDS.find((c) => save.cert[c].state === 'none') ?? null;
}
/** A half-lit card whose remedial work is done enough to be checked again. */
export const recheckCard = (save: MarsSaveV5): CardId | null => CARDS.find((c) => save.cert[c].state === 'half' && save.cert[c].recheck) ?? null;
/** Which card (if any) puts its check into the next mission, and in which role. */
export function certForMission(save: MarsSaveV5): { card: CardId; role: 'first' | 'recheck' } | null {
  const r = recheckCard(save); if (r) return { card: r, role: 'recheck' };
  const p = pendingCard(save); return p ? { card: p, role: 'first' } : null;
}

export interface CertAnswer { fam: string; band: number; ok: boolean }
export interface CertOutcome { state: 'need-extra' | 'lit' | 'half'; startNode?: string; wrong: number[] }
const nodeOfItem = (card: CardId, a: { fam: string; band: number }): string | null => CERT_MAP[card][`${a.fam}:${a.band}`] ?? null;

/** Decide from the answers collected so far (4, then 6 when exactly one of the first 4 was wrong). Pure: does not touch the save. */
export function evaluateCert(card: CardId, answers: CertAnswer[]): CertOutcome {
  const wrong = answers.map((a, i) => (a.ok ? -1 : i)).filter((i) => i >= 0);
  if (answers.length === CERT.items) {
    if (wrong.length === 0) return { state: 'lit', wrong };
    if (wrong.length === 1) return { state: 'need-extra', wrong };
    return { state: 'half', wrong, startNode: startNodeOf(card, answers.filter((a) => !a.ok)) };
  }
  // 6 answers (after the extra pair): lit only when both extras are right
  const extrasOk = answers.slice(CERT.items).every((a) => a.ok);
  return extrasOk ? { state: 'lit', wrong } : { state: 'half', wrong, startNode: startNodeOf(card, answers.filter((a) => !a.ok)) };
}
/** Earliest remedial node pointed at by any wrong item (uses ALL answers). */
export function startNodeOf(card: CardId, wrong: { fam: string; band: number }[]): string {
  const order = REMEDIAL_ORDER[card];
  const idx = wrong.map((a) => nodeOfItem(card, a)).filter((n): n is string => !!n).map((n) => order.indexOf(n)).filter((i) => i >= 0);
  return order[idx.length ? Math.min(...idx) : 0];
}

export const answersString = (answers: CertAnswer[]): string => answers.map((a) => (a.ok ? '1' : '0')).join('');

/** Apply a final outcome to the save (lit / half), including the remedial skips. Returns the outcome for the wrap-up card. */
export function applyCert(save: MarsSaveV5, card: CardId, answers: CertAnswer[], at: number): CertOutcome {
  const out = evaluateCert(card, answers);
  const cs = save.cert[card];
  if (out.state === 'need-extra') return out;
  cs.attempts++; cs.at = at; cs.answers = answersString(answers); cs.recheck = false; cs.remedialPlays = 0;
  const order = REMEDIAL_ORDER[card];
  if (out.state === 'lit') {
    cs.state = 'lit'; cs.prov = { left: CERT.provisionalItems, wrong: 0, nodes: [] };
    for (const id of order) { const ns = nodeState(save, id); if (ns.st === 'open') { ns.st = 'skipped'; ns.why = 'cert'; } }
  } else {
    cs.state = 'half'; cs.prov = undefined;
    const start = order.indexOf(out.startNode!);
    order.forEach((id, i) => { const ns = nodeState(save, id); if (i < start && ns.st === 'open') { ns.st = 'skipped'; ns.why = 'cert'; } });
  }
  return out;
}

/** Provisional re-check items due now (≤ CERT.provisionalPerMission across all cards), as tier-2 slots. */
export function provisionalDue(save: MarsSaveV5, max = CERT.provisionalPerMission): { card: CardId; slot: CertSlot }[] {
  const out: { card: CardId; slot: CertSlot }[] = [];
  for (const c of CARDS) {
    const cs = save.cert[c];
    if (cs.state !== 'lit' || !cs.prov || cs.prov.left <= 0) continue;
    const t2 = tier2(c); let k = 0;
    while (cs.prov.left - k > 0 && out.length < max) { out.push({ card: c, slot: t2[(CERT.provisionalItems - cs.prov.left + k) % t2.length] }); k++; if (k >= 2) break; }
    if (out.length >= max) break;
  }
  return out;
}
/** A provisional item was delivered. After the 4th: ≥2 wrong → re-open ONE remedial node (quietly; the badge stays lit). */
export function recordProvisional(save: MarsSaveV5, card: CardId, item: Pick<Item, 'fam' | 'band'>, ok: boolean): { reopened: string | null } {
  const cs = save.cert[card]; const pv = cs.prov;
  if (!pv || pv.left <= 0) return { reopened: null };
  pv.left--; if (!ok) { pv.wrong++; const n = nodeOfItem(card, item); if (n) pv.nodes.push(n); }
  if (pv.left > 0) return { reopened: null };
  if (pv.wrong >= CERT.reopenWrong && pv.nodes.length) {
    const id = pv.nodes[0]; const ns = nodeState(save, id);
    ns.st = 'open'; ns.why = undefined; cs.reopenNode = id; return { reopened: id };
  }
  return { reopened: null };
}
/** Remedial progress: after the chapter's Boss or CERT.remedialMissionsToRecheck plays the card is re-checked in the warm-ups. */
export function noteRemedialPlay(save: MarsSaveV5, card: CardId, finishedBoss: boolean): void {
  const cs = save.cert[card];
  if (cs.state !== 'half') return;
  cs.remedialPlays = (cs.remedialPlays ?? 0) + 1;
  if (finishedBoss || cs.remedialPlays >= CERT.remedialMissionsToRecheck) cs.recheck = true;
  // every remedial node done/skipped → a re-check in the next warm-ups is due, but the badge only lights when THAT passes (QA fix-mars-r1: a node counts as done after 2 plays even when every
  // item was assisted, so twelve assisted plays used to light the card with no verifying answer — spec §3.6.4)
  if (REMEDIAL_ORDER[card].every((id) => (save.nodes[id]?.st ?? 'open') !== 'open')) cs.recheck = true;
}
