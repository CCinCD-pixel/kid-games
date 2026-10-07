// 城守图谱 (spec §4.12): 13 牒 pages + 9 机关 pages + 铜盾甲兵 + 2 Boss. A page opens once the child has met it in
// a level; each page = big rig, 史/传/想 seal, two spoken lines, 怕什么 / 能对付 (only pairs the child has learned),
// and the 数字模式 line when that setting is on. Build stage 1 covers volume 1; volume-2 pages show as "？" tiles.
import { icon, bindPress } from '@kit/ui';
import { ORDER, LEVELS, UNIT_INFO, nameOf } from '../content';
import JN_RAW from '../../../../content/gear-fort/jinnang.json';
import ALMANAC from '../../../../content/gear-fort/almanac.json';
import { learned } from '../lane/learn';
import { FEARS } from '../lane/tags';
import { rigIcon } from '../art/icons';
import { atlasFor, type AppCtx } from '../ctx';
import { lineText } from '../theme/mozi';

interface Page { id: string; kind: 'card' | 'machine' | 'boss'; stamp: string; quote: string | null; source: string | null; numbers: string; name: string; fears: string[] | null; beats: string[]; voice: string[]; after?: string }
const PAGES = ALMANAC as unknown as Page[];
const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, html = ''): HTMLElementTagNameMap[K] => { const e = document.createElement(tag); e.className = cls; if (html) e.innerHTML = html; return e; };

/** the level where a page becomes available */
export function pageLevel(p: Page): string {
  if (p.id === 'shielder_m') return '2-10';
  if (p.kind === 'card') return UNIT_INFO[p.id]?.unlock || '1-1';
  for (const id of ORDER) if ((LEVELS[id]?.spawns || []).some((s) => s[2] === p.id || s[2] === 'boss:' + p.id || (p.id === 'ant' && s[2] === 'swarm'))) return id;
  return '9-9';
}
export function pageOpen(app: AppCtx, p: Page): boolean {
  const lv = pageLevel(p); const r = app.save.levels[lv];
  return p.id === 'shielder_m' ? (r?.wins ?? 0) > 0 : !!r;
}

