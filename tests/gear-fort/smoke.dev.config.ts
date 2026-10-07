/**
 * The platform smoke (tests/smoke/smoke.spec.ts) run against the gear-fort dev server instead of a built preview —
 * for checking the registry's smoke.waitFor without the root build (QA r3 tech major):
 *   npx vite --port 5311 --strictPort &   npx playwright test -c tests/gear-fort/smoke.dev.config.ts -g gear-fort
 */
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
process.env.KG_SHOTS_DIR ??= path.join(os.homedir(), 'kid-games-work/shots/gear-fort/smoke');
const ipad = { deviceScaleFactor: 2, isMobile: true, hasTouch: true } as const;
export default defineConfig({
  testDir: path.join(ROOT, 'tests/smoke'), testMatch: 'smoke.spec.ts',
  outputDir: path.join(os.homedir(), 'kid-games-work/test-results/gear-fort-smoke'),
  workers: 1, retries: 0, timeout: 30_000, reporter: [['list']],
  use: { baseURL: `http://localhost:${process.env.GF_PORT || 5311}`, browserName: 'webkit', locale: 'zh-CN', timezoneId: 'Asia/Shanghai' },
  projects: [
    { name: 'portrait-810x1080', use: { ...ipad, viewport: { width: 810, height: 1080 } } },
    { name: 'landscape-1080x810', use: { ...ipad, viewport: { width: 1080, height: 810 } } },
  ],
});
