/**
 * Platform additions of the 2026-10-13 round, exercised on the lab page (/dev/platform/) and the parent page:
 * nodeMap `skipped` + `nodeSize`, keypad layouts + setEnabled, showResult `confetti:false`, askParentPin (no PIN / wrong /
 * right), registerMetrics → parent 概览, parent 全部解锁 switch, production build is not a dev server.
 * Runs in both smoke viewports against `vite preview` (a production build).
 */
import { expect, test } from '@playwright/test';
import { instrument, isDevServer, probe, watch } from './helpers';

test.describe('platform lab', () => {
  test('loads cleanly in a production build; dev-only switches are off for the child but on under WebDriver', async ({ page }) => {
    await instrument(page);
    const { errors, failed } = watch(page);
    await page.goto('/dev/platform/', { waitUntil: 'load' });
    await page.waitForSelector('#sec-misc #dev-out');
    expect(await isDevServer(page)).toBe(false);
    const out = await page.locator('#dev-out').innerText();
    expect(out).toContain('isDevServer=false');
    expect(out).toContain('isAutomated=true');
    expect((await probe(page)).contexts).toBeLessThanOrEqual(1);
    expect(errors, 'console errors').toEqual([]);
    expect(failed, 'failed requests').toEqual([]);
  });

  test('nodeMap: skipped nodes are marked and tappable; nodeSize 72 / 96 are honoured', async ({ page }) => {
    await page.goto('/dev/platform/?only=map', { waitUntil: 'load' });
    await page.waitForSelector('.pl-map--big .xg-node');
    const skipped = page.locator('.pl-map--land .xg-node--skipped');
    await expect(skipped).toHaveCount(1);
    await expect(skipped).toHaveAttribute('aria-label', /跳过过/);
    await skipped.click();
    await expect(page.locator('.pl-map--land')).toHaveAttribute('data-picked', /:skipped$/);
    const size = (sel: string) => page.locator(sel).first().evaluate((el) => Math.round(el.getBoundingClientRect().width));
    expect(await size('.pl-map--land .xg-node--open')).toBe(76);
    expect(await size('.pl-map--port .xg-node--open')).toBe(72);
    expect(await size('.pl-map--big .xg-node--open')).toBe(96);
    // the biggest node stays inside its box (pad scales with nodeSize)
    const inside = await page.locator('.pl-map--big').evaluate((box) => {
      const b = box.getBoundingClientRect();
      return [...box.querySelectorAll('.xg-node')].every((n) => {
        const r = n.getBoundingClientRect();
        return r.left >= b.left - 1 && r.right <= b.right + 1 && r.top >= b.top - 1 && r.bottom <= b.bottom + 1;
      });
    });
    expect(inside).toBe(true);
  });

  test('keypad: 3x4 / 4x3 layouts, keySize, setEnabled', async ({ page }) => {
    await page.goto('/dev/platform/?only=misc', { waitUntil: 'load' });
    await page.waitForSelector('.pl-padbox .xg-key');
    const order = (layout: string) => page.locator(`.pl-padbox[data-layout="${layout}"] .xg-key`).evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.key));
    expect(await order('3x4')).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'ok']);
    expect(await order('4x3')).toEqual(['1', '2', '3', 'del', '4', '5', '6', '0', '7', '8', '9', 'ok']);
    const key = page.locator('.pl-padbox[data-layout="4x3"] [data-key="5"]');
    const box = (await key.boundingBox())!;
    expect(Math.round(box.width)).toBe(56);
    expect(Math.round(box.height)).toBe(48);
    // columns: 4 per row
    const rows = await page.locator('.pl-padbox[data-layout="4x3"] .xg-key').evaluateAll((els) => new Set(els.map((e) => Math.round(e.getBoundingClientRect().top))).size);
    expect(rows).toBe(3);
    await page.locator('.pl-padbox[data-layout="3x4"] [data-key="7"]').click();
    await expect(page.locator('.pl-padbox[data-layout="3x4"] .xg-display span').first()).toHaveText('7');
    await page.click('#btn-keys');
    expect(await page.locator('.xg-key:disabled').count()).toBe(24);
    await page.locator('.pl-padbox[data-layout="3x4"] [data-key="8"]').click({ force: true });
    await expect(page.locator('.pl-padbox[data-layout="3x4"] .xg-display span').first()).toHaveText('7');
    await page.click('#btn-keys');
    expect(await page.locator('.xg-key:disabled').count()).toBe(0);
  });

  test('showResult({ confetti: false }) earns three stars without paper confetti', async ({ page }) => {
    await page.goto('/dev/platform/?only=misc', { waitUntil: 'load' });
    await page.click('#btn-result');
    await page.waitForSelector('.xg-rstar.is-earned >> nth=2', { state: 'attached' });
    await page.waitForTimeout(500);
    expect(await page.locator('.xg-confetti').count()).toBe(0);
    const panel = await page.locator('.xg-modal').boundingBox();
    const vp = page.viewportSize()!;
    expect(panel!.y + panel!.height).toBeLessThanOrEqual(vp.height);
    await page.locator('.xg-scrim [data-act="ok"]').click();
    await expect(page.locator('.xg-scrim')).toHaveCount(0);
  });

  test('askParentPin: no PIN yet points to the parent page; then wrong / right PIN', async ({ page }) => {
    await page.goto('/dev/platform/?only=misc', { waitUntil: 'load' });
    await page.click('#btn-pin');
    await expect(page.locator('.xg-pin__card--nopin a[href="/parent/"]')).toBeVisible();
    await page.locator('.xg-pin [data-act="close"]').click();
    await expect(page.locator('body')).toHaveAttribute('data-pin-result', 'false');
    await page.click('#btn-setpin'); // the lab's test-only PIN (1234); only offered when no PIN exists and under test
    await page.click('#btn-pin');
    for (const k of ['9', '9', '9', '9', '9', '9']) await page.locator(`.xg-pin [data-key="${k}"]`).click();
    await page.locator('.xg-pin [data-key="ok"]').click();
    await expect(page.locator('.xg-pin__text')).toHaveText(/不对/);
    // dialog fits the viewport (2-column layout on short landscape phones is covered by the lab shots)
    const card = (await page.locator('.xg-pin__card').boundingBox())!;
    expect(card.y).toBeGreaterThanOrEqual(0);
    expect(card.y + card.height).toBeLessThanOrEqual(page.viewportSize()!.height);
    for (const k of ['1', '2', '3', '4']) await page.locator(`.xg-pin [data-key="${k}"]`).click();
    await expect(page.locator('body')).toHaveAttribute('data-pin-result', 'true');
    await expect(page.locator('.xg-pin')).toHaveCount(0);
  });
});

