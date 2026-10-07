// Dad-review contact sheet (spec §9.3 tail, §6.11): every one of the 40 挑战关 openings on a fixed seed (3-2-1 off,
// ≈1.2 s in), WebKit iPad 9 portrait, tiled 4 × 2 per chapter into ch<N>.png (row-major: N-1…N-4 / N-5…N-8; this ffmpeg build has no drawtext) plus levels-all.png (5 chapter rows).
// Files only — the kit auto-mutes under automation; nothing is played.
//   node tools/snake-battle/level-sheet.mjs [port]
import { webkit, devices } from '@playwright/test';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { execFileSync } from 'node:child_process';
const port = process.argv[2] ?? '5304';
const OUT = path.join(os.homedir(), 'kid-games-work/shots/snake-battle/levels');
fs.mkdirSync(OUT, { recursive: true });
const browser = await webkit.launch();
const errors = [];
try {
  const ctx = await browser.newContext({ ...devices['iPad (gen 7)'], viewport: { width: 810, height: 1080 }, deviceScaleFactor: 1, locale: 'zh-CN' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://localhost:${port}/snake-battle/?test=1&nogate`); await page.waitForSelector('#app[data-ready]');
  const ids = await page.evaluate(() => { const a = window.__sbApp; a.save.data.firstRunDone = true; a.save.readOnly = true; return null; });
  void ids;
  for (let ch = 1; ch <= 5; ch++) {
    for (let n = 1; n <= 8; n++) {
      const id = `c${ch}m${n}`;
      await page.evaluate((id) => { document.querySelectorAll('.xg-scrim, .sb-scrim').forEach((x) => x.remove()); void window.__sbApp.startMatch('mission', 'moon', { mission: id, seed: 1234, countdown: false }); }, id);
      await page.waitForFunction(() => window.__sb?.match?.state === 'playing', null, { timeout: 8000 });
      await page.waitForTimeout(1200);
      await page.screenshot({ path: path.join(OUT, `${id}.png`) });
    }
    const inputs = []; for (let n = 1; n <= 8; n++) inputs.push('-i', path.join(OUT, `c${ch}m${n}.png`));
    const scale = Array.from({ length: 8 }, (_, i) => `[${i}:v]scale=405:540[v${i}]`).join(';');
    const layout = Array.from({ length: 8 }, (_, i) => `${(i % 4) * 405}_${Math.floor(i / 4) * 540}`).join('|');
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', `${scale};${Array.from({ length: 8 }, (_, i) => `[v${i}]`).join('')}xstack=inputs=8:layout=${layout}`, path.join(OUT, `ch${ch}.png`)]);
  }
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...[1, 2, 3, 4, 5].flatMap((c) => ['-i', path.join(OUT, `ch${c}.png`)]), '-filter_complex', `${[0, 1, 2, 3, 4].map((i) => `[${i}:v]scale=810:540[s${i}]`).join(';')};[s0][s1][s2][s3][s4]vstack=inputs=5`, path.join(OUT, 'levels-all.png')]);
} finally { await browser.close(); }
console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : `no page errors; sheets in ${OUT}`);
