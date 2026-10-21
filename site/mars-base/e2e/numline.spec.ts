/**
 * V6 browser leg (spec §9): ≥ 25 flag positions dragged with a REAL pointer across the six viewports (5 per project). While the finger is down
 * the LIVE DOM is read — text nodes, every non-geometry attribute, ::before/::after content, <title>/<desc> — and the numerals must be a subset of
 * the anchors that were on screen before the touch and identical for every flag position (no read-out, no counting channel).
 * The magnifier must sit inside stage ∩ viewport and never cover the order card.
 */
import { expect, test } from '@playwright/test';
import { boot, prepare, startNode } from './lib';

const GEOMETRY = ['x', 'y', 'x1', 'x2', 'y1', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'd', 'points', 'transform', 'viewBox', 'width', 'height', 'style', 'fill', 'stroke', 'opacity', 'role'];
/** Runs in the page: every numeral a child / screen reader could read from the number line (feedback subtree excluded). */
function exposed(geo: string[]): { numerals: string[]; lens: { x: number; y: number; w: number; h: number } | null } {
  const NUM = /[0-9０-９]+|[零〇一二两三四五六七八九十百千]+/g; const set = new Set<string>();
  const root = document.querySelector('.mb-stage .nl'); if (!root) return { numerals: ['<no .nl>'], lens: null };
  const add = (s: string | null | undefined) => { for (const n of String(s ?? '').match(NUM) ?? []) set.add(n); };
  for (const e of [root, ...Array.from(root.querySelectorAll('*'))]) {
    if (e.closest('[data-phase="feedback"]')) continue;
    for (const a of Array.from(e.attributes)) if (!geo.includes(a.name)) add(a.value);
    for (const pe of ['::before', '::after'] as const) { const c = getComputedStyle(e, pe).content; if (c && c !== 'none' && c !== 'normal') add(c); }
    for (const n of Array.from(e.childNodes)) if (n.nodeType === 3) add(n.textContent);
  }
  const g = root.querySelector('.nl-lens-glass'); const r = g?.getBoundingClientRect();
  return { numerals: [...set].sort(), lens: r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null };
}

