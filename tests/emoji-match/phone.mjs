#!/usr/bin/env node
// Phone screenshot sweep for 星晶消消乐 (Dad's feedback 2026-10-08: phone portrait + landscape).
//   node tests/emoji-match/phone.mjs [--port=5305] [--only=se,p13,land,ipadp,ipadl] [--screens=route,play1,…]
// WebKit, one browser, closed at the end. Each screen is shot and checked: visible buttons ≥ 44 px,
// inside the viewport, no two visible buttons overlapping, no text < 13 px.
// Shots → ~/kid-games-work/shots/fb1/emoji-match/<device>/<screen>.png (+ a findings line per screen).
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { webkit, devices } from '@playwright/test';

const args = process.argv.slice(2);
const opt = (k, d) => args.find((a) => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=') ?? d;
const PORT = opt('port', '5305');
const ONLY = opt('only', 'se,p13,land').split(',');
const SCREENS = opt('screens', '').split(',').filter(Boolean);
const OUT = path.join(os.homedir(), 'kid-games-work/shots/fb1/emoji-match');
const free = Number((execSync('memory_pressure -Q | tail -1').toString().match(/(\d+)%/) || [0, 100])[1]);
if (free < 25) { console.error(`memory free ${free}% < 25% — not starting a browser`); process.exit(2); }

const phone = { isMobile: true, hasTouch: true, deviceScaleFactor: 3 };
const DEVICES = {
  se: { ...devices['iPhone SE'] },
  p13: { ...devices['iPhone 13'] },
  land: { ...phone, userAgent: devices['iPhone 13'].userAgent, viewport: { width: 844, height: 390 } },
  ipadp: { ...devices['iPad (gen 7)'], viewport: { width: 810, height: 1080 } },
  ipadl: { ...devices['iPad (gen 7)'], viewport: { width: 1080, height: 810 } },
};

const save = (o) => `window.__em.setSave(${JSON.stringify(o)});`;
const wonUpTo = (n) => { const lv = {}; for (const ep of [1, 2, 3, 4]) for (let k = 1; k <= 10; k += 1) { const id = `${ep}-${String(k).padStart(2, '0')}`; if ((ep - 1) * 10 + k <= n) lv[id] = { stars: 3, bestLeft: 3, attempts: 1, wins: 1, failStreak: 0 }; } return lv; };
const veteran = { firstRunDone: true, levels: wonUpTo(40), arrivals: [1, 2, 3, 4], intros: ['swap', 'rocket', 'tap', 'prop', 'bomb', 'energy', 'orb', 'comboRR', 'dust', 'boosterDrill', 'dust2', 'comboBB', 'comboRB', 'crate', 'boosterTractor', 'crate2', 'comboPP', 'comboP', 'ice', 'boosterIon', 'ice2', 'comboOR'], boosters: { drill: 3, tractor: 3, ion: 3 }, sky: ['dipper', 'polaris', 'cowherd', 'orion', 'sirius'] };
const goPlay = (r) => `window.__em.goto(${JSON.stringify(r)}); for (let k=0;k<150 && !window.__em.state()?.ready;k++) await new Promise(r=>setTimeout(r,100));`;
const sleep = (ms) => `await new Promise(r=>setTimeout(r,${ms}));`;

// name → [query, js steps…]; '@ms' waits
const ALL = {
  gate: ['', ''],
  cutscene: ['?test=1', `window.__em.cutscene(); ${sleep(1900)}`],
  route: ['?test=1', save(veteran) + `window.__em.goto({s:'route'});` + sleep(600)],
  route0: ['?test=1', save({ firstRunDone: true }) + `window.__em.goto({s:'route'});` + sleep(600)],
  map: ['?test=1', save(veteran) + `window.__em.goto({s:'map',ep:2});` + sleep(900)],
  card: ['?test=1', save(veteran) + `window.__em.goto({s:'card',id:'2-05'});` + sleep(900)],
  intro: ['?test=1', save({ firstRunDone: true, levels: wonUpTo(11) }) + `window.__em.goto({s:'card',id:'2-02'}); ${sleep(700)} document.querySelector('.em-card [data-act=go]').click(); ${sleep(2600)}`],
  lesson: ['?test=1', save({ firstRunDone: true }) + goPlay({ s: 'play', id: '1-01' }) + sleep(2400)],
  play7: ['?test=1', save(veteran) + goPlay({ s: 'play', id: '2-05' }) + sleep(800)],
  play9: ['?test=1', save(veteran) + goPlay({ s: 'play', id: '2-08' }) + sleep(800)],
  pause: ['?test=1', save(veteran) + goPlay({ s: 'play', id: '1-06' }) + `document.querySelector('.em-pause, [data-act=pause], .em-hud__pause')?.click(); ${sleep(800)}`],
  puzzle: ['?test=1', save(veteran) + goPlay({ s: 'puzzle', id: 'p1' }) + sleep(800)],
  free: ['?test=1', save(veteran) + goPlay({ s: 'free' }) + sleep(800)],
  hangar: ['?test=1', save(veteran) + `window.__em.goto({s:'hangar'});` + sleep(900)],
  hangarTools: ['?test=1', save(veteran) + `window.__em.goto({s:'hangar',tab:'tools'});` + sleep(900)],
  arrival: ['?test=1', save({ ...veteran, arrivals: [], sky: [] }) + `window.__em.timeScale(6); window.__em.goto({s:'arrival',ep:1});` + sleep(2200)],
  parent: ['?test=1', save(veteran) + `window.__em.goto({s:'route'}); ${sleep(500)} document.querySelector('.em-route__title span').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); ${sleep(3400)}`],
  win: ['?test=1', save(veteran) + goPlay({ s: 'play', id: '1-06' }) + `for (let k=0;k<40;k++){ const s=window.__em.state(); if(!s||s.done) break; const m=window.__em.bestMove(); if(m) await window.__em.play(m); for(let j=0;j<200 && !(window.__em.state()?.ready||window.__em.state()?.done);j++) await new Promise(r=>setTimeout(r,50)); } ` + sleep(6000)],
};
const jobs = Object.entries(ALL).filter(([k]) => !SCREENS.length || SCREENS.includes(k));

const CHECK = `(() => {
  const vw = innerWidth, vh = innerHeight, out = [];
  const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0.05 && !el.closest('[hidden],[inert],.is-leaving'); };
  const btns = [...document.querySelectorAll('button, [role=button], .kit-back')].filter(vis).filter((b) => !b.closest('.xg-skip[data-state=waiting]'));
  const name = (b) => (b.className && typeof b.className === 'string' ? '.' + b.className.split(' ')[0] : b.tagName) + (b.textContent ? '「' + b.textContent.trim().slice(0, 8) + '」' : '');
  for (const b of btns) { const r = b.getBoundingClientRect();
    if (r.width < 43.5 || r.height < 43.5) out.push('small ' + name(b) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
    if (r.left < -0.5 || r.top < -0.5 || r.right > vw + 0.5 || r.bottom > vh + 0.5) out.push('outside ' + name(b) + ' ' + [r.left, r.top, r.right, r.bottom].map(Math.round)); }
  for (let i = 0; i < btns.length; i++) for (let j = i + 1; j < btns.length; j++) { const a = btns[i], b = btns[j]; if (a.contains(b) || b.contains(a)) continue; const p = a.getBoundingClientRect(), q = b.getBoundingClientRect();
    if (p.left < q.right - 1 && q.left < p.right - 1 && p.top < q.bottom - 1 && q.top < p.bottom - 1) out.push('overlap ' + name(a) + ' / ' + name(b)); }
  const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n; const small = new Set();
  while ((n = tw.nextNode())) { const t = n.textContent.trim(); if (!t) continue; const el = n.parentElement; if (!el || !vis(el)) continue; const fs = parseFloat(getComputedStyle(el).fontSize); if (fs < 13) small.add(t.slice(0, 10) + '@' + fs); }
  if (small.size) out.push('tinytext ' + [...small].slice(0, 6).join(' | '));
  // horizontal clipping of text blocks (scrollWidth > clientWidth with overflow hidden)
  for (const el of document.querySelectorAll('#app *, .xg-scrim *, .em-intro-scrim *')) { if (!vis(el)) continue; const cs = getComputedStyle(el); if ((cs.overflow === 'hidden' || cs.textOverflow === 'ellipsis') && el.scrollWidth > el.clientWidth + 2 && el.children.length === 0 && el.textContent.trim()) out.push('clipped ' + name(el)); }
  if (document.documentElement.scrollWidth > vw + 1) out.push('hscroll ' + document.documentElement.scrollWidth);
  return out;
})()`;

const browser = await webkit.launch();
const report = [];
try {
  for (const dev of ONLY) {
    const context = await browser.newContext({ ...DEVICES[dev], locale: 'zh-CN' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
    const dir = path.join(OUT, dev);
    fs.mkdirSync(dir, { recursive: true });
    let first = true;
    for (const [name, [q, js]] of jobs) {
      await page.goto(`http://localhost:${PORT}/emoji-match/${q}`, { waitUntil: 'load' });
      if (q) {
        await page.waitForSelector('#app[data-ready]', { timeout: 20000 }).catch(() => errors.push('no data-ready'));
        if (first) { await page.evaluate(() => localStorage.removeItem('kg:v1:emoji-match')); first = false; }
        await page.evaluate(() => localStorage.removeItem('kg:v1:emoji-match'));
        await page.reload(); await page.waitForSelector('#app[data-ready]', { timeout: 20000 }).catch(() => {});
      } else await page.waitForTimeout(1500);
      if (js) await page.evaluate(`(async () => { ${js} })()`).catch((e) => errors.push(`${name} js: ${e.message}`));
      await page.screenshot({ path: path.join(dir, `${name}.png`) });
      const f = await page.evaluate(CHECK);
      report.push(`${dev}/${name}: ${f.length ? f.join('; ') : 'ok'}`);
    }
    if (errors.length) report.push(`${dev} ERRORS ${errors.slice(0, 8).join(' || ')}`);
    await context.close();
  }
} finally {
  await browser.close();
}
console.log(report.join('\n'));
