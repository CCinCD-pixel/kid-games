import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dir, '../..');
const browser = await chromium.launch({ headless: true, args: ['--mute-audio'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, locale: 'zh-CN' });
await context.addInitScript({ path: path.join(root, 'tools/qa/mute-audio.js') });
const page = await context.newPage();
const origin = process.env.KG_UI_ORIGIN ?? 'http://localhost:5330';

async function start(url) {
  await page.goto(`${origin}${url}`);
  await page.locator('#app[data-ready]').waitFor();
  await page.locator('.kit-start__go').click();
  await page.locator('.kit-start').waitFor({ state: 'hidden' });
}

try {
  await start('/chess/?mute=1');
  await page.locator('[data-lesson="0"]').click();
  await page.locator('.cx-board').waitFor();
  await page.screenshot({ path: path.join(dir, 'skill-chess-current.png') });

  await start('/mars-base/?mute=1');
  await page.locator('[data-stage="add-1"]').click();
  const [a, b] = (await page.locator('.ma-equation').innerText()).match(/\d+/g).map(Number);
  await page.locator('[data-key="0"]').click();
  await page.locator('[data-action="submit"]').click();
  await page.locator('.ma-retry-note').waitFor();
  await page.screenshot({ path: path.join(dir, 'skill-mars-current.png') });

  const proposal = pathToFileURL(path.join(dir, 'skill-flow-proposal.html')).href;
  await page.goto(`${proposal}?game=chess`);
  assert.equal(await page.locator('#chess-next').isDisabled(), true);
  await page.screenshot({ path: path.join(dir, 'skill-chess-proposal.png') });
  await page.locator('.square.goal').click();
  await page.locator('.lesson-status.success').waitFor();
  assert.equal(await page.locator('#chess-next').isEnabled(), true);
  await page.screenshot({ path: path.join(dir, 'skill-chess-success.png') });
  await page.locator('#chess-next').click();
  await page.locator('.square.goal').click();
  assert.equal(await page.locator('#chess-next').isDisabled(), true);
  await page.locator('.square:has(img)').click();
  await page.locator('.square.goal').click();
  assert.equal(await page.locator('#chess-next').isEnabled(), true);

  await page.goto(`${proposal}?game=mars&a=${a}&b=${b}`);
  assert.equal(await page.locator('#mars-status').isHidden(), true);
  await page.screenshot({ path: path.join(dir, 'skill-mars-proposal.png') });
  for (const digit of String(a + b)) await page.locator(`[data-key="${digit}"]`).click();
  await page.locator('#mars-submit').click();
  await page.locator('#mars-status').waitFor({ state: 'visible' });
  assert.match(await page.locator('#mars-status').innerText(), /自己算出来了/);
  await page.screenshot({ path: path.join(dir, 'skill-mars-success.png') });

  for (const viewport of [{ width: 320, height: 568 }, { width: 844, height: 390 }, { width: 810, height: 1080 }]) {
    await page.setViewportSize(viewport);
    for (const game of ['chess', 'mars']) {
      await page.goto(`${proposal}?game=${game}&a=${a}&b=${b}`);
      const width = await page.evaluate(() => document.documentElement.scrollWidth);
      if (width > viewport.width + 1) throw new Error(`${game} overflows ${viewport.width}x${viewport.height}: ${width}`);
      if (viewport.width === 844) {
        const action = page.locator(game === 'chess' ? '#chess-hint' : '#mars-submit');
        const box = await action.boundingBox();
        assert.ok(box && box.y + box.height <= viewport.height, `${game} action outside landscape viewport`);
      }
      if (viewport.width === 844) await page.screenshot({ path: path.join(dir, `skill-${game}-landscape.png`) });
    }
  }

  await page.setViewportSize({ width: 900, height: 1020 });
  for (const game of ['chess', 'mars']) {
    await page.goto(pathToFileURL(path.join(dir, `skill-${game}-comparison.html`)).href);
    await page.screenshot({ path: path.join(dir, `skill-${game}-comparison.png`), fullPage: true });
  }
} finally {
  await browser.close();
}