interface Jn { id: string; idiom: string; concept: string; path: string[]; voice: string }
const JINNANG = JN_RAW as unknown as Jn[];
/** a page is "新" until the almanac has once been shown with it open (then 'shown'), or until it is opened ('seen') */
export const isNewPage = (app: AppCtx, p: Page): boolean => { const v = app.save.almanac[p.id]; return pageOpen(app, p) && (v == null || v === 'unseen'); };
type Tab = 'card' | 'machine' | 'boss' | 'jn';
const TABS: [Tab, string][] = [['card', '牒'], ['machine', '机关'], ['boss', '首领'], ['jn', '锦囊']];
let lastTab: Tab = 'card';
export function mountAlmanac(root: HTMLElement, app: AppCtx, onBack: () => void): { destroy(): void } {
  const el = h('div', 'gf-menu gf-alm xg-root'); el.dataset.xgTheme = 'night'; root.appendChild(el);
  const atlas = atlasFor(110, app.dpr);
  // 分类页签 (spec §2.2): 牒 / 机关 / Boss / 锦囊 — each page of tiles fits the screen (no scrolling), ≥ 48 px tabs
  el.innerHTML = `<header class="gf-alm__head"><div class="gf-title">城守图谱</div><div class="gf-alm__tabs" role="tablist"></div>
    <button class="gf-alm__num xg-btn xg-btn--ghost" aria-pressed="${app.save.settings.numbers}">${icon('grid')}数字</button></header>
    <section class="gf-alm__grid"></section><div class="gf-alm__page"></div>`;
  const grid = el.querySelector('.gf-alm__grid') as HTMLElement; const pageEl = el.querySelector('.gf-alm__page') as HTMLElement;
  const tabsEl = el.querySelector('.gf-alm__tabs') as HTMLElement;
  const ofTab = (t: Tab): Page[] => PAGES.filter((p) => p.kind === t);
  // the badges this visit shows are fixed when the screen opens; afterwards they count as shown
  const fresh = new Set(PAGES.filter((p) => isNewPage(app, p)).map((p) => p.id));
  if (fresh.size) { for (const id of fresh) app.save.almanac[id] = 'shown'; app.persist(); }
  let tab: Tab = lastTab;
  function drawTabs(): void {
    tabsEl.replaceChildren();
    for (const [t, label] of TABS) {
      const b = h('button', 'gf-alm__tab' + (t === tab ? ' is-on' : ''), label); b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', String(t === tab)); b.dataset.tab = t;
      if (t !== 'jn' && ofTab(t).some((p) => fresh.has(p.id) && app.save.almanac[p.id] !== 'seen')) b.insertAdjacentHTML('beforeend', '<i class="gf-alm__dot"></i>');
      b.addEventListener('click', () => { if (t === tab) return; tab = lastTab = t; app.ui('ui-select', 0.4); drawTabs(); draw(); });
      tabsEl.appendChild(b);
    }
  }
  function draw(): void {
    grid.replaceChildren(); grid.dataset.tab = tab;
    if (tab !== 'jn') for (const p of ofTab(tab)) {
      const open = pageOpen(app, p); const t = h('button', 'gf-alm__tile' + (open ? '' : ' is-locked') + (p.kind === 'boss' ? ' is-boss' : ''));
      if (open) t.append(rigIcon(atlas, p.id, p.kind === 'boss' ? 150 : 76, app.dpr)); else t.insertAdjacentHTML('beforeend', '<b class="gf-alm__q">？</b>');
      // a locked page says where it opens, so the '？' reads as a level still ahead, not as missing content (QA r4)
      t.insertAdjacentHTML('beforeend', `<span>${open ? p.name : `<em class="gf-alm__when">第 ${pageLevel(p)} 关</em>`}</span>${open && fresh.has(p.id) && app.save.almanac[p.id] !== 'seen' ? '<i class="gf-new">新</i>' : ''}`);
      t.addEventListener('click', () => { if (open) show(p); else app.ui('ui-locked', 0.5); });
      grid.appendChild(t);
    }
    // 锦囊页 (§4.9, §4.12): 15 墨子锦囊 — idiom + idea; open once their first level has been played; ✓ = 会用了 (mastery signal)
    if (tab === 'jn') for (const j of JINNANG) {
      const rec = app.save.jinnang[j.id]; const open = !!rec?.seen || !!app.save.levels[j.path[0]?.split(' ')[0]];
      const t = h('button', 'gf-alm__tile gf-jn' + (open ? '' : ' is-locked') + (rec?.mastered ? ' is-mastered' : ''), open ? `<b class="gf-jn__idiom">${j.idiom}</b><span>${j.concept}</span>${rec?.mastered ? `<i class="gf-jn__ok">${icon('check')}</i>` : ''}` : '<b class="gf-alm__q">？</b><span></span>');
      t.addEventListener('click', () => { if (!open) { app.ui('ui-locked', 0.5); return; } app.ui('ui-tap', 0.4); void app.voice.say(j.voice, { interrupt: true }); t.classList.remove('is-say'); void t.offsetWidth; t.classList.add('is-say'); });
      grid.appendChild(t);
    }
  }
  function show(p: Page): void {
    app.save.almanac[p.id] = 'seen'; app.persist();
    const isCard = p.kind === 'card';
    const pairs = isCard ? Object.entries(FEARS).filter(([, cs]) => cs.includes(p.id)).map(([k]) => k).filter((k) => learned(app.save.counters, k, p.id))
      : (FEARS[p.id] || []).filter((c) => learned(app.save.counters, p.id, c));
    pageEl.innerHTML = `<div class="gf-alm__sheet"><div class="gf-alm__art"></div><div class="gf-alm__text">
      <div class="gf-alm__name"><b>${p.name}</b><span class="gf-seal gf-seal--${p.stamp === '史' ? 'shi' : p.stamp === '传' ? 'chuan' : 'xiang'}">${p.stamp}</span></div>
      ${p.quote ? `<blockquote>${p.quote}<cite>${p.source || ''}</cite></blockquote>` : ''}
      ${p.voice.map((v) => `<p class="gf-alm__line" data-line="${v}"><button class="gf-say" data-v="${v}">${icon('listen')}</button>${lineText(v)}</p>`).join('')}
      <div class="gf-alm__pairs"><span>${isCard ? '能对付' : '怕'}：</span>${pairs.length ? pairs.map((k) => `<i class="gf-mini" data-c="${k}"></i>`).join('') : '<span class="gf-q">？</span>'}</div>
      ${app.save.settings.numbers ? `<p class="gf-alm__nums">${p.numbers}</p>` : ''}</div>
      <button class="gf-alm__close xg-btn xg-btn--secondary">${icon('close')}</button></div>`;
    (pageEl.querySelector('.gf-alm__art') as HTMLElement).append(rigIcon(atlas, p.id, 220, app.dpr));
    pageEl.querySelectorAll<HTMLElement>('.gf-mini').forEach((m) => m.append(rigIcon(atlas, m.dataset.c!, 44, app.dpr)));
    pageEl.querySelectorAll<HTMLElement>('.gf-say').forEach((b) => b.addEventListener('click', (ev) => { ev.stopPropagation(); void app.voice.say(b.dataset.v!, { interrupt: true }); }));
    (pageEl.querySelector('.gf-alm__close') as HTMLElement).addEventListener('click', () => { pageEl.classList.remove('is-on'); app.voice.stop(); drawTabs(); draw(); });
    pageEl.classList.add('is-on'); app.ui('ui-open', 0.5);
    void (async () => { for (const v of p.voice) { const r = await app.voice.say(v, { interrupt: v === p.voice[0] }); if (!pageEl.classList.contains('is-on') || (r as unknown as { interrupted?: boolean })?.interrupted) break; } })();
  }
  (el.querySelector('.gf-alm__num') as HTMLElement).addEventListener('click', (ev) => { const b = ev.currentTarget as HTMLElement; app.save.settings.numbers = !app.save.settings.numbers; b.setAttribute('aria-pressed', String(app.save.settings.numbers)); app.persist(); app.ui('ui-toggle-on', 0.4); });
  const back = h('button', 'gf-back xg-btn xg-btn--ghost', icon('back')); back.addEventListener('click', onBack); el.appendChild(back);
  drawTabs(); draw(); bindPress(el);
  void nameOf;
  return { destroy: () => { app.voice.stop(); el.remove(); } };
}
