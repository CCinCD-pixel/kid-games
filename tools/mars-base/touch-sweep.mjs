#!/usr/bin/env node
/**
 * 火星基地 REAL-TOUCH SWEEP (QA fix-mars-r2 -> permanent gate). Every stage signature (family | ask | typed | hands | lo/hi) is played the way a child plays it:
 * Playwright `touchscreen.tap` for every button / key / card / cart / tool, real drags for the number-line flag (Chromium: CDP touch events; WebKit has no touch drag
 * in Playwright, so a mouse pointer drag there — run `--engine chromium --sigs nl.` for the real touch drag). The test hook only SETS UP the item (`__mars.playSig`
 * = a one-item mission through the normal runner) and READS the runner state; it never answers for the child.
 *
 *   per signature (quick mode):  1. WRONG path  — a plausible wrong answer x3 (H1 -> H2 -> H3 on the real hint ladder), then the assisted finish (✓ with the answer shown)
 *                                2. the TWIN the runner deals after an assisted finish — answered RIGHT by touch   (= the correct path)
 *                                (signatures with no wrong path — open orders, cert / calibration items — are answered right once)
 *   FAIL when: an item is not accepted by the real touches, the wrong path never completes, anything stalls > 20 s, a control is covered by another element at its centre
 *   (hit audit), a console / page error appears, a result card sits outside the viewport.
 *
 *   node tools/mars-base/touch-sweep.mjs [--mode quick|spot|full] [--vp ipad-p|ipad-l|phone-p|se|phone-l] [--engine webkit|chromium] [--sigs a,b|prefix.] [--no-wrong]
 *        [--base http://localhost:5323/mars-base/] [--tag name] [--list]
 *   quick  every live signature, one mission each (iPad portrait; ~20 min)        spot  ~25 representative signatures (phone / landscape spot runs; ~6 min)
 *   full   whole missions of every ready node at ladder levels 1 and 4 (--level 1|4), wrong path once per signature (what QA ran by hand; ~40 min per level)
 *   Needs a server: `npx vite --port 5323 --strictPort` (dev) or `npx vite preview --config tools/mars-base/vite.scoped.config.ts --port 5323 --strictPort` (e2e-all.sh does that).
 *   Silence: the kit auto-mutes under WebDriver and tools/qa/mute-audio.js is injected; Chromium runs with --mute-audio. Exit code 0 = no failure. Report: ~/kid-games-work/state/rr/touch-sweep/<tag>.json
 */
import { webkit, chromium, devices } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); if (i < 0) return d; const v = process.argv[i + 1]; return v === undefined || v.startsWith('--') ? true : v; };
const MODE = arg('mode', 'quick'); const VPN = arg('vp', 'ipad-p'); const ENGINE = arg('engine', 'webkit'); const BASE = arg('base', process.env.BASE ?? 'http://localhost:5323/mars-base/');
const WRONG = !process.argv.includes('--no-wrong'); const LEVEL = Number(arg('level', 1)); const TAG = arg('tag', `${MODE}-${VPN}-${ENGINE}`); const SHOTS_ON = process.argv.includes('--shots'); const STALL_MS = 20000; const LIST = process.argv.includes('--list');
const ONLY = arg('sigs', null) ? String(arg('sigs')).split(',') : null;
const OUT = path.join(os.homedir(), 'kid-games-work/state/rr/touch-sweep'); const SHOTS = path.join(os.homedir(), 'kid-games-work/shots/rr/touch-sweep'); fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(SHOTS, { recursive: true });
const MUTE = path.join(ROOT, 'tools/qa/mute-audio.js');
import { DEAD_SIGS } from './touch-sweep-sigs.mjs';   // documented dead signatures (see that file + validate/dead-sigs.test.ts)
/** `spot` mode: the stage kinds a phone / landscape layout can break (trays, 3-digit carts, cells, arrays, pods, number line) — a few signatures each. */
const SPOT = ['pv3.build|||hands|lo', 'pv3.pack|||hands|lo', 'pv2.build|||hands|lo', 'add.carry1|||hands|lo', 'sub.borrow1|||hands|lo', 'sub.2d2d|||hands|lo', 'sub.2d2d||typed|hands|lo', 'pv3.addHund|||hands|lo', 'pv3.read|||hands|lo',
  'col.add|||hands|lo', 'col.sub||||hi', 'mul.write|sum||hands|lo', 'mul.split|||hands|lo', 'mul.compareArr|||hands|lo', 'mul.equalCheck|||hands|lo', 'mul.equalCheck||||hi', 'mul.array|||hands|lo', 'mul.array|cols||hi', 'mul.commute||||hi',
  'open.arrays||||hi', 'open.groups||||hi', 'mul.groups|count||hands|lo', 'mul.groups|size||hands|lo', 'nl.place||||lo', 'nl.read||typed||lo', 'pv3.counter||||hi', 'rel.compare||||hi'];

