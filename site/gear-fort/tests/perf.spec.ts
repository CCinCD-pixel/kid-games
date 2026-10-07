/**
 * 机关守城 · V19 performance gate (spec §8.6, §9.8) — GF_PERF=1 only (≈75 s, landscape):
 *   /gear-fort/?dev=perf = night + smoke + fog, 48 machines (32 蚁傅, 2 charging 冲车, 1 云梯车 raising), 25 cards,
 *   60 projectiles, 200 particles, 阳燧 in 5 lanes, kept at that peak for GF_PERF_SEC (default 60) seconds.
 * Hard gates (machine-independent): drawImage ≤ 700 per frame, painted pixels ≤ 3× the stage's pixels.
 * Desktop-WebKit proxy gates: frame work p95 ≤ 8 ms; kernel step mean × 3 (A13 estimate) ≤ 0.6 ms; atlas bake × 3 ≤ 800 ms.
 * Then the adaptive degrade is forced once (level 3: half particles, stage DPR 1.5, no breathing/shadows) and both
 * frames are saved for the readability check. Real-device p95/p99 (iPad 9) stays a release gate for dad (§9.10).
 */
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SHOTS = path.join(os.homedir(), 'kid-games-work/shots/gear-fort/perf');
const REPORT = path.join(os.homedir(), 'kid-games-work/reports/gear-fort/perf');

test('V19: stress scene stays inside the frame, draw-call and fill budgets', async ({ page }, info) => {
  test.skip(!process.env.GF_PERF, 'set GF_PERF=1 (heavy: 60 s of the stress scene)');
  test.skip(!info.project.name.startsWith('landscape'), 'the stress scene is specified in landscape');
  const SEC = Number(process.env.GF_PERF_SEC || 60);
  test.setTimeout((SEC + 60) * 1000);
  fs.mkdirSync(SHOTS, { recursive: true }); fs.mkdirSync(REPORT, { recursive: true });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/gear-fort/?dev=perf&test=1');
  await page.getByRole('button', { name: /开始/ }).first().click({ timeout: 8000 }).catch(() => {});
  await page.waitForFunction(() => { const g = (window as any).__gf; return !!g && g.perf().steps > 60; }, null, { timeout: 20_000 });
  await page.waitForTimeout(2500); // warm-up: JIT, first sprites, the 120-frame probe
  await page.evaluate(() => (window as any).__gf.resetPerf());
  const samples: any[] = [];
  for (let t = 0; t < SEC; t += 2) { await page.waitForTimeout(2000); samples.push(await page.evaluate(() => (window as any).__gf.perf())); }
  const last = samples[samples.length - 1];
  await page.screenshot({ path: path.join(SHOTS, 's27-perf-full.png') });
  const r = {
    sec: SEC, frames: last.work.n, steps: last.steps,
    work: last.work, maxCalls: Math.max(...samples.map((s) => s.maxCalls)), fillMax: Math.max(...samples.map((s) => s.fill.max)), fillMean: last.fill.mean,
    stepUs: last.stepUs, bakeMs: last.bakeMs, minEnemies: Math.min(...samples.map((s) => s.enemies)), minUnits: Math.min(...samples.map((s) => s.units)),
    minBolts: Math.min(...samples.map((s) => s.bolts)), minParticles: Math.min(...samples.map((s) => s.particles)), probe: last.probe, autoDegrade: last.degrade,
  };
  // forced adaptive degrade (once), then the same scene must still read clearly
  await page.evaluate(() => (window as any).__gf.degrade(3)); await page.waitForTimeout(1500);
  const d = await page.evaluate(() => { const p = (window as any).__gf.perf(); const c = document.querySelector('.gf-stage') as HTMLCanvasElement; return { degrade: p.degrade, stageDpr: p.stageDpr, w: c.width, cssW: c.clientWidth, particles: p.particles }; });
  await page.screenshot({ path: path.join(SHOTS, 's27-perf-degraded.png') });
  fs.writeFileSync(path.join(REPORT, 'v19.json'), JSON.stringify({ ...r, degraded: d, errors, at: new Date().toISOString() }, null, 1));
  console.log('V19', JSON.stringify(r), JSON.stringify(d));
  expect(errors).toEqual([]);
  expect(r.minEnemies).toBeGreaterThanOrEqual(44); // 48 kept up; a few may be mid-respawn in a sample
  expect(r.minUnits).toBeGreaterThanOrEqual(25);
  // V19 hard limit 700; the fixed-slot pose cache (§8.5) is not built in v1 (deviation, see LICENSES/notes), so keep a
  // regression guard below the limit: any new per-frame draw cost must show up here before it eats the last headroom
  expect(r.maxCalls).toBeLessThanOrEqual(680);
  expect(r.fillMax).toBeLessThanOrEqual(3);
  expect(r.work.p95).toBeLessThanOrEqual(8);
  expect(r.stepUs * 3).toBeLessThanOrEqual(600);
  expect(r.bakeMs * 3).toBeLessThanOrEqual(800);
  expect(d.degrade).toBe(3); expect(d.stageDpr).toBe(1.5); expect(d.w).toBe(Math.round(d.cssW * 1.5)); expect(d.particles).toBeLessThanOrEqual(100);
});
