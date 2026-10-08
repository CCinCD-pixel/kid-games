// Menu-type screens on the 星港 paper-cut night (spec §2.1–2.3, §6.6): the journey map, 鲁班亮招 + 选牒,
// and the 复盘 (debrief). Kit components (.xg-*) + lacquered-wood-toy illustrations from the same rigs.
import { nodeMap, icon, bindPress, ghostTap, shouldAutoSkip, type MapNode } from '@kit/ui';
import { CAMPAIGN, LEVELS, PLAYABLE_VOLUMES, previewKinds, nameOf, UNIT_INFO, ENEMY_INFO } from '../content';
import { sayCard, endCard } from '../pointread';
import { recommend } from '../bots/loadout';
import { learned } from '../lane/learn';
import { FEARS } from '../lane/tags';
import { rigIcon, portrait } from '../art/icons';
import { atlasFor, type AppCtx } from '../ctx';
import { causeLines, lineText } from '../theme/mozi';
import * as sfx from '../audio/sfx';
import { mountSong, songState, volStars, FLAG_STARS } from '../render/songcity';
import type { Cause } from '../lane/failcause';
import type { Level } from '../lane/types';

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, html = ''): HTMLElementTagNameMap[K] => { const e = document.createElement(tag); e.className = cls; if (html) e.innerHTML = html; return e; };

// ───────────── map ─────────────
export interface MapOpts {
  onAlmanac(): void; onPuzzles?(): void; resume?: { level: string; flag?: number; onYes(): void; onNo(): void } | null; newPages?: number;
  /** volume to show (default: the volume of save.current, once volume 2 is open) */ vol?: number;
  onSettings?(): void;
}
const VOL_CN = ['', '一', '二', '三', '四'];
/** paper-cut hills + sky for a volume (vol 1 = 鲁国→宋城 by day, vol 2 = 宋→楚 by night; spec §4.13) */
const SKY = `<div class="gf-map__sky" aria-hidden="true"><i class="gf-sky gf-sky--day"></i><i class="gf-sky gf-sky--night"></i><i class="gf-sky__moon"></i><i class="gf-sky__sun"></i>
  <svg class="gf-sky__hills" viewBox="0 0 1000 300" preserveAspectRatio="none"><path class="h1" d="M0 170 C90 120 170 140 250 110 C330 80 420 130 500 105 C590 75 680 120 760 95 C850 70 930 110 1000 90 L1000 300 L0 300Z"/><path class="h2" d="M0 220 C120 175 220 205 330 180 C440 155 540 200 650 175 C760 150 880 195 1000 170 L1000 300 L0 300Z"/><path class="h3" d="M0 262 C150 240 300 258 460 246 C620 234 800 256 1000 240 L1000 300 L0 300Z"/></svg></div>`;
