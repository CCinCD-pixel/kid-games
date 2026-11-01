import { describe, expect, it } from 'vitest';
import { MemoryStorage } from '../../../tests/helpers/memory-storage';
import type { ItemResult } from '../src/app/types';
import { readStarMetrics, recordStarSet, summarizeStarSet } from '../src/app/starPetMetrics';

const results = (ms: number, correct: number, n = 8): ItemResult[] => Array.from({ length: n }, (_, i) => ({
  keyHash: String(i), fam: 'count', tag: 'count', level: 1, firstTry: i < correct, misses: i < correct ? 0 : 1,
  hint: 0, slot: 'main', at: 1, node: 'O1.1', ms,
}));

describe('star pet learning metrics', () => {
  it('flags only quick groups with low first-try accuracy without changing rewards', () => {
    const slow = summarizeStarSet('slow', 1, 'mission', results(32_000, 8), []);
    expect(slow.flagged).toBe(false);
    expect(summarizeStarSet('quick-accurate', 2, 'mission', results(9_000, 8), [slow]).flagged).toBe(false);
    expect(summarizeStarSet('quick-struggling', 3, 'mission', results(9_000, 3), [slow]).flagged).toBe(true);
    expect(summarizeStarSet('slow-struggling', 4, 'mission', results(25_000, 3), [slow]).flagged).toBe(false);
  });

  it('excludes new-element introductions and demonstrated questions from the fast signal', () => {
    const fewer = results(5_000, 1, 7);
    expect(summarizeStarSet('intro', 1, 'mission', fewer, [], true).flagged).toBe(false);
    const assisted = results(5_000, 1);
    assisted[0]!.assisted = true; assisted[1]!.assisted = true; assisted[2]!.assisted = true;
    expect(summarizeStarSet('help', 1, 'mission', assisted, []).flagged).toBe(false);
  });

  it('deduplicates a completed group and bounds the local record', () => {
    const storage = new MemoryStorage();
    for (let i = 0; i < 25; i++) recordStarSet(storage, String(i), i, 'check', results(30_000, 7));
    recordStarSet(storage, '24', 25, 'check', results(4_000, 0));
    const groups = readStarMetrics(storage).groups;
    expect(groups).toHaveLength(20);
    expect(groups[0]!.id).toBe('5');
    expect(groups.at(-1)!.flagged).toBe(false);
  });
});
