/**
 * V12 glyph leg (spec §9): every ideograph that is actually DISPLAYED (map, five chapter maps, 徽章站, 档案馆, 家长页 and the first item of every
 * playable node) must exist in the webfont that renders it ("XG WenKai" / "XG KuaiLe" subsets in public/fonts). The static source scan lives in
 * tools/fonts/patch-subset.mjs; this is the DOM half. The text is also dumped to ~/kid-games-work/state/rr/e2e/dom-text-<project>.txt so that
 *   node tools/fonts/patch-subset.mjs --check --extra <that file>
 * can be run over it. Not part of e2e-all.sh (run it with `--project=ipad-l --project=se glyphs`).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
// @ts-ignore -- plain ESM helper (JSDoc-typed)
import { cmapChars } from '../../../tools/fonts/scan.mjs';
import { ROOT, boot, leaveMission, prepare, startNode } from './lib';

/** runs in the page: ideographs per first font family of the element that shows them */
function glyphs(): Record<string, string> {
  const IDEO = /[㐀-䶿一-鿿豈-﫿]/gu; const out: Record<string, Set<string>> = {};
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    const p = n.parentElement; if (!p || /^(SCRIPT|STYLE)$/.test(p.tagName)) continue;
    const cs = getComputedStyle(p); if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const fam = cs.fontFamily.split(',')[0].replace(/["']/g, '').trim();
    for (const c of n.textContent?.match(IDEO) ?? []) (out[fam] ??= new Set()).add(c);
  }
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, [...v].join('')]));
}

test('every displayed ideograph is in the subset of the font that renders it', async ({ page }, ti) => {
  test.skip(!['ipad-l', 'se', 'phone-p'].includes(ti.project.name), 'text is the same on every viewport; sample three');
  test.setTimeout(240_000);
  const w = await prepare(page); await boot(page, ti);
  const seen: Record<string, Set<string>> = {}; const add = (r: Record<string, string>) => { for (const [f, s] of Object.entries(r)) { const t = (seen[f] ??= new Set()); for (const c of s) t.add(c); } };
  const grab = async () => { await page.waitForTimeout(120); add(await page.evaluate(glyphs)); };
  await grab();
  for (const z of ['orbit', 'cert', 'vault', 'factory']) { await page.evaluate((zone) => (window as any).__mars.chapter(zone), z); await grab(); }
  for (const s of ['badges', 'archive', 'parent']) { await page.evaluate((fn) => (window as any).__mars[fn](), s); await grab(); }
  await page.evaluate(() => (window as any).__mars.goMap());
  const ids: string[] = await page.evaluate(() => (window as any).__mars.nodes());
  for (const id of ids) { try { await startNode(page, id); await grab(); } catch { /* reported by layout.spec */ } await leaveMission(page); }
  const have = { 'XG WenKai': cmapChars(path.join(ROOT, 'public/fonts/wenkai-gb-medium-3500.woff2')) as Set<string>, 'XG KuaiLe': cmapChars(path.join(ROOT, 'public/fonts/zcool-kuaile-3500.woff2')) as Set<string> };
  const missing: string[] = []; const all = new Set<string>();
  for (const [fam, set] of Object.entries(seen)) for (const c of set) { all.add(c); const f = have[fam as keyof typeof have]; if (f && !f.has(c)) missing.push(`${c} (${fam})`); }
  const dir = path.join(os.homedir(), 'kid-games-work/state/rr/e2e'); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `dom-text-${ti.project.name}.txt`), [...all].join(''));
  console.log(`[${ti.project.name}] ${all.size} distinct ideographs on screen, fonts seen: ${Object.entries(seen).map(([f, s]) => `${f}:${s.size}`).join(' ')}; nodes ${ids.length}`);
  expect(missing, `missing from the subsets: ${missing.join(' ')}`).toEqual([]); expect(w.errors).toEqual([]);
});
