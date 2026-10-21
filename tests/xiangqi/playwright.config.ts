// 楚河棋院端到端（WebKit）。端口 5321（dev server 复用）；一次一个 worker。运行：npx playwright test -c tests/xiangqi/playwright.config.ts
import os from 'node:os';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

export const SHOTS_DIR = path.join(os.homedir(), 'kid-games-work', 'shots', 'rr', 'xiangqi');
export default defineConfig({
  testDir: '.', testMatch: '**/*.spec.ts', timeout: 90_000, workers: 1, retries: 0, reporter: [['list']],
  use: { baseURL: 'http://localhost:5321', trace: 'off', locale: 'zh-CN' },
  webServer: { command: 'npx vite --port 5321 --strictPort', url: 'http://localhost:5321/xiangqi/', reuseExistingServer: true, timeout: 60_000, cwd: process.cwd() },
  projects: [
    { name: 'ipadP', use: { ...devices['iPad (gen 7)'], viewport: { width: 810, height: 1080 } } },
    { name: 'ipadL', use: { ...devices['iPad (gen 7)'], viewport: { width: 1080, height: 810 } } },
    { name: 'phoneP', use: { ...devices['iPhone 13'], viewport: { width: 390, height: 664 } } },
    { name: 'se', use: { ...devices['iPhone SE'], viewport: { width: 320, height: 568 } } },
    { name: 'phoneL', use: { ...devices['iPhone 13'], viewport: { width: 844, height: 390 } } },
  ],
});
