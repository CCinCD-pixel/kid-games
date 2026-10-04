/**
 * WebKit smoke tests at iPad 9th-gen sizes. Run with `npm run test:smoke` (builds first, then serves
 * dist/ with `vite preview`; Playwright stops the server when done).
 *
 * RESOURCE RULES: one worker = one browser at a time. Screenshots go to
 * ~/kid-games-work/shots/foundation/<project>/ (override with KG_SHOTS_DIR).
 */
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = Number(process.env.KG_SMOKE_PORT || 4179);
export const SHOTS_DIR = process.env.KG_SHOTS_DIR || path.join(os.homedir(), 'kid-games-work/shots/foundation');

const ipad = { deviceScaleFactor: 2, isMobile: true, hasTouch: true } as const;

export default defineConfig({
  testDir: '.',
  outputDir: path.join(ROOT, 'test-results/smoke'),
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 8_000 },
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    browserName: 'webkit',
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    trace: 'off',
    video: 'off',
    screenshot: 'off',
  },
  projects: [
    { name: 'portrait-810x1080', use: { ...ipad, viewport: { width: 810, height: 1080 } } },
    { name: 'landscape-1080x810', use: { ...ipad, viewport: { width: 1080, height: 810 } } },
  ],
  webServer: {
    command: `npx vite preview --port ${PORT} --strictPort`,
    cwd: ROOT,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: false,
    timeout: 30_000,
    stdout: 'ignore',
  },
});
