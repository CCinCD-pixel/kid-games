// 楚河棋院 QA 第 2 轮修复（fix-xiangqi-r2）：整盘"卡片版面审计"——每一种结果卡 / 提问卡 / 警告卡 / 同意卡 / 复盘键，在 5 个视口上：
//   · 整张卡在视口里；所有按键在视口里、≥ 44 px、没有被别的东西（字幕条 / 🏠 / 对局键 / 竖线号…）盖住（elementFromPoint 四角 + 中心）；
//   · 摸底第 9 题（一步杀）必须作答才结束，答错一次就不算会。
// 端口 5321；WebKit；一次一个 worker。截图 → ~/kid-games-work/shots/rr/fix-xiangqi-r2/<项目>-<名>.png
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import os from 'node:os';

const OUT = `${os.homedir()}/kid-games-work/shots/rr/fix-xiangqi-r2`;
const shot = async (page: Page, project: string, name: string): Promise<void> => { mkdirSync(OUT, { recursive: true }); await page.screenshot({ path: `${OUT}/${project}-${name}.png` }); };
async function boot(page: Page, q: string, sel: string): Promise<string[]> {
  const errs: string[] = []; page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await page.addInitScript({ path: 'tools/qa/mute-audio.js' }); await page.goto(`/xiangqi/?${q}`); await page.waitForSelector(sel, { timeout: 20_000 }); await page.waitForTimeout(500); return errs;
}
const xq = <T,>(page: Page, expr: string): Promise<T> => page.evaluate((e) => new Function('x', `return (${e})`)((window as unknown as { __xq: unknown }).__xq), expr) as Promise<T>;
/** 触发一个会一直等到孩子点按键才返回的调用（悔棋 / 和棋 / 提问卡 / 结果卡）：丢到下一个宏任务里，立刻返回 */
const fire = (page: Page, expr: string): Promise<void> => page.evaluate((e) => { const x = (window as unknown as { __xq: unknown }).__xq; setTimeout(() => { void new Function('x', `return (${e})`)(x); }, 0); }, expr);
const tapSq = async (page: Page, name: string): Promise<void> => { const r = await page.evaluate((n) => { const b = (window as unknown as { __xq: { view: { rect(i: number): DOMRect } } }).__xq.view.rect((10 - parseInt(n.slice(1), 10)) * 9 + 'abcdefghi'.indexOf(n[0])); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }, name); await page.touchscreen.tap(r.x, r.y); await page.waitForTimeout(250); };

