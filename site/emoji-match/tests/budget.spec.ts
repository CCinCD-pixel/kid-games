/**
 * 星晶消消乐 size budget in test:smoke (spec §8.9 / §8.10, V11): no browser, reads the built `dist/`
 * (test:smoke builds first; EM_DIST points elsewhere, e.g. tools/emoji-match/budget.mjs's scoped build).
 * From dist/emoji-match/index.html: the entry script + its static imports + the new game's dynamic main
 * (the chunk carrying 星晶号; the transition-only legacy main and the lazy ?test / ?dev chunks are not
 * counted) and everything it imports, MINUS what dist/index.html (the hub = shared kit) also loads.
 *   JS ≤ 140 KB gzip · CSS ≤ 15 KB gzip · content JSON ≤ 12 KB gzip · assets ≤ 2.0 MB raw
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const DIST = process.env.EM_DIST ?? path.join(ROOT, 'dist');
const LAZY = /(^|\/)(test-hook|style|sound|legacy[^/]*)-[\w-]+\.js$/;

const read = (rel: string) => fs.readFileSync(path.join(DIST, rel.replace(/^\//, '')));
const gz = (rel: string) => zlib.gzipSync(read(rel), { level: 9 }).length;
const raw = (rel: string) => fs.statSync(path.join(DIST, rel.replace(/^\//, ''))).size;

/** script / modulepreload / stylesheet URLs of an html page, as dist-relative paths */
function htmlRefs(html: string): string[] {
  return [...html.matchAll(/<(?:script|link)[^>]+(?:src|href)="(\/assets\/[^"]+\.(?:js|css))"/g)].map((m) => m[1].slice(1));
}
/** a chunk's static imports (+ dynamic ones when `dyn`), plus CSS / assets it names */
function refs(rel: string, dyn: (f: string, src: string) => boolean): string[] {
  const src = read(rel).toString('utf8');
  const dir = path.posix.dirname(rel);
  const out = new Set<string>();
  for (const m of src.matchAll(/(?:from|import)\s*"(\.\/[^"]+\.js)"/g)) out.add(path.posix.join(dir, m[1]));
  // vite's preload map: m.f=["assets/a.js","assets/b.css",…]; import(`./x.js`),__vite__mapDeps([i,j,…])
  const table = JSON.parse(src.match(/m\.f=(\[[^\]]*\])/)?.[1] ?? '[]') as string[];
  for (const m of src.matchAll(/import\(\s*[`"'](\.\/[^`"']+\.js)[`"']\s*\)(?:\.then\([^()]*\(\)\))?(?:\s*,\s*__vite__mapDeps\(\[([\d,\s]*)\]\))?/g)) {
    const f = path.posix.join(dir, m[1]);
    if (LAZY.test(f) || !dyn(f, read(f).toString('utf8'))) continue;
    out.add(f);
    for (const k of (m[2] ?? '').split(',').filter(Boolean)) if (table[Number(k)]) out.add(table[Number(k)]);
  }
  for (const m of src.matchAll(/["`](?:\/)?(assets\/[\w.-]+\.(?:webp|m4a|png|woff2))["`]/g)) out.add(m[1]);
  return [...out];
}
function closure(start: string[], dyn: (f: string, src: string) => boolean): Set<string> {
  const seen = new Set<string>();
  const walk = (f: string) => {
    if (seen.has(f) || !fs.existsSync(path.join(DIST, f))) return;
    seen.add(f);
    if (f.endsWith('.js')) refs(f, dyn).forEach(walk);
  };
  start.forEach(walk);
  return seen;
}

test('V11 size budget of the built game (dist/)', () => {
  test.skip(!fs.existsSync(path.join(DIST, 'emoji-match/index.html')), `no build at ${DIST} (test:smoke builds first)`);
  // a dist/ older than the game's source is a leftover build (dev runs); test:smoke always builds first
  const newest = (dir: string): number => fs.readdirSync(dir, { withFileTypes: true }).reduce((a, e) => Math.max(a, e.isDirectory() ? newest(path.join(dir, e.name)) : fs.statSync(path.join(dir, e.name)).mtimeMs), 0);
  test.skip(!process.env.EM_DIST && fs.statSync(path.join(DIST, 'emoji-match/index.html')).mtimeMs < newest(path.join(ROOT, 'site/emoji-match/src')), `stale build at ${DIST}`);
  const page = htmlRefs(read('emoji-match/index.html').toString('utf8'));
  const hub = closure(htmlRefs(read('index.html').toString('utf8')), () => false);
  // the new game's main: a dynamic chunk with the game's own name in it (the legacy page never says 星晶号);
  // the CSS of a dynamic main is named in the entry's preload map, so only CSS of counted chunks is kept
  const game = closure(page, (_f, src) => src.includes('星晶号'));
  const counted = [...game].filter((f) => !hub.has(f));
  const entryCss = new Set([...game].filter((f) => f.endsWith('.css')));
  const sum = (re: RegExp, f: (x: string) => number) => counted.filter((x) => re.test(x)).reduce((a, x) => a + f(x), 0);
  const js = sum(/\.js$/, gz), css = sum(/\.css$/, gz), assets = sum(/\.(webp|m4a|png|woff2)$/, raw);
  const json = ['levels', 'puzzles', 'intros', 'lines', 'constellations', 'voice']
    .reduce((a, n) => a + zlib.gzipSync(fs.readFileSync(path.join(ROOT, `content/emoji-match/${n}.json`)), { level: 9 }).length, 0);
  console.log(`emoji-match budget: JS ${(js / 1024).toFixed(1)} KB gz, CSS ${(css / 1024).toFixed(1)} KB gz (${entryCss.size} files), JSON ${(json / 1024).toFixed(1)} KB gz, assets ${(assets / 1024).toFixed(0)} KB`);
  expect(js, 'game has its own JS').toBeGreaterThan(20 * 1024);
  expect(js, 'JS gzip').toBeLessThanOrEqual(140 * 1024);
  expect(css, 'CSS gzip').toBeLessThanOrEqual(15 * 1024);
  expect(json, 'content JSON gzip').toBeLessThanOrEqual(12 * 1024);
  expect(assets, 'assets raw').toBeLessThanOrEqual(2.0 * 1024 * 1024);
});
