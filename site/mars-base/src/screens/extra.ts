/** Screens beside the runner: S3 build scene, S7 徽章墙, S8 档案, S11 家长页 (PIN). Spec §2.4, §5.3, §5.4. */
import { askParentPin, confetti, icon } from '@kit/ui';
import cardsJson from '../../../../content/mars-base/cards.json';
import { CARDS } from '../app/content';
import { BaseEvents, SITE_KEYS, errorLabel, litCards, mainDone, tagRows, type SiteKey } from '../app/base';
import { DIAG_CLASSES } from '../app/types';
import type { OrbitTest } from '../save/schema';
import { SITE_NAME, buildingSvg } from '../art/buildings';
import { lineText } from '../voice/lines';
import { isAutomated, reducedMotion } from '../stages/common';
import type { App } from './app';

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, html = ''): HTMLElementTagNameMap[K] => { const e = document.createElement(tag); e.className = cls; if (html) e.innerHTML = html; return e; };
const backBtn = (onClick: () => void): HTMLButtonElement => { const b = h('button', 'mb-ch-back xg-btn xg-btn--secondary', icon('back')); b.type = 'button'; b.setAttribute('aria-label', '回地图'); b.onclick = onClick; return b; };

/** S3: the part rises (600 ms), the tier swaps (1.2 s), the level line; tap to skip. */
export async function showBuild(app: App, ev: BaseEvents, site: SiteKey | null): Promise<void> {
  if (!ev.part && !ev.tierUps.length && !ev.levelUp) return;
  const up = ev.tierUps[0]; const focus: SiteKey = up?.site ?? site ?? 'orbit'; const tier = app.save.buildings[focus] ?? 1;
  const root = h('div', 'mb-build'); const card = h('div', 'mb-build-card');
  const bld = h('div', 'mb-build-bld', buildingSvg(focus, up ? up.from : tier)); const line = h('div', 'mb-build-line'); card.append(bld, line); root.append(card);
  document.body.append(root);
  const say = (id: string, vars?: Record<string, string | number>) => { line.textContent = lineText(id, vars); app.say(null, null, id, vars); };
  const fast = isAutomated(); const wait = (ms: number) => new Promise<void>((r) => { const t = setTimeout(r, fast ? 30 : reducedMotion() ? ms / 2 : ms); root.addEventListener('click', () => { clearTimeout(t); r(); }, { once: true }); });
  say('mars.build.part'); bld.classList.add('is-rise'); app.sfx('ui-pop'); await wait(900);
  if (up) { bld.innerHTML = buildingSvg(focus, up.to); bld.classList.remove('is-rise'); void bld.offsetWidth; bld.classList.add('is-tier'); app.sfx('unlock'); say(up.to >= 3 ? 'mars.build.full' : 'mars.build.tier', { zone: SITE_NAME[focus] }); await wait(1300); }
  if (ev.levelUp) { say('mars.map.level', { n: ev.levelUp }); await wait(1100); }
  root.classList.add('is-out'); await new Promise((r) => setTimeout(r, fast ? 0 : 240)); root.remove();
}