const { defaultBrowserType: _a, ...iphone13 } = devices['iPhone 13']; const { defaultBrowserType: _b, ...iphoneSE } = devices['iPhone SE'];
const touch = { deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const VP = { 'ipad-p': { ...touch, viewport: { width: 810, height: 1080 } }, 'ipad-l': { ...touch, viewport: { width: 1080, height: 810 } }, 'phone-p': { ...iphone13, viewport: { width: 390, height: 664 } }, 'se': { ...iphoneSE, viewport: { width: 320, height: 568 } }, 'phone-l': { ...iphone13, viewport: { width: 844, height: 390 } } };
const LIT = { state: 'lit', attempts: 1, at: 1 };
const PLAY_SAVE = { onboarded: true, session: { index: 1, lastActiveAt: Date.now(), missions: 3 }, cert: { C1: LIT, C2: LIT, C3: LIT }, probes: { vault: { done: true }, factory: { done: true }, balance: { done: true } } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T0 = Date.now(); const log = (...a) => console.log(`[${((Date.now() - T0) / 1000).toFixed(0)}s]`, ...a);

// ------------------------------------------------------------------------------------------------ browser + real input
async function openGame() {
  const browser = await (ENGINE === 'chromium' ? chromium : webkit).launch(ENGINE === 'chromium' ? { args: ['--mute-audio'] } : {});
  const ctx = await browser.newContext({ ...VP[VPN], locale: 'zh-CN', timezoneId: 'Asia/Shanghai' });
  await ctx.addInitScript({ path: MUTE });
  await ctx.addInitScript(() => { try { localStorage.setItem('kg:settings:v1', JSON.stringify({ skipIntros: true, narration: false })); } catch { /* blocked */ } });
  const page = await ctx.newPage(); const env = { browser, ctx, page, errors: [], cdp: ENGINE === 'chromium' ? await ctx.newCDPSession(page) : null };
  page.on('pageerror', (e) => env.errors.push(`pageerror: ${e.message.slice(0, 160)}`));
  page.on('console', (m) => { if (m.type() === 'error') env.errors.push(`console: ${m.text().slice(0, 160)}`); });
  page.on('requestfailed', (r) => env.errors.push(`reqfail: ${r.url().split('/').slice(-2).join('/')}`));
  page.on('response', (r) => { if (r.status() >= 400) env.errors.push(`http${r.status()}: ${r.url().split('/').slice(-3).join('/')}`); });
  await page.goto(`${BASE}?test=1`);
  await tapSel(env, '.kit-start__go', { optional: true, timeout: 8000 });
  await page.waitForSelector('#app[data-ready]', { timeout: 15000 }); await page.waitForFunction(() => !!window.__mars, undefined, { timeout: 15000 });
  await page.evaluate((s) => window.__mars.setSave(s), PLAY_SAVE); await page.waitForSelector('.mb-map', { timeout: 10000 });
  return env;
}
const closeEnv = async (env) => { try { await env.ctx.close(); } catch { /* closed */ } try { await env.browser.close(); } catch { /* closed */ } };

/** REAL touch tap at the centre of the visible part of the first match; records a hit-audit issue when another element lies on top of it there. */
async function tapSel(env, sel, { rec = null, optional = false, timeout = 2500, noHit = false } = {}) {
  const { page } = env; const loc = page.locator(sel).first(); let info;
  try {
    info = await loc.evaluate((el, noHit) => {   // one round trip: geometry of the visible part + what lies on top of its centre (peers of the same kind - rods side by side with 44 px hit boxes - legitimately overlap)
      el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }); const r = el.getBoundingClientRect(); const vw = innerWidth, vh = innerHeight;
      const x0 = Math.max(0, r.x), x1 = Math.min(vw, r.x + r.width), y0 = Math.max(0, r.y), y1 = Math.min(vh, r.y + r.height); const dis = !!el.disabled || el.getAttribute('aria-disabled') === 'true';
      if (r.width < 1 || r.height < 1 || getComputedStyle(el).visibility === 'hidden') return { gone: true };
      if (x1 - x0 < 2 || y1 - y0 < 2) return { off: true, dis }; const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2; let hit = 'ok';
      if (!noHit) { const t = document.elementFromPoint(cx, cy); if (!t) hit = 'nothing'; else if (el !== t && !el.contains(t)) { const b = t.closest('button'); if (!(b && b !== el && b.className === el.className && b.parentElement === el.parentElement)) hit = `${t.tagName.toLowerCase()}.${String(t.className?.baseVal ?? t.className).split(' ')[0]}`; } }
      return { cx, cy, dis, hit };
    }, noHit, { timeout });
  } catch { if (!optional && rec) rec.issues.push(`missing ${sel}`); return { ok: false, why: 'missing' }; }
  if (info.gone) { if (!optional && rec) rec.issues.push(`missing ${sel}`); return { ok: false, why: 'missing' }; }
  if (info.dis) return { ok: false, why: 'disabled' };
  if (info.off) { rec?.issues.push(`offscreen ${sel}`); return { ok: false, why: 'offscreen' }; }
  if (info.hit !== 'ok') rec?.issues.push(`OBSCURED ${sel} by ${info.hit} (hit audit)`);
  await page.touchscreen.tap(info.cx, info.cy); return { ok: info.hit === 'ok', why: info.hit };
}
async function tapN(env, sel, n, rec, gap = 25) { for (let i = 0; i < n; i++) { const r = await tapSel(env, sel, { rec }); if (['disabled', 'missing', 'offscreen'].includes(r.why)) return false; await sleep(gap); } return true; }
async function dragTo(env, from, to, steps = 14) {
  const { page, cdp } = env;
  if (cdp) {
    const pt = (x, y) => ({ x, y, id: 1, radiusX: 6, radiusY: 6, force: 1 });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt(from.x, from.y)] });
    for (let i = 1; i <= steps; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [pt(from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps)] }); await sleep(16); }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else {
    await page.mouse.move(from.x, from.y); await page.mouse.down();
    for (let i = 1; i <= steps; i++) { await page.mouse.move(from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps); await sleep(16); }
    await page.mouse.up();
  }
}

