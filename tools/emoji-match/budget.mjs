#!/usr/bin/env node
/**
 * 星晶消消乐 size budget (spec §8.9, V11): a scoped production build (hub + /emoji-match/ only, into
 * ~/kid-games-work/emoji-match/build) and the bytes this game adds on top of the shared kit:
 *   JS ≤ 140 KB gzip · CSS ≤ 15 KB gzip · content JSON ≤ 12 KB gzip · assets ≤ 2.0 MB
 * Counted: the entry + every chunk the new game loads (static closure of the entry and of src/main's
 * dynamic import), MINUS chunks the hub also loads (the kit). Not counted: src/legacy (removed at the v1
 * release) and the lazy dev/test chunks (?dev=style|sound, ?test=1), reported separately.
 *   node tools/emoji-match/budget.mjs        → prints a table, writes ~/kid-games-work/emoji-match/budget.json, exit 1 over budget
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(os.homedir(), 'kid-games-work/emoji-match/build');
const free = Number((execSync('memory_pressure -Q | tail -1').toString().match(/(\d+)%/) || [0, 100])[1]);
if (free < 25) { console.error(`memory free ${free}% < 25% — wait (RESOURCE RULES)`); process.exit(2); }
if (!process.argv.includes('--no-build')) execSync('npx vite build --config tools/emoji-match/vite.budget.config.ts --logLevel warn', { cwd: ROOT, stdio: 'inherit', env: { ...process.env, VITE_CONFIG_NATIVE_IGNORE_WARNING: 'true' } });

const man = JSON.parse(fs.readFileSync(path.join(OUT, '.vite/manifest.json'), 'utf8'));
const gz = (f) => zlib.gzipSync(fs.readFileSync(path.join(OUT, f)), { level: 9 }).length;
const raw = (f) => fs.statSync(path.join(OUT, f)).size;
function closure(keys, { dynamic = () => false } = {}) {
  const seen = new Set();
  const walk = (k) => {
    if (seen.has(k) || !man[k]) return;
    seen.add(k);
    for (const i of man[k].imports ?? []) walk(i);
    for (const d of man[k].dynamicImports ?? []) if (dynamic(d)) walk(d);
  };
  keys.forEach(walk);
  return seen;
}
const entryKey = Object.keys(man).find((k) => k.endsWith('emoji-match/index.html'));
const hubKey = Object.keys(man).find((k) => /(^|\/)index\.html$/.test(k) && !k.includes('emoji-match'));
const isGame = (k) => k.includes('emoji-match/src/main') ;
const game = closure([entryKey], { dynamic: isGame });
const hub = closure([hubKey], { dynamic: () => false });
const files = (keys) => [...new Set([...keys].flatMap((k) => [man[k].file, ...(man[k].css ?? []), ...(man[k].assets ?? [])]).filter(Boolean))];
const hubFiles = new Set(files(hub));
const own = files(game).filter((f) => !hubFiles.has(f));
const lazy = Object.keys(man).filter((k) => /emoji-match\/src\/(dev|legacy)\//.test(k)).map((k) => ({ k, file: man[k].file, gz: gz(man[k].file) }));
const sum = (fs_, ext, f = gz) => fs_.filter((x) => ext.test(x)).reduce((a, x) => a + f(x), 0);
const json = ['levels', 'puzzles', 'intros', 'lines', 'constellations', 'voice'].reduce((a, n) => a + zlib.gzipSync(fs.readFileSync(path.join(ROOT, `content/emoji-match/${n}.json`)), { level: 9 }).length, 0);
const r = {
  at: new Date().toISOString(),
  jsGzip: sum(own, /\.js$/), cssGzip: sum(own, /\.css$/), jsonGzip: json,
  assetsRaw: sum(own, /\.(m4a|webp|png|svg|woff2)$/, raw),
  budgets: { jsGzip: 140 * 1024, cssGzip: 15 * 1024, jsonGzip: 12 * 1024, assetsRaw: 2.0 * 1024 * 1024 },
  ownFiles: own.map((f) => ({ f, raw: raw(f), gz: /\.(js|css)$/.test(f) ? gz(f) : null })),
  lazyNotCounted: lazy,
  kitShared: [...hubFiles].filter((f) => /\.js$/.test(f)).reduce((a, f) => a + gz(f), 0),
};
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
const rows = [['JS (gzip, game only)', r.jsGzip, r.budgets.jsGzip], ['CSS (gzip)', r.cssGzip, r.budgets.cssGzip], ['content JSON (gzip, inside the JS)', r.jsonGzip, r.budgets.jsonGzip], ['assets (raw)', r.assetsRaw, r.budgets.assetsRaw]];
for (const [n, v, b] of rows) console.log(`${v <= b ? 'OK  ' : 'OVER'} ${n.padEnd(36)} ${kb(v).padStart(10)}  / ${kb(b)}`);
console.log(`shared kit JS (hub, not counted): ${kb(r.kitShared)}; lazy dev/test/legacy chunks (not counted): ${lazy.map((x) => `${path.basename(x.file)} ${kb(x.gz)}`).join(', ')}`);
fs.writeFileSync(path.join(os.homedir(), 'kid-games-work/emoji-match/budget.json'), JSON.stringify(r, null, 1));
process.exitCode = rows.some(([, v, b]) => v > b) ? 1 : 0;