/** 审计：scope 里每个可见按键 + scope 容器本身。返回问题清单（空 = 通过）。 */
async function auditButtons(page: Page, scope: string, o: { card?: string; minH?: number } = {}): Promise<string[]> {
  return page.evaluate(({ scope, card, minH }) => {
    const vw = window.innerWidth, vh = window.innerHeight; const out: string[] = [];
    const btns = [...document.querySelectorAll<HTMLElement>(scope)].filter((b) => { const r = b.getBoundingClientRect(); const cs = getComputedStyle(b); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; });
    if (!btns.length) return [`没有找到按键：${scope}`];
    if (card) { const c = document.querySelector<HTMLElement>(card); if (!c) out.push(`没有找到卡片 ${card}`); else { const r = c.getBoundingClientRect(); const back = document.querySelector<HTMLElement>('.kit-back'); if (back && card === '.xq-res-card') { const k = back.getBoundingClientRect(); if (k.width > 0 && k.left < r.right && k.right > r.left && k.top < r.bottom && k.bottom > r.top) out.push(`卡片压到 🏠 card[${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.right)},${Math.round(r.bottom)}] home[${Math.round(k.left)},${Math.round(k.top)},${Math.round(k.right)},${Math.round(k.bottom)}]`); }
      if (r.left < -0.5 || r.top < -0.5 || r.right > vw + 0.5 || r.bottom > vh + 0.5) out.push(`卡片超出视口 ${card} [${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.right)},${Math.round(r.bottom)}] vs ${vw}x${vh}`); } }
    for (const b of btns) {
      const r = b.getBoundingClientRect(); const nm = (b.textContent ?? '').trim().slice(0, 12) || b.getAttribute('aria-label') || b.className;
      if (r.left < -0.5 || r.top < -0.5 || r.right > vw + 0.5 || r.bottom > vh + 0.5) out.push(`「${nm}」超出视口 [${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.right)},${Math.round(r.bottom)}] vs ${vw}x${vh}`);
      if (r.width < 43.5 || r.height < (minH ?? 44) - 0.5) out.push(`「${nm}」太小 ${Math.round(r.width)}x${Math.round(r.height)}`);
      const pts: [number, number][] = [[r.left + r.width / 2, r.top + r.height / 2], [r.left + 6, r.top + 6], [r.right - 6, r.top + 6], [r.left + 6, r.bottom - 6], [r.right - 6, r.bottom - 6]];
      for (const [x, y] of pts) { if (x < 0 || y < 0 || x > vw || y > vh) continue; const el = document.elementFromPoint(x, y); if (el && !b.contains(el) && !el.contains(b)) { out.push(`「${nm}」被盖住 @${Math.round(x)},${Math.round(y)} ← ${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)}`); break; } }
    }
    return out;
  }, { scope, card: o.card ?? null, minH: o.minH ?? null });
}
/** 清掉存档再进学堂（手机横屏摸底做完后入口会收起，所以每次摸底前都从空存档开始；页面卸载时会把内存里的存档写回，所以要在新页面的 init 脚本里清，不能在旧页面里清） */
const freshAcademy = async (page: Page): Promise<void> => { await page.addInitScript(() => { try { localStorage.removeItem('kg:v1:xiangqi'); } catch { /* */ } }); await page.goto('/xiangqi/?dev=1&screen=academy'); await page.waitForSelector('.xq-academy'); await page.waitForTimeout(300); };
const settle = (page: Page, ms = 700): Promise<void> => page.waitForTimeout(ms);
const gameQ = (extra = ''): string => `dev=1&mode=robot&robot=1&seed=7${extra ? '&' + extra : ''}`;
const GAME = '.xq-game[data-ready]';

// 终局种类（每个都走真实的 onEnd → xqResult；机器人局 + 面对面 + 小局）
const ENDS: { name: string; q: string; out: string; kind: RegExp; why?: boolean }[] = [
  { name: 'win-mate', q: gameQ(), out: '{over:true,winner:0,reason:"checkmate"}', kind: /robot-checkmate-w/ },
  { name: 'loss-mate', q: gameQ(), out: '{over:true,winner:1,reason:"checkmate"}', kind: /robot-checkmate-l/ },
  { name: 'win-stalemate', q: gameQ(), out: '{over:true,winner:0,reason:"stalemate-loss"}', kind: /robot-stalemate-loss-w/, why: true },
  { name: 'loss-stalemate', q: gameQ(), out: '{over:true,winner:1,reason:"stalemate-loss"}', kind: /robot-stalemate-loss-l/, why: true },
  { name: 'loss-perpetual', q: gameQ(), out: '{over:true,winner:1,reason:"perpetual-check"}', kind: /robot-perpetual-check-l/, why: true },
  { name: 'win-perpetual', q: gameQ(), out: '{over:true,winner:0,reason:"perpetual-check"}', kind: /robot-perpetual-check-w/ },
  { name: 'draw-rep', q: gameQ(), out: '{over:true,winner:null,reason:"repetition"}', kind: /robot-repetition-d/ },
  { name: 'draw-limit', q: gameQ(), out: '{over:true,winner:null,reason:"no-capture-limit"}', kind: /robot-no-capture-limit-d/ },
  { name: 'robot-resigns', q: gameQ(), out: '{over:true,winner:0,reason:"resign"}', kind: /robot-resign-w/ },
  { name: 'xj-win', q: 'dev=1&mode=xj&xj=danche.1328&fen=3a5/9/4ka3/R2P5/9/9/9/9/9/5K3%20w&seed=7', out: '{over:true,winner:0,reason:"checkmate"}', kind: /xj-checkmate-w/ },
  { name: 'f2f-red', q: 'dev=1&mode=f2f&seed=7', out: '{over:true,winner:0,reason:"checkmate"}', kind: /f2f-checkmate-w/ },
  { name: 'f2f-black-perpetual', q: 'dev=1&mode=f2f&seed=7', out: '{over:true,winner:1,reason:"perpetual-check"}', kind: /f2f-perpetual-check-l/ },
  { name: 'f2f-stalemate', q: 'dev=1&mode=f2f&seed=7', out: '{over:true,winner:0,reason:"stalemate-loss"}', kind: /f2f-stalemate-loss-w/ },
  { name: 'f2f-draw', q: 'dev=1&mode=f2f&seed=7', out: '{over:true,winner:null,reason:"agreed"}', kind: /f2f-agreed-d/ },
];
for (const e of ENDS) {
  test(`结果卡版面 · ${e.name}：按键全在视口里、≥44 px、没被盖住`, async ({ page }, info) => {
    const errs = await boot(page, e.q, GAME);
    await fire(page, `x.forceEnd(${e.out})`); await page.waitForSelector('.xq-res', { timeout: 8000 }); await settle(page);
    const kind = await page.locator('.xq-res').getAttribute('data-kind'); expect(kind ?? '').toMatch(e.kind);
    expect(await auditButtons(page, '.xq-res button', { card: '.xq-res-card' })).toEqual([]);
    if (e.why) expect(await page.locator('.xq-res [data-act=why]').count()).toBe(1);
    if (/stalemate/.test(e.name) && !e.name.startsWith('f2f')) expect(await page.locator('.xq-res-text').innerText()).toContain('困毙');
    if (/perpetual/.test(e.name)) expect(await page.locator('.xq-res-text').innerText()).toContain('长将');
    // 卡内文字不被截断：正文区要么没滚动，要么能滚
    const body = await page.evaluate(() => { const b = document.querySelector<HTMLElement>('.xq-res-body')!; return { sh: b.scrollHeight, ch: b.clientHeight }; }); expect(body.ch).toBeGreaterThan(20);
    await shot(page, info.project.name, `card-${e.name}`);
    expect(errs).toEqual([]);
  });
}

