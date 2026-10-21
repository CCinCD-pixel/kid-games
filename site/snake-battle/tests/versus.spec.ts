import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const mute = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../tools/qa/mute-audio.js');

test.beforeEach(async ({ page }) => {
  await page.addInitScript({ path: mute });
});

test('双人分屏：独立操控、暂停、结算、重开', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/snake-battle/?test=1&nogate&mute=1');
  await page.waitForSelector('.sb-lobby');
  await page.locator('.sb-versus-entry').click();
  await page.locator('.sb-vsintro__done').click();   // first entry: the 怎么玩 card (tests/versus-intro.spec.ts covers it)
  const panes = page.locator('.sb-versus__pane');
  await expect(panes).toHaveCount(2);
  await page.waitForFunction(() => (window as any).__sbVersus?.match?.state === 'playing');
  const initial = await page.evaluate(() => {
    const s = (window as any).__sbVersus;
    return { radius: s.match.arenaR, solo: 1600 * 2, distance: Math.hypot(s.match.me.x - s.match.other.x, s.match.me.y - s.match.other.y), ids: [s.match.me.id, s.match.other.id], canvas: s.views.map((v: any) => ({ w: v.R.canvas.width, h: v.R.canvas.height, lost: v.R.gl.isContextLost() })) };
  });
  expect(initial.radius).toBeGreaterThan(initial.solo);
  expect(initial.distance).toBeLessThan(900);
  expect(initial.ids[0]).not.toBe(initial.ids[1]);
  for (const c of initial.canvas) { expect(c.w).toBeGreaterThan(0); expect(c.h).toBeGreaterThan(0); expect(c.lost).toBe(false); }
  const rects = await panes.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON()));
  const vp = page.viewportSize()!;
  if (vp.width > vp.height) {
    expect(Math.abs(rects[0].width - vp.width / 2)).toBeLessThan(4);
    expect(Math.abs(rects[1].x - vp.width / 2)).toBeLessThan(4);
  } else {
    expect(Math.abs(rects[0].height - vp.height / 2)).toBeLessThan(4);
    expect(Math.abs(rects[1].y - vp.height / 2)).toBeLessThan(4);
  }
  await page.evaluate(() => {
    const s = (window as any).__sbVersus;
    s.panes.forEach((pane: HTMLElement, i: number) => {
      const player = i ? s.match.other : s.match.me;
      const [hx, hy] = s.views[i].worldToScreen(player.x, player.y);
      const r = pane.getBoundingClientRect();
      pane.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: i + 11, pointerType: 'touch', clientX: r.left + hx + (i ? -120 : 120), clientY: r.top + hy + 80 }));
    });
  });
  await page.waitForTimeout(150);
  const targets = await page.evaluate(() => {
    const s = (window as any).__sbVersus;
    return [s.match.input.target, s.match.otherInput.target];
  });
  expect(targets[0]).not.toBeNull(); expect(targets[1]).not.toBeNull();
  expect(Math.abs(targets[0] - targets[1])).toBeGreaterThan(0.4);
  const boosts = await page.locator('.sb-versus__boost').evaluateAll((els) => els.map((el) => {
    const r = el.getBoundingClientRect(), p = el.parentElement!.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height, inPane: r.left >= p.left && r.right <= p.right && r.top >= p.top && r.bottom <= p.bottom };
  }));
  for (const b of boosts) { expect(b.inPane).toBe(true); expect(b.w).toBeGreaterThanOrEqual(44); expect(b.h).toBeGreaterThanOrEqual(44); }
  await page.evaluate(() => {
    const s = (window as any).__sbVersus;
    s.match.me.mass = 60; s.match.other.mass = 60;
    document.querySelectorAll('.sb-versus__boost').forEach((el, i) => {
      const r = el.getBoundingClientRect();
      el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: i + 21, pointerType: 'touch', clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
    });
  });
  await page.waitForFunction(() => (window as any).__sbVersus?.match?.me?.boost && (window as any).__sbVersus?.match?.other?.boost);
  expect(await page.locator('.sb-versus__clock').textContent()).not.toContain(':60');
  await page.screenshot({ path: info.outputPath('versus.png') });
  await page.locator('.sb-versus__pause').click();
  await expect(page.locator('.sb-versus__modal')).toContainText('暂停');
  await page.getByRole('button', { name: '继续' }).click();
  await page.waitForFunction(() => (window as any).__sbVersus?.match?.state === 'playing');
  await page.setViewportSize({ width: vp.height, height: vp.width });
  await expect(page.locator('.sb-versus__modal')).toContainText('暂停');
  await page.getByRole('button', { name: '继续' }).click();
  await page.waitForFunction(() => (window as any).__sbVersus?.match?.state === 'playing');
  await page.evaluate(() => { (window as any).__sbVersus.match.world.t = 179.95; });
  await expect(page.locator('.sb-versus__modal')).toContainText(/获胜|平局/, { timeout: 5000 });
  await page.getByRole('button', { name: '再来一局' }).click();
  await expect(panes).toHaveCount(2);
  expect(await page.evaluate(() => (window as any).__sbVersus.views.every((v: any) => !v.R.gl.isContextLost()))).toBe(true);
  await page.locator('.sb-versus__pause').click();
  await page.getByRole('button', { name: '回大厅' }).click();
  await expect(page.locator('.sb-lobby')).toBeVisible();
  expect(errors).toEqual([]);
});

