/** `?test=1` (webdriver or localhost only): inspection + fast-forward for Playwright (spec §8.7). Lazy chunk; the shipped app never loads it. */
import type { App } from '../screens/app';
import { NODE_BY_ID, NODES } from '../app/content';
import { decodedBytes } from '@kit/audio';
import { defaultSave } from '../save/schema';
import { renderParent, showArchive, showBadges, showBuild } from '../screens/extra';
import { updateBase } from '../app/base';
import { STAGE_READY, mountStage } from '../stages';
import { dealItem, planMission } from '../app/planMission';
import { family } from '../families';
import type { Item } from '../app/types';

/**
 * V11 stage soak: one dealt item for every distinct operating surface (family | ask | typed | buildFirst | tray level) any ready node can deal, at levels 1 and 4.
 * `stageCycles(sig, n)` mounts that stage into a host, pokes it the way a child does (resize, the three hints, lock, feedback), destroys it and removes the host,
 * n times in a row, synchronously; the soak spec counts DOM nodes / listeners before and after (e2e/soak.spec.ts).
 */
let stageCache: Map<string, Item> | null = null;
/** where each signature was first dealt: the node, the slot index and the ladder level (touch-sweep.mjs plays exactly that slot) */
const stageWhere = new Map<string, { node: string; idx: number; level: number; plan: ReturnType<typeof planMission> }>();
function stageSamples(app: App): Map<string, Item> {
  if (stageCache) return stageCache;
  const out = new Map<string, Item>(); stageCache = out;
  for (const id of NODES.filter((n) => n.items.every((i) => STAGE_READY(i.fam))).map((n) => n.id)) {
    const plan = planMission(app.save, id, 1, { noWarm: true });
    plan.slots.forEach((slot, idx) => {
      // a tagless family (no ladder) is only ever dealt at its fixed level 3 / a cert slot's level 4, never at level 1: its `hands|lo` / `lo` signatures cannot occur in real play (QA fix-mars-r2: 5 dead signatures, validate/dead-sigs.test.ts)
      for (const level of family(slot.fam).tag ? [1, 4] : [4]) {
        const it = dealItem(app.save, plan, idx, new Set(), 0, { ...slot, level });
        const sig = [it.fam, it.ask ?? '', it.typed ? 'typed' : '', it.buildFirst ? 'hands' : '', it.level <= 2 ? 'lo' : 'hi'].join('|');
        if (!out.has(sig)) { out.set(sig, it); stageWhere.set(sig, { node: id, idx, level, plan }); }
      }
    });
  }
  return out;
}
export function installTestHook(app: App): void {
  const w = window as any;
  w.__mars = {
    app, get save() { return app.save; },
    /** replace the whole save (salt 0) and show the map */
    setSave(patch: Record<string, unknown>) { Object.assign(app.save, defaultSave(0), patch); app.save.session.index = Math.max(1, app.save.session.index); app.saveNow(); app.goMap(); },
    start(nodeId: string) { void app.runNode(nodeId); },
    goMap() { app.goMap(); }, badges() { showBadges(app); }, archive() { showArchive(app); }, parent() { renderParent(app); },
    build(ev: any, site: any) { return showBuild(app, ev, site); }, base() { return updateBase(app.save); }, chapter(zone: string) { app.showChapter(zone as any); },
    item() { return w.__marsItem?.item ?? null; }, correct() { return w.__marsItem?.correct ?? null; }, answer(v: unknown) { return w.__marsItem?.answer(v); },
    stageSigs: () => [...stageSamples(app).keys()],
    /** signature → the node that deals it first (touch-sweep.mjs picks the nodes it must visit) */
    sigWhere: () => { stageSamples(app); return Object.fromEntries([...stageWhere].map(([k, v]) => [k, { node: v.node, idx: v.idx, level: v.level }])); },
    /** A ONE-ITEM mission of exactly that signature (the slot the sampler found, at its level), started through the normal runner (resume path): same stage, same hint ladder, same twin after an assisted finish. */
    playSig(sig: string): boolean {
      stageSamples(app); const w = stageWhere.get(sig); if (!w) return false;
      const plan = JSON.parse(JSON.stringify(w.plan)) as typeof w.plan; plan.slots = [{ ...plan.slots[w.idx], level: w.level }];   // the plan the sampler saw (a copy)
      app.save.mission = { node: w.node, kind: 'node', idx: 0, items: [], results: [], startedAt: Date.now(), activeMs: 0, facts: [], seedBase: plan.seedBase, twins: 0, plan, queue: [], certAnswers: [], est: [], probeScore: 0, visit: 1 } as never;
      app.saveNow(); void app.runNode(w.node, true); return true;
    },
    /** `rounds` passes over EVERY stage signature (mount → poke → destroy once each per pass) */
    stageRounds(rounds: number): string[] { const errs = new Set<string>(); for (let r = 0; r < rounds; r++) for (const sig of stageSamples(app).keys()) this.stageCycles(sig, 1).forEach((e: string) => errs.add(e)); return [...errs]; },
    stageCycles(sig: string, n: number): string[] {
      const item = stageSamples(app).get(sig); if (!item) return [`no sample for ${sig}`];
      const errors: string[] = []; const fam = family(item.fam); const correct = fam.oracle(item.params as never, item.ask);
      for (let i = 0; i < n; i++) {
        const host = document.createElement('div'); host.className = 'mb-stage'; host.style.cssText = 'position:fixed;left:0;top:0;width:620px;height:330px;visibility:hidden'; document.body.append(host);
        try {
          const st = mountStage({ item, fam, params: item.params, host, w: 620, h: 330, hk: 330, onOp() {}, onAnswer() {}, say() {}, sfx() {} }, correct);
          st.resize(560, 300); st.hint(1, correct); st.hint(2, correct); st.hint(3, correct); st.lock(true); st.feedback?.(correct as never, correct); st.lock(false); st.collect(); st.hasAnswer(); st.destroy();
        } catch (e) { errors.push(`${sig}: ${(e as Error).message}`); } finally { host.remove(); }
      }
      return [...new Set(errors)];
    },
    node: (id: string) => NODE_BY_ID[id], nodes: () => NODES.filter((n) => n.items.every((i) => STAGE_READY(i.fam))).map((n) => n.id), unbuilt: () => NODES.filter((n) => !n.items.every((i) => STAGE_READY(i.fam))).map((n) => n.id), decodedBytes: () => decodedBytes(),
    rects() { const o: Record<string, DOMRect> = {}; for (const c of ['order', 'comm', 'stage', 'answer', 'keypad', 'tools', 'ok', 'map-btn', 'hint-btn', 'replay-btn']) { const e = document.querySelector(`.mb-${c}`); if (e) o[c] = e.getBoundingClientRect(); } return o; },
  };
}