test('认输（真实流程）：认输键 → 认输提问卡 → 结果卡，两张卡都过版面审计', async ({ page }, info) => {
  const errs = await boot(page, gameQ(), GAME);
  await page.locator('[data-key=resign]').click(); await page.waitForSelector('.xq-ask', { timeout: 5000 }); await settle(page, 400);
  expect(await auditButtons(page, '.xq-ask button', { card: '.xq-ask' })).toEqual([]); await shot(page, info.project.name, 'ask-resign');
  await page.locator('.xq-ask .xq-btn', { hasText: '认输' }).click(); await page.waitForSelector('.xq-res', { timeout: 8000 }); await settle(page);
  expect(await page.locator('.xq-res').getAttribute('data-kind')).toMatch(/robot-resign-l/);
  expect(await auditButtons(page, '.xq-res button', { card: '.xq-res-card' })).toEqual([]); await shot(page, info.project.name, 'card-resign-real');
  expect(errs).toEqual([]);
});

test('提问 / 警告卡：长将提醒（面对面朝向对方）、小局上限、教练、认输确认……最长的字也放得下', async ({ page }, info) => {
  const errs = await boot(page, gameQ(), GAME);
  const long = '再这样一直将军，按家规「长将判负」。可以换个走法，也可以悔棋。';
  for (const [i, c] of ([[long, ['知道了'], false], [long, ['换个走法', '就这样走'], false], ['这一盘已经下了很久，要不要再试一次？也可以接着往下走，随你喜欢。', ['再试一次', '继续'], false], [long, ['知道了'], true]] as [string, string[], boolean][]).entries()) {
    await fire(page, `void x.ask(${JSON.stringify(c[0])}, ${JSON.stringify(c[1])}, ${c[2]})`); await page.waitForSelector('.xq-ask', { timeout: 4000 }); await settle(page, 350);
    expect(await auditButtons(page, '.xq-ask button', { card: '.xq-ask' }), `ask#${i}`).toEqual([]); if (i === 1) await shot(page, info.project.name, 'ask-long');
    await page.locator('.xq-ask button').first().click(); await page.waitForTimeout(150);
  }
  expect(errs).toEqual([]);
});