// ------------------------------------------------------------------------------------------------ reading the runner
const itemNow = (page) => page.evaluate(() => { const i = window.__mars?.item?.(); return i ? { key: i.key, fam: i.fam, ask: i.ask, typed: i.typed, buildFirst: i.buildFirst, level: i.level, mode: i.mode, slot: i.slot, params: i.params, node: i.node } : null; }).catch(() => null);
const stateNow = (page) => page.evaluate(() => window.__marsItem?.state?.() ?? null).catch(() => null);
const missionUp = (page) => page.evaluate(() => !!document.querySelector('.mb-mission')).catch(() => false);
const commText = (page) => page.evaluate(() => document.querySelector('.mb-comm-text')?.textContent ?? '').catch(() => '');
const sigOf = (it) => [it.fam, it.ask ?? '', it.typed ? 'typed' : '', it.buildFirst ? 'hands' : '', it.level <= 2 ? 'lo' : 'hi'].join('|');
/** wait until the item on screen is no longer `key` (a twin, the next item) or the mission is over; 'stall' after 20 s */
async function waitChange(env, key, ms = STALL_MS) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (!(await missionUp(env.page))) return 'end'; const k = await env.page.evaluate(() => window.__mars?.item?.()?.key ?? null).catch(() => null); if (k && k !== key) return 'next'; await sleep(70); }
  return 'stall';
}
/** after a submission: wait until the runner has counted it (subs >= n) and its demo is over (not locked); 'next' / 'end' when the item left; 'timeout' when the ✓ was not an attempt (blocked, empty) */
async function waitSubs(env, key, n, ms = 9000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (!(await missionUp(env.page))) return 'end'; const k = (await itemNow(env.page))?.key; if (k && k !== key) return 'next';
    const s = await stateNow(env.page); if (s && s.subs >= n && !s.locked) return s; await sleep(70);
  }
  return 'timeout';
}
/** the stage has stopped changing (H2 / H3 autoplay of the tray, ghost hands, demos) */
async function quiet(env, ms = 1100, max = 15000) {
  const t0 = Date.now(); let last = ''; let since = Date.now();
  while (Date.now() - t0 < max) {
    if (await env.page.evaluate(() => !!window.__marsTray?.busy || !!document.querySelector('.xg-ghost-hand.is-on')).catch(() => false)) { since = Date.now(); await sleep(120); continue; }   // the tray's ghost play / the ghost hand of an H3 demo is still running
    const h = await env.page.evaluate(() => { const s = document.querySelector('.mb-stage'); return s ? `${s.innerHTML.length}:${s.textContent?.length}:${document.querySelector('.mb-answer')?.textContent}` : 'x'; }).catch(() => 'x'); if (h !== last) { last = h; since = Date.now(); } else if (Date.now() - since > ms) return true; await sleep(120); }
  return false;
}
/** after a counted wrong attempt: its demo is over (waitSubs) and the hint is applied; only the tray's H2 / H3 ghost play runs on (busy flag) */
async function settleAttempt(env, d) { await sleep(140); const t0 = Date.now(); while (Date.now() - t0 < 15000 && (await env.page.evaluate(() => !!window.__marsTray?.busy || !!document.querySelector('.xg-ghost-hand.is-on')).catch(() => false))) await sleep(100); await sleep(d.kind === 'tray' ? 150 : 60); }
async function detectKind(page) {
  return page.evaluate(() => {
    const st = document.querySelector('.mb-stage'); if (!st) return { kind: 'none' }; const q = (s) => st.querySelector(s);
    const keypad = !!document.querySelector('.mb-keypad .xg-key'); const ok = document.querySelector('.mb-ok'); const okShown = !!ok && !ok.hidden && getComputedStyle(ok).display !== 'none';
    let kind = 'unknown';
    if (q('.nl')) kind = 'nl'; else if (q('.tr-top')) kind = 'tray'; else if (q('.oc')) kind = 'opencmp'; else if (q('.ct')) kind = 'counter'; else if (q('.dc')) kind = 'dictation';
    else if (q('.st-choices')) kind = 'choose'; else if (q('.st-cmp')) kind = 'compare'; else if (q('.bl')) kind = 'belt'; else if (q('.hp')) kind = 'hop'; else if (q('.zm')) kind = 'zoom';
    else if (q('.pd')) kind = 'pods:' + [...q('.pd').classList].find((c) => c.startsWith('pd--')).slice(4); else if (q('.ar')) kind = 'arrays:' + [...q('.ar').classList].find((c) => c.startsWith('ar--')).slice(4);
    else if (q('.st-pic')) kind = 'keypad'; else if (q('.st-fallback')) kind = 'fallback';
    return { kind, keypad, okShown, nlKind: q('.nl')?.dataset.kind ?? null };
  });
}