for (const [name, viewport] of [
  ['phone-portrait', { width: 390, height: 664 }],
  ['phone-landscape', { width: 844, height: 390 }],
  ['phone-small-landscape', { width: 568, height: 320 }],
] as const) {
  test.describe(name, () => {
    test.use({ viewport, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    test('入口和双人操作区完整可见', async ({ page }, info) => {
      test.skip(info.project.name !== 'portrait-810x1080', 'run phone cases once');
      await page.goto('/snake-battle/?test=1&nogate&mute=1');
      await page.waitForSelector('.sb-versus-entry');
      const entry = await page.locator('.sb-versus-entry').boundingBox();
      expect(entry!.height).toBeGreaterThanOrEqual(44);
      expect(entry!.x + entry!.width).toBeLessThanOrEqual(viewport.width);
      expect(entry!.y + entry!.height).toBeLessThanOrEqual(viewport.height);
      const narration = await page.evaluate(() => {
        const app = (window as any).__sbApp;
        app.sub.onCue({ text: '玩了好几局，看看远处吧。' });
        const a = document.querySelector('.sb-versus-entry')!.getBoundingClientRect();
        const b = document.querySelector('.kit-subtitle')!.getBoundingClientRect();
        return { entry: a.toJSON(), subtitle: b.toJSON(), overlap: a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom };
      });
      expect(narration.overlap, JSON.stringify(narration)).toBe(false);
      await page.screenshot({ path: info.outputPath(`${name}-lobby.png`) });
      await page.locator('.sb-versus-entry').click();
      await page.locator('.sb-vsintro__done').click();
      await page.waitForFunction(() => (window as any).__sbVersus?.match?.state === 'playing');
      const controls = await page.locator('.sb-versus__boost, .sb-versus__pause, .sb-versus__score, .sb-versus__clock').evaluateAll((els) => els.map((e) => {
        const r = e.getBoundingClientRect(); return { cls: e.className, x: r.x, y: r.y, right: r.right, bottom: r.bottom, w: r.width, h: r.height };
      }));
      for (const c of controls) {
        expect(c.x, c.cls).toBeGreaterThanOrEqual(0);
        expect(c.y, c.cls).toBeGreaterThanOrEqual(0);
        expect(c.right, c.cls).toBeLessThanOrEqual(viewport.width);
        expect(c.bottom, c.cls).toBeLessThanOrEqual(viewport.height);
      }
      const boosts = controls.filter((c) => c.cls.includes('sb-versus__boost'));
      expect(boosts).toHaveLength(2);
      for (const b of boosts) expect(b.w).toBeGreaterThanOrEqual(44);
      await page.screenshot({ path: info.outputPath(`${name}.png`) });
    });
  });
}