export function mountMap(root: HTMLElement, app: AppCtx, onPick: (id: string) => void, mo?: MapOpts): { destroy(): void } {
  const el = h('div', 'gf-menu gf-map xg-root'); el.dataset.xgTheme = 'night'; root.appendChild(el);
  const won = (id: string): boolean => (app.save.levels[id]?.wins ?? 0) > 0;
  const vol2Open = PLAYABLE_VOLUMES.includes(2) && won('1-11');
  let vol = mo?.vol ?? (vol2Open && +app.save.current.split('-')[0] === 2 ? 2 : 1);
  const pz = won('1-6');
  el.innerHTML = `${SKY}<header class="gf-map__head"><div class="gf-title">机关守城</div><div class="gf-sub"></div></header>
    <div class="gf-map__road"></div>
    <button class="gf-map__gear xg-iconbtn" aria-label="设置">${icon('settings')}</button>
    <aside class="gf-map__side">
      <button class="gf-song" aria-label="宋城沙盘"><span class="gf-song__cap"></span></button>
      <button class="gf-bigcard gf-bigcard--alm"><div class="gf-bigcard__art">图</div><b>城守图谱</b><small>看看见过的牒和机关</small>${mo?.newPages ? `<i class="gf-new">${mo.newPages}</i>` : ''}</button>
      <button class="gf-bigcard gf-bigcard--pz${pz ? '' : ' is-soon'}"><div class="gf-bigcard__art">锦</div><b>锦囊谜题</b><small>${pz ? '摆好再推演，越省越好' : '守住 1-6 后出现'}</small></button>
      <div class="gf-bigcard is-soon"><div class="gf-bigcard__art">家</div><b>家庭推演</b><small>以后和爸爸一起玩</small></div>
      <div class="gf-tabs" role="tablist"><button data-v="1">第一卷</button><button data-v="2" class="${vol2Open ? '' : 'is-off'}">${vol2Open ? '第二卷' : `${icon('lock')}第二卷`}</button></div>
    </aside>`;
  const road = el.querySelector('.gf-map__road') as HTMLElement;
  const sub = el.querySelector('.gf-sub') as HTMLElement;
  const draw = (): void => {
    const V = CAMPAIGN.volumes[vol - 1];
    sub.textContent = `第${VOL_CN[vol]}卷 · ${V.name}`;
    el.classList.toggle('is-v2', vol === 2); el.classList.toggle('is-v1', vol === 1);
    for (const b of el.querySelectorAll<HTMLElement>('.gf-tabs button')) b.classList.toggle('is-on', +b.dataset.v! === vol);
    const nodes: MapNode[] = V.levels.map((id, i) => {
      const rec = app.save.levels[id]; const prevWon = i === 0 ? (vol === 1 || vol2Open) : won(V.levels[i - 1]);
      const state: MapNode['state'] = rec && rec.wins > 0 ? (id === app.save.current ? 'current' : 'done') : prevWon ? (id === app.save.current ? 'current' : 'open') : 'locked';
      return { id, label: String(i + 1), state, stars: rec?.best ?? 0, boss: LEVELS[id]?.type === 'boss' };
    });
    const m = h('span', 'gf-map__me'); m.append(portrait('mozi', 46, app.dpr, 'happy'));
    const here = V.levels.includes(app.save.current);
    nodeMap(road, nodes, { onPick: (n) => { if (n.state !== 'locked' && PLAYABLE_VOLUMES.includes(+n.id.split('-')[0])) { app.ui('ui-confirm', 0.5); onPick(n.id); } else app.ui('ui-locked', 0.5); }, marker: here ? m : undefined, pad: 56 });
  };
  // first time on the volume-2 road: the sky turns from day to night (3 s, spec §4.13)
  // (the parent's 跳过开场和教学 skips the 3-s change and the first-visit guide below: both count as seen)
  const night = vol === 2 && !app.save.story.includes('map.night');
  if (night && shouldAutoSkip()) { app.save.story.push('map.night'); app.persist(); requestAnimationFrame(draw); }
  else if (night) { el.classList.add('is-v1'); requestAnimationFrame(() => requestAnimationFrame(() => { el.classList.add('is-dusk'); draw(); })); app.save.story.push('map.night'); app.persist(); }
  else requestAnimationFrame(draw);
  for (const b of el.querySelectorAll<HTMLElement>('.gf-tabs button')) b.addEventListener('click', () => {
    const v = +b.dataset.v!; if (v === vol) return;
    if (v === 2 && !vol2Open) { app.ui('ui-locked', 0.5); b.classList.remove('is-shake'); void b.offsetWidth; b.classList.add('is-shake'); return; }
    app.ui('ui-select', 0.5); vol = v; el.classList.remove('is-dusk'); draw();
  });
  el.querySelector('.gf-bigcard--alm')?.addEventListener('click', () => { app.ui('ui-open', 0.5); mo?.onAlmanac(); });
  el.querySelector('.gf-bigcard--pz')?.addEventListener('click', () => { if (!pz || !mo?.onPuzzles) { app.ui('ui-locked', 0.5); return; } app.ui('ui-open', 0.5); mo.onPuzzles(); });
  // first time on the map (after 序幕 + 码头): a 3-s ghost tap on the next station (spec §2.1)
  if (!app.save.story.includes('map.guide')) { app.save.story.push('map.guide'); app.persist(); if (!shouldAutoSkip()) setTimeout(() => { const n = el.querySelector('.xg-node--current'); if (n && el.isConnected) void ghostTap(n); }, 900); }
  // 宋城修复沙盘 (§5.7): bottom-left of the journey (the side column), tap → the big tray
  const songEl = el.querySelector('.gf-song') as HTMLElement; const song = mountSong(songEl, app.save, app.dpr, { fps: 20 });
  (songEl.querySelector('.gf-song__cap') as HTMLElement).innerHTML = songCaption(app);
  songEl.addEventListener('click', () => { app.ui('ui-open', 0.5); openSongView(app); });
  el.querySelector('.gf-map__gear')?.addEventListener('click', () => { app.ui('ui-open', 0.5); mo?.onSettings?.(); });
  let resumeT = 0;
  if (mo?.resume) { // 两种快照之一：暂停 / 离开 = 原样继续 (spec §8.8)
    const r = mo.resume; const lv = LEVELS[r.level];
    const b = h('div', 'gf-resume', `<div class="gf-resume__card"><div class="gf-resume__art"></div><div class="gf-resume__t"><b>${r.flag ? `第 ${r.level} 关：从第 ${r.flag} 面战鼓接着推？` : `接着推演第 ${r.level} 关？`}</b><small>${lv?.name ?? ''}</small></div>
      <div class="gf-resume__acts"><button class="xg-btn xg-btn--primary xg-btn--lg" data-a="yes">${icon('play')}接着推演</button><button class="xg-btn xg-btn--secondary" data-a="no">${icon('map')}看地图</button></div></div>`);
    (b.querySelector('.gf-resume__art') as HTMLElement).append(portrait('mozi', 64, app.dpr, 'happy'));
    // the prompt line waits 0.5 s — and never plays once the child has answered or left the map (QA r2)
    b.querySelector('[data-a=yes]')!.addEventListener('click', () => { clearTimeout(resumeT); app.voice.stop(); app.ui('ui-confirm', 0.5); r.onYes(); });
    b.querySelector('[data-a=no]')!.addEventListener('click', () => { clearTimeout(resumeT); app.voice.stop(); app.ui('ui-tap', 0.4); b.remove(); r.onNo(); });
    el.appendChild(b); resumeT = window.setTimeout(() => { if (b.isConnected) void app.voice.say('fort.ui.resume'); }, 500);
  }
  bindPress(el);
  return { destroy: () => { clearTimeout(resumeT); song.destroy(); el.remove(); } };
}
function songCaption(app: AppCtx): string {
  const st = songState(app.save); const flags = st.flags.filter(Boolean).length;
  const flag = '<svg class="gf-song__flag" viewBox="0 0 20 20" aria-label="墨家旗"><path d="M4.5 2v17" stroke="#c9a23a" stroke-width="2.4" stroke-linecap="round"/><path d="M6 3h11.5l-2.6 4 2.6 4H6z" fill="#231815" stroke="#f6ead2" stroke-width=".8"/><circle cx="11" cy="7" r="2.1" fill="#f6ead2"/></svg>';
  return `宋城修好了 <b>${st.done.size}</b>/22 处${flag.repeat(flags)}`;
}
/** the 宋城 tray, big (tap the map plaque) */
export function openSongView(app: AppCtx): void {
  const scrim = h('div', 'xg-scrim xg-root gf-songview'); scrim.dataset.xgTheme = 'night';
  const v = [1, 2].map((n) => `第${VOL_CN[n]}卷 ${volStars(app.save, n)}/33 星${volStars(app.save, n) >= FLAG_STARS[n - 1] ? ' · 墨家旗 ✓' : ` · 满 ${FLAG_STARS[n - 1]} 星挂墨家旗`}`).join('<br>');
  scrim.innerHTML = `<div class="xg-modal gf-songview__panel" role="dialog" aria-label="宋城沙盘"><div class="xg-ribbon">宋城</div>
    <button class="xg-iconbtn xg-iconbtn--sm xg-modal__close" aria-label="关闭">${icon('close')}</button>
    <div class="gf-songview__tray"></div><p class="gf-songview__cap">${songCaption(app)}<small>每守住一关，就修好一处。</small><small>${v}</small></p></div>`;
  document.body.appendChild(scrim); const unbind = bindPress(scrim);
  const song = mountSong(scrim.querySelector('.gf-songview__tray') as HTMLElement, app.save, app.dpr, { fps: 30 });
  const close = (): void => { app.ui('ui-tap', 0.4); song.destroy(); unbind(); scrim.remove(); };
  scrim.querySelector('.xg-modal__close')!.addEventListener('click', close);
  scrim.addEventListener('click', (e) => { if (e.target === scrim) close(); });
}

