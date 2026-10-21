/** QA fix-mars-r1 P2: every mission kind resumes after a reload (the saved mission round-trips through JSON and continues at the same item). */
import { describe, expect, it } from 'vitest';
import { defaultSave, type MarsSaveV5 } from '../src/save/schema';
import { beginMission, dealNext, deliver, missionMatches, resumeMission } from '../src/app/mission';
import { NODES, NODE_BY_ID, PROBES, CARDS, MAIN_ORDER, zoneOfNode } from '../src/app/content';
import { isBuilt } from '../src/families';
import type { CardId } from '../src/app/types';

const reload = (s: MarsSaveV5): MarsSaveV5 => JSON.parse(JSON.stringify(s));
const answerAll = (s: MarsSaveV5, run: ReturnType<typeof beginMission>, k: number) => {
  for (let i = 0; i < k; i++) { const it = dealNext(s, run, 1000 + i); if (!it) break; deliver(s, run, it, { firstTry: true, misses: 0, hint: 0, assisted: false, ok: true, ops: 3 }, 1000 + i); }
};

describe('mission resume (all kinds)', () => {
  it('probe: missionMatches uses the zone, and the reload continues at the next item with the same results', () => {
    let tested = 0;
    for (const zone of Object.keys(PROBES).filter((z) => PROBES[z].items.every((i) => isBuilt(i.fam)))) {
      tested++;
      const first = MAIN_ORDER[zone as 'vault']?.[0]; if (!first) continue;
      const s = defaultSave(1); s.session.index = 1;
      const run = beginMission(s, first, 1, 1, { probe: true });
      answerAll(s, run, 2);
      const s2 = reload(s);
      expect(missionMatches(s2, { nodeId: first, probe: true }), zone).toBe(true);
      expect(missionMatches(s2, { nodeId: first }), `${zone}: a plain node request must not take over a probe`).toBe(false);
      const r2 = resumeMission(s2)!; expect(r2, zone).not.toBeNull();
      expect(r2.results.length).toBe(2); expect(r2.plan.kind).toBe('probe');
      const next = dealNext(s2, r2, 2000)!; expect(next.probeIdx ?? r2.idx - 1).toBeGreaterThanOrEqual(1);   // not item 0 again
    }
    expect(tested).toBeGreaterThanOrEqual(2);   // vault + factory (the balance probe waits for the balance round)
  });
  it('wall (一起验货): resumes with its answers', () => {
    const s = defaultSave(2); s.session.index = 1; const cards: CardId[] = [...CARDS];
    const run = beginMission(s, 'cert.wall', 1, 1, { wall: cards }); answerAll(s, run, 5);
    const s2 = reload(s); expect(missionMatches(s2, { nodeId: 'cert.wall', wall: cards })).toBe(true);
    const r2 = resumeMission(s2)!; expect(r2.results.length).toBe(5); expect(r2.certAnswers.length).toBe(5);
  });
  it('every playable node (main, boss, calibration, remedial): missionMatches + resume keep the dealt items and results', () => {
    let n = 0;
    for (const node of NODES.filter((x) => x.items.every((i) => isBuilt(i.fam)))) {
      const s = defaultSave(3); s.session.index = 2;
      const run = beginMission(s, node.id, 2, 1, { noWarm: false }); answerAll(s, run, 3);
      const s2 = reload(s);
      expect(missionMatches(s2, { nodeId: node.id }), node.id).toBe(true);
      expect(missionMatches(s2, { nodeId: node.id, probe: true }), node.id).toBe(false);
      const r2 = resumeMission(s2)!; expect(r2, node.id).not.toBeNull();
      expect(r2.results.length, node.id).toBe(3); expect(r2.plan.node, node.id).toBe(node.id);
      const keys = new Set(r2.results.map((r) => r.keyHash)); const nx = dealNext(s2, r2, 3000);
      if (nx) expect(keys.has(nx.key), `${node.id}: no repeat`).toBe(false);
      n++; void zoneOfNode;
    }
    expect(n).toBeGreaterThan(40);
  });
  it('a request for another node does not resume the saved one', () => {
    const s = defaultSave(4); s.session.index = 1; beginMission(s, 'orbit.O1.0', 1, 1);
    expect(missionMatches(reload(s), { nodeId: 'orbit.O1.1' })).toBe(false);
    expect(NODE_BY_ID['orbit.O1.0']).toBeTruthy();
  });
});
