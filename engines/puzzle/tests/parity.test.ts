/**
 * Parity with the spec prototype (spec §8.10): for every shipped push level, the production engine
 * explores the same push-states with the same togo and detector type as sokoban.mjs — compared via
 * the committed fixture digests (fixtures/sokoban-v1.json = the prototype's fixtures.mjs output).
 */
import { describe, expect, it } from 'vitest';
import { levelDigest } from '../src/analyze';
import { BIG, FULL, contentLevels, readJson } from './helpers';

const fixtures = readJson<{ levels: Record<string, { states: number; truncated: boolean; startTogo: number; dead: number; flagged: Record<string, number>; digest: number }> }>('engines/puzzle/tests/fixtures/sokoban-v1.json');
const expanded = readJson<typeof fixtures>('engines/puzzle/tests/fixtures/sokoban-expanded.json');

describe('parity with the prototype fixtures', () => {
  it('the expansion baseline covers exactly the new 32 levels', () => {
    expect(Object.keys(expanded.levels).sort()).toEqual(contentLevels().filter((level) => Number(level.ch) >= 5 && Number(level.ch) <= 8).map((level) => level.id).sort());
    expect(Object.keys(expanded.levels).some((id) => id in fixtures.levels)).toBe(false);
  });
  for (const L of contentLevels()) {
    const run = BIG.has(L.id) && !FULL ? it.skip : it;
    run(`${L.id}: states, togo, dead, detector types, digest`, () => {
      const want = fixtures.levels[L.id] ?? expanded.levels[L.id];
      expect(want, `fixture for ${L.id}`).toBeTruthy();
      const got = levelDigest(L.map);
      expect(got).toEqual(want);
    }, 60_000);
  }
});
