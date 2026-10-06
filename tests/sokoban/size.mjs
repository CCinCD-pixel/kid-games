#!/usr/bin/env node
// Bundle-size check for 星港搬运工 (spec §8.1 budgets: page JS ≤ 150 KB gzip, Worker ≤ 40 KB gzip,
// bundled content JSON ≤ 40 KB gzip). Builds ONLY site/sokoban/index.html with the same aliases and
// target as the site build, into ~/kid-games-work/size/sokoban (never touches dist/), then reports
// the gzip sizes of the entry graph (static imports), the lazy chunks and the Worker.
//   node tests/sokoban/size.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(os.homedir(), 'kid-games-work/size/sokoban');

const result = await build({
  configFile: false,
  root: path.join(ROOT, 'site'),
  base: '/',
  publicDir: false,
  logLevel: 'warn',
  resolve: { alias: { '@kit': path.join(ROOT, 'kit'), '@engines': path.join(ROOT, 'engines') } },
  build: {
    outDir: OUT,
    emptyOutDir: true,
    target: 'safari16',
    write: true,
    reportCompressedSize: false,
    rolldownOptions: { input: { sokoban: path.join(ROOT, 'site/sokoban/index.html') } },
  },
});

const outputs = (Array.isArray(result) ? result : [result]).flatMap((r) => ('output' in r ? r.output : []));
const chunks = outputs.filter((o) => o.type === 'chunk');
const gz = (code) => zlib.gzipSync(Buffer.from(code)).length;
const byName = new Map(chunks.map((c) => [c.fileName, c]));
const entry = chunks.find((c) => c.isEntry);
const seen = new Set();
const walk = (c) => {
  if (!c || seen.has(c.fileName)) return;
  seen.add(c.fileName);
  for (const i of c.imports) walk(byName.get(i));
};
walk(entry);
let pageGz = 0;
for (const f of seen) pageGz += gz(byName.get(f).code);
const lazy = chunks.filter((c) => !seen.has(c.fileName));
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
console.log(`page (entry + static imports, ${seen.size} chunks): ${kb(pageGz)} gzip  — budget 150 KB`);
for (const c of lazy) console.log(`lazy chunk ${c.fileName}: ${kb(gz(c.code))} gzip`);
const workers = fs.readdirSync(path.join(OUT, 'assets')).filter((f) => /worker/i.test(f) && f.endsWith('.js'));
for (const w of workers) console.log(`worker ${w}: ${kb(gz(fs.readFileSync(path.join(OUT, 'assets', w))))} gzip  — budget 40 KB`);
const content = ['levels.json', 'classic.json', 'chapters.json', 'lines.json'].map((f) => fs.readFileSync(path.join(ROOT, 'content/sokoban', f)));
console.log(`content JSON bundled (levels, classic, chapters, lines): ${kb(content.reduce((a, b) => a + gz(b), 0))} gzip (separately compressed; budget 40 KB)`);
