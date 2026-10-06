#!/usr/bin/env node
// Stage-2 flow checks for 星晶消消乐 against the dev server (WebKit, iPad 9 sizes, DPR 2, touch):
// intro cards, tools (aim / fire / cancel / limit), puzzles, free mode, arrival, hangar, parent PIN.
//   node tests/emoji-match/flow2.mjs <scenario|all> [--land] [--port=5305]
// One browser at a time, always closed. Shots → ~/kid-games-work/shots/emoji-match/<orientation>/f-*.png
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { webkit, devices } from '@playwright/test';

const args = process.argv.slice(2);
const want = args.find((a) => !a.startsWith('--')) ?? 'all';
const land = args.includes('--land');
const PORT = (args.find((a) => a.startsWith('--port=')) ?? '--port=5305').split('=')[1];
const free = Number((execSync('memory_pressure -Q | tail -1').toString().match(/(\d+)%/) || [0, 100])[1]);
if (free < 25) { console.error(`memory free ${free}% < 25% — not starting a browser`); process.exit(2); }
const dir = path.join(os.homedir(), 'kid-games-work/shots/emoji-match', land ? 'landscape' : 'portrait');
fs.mkdirSync(dir, { recursive: true });

const won = (ids, stars = 3) => Object.fromEntries(ids.map((id) => [id, { stars, bestLeft: 3, attempts: 1, wins: 1, failStreak: 0 }]));
const allIds = (upTo) => { const out = []; for (let e = 1; e <= 4; e += 1) for (let n = 1; n <= 10; n += 1) { const id = `${e}-${String(n).padStart(2, '0')}`; out.push(id); if (id === upTo) return out; } return out; };


/** click like a finger: the element must be visible and on top at its centre (no actionability wait:
 * breathing buttons never become "stable" for Playwright) */
async function press(page, sel) {
  const loc = page.locator(sel).first();
  await loc.waitFor({ state: 'visible', timeout: 15000 });
  const box = await loc.boundingBox();
  const hit = await page.evaluate(([s, x, y]) => { const el = document.querySelector(s); const at = document.elementFromPoint(x, y); return !!el && !!at && (el === at || el.contains(at)); }, [sel, box.x + box.width / 2, box.y + box.height / 2]);
  if (!hit) throw new Error(`press: ${sel} is covered at its centre`);
  await loc.click({ force: true });
}
/** long press via pointer events (WebKit's emulated mouse does not hold a touch) */
async function hold(page, sel, ms) {
  await page.evaluate((s) => document.querySelector(s).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch', isPrimary: true })), sel);
  await page.waitForTimeout(ms);
  await page.evaluate((s) => document.querySelector(s).dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'touch', isPrimary: true })), sel);
}

