/**
 * Run the 陆战棋 browser tests against a running dev server (no build):
 *   npx vite --port 5303 --strictPort &   # from the repo root
 *   npx playwright test -c tests/military-chess/playwright.dev.config.ts
 * Same projects as tests/smoke/playwright.config.ts (WebKit, 810×1080 and 1080×810, DPR 2, touch), plus
 * phones (Dad, 2026-10-08): iPhone 13 Safari 390×664, iPhone SE 320×568 and a 844×390 landscape phone run
 * phone.spec.ts (layout audits) and feedback.spec.ts (跳过 + the 陆战棋 rule decisions).
 */
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ipad = { deviceScaleFactor: 2, isMobile: true, hasTouch: true } as const;
const PHONE = /(phone|feedback)\.spec\.ts$/;

export default defineConfig({
  testDir: path.join(ROOT, 'site/military-chess/tests'),
  testMatch: /.*\.spec\.ts$/,
  outputDir: path.join(os.homedir(), 'kid-games-work/test-results/military-chess'),
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 8_000 },
  reporter: [['list']],
  use: { baseURL: `http://localhost:${process.env.MC_PORT || 5303}`, browserName: 'webkit', locale: 'zh-CN', trace: 'off', video: 'off', screenshot: 'off' },
  projects: [
    { name: 'portrait-810x1080', testIgnore: /phone\.spec\.ts$/, use: { ...ipad, viewport: { width: 810, height: 1080 } } },
    { name: 'landscape-1080x810', testIgnore: /phone\.spec\.ts$/, use: { ...ipad, viewport: { width: 1080, height: 810 } } },
    { name: 'phone-390x664', testMatch: PHONE, use: { ...devices['iPhone 13'], deviceScaleFactor: 2, viewport: { width: 390, height: 664 } } },
    { name: 'phone-se-320x568', testMatch: PHONE, use: { ...devices['iPhone SE'], viewport: { width: 320, height: 568 } } },
    { name: 'phone-land-844x390', testMatch: PHONE, use: { ...devices['iPhone 13'], deviceScaleFactor: 2, viewport: { width: 844, height: 390 } } },
  ],
});