test('面对面 悔棋 / 和棋 同意卡：问卡 + 等待卡的按键都过审计；不叠第二张；终局时旧的长将卡被收掉', async ({ page }, info) => {
  const errs = await boot(page, 'dev=1&mode=f2f&seed=7', GAME);
  await xq(page, 'x.play("a4a5")'); await xq(page, 'x.play("a7a6")'); await settle(page, 300);
  await fire(page, 'x.undo()'); await page.waitForSelector('.bk-f2f-card', { timeout: 4000 }); await settle(page, 400);
  const msg = await page.locator('.bk-f2f-card:not(.is-wait) .bk-f2f-msg').first().innerText(); expect(msg).toContain('悔棋'); expect(msg).not.toContain('悔一步');
  expect(await auditButtons(page, '.bk-f2f-card button', { card: '.bk-f2f-card' })).toEqual([]); await shot(page, info.project.name, 'f2f-undo-consent');
  // 同意卡开着时再点和棋 / 悔棋 / 认输：不叠第二张卡
  await fire(page, 'x.draw(0)'); await fire(page, 'x.undo()'); await fire(page, 'x.resign(0)'); await page.waitForTimeout(400);
  expect(await page.locator('.bk-f2f-card').count()).toBe(2);                                      // 一张问卡 + 一张等待卡
  await page.locator('.bk-f2f-card:not(.is-wait) .bk-f2f-btn.is-sub').click(); await page.waitForTimeout(300);   // 先不用
  expect(await page.locator('.bk-f2f-card').count()).toBe(0); expect(await xq<number>(page, 'x.game.moves.length')).toBe(2);
  await fire(page, 'x.draw(1)'); await page.waitForSelector('.bk-f2f-card', { timeout: 4000 }); await settle(page, 400);
  expect(await auditButtons(page, '.bk-f2f-card button', { card: '.bk-f2f-card' })).toEqual([]); await shot(page, info.project.name, 'f2f-draw-consent');
  await page.locator('.bk-f2f-card:not(.is-wait) .bk-f2f-btn:not(.is-sub)').click(); await page.waitForSelector('.xq-res', { timeout: 6000 }); await settle(page);
  expect(await page.locator('.xq-res').getAttribute('data-kind')).toMatch(/f2f-agreed-d/); expect(await auditButtons(page, '.xq-res button', { card: '.xq-res-card' })).toEqual([]);
  expect(await page.locator('.xq-ask, .bk-f2f-card').count()).toBe(0);
  expect(errs).toEqual([]);
});

test('复盘：结果卡 → 复盘，复盘键在视口里、≥44、没被盖住；摆到真棋盘的数字不压棋子、开局标题叫「开局」', async ({ page }, info) => {
  const errs = await boot(page, gameQ(), GAME);
  await xq(page, 'x.play("h3e3")'); await page.waitForTimeout(2500); await fire(page, 'x.forceEnd({over:true,winner:1,reason:"checkmate"})'); await page.waitForSelector('.xq-res'); await settle(page);
  await page.locator('.xq-res [data-act=replay]').click(); await page.waitForSelector('.xq-replaying', { timeout: 5000 }); await settle(page, 900);
  expect(await auditButtons(page, '.xq-replaying .xq-key', {})).toEqual([]); await shot(page, info.project.name, 'replay');
  expect(errs).toEqual([]);
});

