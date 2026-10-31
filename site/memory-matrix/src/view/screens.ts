// The screens around the rounds (spec §2.1): S1 星图站, S2 星区页, S6 星图册, S7 夜航收尾卡, S5 星门, S8 设置, and the first-minute intro.
import { mountMini, type MiniBot } from '../art/mini';
import { icon, mountSkipButton, shouldAutoSkip, starSvg } from '@kit/ui';
import { sleep } from '@kit/tween';
import levels from '../../../../content/memory-matrix/levels.json';
import cardsJson from '../../../../content/memory-matrix/cards.json';
import { CARDS } from '../core/cards';
import { SECTOR_IDS, type NightSummary, type SectorId } from '../core/session';
import { SECTOR_LONG, SECTOR_ZH } from '../core/metrics';
import { cardImage, MYSTERY_CARD } from '../art/cards';
import { INSTRUMENT_DEFS, auroraSvg, drawWall, instrumentSvg, skylineSvg } from '../art/station';
import { skyBackdrop } from '../art/sprites';
import { type App, btn, el } from './app';

const NEW_AT = levels.newAt as Record<string, string[]>;
const SUB: Record<SectorId, string> = { s1: '看一眼，再点出来', s2: '跟着流星的顺序', s3: '谁住在哪一间', s4: '影子在另一边' };
const WING: Record<string, [string, string]> = { s2: ['顺着追', '倒着追'], s4: ['看着照', '记着照'] };
const card = (id: string): { id: string; title: string; art: never; need: number; sector: string; unlock: { kind: string; n?: number } } => CARDS.find((c: { id: string }) => c.id === id) as never;
const fact = (id: string): string => (cardsJson.cards.find((c) => c.id === id)?.fact ?? '');
/** how a card is earned, in the words of a child (the parent-facing 'how' of cards.json keeps D5 / 夜航满数) */
const howKid = (id: string): string => {
  const c = card(id), z = SECTOR_ZH[c.sector as SectorId];
  if (!c.sector || !z) return id === 'vet' ? '你在记忆方块里得过星星' : '多玩几个夜航，就会亮起来';
  return c.unlock.kind === 'first' ? `${z}：第一次点亮` : c.unlock.kind === 'level' ? `${z}：玩到第 ${c.unlock.n} 档` : `${z}：打开一道星门`;
};

export interface Screen { destroy(): void; refresh?(): void }

/** full-screen night backdrop shared by every screen (one canvas, drawn once per size) */
export function mountSky(app: App): { resize(): void } {
  const c = el('canvas', 'mm-sky'); app.root.prepend(c);
  const paint = (): void => { const v = app.viewport(), s = skyBackdrop(v.w, v.h, Math.min(2, devicePixelRatio || 1)); c.width = s.width; c.height = s.height; c.style.width = `${v.w}px`; c.style.height = `${v.h}px`; c.getContext('2d')!.drawImage(s, 0, 0); };
  paint(); return { resize: paint };
}

