/**
 * 火星基地 browser matrix (spec §8.7 / §9 V10): six acceptance viewports + four injected real-device inset projects (kit `?safe=`),
 * one WebKit at a time. Serves the SCOPED production bundle by default (see tools/mars-base/vite.scoped.config.ts); set MARS_BASE_URL
 * to test against a running dev server instead.
 *   MARS_BASE_URL=http://localhost:5323 npx playwright test -c site/mars-base/playwright.mars.config.ts
 *   npx playwright test -c site/mars-base/playwright.mars.config.ts --project=ipad-l layout
 * Shots: ~/kid-games-work/shots/rr/mars/e2e/<project>/ (MARS_SHOTS=0 to skip). Reports of the audit: ~/kid-games-work/state/rr/e2e/.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = Number(process.env.MARS_PORT || 5323);
const EXTERNAL = process.env.MARS_BASE_URL;
const touch = { deviceScaleFactor: 2, isMobile: true, hasTouch: true } as const;
const { defaultBrowserType: _a, ...iphone13 } = devices['iPhone 13']; const { defaultBrowserType: _b, ...iphoneSE } = devices['iPhone SE'];
const phone = (w: number, h: number, base: object, safe?: string) => ({ use: { ...base, viewport: { width: w, height: h } }, metadata: { safe } });

export default defineConfig({
  testDir: path.join(ROOT, 'site/mars-base/e2e'),
  testMatch: /.*\.spec\.ts$/,
  outputDir: path.join(ROOT, 'test-results/mars'),
  fullyParallel: false, workers: 1, retries: 0, timeout: 60_000, expect: { timeout: 8_000 },
  reporter: [['list']],
  use: { baseURL: EXTERNAL ?? `http://localhost:${PORT}`, browserName: process.env.MARS_ENGINE === 'chromium' ? 'chromium' : 'webkit', locale: 'zh-CN', timezoneId: 'Asia/Shanghai', trace: 'off', video: 'off', screenshot: 'off' },
  projects: [
    { name: 'ipad-p', ...phone(810, 1080, touch) },
    { name: 'ipad-l', ...phone(1080, 810, touch) },
    { name: 'phone-p', ...phone(390, 664, iphone13) },
    { name: 'se', ...phone(320, 568, iphoneSE) },
    { name: 'phone-l', ...phone(844, 390, { ...iphone13, viewport: undefined }) },
    // injected insets (WebKit under Playwright has no env(safe-area-inset-*)): top,right,bottom,left
    { name: 'phone-l-inset', ...phone(844, 390, iphone13, '0,47,21,47') },
    { name: 'phone-pwa-p', ...phone(390, 844, iphone13, '47,0,34,0') },
    { name: 'ipad-p-inset', ...phone(810, 1080, touch, '24,0,20,0') },
    { name: 'ipad-l-inset', ...phone(1080, 810, touch, '24,0,20,0') },
  ],
  webServer: EXTERNAL ? undefined : {
    command: `npx vite preview --config tools/mars-base/vite.scoped.config.ts --port ${PORT} --strictPort`,
    cwd: ROOT, url: `http://localhost:${PORT}/mars-base/`, reuseExistingServer: false, timeout: 30_000, stdout: 'ignore',
  },
});