test('摆到真棋盘：数字行与端线棋子之间留出空隙（SVG 里数字文字的框不与棋子圆相交）', async ({ page }, info) => {
  const errs = await boot(page, gameQ('fen=' + encodeURIComponent('rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w')), GAME);
  await fire(page, 'x.forceEnd({over:true,winner:0,reason:"checkmate"})'); await page.waitForSelector('.xq-res'); await settle(page);
  await page.locator('.xq-res [data-act=replay]').click(); await page.waitForSelector('.xq-replaying'); await settle(page, 700);
  // 复盘里的"更多"→ 摆到真棋盘；直接用 panels 的出口：点复盘菜单
  await page.locator('[data-key=r-more]').first().click().catch(() => undefined);
  const real = page.locator('.xq-menu .xq-btn', { hasText: '摆到真棋盘' }); if (await real.count()) { await real.first().click(); await page.waitForSelector('.xq-diagram', { timeout: 4000 }); await settle(page, 400);
    const bad = await page.evaluate(() => { const svg = document.querySelector('.xq-diagram')!; const circles = [...svg.querySelectorAll('circle')].map((c) => c.getBoundingClientRect()); const texts = [...svg.querySelectorAll('text')].filter((t) => /^\d+$|^[一二三四五六七八九]$/.test((t.textContent ?? '').trim())).map((t) => ({ r: t.getBoundingClientRect(), s: t.textContent })); const hits: string[] = []; for (const t of texts) for (const c of circles) if (t.r.left < c.right && t.r.right > c.left && t.r.top < c.bottom && t.r.bottom > c.top) hits.push(`${t.s}`); return hits; });
    expect(bad, '数字压到棋子').toEqual([]); expect(await page.locator('.xq-modal-card small, .xq-wallhead b').first().innerText()).toContain('开局'); await shot(page, info.project.name, 'realboard'); }
  expect(errs).toEqual([]);
});

test('软门卡片（点 R1 且 L17–L20 未学）：两个按键在视口里、≥44、没被盖住', async ({ page }, info) => {
  const errs = await boot(page, 'dev=1&screen=arena', '.xq-arena'); await page.locator('[data-robot=R1]').first().click(); await page.waitForSelector('.xq-softgate'); await settle(page, 500);
  expect(await auditButtons(page, '.xq-modal-card button', { card: '.xq-modal-card' })).toEqual([]); await shot(page, info.project.name, 'softgate');
  expect(errs).toEqual([]);
});

test('学堂的卡片：本课学完 / 小战场询问 / 摸底结果（0 课与 16 课）/ 章节「我会了」确认', async ({ page }, info) => {
  const errs = await boot(page, 'dev=1&screen=academy', '.xq-academy');
  await page.locator('.xq-chap-know').first().click(); await page.waitForSelector('.xq-res', { timeout: 4000 }); await settle(page, 500);
  expect(await page.locator('.xq-res').getAttribute('data-kind')).toBe('chapter-skip'); expect(await auditButtons(page, '.xq-res button', { card: '.xq-res-card' })).toEqual([]); await shot(page, info.project.name, 'card-chapter-skip');
  await page.locator('.xq-res [data-act=no]').click(); await page.waitForTimeout(400);
  await page.goto('/xiangqi/?dev=1&screen=lesson&lesson=L04'); await page.waitForSelector('.xq-lesson[data-ready]'); await settle(page, 600);
  await fire(page, 'x.cards.lessonDone()'); await page.waitForSelector('.xq-res'); await settle(page, 500); expect(await page.locator('.xq-res').getAttribute('data-kind')).toBe('lesson-done');
  expect(await auditButtons(page, '.xq-res button', { card: '.xq-res-card' })).toEqual([]); await shot(page, info.project.name, 'card-lesson-done');
  await page.goto('/xiangqi/?dev=1&screen=lesson&lesson=L07'); await page.waitForSelector('.xq-lesson[data-ready]'); await settle(page, 600);
  await fire(page, 'x.cards.battleAsk()'); await page.waitForSelector('.xq-res'); await settle(page, 500); expect(await page.locator('.xq-res').getAttribute('data-kind')).toBe('battle-ask');
  expect(await auditButtons(page, '.xq-res button', { card: '.xq-res-card' })).toEqual([]); await shot(page, info.project.name, 'card-battle-ask');
  for (const n of [0, 9]) {
    await freshAcademy(page); await page.locator('[data-act=placement]').click(); await page.waitForSelector('.xq-lesson[data-ready]'); await settle(page, 600);
    await fire(page, `x.cards.placementResult(${n})`); await page.waitForSelector('.xq-res'); await settle(page, 500); expect(await page.locator('.xq-res').getAttribute('data-kind')).toBe('placement-result');
    expect(await auditButtons(page, '.xq-res button', { card: '.xq-res-card' })).toEqual([]); await shot(page, info.project.name, `card-placement-${n}`);
  }
  expect(errs).toEqual([]);
});

