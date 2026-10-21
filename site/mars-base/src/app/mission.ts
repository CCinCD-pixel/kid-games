/**
 * The mission driver (pure over the save; no DOM, no clock): begin → deal items one by one → deliver results → end.
 * The screens, the V4 simulator and the tests all drive exactly these functions (spec §3.1–§3.7).
 */
import type { CardId, DiagClass, Item, ItemResult, NodeDef } from './types';
import { MarsSaveV5, nodeState, pushRecent } from '../save/schema';
import { NODE_BY_ID, cardOfNode, zoneOfNode } from './content';
import { MissionOutcome, finishMission, failDirectProbe, passDirectProbe, recordMain, recordWarm, tagState } from './adaptive';
import { applyCert, evaluateCert, noteRemedialPlay, recordProvisional, type CertOutcome } from './cert';
import { composeSet, nextChallengeSeed } from './challenge';
import { MissionPlan, planCertWall, dealItem, dealTwin, extraCertSlots, itemKeyHash, planMission, planProbe, probeSkips } from './planMission';
import { scoreCalibration, type CalibrationScore } from '../families/nl';
import { CERT, REVIEW_OFFSETS } from './tuning';

export interface MissionRun { plan: MissionPlan; facts: Set<string>; idx: number; queue: Item[]; results: ItemResult[]; certAnswers: { fam: string; band: number; ok: boolean; card?: CardId }[]; est: number[]; probeScore: number; twins: number; visit: number; items: Item[] }
export interface DeliverInfo { firstTry: boolean; misses: number; hint: number; assisted: boolean; ok: boolean; diags?: (DiagClass | null)[]; ops?: number; est?: number }
export interface DeliverEffect { twin: Item | null; certNeedsExtra: boolean }

const persist = (save: MarsSaveV5, run: MissionRun, now: number, kind: MissionPlan['kind']): void => {
  save.mission = {
    node: run.plan.node, kind, idx: run.idx, items: run.items, results: run.results, startedAt: save.mission?.startedAt ?? now, activeMs: save.mission?.activeMs ?? 0,
    facts: [...run.facts], seedBase: run.plan.seedBase, certCard: run.plan.certCard, twins: run.twins, plan: run.plan, queue: run.queue, certAnswers: run.certAnswers,
    est: run.est, probeScore: run.probeScore, visit: run.visit,
  };
};

export function beginMission(save: MarsSaveV5, nodeId: string, visit: number, now: number, opts: { noWarm?: boolean; probe?: boolean; wall?: CardId[]; challenge?: boolean } = {}): MissionRun {
  const node = NODE_BY_ID[nodeId];
  const zone = node ? zoneOfNode(node) : null;
  const plan = opts.challenge ? composeSet(save, nextChallengeSeed(save)) : opts.wall ? planCertWall(save, opts.wall, visit) : opts.probe && zone ? planProbe(save, zone, visit) : planMission(save, nodeId, visit, { noWarm: opts.noWarm });
  const run: MissionRun = { plan, facts: new Set(), idx: 0, queue: [], results: [], certAnswers: [], est: [], probeScore: 0, twins: 0, visit, items: [] };
  persist(save, run, now, plan.kind);
  return run;
}
/**
 * Does the saved mission continue the one the child asks to start? A probe is saved as `probe.<zone>` and a 一起验货 as `cert.wall`, so the node id of the request is
 * never compared with it directly (QA fix-mars-r1 P2: the old `save.mission.node === nodeId` never matched a probe, a reload restarted it at item 0).
 */