/* =================================================================================== S1 星图站 */
export interface StationHooks { onStart(s: SectorId): void; onSector(s: SectorId): void; onAtlas(): void; onSettings(): void }
export function mountStation(app: App, hooks: StationHooks): Screen {
  const eng = app.engine, root = el('div', 'mm-station');
  const wall = el('canvas', 'mm-wall'), aurora = el('div', 'mm-aurora-host'), routes = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  routes.setAttribute('class', 'mm-routes');
  const head = el('header', 'mm-st-head', '<h1>星图记忆站</h1>'), vet = el('div', 'mm-vet'), gear = btn('mm-gear', '设置', () => hooks.onSettings(), 'settings');
  const ground = el('div', 'mm-ground'), nodes = el('div', 'mm-nodes'), skyline = el('div', 'mm-skyline-host'), foot = el('div', 'mm-st-foot'), botHost = el('div', 'mm-st-bot'), subHost = el('div', 'mm-st-sub');
  const warn = el('div', 'mm-warn', '<b>这台设备不能保存进度</b><span>可能是在「无痕浏览」里。请家长用普通模式打开，进度才不会丢。</span>'); warn.hidden = !app.storageFailed;
  const go = btn('xg-btn xg-btn--primary xg-btn--lg mm-go', '开始夜航', () => { app.sfx('ui-confirm'); hooks.onStart(eng.recommended()); }, 'rocket');
  const atlas = btn('xg-btn xg-btn--night mm-atlas-btn', '星图册', () => { app.sfx('ui-open'); hooks.onAtlas(); }, 'book');
  go.dataset.act = 'go'; atlas.dataset.act = 'atlas'; gear.dataset.act = 'settings';
  const goSub = el('small', 'mm-go-sub'); go.append(goSub);
  const nodeEls = new Map<SectorId, HTMLButtonElement>();
  for (const s of SECTOR_IDS) {
    const n = el('button', 'mm-node'); n.type = 'button'; n.dataset.s = s; n.dataset.act = `node-${s}`;
    n.addEventListener('click', () => { if (!eng.isOpen(s)) { app.sfx('ui-locked'); void app.voice.say('mm.st.locked', {}); n.classList.remove('is-nope'); void n.offsetWidth; n.classList.add('is-nope'); return; } app.sfx('ui-select'); hooks.onSector(s); });
    nodeEls.set(s, n); nodes.append(n);
  }
  foot.append(atlas, go); const defs = el('div', 'mm-defs', INSTRUMENT_DEFS); root.append(defs, wall, aurora, routes, head, vet, warn, gear, nodes, botHost, subHost, ground, skyline, foot);
  app.root.append(root); subHost.append(app.sub.el);
  const bot: MiniBot = mountMini(botHost, 96); bot.setMood('happy');

  const draw = (): void => {
    const v = app.viewport(), phone = Math.min(v.w, v.h) < 600, land = v.w > v.h, safe = v.safe;
    root.dataset.orient = land ? 'landscape' : 'portrait'; root.dataset.phone = phone ? '1' : '0'; bot.el.style.width = `${phone ? 72 : 104}px`;
    const pl = land && phone, D = pl ? 72 : phone ? 80 : 112, nbox = D + 44;                                   // pl = phone landscape: one zig-zag row of four, under the title, above the bottom band
    const y0 = pl ? safe.top + 44 + nbox / 2 : safe.top + (land ? 54 : phone ? 92 : 80), y1 = pl ? v.h - safe.bottom - 82 - nbox / 2 : v.h - (land ? 170 : phone ? 250 : 320) - safe.bottom, x0 = safe.left + 16, sw = v.w - safe.left - safe.right - 32;
    const F: Record<SectorId, [number, number]> = pl ? { s1: [0.12, 0.9], s2: [0.37, 0.1], s3: [0.63, 0.9], s4: [0.88, 0.1] } : land ? { s1: [0.14, 0.62], s2: [0.38, 0.12], s3: [0.62, 0.62], s4: [0.86, 0.12] } : { s1: [0.26, 0.1], s2: [0.74, 0.3], s3: [0.28, 0.58], s4: [0.74, 0.82] };
    const pos = {} as Record<SectorId, [number, number]>;
    for (const s of SECTOR_IDS) pos[s] = [x0 + F[s][0] * sw, y0 + F[s][1] * Math.max(120, y1 - y0)];
    nodes.style.setProperty('--nd', `${D}px`);
    for (const s of SECTOR_IDS) {
      const n = nodeEls.get(s)!, open = eng.isOpen(s), sec = eng.sec(s), rings = sec.tracks.reduce((a: number, t: { cleared: number }) => a + t.cleared, 0);
      n.style.left = `${pos[s][0]}px`; n.style.top = `${pos[s][1]}px`; n.dataset.open = open ? '1' : '0';
      n.innerHTML = `<span class="mm-node-ic">${instrumentSvg(s, rings, !open)}</span><b>${SECTOR_ZH[s]}</b><small>${open ? SUB[s] : '还没亮起'}</small>`;
      n.setAttribute('aria-label', `${SECTOR_ZH[s]}${open ? '' : '，未亮起'}`);
    }
    // the constellation line that links the four instruments (dashed, behind them)
    routes.setAttribute('viewBox', `0 0 ${v.w} ${v.h}`); routes.setAttribute('width', String(v.w)); routes.setAttribute('height', String(v.h));
    routes.innerHTML = SECTOR_IDS.slice(1).map((s, i) => { const a = pos[SECTOR_IDS[i]], b = pos[s], on = eng.isOpen(s); return `<path d="M${a[0]} ${a[1]}L${b[0]} ${b[1]}" stroke="${on ? '#6fd3ea' : '#2a3a7a'}" stroke-opacity="${on ? 0.65 : 0.8}" stroke-width="2.2" stroke-dasharray="${on ? '0' : '3 8'}" stroke-linecap="round"/>`; }).join('');
    const earned = new Set<string>(eng.save.cards);
    const keeps = SECTOR_IDS.map((s) => ({ x: pos[s][0] - D / 2 - 26, y: pos[s][1] - D / 2 - 14, w: D + 52, h: D + 70 }));
    keeps.push({ x: 0, y: 0, w: v.w, h: safe.top + (land && phone ? 40 : 68) }, { x: 0, y: v.h - (land ? (phone ? 96 : 190) : phone ? 230 : 300) - safe.bottom, w: v.w, h: 400 });
    drawWall(wall, v.w, v.h, earned, keeps, performance.now());
    const built = eng.buildings(), shown = app.shownBuilt < 0 ? built : Math.min(app.shownBuilt, built);
    skyline.innerHTML = skylineSvg(shown); aurora.innerHTML = auroraSvg(shown >= 4);
    if (built > shown) window.setTimeout(() => { skyline.querySelectorAll<SVGGElement>('.mm-bld').forEach((g, i) => { if (i < built) g.dataset.on = '1'; }); aurora.firstElementChild?.setAttribute('data-on', built >= 4 ? '1' : '0'); if (built >= 4) app.sfx('unlock'); void app.voice.say('mm.st.upgrade', {}); }, 900);
    app.shownBuilt = built;
    const rec = eng.recommended();
    goSub.textContent = SECTOR_ZH[rec]; go.dataset.s = rec;
    atlas.querySelector('.mm-lbl')!.innerHTML = `星图册<small> ${eng.cardCount()}/28</small>`; warn.hidden = !app.storageFailed;
    vet.hidden = !eng.save.veteran; if (eng.save.veteran) vet.innerHTML = `<span class="mm-ribbon">${starSvg('gold')}<b>记忆方块元老</b><small>${eng.save.veteran.stars} 颗旧星星</small></span>`;
    for (const s of SECTOR_IDS) nodeEls.get(s)!.classList.toggle('is-rec', s === rec);
  };
  draw();
  const onR = (): void => draw(); app.onResize.add(onR);
  window.setTimeout(() => root.classList.add('is-in'), 20);
  // station buildings fade in after a visible moment (1.8 s, spec §8) when the card count crossed 7 / 14 / 21 / 28 during the night that just ended
  return {
    destroy(): void { app.onResize.delete(onR); bot.destroy(); try { document.body.append(app.sub.el); } catch { /* gone */ } root.remove(); },
    refresh: draw,
  };
}

