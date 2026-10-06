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
