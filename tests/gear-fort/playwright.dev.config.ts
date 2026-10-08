/**
 * Run 机关守城's browser tests against a running dev server (no build):
 *   npx vite --port 5311 --strictPort   (in another shell)
 *   npx playwright test -c tests/gear-fort/playwright.dev.config.ts [-g <pattern>] [--project=portrait-810x1080]
 * Same projects as the platform smoke config (WebKit, iPad 9 sizes, DPR 2, touch, one worker). The page loads the
 * kit, so it is auto-muted under automation.
 */
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
process.env.KG_SHOTS_DIR ??= path.join(os.homedir(), 'kid-games-work/shots/gear-fort');
const ipad = { deviceScaleFactor: 2, isMobile: true, hasTouch: true } as const;

export default defineConfig({
  testDir: path.join(ROOT, 'site/gear-fort/tests'),
  outputDir: path.join(os.homedir(), 'kid-games-work/test-results/gear-fort'),
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 8_000 },
  reporter: [['list']],
  use: { baseURL: `http://localhost:${process.env.GF_PORT || 5311}`, browserName: 'webkit', locale: 'zh-CN', timezoneId: 'Asia/Shanghai', trace: 'off', video: 'off', screenshot: 'off' },
  // iPads run every spec but phone.spec; the phones (Dad's phone, 2026-10-08) run phone.spec + skip.spec:
  // upright → 把手机横过来玩, landscape 844×390 / 667×375 → the phone layout
  projects: [
    { name: 'portrait-810x1080', testIgnore: /phone\.spec/, use: { ...ipad, viewport: { width: 810, height: 1080 } } },
    { name: 'landscape-1080x810', testIgnore: /phone\.spec/, use: { ...ipad, viewport: { width: 1080, height: 810 } } },
    { name: 'phone-iphone13', testMatch: /(phone|skip)\.spec/, use: { ...devices['iPhone 13'], browserName: 'webkit' } },
    { name: 'phone-iphonese', testMatch: /(phone|skip)\.spec/, use: { ...devices['iPhone SE'], browserName: 'webkit' } },
    { name: 'phone-land-844x390', testMatch: /(phone|skip)\.spec/, use: { ...devices['iPhone 13'], browserName: 'webkit', viewport: { width: 844, height: 390 } } },
    { name: 'phone-land-667x375', testMatch: /(phone|skip)\.spec/, use: { ...devices['iPhone SE'], browserName: 'webkit', viewport: { width: 667, height: 375 } } },
  ],
});