/** S7 徽章墙: three copper plaques (outline / glowing / half-lit). */
export function showBadges(app: App): void {
  const root = h('div', 'mb-badges'); const save = app.save;
  root.append(backBtn(() => app.goMap()), h('div', 'mb-ch-title', '徽章站'));
  const row = h('div', 'mb-plaques');
  for (const c of CARDS) {
    const st = save.cert[c].state; const p = h('div', `mb-plaque is-${st}`); p.dataset.card = c;
    p.innerHTML = `<svg viewBox="0 0 120 120" width="120" height="120" aria-hidden="true"><circle cx="60" cy="60" r="52" fill="${st === 'none' ? 'none' : 'var(--xg-gold-500)'}" fill-opacity="${st === 'half' ? 0.5 : 1}" stroke="var(--mb-cut)" stroke-width="5" ${st === 'none' ? 'stroke-dasharray="9 8"' : ''}/><circle cx="60" cy="60" r="38" fill="none" stroke="var(--mb-cut)" stroke-width="3" opacity=".5"/>${st === 'lit' ? '<path d="M38 62 l15 15 29-34" fill="none" stroke="var(--mb-cut)" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>' : st === 'half' ? '<path d="M38 62 l15 15" fill="none" stroke="var(--mb-cut)" stroke-width="9" stroke-linecap="round"/>' : ''}</svg><b>${lineText(`mars.badge.${c}`)}</b><span>${st === 'lit' ? lineText(`mars.cert.lit.${c}`) : st === 'half' ? lineText('mars.cert.practice') : lineText('mars.cert.start')}</span>`;
    if (st === 'half') { const go = h('button', 'xg-btn xg-btn--primary mb-plaque-go', lineText('mars.cert.practiceFrom')); go.type = 'button'; go.onclick = () => app.showChapter('cert'); p.append(go); }
    row.append(p);
  }
  const open = CARDS.filter((c) => save.cert[c].state !== 'lit');
  const all = h('button', 'xg-btn xg-btn--primary xg-btn--lg mb-wall-go', '一起验货'); all.type = 'button'; all.hidden = !open.length; all.onclick = () => void app.runWall();   // verify every card that is not lit in one go
  root.append(row, all, h('div', 'mb-badges-note', lineText('mars.cert.wall'))); app.screen(root); app.say(null, null, 'mars.cert.wall');
}

// ---- S8 档案 ----------------------------------------------------------------------------------------------------------------------
export function orbitChart(t: OrbitTest | undefined, w = 220, hh = 220): string {
  if (!t) return `<svg viewBox="0 0 ${w} ${hh}" width="${w}" height="${hh}" aria-hidden="true"><rect x="10" y="10" width="${w - 20}" height="${hh - 20}" rx="14" fill="var(--xg-paper-200)" stroke="var(--xg-paper-400)" stroke-width="2" stroke-dasharray="6 6"/><path d="M${w * 0.28} ${hh * 0.72} L${w * 0.72} ${hh * 0.28}" stroke="var(--xg-paper-400)" stroke-width="4" stroke-dasharray="3 8" stroke-linecap="round"/></svg>`;
  const L = t.L; const X = (v: number) => 20 + (v / L) * (w - 40); const Y = (v: number) => hh - 20 - (v / L) * (hh - 40);
  let g = `<rect x="6" y="6" width="${w - 12}" height="${hh - 12}" rx="14" fill="var(--xg-paper-100)" stroke="var(--xg-paper-400)" stroke-width="2"/><path d="M${X(0)} ${Y(0)} L${X(L)} ${Y(L)}" stroke="var(--xg-jade-500)" stroke-width="4" stroke-dasharray="3 7" stroke-linecap="round"/>`;
  t.targets.forEach((tg, i) => { const e = t.est[i]; if (e !== undefined) g += `<circle cx="${X(tg)}" cy="${Y(Math.max(0, Math.min(L, e)))}" r="6" fill="var(--xg-mars)" stroke="var(--xg-ink-800)" stroke-width="2"/>`; });
  return `<svg viewBox="0 0 ${w} ${hh}" width="${w}" height="${hh}" role="img" aria-label="你的轨道">${g}</svg>`;
}
type CardRow = { id: string; title: string; body: string; verified: unknown; scope: string };
/** S8 档案馆: your orbit (labelled), the knowledge-card shelf (earned cards face up, the rest face down — a collection to fill), a line to tell dad. */
export function showArchive(app: App): void {
  const save = app.save; const root = h('div', 'mb-archive');
  root.append(backBtn(() => app.goMap()), h('div', 'mb-ch-title', '档案馆'));
  const body = h('div', 'mb-arch-body'); const tests = save.orbit.tests.filter((t) => t.valid);
  const last = (L: number) => [...tests].reverse().find((t) => t.L === L);
  const fig = (L: number, name: string) => `<figure class="mb-arch-fig">${orbitChart(last(L), 200, 200)}<figcaption><b>${name}</b><span>${last(L) ? '你的估算' : '还没画'}</span></figcaption></figure>`;
  body.append(h('section', 'mb-arch-sec', `<h3>你的轨道</h3><div class="mb-arch-charts">${fig(100, '百里轨道')}${fig(1000, '千里轨道')}</div><p>点越靠近亮线，估得越准。</p>`));
  const all = (cardsJson.cards as CardRow[]).filter((c) => c.scope === 'v1' && c.verified);
  const have = all.filter((c) => save.cards.includes(c.id));
  const sec = h('section', 'mb-arch-sec', `<h3>知识卡 <small>${have.length} / ${all.length}</small></h3>`);
  const shelf = h('div', 'mb-shelf');
  for (const c of all) shelf.append(save.cards.includes(c.id) ? h('article', 'mb-card is-got', `<b>${c.title}</b><p>${c.body}</p>`) : h('div', 'mb-card is-lock', '<i aria-hidden="true">？</i><span>还没拿到</span>'));
  if (!all.length) sec.append(h('p', 'mb-arch-empty', '新的卡片还在整理，很快就来。')); else sec.append(shelf);
  body.append(sec);
  const talks = (cardsJson.talk as { id: string; text: string }[]); if (talks.length) body.append(h('section', 'mb-arch-sec mb-talk', `<h3>讲给爸爸</h3><p>${talks[save.session.missions % talks.length].text}</p>`));
  root.append(body); app.screen(root);
}

