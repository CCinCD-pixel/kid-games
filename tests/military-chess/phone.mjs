#!/usr/bin/env node
// Phone sweep for 陆战棋 (Dad's feedback 2026-10-08): shoot every screen on phone portrait (iPhone 13
// Safari 390×664, iPhone SE 320×568) and phone landscape (844×390) [--ipad adds 810×1080 / 1080×810]
// and audit each shot: text ≥ 13 px on screen (stage scale included), piece names ≥ 14 px on 390,
// tap targets ≥ 44 px, everything inside the viewport, no two buttons overlapping, no page scroll.
//   node tests/military-chess/phone.mjs [job…] [--port=5303] [--only=p390,p320,l844,ipad-p,ipad-l] [--ipad]
//        [--out=<dir>] [--wait=ms]
// job = a built-in name (see JOBS) or name=<route json>. One browser, always closed; pages load the kit →
// auto-muted under automation (never audible). Shots → <out>/<project>/<job>.png (+ audit.txt).
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { webkit, devices } from '@playwright/test';

const args = process.argv.slice(2);
const opt = (k, d) => args.find((a) => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=') ?? d;
const PORT = opt('port', '5303');
const ONLY = opt('only', '').split(',').filter(Boolean);
const WAIT = Number(opt('wait', '1100'));
const OUT = opt('out', path.join(os.homedir(), 'kid-games-work/shots/fb1/military-chess/sweep'));
const free = Number((execSync('memory_pressure -Q | tail -1').toString().match(/(\d+)%/) || [0, 100])[1]);
if (free < 25) { console.error(`memory free ${free}% < 25% — not starting a browser`); process.exit(2); }

const phone = { isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
const PROJECTS = [
  { name: 'p390', ctx: { ...devices['iPhone 13'], deviceScaleFactor: 2, viewport: { width: 390, height: 664 } } },
  { name: 'p320', ctx: { ...devices['iPhone SE'], viewport: { width: 320, height: 568 } } },
  { name: 'l844', ctx: { ...phone, userAgent: devices['iPhone 13'].userAgent, viewport: { width: 844, height: 390 } } },
  { name: 'ipad-p', ipad: true, ctx: { ...devices['iPad (gen 7)'], deviceScaleFactor: 1, viewport: { width: 810, height: 1080 } } },
  { name: 'ipad-l', ipad: true, ctx: { ...devices['iPad (gen 7)'], deviceScaleFactor: 1, viewport: { width: 1080, height: 810 } } },
].filter((p) => (ONLY.length ? ONLY.includes(p.name) : !p.ipad || args.includes('--ipad')));

const go = (r) => `window.__mc.app.go(${JSON.stringify(r)})`;
const pos = (pieces, o) => `window.__mc.position(${JSON.stringify(pieces)}, ${JSON.stringify(o)})`;
const FAN = { b11: 'r9^', b12: 'bF^', b1: 'rF^', e7: 'b5^', c3: 'r3', d10: 'b7', a6: 'r6^', d4: 'b2^', e10: 'b4', a1: 'rB', c7: 'bM^' };
/** built-in jobs: setup = expressions run in order (string = evaluate; number = wait ms; {tap:'c6'} = finger tap on a station) */
const JOBS = {
  home: [go({ name: 'home' })],
  ft: [go({ name: 'ft' }), 2600],
  academy: [go({ name: 'academy' })],
  order: [go({ name: 'item', id: 'L1-1' }), 900],
  compare: [go({ name: 'item', id: 'L1-2' }), 900],
  board: [go({ name: 'item', id: 'L1-3' }), 900],
  scene: [go({ name: 'item', id: 'F-1' }), 1500],
  deploy: [go({ name: 'item', id: 'L7-1' }), 900],
  deployfull: [go({ name: 'item', id: 'L7-5' }), 900],
  infer: [go({ name: 'item', id: 'L8-1' }), 900],
  ladder: [go({ name: 'ladder' })],
  endgames: [go({ name: 'endgames' })],
  family: [go({ name: 'family' })],
  medals: [go({ name: 'medals' })],
  rules: [go({ name: 'rules' })],
  parent: [go({ name: 'parent' })],
  match: [pos(FAN, { mode: 'fan', ladder: true, family: false }), 900],
  matchsel: [pos(FAN, { mode: 'fan', ladder: true, family: false }), 700, { tap: 'a6' }, 500],
  matchfam: [pos(FAN, { mode: 'fan' }), 900],
  matchface: [pos(FAN, { mode: 'fan', seating: 'face' }), 900],
  menu: [pos(FAN, { mode: 'fan', ladder: true, family: false }), 700, `document.querySelector('[data-testid="menu"]').click()`, 700],
  // no blue mine left → the flag lock is open: 司令 b11 takes the flag on b12
  result: [pos({ ...FAN, c7: 'b6^' }, { mode: 'fan', ladder: true, family: false }), 700, { tap: 'b11' }, 300, { tap: 'b12' }, 4200],
  flagwin: [pos({ ...FAN, c7: 'b6^' }, { mode: 'fan', ladder: true, family: false }), 700, { tap: 'b11' }, 300, { tap: 'b12' }, 700],
  // C6: the 团长 (c6 is empty; d4 … ) — red 6 on a6 is far; use c6 red 5 next to the face-up mine c7
  minewarn: [pos({ ...FAN, c6: 'r5^' }, { mode: 'fan', ladder: true, family: false }), 700, { tap: 'c6' }, 300, { tap: 'c7' }, 700],
};
const jobs = args.filter((a) => !a.startsWith('--')).map((a) => {
  const i = a.indexOf('=');
  if (i < 0) return { name: a, steps: JOBS[a] ?? (() => { throw new Error(`unknown job ${a}`); })() };
  return { name: a.slice(0, i), steps: [go(JSON.parse(a.slice(i + 1)))] };
});
if (!jobs.length) for (const [name, steps] of Object.entries(JOBS)) jobs.push({ name, steps });

/** in-page audit (CSS px on screen) */
function audit() {
  const out = [];
  const W = innerWidth, H = innerHeight;
  const shown = (el) => {
    for (let e = el; e && e !== document.documentElement; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.05) return false;
    }
    const r = el.getBoundingClientRect();
    return r.width > 1 && r.height > 1;
  };
  const label = (el) => (el.dataset?.testid || el.getAttribute?.('aria-label') || el.textContent || el.className?.baseVal || el.className || el.tagName).toString().trim().replace(/\s+/g, ' ').slice(0, 24);
  // text size
  const small = new Map();
  const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = tw.nextNode())) {
    const t = n.textContent.trim();
    if (!t) continue;
    const el = n.parentElement;
    if (!el || el.closest('script,style,#mc-piece-defs,.xg-ghost-hand') || !shown(el)) continue;
    let px;
    if (el instanceof SVGElement) {
      const m = el.getScreenCTM();
      px = parseFloat(el.getAttribute('font-size') || getComputedStyle(el).fontSize) * (m ? Math.hypot(m.a, m.b) : 1);
    } else {
      const k = el.offsetWidth ? el.getBoundingClientRect().width / el.offsetWidth : 1;
      px = parseFloat(getComputedStyle(el).fontSize) * k;
    }
    // piece names (two characters) must be ≥ 14 px on a 390-px-wide portrait phone; everything else ≥ 13
    const piece = el.closest('.mc-tile, .mc-piece') != null && /[\u4e00-\u9fff]{2}/.test(t);
    const min = piece ? (W >= 390 && W < H ? 14 : 13) : 13;
    if (px < min - 0.05) {
      const key = `${t.slice(0, 8)}@${px.toFixed(1)}${piece ? '(piece)' : ''}`;
      small.set(key, (small.get(key) ?? 0) + 1);
    }
    const r = el.getBoundingClientRect();
    const svg = el instanceof SVGElement ? el.ownerSVGElement : null;
    const clip = svg ? svg.getBoundingClientRect() : null;
    const clipped = clip && (r.right < clip.left || r.left > clip.right || r.bottom < clip.top || r.top > clip.bottom);
    if (!clipped && (r.right > W + 1 || r.bottom > H + 1 || r.left < -1 || r.top < -1)) out.push(`outside: "${t.slice(0, 12)}" [${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.right)},${Math.round(r.bottom)}]`);
  }
  if (small.size) out.push('small text: ' + [...small].map(([k, c]) => (c > 1 ? `${k}×${c}` : k)).join(', '));
  // tap targets
  const btns = [...document.querySelectorAll('button, a[href], [role="button"], .xg-card, input, select, .kit-back, .xg-skip')].filter((b) => shown(b) && getComputedStyle(b).pointerEvents !== 'none' && !b.disabled);
  for (const b of btns) {
    const r = b.getBoundingClientRect();
    if (r.width < 43.5 || r.height < 43.5) out.push(`small target: ${label(b)} ${Math.round(r.width)}×${Math.round(r.height)}`);
    if (r.right > W + 1 || r.bottom > H + 1 || r.left < -1 || r.top < -1) out.push(`target outside: ${label(b)}`);
  }
  for (let i = 0; i < btns.length; i++) for (let j = i + 1; j < btns.length; j++) {
    const a = btns[i], b = btns[j];
    if (a.contains(b) || b.contains(a)) continue;
    const p = a.getBoundingClientRect(), q = b.getBoundingClientRect();
    if (p.left < q.right - 2 && q.left < p.right - 2 && p.top < q.bottom - 2 && q.top < p.bottom - 2) out.push(`overlap: ${label(a)} / ${label(b)}`);
  }
  if (document.documentElement.scrollWidth > W + 1 || document.documentElement.scrollHeight > H + 1) out.push('page scrolls');
  return out;
}