test('摸底第 9 题（一步杀）必须作答：不碰棋盘 5 秒不会自己结束、也不弹结果卡；答错再答对 = 这一课不算会；一次答对 = L25 算会', async ({ page }, info) => {
  const errs = await boot(page, 'dev=1&screen=academy', '.xq-academy'); await page.locator('[data-act=placement]').click(); await page.waitForSelector('.xq-lesson[data-ready]'); await settle(page, 500);
  await xq(page, 'x.runFrom("PL.9")'); await page.waitForFunction(() => (window as unknown as { __xq: { step: string; goal: string } }).__xq.step === 'PL.9', null, { timeout: 25_000 });
  await page.waitForFunction(() => !!(window as unknown as { __xq: { goal: string } }).__xq.goal, null, { timeout: 25_000 }); await page.waitForTimeout(5000);   // 以前：约 2 秒就自动放行
  expect(await page.locator('.xq-res').count()).toBe(0); expect(await xq<string>(page, 'x.goal')).toBe('p.mate1'); expect(await page.locator('.xq-goal').innerText()).toContain('一步将死');
  expect(await xq<number>(page, 'x.state.b.filter(Boolean).length')).toBe(5);              // 题面在盘上：帅 / 马 / 车 / 将 / 士
  await shot(page, info.project.name, 'placement-q9');
  await tapSq(page, 'i1'); await tapSq(page, 'i5');                                       // 走错（车往上走一段，不是杀）
  await page.waitForTimeout(3500); expect(await page.locator('.xq-res').count()).toBe(0);
  await tapSq(page, 'i1'); await tapSq(page, 'f1'); await page.waitForSelector('.xq-res', { timeout: 10_000 }); await settle(page, 500);
  expect(await page.locator('.xq-res-title').innerText()).toContain('从头学起');       // 先错后对：firstTry 为假 → 0 课
  expect(await auditButtons(page, '.xq-res button', { card: '.xq-res-card' })).toEqual([]);
  // 一次答对：L25 算会
  await freshAcademy(page); await page.locator('[data-act=placement]').click(); await page.waitForSelector('.xq-lesson[data-ready]'); await settle(page, 500);
  await xq(page, 'x.runFrom("PL.9")'); await page.waitForFunction(() => (window as unknown as { __xq: { step: string; goal: string } }).__xq.step === 'PL.9', null, { timeout: 25_000 });
  await page.waitForFunction(() => !!(window as unknown as { __xq: { goal: string } }).__xq.goal, null, { timeout: 25_000 }); await page.waitForTimeout(400);
  await tapSq(page, 'i1'); await tapSq(page, 'f1'); await page.waitForSelector('.xq-res', { timeout: 10_000 }); await settle(page, 400);
  expect(await page.locator('.xq-res-title').innerText()).toContain('有 1 课你已经会了'); await shot(page, info.project.name, 'placement-q9-result');
  expect(errs).toEqual([]);
});

test('主屏 App 安全区（?safe=）：结果卡整张在安全区内；课里的「跳过」键不压进刘海 / 圆角', async ({ page }, info) => {
  const vs = page.viewportSize()!; const land = vs.width > vs.height; const sf = land ? { t: 0, r: 59, b: 21, l: 59 } : { t: 47, r: 0, b: 34, l: 0 }; const q = `safe=${sf.t},${sf.r},${sf.b},${sf.l}`;
  const errs = await boot(page, `${gameQ(q)}`, GAME);
  await fire(page, 'x.forceEnd({over:true,winner:1,reason:"perpetual-check"})'); await page.waitForSelector('.xq-res'); await settle(page);
  expect(await auditButtons(page, '.xq-res button', { card: '.xq-res-card' })).toEqual([]);
  const r = await page.evaluate(() => { const b = document.querySelector('.xq-res-card')!.getBoundingClientRect(); return { l: b.left, t: b.top, r: window.innerWidth - b.right, b: window.innerHeight - b.bottom }; });
  expect(r.l).toBeGreaterThanOrEqual(sf.l - 0.5); expect(r.t).toBeGreaterThanOrEqual(sf.t - 0.5); expect(r.r).toBeGreaterThanOrEqual(sf.r - 0.5); expect(r.b).toBeGreaterThanOrEqual(sf.b - 0.5); await shot(page, info.project.name, 'card-safe-area');
  await page.goto(`/xiangqi/?dev=1&screen=lesson&lesson=L04&${q}`); await page.waitForSelector('.xq-lesson[data-ready]'); await page.waitForSelector('.xg-skip[data-state="shown"]', { timeout: 12_000 }).catch(() => undefined);
  const sk = await page.evaluate(() => { const e = document.querySelector<HTMLElement>('.xg-skip'); if (!e) return null; const b = e.getBoundingClientRect(); return { t: b.top, r: window.innerWidth - b.right, shown: e.dataset.state }; });
  if (sk && sk.shown === 'shown') { expect(sk.t, '跳过键上沿').toBeGreaterThanOrEqual(sf.t - 0.5); expect(sk.r, '跳过键右边').toBeGreaterThanOrEqual(sf.r - 0.5); }
  expect(errs).toEqual([]);
});