test('number line: real drags at 5 positions expose only the anchors; the magnifier stays clear', async ({ page }, ti) => {
  test.setTimeout(120_000);
  const watch = await prepare(page); await boot(page, ti);
  await startNode(page, 'orbit.O2.2');
  // first item that is a placing task (the node may open with a warm-up of another kind)
  for (let i = 0; i < 4 && !(await page.locator('.mb-stage .nl[data-kind="place"]').count()); i++) { await page.evaluate(() => (window as any).__mars.answer((window as any).__mars.correct())); await page.waitForTimeout(1500); }
  await page.waitForSelector('.mb-stage .nl[data-kind="place"]');
  const L: number = await page.evaluate(() => (window as any).__mars.item().params.L);
  const base = await page.evaluate(exposed, GEOMETRY);
  const order = (await page.locator('.mb-order').boundingBox())!; const stage = (await page.locator('.mb-stage').boundingBox())!;
  const vp = page.viewportSize()!; const fails: string[] = []; let lensSeen = 0;
  for (const frac of [0, 0.5, 1, 0.37, 0.81]) {
    const svg = (await page.locator('.mb-stage .nl-svg').boundingBox())!; const g = await page.evaluate((f) => { const c = (window as any).__nlCtl; return { x: c.flagToClientX(f * c.state.L), y: c.trackClientY() }; }, frac);
    const x = g.x; const y = g.y;   // the track, from the live control (engines/manip/numberline.ts: trackY + scaleOf)
    await page.mouse.move(svg.x + svg.width / 2, y); await page.mouse.down();
    await page.mouse.move(x, y, { steps: 6 }); await page.waitForTimeout(40);
    const live = await page.evaluate(exposed, GEOMETRY);
    const stray = live.numerals.filter((n) => !base.numerals.includes(n));
    if (stray.length) fails.push(`@${frac}L numerals not on screen before the touch: ${stray.join(',')}`);
    if (live.numerals.join() !== base.numerals.join()) fails.push(`@${frac}L numerals differ from the rack state: ${live.numerals.join()} vs ${base.numerals.join()}`);
    if (live.lens) {
      lensSeen++; const l = live.lens;
      if (l.x < Math.max(0, stage.x) - 1 || l.y < Math.max(0, stage.y) - 1 || l.x + l.w > Math.min(vp.width, stage.x + stage.width) + 1 || l.y + l.h > Math.min(vp.height, stage.y + stage.height) + 1) fails.push(`@${frac}L magnifier ${JSON.stringify(l)} leaves stage∩viewport`);
      if (l.x < order.x + order.width && order.x < l.x + l.w && l.y < order.y + order.height && order.y < l.y + l.h) fails.push(`@${frac}L magnifier covers the order card`);
    }
    await page.mouse.up();
    // QA fix-mars-r1 (tech M2): the ◀▶ pair never covers a numeral and stays inside stage ∩ viewport (it used to sit on 30/40/60/70 on phones, 40/60 on iPad landscape, 500 on 0-1000)
    const hit = await page.evaluate(() => {
      const out: string[] = []; const nudges = Array.from(document.querySelectorAll('.mb-stage .nl-btn')).map((b) => b.getBoundingClientRect()); if (!nudges.length) return ['no nudge buttons after placing'];
      const st = document.querySelector('.mb-stage')!.getBoundingClientRect();
      for (const r of nudges) { if (r.left < Math.max(0, st.left) - 1 || r.right > Math.min(innerWidth, st.right) + 1 || r.top < Math.max(0, st.top) - 1 || r.bottom > Math.min(innerHeight, st.bottom) + 1) out.push('nudge outside the stage'); if (r.width < 44 || r.height < 44) out.push(`nudge ${Math.round(r.width)}x${Math.round(r.height)} < 44`); }
      for (const t of Array.from(document.querySelectorAll('.mb-stage text.nl-anchor'))) { const a = t.getBoundingClientRect(); for (const r of nudges) if (a.left < r.right && r.left < a.right && a.top < r.bottom && r.top < a.bottom) out.push(`nudge covers numeral "${t.textContent}"`); }
      return out;
    });
    if (hit.length) fails.push(`@${frac}L ${hit.join('; ')}`);
    const after = await page.evaluate(exposed, GEOMETRY);
    if (after.numerals.join() !== base.numerals.join()) fails.push(`@${frac}L placed state exposes ${after.numerals.join()} vs ${base.numerals.join()}`);
  }
  expect(L).toBeGreaterThanOrEqual(1000); expect(lensSeen, 'the magnifier appeared while dragging').toBeGreaterThan(0);
  expect(watch.errors).toEqual([]); expect(fails, fails.join('\n')).toEqual([]);
});

test('number line: pointercancel (palm / system gesture) restores the flag and never counts as a placement', async ({ page }, ti) => {
  test.setTimeout(90_000);
  const watch = await prepare(page); await boot(page, ti); await startNode(page, 'orbit.O2.2');
  for (let i = 0; i < 4 && !(await page.locator('.mb-stage .nl[data-kind="place"]').count()); i++) { await page.evaluate(() => (window as any).__mars.answer((window as any).__mars.correct())); await page.waitForTimeout(1500); }
  await page.waitForSelector('.mb-stage .nl[data-kind="place"]');
  const g = (f: number) => page.evaluate((fr) => { const c = (window as any).__nlCtl; return { x: c.flagToClientX(fr * c.state.L), y: c.trackClientY() }; }, f);
  const flag = () => page.evaluate(() => (document.querySelector('.mb-stage .nl-flag') as Element).getAttribute('transform'));
  await page.evaluate(() => window.addEventListener('pointerdown', (e) => ((window as any).__pid = e.pointerId), true));
  const a = await g(0.7); await page.mouse.move(a.x - 80, a.y); await page.mouse.down(); await page.mouse.move(a.x, a.y, { steps: 5 }); await page.mouse.up();
  const placed = await flag(); expect(placed).toContain('translate');
  const b = await g(0.2); await page.mouse.move(b.x, b.y); await page.mouse.down(); await page.mouse.move(b.x + 20, b.y, { steps: 3 });
  await page.evaluate(() => { const host = document.querySelector('.mb-stage .nl')!.parentElement!; host.dispatchEvent(new PointerEvent('pointercancel', { pointerId: (window as any).__pid, clientX: 0, clientY: 0, bubbles: true })); });
  await page.mouse.up();
  expect(await flag(), 'flag back where it was, not at the left edge').toBe(placed);
  expect(await page.evaluate(() => (window as any).__nlCtl.state.placed)).toBe(true); expect(await page.evaluate(() => (window as any).__nlCtl.state.dragging)).toBe(false);
  expect(watch.errors).toEqual([]);
});
