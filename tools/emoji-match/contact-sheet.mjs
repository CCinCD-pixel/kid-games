#!/usr/bin/env node
/**
 * 星晶消消乐 contact sheets (spec §9.3, release gate R2): the opening board of every v1 level (seed 1,
 * portrait 810×1080, DPR 2) and each episode's star-map puzzle, one sheet per episode, labelled with
 * the level id, role, moves, goals and its "这关教什么" line — for dad to review the levels' look.
 *   node tools/emoji-match/contact-sheet.mjs [--port=5305]       (dev server running; WebKit, one browser)
 * → ~/kid-games-work/shots/emoji-match/contact-ep{1..4}.png  (+ per-level crops in ~/kid-games-work/emoji-match/contact/)
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { webkit, devices } from '@playwright/test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = (process.argv.find((a) => a.startsWith('--port=')) ?? '--port=5305').split('=')[1];
const OUT = path.join(os.homedir(), 'kid-games-work/shots/emoji-match');
const CROPS = path.join(os.homedir(), 'kid-games-work/emoji-match/contact');
const free = Number((execSync('memory_pressure -Q | tail -1').toString().match(/(\d+)%/) || [0, 100])[1]);
if (free < 25) { console.error(`memory free ${free}% < 25% — not starting a browser (RESOURCE RULES)`); process.exit(2); }
fs.mkdirSync(CROPS, { recursive: true });

const { levels, episodes } = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/emoji-match/levels.json'), 'utf8'));
const { puzzles } = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/emoji-match/puzzles.json'), 'utf8'));
const ALL_INTROS = ['swap', 'rocket', 'tap', 'prop', 'bomb', 'energy', 'orb', 'comboRR', 'dust', 'boosterDrill', 'dust2', 'comboBB', 'comboRB', 'crate', 'boosterTractor', 'crate2', 'comboPP', 'comboP', 'ice', 'boosterIon', 'ice2', 'comboOR'];
const goalText = (o) => ('collect' in o ? `收集 ${o.n}` : 'dust' in o ? '星尘' : 'crate' in o ? '货箱' : 'ice' in o ? '冰壳' : 'energy' in o ? `能量 ${o.energy}` : Object.keys(o)[0]);
const ROLE = { T: '教', E: '练', N: '常', H: '难', B: 'Boss', R: '歇' };

const browser = await webkit.launch();
try {
  const ctx = await browser.newContext({ ...devices['iPad (gen 7)'], viewport: { width: 810, height: 1080 }, deviceScaleFactor: 2, locale: 'zh-CN' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error('pageerror', e.message));
  await page.goto(`http://localhost:${PORT}/emoji-match/?test=1`);
  await page.waitForSelector('#app[data-ready]', { timeout: 20000 });
  // everything introduced and some attempts on record: no masks, no intro cards, no lesson demo hands
  const recs = Object.fromEntries(levels.map((l) => [l.id, { stars: 0, bestLeft: 0, attempts: 1, wins: 0, failStreak: 0 }]));
  await page.evaluate(([r, i]) => { window.__em.setSave({ levels: r, intros: i, boosters: { drill: 0, tractor: 0, ion: 0 } }); window.__em.timeScale(4); }, [recs, ALL_INTROS]);
  const shots = [];
  const shoot = async (id, req, label, sub) => {
    await page.evaluate(([r]) => { window.__em.setSeed(1); window.__em.goto(r); }, [req]);
    await page.waitForFunction(() => window.__em.state()?.ready === true, null, { timeout: 15000 });
    await page.waitForTimeout(350);
    const r = await page.evaluate(() => window.__em.rects());
    const file = path.join(CROPS, `${id}.png`);
    await page.screenshot({ path: file, clip: { x: r.panel.x - 6, y: r.panel.y - 6, width: r.panel.w + 12, height: r.panel.h + 12 } });
    shots.push({ id, file, label, sub, ep: Number(id.startsWith('p') ? puzzles.find((p) => p.id === id).ep : id[0]) });
    console.log('shot', id);
  };
  for (const l of levels) await shoot(l.id, { s: 'play', id: l.id }, `${l.id} · ${ROLE[l.role] ?? l.role} · ${l.moves} 步 · ${l.objectives.map(goalText).join(' + ')}`, l.teach);
  for (const p of puzzles) await shoot(p.id, { s: 'puzzle', id: p.id }, `星图谜题 ${p.id} · par ${p.par}`, p.teach);
  // one sheet per episode: 10 levels + its puzzle, 4 columns
  for (const e of episodes) {
    const items = shots.filter((s) => s.ep === e.ep);
    const html = `<!doctype html><meta charset="utf-8"><style>
      body{margin:0;background:#0c1230;color:#eef0ff;font:500 15px/1.35 -apple-system,"PingFang SC",sans-serif}
      h1{margin:0;padding:22px 28px 6px;font:700 30px/1.2 -apple-system,"PingFang SC",sans-serif;letter-spacing:.06em}
      p.k{margin:0 28px 14px;color:#aab3e0}
      .g{display:grid;grid-template-columns:repeat(4,360px);gap:18px;padding:8px 28px 28px}
      .c{background:#151c45;border-radius:16px;padding:10px;box-shadow:0 6px 0 #070b22}
      .c img{width:100%;display:block;border-radius:10px;background:#0a0f2a}
      .c b{display:block;margin-top:8px;font-weight:700} .c span{display:block;color:#c3c9ee;font-size:14px}
    </style><h1>第 ${e.ep} 站 · ${e.name} · 开局一览（种子 1）</h1><p class="k">每张 = 关卡开局盘面（真引擎、真渲染）；标签：关号 · 角色 · 步数 · 目标；下面一行是"这关教什么"。</p>
    <div class="g">${items.map((s) => `<div class="c"><img src="data:image/png;base64,${fs.readFileSync(s.file).toString('base64')}"><b>${s.label}</b><span>${s.sub}</span></div>`).join('')}</div>`;
    const sheet = await ctx.newPage();
    await sheet.setViewportSize({ width: 28 * 2 + 4 * 360 + 3 * 18, height: 800 });
    await sheet.setContent(html, { waitUntil: 'load' });
    // big data-URL images: make sure every one is decoded and painted before the full-page shot
    await sheet.evaluate(() => Promise.all([...document.images].map((i) => i.decode().catch(() => {}))));
    await sheet.waitForTimeout(400);
    const out = path.join(OUT, `contact-ep${e.ep}.png`);
    await sheet.screenshot({ path: out, fullPage: true });
    await sheet.close();
    console.log('sheet', out);
  }
  await ctx.close();
} finally {
  await browser.close();
}
