import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Separate vitest config for the (slow-ish, report-writing) pronunciation audit: `npm run`-less, see run-audit.sh.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
export default defineConfig({
  root: ROOT,
  resolve: { alias: { '@kit': path.join(ROOT, 'kit'), '@engines': path.join(ROOT, 'engines') } },
  test: { environment: 'node', include: ['site/pinyin-station/tools/audit/*.audit.ts'], pool: 'threads', maxWorkers: 1, testTimeout: 300000 },
});
