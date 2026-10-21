/**
 * 挑战订单 / 复习订单 (QA fix-mars-r1 T5): the replayable mixed set that keeps the base playable when every main-line order is delivered.
 * `composeSet(state, seed)` is the ONE entry point — pure, deterministic over (save, seed), no clock, no DOM — and the future 每日补给 reuses it unchanged
 * (it only needs a seed string and a count). It deals from families the child has ALREADY passed (done / skipped nodes), with the existing generators,
 * the existing hint ladder (the mission runner is the same), no coins, no parts; results feed the same adaptive state as any main item.
 */
import { createRng } from '@kit/rng';
import type { Knobs, ZoneId } from './types';
import { MarsSaveV5 } from '../save/schema';
import { NODES, MAIN_ORDER, NODE_BY_ID, zoneOfNode } from './content';
import { bandAt, knobsOf, type MissionPlan, type SlotPlan } from './planMission';
import { META, isBuilt } from '../families';

export const CHALLENGE_SIZE = 9;
export interface PoolEntry { fam: string; band: number; ask?: string; knobs: Knobs; node: string; zone: ZoneId; di: number; weight: number }

/** miss rate of the last answers of a tag (window = '1' right first time / '0' not), 0 when unknown */
function missRate(save: MarsSaveV5, tag: string | null): number {
  if (!tag) return 0; const w = save.tags[tag]?.window ?? ''; if (!w) return 0;
  const tail = w.slice(-8); return [...tail].filter((c) => c !== '1').length / tail.length;
}
/** Every (family, band, knobs) the child has passed, weighted by how shaky it still is. Passed = done or skipped; breathers, calibrations and unbuilt families are never dealt. */
export function learnedPool(save: MarsSaveV5): PoolEntry[] {
  const out: PoolEntry[] = [];
  for (const node of NODES) {
    if (node.kind === 'calib' || node.kind === 'breather') continue;
    const st = save.nodes[node.id]?.st; if (st !== 'done' && st !== 'skipped') continue;
    if (!node.items.every((i) => isBuilt(i.fam))) continue;
    for (const e of node.items) {
      const tag = META[e.fam]?.tag ?? null; const ts = tag ? save.tags[tag] : undefined;
      const weight = 1 + 3 * missRate(save, tag) + (ts && !ts.mastered ? 0.5 : 0) + (ts?.shaky ? 1 : 0);
      out.push({ fam: e.fam, band: bandAt(node, e, Math.max(0, e.count - 1)), ask: e.ask, knobs: knobsOf(e), node: node.id, zone: zoneOfNode(node), di: node.di, weight });
    }
  }
  return out;
}
/** Starter pool for a save that has passed nothing yet (never reached from the map, but the function stays total). */
function starterPool(): PoolEntry[] {
  const out: PoolEntry[] = [];
  for (const z of Object.keys(MAIN_ORDER) as ZoneId[]) { const n = NODE_BY_ID[MAIN_ORDER[z][0]]; if (!n || n.kind === 'calib' || !n.items.every((i) => isBuilt(i.fam))) continue; for (const e of n.items) out.push({ fam: e.fam, band: bandAt(n, e, 0), ask: e.ask, knobs: knobsOf(e), node: n.id, zone: z, di: n.di, weight: 1 }); }
  return out;
}

export function composeSet(save: MarsSaveV5, seed: string, opts: { n?: number } = {}): MissionPlan {
  const n = opts.n ?? CHALLENGE_SIZE; const rng = createRng(`challenge:${save.salt}:${seed}`);
  const base = learnedPool(save); const pool = base.length ? base : starterPool();
  const picked: PoolEntry[] = []; const famN = new Map<string, number>(); const zoneN = new Map<string, number>(); const used = new Set<string>();
  const zoneCap = Math.max(2, Math.ceil(n / 2));
  for (let i = 0; i < n && pool.length; i++) {
    const keyOf = (e: PoolEntry) => `${e.fam}|${e.band}|${e.ask ?? ''}`;
    let cand = pool.filter((e) => !used.has(keyOf(e)) && (famN.get(e.fam) ?? 0) < 2 && (zoneN.get(e.zone) ?? 0) < zoneCap);   // variety first …
    if (!cand.length) cand = pool.filter((e) => (famN.get(e.fam) ?? 0) < 3);                                                      // … then relax the caps, never the pool
    if (!cand.length) cand = pool;
    const total = cand.reduce((s, e) => s + e.weight, 0); let r = rng.next() * total; let pick = cand[cand.length - 1];
    for (const e of cand) { r -= e.weight; if (r <= 0) { pick = e; break; } }
    picked.push(pick); used.add(keyOf(pick)); famN.set(pick.fam, (famN.get(pick.fam) ?? 0) + 1); zoneN.set(pick.zone, (zoneN.get(pick.zone) ?? 0) + 1);
  }
  picked.sort((a, b) => a.di - b.di);   // a ramp: the easiest first, the hardest last
  const node = `challenge.${seed}`;
  const slots: SlotPlan[] = picked.map((e, i) => ({ kind: 'main', fam: e.fam, band: e.band, ask: e.ask, knobs: e.knobs, mode: 'normal', node, mainIdx: i }));
  return { node, kind: 'challenge', slots, seedBase: `${save.salt}:${node}` };
}
/** the seed of the next challenge of this save */
export const nextChallengeSeed = (save: MarsSaveV5): string => `${save.session.missions}.${save.challenge?.plays ?? 0}`;