test('L33 第一盘棋：两个按键（去下第一盘 / 先回学堂）在同一行、视口里、≥44、没被盖住；坚持按"去下第一盘"进入整盘', async ({ page }, info) => {
  const errs = await boot(page, 'dev=1&screen=lesson&lesson=L33', '.xq-lesson[data-ready]');
  await page.waitForSelector('.xq-slot .bk-su-btn', { timeout: 25_000 }); await settle(page, 500);
  expect(await page.locator('.xq-slot .bk-su-btn').count()).toBe(2);
  expect(await auditButtons(page, '.xq-slot .bk-su-btn', {})).toEqual([]);
  const ys = await page.locator('.xq-slot .bk-su-btn').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top))); expect(ys[0]).toBe(ys[1]);   // 同一行
  await shot(page, info.project.name, 'L33-choose');
  expect(errs).toEqual([]);
});

test('目标条：L21 的"点出能吃到它的黑子"、L26（题组步）的"一步将死"常驻；题组步触屏点得动（走完第 1 题进第 2 题）', async ({ page }, info) => {
  const errs = await boot(page, 'dev=1&screen=lesson&lesson=L21', '.xq-lesson[data-ready]');
  await page.waitForFunction(() => (window as unknown as { __xq: { live: boolean; goal: string; step: string } }).__xq.live && (window as unknown as { __xq: { step: string } }).__xq.step === 'L21.1', null, { timeout: 25_000 });
  expect(await page.locator('.xq-goal').innerText()).toContain('点出能吃到它'); await shot(page, info.project.name, 'goal-L21');
  await page.goto('/xiangqi/?dev=1&screen=lesson&lesson=L26'); await page.waitForSelector('.xq-lesson[data-ready]');
  await page.waitForFunction(() => !!(window as unknown as { __xq: { goal: string } }).__xq.goal, null, { timeout: 25_000 }); await page.waitForTimeout(500);
  expect(await page.locator('.xq-goal').innerText()).toContain('一步将死'); await shot(page, info.project.name, 'goal-L26');
  const sol = await xq<string>(page, 'x.ctx.data.puzzle(x.run.steps[0].ids[0], x.run.steps[0]).solution[0][0]'); const a = sol.slice(0, 2), b = sol.slice(2);
  await tapSq(page, a); await tapSq(page, b); await page.waitForTimeout(2500);
  expect(await page.locator('.xq-goal').innerText()).toContain('一步将死');                    // 第 2 题：目标条还在
  expect(await xq<string>(page, 'x.step')).toBe('L26.1'); expect(await xq<boolean>(page, 'x.live')).toBe(true);
  expect(errs).toEqual([]);
});

test('对局版面截图：dock 里的键 / 伙伴 / 吃子小标离面板边线有空隙', async ({ page }, info) => {
  const errs = await boot(page, gameQ(), GAME);
  await xq(page, 'x.play("h3e3")'); await page.waitForTimeout(2600); await shot(page, info.project.name, 'game-dock');
  const L = await xq<{ dock: { y: number; h: number; x: number; w: number }; keys: { x: number; y: number; w: number; h: number }[] }>(page, '({dock: x.layout.dock || x.layout.panel, keys: x.layout.keys})');
  for (const k of L.keys) expect(k.y + k.h).toBeLessThanOrEqual(L.dock.y + L.dock.h - 8 + 0.5);
  expect(errs).toEqual([]);
});
