// Menu-type screens on the 星港 paper-cut night (spec §2.1–2.3, §6.6): the journey map, 鲁班亮招 + 选牒,
// and the 复盘 (debrief). Kit components (.xg-*) + lacquered-wood-toy illustrations from the same rigs.
import { nodeMap, icon, bindPress, type MapNode } from '@kit/ui';
import { CAMPAIGN, LEVELS, PLAYABLE_VOLUMES, previewKinds, nameOf, UNIT_INFO, ENEMY_INFO } from '../content';
import { recommend } from '../bots/loadout';
import { learned } from '../lane/learn';
import { FEARS } from '../lane/tags';
import { rigIcon, portrait } from '../art/icons';
import { atlasFor, type AppCtx } from '../ctx';
import { causeLines, lineText } from '../theme/mozi';
import type { Cause } from '../lane/failcause';
import type { Level } from '../lane/types';

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, html = ''): HTMLElementTagNameMap[K] => { const e = document.createElement(tag); e.className = cls; if (html) e.innerHTML = html; return e; };

// ───────────── map ─────────────
export interface MapOpts { onAlmanac(): void; resume?: { level: string; onYes(): void; onNo(): void } | null; newPages?: number }
export function mountMap(root: HTMLElement, app: AppCtx, onPick: (id: string) => void, mo?: MapOpts): { destroy(): void } {
  const el = h('div', 'gf-menu gf-map xg-root'); el.dataset.xgTheme = 'night'; root.appendChild(el);
  const vol = 1; const V = CAMPAIGN.volumes[vol - 1];
  el.innerHTML = `<header class="gf-map__head"><div class="gf-title">机关守城</div><div class="gf-sub">第${vol === 1 ? '一' : '二'}卷 · ${V.name}</div></header>
    <div class="gf-map__road"></div>
    <aside class="gf-map__side">
      <button class="gf-bigcard gf-bigcard--alm"><div class="gf-bigcard__art">图</div><b>城守图谱</b><small>看看见过的牒和机关</small>${mo?.newPages ? `<i class="gf-new">${mo.newPages}</i>` : ''}</button>
      <div class="gf-bigcard is-soon"><div class="gf-bigcard__art">锦</div><b>锦囊谜题</b><small>${(app.save.levels['1-6']?.wins ?? 0) > 0 ? '下一批开放' : '守住 1-6 后出现'}</small></div>
      <div class="gf-bigcard is-soon"><div class="gf-bigcard__art">家</div><b>家庭推演</b><small>爸爸验收后开放</small></div>
      <div class="gf-tabs"><span class="is-on">第一卷</span><span class="is-off">第二卷 · 建造中</span></div>
    </aside>`;
  const road = el.querySelector('.gf-map__road') as HTMLElement;
  const draw = (): void => {
    const nodes: MapNode[] = V.levels.map((id, i) => {
      const rec = app.save.levels[id]; const prevWon = i === 0 || (app.save.levels[V.levels[i - 1]]?.wins ?? 0) > 0;
      const state: MapNode['state'] = rec && rec.wins > 0 ? (id === app.save.current ? 'current' : 'done') : prevWon ? (id === app.save.current ? 'current' : 'open') : 'locked';
      return { id, label: String(i + 1), state, stars: rec?.best ?? 0, boss: LEVELS[id]?.type === 'boss' };
    });
    const m = h('span', 'gf-map__me'); m.append(portrait('mozi', 46, app.dpr, 'happy'));
    nodeMap(road, nodes, { onPick: (n) => { if (n.state !== 'locked' && PLAYABLE_VOLUMES.includes(+n.id.split('-')[0])) { app.ui('ui-confirm', 0.5); onPick(n.id); } else app.ui('ui-locked', 0.5); }, marker: m, pad: 56 });
  };
  requestAnimationFrame(draw);
  el.querySelector('.gf-bigcard--alm')?.addEventListener('click', () => { app.ui('ui-open', 0.5); mo?.onAlmanac(); });
  if (mo?.resume) { // 两种快照之一：暂停 / 离开 = 原样继续 (spec §8.8)
    const r = mo.resume; const lv = LEVELS[r.level];
    const b = h('div', 'gf-resume', `<div class="gf-resume__card"><div class="gf-resume__art"></div><div class="gf-resume__t"><b>接着推演第 ${r.level} 关？</b><small>${lv?.name ?? ''}</small></div>
      <div class="gf-resume__acts"><button class="xg-btn xg-btn--primary xg-btn--lg" data-a="yes">${icon('play')}接着推演</button><button class="xg-btn xg-btn--secondary" data-a="no">${icon('map')}看地图</button></div></div>`);
    (b.querySelector('.gf-resume__art') as HTMLElement).append(portrait('mozi', 64, app.dpr, 'happy'));
    b.querySelector('[data-a=yes]')!.addEventListener('click', () => { app.ui('ui-confirm', 0.5); r.onYes(); });
    b.querySelector('[data-a=no]')!.addEventListener('click', () => { app.ui('ui-tap', 0.4); b.remove(); r.onNo(); });
    el.appendChild(b); setTimeout(() => void app.voice.say('fort.ui.resume'), 500);
  }
  bindPress(el);
  return { destroy: () => el.remove() };
}