/* =================================================================================== S2 星区页 */
export interface SectorHooks { onStart(): void; onBack(): void; onPractice(D: number): void }
export function mountSectorPage(app: App, s: SectorId, hooks: SectorHooks): Screen {
  const eng = app.engine, root = el('div', 'mm-sectors'); root.dataset.s = s;
  const view = eng.levelView(s), wings = WING[s];
  const head = el('header', 'mm-sp-head', `<h2>${SECTOR_ZH[s]}</h2><p>${SECTOR_LONG[s]} · ${SUB[s]}</p>`);
  const back = btn('mm-sp-back xg-btn xg-btn--night', '星图站', () => { app.sfx('ui-back'); hooks.onBack(); }, 'map'); back.dataset.act = 'back';
  const hasBridge = view.some((v) => v.state === 'bridge');
  const grid = el('div', 'mm-levels'), info = el('p', 'mm-sp-info', hasBridge ? '带「飞过」的关，是你飞越的，点一下就能补玩。' : '点一个亮着的关卡，可以再练一张。');
  const start = btn('xg-btn xg-btn--primary xg-btn--lg mm-sp-go', '开始夜航', () => { app.sfx('ui-confirm'); hooks.onStart(); }, 'rocket'); start.dataset.act = 'go';
  const rows = [view.slice(0, 5), view.slice(5, 10), view.slice(10, 15)];
  rows.forEach((row, ri) => {
    const r = el('div', 'mm-lv-row'); r.dataset.row = String(ri);
    if (wings) r.append(el('span', 'mm-wing', ri < 2 ? (ri === 0 ? wings[0] : '') : wings[1]));
    for (const v of row) {
      const b = el('button', 'mm-lv'); b.type = 'button'; b.dataset.d = String(v.D); b.dataset.state = v.state; b.dataset.gate = v.gate ? '1' : '0'; b.dataset.act = `lv-${v.D}`;
      const stars = v.stars ? `<span class="mm-lv-stars">${[1, 2, 3].map((i) => `<i class="${i <= v.stars ? 'on' : ''}"></i>`).join('')}</span>` : v.state === 'bridge' ? '<span class="mm-lv-bridge">飞过</span>' : '';
      b.innerHTML = `<span class="mm-lv-n">${v.state === 'locked' ? icon('lock') : v.gate ? `<em>${icon('star')}</em>` : v.rel}</span>${stars}`;
      b.setAttribute('aria-label', `第 ${v.D} 档${v.gate ? '，星门' : ''}${v.state === 'locked' ? '，未到' : ''}`);
      b.addEventListener('click', () => {
        const txt = `第 ${v.D} 档${v.gate ? ' · 星门' : ''} · ${NEW_AT[s][v.D - 1]}`;
        if (v.state === 'lit' || v.state === 'bridge') { app.sfx('ui-select'); info.textContent = `${txt}（再练一张）`; hooks.onPractice(v.D); }
        else if (v.state === 'now') { info.textContent = `${txt}（正在这里）`; app.sfx('ui-tick'); } else { info.textContent = `${txt}（还没到）`; app.sfx('ui-locked'); }
      });
      r.append(b);
    }
    grid.append(r);
  });
  root.append(head, back, grid, info, start); app.root.append(root);
  const nowD = view.find((v) => v.state === 'now'); if (nowD) info.textContent = `现在：第 ${nowD.D} 档 · ${NEW_AT[s][nowD.D - 1]}`;
  void app.voice.say(`mm.sec.${s}`, {}); if (hasBridge) void app.voice.say('mm.st.bridge', {});
  window.setTimeout(() => root.classList.add('is-in'), 20);
  return { destroy(): void { root.remove(); } };
}

