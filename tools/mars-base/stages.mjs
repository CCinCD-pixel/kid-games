// Plays 火星基地 missions through the REAL stages (Playwright WebKit, dev server :5323). Usage:
//   node tools/mars-base/stages.mjs <vp[,vp]> <node[,node...]|all> [--shots]
// For the first item of every family it performs real clicks (REAL table); other items are answered through the test hook.
// Checks: no console errors/page errors, no .st-fallback, stage non-empty, answers judged ok, mission completes. Silence: kit auto-mutes under WebDriver.
import { webkit, devices } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const OUT = path.join(os.homedir(), 'kid-games-work/shots/rr/mars');
fs.mkdirSync(OUT, { recursive: true });
const VP = {
  'ipad-p': { viewport: { width: 810, height: 1080 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  'ipad-l': { viewport: { width: 1080, height: 810 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  'phone-p': { ...devices['iPhone 13'], viewport: { width: 390, height: 664 } },
  'se': { ...devices['iPhone SE'], viewport: { width: 320, height: 568 } },
  'phone-l': { ...devices['iPhone 13'], viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true },
};
const vps = (process.argv[2] ?? 'ipad-l').split(',');
const ALL = ['vault.K1.1', 'vault.K1.2', 'vault.K1.3', 'vault.K1.5', 'vault.K1.6', 'vault.K1.7', 'vault.K1.9', 'vault.K2.1', 'vault.K2.2', 'vault.K2.3', 'vault.K2.4', 'vault.K2.5', 'vault.K2.6', 'vault.K2.8', 'orbit.O2.5',
  'factory.P1.1', 'factory.P1.3', 'factory.P1.4', 'factory.P1.5', 'factory.P1.6', 'factory.P1.7', 'factory.P1.10', 'factory.P2.1', 'factory.P2.2', 'factory.P2.3', 'factory.P2.5', 'factory.P2.6', 'factory.P2.7', 'factory.P2.9',
  'cert.C2.2', 'cert.C3.2', 'cert.C3.4', 'cert.C1.4'];
const nodes = (process.argv[3] ?? 'all') === 'all' ? ALL : process.argv[3].split(',');
const shots = process.argv.includes('--shots');
const log = []; const famSeen = new Set(); const summary = {};

const tens = (n) => Math.floor(n / 10) % 10;
async function clickN(page, sel, n) { for (let i = 0; i < n; i++) { await page.click(sel, { timeout: 4000 }); await page.waitForTimeout(40); } }
const ok = (page) => page.click('.mb-ok', { timeout: 4000 });
const OPEN = {
  'open.pv3': (p) => ({ any: 357, zeroInside: 306, over500: 724, under300: 248 }[p.rule]),
};
async function openAnswer(it) {
  const p = it.params;
  if (it.fam === 'open.pv3') { const n = OPEN['open.pv3'](p); return { built: n, said: n }; }
  if (it.fam === 'open.pv3cmp') return p.rel === '>' ? { a: 652, b: 341 } : { a: 341, b: 652 };
  if (it.fam === 'open.groups') { for (let n = 2; n <= 10; n++) if (p.total % n === 0 && p.total / n >= 2) return { n, k: p.total / n }; }
  if (it.fam === 'open.arrays') return { pairs: [[3, 8], [4, 6]] };
  if (it.fam === 'nl.zoom') return { hundred: Math.floor(p.target / 100), ten: Math.floor(p.target / 10) };
  return null;
}
const REAL = {
  'pv2.build': async (page, it) => { const n = it.params.n; await clickN(page, '.tr-cart[data-cart=rod]', tens(n)); await clickN(page, '.tr-cart[data-cart=crystal]', n % 10); await ok(page); },
  'pv3.build': async (page, it) => { const n = it.params.n; await clickN(page, '.tr-cart[data-cart=box]', Math.floor(n / 100)); await clickN(page, '.tr-cart[data-cart=rod]', tens(n)); await clickN(page, '.tr-cart[data-cart=crystal]', n % 10); await ok(page); },
  'pv3.pack': async (page, it) => {
    for (let i = 0; i < it.params.rods; i++) { await page.click('.tr-cart[data-cart=rod]'); await page.waitForTimeout(30); if (await page.locator('.tr-mach[data-m=pack]:not([disabled])').count()) await page.click('.tr-mach[data-m=pack]'); }
    await clickN(page, '.tr-cart[data-cart=crystal]', it.params.loose); await ok(page);
  },
  'pv3.counter': async (page, it) => { const n = it.params.n; await clickN(page, '.ct-arrow[data-up=h]', Math.floor(n / 100)); await clickN(page, '.ct-arrow[data-up=t]', tens(n)); await clickN(page, '.ct-arrow[data-up=o]', n % 10); await ok(page); },
  'pv3.order': async (page, it) => { for (const v of [...it.params.xs].sort((a, b) => a - b)) await page.click(`.bl-card[data-v="${v}"]`); await ok(page); },
  'pv3.skip': async (page, it) => { await clickN(page, '.hp-go', it.params.k); await ok(page); },
  'mul.skip': async (page, it) => { await clickN(page, '.hp-go', it.params.k); await ok(page); },
  'mul.equalCheck': async (page, it) => {
    const sz = it.params.sizes; const mn = Math.min(...sz);
    if (sz.every((x) => x === mn)) { await page.click('.pd-yes'); await page.click(`.cd-card[data-v="${sz[0]}"]`); await page.click(`.cd-card[data-v="${sz.length}"]`); }
    else { await page.click('.pd-no'); await clickN(page, '.pd-rm', sz.reduce((a, x) => a + x - mn, 0)); }
    await ok(page);
  },
  'nl.zoom': async (page, it) => { const t = it.params.target; await page.click(`.zm-seg[data-h="${Math.floor(t / 100)}"]`); await page.click(`.zm-seg[data-t="${Math.floor(t / 10)}"]`); await ok(page); },
  'mul.compareArr': async (page, it) => { const { r1, c1, r2, c2 } = it.params; const a = r1 * c1, b = r2 * c2; await page.click(a === b ? '.ar-eq' : `.ar-pick[data-i="${a > b ? 1 : 2}"]`); await ok(page); },
  'mul.commute': async (page, it) => { await page.click('text=不变'); await page.click('.ar-turn'); await page.waitForTimeout(800); await page.click(`.cd-card[data-v="${it.params.cols}"]`); await page.click(`.cd-card[data-v="${it.params.rows}"]`); await ok(page); },
};
async function realFor(page, it) {
  const f = it.fam; const p = it.params; const ask = it.ask;
  if (f === 'pv3.dictation' && !it.typed) return async () => REAL['pv3.counter'](page, { params: { n: p.n } });
  if (f === 'pv3.step' && !it.typed) return async () => { const pl = p.b >= 100 ? 'h' : p.b >= 10 ? 't' : 'o'; await page.click(`.ct-arrow[data-${p.op === '+' ? 'up' : 'down'}=${pl}]`); await ok(page); };
  if (f === 'mul.groups' && ask === 'count') return async () => { await clickN(page, '.pd-add', p.k); await ok(page); };
  if (f === 'mul.groups' && ask === 'size') return async () => { await clickN(page, '.pd-add', p.n); await ok(page); };
  if (f === 'mul.write' && ask === 'times') return async () => { await page.click(`.cd-card[data-v="${p.n}"]`); await page.click(`.cd-card[data-v="${p.k}"]`); await ok(page); };
  if (f === 'mul.array' && ask === 'cols') return async () => { await clickN(page, '.ar-keep', p.cols - 1); await ok(page); };
  if (f === 'mul.array' && !it.typed) return async () => { await clickN(page, '[aria-label="行加一"]', p.rows - 1); await clickN(page, '[aria-label="列加一"]', p.cols - 1); await ok(page); };
  if (f === 'mul.missingFactor' && !it.typed) return async () => { await clickN(page, '.ar-keep', p.P / p.n - 1); await ok(page); };
  if (['add.tens', 'add.carry1', 'add.2d2d', 'sub.tens', 'sub.borrow1', 'sub.2d2d', 'pv3.addHund'].includes(f) && it.buildFirst) return async () => trayPlanClicks(page);
  return REAL[f] ? async () => REAL[f](page, it) : null;
}
async function trayPlanClicks(page) {
  const plan = await page.evaluate(() => window.__marsTray.plan());
  let tool = 'take'; const setTool = async (t) => { if (tool !== t) { await page.click(`.tr-tool[data-tool=${t}]`); tool = t; } };
  for (const a of plan) {
    if (a.op === 'pour') await page.click(`.tr-cart[data-cart=${a.cart}]`);
    else if (a.op === 'press' || a.op === 'pack') await page.click(`.tr-mach[data-m=${a.op}]`);
    else if (a.op === 'ship') { await setTool('take'); await page.click(`.tr-bin[data-bin=${a.part}] .tr-it >> nth=0`); }
    else if (a.op === 'cutRod') { await setTool('cut'); await page.click('.tr-bin[data-bin=rod] .tr-it >> nth=0'); }
    else if (a.op === 'cutBox') { await setTool('cut'); await page.click('.tr-bin[data-bin=box] .tr-it >> nth=0'); }
    else if (a.op === 'openBundle') await page.click('.tr-stg-b[data-act=openBundle]');
    else if (a.op === 'openBoxBundle') await page.click('.tr-stg-b[data-act=openBoxBundle]');
    else if (a.op === 'moveStaged') await page.click('.tr-stg-i[data-act=moveStaged] >> nth=0');
    else if (a.op === 'moveStagedRod') await page.click('.tr-stg-i[data-act=moveStagedRod] >> nth=0');
    await page.waitForTimeout(30);
  }
  await ok(page);
}

const browser = await webkit.launch();
try {
  for (const name of vps) {
    const ctx = await browser.newContext({ ...VP[name], locale: 'zh-CN' });
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error') log.push(`[${name}] console error: ${m.text().slice(0, 200)}`); });
    page.on('pageerror', (e) => log.push(`[${name}] pageerror: ${e.message.slice(0, 200)}`));
    await page.goto(process.env.BASE ?? 'http://localhost:5323/mars-base/?test=1', { waitUntil: 'networkidle' });
    await page.click('.kit-start__go').catch(() => {});
    await page.waitForSelector('#app[data-ready]');
    await page.waitForTimeout(1500); await page.getByText('跳过').first().click({ timeout: 1200 }).catch(() => {}); await page.waitForTimeout(900);
    const lit = { state: 'lit', attempts: 1, at: Date.now() };
    for (const node of nodes) {
      await page.evaluate((s) => window.__mars.setSave(s), { onboarded: true, session: { index: 3, lastActiveAt: Date.now(), missions: 3 }, cert: { C1: lit, C2: lit, C3: lit }, probes: { vault: { done: true }, factory: { done: true }, balance: { done: true } }, ...JSON.parse(process.env.STAGES_SAVE ?? '{}') });
      await page.waitForSelector('.mb-map'); await page.evaluate((n) => window.__mars.start(n), node);
      let guard = 0;
      while (guard++ < 40) {
        const alive = await page.waitForSelector('.mb-mission .mb-stage', { timeout: 4000 }).then(() => true).catch(() => false);
        if (!alive) break;
        await page.waitForTimeout(250);
        const it = await page.evaluate(() => window.__mars.item());
        if (!it) { await page.waitForTimeout(200); continue; }
        const key = it.fam; const rec = (summary[key] ??= { items: 0, real: 0, issues: [] }); rec.items++;
        const fallback = await page.locator('.st-fallback').count(); if (fallback) rec.issues.push('fallback stage');
        const stageHtml = await page.evaluate(() => document.querySelector('.mb-stage')?.innerHTML.length ?? 0); if (stageHtml < 40) rec.issues.push(`stage empty (${stageHtml})`);
        const warn = await page.evaluate(() => document.querySelector('.mb-mission')?.dataset.layoutWarn); if (warn) rec.issues.push('layoutWarn');
        const overflow = await page.evaluate(() => { const s = document.querySelector('.mb-stage'); if (!s) return 0; const r = s.getBoundingClientRect(); let bad = 0; s.querySelectorAll('button,svg').forEach((e) => { const b = e.getBoundingClientRect(); if (b.width && (b.right > r.right + 2 || b.bottom > r.bottom + 2 || b.left < r.left - 2 || b.top < r.top - 2)) bad++; }); return bad; });
        if (overflow) rec.issues.push(`overflow x${overflow}`);
        if (!famSeen.has(`${name}:${key}`)) {
          famSeen.add(`${name}:${key}`);
          if (shots || true) await page.screenshot({ path: path.join(OUT, `st-${name}-${key.replace('.', '_')}.png`) });
        }
        const real = !famSeen.has(`real:${key}`) ? await realFor(page, it) : null; let delivered = false;
        if (real) {
          famSeen.add(`real:${key}`); rec.real++;
          try { await real(); await page.waitForTimeout(150); const cls = await page.evaluate(() => document.querySelector('.mb-stage')?.className ?? ''); delivered = /is-ok/.test(cls); if (!delivered) { const line = await page.textContent('.mb-comm-text'); rec.issues.push(`real answer not ok: ${line}`); await page.screenshot({ path: path.join(OUT, `st-${name}-${key.replace('.', '_')}-realfail.png`) }); await page.evaluate(() => window.__mars.answer(window.__mars.correct())); } }
          catch (e) { rec.issues.push(`real click failed: ${String(e.message).split('\n')[0].slice(0, 140)}`); await page.screenshot({ path: path.join(OUT, `st-${name}-${key.replace('.', '_')}-realfail.png`) }); await page.evaluate((x) => window.__mars.answer(x), (await openAnswer(it)) ?? (await page.evaluate(() => window.__mars.correct()))); }
        } else {
          const o = await openAnswer(it); const ans = o ?? (await page.evaluate(() => window.__mars.correct())); await page.evaluate((a) => window.__mars.answer(a), ans);
        }
        await page.waitForTimeout(delivered ? 1500 : 1300);
      }
      // result card → back to map
      await page.getByText('回基地').first().click({ timeout: 4000 }).catch(() => {}); await page.getByText('按顺序走').first().click({ timeout: 1500 }).catch(() => {});
      await page.waitForTimeout(200); await page.locator('.mb-build').click({ timeout: 1200 }).catch(() => {}); await page.waitForTimeout(300);
      const onMap = await page.locator('.mb-map').count(); if (!onMap) log.push(`[${name}] ${node}: did not return to the map`);
      console.log(`[${name}] ${node} done`, JSON.stringify(Object.fromEntries(Object.entries(summary).map(([k, v]) => [k, v.issues.length ? [...new Set(v.issues)] : 'ok']))));
    }
    await ctx.close();
  }
} finally { await browser.close(); }
for (const [k, v] of Object.entries(summary)) console.log(`${k.padEnd(18)} items ${String(v.items).padStart(3)} real ${v.real} ${v.issues.length ? 'ISSUES: ' + [...new Set(v.issues)].join(' | ') : 'ok'}`);
console.log(log.join('\n') || 'no console errors');
