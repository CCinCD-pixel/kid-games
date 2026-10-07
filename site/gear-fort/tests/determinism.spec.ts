/**
 * 机关守城 · cross-engine determinism (spec §8.9, §9.7; build-stage-1 gate "逐旗哈希 Node 与 WebKit 一致"):
 * the 22 design solutions (every flag hash + final hash) and the 22 ghost windows (hash at both ends) replayed by
 * the kernel inside WebKit must give exactly the hashes the Node fixtures carry (src/lane/fixtures.test.ts).
 * The page exposes the bare kernel at ?dev=replay (src/main.ts). One orientation is enough.
 */
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const C = path.join(ROOT, 'content/gear-fort');
const read = (p: string): any => JSON.parse(fs.readFileSync(path.join(C, p), 'utf8'));
const IDS = fs.readdirSync(path.join(C, 'levels')).map((f) => f.replace('.json', '')).sort((a, b) => { const [x1, y1] = a.split('-').map(Number); const [x2, y2] = b.split('-').map(Number); return x1 - x2 || y1 - y2; });

test('V4 in WebKit: design solutions + ghost windows hash exactly like Node', async ({ page }, info) => {
  test.skip(!info.project.name.startsWith('portrait'), 'kernel only — one orientation');
  test.setTimeout(180_000);
  await page.goto('/gear-fort/?dev=replay&test=1');
  await page.waitForFunction(() => !!(window as any).__gfKernel, null, { timeout: 15_000 });
  const report: string[] = [];
  for (const id of IDS) {
    const lv = read(`levels/${id}.json`); const ds = read(`dscripts/${id}.json`); const g = read(`ghost/${id}.json`);
    const r = await page.evaluate(({ lv, ds, g }) => {
      const K = (window as any).__gfKernel;
      const S = K.createSim({ ...lv, loadout: ds.loadout }, 0); let i = 0; const hs: [number, string][] = [];
      while (!S.result && S.tick < 20 * 60 * 12) {
        const a = i < ds.actions.length && ds.actions[i][0] === S.tick ? ds.actions[i++][1] : null;
        if ((S.flags || []).includes(S.tick)) hs.push([S.tick, K.hash(S)]);
        K.step(S, a);
      }
      const R = K.createSim({ ...lv, loadout: g.loadout }, g.seed); let j = 0; let h0: string | null = null, h1: string | null = null;
      while (R.tick <= g.w1 && !R.result) {
        const a = j < g.actions.length && g.actions[j][0] === R.tick ? g.actions[j++][1] : null;
        if (R.tick === g.w0) h0 = K.hash(R); if (R.tick === g.w1) h1 = K.hash(R);
        K.step(R, a);
      }
      return { hs, fin: K.hash(S), res: S.result, h0, h1 };
    }, { lv, ds, g });
    expect(r.hs, `${id} flag hashes`).toEqual(ds.flagHashes);
    expect(r.fin, `${id} final hash`).toBe(ds.finalHash);
    expect(r.res, `${id} result`).toBe('win');
    expect(r.h0, `${id} ghost w0`).toBe(g.hashW0);
    if (g.hashW1) expect(r.h1, `${id} ghost w1`).toBe(g.hashW1);
    report.push(`${id} flags=${r.hs.length} ok`);
  }
  const out = path.join(process.env.HOME || '', 'kid-games-work/reports/gear-fort'); fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'determinism-webkit.txt'), `WebKit ${new Date().toISOString()}\n${report.join('\n')}\n`);
});

test('V4 in WebKit: the 9 synthetic scripts (shovel, mark, token, strike, hook, pit, checkpoint restore + assisted restore, suspend/resume) hash like Node', async ({ page }, info) => {
  test.skip(!info.project.name.startsWith('portrait'), 'kernel only — one orientation');
  test.setTimeout(120_000);
  await page.goto('/gear-fort/?dev=replay&test=1');
  await page.waitForFunction(() => !!(window as any).__gfKernel, null, { timeout: 15_000 });
  const files = fs.readdirSync(path.join(C, 'synthetic')).filter((f) => f.endsWith('.json')).sort(); const report: string[] = [];
  expect(files.length).toBe(9);
  // the scripts' levels are resolved exactly like the Node fixture test (bots/run.levelFor, 'C' deck) — on the Node side,
  // through Vite's SSR loader (TS + JSON imports); the page itself never ships bot code (V17)
  const { createServer } = await import('vite');
  const vs = await createServer({ root: ROOT, configFile: false, logLevel: 'error', appType: 'custom', server: { middlewareMode: true, hmr: false, watch: null }, optimizeDeps: { noDiscovery: true, include: [] } });
  let levelFor: (lv: unknown, bot: string, seed: number) => Record<string, unknown>;
  try { levelFor = (await vs.ssrLoadModule('/site/gear-fort/src/bots/run.ts')).levelFor; } finally { await vs.close(); }
  for (const f of files) {
    const sy = read(`synthetic/${f}`); const lv = { ...levelFor(read(`levels/${sy.id}.json`), 'C', sy.seed), ...(sy.patch || {}) };
    const r = await page.evaluate(({ sy, lv }) => {
      const K = (window as any).__gfKernel; let S = K.createSim(lv, sy.seed, { events: true }); let i = 0; let snap: unknown = null; const hs: [number, string][] = [];
      while (!S.result && S.tick < 20 * 60 * 12) {
        let a: unknown[] | null = null;
        while (i < sy.actions.length && sy.actions[i][0] === S.tick) {
          const acts = sy.actions[i][1]; const p = acts[0]?.t;
          if (p === '#snapshot') snap = K.snapshot(S);
          else if (p === '#restore') S = K.restore(snap, lv, { events: true });
          else if (p === '#restore-assist') S = K.restore(snap, lv, { events: true, assist: 1 });
          else if (p === '#suspend-resume') S = K.resume(K.snapshot(S), lv, { events: true });
          else a = (a || []).concat(acts);
          i++;
        }
        if ((S.flags || []).includes(S.tick)) hs.push([S.tick, K.hash(S)]);
        K.step(S, a);
      }
      return { hs, fin: K.hash(S), res: S.result };
    }, { sy, lv });
    expect(r.hs, `${f} flag hashes`).toEqual(sy.flagHashes);
    expect(r.fin, `${f} final hash`).toBe(sy.finalHash);
    expect(r.res, `${f} result`).toBe(sy.result);
    report.push(`${f} flags=${r.hs.length} ok`);
  }
  const out = path.join(process.env.HOME || '', 'kid-games-work/reports/gear-fort'); fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'determinism-webkit-synthetic.txt'), `WebKit ${new Date().toISOString()}\n${report.join('\n')}\n`);
});