export function missionMatches(save: MarsSaveV5, o: { nodeId: string; probe?: boolean; wall?: unknown; challenge?: boolean }): boolean {
  const m = save.mission; if (!m?.plan) return false;
  if (o.challenge) return m.kind === 'challenge';
  if (o.wall) return m.kind === 'wall';
  if (o.probe) { const n = NODE_BY_ID[o.nodeId]; const zone = n ? zoneOfNode(n) : o.nodeId.replace(/^probe\./, ''); return m.kind === 'probe' && m.node === `probe.${zone}`; }
  return m.kind === 'node' && m.node === o.nodeId;
}
/** Rebuild the run from the save after a reload (same slot plan, same dealt items). */
export function resumeMission(save: MarsSaveV5): MissionRun | null {
  const m = save.mission; if (!m?.plan) return null;
  if (!NODE_BY_ID[m.node] && m.kind === 'node') return null;
  // the item that was on screen when the child left (dealt, never delivered) is dealt again first — a refresh never eats a slot
  const items = m.items.slice(); const queue = (m.queue ?? []).slice(); const last = items[items.length - 1];
  if (last && !m.results.some((r) => r.keyHash === itemKeyHash(last))) { items.pop(); queue.unshift(last); }
  return { plan: m.plan, facts: new Set(m.facts), idx: m.idx, queue, results: m.results, certAnswers: m.certAnswers ?? [], est: m.est ?? [], probeScore: m.probeScore ?? 0, twins: m.twins ?? 0, visit: m.visit ?? save.session.index, items };
}
export const missionDone = (run: MissionRun): boolean => run.queue.length === 0 && run.idx >= run.plan.slots.length;
export const mainIndexOf = (run: MissionRun): number => run.results.filter((r) => r.slot === 'main').length;
export const totalSlots = (run: MissionRun): number => run.plan.slots.length;

/** Deal the next item (twins first). Parameters are generated NOW from the tag's current level, then saved. */
export function dealNext(save: MarsSaveV5, run: MissionRun, now: number): Item | null {
  let item: Item | null = null;
  if (run.queue.length) item = run.queue.shift()!;
  else if (run.idx < run.plan.slots.length) { item = dealItem(save, run.plan, run.idx, run.facts); run.idx++; }
  if (item) run.items.push(item);
  persist(save, run, now, run.plan.kind);
  return item;
}

/** A question was delivered (right, or assisted after H3, or a single cert/probe/calibration attempt). */
export function deliver(save: MarsSaveV5, run: MissionRun, item: Item, info: DeliverInfo, now: number): DeliverEffect {
  const slot = item.slot ?? 'main';
  const r: ItemResult = { keyHash: itemKeyHash(item), fam: item.fam, tag: item.tag, level: item.level, firstTry: info.firstTry, misses: info.misses, hint: info.hint, assisted: info.assisted || undefined, slot, at: now, node: item.node ?? run.plan.node, ok: info.ok, ops: info.ops };
  for (const d of info.diags ?? []) if (d) { const e = (save.errors[d] ??= { n: 0, recent: [] }); e.n++; e.recent.push({ fam: item.fam, at: now }); if (e.recent.length > 3) e.recent.shift(); }
  run.results.push(r);
  let twin: Item | null = null; let certNeedsExtra = false;
  if (slot === 'main') {
    if (item.mode === 'calib') { pushRecent(save, r); if (info.est !== undefined) run.est.push(info.est); }
    else recordMain(save, r, run.visit);
    if (info.assisted && item.mode === 'normal' && run.twins < 2) { run.twins++; twin = dealTwin(save, run.plan, item, run.facts, run.twins); run.queue.push(twin); }
  } else if (slot === 'twin') pushRecent(save, r);
  else if (slot === 'warm') {
    if (item.card) { const res = recordProvisional(save, item.card, { fam: item.fam, band: item.band }, info.ok); void res; pushRecent(save, r); }
    else { recordWarm(save, r, run.visit); if (item.tag) (info.ok ? passDirectProbe : failDirectProbe)(save, item.tag); }
  } else if (slot === 'cert') {
    pushRecent(save, r);
    const card = item.card ?? run.plan.certCard;
    run.certAnswers.push({ fam: item.fam, band: item.band, ok: info.ok, card });
    const mine = run.certAnswers.filter((a) => (a.card ?? run.plan.certCard) === card);
    if (mine.length === CERT.items && card) {
      const out = evaluateCert(card, mine);
      if (out.state === 'need-extra') { certNeedsExtra = true; run.plan.slots.push(...extraCertSlots(run.plan, item.node ?? run.plan.node, card)); }
    }
  } else if (slot === 'probe') { pushRecent(save, r); if (info.ok) run.probeScore++; }
  persist(save, run, now, run.plan.kind);
  return { twin, certNeedsExtra };
}

