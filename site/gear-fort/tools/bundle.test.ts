// V17 (spec §9.1): bundle size and isolation, without the root build — Vite builds only this game's page into a temp dir.
// Page JS ≤ 300 KB gzip (target ≤ 120 KB); no bot / validator code (makeK, makeC, dscripts, parity) in the page;
// every ghost replay is its own lazy chunk. GF_QUICK=1 or GF_FULL=1 (≈10 s); not part of the shared check.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { build } from 'vite';

const ON = !!(process.env.GF_QUICK || process.env.GF_FULL);
const ROOT = path.resolve(__dirname, '../../..');

describe.runIf(ON)('V17 bundle', () => {
  it('page JS ≤ 300 KB gzip, no bot code, ghosts are separate chunks', async () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'gf-bundle-'));
    try {
      await build({ configFile: false, root: path.join(ROOT, 'site'), logLevel: 'silent', publicDir: false,
        resolve: { alias: { '@kit': path.join(ROOT, 'kit'), '@engines': path.join(ROOT, 'engines') } },
        build: { outDir: out, emptyOutDir: true, minify: true, rollupOptions: { input: path.join(ROOT, 'site/gear-fort/index.html') } } });
      const js = fs.readdirSync(path.join(out, 'assets')).filter((f) => f.endsWith('.js')).map((f) => ({ f, src: fs.readFileSync(path.join(out, 'assets', f), 'utf8') }));
      const isGhost = (s: string): boolean => /^\s*const\s|^var\s|^export default/.test(s) && s.length < 60000 && /"w0"|w0:/.test(s);
      const page = js.filter((x) => !isGhost(x.src));
      const gz = page.reduce((n, x) => n + zlib.gzipSync(x.src).length, 0);
      fs.writeFileSync(path.join(os.homedir(), 'kid-games-work/reports/gear-fort/bundle.txt'), `page JS gzip ${(gz / 1024).toFixed(1)} KB in ${page.length} chunks; ghost chunks ${js.length - page.length}\n`);
      expect(gz).toBeLessThanOrEqual(300 * 1024);
      for (const x of page) for (const bad of ['makeK', 'makeC', 'dscripts', 'parity/']) expect(x.src.includes(bad), `${x.f} contains ${bad}`).toBe(false);
      expect(js.length - page.length).toBeGreaterThanOrEqual(22);
    } finally { fs.rmSync(out, { recursive: true, force: true }); }
  }, 120_000);
});
