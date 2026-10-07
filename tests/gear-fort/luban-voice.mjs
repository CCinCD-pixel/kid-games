#!/usr/bin/env node
// 鲁班's own voice (voice2 step): the level preview plays HIS clip (not the narrator's 「鲁班说」), the clip is fetched,
// and every 鲁班 line resolves to a role-luban clip in the running game. WebKit iPad 9 landscape; the kit auto-mutes.
//   node tests/gear-fort/luban-voice.mjs [--port=5391]
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { webkit, devices } from '@playwright/test';

const PORT = (process.argv.find((a) => a.startsWith('--port=')) || '--port=5391').split('=')[1];
const OUT = path.join(os.homedir(), 'kid-games-work/shots/gear-fort/voice2');
const free = Number((execSync('memory_pressure -Q | tail -1').toString().match(/(\d+)%/) || [0, 100])[1]);
if (free < 25) { console.error(`memory free ${free}% < 25% — not starting a browser`); process.exit(2); }
const V1 = ['1-1', '1-2', '1-3', '1-4', '1-5', '1-6', '1-7', '1-8', '1-9', '1-10'];
const save = (ids) => JSON.stringify({ v: 1, updatedAt: Date.now(), data: { levels: Object.fromEntries(ids.map((id) => [id, { best: 2, attempts: 1, firstTry: 'win', wins: 1, lastAt: '' }])), current: '1-11', story: ['prologue', 'dock'] } });
const browser = await webkit.launch();
const R = {};
try {
  const ctx = await browser.newContext({ ...devices['iPad (gen 7)'], viewport: { width: 1080, height: 810 } });
  const page = await ctx.newPage();
  const clips = []; page.on('request', (r) => { if (/\/audio\/gear-fort\/.+\.m4a$/.test(r.url())) clips.push(r.url().split('/').pop()); });
  const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`http://localhost:${PORT}/gear-fort/?test=1`);
  await page.evaluate((s) => { localStorage.clear(); localStorage.setItem('kg:v1:gear-fort', s); }, save(V1));
  await page.goto(`http://localhost:${PORT}/gear-fort/?test=1`, { waitUntil: 'load' });
  await page.getByRole('button', { name: /开始/ }).first().click({ timeout: 8000 }).catch(() => {});
  await page.waitForSelector('#app[data-ready]', { timeout: 15000 }); await page.waitForTimeout(1500);
  R.allLubanVoiced = await page.evaluate(async () => {
    const v = window.__gfApp.voice; await v.narrator.ready();
    const ids = Object.keys(await (await fetch('/audio/gear-fort/audio-manifest.json')).json()).filter((id) => id.startsWith('fort.luban.') || id.startsWith('fort.inn.') || id.startsWith('fort.story.'));
    const luban = ids.filter((id) => v.isLuban(id));
    return { luban: luban.length, voiced: luban.filter((id) => v.hasClip(id) && v.clipMs(id) > 500).length };
  });
  for (const [node, id] of [[7, '1-8'], [10, '1-11']]) {
    await page.locator('.xg-node').nth(node).click(); await page.waitForTimeout(700);
    await page.waitForTimeout(3600);
    R[id] = await page.evaluate(() => ({ line: document.querySelector('.gf-pv__say')?.dataset.line, typed: document.querySelectorAll('.gf-pv__say span.is-in').length, of: document.querySelectorAll('.gf-pv__say span').length, log: window.__gfApp.voice.log.slice(-4) }));
    await page.screenshot({ path: path.join(OUT, `preview-${id}.png`) });
    await page.goBack().catch(() => {}); await page.goto(`http://localhost:${PORT}/gear-fort/?test=1`, { waitUntil: 'load' });
    await page.getByRole('button', { name: /开始/ }).first().click({ timeout: 8000 }).catch(() => {});
    await page.waitForSelector('#app[data-ready]', { timeout: 15000 }); await page.waitForTimeout(1200);
  }
  R.lubanClipsFetched = clips.filter((c) => /^fort\.luban\./.test(c));
  R.narratorFallbackFetched = clips.filter((c) => /^fort\.nar\.luban\./.test(c));
  R.errors = errors;
} finally { await browser.close(); }
console.log(JSON.stringify(R, null, 1));
