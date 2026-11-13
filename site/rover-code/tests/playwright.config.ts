import { defineConfig } from '@playwright/test';
import base from '../../../tests/smoke/playwright.config';
export default defineConfig({
  ...base,
  testDir: '.',
  testMatch: /(play|walk|round1)\.spec\.ts$/,
  projects: [
    ...base.projects!,
    { name: 'phone-390x664', use: { viewport: { width: 390, height: 664 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } },
    { name: 'phone-844x390', use: { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } },
  ],
});