/* =================================================================================== S6 星图册 */
export function mountAtlas(app: App, onBack: () => void): Screen {
  const eng = app.engine, root = el('div', 'mm-atlas'), st = eng.cardState(), have = new Set(st.earned), half = new Set(st.waiting);
  const head = el('header', 'mm-sp-head', `<h2>星图册</h2><p>${eng.cardCount()} / 28 张${eng.save.veteran ? ' · 元老卡' : ''}</p>`);
  const back = btn('mm-sp-back xg-btn xg-btn--night', '星图站', () => { app.sfx('ui-back'); onBack(); }, 'map'); back.dataset.act = 'back';
  const grid = el('div', 'mm-cards'), pager = el('div', 'mm-pager');
  const prev = btn('xg-btn xg-btn--night', '上一页', () => go(-1), 'back'), nextB = btn('xg-btn xg-btn--night', '下一页', () => go(1), 'next'), pg = el('span', 'mm-pg');
  prev.dataset.act = 'prev'; nextB.dataset.act = 'next'; pager.append(prev, pg, nextB);
  root.append(head, back, grid, pager); app.root.append(root);
  const order = CARDS.map((c: { id: string }) => c.id).filter((id: string) => id !== 'vet' || have.has('vet'));
  let page = 0, per = 12;
  const render = (): void => {
    const v = app.viewport(), phone = Math.min(v.w, v.h) < 600, land = v.w > v.h;
    const pl = land && phone;                                                                  // phone landscape: cards on the left, pager + back in a column on the right
    const availW = v.w - v.safe.left - v.safe.right - (pl ? 76 + 16 + 160 + 14 : 32), availH = v.h - v.safe.top - v.safe.bottom - (pl ? 52 + 66 : 190 + 58);
    const fit = (c: number, r: number, cap: boolean): number => Math.floor(Math.min((availW - (c - 1) * 10) / c, (availH - (cap ? r * 28 : 0) - (r - 1) * 10) / r, 168));
    let tries: [number, number, boolean][];
    if (pl) {                                                                                   // 6x2 / 4x3 with captions, 6x2 / 5x3 / 4x3 without: the biggest cards win; captions only while the cards stay >= 52 px
      const opts = [[6, 2, true], [4, 3, true], [6, 2, false], [5, 3, false], [4, 3, false]] as const;
      const best = opts.map(([c, r, cap]) => ({ c, r, cap, size: fit(c, r, cap) })).sort((a, b) => b.size - a.size);
      const pick = best.find((o) => o.cap && o.size >= 52) ?? best[0]; tries = [[pick.c, pick.r, pick.cap]];
    } else tries = land ? [[6, 2, true]] : phone ? [[3, 4, true], [3, 3, true], [3, 2, true]] : [[4, 3, true], [4, 2, true]];
    // the real captions wrap (two or three lines on a 3-column phone page), so MEASURE: shrink the cards until the grid and the pager end ABOVE the subtitle strip; too small -> fewer rows per page (QA r1: 36 px of the pager sat under the bar on SE / iPhone 13)
    const limit = v.h - v.safe.bottom - 68, over = (): number => Math.max(grid.getBoundingClientRect().bottom, pager.hidden || pl ? 0 : pager.getBoundingClientRect().bottom) - limit;
    for (let k = 0; k < tries.length; k++) {
      const [cols, rows, caps] = tries[k]; per = cols * rows; grid.classList.toggle('mm-cards--nocap', !caps);
      let size = fit(cols, rows, caps);
      grid.style.setProperty('--cols', String(cols)); grid.style.setProperty('--cw', `${size}px`);
      const pages = Math.ceil(order.length / per); page = Math.min(page, pages - 1);
      grid.innerHTML = '';
      for (const id of order.slice(page * per, (page + 1) * per)) {
        const c = card(id), earned = have.has(id), waiting = half.has(id);
        const b = el('button', 'mm-card'); b.type = 'button'; b.dataset.id = id; b.dataset.state = earned ? 'on' : waiting ? 'half' : 'off'; b.dataset.act = `card-${id}`;
        b.innerHTML = `<img alt="" draggable="false" src="${earned || waiting ? cardImage(c as never) : MYSTERY_CARD}"><b>${earned || waiting ? c.title : '？？？'}</b>${waiting ? `<small>还差 ${Math.max(1, c.need - st.nights)} 个夜航</small>` : ''}`;
        b.addEventListener('click', () => { app.sfx('ui-select'); detail(id); });
        grid.append(b);
      }
      pg.textContent = `${page + 1} / ${pages}`; prev.disabled = page === 0; nextB.disabled = page >= pages - 1; pager.hidden = pages <= 1;
      for (let i = 0; i < 18 && size > 50 && over() > 0.5; i++) { size -= Math.max(2, Math.ceil(over() / (rows + 0.6))); grid.style.setProperty('--cw', `${size}px`); }
      if (over() <= 0.5 || k === tries.length - 1) break;
    }
  };
  const go = (d: number): void => { page += d; app.sfx('ui-slide', { volume: 0.5 }); render(); };
  const detail = (id: string): void => {
    const c = card(id), earned = have.has(id), wrap = el('div', 'mm-modal'), panel = el('div', 'mm-panel mm-card-detail');
    panel.innerHTML = `<img alt="" src="${earned || half.has(id) ? cardImage(c as never) : MYSTERY_CARD}"><h3>${earned || half.has(id) ? c.title : '还没点亮'}</h3><p class="mm-fact">${earned ? fact(id) : half.has(id) ? `快好了：${fact(id) ? '再玩 ' + Math.max(1, c.need - st.nights) + ' 个夜航就能收下它。' : ''}` : '继续玩，它会在合适的时候亮起来。'}</p><p class="mm-how">${howKid(id)}${!earned && c.need ? `（还差 ${Math.max(1, c.need - st.nights)} 个夜航）` : ''}</p>`;
    const act = el('div', 'mm-modal-act');
    if (earned) { const l = btn('xg-btn xg-btn--night', '听一听', () => { void app.narrator.say(`mm.card.${id}`, { interrupt: true, force: true }); }, 'listen'); act.append(l); }
    const ok = btn('xg-btn xg-btn--primary', '好', () => { wrap.remove(); app.sfx('ui-close'); }, 'check'); ok.dataset.act = 'close'; act.append(ok);
    panel.append(act); wrap.append(panel); wrap.addEventListener('click', (e) => { if (e.target === wrap) wrap.remove(); }); app.root.append(wrap); app.sfx('ui-open');
  };
  render(); const onR = (): void => render(); app.onResize.add(onR);
  window.setTimeout(() => root.classList.add('is-in'), 20);
  return { destroy(): void { app.onResize.delete(onR); root.remove(); } };
}