export interface EndSummary {
  /** 挑战订单 result */ challenge?: { n: number; firstTry: number; stars: 1 | 2 | 3 };
  node: NodeDef | null; outcome: MissionOutcome | null; cert: { card: CardId; outcome: CertOutcome } | null; /** 一起验货: one outcome per card */ certs?: { card: CardId; outcome: CertOutcome }[]; calibration: CalibrationScore | null;
  probe: { zone: string; score: number; skipped: string[] } | null; zone: string;
}
/** Close the mission: node status, transition / stars, cert + remedial bookkeeping, calibration scoring, probe skips, counters. */
export function endMission(save: MarsSaveV5, run: MissionRun, now: number): EndSummary {
  const planNode = run.plan.node;
  const sum: EndSummary = { node: null, outcome: null, cert: null, calibration: null, probe: null, zone: '' };
  if (run.plan.kind === 'probe') {
    const zone = run.plan.probeZone!; const skipped = probeSkips(zone, run.probeScore);
    for (const id of skipped) { const ns = nodeState(save, id); if (ns.st === 'open') { ns.st = 'skipped'; ns.why = 'probe'; } }
    save.probes[zone as 'factory' | 'balance' | 'vault'] = { done: true, score: run.probeScore };
    sum.probe = { zone, score: run.probeScore, skipped }; sum.zone = zone; save.mission = null;
    return sum;
  }
  if (run.plan.kind === 'challenge') {
    const main = run.results.filter((r) => r.slot === 'main'); const n = main.length; const ft = main.filter((r) => r.firstTry && !r.assisted).length;
    const stars = (n && ft / n >= 7 / 9 ? 3 : n && ft / n >= 5 / 9 ? 2 : 1) as 1 | 2 | 3;
    const ch = (save.challenge ??= { plays: 0, best: 0 }); ch.plays++; ch.best = Math.max(ch.best, ft);
    sum.challenge = { n, firstTry: ft, stars }; sum.zone = 'challenge'; save.session.missions++; save.mission = null;
    return sum;
  }
  if (run.plan.kind === 'wall') {
    sum.certs = (run.plan.certCards ?? []).map((card) => ({ card, outcome: applyCert(save, card, run.certAnswers.filter((a) => a.card === card), now) })); sum.zone = 'cert';
    save.lastPlayed.cert = save.session.missions; if (!save.visited.includes('cert')) save.visited.push('cert'); save.session.missions++; save.mission = null;
    return sum;
  }
  const node = NODE_BY_ID[planNode]; sum.node = node; sum.zone = zoneOfNode(node);
  if (run.plan.certCard) {
    const outc = applyCert(save, run.plan.certCard, run.certAnswers, now);
    sum.cert = { card: run.plan.certCard, outcome: outc };
  }
  if (node.kind === 'calib') {
    const L = node.items[0].L ?? 100; const targets = run.items.filter((i) => i.mode === 'calib').map((i) => (i.params as { target: number }).target);
    const sc = scoreCalibration(L, targets, run.est); sum.calibration = sc;
    save.orbit.tests.push({ node: node.id, L, at: now, targets, est: run.est, r2: sc.r2, slope: sc.slope, pae: sc.pae, pass: sc.pass, valid: !sc.degenerate });
    const ns = nodeState(save, node.id); ns.st = 'done'; ns.plays++; ns.stars = 0;
    if (sc.pass && node.id === 'orbit.O1.0') {
      for (const id of ['orbit.O1.1', 'orbit.O1.2', 'orbit.O1.3', 'orbit.O1.4']) { const s = nodeState(save, id); if (s.st === 'open') { s.st = 'skipped'; s.why = 'calib'; } }
      const ts = tagState(save, 'nl.est'); ts.mastered = true; ts.level = Math.max(ts.level, 3); ts.reviews = REVIEW_OFFSETS.map((o) => run.visit + o); ts.fam = 'nl.place'; ts.node = 'orbit.O1.2';
    }
    sum.outcome = { n: 12, firstTry: 0, rate: 1, maxLevel: 1, stars: 0, advance: true, h3: 0, replay: false, directOffer: false };
  } else {
    sum.outcome = finishMission(save, node, run.results);
    const card = cardOfNode(node);
    if (card) noteRemedialPlay(save, card, node.kind === 'boss' && sum.outcome.advance);
  }
  const zone = sum.zone; save.lastPlayed[zone] = save.session.missions; if (!save.visited.includes(zone)) save.visited.push(zone);
  save.session.missions++;
  save.mission = null;
  return sum;
}
