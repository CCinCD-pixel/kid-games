import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const ROOT = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@kit': path.join(ROOT, 'kit'),
      '@engines': path.join(ROOT, 'engines'),
    },
  },
  test: {
    // Pure-logic tests run in Node (no DOM emulation dependency). Anything that needs a real
    // browser is covered by the WebKit smoke tests (tests/smoke).
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'kit/**/*.test.ts', 'engines/**/*.test.ts', 'site/**/*.test.ts'],
    // One worker pool, few threads: this machine is shared with other agents (RESOURCE RULES).
    pool: 'threads',
    maxWorkers: 2,
  },
});
