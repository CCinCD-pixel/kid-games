// 城守图谱 (spec §4.12): 13 牒 pages + 9 机关 pages + 铜盾甲兵 + 2 Boss. A page opens once the child has met it in
// a level; each page = big rig, 史/传/想 seal, two spoken lines, 怕什么 / 能对付 (only pairs the child has learned),
// and the 数字模式 line when that setting is on. Build stage 1 covers volume 1; volume-2 pages show as "？" tiles.
import { icon, bindPress } from '@kit/ui';
import { ORDER, LEVELS, UNIT_INFO, nameOf } from '../content';
import ALMANAC from '../../../../content/gear-fort/almanac.json';
import { learned } from '../lane/learn';
import { FEARS } from '../lane/tags';
import { rigIcon } from '../art/icons';
import { atlasFor, type AppCtx } from '../ctx';
import { lineText } from '../theme/mozi';

interface Page { id: string; kind: 'card' | 'enemy' | 'boss'; stamp: string; quote: string | null; source: string | null; numbers: string; name: string; fears: string[] | null; beats: string[]; voice: string[]; after?: string }
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

export function mountAlmanac(root: HTMLElement, app: AppCtx, onBack: () => void): { destroy(): void } {
  const el = h('div', 'gf-menu gf-alm xg-root'); el.dataset.xgTheme = 'night'; root.appendChild(el);
  const atlas = atlasFor(110, app.dpr);
  el.innerHTML = `<header class="gf-alm__head"><div class="gf-title">城守图谱</div>
    <button class="gf-alm__num xg-btn xg-btn--ghost" aria-pressed="${app.save.settings.numbers}">${icon('grid')}数字</button></header>
    <section class="gf-alm__grid"></section><div class="gf-alm__page"></div>`;
  const grid = el.querySelector('.gf-alm__grid') as HTMLElement; const pageEl = el.querySelector('.gf-alm__page') as HTMLElement;
  const groups: [string, Page[]][] = [['牒', PAGES.filter((p) => p.kind === 'card')], ['鲁班的机关', PAGES.filter((p) => p.kind !== 'card')]];
  function draw(): void {
    grid.replaceChildren();
    for (const [title, ps] of groups) {
      grid.appendChild(h('div', 'gf-alm__group', title));
      for (const p of ps) {
        const open = pageOpen(app, p); const t = h('button', 'gf-alm__tile' + (open ? '' : ' is-locked') + (p.kind === 'boss' ? ' is-boss' : ''));
        if (open) t.append(rigIcon(atlas, p.id === 'shielder_m' ? 'shielder' : p.id, 76, app.dpr)); else t.insertAdjacentHTML('beforeend', '<b class="gf-alm__q">？</b>');
        t.insertAdjacentHTML('beforeend', `<span>${open ? p.name : ''}</span>${open && app.save.almanac[p.id] !== 'seen' ? '<i class="gf-new">新</i>' : ''}`);
        t.addEventListener('click', () => { if (open) show(p); else app.ui('ui-locked', 0.5); });
        grid.appendChild(t);
      }
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
      ${p.voice.map((v) => `<p class="gf-alm__line"><button class="gf-say" data-v="${v}">${icon('listen')}</button>${lineText(v)}</p>`).join('')}
      <div class="gf-alm__pairs"><span>${isCard ? '能对付' : '怕'}：</span>${pairs.length ? pairs.map((k) => `<i class="gf-mini" data-c="${k}"></i>`).join('') : '<span class="gf-q">？</span>'}</div>
      ${app.save.settings.numbers ? `<p class="gf-alm__nums">${p.numbers}</p>` : ''}</div>
      <button class="gf-alm__close xg-btn xg-btn--secondary">${icon('close')}</button></div>`;
    (pageEl.querySelector('.gf-alm__art') as HTMLElement).append(rigIcon(atlas, p.id === 'shielder_m' ? 'shielder' : p.id, 220, app.dpr));
    pageEl.querySelectorAll<HTMLElement>('.gf-mini').forEach((m) => m.append(rigIcon(atlas, m.dataset.c!, 44, app.dpr)));
    pageEl.querySelectorAll<HTMLElement>('.gf-say').forEach((b) => b.addEventListener('click', (ev) => { ev.stopPropagation(); void app.voice.say(b.dataset.v!, { interrupt: true }); }));
    (pageEl.querySelector('.gf-alm__close') as HTMLElement).addEventListener('click', () => { pageEl.classList.remove('is-on'); app.voice.stop(); draw(); });
    pageEl.classList.add('is-on'); app.ui('ui-open', 0.5);
    void (async () => { for (const v of p.voice) { const r = await app.voice.say(v, { interrupt: v === p.voice[0] }); if (!pageEl.classList.contains('is-on') || (r as unknown as { interrupted?: boolean })?.interrupted) break; } })();
  }
  (el.querySelector('.gf-alm__num') as HTMLElement).addEventListener('click', (ev) => { const b = ev.currentTarget as HTMLElement; app.save.settings.numbers = !app.save.settings.numbers; b.setAttribute('aria-pressed', String(app.save.settings.numbers)); app.persist(); app.ui('ui-toggle-on', 0.4); });
  const back = h('button', 'gf-back xg-btn xg-btn--ghost', icon('back')); back.addEventListener('click', onBack); el.appendChild(back);
  draw(); bindPress(el);
  void nameOf;
  return { destroy: () => { app.voice.stop(); el.remove(); } };
}