// ───────────── 鲁班亮招 + 选牒 ─────────────
export function mountPreview(root: HTMLElement, app: AppCtx, lv: Level, onStart: (loadout: string[]) => void, onBack: () => void, assist = 0): { destroy(): void } {
  const el = h('div', 'gf-menu gf-preview xg-root'); el.dataset.xgTheme = 'night'; root.appendChild(el);
  const atlas = atlasFor(110, app.dpr);
  const kinds = previewKinds(lv);
  const choose = !!lv.choose;
  const pool = lv.pool || lv.loadout || [];
  const rec = choose ? recommend(lv) : [];
  // 一档/二档辅助: 自选牒的关预填墨子推荐 (孩子可以再改, spec §3.20)
  let deck: string[] = choose ? (((assist ? rec : null) || app.save.decks[lv.id] || lv.prefill || rec).filter((c) => pool.includes(c)).slice(0, lv.slots)) : (lv.loadout || []).slice();
  // 急报关 (1-6): no deck — the 驿马 brings cards during the battle; show which ones will come (spec §3.19)
  const beltCards = lv.belt ? [...new Set(lv.belt.seq)] : null; if (beltCards) deck = beltCards.slice();
  el.innerHTML = `<section class="gf-pv__table"><div class="gf-pv__luban"></div><div class="gf-pv__say"></div><div class="gf-pv__machines"></div></section>
    <section class="gf-pv__deck"><div class="gf-pv__lv"><span class="gf-pv__no">${lv.id}</span><b>${lv.name}</b></div>
      <div class="gf-pv__label">${choose ? '选牒' : lv.belt ? '驿马会送来这些牒' : '这一关的牒'}</div>
      ${choose ? '<div class="gf-pv__pool"></div>' : ''}<div class="gf-pv__slots"></div>
      <div class="gf-pv__bonus"><span class="gf-star3__seal">附</span>${lv.star3Text || ''}</div>
      <button class="xg-btn xg-btn--primary xg-btn--lg gf-pv__go">${icon('play')}开始推演</button></section>
    <div class="gf-info"></div>`;
  (el.querySelector('.gf-pv__luban') as HTMLElement).append(portrait('luban', 96, app.dpr, 'laugh'));
  const say = el.querySelector('.gf-pv__say') as HTMLElement; say.textContent = lineText(lv.voice?.preview || '');
  const mEl = el.querySelector('.gf-pv__machines') as HTMLElement;
  kinds.forEach((k, i) => {
    const b = h('button', 'gf-pv__m'); b.style.animationDelay = `${0.15 + i * 0.3}s`;
    b.append(rigIcon(atlas, k === 'ant' ? 'ant' : k, 104, app.dpr, { walk: i * 7 }));
    b.insertAdjacentHTML('beforeend', `<span>${nameOf(k)}</span>${k === lv.newEnemy || (lv.newEnemy === 'swarm' && k === 'ant') ? '<i class="gf-new">新</i>' : ''}`);
    b.addEventListener('click', () => info(k)); mEl.appendChild(b);
  });
  const infoEl = el.querySelector('.gf-info') as HTMLElement;
  function info(k: string): void {
    const fe = FEARS[k] || []; const isInfer = k === lv.infer;
    const known = fe.filter((c) => learned(app.save.counters, k, c));
    const tags = ENEMY_INFO[k] ? [ENEMY_INFO[k].mat === 'metal' ? '铜' : '木', ENEMY_INFO[k].wt === 'heavy' ? '重' : ENEMY_INFO[k].wt === 'light' ? '轻' : '中', ENEMY_INFO[k].layer === 'air' ? '空中' : '地面', ...ENEMY_INFO[k].traits.map((t) => ({ shield: '盾', wheels: '轮', momentum: '冲', swarm: '群', ladder: '梯', smoke: '烟', aura: '鼓', peck: '啄' } as Record<string, string>)[t] || '')].filter(Boolean) : [];
    infoEl.innerHTML = `<div class="gf-info__card"><div class="gf-info__art"></div><b>${nameOf(k)}</b><div class="gf-info__tags">${tags.map((t) => `<i>${t}</i>`).join('')}</div>
      <div class="gf-info__fear">怕：${!isInfer && known.length ? known.map((c) => `<span class="gf-mini" data-c="${c}"></span>`).join('') : '<span class="gf-q">？</span>'}</div></div>`;
    (infoEl.querySelector('.gf-info__art') as HTMLElement).append(rigIcon(atlas, k, 120, app.dpr));
    infoEl.querySelectorAll<HTMLElement>('.gf-mini').forEach((m) => m.append(rigIcon(atlas, m.dataset.c!, 40, app.dpr)));
    infoEl.classList.add('is-on'); app.ui('ui-open', 0.4);
    if (isInfer) void app.voice.say('fort.lvl.2-10.infer'); else if (!known.length) void app.voice.say('fort.ui.unknown');
    infoEl.onclick = () => infoEl.classList.remove('is-on');
  }
  const slots = el.querySelector('.gf-pv__slots') as HTMLElement; const poolEl = el.querySelector('.gf-pv__pool') as HTMLElement | null;
  const missing = (): string[] => rec.filter((c) => !deck.includes(c));
  function render(): void {
    slots.replaceChildren();
    const n = choose ? (lv.slots || deck.length) : deck.length;
    for (let i = 0; i < n; i++) {
      const c = deck[i]; const s = h('button', 'gf-slot' + (c ? '' : ' is-empty'));
      if (c) { s.append(rigIcon(atlas, c, 58, app.dpr)); s.insertAdjacentHTML('beforeend', `${beltCards ? '' : `<span class="gf-card__cost">${UNIT_INFO[c].cost}</span>`}${c === lv.newCard ? '<i class="gf-new">新</i>' : ''}`); }
      if (choose && c) s.addEventListener('click', () => { deck = deck.filter((x) => x !== c); app.ui('ui-tap', 0.4); render(); });
      slots.appendChild(s);
    }
    if (poolEl) {
      poolEl.replaceChildren();
      for (const c of pool) {
        const b = h('button', 'gf-poolcard' + (deck.includes(c) ? ' is-in' : '')); b.append(rigIcon(atlas, c, 52, app.dpr));
        b.insertAdjacentHTML('beforeend', `<span class="gf-card__cost">${UNIT_INFO[c].cost}</span>${missing().includes(c) ? '<i class="gf-seal">墨</i>' : ''}`);
        b.addEventListener('click', () => { if (deck.includes(c)) deck = deck.filter((x) => x !== c); else if (deck.length < (lv.slots || 6)) deck.push(c); else deck[deck.length - 1] = c; app.ui('ui-pick', 0.4); render(); });
        poolEl.appendChild(b);
      }
    }
  }
  render();
  (el.querySelector('.gf-pv__go') as HTMLElement).addEventListener('click', () => { if (!deck.length) return; if (choose) { app.save.decks[lv.id] = deck.slice(); app.persist(); } app.ui('ui-confirm', 0.6); onStart(beltCards ? [] : deck.slice()); });
  const back = h('button', 'gf-back xg-btn xg-btn--ghost', icon('back')); back.addEventListener('click', onBack); el.appendChild(back);
  bindPress(el);
  if (assist) el.querySelector('.gf-pv__deck')!.insertAdjacentHTML('afterbegin', `<div class="gf-pv__help">${icon('hand')}墨子帮你一把</div>`);
  if (choose) setTimeout(() => void app.voice.say(assist ? 'fort.ui.recommend' : 'fort.ui.choose'), 1800);
  return { destroy: () => el.remove() };
}

