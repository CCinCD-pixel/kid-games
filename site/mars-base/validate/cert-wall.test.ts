/** 徽章墙 "一起验货" (spec §3.6): one mission verifies every unlit card; per-card outcomes use the same evaluateCert as the embedded flow. */
import { describe, expect, it } from 'vitest';
import { beginMission, dealNext, deliver, endMission } from '../src/app/mission';
import { defaultSave } from '../src/save/schema';
import { CARDS } from '../src/app/content';

function play(wrong: (n: number, card: string | undefined) => boolean) {
  const save = defaultSave(0); save.onboarded = true; save.session.index = 4;
  const run = beginMission(save, 'cert.wall', 4, 1, { wall: [...CARDS] });
  let n = 0, it; const per: Record<string, number> = {};
  while ((it = dealNext(save, run, 1))) {
    const card = it.card; per[card ?? '?'] = (per[card ?? '?'] ?? 0) + 1;
    const ok = !wrong(n++, card);
    deliver(save, run, it, { firstTry: ok, misses: ok ? 0 : 1, hint: 0, assisted: false, ok, ops: 1 }, 1);
  }
  const sum = endMission(save, run, 2);
  return { save, sum, per, items: n };
}
describe('徽章墙 一起验货', () => {
  it('12 items, one attempt each, all right → all three badges lit', () => {
    const { save, sum, per, items } = play(() => false);
    expect(items).toBe(12); expect(per).toEqual({ C1: 4, C2: 4, C3: 4 });
    expect(sum.certs!.map((c) => c.outcome.state)).toEqual(['lit', 'lit', 'lit']); expect(CARDS.every((c) => save.cert[c].state === 'lit')).toBe(true); expect(save.mission).toBeNull(); expect(sum.node).toBeNull();
  });
  it('exactly one wrong in C2 → two extra C2 items; C1/C3 untouched', () => {
    let hitC2 = 0; const { sum, per, save } = play((_, card) => card === 'C2' && hitC2++ === 0);
    expect(per.C2).toBe(6); expect(per.C1).toBe(4); expect(per.C3).toBe(4);
    expect(sum.certs!.map((c) => [c.card, c.outcome.state])).toEqual([['C1', 'lit'], ['C2', 'lit'], ['C3', 'lit']]); expect(save.cert.C2.state).toBe('lit');
  });
  it('two wrong in C3 → half-lit, the other two lit', () => {
    let c3 = 0; const { sum } = play((_, card) => card === 'C3' && c3++ < 2);
    expect(sum.certs!.map((c) => c.outcome.state)).toEqual(['lit', 'lit', 'half']);
  });
  it('a refresh in the middle resumes the wall mission', async () => {
    const { resumeMission } = await import('../src/app/mission');
    const save = defaultSave(0); const run = beginMission(save, 'cert.wall', 4, 1, { wall: [...CARDS] }); const a = dealNext(save, run, 1)!;
    const back = resumeMission(save)!; expect(back.plan.kind).toBe('wall'); expect(back.queue[0].key).toBe(a.key);
  });
});
