/**
 * V10 for the screens around the runner (map, five chapter maps, 徽章站, 档案馆, 家长页): on every viewport + injected insets
 * every control is on screen horizontally, ≥ 44 px (hit box incl. ::after), the title / the two round keys / the other controls never overlap,
 * the page never scrolls sideways, fixed-size texts are not cut, the 🏠 key sits where the kit token puts it. The long screens (档案馆, 家长页)
 * may scroll vertically (by design: their own overflow-y), everything else may not. Shots: one per screen.
 */
import { expect, test } from '@playwright/test';
import { boot, prepare, safeOf, insetsOf, shotPath } from './lib';

type Issue = string;
function auditScreen(arg: { scrolls: boolean; insets: { t: number; r: number; b: number; l: number } }): Issue[] {
  const out: Issue[] = []; const VW = window.innerWidth, VH = window.innerHeight;
  const shown = (e: Element) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden' && !(e as HTMLElement).hidden && Number(cs.opacity) > 0.01; };
  const name = (e: Element) => `${e.tagName.toLowerCase()}.${((e as HTMLElement).className?.toString?.() ?? '').split(' ').filter(Boolean)[0] ?? ''}${(e as HTMLElement).dataset?.site ? `[${(e as HTMLElement).dataset.site}]` : ''}`;
  const ctl = Array.from(document.querySelectorAll('button, [role="button"], .kit-back, .mb-ch-title, .mb-map-title')).filter(shown).filter((e) => !e.closest('.xg-scrim'));
  const box = (e: Element): DOMRect | null => { const r = e.getBoundingClientRect(); const sc = e.closest('.mb-ch-scroll'); if (!sc) return r; const q = sc.getBoundingClientRect(); const l = Math.max(r.left, q.left), t = Math.max(r.top, q.top), rr = Math.min(r.right, q.right), b = Math.min(r.bottom, q.bottom); return rr > l && b > t ? new DOMRect(l, t, rr - l, b - t) : null; };   // what a scroller really shows of a node
  const circle = (e: Element) => e.classList.contains('xg-node');
  for (const e of ctl) {
    const r = e.getBoundingClientRect(); const vis = box(e); if (!vis) continue;
    if (!e.closest('.mb-ch-scroll')) {
      if (r.left < -1 || r.right > VW + 1) out.push(`${name(e)} off-screen horizontally ${Math.round(r.left)}..${Math.round(r.right)} of ${VW}`);
      if (!arg.scrolls && (r.top < -1 || r.bottom > VH + 1)) out.push(`${name(e)} off-screen vertically ${Math.round(r.top)}..${Math.round(r.bottom)} of ${VH}`);
    }
    if (e.matches('button, [role="button"], .kit-back')) { const s = getComputedStyle(e, '::after'); const hw = Math.max(r.width, s.position === 'absolute' ? parseFloat(s.width) || 0 : 0), hh = Math.max(r.height, s.position === 'absolute' ? parseFloat(s.height) || 0 : 0); if (hw < 43.5 || hh < 43.5) out.push(`tap ${name(e)} ${Math.round(hw)}×${Math.round(hh)} < 44`); }
  }
  for (let i = 0; i < ctl.length; i++) for (let j = i + 1; j < ctl.length; j++) {
    if (ctl[i].contains(ctl[j]) || ctl[j].contains(ctl[i])) continue;
    const a = box(ctl[i]), b = box(ctl[j]); if (!a || !b) continue;
    if (circle(ctl[i]) && circle(ctl[j])) { const ra = Math.min(ctl[i].getBoundingClientRect().width, ctl[i].getBoundingClientRect().height) / 2, rb = Math.min(ctl[j].getBoundingClientRect().width, ctl[j].getBoundingClientRect().height) / 2; const ar = ctl[i].getBoundingClientRect(), br = ctl[j].getBoundingClientRect(); if (Math.hypot(ar.left + ar.width / 2 - (br.left + br.width / 2), ar.top + ar.height / 2 - (br.top + br.height / 2)) < ra + rb - 2) out.push(`overlap ${name(ctl[i])} × ${name(ctl[j])} (circles)`); continue; }
    if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) out.push(`overlap ${name(ctl[i])} × ${name(ctl[j])}`);
  }
  const de = document.documentElement; if (de.scrollWidth > VW + 1) out.push(`page scrolls sideways ${de.scrollWidth} > ${VW}`); if (!arg.scrolls && de.scrollHeight > VH + 1) out.push(`page scrolls ${de.scrollHeight} > ${VH}`);
  document.querySelectorAll('.mb-ch-title, .mb-map-title, .mb-site-name, .mb-plaque b, .mb-go-sub').forEach((e) => { const h = e as HTMLElement; if (shown(h) && h.scrollWidth > h.clientWidth + 1 && getComputedStyle(h).display !== 'inline') out.push(`text cut ${name(h)} "${(h.textContent ?? '').slice(0, 12)}"`); });
  document.querySelectorAll('.mb-chapter .xg-node > span:not(.xg-node__stars)').forEach((label) => {
    const node = label.parentElement!; const a = label.getBoundingClientRect(); const b = node.getBoundingClientRect();
    const radius = Math.min(b.width, b.height) / 2;
    if (label.scrollWidth > label.clientWidth + 1 || Math.hypot(a.width / 2, a.height / 2) > radius - 4 ||
        Math.abs((a.left + a.right - b.left - b.right) / 2) > 1 || Math.abs((a.top + a.bottom - b.top - b.bottom) / 2) > 1)
      out.push(`node label outside circle "${label.textContent ?? ''}"`);
  });
  const kb = document.querySelector('.kit-back'); if (kb && shown(kb)) { const r = kb.getBoundingClientRect(); if (r.left < arg.insets.l - 1 || r.top < arg.insets.t - 1) out.push(`kit-back inside the unsafe inset ${Math.round(r.left)},${Math.round(r.top)} vs ${arg.insets.l},${arg.insets.t}`); }
  return out;
}

test('map, chapter maps, 徽章站, 档案馆, 家长页: no overlap / off-screen / cut text', async ({ page }, ti) => {
  test.setTimeout(90_000);
  const w = await prepare(page); await boot(page, ti);
  await page.locator('.kit-start').waitFor({ state: 'detached' });
  const insets = insetsOf(safeOf(ti)); const report: string[] = [];
  const check = async (label: string, scrolls = false) => { await page.waitForTimeout(350); const issues = await page.evaluate(auditScreen, { scrolls, insets }); if (issues.length) report.push(`${label}: ${[...new Set(issues)].join(' | ')}`); if (process.env.MARS_SHOTS !== '0') await page.screenshot({ path: shotPath(ti, `screen_${label}`) }).catch(() => undefined); };
  await check('map');
  for (const z of ['orbit', 'cert', 'vault', 'factory']) { await page.evaluate((zone) => (window as any).__mars.chapter(zone), z); await page.waitForSelector('.mb-chapter'); await check(`chapter-${z}`); }
  await page.evaluate(() => (window as any).__mars.badges()); await check('badges');
  await page.evaluate(() => (window as any).__mars.archive()); await check('archive', true);
  await page.evaluate(() => (window as any).__mars.parent()); await check('parent', true);
  expect(report, report.join('\n')).toEqual([]); expect(w.errors).toEqual([]);
});
