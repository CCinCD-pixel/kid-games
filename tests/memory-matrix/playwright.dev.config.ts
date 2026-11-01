// Runs site/memory-matrix/tests/*.spec.ts against the Vite dev server (port 5324, started with `npx vite --port 5324 --strictPort`).
// Shots: KG_SHOTS_DIR=~/kid-games-work/shots/rr/memory npx playwright test -c tests/memory-matrix/playwright.dev.config.ts
// (the platform smoke config in tests/smoke serves a production build and picks the same spec files up as well)
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '../../site/memory-matrix/tests', testMatch: /.*\.spec\.ts$/, workers: 1, retries: 0, timeout: 90_000, expect: { timeout: 8_000 }, reporter: [['list']],
  use: { baseURL: 'http://localhost:5324', browserName: 'webkit', locale: 'zh-CN', trace: 'off', video: 'off', screenshot: 'off' },
  projects: [{ name: 'dev-5324' }],
});