test('parent view shows learning observations and exports their data', async ({ page }) => {
  await instrument(page);
  await page.addInitScript((at) => {
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
    Object.defineProperty(navigator, 'share', { configurable: true, value: async (data: ShareData) => {
      const file = data.files?.[0];
      (window as any).__metricsShare = file ? { name: file.name, body: await file.text() } : null;
    } });
    sessionStorage.setItem('kg:parent:unlocked', String(Date.now()));
    localStorage.setItem('kg:metrics:v1:star-pets', JSON.stringify({ v: 1, groups: [
      { id: 'check.1:1', at, src: 'check', setMs: 180_000, medianMs: 30_000, ft: 0.75, flagged: false },
      { id: 'O1.1:2', at, src: 'mission', setMs: 150_000, medianMs: 9_000, ft: 0.38, flagged: true },
    ] }));
    localStorage.setItem('kg:metrics:v1:star-pets-activity', JSON.stringify({ v: 1, collapsed: false, visits: [
      { id: 'visit.1', at, petMs: 120_000, missionMs: 180_000, sawPet: true, sawMission: true, missions: 1, replays: 0 },
      { id: 'visit.2', at, petMs: 60_000, missionMs: 0, sawPet: true, sawMission: false, missions: 0, replays: 0 },
    ] }));
  }, Date.now());
  const { errors } = watch(page);
  await page.goto('/parent/', { waitUntil: 'load' });
  const observations = page.locator('.pg-ledger:has(summary:text("学习观察"))');
  await observations.locator('summary').click();
  await expect(observations).toContainText('设备检修 1 组');
  await expect(observations).toContainText('快的趟数 1');
  await expect(observations).toContainText('2 次打开基地，1 次只看了宠物舱');
  await observations.getByRole('button', { name: '导出指标' }).click();
  await page.waitForFunction(() => !!(window as any).__metricsShare);
  const shared = await page.evaluate(() => (window as any).__metricsShare as { name: string; body: string });
  expect(shared.name).toMatch(/^xinggang-star-pets-metrics-.*\.json$/);
  expect(JSON.parse(shared.body).groups).toHaveLength(2);
  expect(errors).toEqual([]);
});

