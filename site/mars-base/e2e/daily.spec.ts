import { expect, test } from '@playwright/test';
import { boot, prepare } from './lib';

const node = { st: 'done', stars: 2, plays: 1, ft: [1] };
const tag = (fam: string, nodeId: string) => ({
  level: 2, streak: 2, window: '11', tailNoHint: 2, mastered: false, reviews: [],
  repDown: 0, wrongRun: 0, fam, node: nodeId,
});
const learned = {
  nodes: {
    'vault.K1.1': node, 'vault.K1.6': node, 'vault.K2.1': node, 'vault.K2.3': node,
  },
  tags: {
    'pv3.rep': tag('pv3.pack', 'vault.K1.1'),
    'pv3.say': tag('pv3.dictation', 'vault.K1.6'),
    'pv3.cmp': tag('pv3.compare', 'vault.K2.1'),
    'pv3.step': tag('pv3.step', 'vault.K2.3'),
  },
};

test('equipment check-up speaks its own opening and closing, pays once, and offers the pet room', async ({ page }, ti) => {
  test.setTimeout(90_000);
  const watch = await prepare(page); await boot(page, ti, { save: learned });
  await expect(page.locator('.mb-check')).toBeEnabled();
  await page.locator('.mb-check').click();
  await expect(page.locator('.mb-comm-text')).toHaveText('来检修设备，做六道题！');
  await expect(page.locator('.mb-stage')).toBeVisible();
  for (let i = 0; i < 12 && !(await page.locator('.xg-modal').count()); i++) {
    await page.evaluate(() => (window as any).__mars.answer((window as any).__mars.correct()));
    await page.waitForTimeout(1100);
  }
  await expect(page.locator('.xg-modal')).toBeVisible();
  await expect(page.locator('.xg-modal')).toContainText('设备检修');
  await expect(page.locator('.xg-modal')).toContainText('+16 星币');
  await expect(page.locator('.xg-modal__actions [data-act="pets"]')).toBeVisible();
  expect(await page.evaluate(() => ({
    lastLine: (window as any).__mars.app.narrator.lastCue?.text,
    balance: (window as any).__mars.app.economy.balance(),
    runSeq: (window as any).__mars.app.save.daily.runSeq,
  }))).toEqual({ lastLine: '检修完成，货车送达！', balance: 16, runSeq: 1 });
  expect(watch.errors).toEqual([]);
});

test('returning to the map during the check-up opening cannot start a late question', async ({ page }, ti) => {
  const watch = await prepare(page); await boot(page, ti, { save: learned });
  await page.locator('.mb-check').click();
  await expect(page.locator('.mb-comm-text')).toHaveText('来检修设备，做六道题！');
  await page.locator('.mb-map-btn').click();
  await expect(page.locator('.mb-map')).toBeVisible();
  await page.waitForTimeout(1700);
  await expect(page.locator('.mb-mission')).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).__mars.app.missionBusy)).toBe(false);
  expect(watch.errors).toEqual([]);
});
