// tools/board/shot.mjs — 棋盘游乐场截图（WebKit，静音）。用法：
//   node tools/board/shot.mjs '<path?query>' <prefix> [--profiles=ipadL,ipadP,phoneP,se,phoneL] [--eval='js'] [--steps='tap:e2,tap:e4,wait:700'] [--port=5326] [--dpr=2]
// --steps：tap:<格名>（真实触摸/鼠标点击棋盘上的格）、wait:<ms>、eval:<js>、shot:<name>（中途截图）。截图写到 ~/kid-games-work/shots/rr/engine-board/<prefix>-<profile>.png
import { webkit, devices } from '@playwright/test';
import fs from 'node:fs';
const argv = process.argv.slice(2); const [urlPath, prefix] = argv.filter((a) => !a.startsWith('--')); const opt = Object.fromEntries(argv.filter((a) => a.startsWith('--')).map((a) => { const i = a.indexOf('='); return i < 0 ? [a.slice(2), '1'] : [a.slice(2, i), a.slice(i + 1)]; }));
const port = opt.port ?? '5326'; const profiles = (opt.profiles ?? 'ipadL').split(','); const dpr = Number(opt.dpr ?? 2);
const SAFE = { ipadP: '24,0,20,0', ipadL: '24,0,20,0', phoneP: '47,0,34,0', se: '20,0,0,0', phoneL: '0,47,21,47' };
const defs = {
  ipadP: { ...devices['iPad (gen 7)'], viewport: { width: 810, height: 1080 } }, ipadL: { ...devices['iPad (gen 7)'], viewport: { width: 1080, height: 810 } },
  phoneP: { ...devices['iPhone 13'] }, se: { ...devices['iPhone SE'], viewport: { width: 320, height: 568 } }, phoneL: { ...devices['iPhone 13'], viewport: { width: 844, height: 390 }, screen: { width: 844, height: 390 } },
};
const outDir = process.env.HOME + '/kid-games-work/shots/rr/engine-board'; fs.mkdirSync(outDir, { recursive: true });
const browser = await webkit.launch();
try {
  for (const p of profiles) {
    const ctx = await browser.newContext({ ...defs[p], deviceScaleFactor: dpr }); const page = await ctx.newPage(); const errs = [];
    page.on('pageerror', (e) => errs.push('pageerror ' + e.message)); page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ' ' + m.text()); });
    const sep = urlPath.includes('?') ? '&' : '?'; await page.goto(`http://localhost:${port}${urlPath}${opt.nosafe ? '' : `${sep}safe=${SAFE[p]}`}`, { waitUntil: 'networkidle' });
    await page.evaluate(() => window.__board?.ready); await page.waitForTimeout(Number(opt.wait ?? 500));
    if (opt.eval) console.log(p, 'eval ->', JSON.stringify(await page.evaluate(opt.eval)));
    let n = 0;
    for (const st of (opt.steps ?? '').split(/,(?=(?:tap|wait|eval|idle|shot):)/).filter(Boolean)) {
      const [k, ...rest] = st.split(':'); const v = rest.join(':');
      if (k === 'wait') await page.waitForTimeout(Number(v));
      else if (k === 'eval') console.log(p, 'eval ->', JSON.stringify(await page.evaluate(v)));
      else if (k === 'tap') { const r = await page.evaluate((nm) => { const b = window.__board; for (let s = 0; s < b.rules.geometry.squares; s++) if (b.rules.geometry.name(s) === nm) return b.rectOf(s); return null; }, v); if (!r) throw new Error('no square ' + v); await page.touchscreen.tap(r.x + r.w / 2, r.y + r.h / 2); await page.waitForTimeout(60); }
      else if (k === 'idle') await page.waitForFunction(() => window.__board.idle, null, { timeout: 8000 });
      else if (k === 'shot') await page.screenshot({ path: `${outDir}/${prefix}-${p}-${v}.png` });
    }
    await page.screenshot({ path: `${outDir}/${prefix}-${p}.png` });
    if (errs.length) console.log(p, 'ERRORS', errs.slice(0, 8)); await ctx.close();
  }
} finally { await browser.close(); }
console.log('done');