// ───────────── 鲁班亮招 + 选牒 ─────────────
// Left: 鲁班's table, his machines marching on the spot (sized to how many there are). 鲁班 says his line in his own voice
// while it types out in step; before his clips have loaded it types with a wooden click per character and the narrator
// reads it ("鲁班说：……") while it lights up character by character (spec §7.3 fallback). Right: the 卡槽 row (empty slots = wooden frames) + the 牒池 (chosen cards
// carry a ✓, nothing fades), or the fixed deck + the new card / machine with its one-line effect; the 附加题 is read too.
export function mountPreview(root: HTMLElement, app: AppCtx, lv: Level, onStart: (loadout: string[]) => void, onBack: () => void, assist = 0): { destroy(): void; layout(): void } {
  const el = h('div', 'gf-menu gf-preview xg-root' + (lv.choose ? ' is-choose' : '')); el.dataset.xgTheme = 'night'; root.appendChild(el);
  const kinds = previewKinds(lv);
  // the ant cluster is drawn ×2 inside its icon: bake that page finer so 蚁傅 stays crisp on the table
  const atlas = atlasFor(kinds.includes('ant') ? 300 : 170, app.dpr);
  const choose = !!lv.choose;
  const pool = lv.pool || lv.loadout || [];
  const rec = choose ? recommend(lv) : [];
  // 一档/二档辅助: 自选牒的关预填墨子推荐 (孩子可以再改, spec §3.20)
  let deck: string[] = choose ? (((assist ? rec : null) || app.save.decks[lv.id] || lv.prefill || rec).filter((c) => pool.includes(c)).slice(0, lv.slots)) : (lv.loadout || []).slice();
  // 急报关 (1-6): no deck — the 驿马 brings cards during the battle; show which ones will come (spec §3.19)
  const beltCards = lv.belt ? [...new Set(lv.belt.seq)] : null; if (beltCards) deck = beltCards.slice();
  // the one new thing of this level, with its almanac line (card first, else the new machine)
  const featK = lv.newCard && UNIT_INFO[lv.newCard] ? lv.newCard : lv.newEnemy ? (lv.newEnemy === 'swarm' ? 'ant' : lv.newEnemy) : null;
  const featId = featK && lineText(`fort.alm.${featK}.1`) ? `fort.alm.${featK}.1` : null;
  const bonusId = lineText(`fort.bonus.${lv.id}`) ? `fort.bonus.${lv.id}` : null;
  // 自选关 without a new thing: the card fills the band above 开始推演 with the last-picked 牒's page (QA r4: dead band)
  const almLine = (k: string): string | null => (lineText(`fort.alm.${k}.1`) ? `fort.alm.${k}.1` : null);
  let featCur: string | null = featId ? featK : choose ? [...deck, ...pool].find((k) => !!almLine(k)) ?? null : null;
  const featTag = (k: string): string => (k === featK ? (lv.newCard && UNIT_INFO[lv.newCard] ? '新牒' : '新机关') : '牒');
  const featHtml = (k: string): string => `<span class="gf-pv__featart"></span><span class="gf-pv__feattext"><b><i>${featTag(k)}</i>${nameOf(k)}</b><span>${lineText(almLine(k)!).replace(/^[^：]{1,6}：/, '')}</span></span><span class="gf-pv__ear">${icon('listen')}</span>`;
  el.innerHTML = `<section class="gf-pv__table"><div class="gf-pv__luban"></div><div class="gf-pv__say"></div><div class="gf-pv__machines"></div></section>
    <section class="gf-pv__deck"><div class="gf-pv__lv"><span class="gf-pv__no">${lv.id}</span><b>${lv.name}</b></div>
      <div class="gf-pv__label">${choose ? '卡槽' : lv.belt ? '驿马会送来这些牒' : '这一关的牒'}${choose ? '<small class="gf-pv__count"></small>' : ''}</div>
      <div class="gf-pv__slots${choose ? ' is-choose' : ''}"></div>
      ${choose ? '<div class="gf-pv__label">牒池<small>点一下，放进卡槽</small></div><div class="gf-pv__pool"></div>' : ''}
      ${featCur ? `<button class="gf-pv__feat" type="button">${featHtml(featCur)}</button>` : ''}
      <button class="gf-pv__bonus" type="button"><span class="gf-star3__seal">附</span><span class="gf-pv__bonust"><small>鲁班的附加题</small>${lv.star3Text || ''}</span><span class="gf-pv__ear">${icon('listen')}</span></button>
      <button class="xg-btn xg-btn--primary xg-btn--lg gf-pv__go">${icon('play')}开始推演</button></section>
    <div class="gf-info"></div>`;
  const port = (): boolean => app.layout.height > app.layout.width;
  /** phone landscape (shorter side < 600 px): the table and the deck panel are half as tall as on the iPad */
  const phone = (): boolean => !port() && app.layout.height < 600;
  (el.querySelector('.gf-pv__luban') as HTMLElement).append(portrait('luban', 96, app.dpr, 'laugh'));
  // 鲁班's line in his own voice, the characters typing in step with the clip; before his clips have loaded: typewriter +
  // wooden clicks, then the narrator reads 「鲁班说：……」 while the characters light up
  const pvId = lv.voice?.preview || ''; const pvText = lineText(pvId);
  const say = el.querySelector('.gf-pv__say') as HTMLElement; if (pvId && app.voice.hasClip(pvId)) say.dataset.line = pvId; else if (lineText('fort.nar.' + pvId.slice(5))) say.dataset.line = 'fort.nar.' + pvId.slice(5); say.innerHTML = [...pvText].map((ch) => `<span>${ch}</span>`).join('');
  const chars = [...say.querySelectorAll('span')]; let typer = 0, sweep = 0; let live = true;
  const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
  async function intro(): Promise<void> {
    await wait(450); if (!live) return;
    if (pvText && app.voice.hasClip(pvId)) {
      say.dataset.line = pvId; let k = 0; const per = Math.max(60, Math.min(260, (app.voice.clipMs(pvId) - 300) / chars.length));
      typer = window.setInterval(() => { if (!live || k >= chars.length) { clearInterval(typer); return; } chars[k++].classList.add('is-in'); }, per);
      const r0 = await app.voice.say(pvId); clearInterval(typer); chars.forEach((c) => c.classList.add('is-in')); if (!live || r0 === 'interrupted') return;
    } else {
      let i = 0;
      await new Promise<void>((res) => { typer = window.setInterval(() => { if (!live || i >= chars.length) { clearInterval(typer); res(); return; } chars[i].classList.add('is-in'); if (!/[，。！？、：…—]/.test(chars[i].textContent || '')) sfx.play('syll', { step: Math.floor(Math.random() * 6), rate: 0.9 + Math.random() * 0.2, vol: 0.8 }); i++; }, 85); });
      if (!live) return;
      const nar = 'fort.nar.' + pvId.slice(5);
      if (pvText && lineText(nar)) {
        let j = 0; const lead = 900, per = 230; // "鲁班说：" first, then ≈ 4.3 characters a second
        setTimeout(() => { if (!live) return; sweep = window.setInterval(() => { while (j < chars.length && /[，。！？、：；…—“”‘’（）《》,.!?:;]/.test(chars[j].textContent || '')) j++; if (!live || j >= chars.length) { clearInterval(sweep); return; } chars.forEach((c, k) => c.classList.toggle('is-hi', k === j)); j++; }, per); }, lead);
        const r0 = await app.voice.say(nar); clearInterval(sweep); chars.forEach((c) => c.classList.remove('is-hi')); if (!live || r0 === 'interrupted') return; // the child tapped something: stop the intro
      }
    }
    if (choose) { if ((await app.voice.say(assist ? 'fort.ui.recommend' : 'fort.ui.choose')) === 'interrupted' || !live) return; }
    if (featId) { if ((await app.voice.say(featId)) === 'interrupted' || !live) return; }
    if (bonusId) await app.voice.say(bonusId);
  }
  const mEl = el.querySelector('.gf-pv__machines') as HTMLElement; mEl.dataset.n = String(kinds.length);
  function drawMachines(): void {
    mEl.replaceChildren(); const n = kinds.length; const P = port();
    // portrait: one row; with 7–8 kinds (2-10) each column is exactly one figure wide with a compact name plate, so
    // neighbours never overlap (QA r5); a lone machine stands big on the table
    const dense = P && n > 6;
    const ms = P ? (n <= 1 ? 236 : n === 2 ? 184 : n <= 4 ? 136 : n <= 6 ? 96 : 86) : phone() ? (n <= 1 ? 128 : n === 2 ? 100 : n <= 4 ? 76 : n <= 6 ? 60 : 52) : (n <= 1 ? 280 : n === 2 ? 216 : n <= 4 ? 168 : 128);
    mEl.dataset.dense = dense ? '1' : '';
    kinds.forEach((k, i) => {
      const b = h('button', 'gf-pv__m'); b.dataset.word = nameOf(k); b.style.animationDelay = `${0.15 + i * 0.3}s`; b.style.width = Math.max(ms + (dense ? 6 : 16), phone() ? 64 : 0) + 'px';
      b.append(rigIcon(atlas, k, ms, app.dpr, { walk: i * 7 }));
      b.insertAdjacentHTML('beforeend', `<span>${nameOf(k)}</span>${k === lv.newEnemy || (lv.newEnemy === 'swarm' && k === 'ant') ? '<i class="gf-new">新</i>' : ''}`);
      b.addEventListener('click', () => info(k)); mEl.appendChild(b);
    });
  }
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
    // 点读: the name first (fort.w.<名>), then 怕什么 when learned / 多遇见几次 when not / the 2-10 举一反三 line
    const fear = known.length && app.voice.text(`fort.alm.${k}.fear`) ? [`fort.alm.${k}.fear`] : [];
    void sayCard(app, nameOf(k), isInfer ? ['fort.lvl.2-10.infer'] : known.length ? fear : ['fort.ui.unknown']);
    infoEl.onclick = () => { infoEl.classList.remove('is-on'); endCard(); };
  }
  const pane = el.querySelector('.gf-pv__deck') as HTMLElement;
  const slots = el.querySelector('.gf-pv__slots') as HTMLElement; const poolEl = el.querySelector('.gf-pv__pool') as HTMLElement | null;
  const count = el.querySelector('.gf-pv__count') as HTMLElement | null;
  const missing = (): string[] => rec.filter((c) => !deck.includes(c));
  let sw = 76, pw = 72;
  function sizeCards(): void { // slot row = one row; the pool fills the panel width (4–5 columns landscape, up to 7 portrait)
    const w = Math.max(240, pane.clientWidth - (phone() ? 20 : 32)); const P = port(); const ns = choose ? (lv.slots || 6) : Math.max(1, deck.length);
    // 7-slot levels (2-9…2-11) must fit one row in the landscape side panel too: tighter gap, never wider than the tray
    const ph = phone(); // phones: smaller slots (still ≥ 44 px), and the pool goes up to 8 across so it stays in one or two rows
    const gap = ph ? (ns >= 7 ? 4 : 6) : ns >= 7 ? 6 : 8; slots.style.gap = `${gap}px`;
    sw = Math.max(ph ? 44 : 40, Math.min(P ? 92 : ph ? 54 : 88, Math.floor((w - (ph ? 10 : 16) - (ns - 1) * gap) / ns))); // the slot tray has 8 px padding (5 on phones)
    // a short phone (iPhone SE sideways, Safari's 750×342; QA fb1 r1): 44-px pool cards 4 px apart, so even a 12-card pool
    // takes two rows and the whole pane — 附加题 included — fits the screen
    const short = ph && app.layout.height < 360; const pg = short ? 4 : 8; if (poolEl) poolEl.style.gap = `${pg}px`;
    const cols = Math.max(1, Math.min(pool.length || 1, P || ph ? 8 : 5)); pw = Math.max(ph ? (short ? 44 : 46) : 60, Math.min(ph ? 54 : 84, Math.floor((w - (cols - 1) * pg) / cols)));
    pane.style.setProperty('--slot', sw + 'px'); pane.style.setProperty('--pool', pw + 'px');
  }
  function render(): void {
    slots.replaceChildren();
    const n = choose ? (lv.slots || deck.length) : deck.length;
    for (let i = 0; i < n; i++) {
      const c = deck[i]; const s = h('button', 'gf-slot' + (c ? '' : ' is-empty')); s.type = 'button'; if (c) s.dataset.word = nameOf(c);
      if (c) { s.append(rigIcon(atlas, c, Math.round(sw * 0.74), app.dpr)); s.insertAdjacentHTML('beforeend', `${beltCards ? '' : `<span class="gf-card__cost">${UNIT_INFO[c].cost}</span>`}${c === lv.newCard ? '<i class="gf-new">新</i>' : ''}`); if (c === lv.newCard && !choose) s.classList.add('is-newcard'); }
      else s.setAttribute('aria-label', '空卡槽');
      if (choose && c) s.addEventListener('click', () => { deck = deck.filter((x) => x !== c); app.ui('ui-tap', 0.4); render(); });
      slots.appendChild(s);
    }
    if (count) count.textContent = `${deck.length}/${lv.slots || deck.length}`;
    if (poolEl) {
      poolEl.replaceChildren();
      for (const c of pool) {
        const inDeck = deck.includes(c);
        const b = h('button', 'gf-poolcard' + (inDeck ? ' is-in' : '')); b.type = 'button'; b.dataset.word = nameOf(c); b.append(rigIcon(atlas, c, Math.round(pw * 0.74), app.dpr));
        b.insertAdjacentHTML('beforeend', `<span class="gf-card__cost">${UNIT_INFO[c].cost}</span>${inDeck ? `<i class="gf-poolcard__ok">${icon('check')}</i>` : ''}${missing().includes(c) ? '<i class="gf-seal">墨</i>' : ''}`);
        b.addEventListener('click', () => { if (deck.includes(c)) deck = deck.filter((x) => x !== c); else if (deck.length < (lv.slots || 6)) deck.push(c); else deck[deck.length - 1] = c; app.ui('ui-pick', 0.4); if (!featId && almLine(c)) setFeat(c); render(); });
        poolEl.appendChild(b);
      }
    }
  }
  const feat = el.querySelector('.gf-pv__feat') as HTMLElement | null;
  function setFeat(k: string): void {
    if (!feat) return; featCur = k; feat.innerHTML = featHtml(k); feat.dataset.k = k;
    (feat.querySelector('.gf-pv__featart') as HTMLElement).append(rigIcon(atlas, k, port() ? 120 : 116, app.dpr)); fitFeat();
  }
  /** the card only shows when it fits whole between the deck and 开始推演 (never squeezed, never pushing the button off) */
  function fitFeat(): void { if (!feat) return; feat.hidden = false; if (pane.scrollHeight > pane.clientHeight + 1) feat.hidden = true; }
  if (feat && featCur) { setFeat(featCur); feat.addEventListener('click', () => { app.ui('ui-tap', 0.4); const id = featCur && almLine(featCur); if (id) void app.voice.say(id, { interrupt: true }); }); }
  (el.querySelector('.gf-pv__bonus') as HTMLElement).addEventListener('click', () => { app.ui('ui-tap', 0.4); if (bonusId) void app.voice.say(bonusId, { interrupt: true }); });
  sizeCards(); drawMachines(); render(); requestAnimationFrame(fitFeat);
  (el.querySelector('.gf-pv__go') as HTMLElement).addEventListener('click', () => { if (!deck.length && !beltCards) return; if (choose) { app.save.decks[lv.id] = deck.slice(); app.persist(); } app.ui('ui-confirm', 0.6); onStart(beltCards ? [] : deck.slice()); });
  const back = h('button', 'gf-back xg-btn xg-btn--ghost', icon('back')); back.addEventListener('click', onBack); el.appendChild(back);
  bindPress(el);
  if (assist) pane.insertAdjacentHTML('afterbegin', `<div class="gf-pv__help">${icon('hand')}墨子帮你一把</div>`);
  void intro();
  return {
    destroy: () => { live = false; clearInterval(typer); clearInterval(sweep); app.voice.stop(); el.remove(); },
    layout: () => { sizeCards(); drawMachines(); render(); fitFeat(); },
  };
}

