import { expect, test, type Page } from '@playwright/test';
import { boot, prepare, shotPath, startNode } from './lib';

async function completeOrder(page: Page): Promise<void> {
  for (let i = 0; i < 32 && !(await page.locator('.xg-modal').count()); i++) {
    await page.evaluate(() => (window as any).__mars.answer((window as any).__mars.correct()));
    await page.waitForTimeout(450);
  }
  await expect(page.locator('.xg-modal')).toBeVisible();
}

test('a completed order pays once, opens the pet room, and survives a reload', async ({ page }, ti) => {
  test.setTimeout(120_000);
  const watch = await prepare(page); await boot(page, ti);
  await startNode(page, 'vault.K1.1');
  await completeOrder(page);
  expect(await page.evaluate(() => ({
    balance: (window as any).__mars.app.economy.balance(),
    pending: (window as any).__mars.app.save.eco.pending.length,
    awards: (window as any).__mars.app.economy.events().filter((e: any) => e.src === 'mission.new').length,
  }))).toEqual({ balance: 26, pending: 0, awards: 1 });

  await page.locator('.xg-modal__actions [data-act="home"]').click();
  await expect(page.locator('.xg-modal__actions [data-act="pets"]')).toBeVisible();
  await page.locator('.xg-modal__actions [data-act="pets"]').click();
  await expect(page.locator('.mb-pets')).toBeVisible();
  await expect(page.locator('.mb-pet-coins')).toContainText('26');

  await page.reload();
  await page.locator('.kit-start__go').click().catch(() => undefined);
  await expect(page.locator('.mb-map')).toBeVisible();
  await startNode(page, 'vault.K1.1');
  await completeOrder(page);
  expect(await page.evaluate(() => (window as any).__mars.app.economy.balance())).toBe(26);
  expect(watch.errors).toEqual([]);
});

async function earn(page: Page, count: number): Promise<void> {
  await page.evaluate((n) => {
    const eco = (window as any).__mars.app.economy;
    for (let i = 1; i <= n; i++) eco.earn('mission.new', { id: `mn:qa:${i}:local`, ref: `qa.${i}` });
  }, count);
}

async function room(page: Page): Promise<void> {
  await page.evaluate(() => (window as any).__mars.app.openPets());
  await expect(page.locator('.mb-pets')).toBeVisible();
}

test('first partner, naming and feeding keep the ledger and room in sync', async ({ page }, ti) => {
  const watch = await prepare(page); await boot(page, ti);
  await earn(page, 1); await room(page);
  await expect(page.locator('.mb-pet-caption')).toContainText('选一位伙伴');
  await expect(page.locator('[data-hatch]')).toHaveCount(2);
  await page.locator('[data-hatch="rover"]').click();
  await expect(page.locator('.mb-pet-name-panel')).toBeVisible();
  await page.locator('[data-name="小探"]').click();
  await page.locator('[data-product="bolt"]').click();
  await page.locator('[data-act="feed"]').click();
  await expect(page.locator('.mb-pet-coins')).toContainText('6');
  await expect(page.locator('.mb-pet-status')).toContainText('成长 33');
  await expect(page.locator('.mb-pet-caption')).toContainText('吃好了');
  expect(await page.evaluate(() => ({
    balance: (window as any).__mars.app.economy.balance(),
    room: (window as any).__mars.app.economy.getPet('slot:hab:floor2'),
  }))).toEqual({ balance: 6, room: 'floor.nest' });
  expect(watch.errors).toEqual([]);
});

test('second partner, preview, purchase, moving and undo', async ({ page }, ti) => {
  const watch = await prepare(page); await boot(page, ti);
  await earn(page, 8); await room(page);
  await page.locator('[data-hatch="rover"]').click();
  await page.locator('[data-name="小探"]').click();
  await page.locator('[data-hatch="dragon"]').click();
  await page.locator('[data-name="小晶"]').click();
  await expect(page.locator('.mb-pet-title')).toContainText('小晶');
  await page.locator('[data-act="switch"]').click();
  await expect(page.locator('.mb-pet-title')).toContainText('小探');

  await page.locator('[data-tab="room"]').click();
  await page.locator('[data-kind="floor"]').click();
  const before = await page.evaluate(() => (window as any).__mars.app.economy.balance());
  await page.locator('[data-product="floor.crate"]').click();
  await expect(page.locator('.mb-room-piece--preview')).toBeVisible();
  expect(await page.evaluate(() => (window as any).__mars.app.economy.balance())).toBe(before);
  await page.locator('[data-act="buy"]').click();
  await expect(page.locator('.mb-room-piece[data-piece="floor.crate"]')).toHaveCount(1);
  expect(await page.evaluate(() => (window as any).__mars.app.economy.balance())).toBe(before - 20);
  await page.locator('[data-product="floor.crate"]').click();
  await page.locator('[data-slot="floor4"]').click();
  expect(await page.evaluate(() => ({
    old: (window as any).__mars.app.economy.getPet('slot:hab:floor0'),
    next: (window as any).__mars.app.economy.getPet('slot:hab:floor4'),
  }))).toEqual({ old: null, next: 'floor.crate' });
  await page.locator('[data-act="undo"]').click();
  expect(await page.evaluate(() => (window as any).__mars.app.economy.getPet('slot:hab:floor0'))).toBe('floor.crate');

  const art = (await page.locator('[data-product="floor.crate"] .mb-pet-product-art').boundingBox())!;
  const target = (await page.locator('[data-slot="floor4"]').boundingBox())!;
  await page.mouse.move(art.x + art.width / 2, art.y + art.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 12 });
  await page.mouse.up();
  expect(await page.evaluate(() => (window as any).__mars.app.economy.getPet('slot:hab:floor4'))).toBe('floor.crate');
  expect(watch.errors).toEqual([]);
});