// ------------------------------------------------------------------------------------------------ the child's touches, per stage kind (err = a plausible WRONG answer)
const tens = (n) => Math.floor(n / 10) % 10; const hund = (n) => Math.floor(n / 100); const bump = (d, max = 9) => (d < max ? d + 1 : d - 1); const wrongNum = (n) => (n < 500 ? n + 1 : n - 1);
/** a WRONG attempt starts from an empty stage (like a child who took everything back), so that repeated wrong attempts never add up to the right answer by accident */
const clearAll = async (env, rec, sel, max = 14) => { for (let i = 0; i < max; i++) { const r = await tapSel(env, sel, { rec, optional: true, timeout: 250, noHit: true }); if (!r.ok) break; await sleep(15); } };
const submit = (env, d, rec) => (d.okShown ? tapSel(env, '.mb-ok', { rec }) : tapSel(env, '.mb-keypad .xg-key--ok', { rec }));
async function clearKeys(env, rec) { for (let i = 0; i < 5; i++) { const empty = await env.page.evaluate(() => document.querySelector('.mb-answer .xg-display')?.classList.contains('is-empty') ?? true); if (empty) return; const r = await tapSel(env, '.mb-keypad .xg-key--del', { rec, optional: true, timeout: 800, noHit: true }); if (!r.ok) return; await sleep(20); } }
async function typeNum(env, v, rec) { await clearKeys(env, rec); for (const ch of String(v)) await tapSel(env, `.mb-keypad .xg-key[data-key="${ch}"]`, { rec }); await sleep(30); }
/** number (one cell) or one value per cell (竖式, 每舱 / 总数, 上面 / 下面 / 一共): type + ✓ per cell */
async function keypadAnswer(env, vals, rec, err) { const arr = Array.isArray(vals) ? vals : [vals]; for (let i = 0; i < arr.length; i++) { await typeNum(env, err && i === 0 ? wrongNum(arr[i]) : arr[i], rec); const r = await tapSel(env, '.mb-keypad .xg-key--ok', { rec }); if (!r.ok && r.why === 'disabled') break; await sleep(80); } }
async function dragFlag(env, v, rec) {
  const g = await env.page.evaluate((val) => { const c = window.__nlCtl; return c ? { x1: c.flagToClientX(0) + 4, x2: c.flagToClientX(val), y: c.trackClientY(), k: c.state.k ?? 1 } : null; }, v);
  if (!g) { rec.issues.push('no __nlCtl (number line not mounted)'); return; }
  await dragTo(env, { x: g.x1, y: g.y - 30 * g.k }, { x: g.x2, y: g.y - 6 }); await sleep(120);
  const placed = await env.page.evaluate(() => window.__nlCtl?.state.flag ?? null);
  if (placed === null) rec.issues.push('the drag did not place the flag'); else if (Math.abs(placed - v) > 1.5 * (v > 100 ? 10 : 1)) rec.issues.push(`flag at ${placed}, wanted ${v}`);
}
async function solve(env, d, it, correct, rec, err) {
  const p = it.params; const f = it.fam; const kind = d.kind; const page = env.page; const T = (sel, n = 1) => tapN(env, sel, n, rec);
  if (kind !== 'nl' && (kind === 'keypad' || (kind === 'dictation' && d.keypad) || (d.keypad && !d.okShown && !['tray', 'counter', 'arrays:compare'].includes(kind))) && (typeof correct === 'number' || Array.isArray(correct))) return keypadAnswer(env, correct, rec, err);
  if (kind === 'nl') {
    if (d.nlKind === 'read') { const L = p.L ?? 100; return keypadAnswer(env, err && typeof correct === 'number' ? (correct < L / 2 ? correct + Math.round(L * 0.4) : correct - Math.round(L * 0.4)) : correct, rec, false); }
    const L = p.L ?? 100; const step = L <= 100 ? 1 : 10; const target = typeof correct === 'number' ? correct : L / 2; const nudge = d.nlKind === 'place' && !err && it.key.length % 2 === 0;
    let v = target; if (err) v = target < L / 2 ? Math.min(L, target + Math.round(L * 0.45)) : Math.max(0, target - Math.round(L * 0.45)); else if (nudge) v = Math.max(0, Math.min(L, target + 2 * step));   // off by two steps, then fixed with the real ◀ ▶ buttons
    await dragFlag(env, v, rec);
    if (nudge && v !== target) { await sleep(120); await T(v > target ? '.nl-btn-l' : '.nl-btn-r', Math.round(Math.abs(v - target) / step)); }
    return submit(env, d, rec);
  }
  if (kind === 'choose') {
    const opts = await page.evaluate(() => [...document.querySelectorAll('.mb-stage .st-choice')].map((b) => b.textContent.trim())); const pick = err ? opts.find((o) => o !== String(correct)) : String(correct);
    const idx = opts.indexOf(pick); if (idx < 0) { rec.issues.push(`choice ${pick} not offered (${opts})`); return null; } return tapSel(env, `.mb-stage .st-choice >> nth=${idx}`, { rec });
  }
  if (kind === 'compare') { const sym = err ? ['>', '<', '='].find((s) => s !== correct.sym) : correct.sym; await tapSel(env, `.st-digit[data-place="${correct.digit}"]`, { rec }); await tapSel(env, `.st-sym[data-sym="${sym}"]`, { rec }); return submit(env, d, rec); }
  if (kind === 'tray') return solveTray(env, d, it, correct, rec, err);
  if (kind === 'counter' || kind === 'dictation') {
    if (f === 'pv3.step') { const pl = p.b >= 100 ? 'h' : p.b >= 10 ? 't' : 'o'; await T(`.ct-arrow[data-${(p.op === '+') !== !!err ? 'up' : 'down'}="${pl}"]`); return submit(env, d, rec); }
    if (err) for (const pl of ['h', 't', 'o']) await clearAll(env, rec, `.ct-arrow[data-down="${pl}"]`, 10);
    const n = typeof correct === 'number' ? correct : p.n; await T('.ct-arrow[data-up="h"]', hund(n)); await T('.ct-arrow[data-up="t"]', tens(n)); const o = n % 10; await T('.ct-arrow[data-up="o"]', err ? bump(o) : o); return submit(env, d, rec);
  }
  if (kind === 'opencmp') { const ab = p.rel === '>' ? { a: 652, b: 341 } : { a: 341, b: 652 }; for (const side of ['a', 'b']) { const n = ab[side]; await T(`.oc [data-side="${side}"] .ct-arrow[data-up="h"]`, hund(n)); await T(`.oc [data-side="${side}"] .ct-arrow[data-up="t"]`, tens(n)); await T(`.oc [data-side="${side}"] .ct-arrow[data-up="o"]`, n % 10); } return submit(env, d, rec); }
  if (kind === 'belt') { for (const v of [...p.xs].sort((a, b) => (err ? b - a : a - b))) await tapSel(env, `.bl-card[data-v="${v}"]`, { rec }); return submit(env, d, rec); }
  if (kind === 'hop') { if (err) await clearAll(env, rec, '.hp-back'); await T('.hp-go', err ? (p.k > 1 ? p.k - 1 : p.k + 1) : p.k); return submit(env, d, rec); }
  if (kind === 'zoom') {
    const t = p.target; const h = Math.floor(t / 100); const shown = await page.evaluate(() => [...document.querySelectorAll('.zm-seg[data-h]')].map((e) => Number(e.dataset.h)));   // wrong = another hundred that IS on screen
    const hh = err ? (shown.find((x) => x !== h) ?? h) : h; await tapSel(env, `.zm-seg[data-h="${hh}"]`, { rec }); await tapSel(env, `.zm-seg[data-t="${Math.floor(t / 10) + (err ? (hh !== h ? (hh - h) * 10 : 0) : 0)}"]`, { rec, optional: true }); return submit(env, d, rec);
  }
  if (kind.startsWith('pods:')) return solvePods(env, d, it, correct, rec, err, kind.slice(5));
  if (kind.startsWith('arrays:')) return solveArrays(env, d, it, correct, rec, err, kind.slice(7));
  rec.issues.push(`no touch solver for kind ${kind} (${f})`); return null;
}
async function solveTray(env, d, it, correct, rec, err) {
  if (err) await tapSel(env, '.tr-tool[data-act="reset"]', { rec, optional: true, timeout: 400, noHit: true });   // a wrong attempt starts from the order's start state (↺ 重来), not on top of the last one: piled-up crystals would only make ✓ 'blocked'
  const p = it.params; const f = it.fam; const T = (sel, n = 1) => tapN(env, sel, n, rec); const ones = (n) => (err ? bump(n % 10) : n % 10);
  if (f === 'pv2.build') { await T('.tr-cart[data-cart="rod"]', tens(p.n)); await T('.tr-cart[data-cart="crystal"]', ones(p.n)); return submit(env, d, rec); }
  if (f === 'pv3.build' || f === 'open.pv3') { const n = f === 'open.pv3' ? ({ any: 357, zeroInside: 306, over500: 724, under300: 248 }[p.rule] ?? 357) : p.n; await T('.tr-cart[data-cart="box"]', hund(n)); await T('.tr-cart[data-cart="rod"]', tens(n)); await T('.tr-cart[data-cart="crystal"]', f === 'open.pv3' ? n % 10 : ones(n)); return submit(env, d, rec); }
  if (f === 'pv3.pack') {
    const rods = err && p.loose === 0 ? Math.max(1, p.rods - 1) : p.rods;
    for (let i = 0; i < rods; i++) { await tapSel(env, '.tr-cart[data-cart="rod"]', { rec }); await sleep(30); if ((await env.page.locator('.tr-mach[data-m="pack"]:not([disabled])').count()) > 0) await tapSel(env, '.tr-mach[data-m="pack"]', { rec }); }
    await T('.tr-cart[data-cart="crystal"]', err && p.loose > 0 ? bump(p.loose) : p.loose); return submit(env, d, rec);
  }
  if (d.keypad && !d.okShown) return keypadAnswer(env, correct, rec, err);
  const plan = await env.page.evaluate(() => window.__marsTray?.plan?.() ?? null); if (!plan) { rec.issues.push('no tray plan'); return null; }
  let tool = 'take'; const setTool = async (t) => { if (tool !== t) { await tapSel(env, `.tr-tool[data-tool="${t}"]`, { rec }); tool = t; } };
  if (err && (f.startsWith('add.') || f === 'pv3.addHund')) { await tapSel(env, '.tr-cart[data-cart="crystal"]', { rec, optional: true, timeout: 800 }); await tapSel(env, '.tr-cart[data-cart="rod"]', { rec, optional: true, timeout: 800 }); }   // a wrong tray answer = ✓ on a start state that was touched (never a half-done plan: that is 'blocked', not a miss)
  for (const a of err ? [] : plan) {
    if (a.op === 'pour') await tapSel(env, `.tr-cart[data-cart="${a.cart}"]`, { rec }); else if (a.op === 'press' || a.op === 'pack') await tapSel(env, `.tr-mach[data-m="${a.op}"]`, { rec });
    else if (a.op === 'ship') { await setTool('take'); await tapSel(env, `.tr-bin[data-bin="${a.part}"] .tr-it >> nth=0`, { rec }); }
    else if (a.op === 'cutRod') { await setTool('cut'); await tapSel(env, '.tr-bin[data-bin="rod"] .tr-it >> nth=0', { rec }); } else if (a.op === 'cutBox') { await setTool('cut'); await tapSel(env, '.tr-bin[data-bin="box"] .tr-it >> nth=0', { rec }); }
    else if (a.op === 'openBundle' || a.op === 'openBoxBundle') await tapSel(env, `.tr-stg-b[data-act="${a.op}"]`, { rec }); else if (a.op === 'moveStaged' || a.op === 'moveStagedRod') await tapSel(env, `.tr-stg-i[data-act="${a.op}"] >> nth=0`, { rec });
    await sleep(35);
  }
  if (d.keypad && !d.okShown) return keypadAnswer(env, correct, rec, err);
  return submit(env, d, rec);
}
async function solvePods(env, d, it, correct, rec, err, sub) {
  const p = it.params; const T = (sel, n = 1) => tapN(env, sel, n, rec);
  if (err && (sub === 'count' || sub === 'size')) await clearAll(env, rec, '.pd-rm');
  if (sub === 'count') { await T('.pd-add', err ? (p.k > 1 ? p.k - 1 : p.k + 1) : p.k); return submit(env, d, rec); }
  if (sub === 'size') { await T('.pd-add', err ? (p.n > 1 ? p.n - 1 : p.n + 1) : p.n); return submit(env, d, rec); }
  if (sub === 'cards') { await tapSel(env, `.cd-card[data-v="${err ? bump(p.n, 9) : p.n}"]`, { rec }); await tapSel(env, `.cd-card[data-v="${p.k}"]`, { rec }); return submit(env, d, rec); }
  if (sub === 'equal') {   // wrong = the OTHER branch (an equal set called 不一样多 / an unequal set called 一样多): the dead end of QA blocker 3
    const sz = p.sizes; const mn = Math.min(...sz); const same = sz.every((x) => x === mn); const sayYes = err ? !same : same;
    if (sayYes) { await tapSel(env, '.pd-yes', { rec }); await tapSel(env, `.cd-card[data-v="${sz[0]}"]`, { rec }); await tapSel(env, `.cd-card[data-v="${sz.length}"]`, { rec }); } else { await tapSel(env, '.pd-no', { rec }); await T('.pd-rm', sz.reduce((a, x) => a + x - mn, 0)); }
    return submit(env, d, rec);
  }
  if (sub === 'open') { let n = 2; for (; n <= 10; n++) if (p.total % n === 0 && p.total / n >= 2 && p.total / n <= 10) break; if (n > 3) await T('.pd-sz >> nth=1', n - 3); else if (n < 3) await T('.pd-sz >> nth=0', 3 - n); await T('.pd-add', p.total / n); return submit(env, d, rec); }
  return null;
}
async function solveArrays(env, d, it, correct, rec, err, sub) {
  const p = it.params; const T = (sel, n = 1) => tapN(env, sel, n, rec); const bumpN = (n) => (err ? (n > 1 ? n - 1 : n + 1) : n);
  if (err && sub === 'missing') await clearAll(env, rec, '[aria-label="拿走一列"]');
  if (err && sub === 'build') { await clearAll(env, rec, '[aria-label="行减一"]'); await clearAll(env, rec, '[aria-label="列减一"]'); }
  if (sub === 'missing') { await T('.ar-keep', typeof correct === 'number' ? Math.max(0, bumpN(correct) - 1) : p.cols - 1); return submit(env, d, rec); }
  if (sub === 'build') { await T('[aria-label="行加一"]', bumpN(p.rows) - 1); await T('[aria-label="列加一"]', p.cols - 1); return submit(env, d, rec); }
  if (sub === 'commute') { await tapSel(env, err ? 'button:text-is("会变")' : 'button:text-is("不变")', { rec }); await tapSel(env, '.ar-turn', { rec }); await sleep(900); await tapSel(env, `.cd-card[data-v="${p.cols}"]`, { rec }); await tapSel(env, `.cd-card[data-v="${err ? bump(p.rows, 9) : p.rows}"]`, { rec }); return submit(env, d, rec); }
  if (sub === 'compare') {   // wrong = the other board (the count typed after it is right): the multi-cell stage with a stage-side part
    const a = p.r1 * p.c1, b = p.r2 * p.c2; const right = a === b ? 0 : a > b ? 1 : 2; const pk = err ? (right === 1 ? 2 : 1) : right;
    await tapSel(env, pk === 0 ? '.ar-eq' : `.ar-pick[data-i="${pk}"]`, { rec }); await keypadAnswer(env, [correct[1]], rec, false); return null;
  }
  if (sub === 'open') {
    const pairs = []; for (let a = 2; a <= 10; a++) { const b = p.total / a; if (Number.isInteger(b) && b >= a && b <= 10) pairs.push([a, b]); }
    let r0 = 1, c0 = 1; for (const [r, c] of pairs.slice(0, 2)) { if (r > r0) await T('[aria-label="行加一"]', r - r0); else if (r < r0) await T('[aria-label="行减一"]', r0 - r); if (c > c0) await T('[aria-label="列加一"]', c - c0); else if (c < c0) await T('[aria-label="列减一"]', c0 - c); r0 = r; c0 = c; await tapSel(env, '.ar-keep', { rec }); }
    return submit(env, d, rec);
  }
  return null;
}

