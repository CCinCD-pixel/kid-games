/**
 * Run 星晶消消乐's browser tests (site/emoji-match/tests/*.spec.ts) against a running dev server:
 *   npx vite --config tools/emoji-match/vite.qa.config.ts --port 5305 --strictPort   (another shell)
 *   npx playwright test -c tests/emoji-match/playwright.dev.config.ts [-g <pattern>] [--project=portrait-810x1080]
 * Phone projects (iPhone 13 / iPhone SE portrait, 844×390 landscape) run phone.spec.ts.
 * Same projects as the platform smoke config (WebKit, iPad 9 sizes, DPR 2, touch, ONE worker = one
 * browser at a time). `npm run test:smoke` runs the same files against the production build.
 */
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ipad = { deviceScaleFactor: 2, isMobile: true, hasTouch: true } as const;
// phones (Dad's feedback 2026-10-08): phone.spec.ts only — the iPad projects run every spec
const phone = { testMatch: /phone\.spec\.ts/ } as const;

export default defineConfig({
  testDir: path.join(ROOT, 'site/emoji-match/tests'),
  outputDir: path.join(os.homedir(), 'kid-games-work/test-results/emoji-match'),
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 8_000 },
  reporter: [['list']],
  use: { baseURL: `http://localhost:${process.env.EM_PORT || 5305}`, browserName: 'webkit', locale: 'zh-CN', timezoneId: 'Asia/Shanghai', trace: 'off', video: 'off', screenshot: 'off' },
  projects: [
    { name: 'portrait-810x1080', use: { ...ipad, viewport: { width: 810, height: 1080 } } },
    { name: 'landscape-1080x810', use: { ...ipad, viewport: { width: 1080, height: 810 } } },
    { name: 'phone-portrait-390x664', ...phone, use: { ...devices['iPhone 13'], browserName: 'webkit' } },
    { name: 'phone-se-320x568', ...phone, use: { ...devices['iPhone SE'], browserName: 'webkit' } },
    { name: 'phone-landscape-844x390', ...phone, use: { userAgent: devices['iPhone 13'].userAgent, viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true } },
  ],
});
