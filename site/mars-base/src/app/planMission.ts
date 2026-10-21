/**
 * planMission(save, nodeId, visit) → a deterministic SLOT PLAN; items are dealt one by one with the tag's CURRENT ladder level and then
 * stored in the save (parameters, not seeds, are what resume uses). Spec §3.1, §3.4, §4.4.
 *   mission = warm-up slots (≤3: cert items | reviews | probes …) + the node's items + closing 验货单 (+2 when exactly one was wrong) + twins.
 */
import { createRng, type Rng } from '@kit/rng';
import type { CardId, Features, GenCtx, Item, Knobs, Mode, NodeDef, NodeItemDef, SlotKind } from './types';
import { MarsSaveV5, hash8, readRecent } from '../save/schema';
import { NODE_BY_ID, PROBES } from './content';
import { levelFor, repFor } from './adaptive';
import { CERT_ITEMS, certForMission, provisionalDue } from './cert';
import { warmSlotsFor } from './scheduler';
import { CERT, REPLAY_LEVEL_CAP } from './tuning';
import { FAMILIES, META, family } from '../families';
import { CALIBRATION_TARGETS, PLANETS, planTargets } from '../families/nl';
import { factKey } from '../families/shared/arith';

export interface SlotPlan {
  kind: SlotKind; fam: string; band: number; ask?: string; knobs: Knobs; mode: Mode; level?: number; force?: GenCtx['force']; card?: CardId; certIdx?: number;
  probeIdx?: number; typed?: boolean; node: string; explain?: boolean; newElement?: boolean; mainIdx?: number;
}
export interface MissionPlan { node: string; kind: 'node' | 'probe' | 'wall' | 'challenge'; slots: SlotPlan[]; seedBase: string; certCard?: CardId; /** 徽章墙 "一起验货": the cards verified in this one mission */ certCards?: CardId[]; certRole?: 'first' | 'recheck'; probeZone?: string }

const KNOB_KEYS = ['L', 'anchors', 'near', 'variant', 'exclude', 'tol', 'n', 'mode', 'total', 'rule', 'panel', 'rep'] as const;
export const knobsOf = (e: NodeItemDef): Knobs => { const k: Record<string, unknown> = {}; for (const key of KNOB_KEYS) if ((e as any)[key] !== undefined) k[key] = (e as any)[key]; return k as Knobs; };

/** Band of the k-th item of a node entry: explicit, else progressive over the family's bands (Boss uses the top two). */
export function bandAt(node: NodeDef, e: NodeItemDef, k: number): number {
  if (e.band) return e.band;
  const bands = META[e.fam]?.bands ?? 1;
  if (bands <= 1) return 1;
  if (node.kind === 'boss') return Math.max(1, bands - 1 + (k % 2));
  return Math.min(bands, 1 + Math.floor((k * bands) / Math.max(1, e.count)));
}
const mkSeedBase = (save: MarsSaveV5, visit: number): string => `mars-base:${save.salt}:${visit}:${save.session.missions}`;
const sameFamAdjacent = (xs: SlotPlan[]) => xs.some((s, i) => i > 0 && s.fam === xs[i - 1].fam);