// ------------------------------------------------------------------------------------------------ one item, right path or the whole wrong path
const BLOCKED = /暂存盘里还有晶体|满十要压成一根棒|先把数填上|先试试看/;
async function playItem(env, it, wrong, shotName) {
  const page = env.page; const sig = sigOf(it); const t0 = Date.now(); const nErr0 = env.errors.length;
  const rec = { node: it.node, key: it.key, sig, slot: it.slot, mode: it.mode, path: 'right', issues: [], ms: 0 };
  await sleep(220);   // stage mount animation
  const d = await detectKind(page); rec.kind = d.kind; const correct = await page.evaluate(() => window.__mars.correct());
  if (d.kind === 'fallback') rec.fail = 'FALLBACK STAGE (unplayable)';
  const canWrong = wrong && it.mode === 'normal' && d.kind !== 'fallback' && !it.fam.startsWith('open.') && it.slot !== 'twin';
  const shot = async (n) => { if (shotName) await page.screenshot({ path: path.join(SHOTS, `${TAG}-${shotName}-${n}.png`) }).catch(() => {}); };
  try {
    if (canWrong) {
      rec.path = 'wrong'; const w = (rec.w = { texts: [], hints: [] });
      let counted = 0;
      for (let guard = 0; guard < 8 && counted < 3; guard++) {
        const s0 = await stateNow(page); const subs0 = s0?.subs ?? counted; if (s0?.hint >= 3) break;   // the 💡 key can reach H3 early (tray H2 leaves crystals staged: ✓ is not a miss)
        await solve(env, d, it, correct, rec, true);
        let r = await waitSubs(env, it.key, subs0 + 1, 5000);
        if (r === 'timeout') {   // ✓ was not an attempt (empty, a machine entry waiting, staging tray not empty): fill / press the 💡 key (it escalates the ladder) and go on
          const txt = await commText(page);
          if (/先把数填上/.test(txt)) { await solve(env, d, it, correct, rec, true); r = await waitSubs(env, it.key, subs0 + 1, 5000); }
          else if (BLOCKED.test(txt)) {
            if (/满十要压成一根棒/.test(txt)) { for (const m of ['press', 'pack']) await tapSel(env, `.tr-mach[data-m="${m}"]:not([disabled])`, { rec, optional: true, timeout: 300, noHit: true }); await submit(env, d, rec); r = await waitSubs(env, it.key, subs0 + 1, 5000); }   // do what the line says (压棒机), then ✓ again: now it is a plain wrong answer
            if (r === 'timeout') { await tapSel(env, '.mb-hint-btn', { rec, optional: true }); w.hintKey = (w.hintKey ?? 0) + 1; await settleAttempt(env, d); continue; }
          }
          else if ((await stateNow(page))?.hint >= 3) break;
        }
        if (r === 'next' || r === 'end') { w.early = counted; break; }
        if (r === 'timeout') { await shot(`wrong${counted}-timeout`); rec.fail = `the ✓ of wrong attempt ${counted + 1} was never counted (comm: ${(await commText(page)).slice(0, 40)})`; break; }
        counted++; await settleAttempt(env, d); w.texts.push(await commText(page)); w.hints.push(r.hint);
      }
      if (!rec.fail && w.early === undefined) {
        await quiet(env, d.kind === 'tray' ? 1100 : 600); await shot('h3');
        const s = await stateNow(page); w.h3 = s?.hint === 3; const dd = await detectKind(page);
        let c = null; const nCells = (await stateNow(page))?.cells ?? 0;
        if (dd.kind === 'choose') await solve(env, dd, it, correct, rec, false);
        else if (nCells > 0 && dd.keypad) { for (let i = 0; i < nCells + 1 && c === null; i++) { await tapSel(env, '.mb-keypad .xg-key--ok', { rec }); const r = await waitChange(env, it.key, 2500); if (r !== 'stall') c = r; } }   // H3 shows the answer cell by cell: ✓ ✓ ✓
        else await submit(env, dd, rec);   // the answer is shown (H3): the child only presses ✓ (a choice: taps the right button)
        c ??= await waitChange(env, it.key, 7000);
        if (c === 'stall') { w.secondOk = true; await quiet(env); await submit(env, dd, rec); c = await waitChange(env, it.key, 6000); }
        if (c === 'stall') { w.neededSolve = true; await solve(env, dd, it, correct, rec, false); c = await waitChange(env, it.key, STALL_MS); }
        rec.done = c; if (c === 'stall') { rec.fail = 'wrong path never completed (stall > 20 s)'; await shot('stall'); await page.evaluate((a) => window.__mars.answer(a), correct).catch(() => {}); }
        const nxt = await itemNow(page); w.twin = nxt?.slot === 'twin';
      }
    } else {
      await solve(env, d, it, correct, rec, false);
      const c = await waitChange(env, it.key, 7000); rec.done = c;
      if (c === 'stall') { rec.fail = 'right path not accepted by the real touches'; rec.diag = await page.evaluate(() => ({ comm: document.querySelector('.mb-comm-text')?.textContent, ans: document.querySelector('.mb-answer')?.textContent })).catch(() => null); await shot('stall'); await page.evaluate((a) => window.__mars.answer(a), correct).catch(() => {}); await waitChange(env, it.key, 6000); }
    }
  } catch (e) { rec.fail = `driver threw ${String(e.message).split('\n')[0].slice(0, 120)}`; }
  rec.ms = Date.now() - t0; rec.errors = env.errors.slice(nErr0).filter((e) => !e.startsWith('reqfail'));
  if (rec.errors.length) rec.fail ??= `console / page errors: ${rec.errors.slice(0, 2).join(' | ').slice(0, 200)}`;
  const obscured = rec.issues.filter((s) => /OBSCURED|offscreen/.test(s)); if (obscured.length) rec.fail ??= `hit audit: ${[...new Set(obscured)].slice(0, 2).join('; ')}`;
  return rec;
}

