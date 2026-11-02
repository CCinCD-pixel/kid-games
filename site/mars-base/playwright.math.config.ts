/**
 * Browser matrix for the arithmetic station (spec mars-arithmetic-v2 §7.4): WebKit, one worker, five viewports.
 *   MATH_BASE_URL=http://localhost:5326 npx playwright test -c site/mars-base/playwright.math.config.ts            (dev server)
 *   npm run build && npx playwright test -c site/mars-base/playwright.math.config.ts --project=ipad-p              (serves dist/ via vite preview)
 * Screenshots: ~/kid-games-work/shots/math-v2/<project>/ (MATH_SHOTS=0 to skip).
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = Number(process.env.MATH_PORT || 5326);
const EXTERNAL = process.env.MATH_BASE_URL;
const touch = { deviceScaleFactor: 2, isMobile: true, hasTouch: true } as const;
const size = (width: number, height: number) => ({ use: { ...touch, viewport: { width, height } } });

export default defineConfig({
  testDir: path.join(ROOT, 'site/mars-base/tests'),
  testMatch: /.*\.e2e\.ts$/,
  outputDir: path.join(ROOT, 'test-results/math-v2'),
  fullyParallel: false, workers: 1, retries: 0, timeout: 90_000, expect: { timeout: 8_000 },
  reporter: [['list']],
  use: { baseURL: EXTERNAL ?? `http://localhost:${PORT}`, browserName: 'webkit', locale: 'zh-CN', timezoneId: 'Asia/Shanghai', trace: 'off', video: 'off', screenshot: 'off' },
  projects: [
    { name: 'ipad-p', ...size(810, 1080) },
    { name: 'ipad-l', ...size(1080, 810) },
    { name: 'phone-390x664', ...size(390, 664) },
    { name: 'se-320x568', ...size(320, 568) },
    { name: 'phone-l-844x390', ...size(844, 390) },
  ],
  webServer: EXTERNAL ? undefined : { command: `npx vite preview --port ${PORT} --strictPort`, cwd: ROOT, url: `http://localhost:${PORT}/mars-base/`, reuseExistingServer: false, timeout: 30_000, stdout: 'ignore' },
});