// ───────────── 复盘 (debrief) ─────────────
export type DebriefAct = 'checkpoint' | 'restart' | 'map' | 'ghost' | 'assist1' | 'assist2';
/** three sentences (spec §5.3): ① cause ② tip (a different one when the same cause repeats) ③ one thing that went well */
export function mountDebrief(root: HTMLElement, app: AppCtx, lv: Level, cause: Cause, flagN: number, onAct: (a: DebriefAct) => void, streak = 0, extra: { good?: { id: string; vars: Record<string, number> }[]; repeat?: number; units?: { k: string; lane: number; col: number }[] } = {}): { destroy(): void } {
  const el = h('div', 'gf-menu gf-debrief xg-root'); el.dataset.xgTheme = 'night'; root.appendChild(el);
  const { cause: cId, tip: tId } = causeLines(cause, extra.repeat ?? 0); const good = extra.good ?? [];
  const cVars = { lane: (cause.lane ?? 0) + 1, n: cause.vars?.n ?? '' };
  el.innerHTML = `<div class="gf-db__panel"><div class="gf-db__head"><div class="gf-db__mozi"></div><div><div class="gf-title gf-title--sm">推演没守住</div><div class="gf-sub">我们复盘看看</div></div></div>
    <div class="gf-db__mini"></div>
    <p class="gf-db__line" data-line="${cId}" data-vars='${JSON.stringify(cVars)}'>${lineText(cId, cVars)}</p>
    ${tId ? `<p class="gf-db__tip" data-line="${tId}">${icon('hint')}${lineText(tId)}</p>` : ''}
    ${good.length ? `<p class="gf-db__good">${icon('star')}<span>${good.map((g) => lineText(g.id, g.vars)).join('')}</span></p>` : ''}
    <div class="gf-db__acts">${flagN ? `<button class="xg-btn xg-btn--primary xg-btn--lg" data-a="checkpoint">${icon('flag')}从第 ${flagN} 面战鼓重来</button>` : ''}
    <button class="xg-btn ${flagN ? 'xg-btn--secondary' : 'xg-btn--primary xg-btn--lg'}" data-a="restart">${icon('restart')}整关重来</button>
    <button class="xg-btn xg-btn--ghost" data-a="map">${icon('map')}回地图</button></div>
    ${streak >= 2 ? `<div class="gf-db__help"><button class="gf-helpcard" data-a="ghost">${icon('eye')}<b>看看墨子怎么守</b><small>课的那一段</small></button>
      <button class="gf-helpcard" data-a="assist1">${icon('hand')}<b>请墨子帮一把</b><small>多一些粮，慢一点</small></button>
      ${streak >= 3 ? `<button class="gf-helpcard" data-a="assist2">${icon('robot')}<b>墨子陪你推一局</b><small>他的手帮你摆</small></button>` : ''}</div>` : ''}</div>`;
  (el.querySelector('.gf-db__mozi') as HTMLElement).append(portrait('mozi', 84, app.dpr, 'think'));
  // mini sand table: 5 lanes × 8 columns; the lost lane framed in red with the machine's silhouette
  const mini = el.querySelector('.gf-db__mini') as HTMLElement;
  // plus his machines still standing (where he put them) and the breach path: a red dashed run from the right edge to the wall
  const at = atlasFor(110, app.dpr); const units = extra.units ?? [];
  for (let l = 0; l < 5; l++) {
    const r = h('div', 'gf-db__lane' + (l === cause.lane ? ' is-lost' : '') + (lv.lanes[l] ? '' : ' is-off')); mini.appendChild(r);
    if (!lv.lanes[l]) continue;
    for (const u of units.filter((x) => x.lane === l).slice(0, 8)) { const a = rigIcon(at, u.k, 38, app.dpr); a.classList.add("gf-db__unit"); a.style.left = `calc(${((u.col + 0.5) / 8) * 100}% - 19px)`; r.appendChild(a); }
    if (l === cause.lane) { r.appendChild(h('i', 'gf-db__path')); if (cause.kind) { const a = rigIcon(at, cause.kind, 40, app.dpr); a.classList.add('gf-db__who'); r.appendChild(a); } }
  }
  // the spoken chain belongs to this screen: a button tap / destroy ends it, and an interrupted line ends it too, so no
  // stale 复盘 line ever plays over the retried battle, the ghost replay or the map (QA r2 tech major)
  let live = true; let chain = 0;
  const speak = async (seq: { id: string; vars?: Record<string, string | number> }[], first = false): Promise<void> => {
    const my = ++chain;
    for (let i = 0; i < seq.length; i++) { if (!live || my !== chain) return; const r = await app.voice.say(seq[i].id, { vars: seq[i].vars, interrupt: first && i === 0 }); if (r === 'interrupted') return; }
  };
  el.querySelectorAll<HTMLElement>('[data-a]').forEach((b) => b.addEventListener('click', () => { live = false; app.ui('ui-confirm', 0.5); app.voice.stop(); onAct(b.dataset.a as DebriefAct); }));
  el.querySelector('.gf-db__good')?.addEventListener('click', () => { void speak(good, true); });
  bindPress(el);
  void speak([...(cId ? [{ id: cId, vars: cVars }] : []), ...(tId ? [{ id: tId }] : []), ...good, ...(streak >= 3 ? [{ id: 'fort.result.assist2' }] : streak >= 2 ? [{ id: 'fort.result.assist' }] : [])]);
  return { destroy: () => { live = false; chain++; el.remove(); } };
}