/** A node's main slots in play order (Boss: shuffled, same family never adjacent). Targets of number-line entries are planned here. */
export function mainSlots(node: NodeDef, rng: Rng): SlotPlan[] {
  const slots: SlotPlan[] = [];
  let calibSet = 0;
  node.items.forEach((e, ei) => {
    const meta = META[e.fam]; const k = knobsOf(e);
    let targets: number[] | null = null;
    if (e.fam === 'nl.calib') {
      const L = (e.L ?? 100) as 100 | 1000; const sets = CALIBRATION_TARGETS[L];
      const set = [...sets[node.id.endsWith('O1.4') ? 1 : 0] ?? sets[0]]; calibSet = ei;
      targets = rng.fork(`calib${ei}`).shuffle(set);
    } else if ((e.fam === 'nl.place' || e.fam === 'nl.read') && e.ask !== 'planet' && e.L) {
      targets = planTargets(rng.fork(`nl${ei}`), { L: e.L, anchors: e.anchors ?? 'every10', n: e.count, near: e.near, strat100_300: node.strat100_300 });
    }
    const planets = e.ask === 'planet' ? rng.fork(`pl${ei}`).shuffle(PLANETS.filter((p) => p.dist <= 1000)).slice(0, e.count) : null;
    const typedN = meta?.answerModes?.includes('type') ? Math.min(e.count, Math.floor(e.count * (meta.typedMax ?? 0) + rng.fork(`ty${ei}`).next())) : 0;
    const typedAt = new Set(rng.fork(`tp${ei}`).shuffle(Array.from({ length: e.count }, (_, i) => i)).slice(0, typedN));
    for (let i = 0; i < e.count; i++) {
      slots.push({
        kind: 'main', fam: e.fam, band: bandAt(node, e, i), ask: e.ask, knobs: k, mode: node.kind === 'calib' ? 'calib' : 'normal', node: node.id,
        force: targets ? { target: targets[i] } : planets ? { planet: planets[i].id, target: planets[i].dist } : undefined,
        typed: typedAt.has(i) || e.fam === 'nl.read', newElement: !!node.newElement,
      });
    }
  });
  void calibSet;
  let out = slots;
  if (node.kind === 'boss') {
    for (let t = 0; t < 60; t++) { out = rng.fork(`boss${t}`).shuffle(slots); if (!sameFamAdjacent(out)) break; }
  }
  // node cap on typed answers: ≤4 of 6 (Boss ≤5 of 8)
  const cap = node.kind === 'boss' ? 5 : 4; let typed = 0;
  for (const s of out) if (s.typed && s.fam !== 'nl.read') { typed++; if (typed > cap) s.typed = false; }
  out.forEach((s, i) => { s.mainIdx = i; s.explain = !!node.explain?.includes(i + 1); });
  return out;
}

/** Warm-up slots → SlotPlans (the family and band come from where the tag was last practised). */
function warmPlans(save: MarsSaveV5, node: NodeDef, visit: number): { slots: SlotPlan[]; certCard?: CardId; certRole?: 'first' | 'recheck' } {
  const cert = certForMission(save);
  const slots: SlotPlan[] = [];
  for (const w of warmSlotsFor(save, node, visit)) {
    if (w.kind === 'cert' && w.card) {
      const c = CERT_ITEMS[w.card][w.certIdx!];
      slots.push({ kind: 'cert', fam: c.fam, band: c.band, knobs: {}, mode: 'cert', level: 4, card: w.card, certIdx: w.certIdx, node: node.id });
    } else if (w.kind === 'prov' && w.card) {
      slots.push({ kind: 'warm', fam: w.fam!, band: w.band!, knobs: {}, mode: 'normal', level: 4, card: w.card, node: node.id });
    } else if (w.tag) {
      const ts = save.tags[w.tag]; const src = ts.node ? NODE_BY_ID[ts.node] : null;
      const entry = src?.items.find((i) => i.fam === ts.fam);
      const lv = w.kind === 'review' ? Math.max(3, ts.level - 1) : 3;
      slots.push({ kind: 'warm', fam: ts.fam!, band: entry ? bandAt(src!, entry, 0) : 1, knobs: entry ? knobsOf(entry) : {}, mode: 'normal', level: lv, node: node.id });
    }
  }
  if (cert && slots.some((s) => s.kind === 'cert')) return { slots, certCard: cert.card, certRole: cert.role };
  return { slots };
}