/* =================================================================================== S7 夜航收尾卡 */
export function showNightCard(app: App, n: NightSummary): Promise<'again' | 'station'> {
  return new Promise((resolve) => {
    const eng = app.engine, wrap = el('div', 'mm-modal mm-night'), panel = el('div', 'mm-panel');
    const dots = n.rounds.slice(0, 6).map((r) => `<i class="mm-dot is-${r.res === 'pass' ? 'p' : r.res === 'miss' ? 'm' : 'n'}">${r.res === 'miss' ? '' : starSvg('gold')}</i>`).join('');
    const cards = n.cards.map((id) => `<figure><img alt="" src="${cardImage(card(id) as never)}"><figcaption>${card(id).title}</figcaption></figure>`).join('');
    panel.innerHTML = `<h2>${n.valid ? '夜航完成' : '今晚到这里'}</h2><p class="mm-sub">${SECTOR_ZH[n.sector]} · 六张星图</p><div class="mm-dots mm-dots--big">${dots}</div>${cards ? `<div class="mm-newcards"><h3>新卡片</h3>${cards}</div>` : ''}<p class="mm-wall-note">星墙 ${eng.cardCount()} / 28${n.wallAfter > n.wallBefore ? ` · 亮了 ${n.wallAfter - n.wallBefore} 颗` : ''}</p>${n.upgraded ? `<p class="mm-up">星图站升级啦！</p>` : ''}`;
    const act = el('div', 'mm-modal-act');
    const again = btn('xg-btn xg-btn--primary xg-btn--lg', '再来一晚', () => { wrap.remove(); app.sfx('ui-confirm'); resolve('again'); }, 'rocket'); again.dataset.act = 'again';
    const home = btn('xg-btn xg-btn--night', '回星图站', () => { wrap.remove(); app.sfx('ui-back'); resolve('station'); }, 'map'); home.dataset.act = 'station';
    act.append(again, home); panel.append(act); wrap.append(panel); app.root.append(wrap);
    app.sfx('level-complete'); if (n.cards.length) window.setTimeout(() => app.sfx('jingle-magic'), 900);
    void app.voice.say('mm.st.flightend', {}); if (n.cards.length) window.setTimeout(() => void app.voice.say('mm.st.wall', {}), 1800); if (n.upgraded) window.setTimeout(() => void app.voice.say('mm.st.upgrade', {}), 2800);
  });
}

