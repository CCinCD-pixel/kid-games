import { expect, test } from '@playwright/test';

test('phone battle shows machine health and actual damage', async ({ page }, info) => {
  test.skip(info.project.name !== 'portrait-810x1080', 'phone case runs once');
  test.setTimeout(30_000);
  await page.context().addInitScript({ path: 'tools/qa/mute-audio.js' });
  await page.addInitScript(() => {
    (window as any).__damageTexts = [];
    const original = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (value, ...args) {
      if (/^(-\d+|裂 \+\d+)$/.test(value)) (window as any).__damageTexts.push(value);
      return original.call(this, value, ...args);
    };
  });
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto('/gear-fort/?test=1&mute=1');
  await page.getByRole('button', { name: /开始/ }).first().tap();
  await page.waitForSelector('#app[data-ready]');
  await page.waitForFunction(() => !!(window as any).__gf);
  await page.evaluate(() => { const g = (window as any).__gf; g.skipHook(); g.setSpeed(12); });
  await page.waitForFunction(() => (window as any).__gf?.S.enemies.some((e: any) => e.hp > 0), null, { timeout: 12000 });
  await page.waitForTimeout(400);
  const result = await page.evaluate(() => {
    const g = (window as any).__gf;
    g.setSpeed(1);
    const enemy = g.S.enemies.find((e: any) => e.hp > 0);
    const before = enemy.hp;
    enemy.hp = Math.max(1, Math.floor(enemy.max * 0.25));
    const now = performance.now();
    g.stage.afterStep(g.S, now);
    g.stage.render(g.S, 1, now + 16, 16);
    const canvas = document.querySelector('.gf-stage') as HTMLCanvasElement;
    const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    let red = 0;
    for (let i = 0; i < pixels.length; i += 4) if (pixels[i] === 217 && pixels[i + 1] === 76 && pixels[i + 2] === 66 && pixels[i + 3] === 255) red++;
    return { damage: before - enemy.hp, texts: (window as any).__damageTexts as string[], red };
  });
  console.log('[health feedback]', JSON.stringify(result));
  await page.screenshot({ path: info.outputPath('health-feedback.png') });
  expect(result.damage).toBeGreaterThan(0);
  expect(result.texts).toContain(`-${result.damage}`);
  expect(result.red).toBeGreaterThan(8);
});
