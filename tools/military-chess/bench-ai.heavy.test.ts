/**
 * AI speed in a real WebKit Worker (spec §8.5 node budgets, §8.6 Mac proxy: P95 × 3 ≤ the iPad budget
 * of 600 ms → P95 ≤ 200 ms on the Mac). 20 seeded mid-game positions per mode × level (1–4 + the
 * hint level), each a real `think` request to the game's Worker (window.__mc.benchAi, ?test=1).
 * Needs the dev server: `npx vite --port 5303 --strictPort` (MC_PORT to change).
 *   MC_HEAVY=1 npx vitest run -c tools/military-chess/vitest.heavy.config.ts bench-ai
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { describe, expect, test } from 'vitest';
import { webkit, devices } from '@playwright/test';

const OUT = path.join(os.homedir(), 'kid-games-work/military-chess');
const PORT = process.env.MC_PORT ?? '5303';
const pct = (xs: number[], q: number) => xs.slice().sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * q))];

describe.skipIf(!process.env.MC_HEAVY)('bench-ai (WebKit Worker)', () => {
  test('P95 per mode × level within the Mac proxy (≤ 200 ms)', async () => {
    const free = Number((execSync('memory_pressure -Q | tail -1').toString().match(/(\d+)%/) || [0, 100])[1]);
    expect(free, 'memory free ≥ 25 %').toBeGreaterThanOrEqual(25);
    const load = os.loadavg()[0];
    const browser = await webkit.launch();
    const lines: string[] = [`bench-ai ${new Date().toISOString()} — WebKit Worker, 20 positions per cell, load average ${load.toFixed(1)} on ${os.cpus().length} cores`];
    const fails: string[] = [];
    try {
      const context = await browser.newContext({ ...devices['iPad (gen 7)'], viewport: { width: 810, height: 1080 } });
      const page = await context.newPage();
      await page.goto(`http://localhost:${PORT}/military-chess/?test=1`);
      await page.waitForSelector('#app[data-ready]');
      for (const mode of ['fan', 'ming', 'an'] as const) {
        for (const level of [1, 2, 3, 4, 'hint'] as const) {
          const res = (await page.evaluate(([m, l]) => (window as any).__mc.benchAi({ mode: m, level: l, n: 20 }), [mode, level] as const)) as Array<{ ms: number; nodes: number; aborted: boolean }>;
          const ms = res.map((r) => r.ms);
          const p95 = pct(ms, 0.95), med = pct(ms, 0.5), max = Math.max(...ms);
          const nodes = res.map((r) => r.nodes);
          const line = `${mode.padEnd(4)} L${String(level).padEnd(4)} median ${med.toFixed(1)} ms  P95 ${p95.toFixed(1)} ms  max ${max.toFixed(1)} ms  nodes median ${pct(nodes, 0.5)}  aborted ${res.filter((r) => r.aborted).length}/20${p95 > 200 ? '  OVER' : ''}`;
          lines.push(line);
          console.log(line);
          if (p95 > 200) fails.push(line);
        }
      }
      await context.close();
    } finally {
      await browser.close();
    }
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(path.join(OUT, `bench-ai-${new Date().toISOString().slice(0, 10)}.txt`), lines.join('\n') + '\n');
    expect(fails).toEqual([]);
  }, 30 * 60 * 1000);
});
