/**
 * Heavy 陆战棋 tools (spec §8.10): book rebuilds, self-play invariants, AI calibration and benchmarks.
 *   MC_HEAVY=1 npx vitest run -c tools/military-chess/vitest.heavy.config.ts [file filter]
 * The default vitest include never reaches tools/, and every file here is skipped without MC_HEAVY.
 * Check `memory_pressure -Q | tail -1` (≥ 25 % free) first; outputs go to ~/kid-games-work/military-chess/.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export default defineConfig({
  root: ROOT,
  resolve: { alias: { '@kit': path.join(ROOT, 'kit') } },
  test: {
    environment: 'node',
    include: ['tools/military-chess/**/*.heavy.test.ts'],
    pool: 'forks',
    maxWorkers: Number(process.env.MC_WORKERS ?? 1),
    testTimeout: 6 * 60 * 60 * 1000,
    hookTimeout: 60_000,
    reporters: ['verbose'],
  },
});