test('a finger can drag an owned decoration upward out of the scrolling shelf', async ({ page, browserName }, ti) => {
  test.skip(browserName !== 'chromium', 'CDP touch input is available in Chromium');
  const watch = await prepare(page); await boot(page, ti);
  await earn(page, 2); await room(page);
  await page.locator('[data-hatch="rover"]').click();
  await page.locator('[data-name="小探"]').click();
  await page.locator('[data-tab="room"]').click();
  await page.locator('[data-kind="floor"]').click();
  await page.locator('[data-product="floor.crate"]').click();
  await page.locator('[data-act="buy"]').click();

  const art = (await page.locator('[data-product="floor.crate"] .mb-pet-product-art').boundingBox())!;
  const target = (await page.locator('[data-slot="floor4"]').boundingBox())!;
  const sx = art.x + art.width / 2, sy = art.y + art.height / 2;
  const tx = target.x + target.width / 2, ty = target.y + target.height / 2;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: sx, y: sy }] });
  for (let i = 1; i <= 12; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: sx + (tx - sx) * i / 12, y: sy + (ty - sy) * i / 12 }] });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(() => page.evaluate(() => (window as any).__mars.app.economy.getPet('slot:hab:floor4'))).toBe('floor.crate');
  expect(await page.evaluate(() => (window as any).__mars.app.economy.getPet('slot:hab:floor0'))).toBeNull();
  expect(watch.errors).toEqual([]);
});

test('gift waits for the child to open it', async ({ page }, ti) => {
  const watch = await prepare(page); await boot(page, ti);
  await page.evaluate(() => (window as any).__mars.app.economy.setPet('gift:pending:wall.poster', '给你的海报'));
  await room(page);
  await expect(page.locator('.mb-pet-gift')).toContainText('给你的海报');
  expect(await page.evaluate(() => (window as any).__mars.app.economy.owned().has('wall.poster'))).toBe(false);
  await page.locator('[data-act="open-gift"]').click();
  await expect(page.locator('.mb-pet-gift')).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).__mars.app.economy.owned().has('wall.poster'))).toBe(true);
  expect(watch.errors).toEqual([]);
});

test('room controls stay on screen and their centers accept taps', async ({ page }, ti) => {
  const watch = await prepare(page); await boot(page, ti);
  await earn(page, 1); await room(page);
  await page.locator('[data-hatch="rover"]').click();
  await page.locator('[data-name="小探"]').click();
  await page.locator('[data-tab="room"]').click();
  const problems = await page.evaluate(() => {
    const issues: string[] = [];
    const vw = innerWidth, vh = innerHeight;
    if (document.documentElement.scrollWidth > vw + 1) issues.push('horizontal page overflow');
    const shelf = document.querySelector('.mb-pet-shelf')?.getBoundingClientRect();
    const firstProduct = document.querySelector('.mb-pet-shelf .mb-pet-product')?.getBoundingClientRect();
    if (shelf && firstProduct && firstProduct.bottom > shelf.bottom + 1) issues.push('first product card clipped by shelf');
    for (const el of document.querySelectorAll<HTMLButtonElement>('.mb-pets button:not(:disabled)')) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const label = el.dataset.act ?? el.dataset.tab ?? el.dataset.slot ?? el.dataset.product ?? el.className;
      const shelfItem = !!el.closest('.mb-pet-shelf');
      if (!shelfItem && (r.left < -1 || r.top < -1 || r.right > vw + 1 || r.bottom > vh + 1)) issues.push(`${label}: outside viewport`);
      if (shelfItem && (r.bottom > vh || r.top < 0)) continue;
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (hit && hit !== el && !el.contains(hit) && !el.closest('.mb-pet-shelf')) issues.push(`${label}: center obscured`);
    }
    return issues;
  });
  await page.screenshot({ path: shotPath(ti, 'pets-room'), animations: 'disabled' });
  expect(problems).toEqual([]);
  expect(watch.errors).toEqual([]);
});

test('map coin entry stays reachable and the room remains open when coins are hidden', async ({ page }, ti) => {
  const watch = await prepare(page); await boot(page, ti);
  const entry = page.locator('.mb-map-coins');
  await expect(entry).toBeVisible();
  const geometry = await page.evaluate(() => {
    const coin = document.querySelector('.mb-map-coins')!;
    const r = coin.getBoundingClientRect();
    const atCenter = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    const overlaps = [...document.querySelectorAll('.kit-back, .mb-site')].filter((el) => {
      const b = el.getBoundingClientRect();
      return r.left < b.right && b.left < r.right && r.top < b.bottom && b.top < r.bottom;
    }).map((el) => ({ site: (el as HTMLElement).dataset.site ?? 'back', rect: el.getBoundingClientRect().toJSON() }));
    return { onScreen: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight,
      reachable: atCenter === coin || coin.contains(atCenter), coin: r.toJSON(), overlaps };
  });
  expect(geometry.onScreen).toBe(true);
  expect(geometry.reachable).toBe(true);
  expect(geometry.overlaps, JSON.stringify(geometry)).toEqual([]);
  await entry.click();
  await expect(page.locator('.mb-pets')).toBeVisible();
  await page.evaluate(() => {
    localStorage.setItem('kg:settings:v1', JSON.stringify({ skipIntros: true, showCoins: false }));
    (window as any).__mars.app.goMap();
  });
  await expect(entry).toHaveCount(0);
  await page.locator('[data-site="pets"]').click();
  await expect(page.locator('.mb-pets')).toBeVisible();
  expect(watch.errors).toEqual([]);
});