/** S0a ending: the base lights up, the first part rises, the first knowledge card is earned, then the map (spec §2.5). Tap to skip. */
export async function showFirstLight(app: App): Promise<void> {
  const root = h('div', 'mb-build mb-first'); const card = h('div', 'mb-build-card'); const bld = h('div', 'mb-build-bld', buildingSvg('orbit', 1, true)); const line = h('div', 'mb-build-line'); const line2 = h('div', 'mb-build-line mb-build-line--card');
  card.append(bld, line, line2); root.append(card); document.body.append(root);
  const fast = isAutomated(); const wait = (ms: number) => new Promise<void>((r) => { const t = setTimeout(r, fast ? 30 : reducedMotion() ? ms / 2 : ms); root.addEventListener('click', () => { clearTimeout(t); r(); }, { once: true }); });
  const first = (cardsJson.cards as CardRow[]).find((c) => c.id === 'card.1');
  line.textContent = lineText('mars.onb.4'); app.say(null, null, 'mars.onb.4'); bld.classList.add('is-rise'); app.sfx('unlock'); if (!fast) confetti(40); await wait(1500);
  if (first && first.verified) { line2.textContent = `新知识卡：${first.title}`; line2.classList.add('is-on'); app.sfx('ui-pop'); await wait(1500); }
  root.classList.add('is-out'); await new Promise((r) => setTimeout(r, fast ? 0 : 240)); root.remove();
}