test.describe('parent page additions', () => {
  const seed = {
    'kg:metrics:v1:xiangqi': { v: 1, updatedAt: 1, metrics: [
      { id: 'lessons', label: '课程进度', value: '12 / 33', frac: 12 / 33, status: 'ok' },
      { id: 'mate1', label: '一步杀首次做对率', value: '31%', frac: 0.31, status: 'watch', hint: '这一块有点吃力，可以陪他玩一次' },
    ] },
    'kg:metrics:v1:chess': 'not json',
  };

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(([entries]) => {
      for (const [k, v] of Object.entries(entries as Record<string, unknown>)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
      sessionStorage.setItem('kg:parent:unlocked', String(Date.now()));
    }, [seed]);
  });

  test('概览 shows each game\'s own metrics and the gentle nudge; junk summaries are ignored', async ({ page }) => {
    const { errors } = watch(page);
    await page.goto('/parent/', { waitUntil: 'load' });
    await page.waitForSelector('.pg-metric');
    await expect(page.locator('.pg-metric')).toHaveCount(1);
    await expect(page.locator('.pg-metric[data-game="xiangqi"] .pg-metric__row')).toHaveCount(2);
    await expect(page.locator('.pg-nudge')).toContainText('可以陪他玩一次');
    await expect(page.locator('.pg-metric__hint')).toHaveText('这一块有点吃力，可以陪他玩一次');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
    expect(errors, 'console errors').toEqual([]);
  });

  test('设置 → 关卡解锁 → 全部解锁 persists and is read by unlockAll()', async ({ page }) => {
    await page.goto('/parent/', { waitUntil: 'load' });
    await page.waitForSelector('.pg-nav');
    await page.locator('.pg-nav [data-id="settings"]').click();
    const box = page.locator('.pg-card:has(.pg-card__title:text("关卡解锁")) input[type=checkbox]');
    await expect(box).not.toBeChecked();
    await box.evaluate((el) => (el as HTMLInputElement).click());
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('kg:settings:v1') ?? '{}').unlockAll)).toBe(true);
    await page.reload({ waitUntil: 'load' });
    await page.locator('.pg-nav [data-id="settings"]').click();
    await expect(page.locator('.pg-card:has(.pg-card__title:text("关卡解锁")) input[type=checkbox]')).toBeChecked();
  });

  test('设置 → 地图显示星币 persists after reload', async ({ page }) => {
    await page.goto('/parent/', { waitUntil: 'load' });
    await page.locator('.pg-nav [data-id="settings"]').click();
    const box = page.locator('.pg-card:has(.pg-card__title:text("星币")) input[type=checkbox]');
    await expect(box).toBeChecked();
    await box.evaluate((el) => (el as HTMLInputElement).click());
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('kg:settings:v1') ?? '{}').showCoins)).toBe(false);
    await page.reload({ waitUntil: 'load' });
    await page.locator('.pg-nav [data-id="settings"]').click();
    await expect(box).not.toBeChecked();
  });
});
