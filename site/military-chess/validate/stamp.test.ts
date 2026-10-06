/**
 * Content stamp (spec §8.11, review D1): the books and solutions were rebuilt and checked with the
 * current rules / solver / policy. When any of those source files changed since, this fails and asks
 * for the heavy check: `MC_HEAVY=1 npx vitest run -c tools/military-chess/vitest.heavy.config.ts books`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { STAMP_PATH, STAMP_SOURCES, contentFiles, hashFiles, type Stamp } from '../../../tools/military-chess/stamp';

const ROOT = path.resolve(__dirname, '../../..');

describe('content stamp (§8.11)', () => {
  test('core sources and content match the last heavy rebuild', () => {
    const file = path.join(ROOT, STAMP_PATH);
    expect(fs.existsSync(file), 'no stamp.json: run MC_HEAVY=1 … books.heavy').toBe(true);
    const stamp = JSON.parse(fs.readFileSync(file, 'utf8')) as Stamp;
    expect(hashFiles(ROOT, STAMP_SOURCES), 'core rules/solver/policy/book changed since the heavy check: run MC_HEAVY=1 npx vitest run -c tools/military-chess/vitest.heavy.config.ts books').toBe(stamp.src);
    expect(hashFiles(ROOT, contentFiles(ROOT)), 'lessons / endgames / books changed since the heavy check').toBe(stamp.content);
  });
});
