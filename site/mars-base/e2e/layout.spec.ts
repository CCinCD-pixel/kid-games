/**
 * V10 layout matrix (spec §9): on every acceptance viewport (+ injected real-device insets) every v1 node's FIRST item is reachable and
 * audited (regions = computeLayout ±1 px, disjoint, inside usable, taps ≥ 44 / keys ≥ 72, nothing off-screen, no scroll, text not cut),
 * and every family (+ ask / typed / mode variant) is audited once more on the first node that carries it. Console must stay clean.
 */
import fs from 'node:fs';
import { expect, test } from '@playwright/test';
import { auditMission, boot, itemKey, leaveMission, openAnswerOf, prepare, resetSave, shotPath, startNode } from './lib';

test('every node entry + one item per family: layout rules hold', async ({ page }, ti) => {
  test.setTimeout(420_000);
  const watch = await prepare(page);
  await boot(page, ti);
  let nodes: { id: string; fams: string[] }[] = await page.evaluate(() => (window as any).__mars.nodes().map((id: string) => ({ id, fams: [...new Set((window as any).__mars.node(id).items.map((i: any) => i.fam))] })));
  expect(nodes.length).toBeGreaterThanOrEqual(60);
  if (process.env.MARS_NODES) nodes = nodes.filter((n) => process.env.MARS_NODES!.split(',').includes(n.id));
  const logF = `/Users/ccincd/kid-games-work/state/rr/e2e/progress-${ti.project.name}.log`; fs.mkdirSync('/Users/ccincd/kid-games-work/state/rr/e2e', { recursive: true }); fs.writeFileSync(logF, '');
  const seenFam = new Set<string>(); const seenKey = new Set<string>(); const report: string[] = []; const shots = process.env.MARS_SHOTS !== '0';
  let audited = 0;
  for (const n of nodes) {
    const t0 = Date.now();
    try { await startNode(page, n.id); } catch (e) { report.push(`${n.id}: first item never appeared (${String(e).split('\n')[0]})`); await page.evaluate(() => (window as any).__mars.goMap()); continue; }
    const wanted = n.fams.filter((f) => !seenFam.has(f));
    for (let guard = 0; guard < 10; guard++) {
      const key = await itemKey(page); const first = guard === 0;
      const it = await page.evaluate(() => { const i = (window as any).__mars.item(); return { fam: i.fam, params: i.params, typed: !!i.typed }; });
      if (first || !seenKey.has(key)) {
        await page.waitForTimeout(first ? 120 : 60);
        let issues = await auditMission(page, ti); audited++;
        if (issues.length) { await page.waitForTimeout(500); issues = await auditMission(page, ti); }   // entry animations settle before a violation counts
        if (issues.length) report.push(`${n.id} #${guard} ${key}: ${[...new Set(issues)].join(' | ')}`);
        if (!seenKey.has(key) && shots) await page.screenshot({ path: shotPath(ti, key.split('|').slice(0, 3).join('_')) }).catch(() => undefined);
        seenKey.add(key); seenFam.add(it.fam);
      }
      if (n.fams.every((f) => seenFam.has(f)) || wanted.length === 0) break;
      // walk on to the next item (the hook answers with the oracle; open orders / zoom get a valid sample)
      const prev = await page.evaluate(() => (window as any).__mars.item()?.key);
      const ans = openAnswerOf(it) ?? (await page.evaluate(() => (window as any).__mars.correct()));
      await page.evaluate((a) => (window as any).__mars.answer(a), ans);
      const moved = await page.waitForFunction((k) => { const i = (window as any).__mars.item(); return !!i && i.key !== k; }, prev, { timeout: 6000 }).then(() => true).catch(() => false);
      if (!moved) break;
    }
    await leaveMission(page);
    await resetSave(page);
    fs.appendFileSync(logF, `${n.id} ${Date.now() - t0} ms, audited ${audited}, issues ${report.length}\n`);
  }
  const unbuilt: string[] = await page.evaluate(() => (window as any).__mars.unbuilt());
  fs.writeFileSync('/Users/ccincd/kid-games-work/state/rr/e2e/unbuilt-nodes.txt', unbuilt.join(','));
  console.log(`[${ti.project.name}] unbuilt nodes (not playable, not audited): ${unbuilt.join(' ')}`);
  console.log(`[${ti.project.name}] audited ${audited} screens, ${seenKey.size} family variants, ${seenFam.size} families`);
  if (watch.errors.length) report.push(...[...new Set(watch.errors)].map((e) => `console: ${e}`));
  fs.mkdirSync('/Users/ccincd/kid-games-work/state/rr/e2e', { recursive: true });
  fs.writeFileSync(`/Users/ccincd/kid-games-work/state/rr/e2e/layout-${ti.project.name}.txt`, report.join('\n') || 'clean');
  expect(report, report.join('\n')).toEqual([]);
});
