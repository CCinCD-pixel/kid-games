/**
 * Run 贪吃蛇大作战's browser tests against a running dev server (no build):
 *   npx vite --port 5304 --strictPort   (in another shell)
 *   npx playwright test -c tests/snake-battle/playwright.dev.config.ts [-g <pattern>] [--project=portrait-810x1080]
 * Same projects as the platform smoke config (WebKit, iPad 9 sizes, DPR 2, touch, one worker).
 */
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
process.env.KG_SHOTS_DIR ??= path.join(os.homedir(), 'kid-games-work/shots/snake-battle');
const ipad = { deviceScaleFactor: 2, isMobile: true, hasTouch: true } as const;

export default defineConfig({
  testDir: path.join(ROOT, 'site/snake-battle/tests'),
  outputDir: path.join(os.homedir(), 'kid-games-work/test-results/snake-battle'),
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 8_000 },
  reporter: [['list']],
  use: { baseURL: `http://localhost:${process.env.SB_PORT || 5304}`, browserName: 'webkit', locale: 'zh-CN', timezoneId: 'Asia/Shanghai', trace: 'off', video: 'off', screenshot: 'off' },
  projects: [
    { name: 'portrait-810x1080', use: { ...ipad, viewport: { width: 810, height: 1080 } } },
    { name: 'landscape-1080x810', use: { ...ipad, viewport: { width: 1080, height: 810 } } },
  ],
});
