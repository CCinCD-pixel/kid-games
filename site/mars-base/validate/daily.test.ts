import { describe, expect, it } from 'vitest';
import { simulate } from './lib/sim';
import { canCheck, composeDaily } from '../src/app/daily';
import { beginMission, dealNext, deliver, endMission, missionMatches, resumeMission } from '../src/app/mission';
import { defaultSave, type MarsSaveV5 } from '../src/save/schema';
import { family, META } from '../src/families';
import { judge } from '../src/app/judge';
import { dueTags } from '../src/app/adaptive';

const learned = (): MarsSaveV5 => (simulate('daily-learned', 'strong', { visits: 45 }) as { save: MarsSaveV5 }).save;
const base = learned();
const copy = (s: MarsSaveV5): MarsSaveV5 => structuredClone(s);

describe('设备检修', () => {
  it('opens only after real work and four encountered tags', () => {
    expect(canCheck(defaultSave(1))).toBe(false);
    expect(canCheck(base)).toBe(true);
  });
  it('plans six deterministic, varied questions from learned tags and prioritizes later reviews', () => {
    const a = composeDaily(base); const b = composeDaily(base);
    expect(a).toEqual(b);
    expect(a.plan.kind).toBe('check'); expect(a.picks).toHaveLength(6);
    const counts = new Map<string, number>();
    for (let i = 0; i < 6; i++) {
      const p = a.picks[i];
      expect(base.tags[p.tag]).toBeDefined();
      expect(META[p.fam]?.tag).toBe(p.tag);
      if (i) expect(p.tag).not.toBe(a.picks[i - 1].tag);
      counts.set(p.tag, (counts.get(p.tag) ?? 0) + 1);
    }
    expect(Math.max(...counts.values())).toBeLessThanOrEqual(2);
    const another = copy(base); another.session.lastActiveAt += 30 * 86_400_000;
    expect(composeDaily(another).picks.filter((p) => p.role === 'R').length).toBeGreaterThanOrEqual(a.picks.filter((p) => p.role === 'R').length);
  });
  it('resumes its saved picks, pays once, leaves nodes alone, and increments the sequence at completion', () => {
    const save = copy(base); const nodes = JSON.stringify(save.nodes); const seq = save.daily.runSeq;
    const run = beginMission(save, 'check', save.session.index, 100, { check: true });
    expect(missionMatches(save, { nodeId: 'check', check: true })).toBe(true);
    expect(save.daily.run).not.toBeNull();
    let n = 0;
    for (;;) {
      const item = dealNext(save, run, 101 + n);
      if (!item) break;
      if (n === 3) expect(resumeMission(copy(save))?.plan.slots).toEqual(run.plan.slots);
      const f = family(item.fam);
      expect(judge(f, item.params as never, f.oracle(item.params as never, item.ask), item.ask).ok).toBe(true);
      deliver(save, run, item, { firstTry: true, misses: 0, hint: 0, assisted: false, ok: true }, 101 + n);
      n++;
    }
    const summary = endMission(save, run, 999, 'deviceA');
    expect(summary.check).toEqual({ n: 6, firstTry: 6, coins: 16 });
    expect(save.daily.runSeq).toBe(seq + 1);
    expect(save.daily.run).toBeNull(); expect(save.mission).toBeNull();
    expect(save.eco.pending.at(-1)).toEqual({ id: `ck:deviceA.${(seq + 1).toString(36)}`, kind: 'earn', amount: 16, src: 'check.run', ref: String(seq + 1) });
    expect(JSON.stringify(save.nodes)).toBe(nodes);
  });
  it('uses calendar days for newly mastered tags while old saves retain their visit schedule', () => {
    const save = defaultSave(3); const now = Date.UTC(2026, 9, 23);
    save.session.lastActiveAt = now;
    save.tags['demo'] = { level: 3, streak: 0, window: '11111111', tailNoHint: 3, mastered: true, reviews: [2], reviewAt: [Math.floor(now / 86_400_000) + 1], repDown: 0, wrongRun: 0 };
    expect(dueTags(save, 20)).toEqual([]);
    save.session.lastActiveAt += 86_400_000;
    expect(dueTags(save, 20)).toEqual(['demo']);
    delete save.tags.demo.reviewAt;
    expect(dueTags(save, 20)).toEqual(['demo']);
  });
});
