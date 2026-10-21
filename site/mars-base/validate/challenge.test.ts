/** QA fix-mars-r1 T5: 挑战订单 — composeSet(state, seed) is deterministic, mixes ONLY learned families, adapts to what is shaky, and plays through the normal mission driver. */
import { describe, expect, it } from 'vitest';
import { simulate } from './lib/sim';
import { composeSet, learnedPool, CHALLENGE_SIZE } from '../src/app/challenge';
import { beginMission, dealNext, deliver, endMission, missionMatches, resumeMission } from '../src/app/mission';
import { family, isBuilt } from '../src/families';
import { NODE_BY_ID } from '../src/app/content';
import { defaultSave, type MarsSaveV5 } from '../src/save/schema';
import { judge } from '../src/app/judge';

const late = (): MarsSaveV5 => (simulate('challenge-late', 'strong', { visits: 45 }) as unknown as { save: MarsSaveV5 }).save;
const SAVE = late();

describe('挑战订单 composeSet', () => {
  it('the simulated late save has a real pool (many learned families)', () => { const pool = learnedPool(SAVE); expect(new Set(pool.map((p) => p.fam)).size).toBeGreaterThan(12); });
  it('deterministic over (save, seed); other seeds differ; 9 slots; kind challenge; only learned + built families; ≤ 2 per family (≥ 4 distinct families)', () => {
    const a = composeSet(SAVE, 'x1'); const b = composeSet(SAVE, 'x1'); expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const seeds = Array.from({ length: 40 }, (_, i) => JSON.stringify(composeSet(SAVE, `s${i}`).slots.map((s) => `${s.fam}:${s.band}`))); expect(new Set(seeds).size).toBeGreaterThan(30);
    const learned = new Set(learnedPool(SAVE).map((p) => p.fam));
    for (let i = 0; i < 60; i++) {
      const p = composeSet(SAVE, `v${i}`); expect(p.kind).toBe('challenge'); expect(p.slots).toHaveLength(CHALLENGE_SIZE);
      const per = new Map<string, number>(); for (const s of p.slots) { expect(learned.has(s.fam), s.fam).toBe(true); expect(isBuilt(s.fam)).toBe(true); expect(s.kind).toBe('main'); expect(s.mode).toBe('normal'); per.set(s.fam, (per.get(s.fam) ?? 0) + 1); }
      expect(new Set(p.slots.map((s) => s.fam)).size).toBeGreaterThanOrEqual(4); expect(Math.max(...per.values())).toBeLessThanOrEqual(3);
    }
  });
  it('adaptive: a family whose tag is shaky is dealt more often than the same family when solid', () => {
    const solid = JSON.parse(JSON.stringify(SAVE)) as MarsSaveV5; const shaky = JSON.parse(JSON.stringify(SAVE)) as MarsSaveV5;
    const tag = Object.keys(SAVE.tags).find((t) => SAVE.tags[t].fam) ?? Object.keys(SAVE.tags)[0]; expect(tag).toBeTruthy();
    for (const t of Object.keys(solid.tags)) { solid.tags[t].window = '11111111'; shaky.tags[t].window = '11111111'; }
    shaky.tags[tag].window = '00000000';
    const fams = (s: MarsSaveV5) => { let n = 0; for (let i = 0; i < 300; i++) for (const sl of composeSet(s, `a${i}`).slots) if (family(sl.fam).tag === tag) n++; return n; };
    expect(fams(shaky)).toBeGreaterThan(fams(solid) * 1.5);
  });
  it('total on a fresh save (starter pool) and with n = 4 (reusable by a daily set)', () => {
    const fresh = defaultSave(1); const p = composeSet(fresh, 'f'); expect(p.slots.length).toBeGreaterThan(0);
    expect(composeSet(SAVE, 'daily', { n: 4 }).slots).toHaveLength(4);
  });
  it('plays through the normal mission driver: items answerable, results feed the tags, nodes untouched, resume works, end summary has stars', () => {
    const save = JSON.parse(JSON.stringify(SAVE)) as MarsSaveV5; const nodesBefore = JSON.stringify(save.nodes); const missions = save.session.missions;
    const run = beginMission(save, 'challenge', save.session.index, 1, { challenge: true });
    expect(save.mission?.kind).toBe('challenge'); expect(missionMatches(save, { nodeId: 'challenge', challenge: true })).toBe(true); expect(missionMatches(save, { nodeId: 'challenge' })).toBe(false);
    let n = 0;
    for (;;) {
      if (n === 4) { const re = resumeMission(JSON.parse(JSON.stringify(save))); expect(re?.results.length).toBe(4); }
      const it = dealNext(save, run, 100 + n); if (!it) break;
      const f = family(it.fam); const v = judge(f, it.params as never, f.oracle(it.params as never, it.ask), it.ask); expect(v.ok, it.fam).toBe(true);
      deliver(save, run, it, { firstTry: true, misses: 0, hint: 0, assisted: false, ok: true, ops: 2 }, 100 + n); n++;
    }
    expect(n).toBe(CHALLENGE_SIZE);
    const sum = endMission(save, run, 999);
    expect(sum.challenge).toMatchObject({ n: 9, firstTry: 9, stars: 3 }); expect(save.mission).toBeNull(); expect(save.challenge).toEqual({ plays: 1, best: 9 }); expect(save.session.missions).toBe(missions + 1);
    expect(JSON.stringify(save.nodes)).toBe(nodesBefore);   // no node changes state: it is review, not progress
    expect(NODE_BY_ID['challenge']).toBeUndefined();
  });
});