export function planMission(save: MarsSaveV5, nodeId: string, visit: number, opts: { noWarm?: boolean } = {}): MissionPlan {
  const node = NODE_BY_ID[nodeId];
  if (!node) throw new Error(`unknown node ${nodeId}`);
  const seedBase = mkSeedBase(save, visit);
  const rng = createRng(`${seedBase}:${nodeId}`);
  const warm = opts.noWarm || node.kind === 'calib' ? { slots: [] as SlotPlan[] } : warmPlans(save, node, visit);
  const main = mainSlots(node, rng.fork('main'));
  const slots = [...warm.slots, ...main];
  if (warm.certCard) { const c = CERT_ITEMS[warm.certCard][3]; slots.push({ kind: 'cert', fam: c.fam, band: c.band, knobs: {}, mode: 'cert', level: 4, card: warm.certCard, certIdx: 3, node: node.id }); }
  return { node: nodeId, kind: 'node', slots, seedBase, certCard: warm.certCard, certRole: (warm as any).certRole };
}
/** 徽章墙 "一起验货": the 4 cert items of every listed card, one after the other, in ONE mission (one attempt each, no node, no stars). */
export function planCertWall(save: MarsSaveV5, cards: CardId[], visit: number): MissionPlan {
  const seedBase = mkSeedBase(save, visit);
  const slots: SlotPlan[] = cards.flatMap((card) => CERT_ITEMS[card].slice(0, 4).map((c, i): SlotPlan => ({ kind: 'cert', fam: c.fam, band: c.band, knobs: {}, mode: 'cert', level: 4, card, certIdx: i, node: 'cert.wall' })));
  return { node: 'cert.wall', kind: 'wall', slots, seedBase, certCards: cards };
}
/** Entry probe of a zone (3 abstract items with deferred feedback). The node mission follows once the probe has decided the starting node. */
export function planProbe(save: MarsSaveV5, zone: string, visit: number): MissionPlan {
  const def = PROBES[zone];
  if (!def) throw new Error(`no probe for ${zone}`);
  const seedBase = mkSeedBase(save, visit);
  const slots: SlotPlan[] = def.items.map((it, i) => ({ kind: 'probe', fam: it.fam, band: it.band ?? 1, ask: it.ask, knobs: {}, mode: 'probe', level: 3, probeIdx: i, node: `probe.${zone}` }));
  return { node: `probe.${zone}`, kind: 'probe', slots, seedBase, probeZone: zone };
}
/** Probe result → which nodes to skip (3/3 and 2/3 skip the front of the zone; ≤1 starts at the beginning). Never a Boss. */
export function probeSkips(zone: string, score: number): string[] { return PROBES[zone]?.skip[String(score)] ?? []; }

/** The two extra tier-2 items after exactly one wrong cert item ("再验两件货"). */
export function extraCertSlots(plan: MissionPlan, node: string, cardOverride?: CardId): SlotPlan[] {
  const card = cardOverride ?? plan.certCard!; const t2 = CERT_ITEMS[card].filter((c) => c.tier === 2);
  return Array.from({ length: CERT.extraOnOneError }, (_, i) => ({ kind: 'cert' as const, fam: t2[i % t2.length].fam, band: t2[i % t2.length].band, knobs: {}, mode: 'cert' as const, level: 4, card, certIdx: 4 + i, node }));
}