/* =================================================================================== S5 星门 */
const GATE_ART = `<svg viewBox="0 0 160 160" class="mm-gate-art" aria-hidden="true"><defs><radialGradient id="gt" cx=".5" cy=".6" r=".6"><stop offset="0" stop-color="#6fd3ea" stop-opacity=".95"/><stop offset="1" stop-color="#2fb4d6" stop-opacity="0"/></radialGradient></defs><circle cx="80" cy="84" r="62" fill="url(#gt)" opacity=".7"/><path d="M30 148V76A50 50 0 0 1 130 76V148" fill="none" stroke="#8fa6e8" stroke-width="14" stroke-linecap="round"/><path d="M30 148V76A50 50 0 0 1 130 76V148" fill="none" stroke="#e4e9ff" stroke-width="4" stroke-linecap="round"/><path d="M80 18l5 10 11 1-8 8 2 11-10-5-10 5 2-11-8-8 11-1z" fill="#ffd863"/></svg>`;
export function showGateIntro(app: App, G: number, first: boolean): Promise<void> {
  return new Promise((resolve) => {
    const wrap = el('div', 'mm-modal mm-gate'), panel = el('div', 'mm-panel');
    panel.innerHTML = `${GATE_ART}<h2>星门</h2><p>五关里过四关，星门就打开。</p><p class="mm-sub">这里不能用提示哦。</p>`;
    const go = btn('xg-btn xg-btn--primary xg-btn--lg', '进入星门', () => { wrap.remove(); app.narrator.stop(); app.sfx('whoosh-up'); resolve(); }, 'play'); go.dataset.act = 'enter'; panel.append(go); wrap.append(panel); app.root.append(wrap);
    app.sfx('unlock'); void app.voice.say('mm.g.intro', {}); void app.voice.say('mm.g.rule', {}); void app.voice.say('mm.g.nohint', {}); void G; void first;
  });
}
export function showGateVerdict(app: App, passed: boolean, G: number, sector: SectorId): Promise<void> {
  return new Promise((resolve) => {
    const wrap = el('div', `mm-modal mm-gate ${passed ? 'is-open' : 'is-retry'}`), panel = el('div', 'mm-panel');
    panel.innerHTML = `${GATE_ART}<h2>${passed ? '星门打开啦！' : '星门还在'}</h2><p>${passed ? `${SECTOR_ZH[sector]}的仪器多亮了一圈。` : '练一练，再来。'}</p>`;
    const ok = btn('xg-btn xg-btn--primary xg-btn--lg', passed ? '太好了' : '好', () => { wrap.remove(); app.narrator.stop(); resolve(); }, 'check'); ok.dataset.act = 'ok'; panel.append(ok); wrap.append(panel); app.root.append(wrap);
    app.sfx(passed ? 'chapter-complete' : 'ui-pop'); void app.voice.say(passed ? 'mm.g.open' : 'mm.g.retry', {}, { force: true }); void G;
  });
}