const results = [];
const check = (name, ok, info = '') => { results.push({ name, ok, info }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${info ? ` — ${info}` : ''}`); };

const scenarios = {
  async intro(page, shot) {
    await page.evaluate((s) => window.__em.setSave(s), { levels: won(['1-01']), intros: ['swap'], firstRunDone: true });
    await page.evaluate(() => window.__em.goto({ s: 'card', id: '1-02' }));
    await page.waitForTimeout(600);
    await shot('f-card102');
    await press(page, '.em-card__go');
    await page.waitForSelector('.em-intro', { timeout: 5000 });
    await page.waitForTimeout(2300);
    await shot('f-intro-rocket-a');
    await page.waitForTimeout(1500);
    await shot('f-intro-rocket-b');
    const sub = await page.evaluate(() => document.querySelector('.em-intro .kit-subtitle__text')?.textContent ?? '');
    check('intro card shows a subtitle ≤ 15 chars', sub.length > 0 && sub.length <= 15, sub);
    await press(page, '.em-intro__ok');
    await page.waitForFunction(() => window.__em.state()?.ready, null, { timeout: 8000 });
    const seen = await page.evaluate(() => window.__em.save().intros);
    check('intro marked seen', seen.includes('rocket'), JSON.stringify(seen));
    await page.waitForTimeout(500);
    await shot('f-play102-mask');
    // tool card: grants 3 drills the first time
    await page.evaluate((s) => window.__em.setSave(s), { levels: won(allIds('2-01')), intros: ['swap', 'rocket'], boosters: { drill: 0, tractor: 0, ion: 0 }, grants: [] });
    await page.evaluate(() => window.__em.goto({ s: 'card', id: '2-02' }));
    await page.waitForTimeout(400);
    await press(page, '.em-card__go');
    await page.waitForSelector('.em-intro', { timeout: 5000 });
    await page.waitForTimeout(3000);
    await shot('f-intro-drill');
    const g = await page.evaluate(() => window.__em.save());
    check('drill-intro grant ×3 (idempotent id)', g.boosters.drill === 3 && g.grants.includes('drill-intro'), JSON.stringify(g.boosters));
    await press(page, '.em-intro__ok');
    await page.waitForFunction(() => window.__em.state()?.ready, null, { timeout: 8000 });
    await page.waitForTimeout(400);
    await shot('f-play202-tools');
  },
  async tools(page, shot) {
    await page.evaluate((s) => window.__em.setSave(s), { levels: won(allIds('4-01')), intros: ['boosterDrill', 'boosterTractor', 'boosterIon'], boosters: { drill: 2, tractor: 2, ion: 2 }, firstRunDone: true });
    await page.evaluate(() => { window.__em.timeScale(3); window.__em.goto({ s: 'play', id: '4-02' }); });
    await page.waitForFunction(() => window.__em.state()?.ready, null, { timeout: 8000 });
    // drill: aim then cancel by tapping the same tool
    await press(page, '.em-tool[data-id="drill"]');
    await page.waitForTimeout(300);
    check('drill → AIM', await page.evaluate(() => window.__em.aiming()));
    await shot('f-aim-drill');
    await press(page, '.em-tool[data-id="drill"]');
    check('same tool again cancels', !(await page.evaluate(() => window.__em.aiming())));
    // ion: keys + press-preview + fire
    await press(page, '.em-tool[data-id="ion"]');
    await page.waitForTimeout(250);
    await press(page, '.em-dirkey[data-dir="V"]');
    const r = await page.evaluate(() => window.__em.rects());
    const cx = r.ox + 3.5 * r.cell, cy = r.oy + 3.5 * r.cell;
    await page.mouse.move(cx, cy); await page.mouse.down();
    await page.waitForTimeout(250);
    await shot('f-aim-ion');
    await page.mouse.up();
    await page.waitForFunction(() => window.__em.state()?.ready || window.__em.state()?.done, null, { timeout: 10000 });
    const st = await page.evaluate(() => ({ used: window.__em.state().movesUsed, uses: window.__em.toolUses(), inv: window.__em.save().boosters }));
    check('ion fired: no move spent, 1 use, inventory −1', st.used === 0 && st.uses === 1 && st.inv.ion === 1, JSON.stringify(st));
    // tractor: two adjacent cells
    await press(page, '.em-tool[data-id="tractor"]');
    const pair = await page.evaluate(() => { const l = window.__em.legal().filter((m) => m.t === 'swap'); return l[0]; });
    const cell = (i) => ({ x: r.ox + ((i % 7) + 0.5) * r.cell, y: r.oy + (Math.floor(i / 7) + 0.5) * r.cell });
    const a = cell(pair.a), b = cell(pair.b);
    await page.mouse.click(a.x, a.y); await page.waitForTimeout(200);
    await shot('f-aim-tractor');
    await page.mouse.click(b.x, b.y);
    await page.waitForFunction(() => window.__em.state()?.ready || window.__em.state()?.done, null, { timeout: 10000 });
    // third tool use, then the limit
    await page.evaluate(() => window.__em.tool({ t: 'drill', a: 24 }));
    await page.waitForFunction(() => window.__em.state()?.ready || window.__em.state()?.done, null, { timeout: 10000 });
    const u3 = await page.evaluate(() => window.__em.toolUses());
    await press(page, '.em-tool[data-id="drill"]');
    await page.waitForTimeout(200);
    const lim = await page.evaluate(() => ({ aiming: window.__em.aiming(), state: document.querySelector('.em-tool[data-id="drill"]').dataset.state, said: window.__em.voiceLog().slice(-1)[0] }));
    check('4th tool refused (limit 3 per attempt)', u3 === 3 && !lim.aiming && lim.state === 'limit' && lim.said === 'em.booster.limit', JSON.stringify({ u3, ...lim }));
    await shot('f-tools-limit');
    // resume keeps tool ops
    const res = await page.evaluate(() => window.__em.save().resume);
    check('resume records tool ops', res && res.ops.filter((o) => 'b' in o).length === 3 && res.toolUses === 3, JSON.stringify(res?.ops?.length));
  },
  async puzzle(page, shot) {
    await page.evaluate((s) => window.__em.setSave(s), { levels: won(allIds('2-05')), intros: [], firstRunDone: true, puzzles: {} });
    await page.evaluate(() => window.__em.goto({ s: 'map', ep: 2 }));
    await page.waitForTimeout(800);
    await shot('f-map2-puzzle');
    await press(page, '.em-pnode');
    await page.waitForFunction(() => window.__em.state()?.mode === 'puzzle' && window.__em.state()?.ready, null, { timeout: 8000 });
    await page.waitForTimeout(400);
    await shot('f-puzzle2');
    // bulb: H1 then H2
    await press(page, '.em-tool[data-id="hint"]'); await page.waitForTimeout(500);
    await shot('f-puzzle2-h1');
    await press(page, '.em-tool[data-id="hint"]'); await page.waitForTimeout(1200);
    await shot('f-puzzle2-h2');
    // a wrong first move, then undo
    const sol = await page.evaluate(() => window.__em.legal());
    await page.evaluate(() => window.__em.timeScale(3));
    const wrong = sol.find((m) => m.t === 'swap');
    await page.evaluate((m) => window.__em.play(m), wrong);
    await page.waitForFunction(() => window.__em.state()?.ready || window.__em.state()?.done, null, { timeout: 8000 });
    await press(page, '.em-tool[data-id="undo"]'); await page.waitForTimeout(400);
    const after = await page.evaluate(() => window.__em.state().movesUsed);
    check('puzzle undo returns to the start', after === 0, String(after));
    // H3 walkthrough (auto-plays the standard solution, then back to the start)
    await press(page, '.em-tool[data-id="hint"]'); await page.waitForTimeout(1500);
    await shot('f-puzzle2-h3');
    await page.waitForFunction(() => window.__em.state()?.ready && window.__em.state()?.movesUsed === 0, null, { timeout: 25000 });
    // now solve it with the stored solution
    const sol2 = await page.evaluate(() => window.__em.solution());
    for (const m of sol2) {
      await page.evaluate((mv) => window.__em.play(mv), m);
      await page.waitForFunction(() => window.__em.state()?.ready || window.__em.state()?.done, null, { timeout: 10000 });
    }
    await page.waitForSelector('.em-badge-won', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(900);
    await shot('f-puzzle2-solved');
    const ps = await page.evaluate(() => window.__em.save());
    check('puzzle solved, helped (H3), tool +1 once', ps.puzzles.p2?.solved && ps.puzzles.p2.maxHint === 3 && ps.grants.includes('p2'), JSON.stringify(ps.puzzles.p2));
  },
  async free(page, shot) {
    await page.evaluate((s) => window.__em.setSave(s), { levels: won(allIds('1-10')), firstRunDone: true, arrivals: [1] });
    await page.evaluate(() => window.__em.goto({ s: 'route' }));
    await page.waitForTimeout(600);
    await shot('f-route-free-open');
    await press(page, '.em-route__free');
    await page.waitForFunction(() => window.__em.state()?.mode === 'free' && window.__em.state()?.ready, null, { timeout: 8000 });
    await page.evaluate(() => window.__em.timeScale(4));
    for (let k = 0; k < 6; k += 1) {
      const mv = await page.evaluate(() => window.__em.bestMove());
      await page.evaluate((m) => window.__em.play(m), mv);
      await page.waitForFunction(() => window.__em.state()?.ready, null, { timeout: 10000 });
    }
    await shot('f-free');
    await press(page, '.em-tool[data-id="end"]');
    await page.waitForSelector('.xg-modal', { timeout: 5000 }); await page.waitForTimeout(700);
    await shot('f-free-summary');
  },
  async arrival(page, shot) {
    await page.evaluate((s) => window.__em.setSave(s), { levels: won(allIds('1-09')), firstRunDone: true, arrivals: [] });
    await page.evaluate(() => { window.__em.timeScale(4); window.__em.setSeed(3); window.__em.goto({ s: 'play', id: '1-10' }); });
    await page.waitForFunction(() => window.__em.state()?.ready, null, { timeout: 8000 });
    for (let k = 0; k < 40; k += 1) {
      const s = await page.evaluate(() => window.__em.state());
      if (!s || s.done || s.won) break;
      const mv = await page.evaluate(() => window.__em.bestMove());
      await page.evaluate((m) => window.__em.play(m), mv);
      await page.waitForFunction(() => window.__em.state()?.ready || window.__em.state()?.done || window.__em.state()?.won, null, { timeout: 15000 });
    }
    await page.waitForSelector('.xg-modal [data-act="arrive"]', { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(1500);
    await shot('f-win110');
    await press(page, '[data-act="arrive"]');
    await page.waitForTimeout(1200);
    await shot('f-arrive-fly');
    await page.waitForSelector('.em-paint__card', { timeout: 15000 });
    await page.waitForTimeout(600);
    await shot('f-arrive-paint');
    await press(page, '.em-paint__card[data-act="1"]');
    await page.waitForSelector('.em-kcard__art', { timeout: 8000 }); await page.waitForTimeout(700);
    await shot('f-arrive-card');
    await press(page, '[data-act="ok"]');
    // optional steps before the stop card: tools earned (ep 2–4), newly lit constellations
    for (let k = 0; k < 6; k += 1) {
      await page.waitForSelector('.em-talk, .em-sky__card, .em-earn', { timeout: 10000 }); await page.waitForTimeout(700);
      const kind = await page.evaluate(() => (document.querySelector('.em-talk') ? 'stop' : document.querySelector('.em-sky__card') ? 'sky' : 'earn'));
      if (kind === 'stop') break;
      await shot(`f-arrive-${kind}${k}`);
      await press(page, '[data-act="ok"]');
      await page.waitForTimeout(500);
    }
    await shot('f-arrive-stop');
    const s = await page.evaluate(() => window.__em.save());
    check('arrival saved (arrivals + orange flame)', s.arrivals.includes(1) && s.cosmetics.thrusters === '#FF9A3C', JSON.stringify({ a: s.arrivals, c: s.cosmetics }));
    await press(page, '[data-act="route"]');
    await page.waitForTimeout(900);
    await shot('f-route-after1');
  },
  async ending(page, shot) {
    await page.evaluate((s) => window.__em.setSave(s), { levels: won(allIds('4-10')), firstRunDone: true, arrivals: [1, 2, 3], cosmetics: { thrusters: '#FF9A3C', legs: '#E8C35A', arm: '#F4F1EA' }, sky: ['dipper', 'polaris', 'cowherd', 'orion'] });
    await page.evaluate(() => { window.__em.timeScale(3); window.__em.goto({ s: 'arrival', ep: 4 }); });
    await page.waitForSelector('.em-paint__card', { timeout: 15000 }); await page.waitForTimeout(300);
    await press(page, '.em-paint__card[data-act="0"]');
    await page.waitForSelector('.em-kcard__art', { timeout: 8000 }); await page.waitForTimeout(500);
    await press(page, '[data-act="ok"]');
    await page.waitForSelector('.em-earn', { timeout: 8000 }); await page.waitForTimeout(500);
    await shot('f-arrive-earn');
    await press(page, '[data-act="ok"]');
    await page.waitForSelector('.em-sky__card', { timeout: 8000 }); await page.waitForTimeout(1800);
    await shot('f-arrive-sky');
    await press(page, '[data-act="ok"]');
    await page.waitForSelector('.em-ending.is-on', { timeout: 8000 }); await page.waitForTimeout(450);
    await shot('f-ending');
    await page.waitForSelector('.em-talk', { timeout: 15000 }); await page.waitForTimeout(400);
    await shot('f-ending-stop');
  },
  async hangar(page, shot) {
    await page.evaluate((s) => window.__em.setSave(s), { levels: won(allIds('3-10')), firstRunDone: true, arrivals: [1, 2, 3], cosmetics: { thrusters: '#FF9A3C', legs: '#E8C35A' }, puzzles: { p1: { solved: true, attempts: 1, maxHint: 0 }, p2: { solved: true, attempts: 3, maxHint: 3 } }, grants: ['veteran'], intros: ['boosterDrill', 'boosterTractor'], boosters: { drill: 4, tractor: 2, ion: 0 } });
    await page.evaluate(() => window.__em.goto({ s: 'hangar' }));
    await page.waitForTimeout(700);
    await shot('f-hangar-cards');
    await press(page, '.em-tab[data-tab="sky"]'); await page.waitForTimeout(300);
    await shot('f-hangar-sky');
    await press(page, '.em-tab[data-tab="badges"]'); await page.waitForTimeout(300);
    await shot('f-hangar-badges');
    await press(page, '.em-tab[data-tab="tools"]'); await page.waitForTimeout(300);
    await shot('f-hangar-tools');
    await press(page, '.em-tab[data-tab="sky"]'); await page.waitForTimeout(200);
    await press(page, '[data-item="sky:orion"]'); await page.waitForTimeout(1600);
    await shot('f-hangar-orion');
  },
  async parent(page, shot) {
    await page.evaluate(() => window.__em.goto({ s: 'route' }));
    await page.waitForTimeout(500);
    await hold(page, '.em-route__title span', 3300);
    await page.waitForSelector('.em-parent', { timeout: 4000 });
    await page.waitForTimeout(400);
    await shot('f-parent-pin');
    const hasReset = await page.evaluate(() => !!document.querySelector('[data-act="reset"]'));
    check('no reset button before the PIN', !hasReset);
  },
};

const browser = await webkit.launch();
try {
  const ctx = await browser.newContext({ ...devices['iPad (gen 7)'], viewport: land ? { width: 1080, height: 810 } : { width: 810, height: 1080 }, locale: 'zh-CN' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 200)}`); });
  const shot = async (name) => { await page.screenshot({ path: path.join(dir, `${name}.png`) }); console.log(`  shot ${land ? 'landscape' : 'portrait'}/${name}.png`); };
  for (const [name, fn] of Object.entries(scenarios)) {
    if (want !== 'all' && want !== name) continue;
    await page.goto(`http://localhost:${PORT}/emoji-match/?test=1`);
    await page.waitForSelector('#app[data-ready]', { timeout: 15000 });
    await page.evaluate(() => localStorage.clear());
    await page.goto(`http://localhost:${PORT}/emoji-match/?test=1`);
    await page.waitForSelector('#app[data-ready]', { timeout: 15000 });
    console.log(`— ${name}`);
    try { await fn(page, shot); } catch (e) { check(`${name} ran`, false, e.message.split('\n')[0]); await shot(`f-${name}-error`); }
  }
  if (errors.length) console.log('ERRORS', errors.slice(0, 12));
  await ctx.close();
} finally { await browser.close(); }
const bad = results.filter((r) => !r.ok);
console.log(`${results.length - bad.length}/${results.length} checks passed`);
process.exitCode = bad.length ? 1 : 0;