/** the result flow after a mission (real taps); `read` also checks the card is inside the viewport */
async function finishResult(env, rec) {
  const { page } = env; const t0 = Date.now(); let seen = false;
  while (Date.now() - t0 < STALL_MS) {
    if (await page.locator('.mb-map').count()) return true;
    if (await page.locator('.xg-modal').count()) {
      if (!seen) { seen = true; await sleep(450); const card = await page.evaluate(() => { const r = document.querySelector('.xg-modal')?.getBoundingClientRect(); return r ? [r.left, r.top, r.right, r.bottom, innerWidth, innerHeight] : null; }); if (card && (card[0] < -0.5 || card[2] > card[4] + 0.5 || card[1] < -0.5 || card[3] > card[5] + 0.5)) rec.issues.push(`result card outside the viewport ${card.map(Math.round)}`); }
      await tapSel(env, '.xg-modal__actions button', { rec, timeout: 3000 }); await sleep(350); continue;
    }
    if (await page.locator('.kit-modal').count()) { await tapSel(env, '.kit-modal__actions button >> nth=1', { rec, timeout: 2000 }); await sleep(350); continue; }
    if (await page.locator('.mb-build').count()) { await tapSel(env, '.mb-build', { rec, timeout: 1500, optional: true, noHit: true }); await sleep(350); continue; }
    await sleep(150);
  }
  rec.issues.push('stuck after the mission (no map in 20 s)'); return false;
}

