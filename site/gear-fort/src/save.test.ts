// Save budget and migration (spec §8.8): the main save is ≤ 20 KB with a fully loaded fixture (all 22 levels, every
// counter pair, every page, puzzle and deck); migrate() fills every missing field and never drops data.
import { describe, expect, it } from 'vitest';
import { defaults, migrate, type SaveV1 } from './save';
import { ORDER } from './content';
import { FEARS } from './lane/tags';

function full(): SaveV1 {
  const s = defaults();
  for (const id of ORDER) { s.levels[id] = { best: 3, attempts: 99, firstTry: 'lose', wins: 40, lastAt: '2026-10-06T20:00:00.000Z' }; s.lossStreak[id] = 9; s.decks[id] = ['shooter', 'farm', 'wall', 'lobber', 'spikes', 'burner']; }
  for (const [k, cs] of Object.entries(FEARS)) { s.counters[k] = Object.fromEntries(cs.map((c) => [c, 999])); for (const c of cs) s.learned.push(`${k}>${c}`); }
  for (let i = 0; i < 15; i++) s.jinnang[`jn${i}abcdef`] = { seen: true, mastered: '2-11' };
  for (let i = 0; i < 26; i++) s.almanac[`page_${i}_xx`] = 'seen';
  for (let i = 0; i < 40; i++) s.coach.followed[`counter:kind${i}:card${i}`] = 3;
  for (let i = 0; i < 12; i++) s.puzzles[`P${i}-0${i}`] = { stars: 3, bestSpent: 999, tries: 99 };
  s.story = Array.from({ length: 12 }, (_, i) => `fort.story.${i}.end`);
  s.resume = { level: '2-11', kind: 'suspend', key: 'suspend', at: '2026-10-06T20:00:00.000Z' };
  s.kernelVersion = 'ffffffff'; s.infer = { firstSeenAt: '2-10', solvedUnaided: true };
  return s;
}

describe('save', () => {
  it('full fixture ≤ 20 KB', () => { const n = new TextEncoder().encode(JSON.stringify({ v: 1, updatedAt: Date.now(), data: full() })).length; expect(n).toBeLessThanOrEqual(20 * 1024); });
  it('migrate fills defaults and keeps data', () => {
    const m = migrate({ levels: { '1-1': { best: 2, attempts: 1, firstTry: 'win', wins: 1, lastAt: '' } }, settings: { shake: false } });
    expect(m.levels['1-1'].best).toBe(2); expect(m.settings.shake).toBe(false); expect(m.settings.speed).toBe(1); expect(m.coach.followed).toEqual({}); expect(m.resume).toBeNull();
    expect(migrate(null)).toEqual(defaults()); expect(migrate(full())).toEqual(full());
  });
});
