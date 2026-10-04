// @ts-check
/**
 * Render the app icon SVG to the PNGs iOS/Android need (iOS ignores SVG icons):
 *   public/icons/apple-touch-icon-180.png   full-bleed square (iOS applies its own corner mask)
 *   public/icons/icon-192.png, icon-512.png  purpose "any"
 *   public/icons/icon-maskable-512.png      full-bleed, artwork inside the 80% safe circle
 * Usage: npm run icons [-- path/to/icon.svg]   (needs a Playwright browser: npx playwright install chromium)
 * Rendered with Chromium so emoji glyphs use the system emoji font, same as Safari on iPad.
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { ROOT } from './registry.mjs';

const svgPath = path.resolve(process.argv[2] || path.join(ROOT, 'public/icons/icon.svg'));
const outDir = path.join(ROOT, 'public/icons');
const svg = fs.readFileSync(svgPath, 'utf8');
const bg = (/stop-color:\s*(#[0-9a-f]{3,8})/i.exec(svg) || /fill="(#[0-9a-f]{3,8})"/i.exec(svg) || [null, '#1a1a2e'])[1];
const dataUrl = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');

const targets = [
  { file: 'apple-touch-icon-180.png', size: 180, scale: 1.0, fill: bg },
  { file: 'icon-192.png', size: 192, scale: 1.0, fill: 'transparent' },
  { file: 'icon-512.png', size: 512, scale: 1.0, fill: 'transparent' },
  { file: 'icon-maskable-512.png', size: 512, scale: 0.8, fill: bg },
];

const browser = await chromium.launch();
try {
  for (const t of targets) {
    const page = await browser.newPage({ viewport: { width: t.size, height: t.size }, deviceScaleFactor: 1 });
    const inner = Math.round(t.size * t.scale);
    await page.setContent(`<!doctype html><html><body style="margin:0;width:${t.size}px;height:${t.size}px;display:grid;place-items:center;background:${t.fill}">
      <img src="${dataUrl}" width="${inner}" height="${inner}" style="display:block"></body></html>`);
    await page.waitForFunction(() => /** @type {HTMLImageElement} */ (document.querySelector('img')).complete);
    await page.screenshot({ path: path.join(outDir, t.file), omitBackground: t.fill === 'transparent' });
    await page.close();
    console.log(`icons: ${t.file} (${t.size}px)`);
  }
} finally {
  await browser.close();
}