const browser = await webkit.launch();
const report = [];
try {
  for (const p of PROJECTS) {
    const context = await browser.newContext({ ...p.ctx, locale: 'zh-CN' });
    const page = await context.newPage();
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)); });
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    const dir = path.join(OUT, p.name);
    fs.mkdirSync(dir, { recursive: true });
    for (const j of jobs) {
      await page.goto(`http://localhost:${PORT}/military-chess/?test=1`, { waitUntil: 'load' });
      await page.waitForSelector('#app[data-ready]', { timeout: 15000 }).catch(() => {});
      for (const s of j.steps) {
        if (typeof s === 'number') await page.waitForTimeout(s);
        else if (typeof s === 'string') await page.evaluate(s).catch((e) => errors.push(`${j.name}: ${e.message.slice(0, 120)}`));
        else if (s.tap) { const pt = await page.evaluate((a) => window.__mc.point(a), s.tap); await page.touchscreen.tap(pt.x, pt.y); }
      }
      await page.waitForTimeout(WAIT);
      await page.screenshot({ path: path.join(dir, `${j.name}.png`), scale: 'css' });
      const issues = await page.evaluate(audit);
      const line = `${p.name}/${j.name}: ${issues.length ? '\n    ' + issues.join('\n    ') : 'ok'}`;
      report.push(line);
      console.log(line);
    }
    if (errors.length) { const e = `ERRORS ${p.name}: ${errors.slice(0, 10).join(' | ')}`; report.push(e); console.log(e); }
    await context.close();
  }
} finally {
  await browser.close();
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'audit.txt'), report.join('\n') + '\n');
}
