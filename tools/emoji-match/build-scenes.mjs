#!/usr/bin/env node
/**
 * 星晶消消乐 backgrounds (spec §6.7, §8.9): rasterise the five code-drawn paper-cut scenes
 * (site/emoji-match/src/view/art/sky.ts: route + episodes 1–4) in both orientations to
 *   site/emoji-match/assets/bg/<scene>-{p,l}.webp   portrait 1620×2160 / landscape 2160×1620, each ≤ 90 KB
 * The page then loads only the current scene in the current orientation as a plain <img> (a static
 * bitmap is far cheaper for WebKit to repaint than inline SVG with drop-shadow filters).
 *
 *   node tools/emoji-match/build-scenes.mjs            all 10
 *   node tools/emoji-match/build-scenes.mjs ep2        only matching scenes
 *
 * One headless Chromium (muted, closed in finally), DPR 1 at the exact pixel size; the PNG masters go to
 * ~/kid-games-work/emoji-match/scenes/, the WebP encode is PIL/libwebp (method 6, quality searched down
 * from 96 until the file fits the cap, never below 60). Deterministic: sky.ts seeds its own RNG.
 */
import { execFileSync, execSync } from 'node:child_process';
import { mkdirSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const WORK = path.join(os.homedir(), 'kid-games-work/emoji-match');
const BUILD = path.join(WORK, 'scenes-build');
const MASTERS = path.join(WORK, 'scenes');
const OUT = path.join(ROOT, 'site/emoji-match/assets/bg');
const CAP = 90 * 1024;
const filter = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? '';

try { // RESOURCE RULES: refuse below 25 % free memory
  const free = Number((execSync('memory_pressure -Q | tail -1').toString().match(/(\d+)%/) || [0, 100])[1]);
  if (free < 25) { console.error(`memory free ${free}% < 25% — wait and retry`); process.exit(2); }
} catch { /* not macOS */ }

for (const d of [BUILD, MASTERS, OUT]) mkdirSync(d, { recursive: true });
const { rolldown } = await import(pathToFileURL(path.join(ROOT, 'node_modules/rolldown/dist/index.mjs')).href);
const bundle = await rolldown({ input: { sky: path.join(ROOT, 'site/emoji-match/src/view/art/sky.ts') }, platform: 'node', logLevel: 'warn' });
await bundle.write({ dir: BUILD, format: 'esm', entryFileNames: '[name].mjs' });
await bundle.close();
const { skySvg } = await import(`${pathToFileURL(path.join(BUILD, 'sky.mjs')).href}?t=${Date.now()}`);

const jobs = [];
for (const key of ['route', 'ep1', 'ep2', 'ep3', 'ep4']) for (const land of [false, true]) {
  const name = `${key}-${land ? 'l' : 'p'}`;
  if (!filter || name.includes(filter)) jobs.push({ key, land, name, W: land ? 2160 : 1620, H: land ? 1620 : 2160 });
}

const browser = await chromium.launch({ args: ['--mute-audio'] });
try {
  for (const j of jobs) {
    const page = await browser.newPage({ viewport: { width: j.W, height: j.H }, deviceScaleFactor: 1 });
    await page.setContent(`<!doctype html><html><body style="margin:0;background:#0c1230;overflow:hidden"><div style="width:${j.W}px;height:${j.H}px">${skySvg(j.key, j.land)}</div></body></html>`);
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(MASTERS, `${j.name}.png`), clip: { x: 0, y: 0, width: j.W, height: j.H } });
    await page.close();
  }
} finally {
  await browser.close();
}

// WebP encode (PIL / libwebp): highest quality that fits the cap
const PY = `
import sys
from io import BytesIO
from PIL import Image
src, dst, cap = sys.argv[1], sys.argv[2], int(sys.argv[3])
im = Image.open(src).convert('RGB')
best = None
for q in range(96, 59, -3):
    b = BytesIO(); im.save(b, 'WEBP', quality=q, method=6)
    best = (q, b.getvalue())
    if len(best[1]) <= cap: break
open(dst, 'wb').write(best[1])
print(best[0], len(best[1]))
`;
let total = 0, over = 0;
for (const j of jobs) {
  const dst = path.join(OUT, `${j.name}.webp`);
  const [q] = execFileSync('python3', ['-c', PY, path.join(MASTERS, `${j.name}.png`), dst, String(CAP)]).toString().trim().split(' ');
  const size = statSync(dst).size; total += size; if (size > CAP) over += 1;
  console.log(`${j.name.padEnd(9)} ${j.W}×${j.H}  q${q}  ${(size / 1024).toFixed(1)} KB${size > CAP ? '  OVER CAP' : ''}`);
}
console.log(`${jobs.length} scenes, ${(total / 1024).toFixed(0)} KB total${over ? `, ${over} over the ${CAP / 1024} KB cap` : ''}`);
process.exitCode = over ? 1 : 0;