// ---- S11 家长页 -------------------------------------------------------------------------------------------------------------------
const fmtDate = (t: number): string => { if (!t) return '—'; const d = new Date(t); return `${d.getMonth() + 1}月${d.getDate()}日`; };
export async function showParent(app: App): Promise<void> {
  if (!(await askParentPin({ title: '家长页', text: '请输入家长 PIN', accentGame: 'mars' }))) return;
  renderParent(app);
}
export function renderParent(app: App): void {
  const save = app.save; const root = h('div', 'mb-parent'); root.append(backBtn(() => app.goMap()), h('div', 'mb-ch-title', '家长页'));
  const body = h('div', 'mb-par-body');
  // 1. number-line trend (only with themselves)
  const trend = (L: number) => {
    const ts = save.orbit.tests.filter((t) => t.valid && t.L === L); if (!ts.length) return `<p class="mb-par-empty">还没有 0–${L} 的估算记录</p>`;
    const W = 260, H = 110; const pts = ts.map((t, i) => `${(ts.length === 1 ? W / 2 : 20 + (i * (W - 40)) / (ts.length - 1)).toFixed(0)},${(H - 16 - Math.min(0.3, t.pae) / 0.3 * (H - 32)).toFixed(0)}`).join(' ');
    return `<figure><svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="0–${L} 估算误差"><polyline points="${pts}" fill="none" stroke="var(--xg-jade-600)" stroke-width="3"/>${pts.split(' ').map((p, i) => `<circle cx="${p.split(',')[0]}" cy="${p.split(',')[1]}" r="${i === 0 ? 6 : 4}" fill="${i === 0 ? 'var(--xg-gold-500)' : 'var(--xg-jade-500)'}" stroke="var(--xg-ink-800)" stroke-width="1.6"/>`).join('')}</svg><figcaption>0–${L}：误差 ${Math.round(ts[0].pae * 1000) / 10}%（你的基线）→ ${Math.round(ts[ts.length - 1].pae * 1000) / 10}%</figcaption></figure>`;
  };
  const big = save.errors.logCompress && save.errors.logCompress.n >= 2 ? '<p class="mb-par-note">大数常被放得偏小，可以多玩千里轨道。</p>' : '';
  body.append(h('section', 'mb-par-sec', `<h3>数轴估算趋势</h3><div class="mb-par-trend">${trend(100)}${trend(1000)}</div>${big}<p class="mb-par-note">估数的能力和后来的数学学习关系密切；这里只和他自己的第一次比较。</p>`));
  // 2. error classes
  const rows = DIAG_CLASSES.filter((c) => save.errors[c]?.n).map((c) => ({ c, n: save.errors[c]!.n, recent: save.errors[c]!.recent })).sort((a, b) => b.n - a.n);
  const maxN = Math.max(1, ...rows.map((r) => r.n));
  body.append(h('section', 'mb-par-sec', `<h3>错误类型</h3>${rows.length ? rows.map((r) => `<details class="mb-bar"><summary><span>${errorLabel(r.c)}${r.n < 2 ? '（疑似）' : ''}</span><i style="width:${Math.round((r.n / maxN) * 100)}%"></i><b>${r.n}</b></summary><p>最近：${r.recent.map((x) => `${x.fam} · ${fmtDate(x.at)}`).join('；') || '—'}</p></details>`).join('') : '<p class="mb-par-empty">还没有记录</p>'}`));
  // 3. badges
  body.append(h('section', 'mb-par-sec', `<h3>徽章记录</h3><ul class="mb-par-list">${CARDS.map((c) => { const s = save.cert[c]; return `<li><b>${lineText(`mars.badge.${c}`)}</b> ${s.state === 'lit' ? '已点亮' : s.state === 'half' ? '半亮 · 复习中' : '未验货'}（验货 ${s.attempts} 次 · ${fmtDate(s.at ?? 0)}）<code>${s.answers ?? ''}</code></li>`; }).join('')}</ul>`));
  // 4. tag mastery
  const tr = tagRows(save);
  body.append(h('section', 'mb-par-sec', `<h3>知识点掌握</h3>${tr.length ? `<ul class="mb-par-tags">${tr.map((r) => `<li><span>${r.tag}</span><em>${[...r.window].map((ch) => `<i class="${ch === '1' ? 'ok' : 'no'}"></i>`).join('')}</em><b>${r.mastered ? '已掌握' : `第 ${r.level} 级`}</b></li>`).join('')}</ul>` : '<p class="mb-par-empty">还没有记录</p>'}`));
  // settings
  const set = h('section', 'mb-par-sec', '<h3>设置</h3>'); const mk = (label: string, key: 'liveReadout' | 'music') => { const b = h('button', 'xg-btn xg-btn--secondary mb-par-toggle', `${label}：${save.settings[key] ? '开' : '关'}`); b.type = 'button'; b.onclick = () => { save.settings[key] = !save.settings[key]; app.saveNow(); b.textContent = `${label}：${save.settings[key] ? '开' : '关'}`; }; return b; };
  set.append(mk('显示装货读数', 'liveReadout'), h('p', 'mb-par-note', `基地 ${save.baseLevel} 级 · 已完成 ${mainDone(save)} 个主线订单 · 亮了 ${litCards(save)} 块徽章 · 建筑 ${SITE_KEYS.length} 座`));
  body.append(set); root.append(body); app.screen(root, 'day');
}