// ------------------------------------------------------------------------------------------------ the sweeps
const results = { tag: TAG, mode: MODE, vp: VPN, engine: ENGINE, started: new Date().toISOString(), sigs: {}, fails: [], dead: DEAD_SIGS };
const save = () => fs.writeFileSync(path.join(OUT, `${TAG}.json`), JSON.stringify(results, null, 1));
function note(sig, rec, node) {
  const s = (results.sigs[sig] ??= { node, right: null, wrong: null, issues: [] }); const side = rec.path === 'wrong' ? 'wrong' : 'right';
  s[side] = { ok: !rec.fail, ms: rec.ms, kind: rec.kind, done: rec.done, ...(rec.w ? { early: rec.w.early, h3: rec.w.h3, twin: rec.w.twin, hintKey: rec.w.hintKey } : {}), ...(rec.fail ? { fail: rec.fail } : {}) };
  if (rec.issues.length) s.issues.push(...rec.issues.slice(0, 3)); if (rec.fail) results.fails.push({ sig, path: side, node, why: rec.fail });
  log(`${rec.fail ? 'FAIL' : 'ok  '} ${sig} [${rec.kind}${rec.path === 'wrong' ? '/WRONG' : ''}] ${rec.ms}ms${rec.w ? ` h3=${rec.w.h3} twin=${rec.w.twin}` : ''}${rec.fail ? ' :: ' + rec.fail : ''}`);
}
/** a one-item mission of one signature through the normal runner: wrong path, then the twin by the right path */
async function sweepSig(env, sig, where, rightOnly = false) {
  const { page } = env; await page.evaluate((s) => window.__mars.setSave(s), PLAY_SAVE); await page.waitForSelector('.mb-map', { timeout: 8000 });
  if (sig.startsWith('nl.calib')) await page.evaluate((n) => window.__mars.start(n), where.node);   // a calibration is scored over its 12 items: play the node itself
  else if (!(await page.evaluate((x) => window.__mars.playSig(x), sig))) { results.fails.push({ sig, why: 'playSig: unknown signature' }); return; }
  await page.waitForSelector('.mb-mission .mb-stage', { timeout: 8000 }).catch(() => {}); if (await page.locator('.xg-skip[data-state="shown"]').count()) await tapSel(env, '.xg-skip[data-state="shown"]', { optional: true, timeout: 700, noHit: true });
  const t0 = Date.now(); let key = null; let guard = 0; let first = true; let rightSeen = false;
  while (guard++ < 24 && (await missionUp(page))) {
    const it = await itemNow(page); if (!it || it.key === key) { if (Date.now() - t0 > STALL_MS * 3) { results.fails.push({ sig, why: 'mission stalled waiting for the next item' }); break; } await sleep(80); continue; }
    key = it.key; const isr = sigOf(it); const rec = await playItem(env, it, first && WRONG && !rightOnly, SHOTS_ON ? isr.replace(/[^\w]+/g, '_') : null); first = false; note(isr === sig || it.slot === 'twin' ? sig : isr, rec, where.node);
    if (rec.path === 'right' && !rec.fail) rightSeen = true;
  }
  const rr = { issues: [] }; await finishResult(env, rr); if (rr.issues.length) { results.fails.push({ sig, why: rr.issues.join('; ') }); await page.evaluate(() => window.__mars.goMap()).catch(() => {}); }
  if (!rightSeen && !rightOnly && !sig.startsWith('nl.calib')) await sweepSig(env, sig, where, true);   // the wrong path was accepted before H3 (no twin): the RIGHT path of this signature still has to be played once
}
async function runQuick(env) {
  const sigs = await env.page.evaluate(() => window.__mars.stageSigs()); const where = await env.page.evaluate(() => window.__mars.sigWhere());
  if (LIST) { console.log(sigs.join('\n')); return; }
  let todo = sigs.filter((s) => !DEAD_SIGS.includes(s)); if (MODE === 'spot') todo = SPOT.filter((s) => sigs.includes(s)); if (ONLY) todo = todo.filter((s) => ONLY.some((o) => s.startsWith(o) || s === o));
  log(`${TAG}: ${todo.length} signatures (${sigs.length} in the game, ${DEAD_SIGS.length} documented dead)`);
  for (const sig of todo) { try { await sweepSig(env, sig, where[sig] ?? {}); } catch (e) { results.fails.push({ sig, why: `driver threw ${String(e.message).slice(0, 140)}` }); log('THREW', sig, e.message.slice(0, 160)); await env.page.evaluate(() => window.__mars.goMap()).catch(() => {}); } save(); }
}
/** whole missions of every ready node (tags forced to --level), wrong path once per signature */
async function runFull(env) {
  const nodes = await env.page.evaluate(() => window.__mars.nodes()); const wrongDone = new Set(); const seen = new Set(); log(`${TAG}: ${nodes.length} nodes at level ${LEVEL}`);
  for (const node of nodes) {
    await env.page.evaluate(([s, lv]) => { window.__mars.setSave(s); const tags = {}; window.__mars.app.save.tags = new Proxy(tags, { get(t, k) { if (typeof k !== 'string' || k === 'toJSON') return t[k]; if (!(k in t)) t[k] = { level: lv, streak: 0, window: '', tailNoHint: 0, mastered: false, reviews: [], repDown: 0, wrongRun: 0 }; return t[k]; } }); }, [PLAY_SAVE, LEVEL]);
    await env.page.waitForSelector('.mb-map', { timeout: 8000 }); await env.page.evaluate((n) => window.__mars.start(n), node); await env.page.waitForSelector('.mb-mission .mb-stage', { timeout: 8000 }).catch(() => {});
    let key = null; let guard = 0; let stallT = Date.now();
    while (guard++ < 80 && (await missionUp(env.page))) {
      const it = await itemNow(env.page); if (!it || it.key === key) { if (Date.now() - stallT > STALL_MS) { results.fails.push({ sig: node, why: 'mission stalled > 20 s waiting for the next item' }); await env.page.evaluate(() => window.__mars.goMap()).catch(() => {}); break; } await sleep(80); continue; }
      stallT = Date.now(); key = it.key; const sig = sigOf(it); const wantWrong = WRONG && !wrongDone.has(sig) && it.slot !== 'twin'; if (wantWrong) wrongDone.add(sig);
      const rec = await playItem(env, it, wantWrong, null); if (ONLY && !ONLY.some((o) => sig.startsWith(o))) { /* still played: the mission has to go on */ } note(sig, rec, node); seen.add(sig);
    }
    const rr = { issues: [] }; await finishResult(env, rr); if (rr.issues.length) results.fails.push({ sig: node, why: rr.issues.join('; ') }); save();
  }
}
const env = await openGame();
let code = 0;
try {
  if (MODE === 'full') await runFull(env); else await runQuick(env);
  if (!LIST) {
    results.finished = new Date().toISOString(); results.pageErrors = env.errors; const sigs = Object.values(results.sigs);
    const rightOk = sigs.filter((s) => s.right?.ok || (s.wrong?.twin && s.wrong.ok)).length; const wrongN = sigs.filter((s) => s.wrong).length; const wrongOk = sigs.filter((s) => s.wrong?.ok).length;
    results.summary = { signatures: sigs.length, rightPathOk: rightOk, wrongPathPlayed: wrongN, wrongPathOk: wrongOk, wrongBeforeH3: sigs.filter((s) => s.wrong?.early !== undefined).length, dead: DEAD_SIGS.length, fails: results.fails.length, consoleErrors: env.errors.filter((e) => !e.startsWith('reqfail')).length };
    save(); log(`DONE ${TAG}: ${JSON.stringify(results.summary)}`); for (const f of results.fails.slice(0, 40)) log('  FAIL', f.sig, f.path ?? '', f.why);
    const min = Number(arg('min-sigs', MODE === 'quick' && !ONLY ? 150 : 1)); const hard = env.errors.filter((e) => !e.startsWith('reqfail'));   // a request aborted while the page closes is not a game error
    if (results.fails.length || hard.length || sigs.length < min) { code = 1; if (sigs.length < min) log(`only ${sigs.length} signatures played (< ${min})`); }
  }
} finally { await closeEnv(env); }
process.exit(code);