/** same carry / cross / zero flags and the same order of magnitude */
export const featuresMatch = (a: Features, b: Features): boolean => a.carry === b.carry && a.cross === b.cross && a.zero === b.zero && Math.floor(Math.log10(Math.max(1, a.size))) === Math.floor(Math.log10(Math.max(1, b.size)));
const MISCONCEPTION = new Set(['noCarry', 'smallerFromLarger', 'pvConcat', 'zeroOmit', 'unitAsOne', 'canonicalOnly']);
/** Deal slot `idx` of the plan: params are generated NOW from the tag's current level; a fact already dealt this mission is redrawn. */
export function dealItem(save: MarsSaveV5, plan: MissionPlan, idx: number, facts: Set<string>, twin = 0, slotOverride?: SlotPlan): Item {
  const slot = slotOverride ?? plan.slots[idx];
  const f = family(slot.fam);
  const rng = createRng(`${plan.seedBase}:${plan.node}:${idx}:${twin}`);
  const nodeState = save.nodes[plan.node];
  const replay = !!nodeState?.bridge;
  const level = slot.level ?? levelFor(save, f.tag, { cap: replay ? REPLAY_LEVEL_CAP : undefined });
  const ts = f.tag ? save.tags[f.tag] : undefined;
  const rep = slot.mode !== 'normal' ? 'A' : repFor(level, ts);
  let ask = slot.ask;
  const structural = (f.asks ?? []).filter((a) => a === 'count' || a === 'size');
  if (!ask && level >= 6 && f.l6 === 'structure' && structural.length) ask = rng.pick(structural);
  if (!ask && level >= 6 && f.l6 === 'missingDimension' && f.asks?.includes('cols')) ask = 'cols';
  let out: { params: unknown; answer: unknown } | null = null; let key = '';
  const like = (slot as SlotPlan & { like?: Features }).like;   // a twin must be the SAME KIND of item (carry / cross / zero / size band), not just another number
  let fresh: { out: { params: unknown; answer: unknown }; key: string } | null = null; let matched = false;
  for (let attempt = 0; attempt < 80; attempt++) {
    out = f.gen(rng, { band: slot.band, level, rep, ask, knobs: slot.knobs, l6: level >= 6, force: attempt === 0 ? slot.force : slot.force && f.id.startsWith('nl.') && f.id !== 'nl.calib' ? { ...slot.force, target: undefined } : slot.force });
    key = factKey(f.id, out.params);
    const isNew = !facts.has(key) || f.id === 'nl.calib';
    if (isNew && (!like || featuresMatch(f.features(out.params as never, ask), like))) { matched = true; break; }
    if (isNew && !fresh) fresh = { out, key };
  }
  if (!matched && fresh) { out = fresh.out; key = fresh.key; }
  facts.add(key);
  const lastTag = f.tag ? readRecent(save).reverse().find((r) => r.tag === f.tag) : undefined;
  const hands = slot.kind === 'main' && (rep === 'C' || level <= 1 || (!!slot.newElement && (slot.mainIdx ?? 9) < 2) || (lastTag && !lastTag.firstTry && MISCONCEPTION.has(lastTag.diag)) || !!slot.explain || (replay && (slot.mainIdx ?? 9) < 2));
  const item: Item = {
    key: `${plan.node}#${idx}${twin ? `t${twin}` : ''}`, fam: f.id, tag: f.tag, band: slot.band, level, rep, mode: slot.mode, ask, params: out!.params,
    seed: rng.seed, slot: twin ? 'twin' : slot.kind, node: plan.node, typed: !!slot.typed, buildFirst: !!hands && f.buildable === true,
    ...(slot.card ? { card: slot.card, certIdx: slot.certIdx } : {}), ...(slot.probeIdx !== undefined ? { probeIdx: slot.probeIdx } : {}),
  };
  return item;
}
/** A twin after an H3: same family / band / tag, new facts, one level easier representation (never a copy). */
export function dealTwin(save: MarsSaveV5, plan: MissionPlan, from: Item, facts: Set<string>, n: number): Item {
  const f = family(from.fam);
  const slot: SlotPlan & { like?: Features } = { kind: 'main', fam: from.fam, band: from.band, ask: from.ask, knobs: plan.slots.find((s) => s.fam === from.fam)?.knobs ?? {}, mode: 'normal', node: plan.node, level: Math.max(1, from.level - 1), typed: from.typed, like: f.features(from.params as never, from.ask) };
  return dealItem(save, plan, 9000 + n, facts, n, slot);
}
export const itemKeyHash = (it: Item): string => hash8(`${it.key}:${JSON.stringify(it.params)}`);
export { provisionalDue, FAMILIES };