// ───────────── 复盘 (debrief) ─────────────
export type DebriefAct = 'checkpoint' | 'restart' | 'map' | 'ghost' | 'assist1' | 'assist2';
export function mountDebrief(root: HTMLElement, app: AppCtx, lv: Level, cause: Cause, flagN: number, onAct: (a: DebriefAct) => void, streak = 0): { destroy(): void } {
  const el = h('div', 'gf-menu gf-debrief xg-root'); el.dataset.xgTheme = 'night'; root.appendChild(el);
  const { cause: cId, tip: tId } = causeLines(cause);
  el.innerHTML = `<div class="gf-db__panel"><div class="gf-db__head"><div class="gf-db__mozi"></div><div><div class="gf-title gf-title--sm">推演没守住</div><div class="gf-sub">我们复盘看看</div></div></div>
    <div class="gf-db__mini"></div>
    <p class="gf-db__line">${lineText(cId, { lane: (cause.lane ?? 0) + 1, n: cause.vars?.n ?? '' })}</p>
    ${tId ? `<p class="gf-db__tip">${icon('hint')}${lineText(tId)}</p>` : ''}
    <div class="gf-db__acts">${flagN ? `<button class="xg-btn xg-btn--primary xg-btn--lg" data-a="checkpoint">${icon('flag')}从第 ${flagN} 面战鼓重来</button>` : ''}
    <button class="xg-btn ${flagN ? 'xg-btn--secondary' : 'xg-btn--primary xg-btn--lg'}" data-a="restart">${icon('restart')}整关重来</button>
    <button class="xg-btn xg-btn--ghost" data-a="map">${icon('map')}回地图</button></div>
    ${streak >= 2 ? `<div class="gf-db__help"><button class="gf-helpcard" data-a="ghost">${icon('eye')}<b>看看墨子怎么守</b><small>课的那一段</small></button>
      <button class="gf-helpcard" data-a="assist1">${icon('hand')}<b>请墨子帮一把</b><small>多一些粮，慢一点</small></button>
      ${streak >= 3 ? `<button class="gf-helpcard" data-a="assist2">${icon('robot')}<b>墨子陪你推一局</b><small>他的手帮你摆</small></button>` : ''}</div>` : ''}</div>`;
  (el.querySelector('.gf-db__mozi') as HTMLElement).append(portrait('mozi', 84, app.dpr, 'think'));
  // mini sand table: 5 lanes × 8 columns; the lost lane framed in red with the machine's silhouette
  const mini = el.querySelector('.gf-db__mini') as HTMLElement;
  for (let l = 0; l < 5; l++) { const r = h('div', 'gf-db__lane' + (l === cause.lane ? ' is-lost' : '') + (lv.lanes[l] ? '' : ' is-off')); mini.appendChild(r); if (l === cause.lane && cause.kind) { const a = rigIcon(atlasFor(110, app.dpr), cause.kind, 40, app.dpr); a.classList.add('gf-db__who'); r.appendChild(a); } }
  el.querySelectorAll<HTMLElement>('[data-a]').forEach((b) => b.addEventListener('click', () => { app.ui('ui-confirm', 0.5); app.voice.stop(); onAct(b.dataset.a as DebriefAct); }));
  bindPress(el);
  void (async () => { if (cId) await app.voice.say(cId, { vars: { lane: (cause.lane ?? 0) + 1, n: cause.vars?.n ?? '' } }); if (tId) await app.voice.say(tId); if (streak >= 3) await app.voice.say('fort.result.assist2'); else if (streak >= 2) await app.voice.say('fort.result.assist'); })();
  return { destroy: () => el.remove() };
}
