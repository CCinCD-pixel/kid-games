import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = 5324;

export default defineConfig({
  testDir: path.join(ROOT, 'site/memory-matrix/tests'),
  testMatch: /.*\.spec\.ts$/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    browserName: 'webkit',
    headless: true,
    trace: 'off',
    video: 'off',
  },
  webServer: {
    command: `npx vite --host 127.0.0.1 --port ${PORT} --strictPort`,
    cwd: ROOT,
    url: `http://127.0.0.1:${PORT}/memory-matrix/`,
    reuseExistingServer: false,
    timeout: 30_000,
    stdout: 'ignore',
  },
});
