// 棋盘引擎的 WebKit 端到端测试（游乐场 /dev/board/）。端口 5326；一次一个 worker（内存规则）。运行：
//   npx playwright test -c tests/board/playwright.config.ts
// 截图写到 ~/kid-games-work/shots/rr/engine-board/（人眼看过才算数）。
import os from 'node:os';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

export const SHOTS_DIR = path.join(os.homedir(), 'kid-games-work', 'shots', 'rr', 'engine-board');
export default defineConfig({
  testDir: '.', testMatch: '**/*.spec.ts', timeout: 60_000, workers: 1, retries: 0, reporter: [['list']],
  use: { baseURL: 'http://localhost:5326', trace: 'off' },
  webServer: { command: 'npx vite --port 5326 --strictPort', url: 'http://localhost:5326/dev/board/', reuseExistingServer: true, timeout: 60_000, cwd: process.cwd() },
  projects: [
    { name: 'ipadL', use: { ...devices['iPad (gen 7)'], viewport: { width: 1080, height: 810 } } },
    { name: 'ipadP', use: { ...devices['iPad (gen 7)'], viewport: { width: 810, height: 1080 } } },
    { name: 'phoneP', use: { ...devices['iPhone 13'] } },
    { name: 'phoneL', use: { ...devices['iPhone 13'], viewport: { width: 844, height: 390 } } },
  ],
});