/* =================================================================================== S8 设置 */
export function showSettings(app: App, o: { onReplay(s: SectorId): void; onClose(): void }): void {
  const eng = app.engine, wrap = el('div', 'mm-modal mm-settings'), panel = el('div', 'mm-panel');
  panel.innerHTML = '<h2>设置</h2>';
  const row = el('label', 'mm-set-row', `<span>色觉辅助<small>外星人身上的花纹加粗</small></span>`);
  const cb = el('input'); cb.type = 'checkbox'; cb.checked = !!eng.save.settings.colorAssist; cb.dataset.act = 'assist';
  cb.addEventListener('change', () => { eng.save.settings.colorAssist = cb.checked; app.persist(); app.sfx(cb.checked ? 'ui-toggle-on' : 'ui-toggle-off'); });
  row.append(cb); panel.append(row);
  const rep = el('div', 'mm-set-replay', '<span>重看教学</span>');
  for (const s of SECTOR_IDS) { const b = btn('xg-btn xg-btn--night xg-btn--sm', SECTOR_ZH[s], () => { wrap.remove(); o.onReplay(s); }); b.dataset.act = `replay-${s}`; if (!eng.isOpen(s)) b.disabled = true; rep.append(b); }
  panel.append(rep);
  const close = btn('xg-btn xg-btn--primary', '好', () => { wrap.remove(); app.sfx('ui-close'); o.onClose(); }, 'check'); close.dataset.act = 'close';
  panel.append(close); wrap.append(panel); app.root.append(wrap); app.sfx('ui-open');
}

/* =================================================================================== 首次进站的开场 */
export async function playIntro(app: App, host: HTMLElement): Promise<void> {
  if (shouldAutoSkip()) return;
  let skipped = false; const shower = el('div', 'mm-shower', Array.from({ length: 7 }, (_, i) => `<i style="--i:${i}"></i>`).join('')); host.append(shower);
  const dispose = mountSkipButton(app.root, () => { skipped = true; app.narrator.stop(); });
  try {
    for (const id of ['mm.st.1', 'mm.st.2', 'mm.st.3']) { if (skipped) break; await Promise.race([app.voice.say(id, {}, { force: true }), sleep(app.fast ? 30 : 9000)]); if (!skipped) await sleep(app.fast ? 10 : 300); }
  } finally { dispose(); shower.remove(); }
}
