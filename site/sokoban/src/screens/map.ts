/**
 * S2 星港货运图 (spec §2.2, §5.5): chapter tabs (第 0–4 章 + 经典仓库), a chapter card (emblem, name,
 * goal, progress pips, route destination) and the level road (kit `nodeMap`) with crate-shaped
 * nodes, rocket-shaped bosses, magnifier 侦探题 nodes, stars under passed levels, ribbons on the
 * levels a passed 跳级考试 covers and 小推 floating over the current node. Chapter 1 starts with the
 * 跳级考试 node (after 0-4, until passed); chapter 4's road ends in the sealed 新货单在路上 crate (v1's
 * end: a line and a wobble, nothing opens). The top bar has the launch count, 随机新仓库 (once a
 * tier is open) and 机库. Music: 星港夜班.
 */
import type { LayoutInfo } from '@kit/shell';
import { icon, nodeMap, starRating, type MapNode } from '@kit/ui';
import { playMusic } from '../audio/music';
import { playSfx } from '../audio/sfx';
import { chapterEmblem } from '../art/emblems';
import { gameIcon } from '../art/icons';
import { cosmeticsOf } from '../art/robotArt';
import type { AppCtx, Screen } from '../app/context';
import { levelBroken } from '../app/broken';
import { certOpen, chapterInfo, currentLevel, isLevelOpen, levelPassed, openLevels, randomOpen } from '../app/unlock';
import { CHAPTERS, CLASSIC_LEVELS, TRACKS, chapterLevels, isQuiz, levelById, type LevelDef } from '../data';
import { mountSky } from '../render/backdrop';
import { mapLayout, type Rect } from '../render/layout';
import { drawRobot, restPose } from '../render/robot';
import { CompanionStrip } from './companion';
import { showOrderBoard } from './random';

type Tab = number | 'classic';

const DEST_NAME: Record<string, string> = { tiangong: '天宫空间站', moon: '月宫基地', mars: '火星基地' };

function destIcon(dest: string): string {
  if (dest === 'moon') return '<svg viewBox="0 0 32 32" class="sok-dest"><circle cx="16" cy="16" r="11" fill="#E2E7FB"/><circle cx="12" cy="13" r="2.6" fill="#B7C1EC"/><circle cx="19" cy="19" r="3.4" fill="#B7C1EC"/><circle cx="20" cy="11" r="1.6" fill="#B7C1EC"/></svg>';
  if (dest === 'mars') return '<svg viewBox="0 0 32 32" class="sok-dest"><circle cx="16" cy="16" r="11" fill="#EB6A3C"/><path d="M7 14q5-3 9 0t9-1" stroke="#C25A3A" stroke-width="2.4" fill="none"/><path d="M8 20q5 2 9-1t8 1" stroke="#C25A3A" stroke-width="2" fill="none"/></svg>';
  return '<svg viewBox="0 0 32 32" class="sok-dest"><rect x="3" y="13" width="8" height="6" rx="1" fill="#8594D6"/><rect x="21" y="13" width="8" height="6" rx="1" fill="#8594D6"/><rect x="11" y="11" width="10" height="10" rx="4" fill="#E2E7FB"/><rect x="14.5" y="6" width="3" height="6" rx="1.4" fill="#E2E7FB"/><circle cx="16" cy="16" r="1.6" fill="#F6B934"/></svg>';
}

function robotMarker(save: Parameters<typeof cosmeticsOf>[0]): HTMLCanvasElement {
  const c = document.createElement('canvas');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = 56 * dpr;
  c.height = 64 * dpr;
  c.style.width = '56px';
  c.style.height = '64px';
  const g = c.getContext('2d')!;
  g.scale(dpr, dpr);
  drawRobot(g, 28, 62, 46, { ...restPose(1), eyes: 'happy', cosmetics: cosmeticsOf(save) });
  return c;
}

/** 侦探题 node: a paper magnifier with the quiz number. */
function quizArt(l: LevelDef, locked: boolean, stars: number): string {
  const n = l.id.split('-')[1];
  return `<svg class="sok-node__art" viewBox="0 0 80 80" aria-hidden="true"><circle cx="34" cy="34" r="26" fill="${locked ? '#E8D5B1' : '#FFF6E3'}" stroke="${locked ? '#B0956A' : '#26346E'}" stroke-width="7"/><circle cx="34" cy="34" r="17" fill="${locked ? '#E8D5B1' : '#B9E9FF'}" opacity=".7"/><path d="M53 53L71 71" stroke="${locked ? '#B0956A' : '#26346E'}" stroke-width="11" stroke-linecap="round"/><path d="M53 53L71 71" stroke="${locked ? '#D2B88B' : '#F9A726'}" stroke-width="5" stroke-linecap="round"/></svg><span class="sok-node__num sok-node__num--quiz">${locked ? icon('lock') : n}</span>${!locked && stars > 0 ? `<span class="sok-node__stars">${starRating(stars)}</span>` : ''}`;
}

/** 维修中 node (spec §3.10: broken level data): a crate under a wrench, never opens. */
function repairArt(): string {
  return `<svg class="sok-node__art sok-node__art--repair" viewBox="0 0 64 64" aria-hidden="true"><rect x="4" y="12" width="56" height="48" rx="10" fill="#D2B88B"/><rect x="4" y="4" width="56" height="46" rx="10" fill="#E8D5B1"/><path d="M4 30L30 4h12L4 42Z M60 22L22 60h12L60 34Z" fill="#F6B934" opacity=".85"/><rect x="4" y="4" width="56" height="56" rx="10" fill="none" stroke="#B0956A" stroke-width="3.4"/><g transform="rotate(-40 32 32)"><rect x="28" y="20" width="8" height="30" rx="3" fill="#5C6B8A"/><path d="M22 12a10 10 0 1 0 20 0l-5 0 0 6h-10v-6Z" fill="#7C8BAA" stroke="#3B4766" stroke-width="2"/></g></svg><span class="sok-node__tag sok-node__tag--repair">维修中</span>`;
}

/** 跳级考试 node: a ribbon rosette. */
function certArt(): string {
  return `<svg class="sok-node__art" viewBox="0 0 84 84" aria-hidden="true"><path d="M28 52L18 80L32 72L40 84L46 56Z M56 52L66 80L52 72L44 84L38 56Z" fill="#E4513D"/><circle cx="42" cy="36" r="30" fill="#F6B934"/><circle cx="42" cy="36" r="30" fill="none" stroke="#B07A10" stroke-width="3" stroke-dasharray="5 4"/><circle cx="42" cy="36" r="21" fill="#FFF6E3"/><path d="M42 22L46 31L56 31L48 37L51 47L42 41L33 47L36 37L28 31L38 31Z" fill="#F9A726"/></svg><span class="sok-node__tag">跳级考试</span>`;
}

/** v1's end: the sealed crate 新货单在路上. */
function comingArt(): string {
  return `<svg class="sok-node__art sok-node__art--coming" viewBox="0 0 96 90" aria-hidden="true"><rect x="8" y="24" width="80" height="60" rx="11" fill="#74491E"/><rect x="8" y="12" width="80" height="58" rx="11" fill="#A27038"/><rect x="42" y="12" width="12" height="58" fill="#F9A726"/><path d="M8 40h80" stroke="#F9A726" stroke-width="10"/><rect x="8" y="12" width="80" height="72" rx="11" fill="none" stroke="#4A2D12" stroke-width="3.6"/><circle cx="48" cy="40" r="9" fill="#FFF6E3" stroke="#4A2D12" stroke-width="2.4"/><path d="M44 40l3 3 5-6" stroke="#1AA892" stroke-width="2.6" fill="none" stroke-linecap="round"/></svg><span class="sok-node__tag">新货单在路上</span>`;
}

function nodeArt(l: LevelDef, state: MapNode['state'], stars: number, legacy: boolean, certified = false): string {
  if (isQuiz(l)) return quizArt(l, state === 'locked', stars);
  const n = l.track === 'classic' ? l.id.slice(1) : l.id.split('-')[1];
  if (l.role === 'boss') {
    const lk = state === 'locked';
    return `<svg class="sok-node__art" viewBox="0 0 88 88" aria-hidden="true"><path d="M44 5c13 10 19 25 19 41v13l9 9v10l-11-5H27l-11 5V68l9-9V46c0-16 6-31 19-41Z" fill="${lk ? '#E8D5B1' : '#FFF6E3'}" stroke="${lk ? '#B0956A' : '#DF9A1C'}" stroke-width="4" stroke-linejoin="round"/><path d="M33 22q11-12 22 0" fill="${lk ? '#D2B88B' : '#E4513D'}"/><circle cx="44" cy="35" r="8" fill="${lk ? '#D2B88B' : '#3F7BE6'}" stroke="#FFF6E3" stroke-width="3"/><path d="M33 80h22l-5 7h-12Z" fill="${lk ? '#D2B88B' : '#F9A726'}"/></svg><span class="sok-node__num sok-node__num--boss">${lk ? icon('lock') : n}</span>${!lk && stars > 0 ? `<span class="sok-node__stars">${starRating(stars)}</span>` : ''}`;
  }
  const locked = state === 'locked';
  const face = locked ? '#E8D5B1' : l.track === 'classic' ? '#B27A44' : '#A27038';
  const front = locked ? '#D2B88B' : l.track === 'classic' ? '#7C4E22' : '#74491E';
  const tape = locked ? '#E2CBA0' : '#F9A726';
  const edge = locked ? '#B0956A' : '#4A2D12';
  return `<svg class="sok-node__art" viewBox="0 0 64 64" aria-hidden="true"><rect x="4" y="12" width="56" height="48" rx="10" fill="${front}"/><rect x="4" y="4" width="56" height="46" rx="10" fill="${face}"/><path d="M8 9l10 0-10 10Z M56 9l-10 0 10 10Z" fill="${edge}" opacity=".25"/><rect x="28" y="4" width="8" height="46" fill="${tape}"/><rect x="28" y="50" width="8" height="9" fill="${locked ? '#D2B88B' : '#C37900'}"/><rect x="4" y="4" width="56" height="56" rx="10" fill="none" stroke="${edge}" stroke-width="3.4"/>${locked ? '' : `<circle cx="32" cy="27" r="15" fill="#FFF6E3" stroke="${edge}" stroke-width="2.6"/>`}</svg>
  <span class="sok-node__num">${locked ? icon('lock') : n}</span>${legacy ? '<span class="sok-node__legacy">旧记录</span>' : ''}${!locked && stars > 0 ? `<span class="sok-node__stars">${starRating(stars)}</span>` : certified && !locked ? '<span class="sok-node__ribbon" aria-label="跳级考试通过"></span>' : ''}`;
}

export class MapScreen implements Screen {
  readonly el: HTMLDivElement;
  private tab: Tab;
  private readonly hud: HTMLDivElement;
  private readonly card: HTMLButtonElement;
  private readonly road: HTMLDivElement;
  private readonly tabs: HTMLDivElement;
  private readonly strip: CompanionStrip;
  private destroyed = false;
  private readonly loggedBroken = new Set<string>();

  private focus: 'coming' | 'cert' | undefined;

  constructor(private readonly ctx: AppCtx, o: { tab?: Tab; opened?: number; focus?: 'coming' | 'cert'; say?: string } = {}) {
    const save = ctx.save.data;
    this.tab = o.tab ?? defaultTab(save);
    this.focus = o.focus;
    playMusic();
    this.el = document.createElement('div');
    this.el.className = 'sok-map';
    ctx.app.append(this.el);
    mountSky(document.body, 'earth', 'map');
    this.hud = document.createElement('div');
    this.hud.className = 'sok-hud sok-hud--map';
    this.hud.innerHTML = `<div class="sok-plate sok-plate--title"><span class="sok-plate__title">星港货运图</span></div><div class="xg-chip sok-launches" aria-label="发射了几枚火箭">${icon('rocket')}<b>${save.launched.total}</b></div>`;
    if (randomOpen(save)) {
      const rb = document.createElement('button');
      rb.type = 'button';
      rb.className = 'xg-iconbtn sok-hud__btn sok-hud__btn--random';
      rb.setAttribute('aria-label', '随机新仓库');
      rb.dataset.testid = 'random';
      rb.innerHTML = gameIcon('crate-plus');
      rb.addEventListener('click', () => void showOrderBoard(ctx));
      this.hud.append(rb);
    }
    const hb = document.createElement('button');
    hb.type = 'button';
    hb.className = 'xg-iconbtn sok-hud__btn sok-hud__btn--hangar';
    hb.setAttribute('aria-label', '机库');
    hb.dataset.testid = 'hangar-btn';
    hb.innerHTML = gameIcon('hangar');
    hb.addEventListener('click', () => ctx.go({ name: 'hangar', back: { name: 'map', tab: this.tab } }));
    this.hud.append(hb);
    this.hud.classList.toggle('has-random', randomOpen(save));
    this.card = document.createElement('button');
    this.card.type = 'button';
    this.card.className = 'sok-chcard';
    this.card.dataset.sfx = 'ui-tap';
    this.road = document.createElement('div');
    this.road.className = 'sok-road';
    this.tabs = document.createElement('div');
    this.tabs.className = 'sok-tabs';
    this.tabs.setAttribute('role', 'tablist');
    this.el.append(this.hud, this.card, this.road, this.tabs);
    this.strip = new CompanionStrip(this.el, ctx.voice);
    this.strip.el.classList.add('sok-comp--map');
    this.card.addEventListener('click', () => {
      const c = typeof this.tab === 'number' ? CHAPTERS.find((x) => x.ch === this.tab) : null;
      void this.strip.say(c?.introLine ?? 'sok.classic.intro', { mood: 'encouraging' });
    });
    this.layout(ctx.layout());
    app(ctx).dataset.screen = 'map';
    let greeted = 0;
    try {
      greeted = Number(sessionStorage.getItem('kg:sok:greet') ?? 0);
    } catch {
      /* private mode */
    }
    if (o.say) {
      void this.strip.say(o.say, { mood: 'encouraging' });
    } else if (o.focus === 'coming') {
      void this.strip.say('sok.finale.next', { mood: 'happy' });
    } else if (o.opened !== undefined) {
      this.glowTab(o.opened);
      void this.strip.say('sok.unlock.chapter', { mood: 'celebrating' });
      playSfx('unlock');
    } else if (randomOpen(save) && !save.onceLines.includes('sok.unlock.random')) {
      ctx.save.update((s) => s.onceLines.push('sok.unlock.random'));
      this.hud.querySelector('.sok-hud__btn--random')?.classList.add('is-glow');
      void this.strip.say('sok.unlock.random', { mood: 'celebrating' });
      playSfx('unlock');
    } else if (!save.onceLines.includes('sok.unlock.classic')) {
      ctx.save.update((s) => s.onceLines.push('sok.unlock.classic'));
      this.glowTab('classic');
      void this.strip.say('sok.unlock.classic', { mood: 'happy' });
    } else if (Date.now() - greeted > 30 * 60_000) {
      void this.strip.say('sok.open.2', { mood: 'happy' });
    }
    try {
      sessionStorage.setItem('kg:sok:greet', String(Date.now()));
    } catch {
      /* private mode */
    }
  }

  layout(l: LayoutInfo): void {
    const g = mapLayout(l.width, l.height, l.safe.top);
    const place = (el: HTMLElement, r: Rect) => Object.assign(el.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
    this.el.dataset.orient = g.orientation;
    place(this.hud, g.hud);
    place(this.card, g.card);
    // portrait: a narrower road box (taller than wide → the kit draws a vertical zig-zag) and the
    // companion strip in the band above the tabs; landscape: a wave and the companion at the right
    const road = g.orientation === 'portrait'
      ? { x: g.road.x + Math.max(0, (g.road.w - 600) / 2), y: g.road.y + 40, w: Math.min(600, g.road.w), h: g.road.h - 120 }
      : { x: g.road.x, y: g.road.y + 24, w: g.road.w - 236, h: g.road.h - 24 };
    place(this.road, road);
    place(this.tabs, g.tabs);
    this.strip.layout(g.orientation === 'portrait'
      ? { x: 16, y: g.road.y + g.road.h - 76, w: g.road.w, h: 72 }
      : { x: g.road.x + g.road.w - 224, y: g.road.y + 8, w: 224, h: 300 }, g.orientation);
    mountSky(document.body, 'earth', 'map');
    this.render();
  }

  private render(): void {
    const save = this.ctx.save.data;
    // tabs
    this.tabs.textContent = '';
    const tabIds: Tab[] = [...CHAPTERS.map((c) => c.ch), 'classic'];
    for (const t of tabIds) {
      const open = t === 'classic' ? true : chapterInfo(save, t).open;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `sok-tab${t === this.tab ? ' is-on' : ''}${open ? '' : ' is-locked'}`;
      b.dataset.tab = String(t);
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(t === this.tab));
      b.setAttribute('aria-label', t === 'classic' ? '经典仓库' : `第 ${t} 章`);
      b.innerHTML = t === 'classic'
        ? `${gameIcon('crate', 'sok-tab__icon sok-tab__icon--retro')}<span class="sok-tab__num">旧</span>`
        : `${gameIcon('crate', 'sok-tab__icon')}<span class="sok-tab__num">${t}</span>${open ? '' : `<span class="sok-tab__lock">${icon('lock')}</span>`}`;
      b.addEventListener('click', () => {
        if (!open) {
          playSfx('ui-locked');
          b.classList.remove('is-shake');
          void b.offsetWidth;
          b.classList.add('is-shake');
          return;
        }
        playSfx('ui-tick');
        this.tab = t;
        this.render();
      });
      this.tabs.append(b);
    }
    // chapter card
    const isClassic = this.tab === 'classic';
    const chapter = isClassic ? null : CHAPTERS.find((c) => c.ch === this.tab)!;
    const levels = isClassic ? CLASSIC_LEVELS : chapterLevels(this.tab as number);
    const passed = levels.filter((l) => levelPassed(save, l.id) || (save.cert.passed && l.ch === 1)).length;
    const stars = levels.reduce((a, l) => a + (save.levels[l.id]?.stars ?? save.quiz[l.id]?.stars ?? 0), 0);
    const name = isClassic ? TRACKS.classic.name : chapter!.name;
    const goal = isClassic ? (TRACKS.classic.goal ?? '') : chapter!.goal;
    const dest = isClassic ? 'tiangong' : chapter!.dest;
    this.card.innerHTML = `<span class="sok-chcard__emblem">${chapterEmblem(isClassic ? 'classic' : `ch${this.tab}`, 84)}</span>
      <span class="sok-chcard__text"><span class="sok-chcard__name">${isClassic ? '' : `第 ${this.tab} 章 · `}${name}</span><span class="sok-chcard__goal">${goal}</span>
      <span class="xg-pips" aria-label="通过 ${passed} / ${levels.length}">${levels.map((l) => `<i class="${levelPassed(save, l.id) ? 'on' : ''}"></i>`).join('')}</span></span>
      <span class="sok-chcard__dest">${destIcon(dest)}<span>${DEST_NAME[dest]}</span>${levels.length ? `<span class="sok-chcard__stars">${icon('star')}<b>${stars}</b><small>/${levels.length * 3}</small></span>` : ''}</span>`;
    // road
    this.road.textContent = '';
    if (!levels.length) {
      this.road.innerHTML = `<button type="button" class="sok-coming" data-sfx="ui-pop"><svg viewBox="0 0 120 110" aria-hidden="true"><rect x="10" y="30" width="100" height="74" rx="12" fill="#74491E"/><rect x="10" y="14" width="100" height="70" rx="12" fill="#A27038"/><rect x="52" y="14" width="16" height="70" fill="#F9A726"/><path d="M10 50h100" stroke="#F9A726" stroke-width="12"/><rect x="10" y="14" width="100" height="90" rx="12" fill="none" stroke="#4A2D12" stroke-width="4"/></svg><span>新货单在路上</span></button>`;
      this.road.querySelector('button')!.addEventListener('click', () => {
        void this.strip.say('sok.finale.next', { mood: 'happy' });
        this.road.querySelector('svg')?.animate([{ transform: 'rotate(0)' }, { transform: 'rotate(-6deg)' }, { transform: 'rotate(5deg)' }, { transform: 'rotate(0)' }], { duration: 500 });
      });
      return;
    }
    const open = openLevels(save, this.tab);
    const cur = currentLevel(save, this.tab);
    const certified = this.tab === 1 && save.cert.passed;
    const starsOf = (l: LevelDef) => save.levels[l.id]?.stars ?? save.quiz[l.id]?.stars ?? 0;
    const nodes: MapNode[] = levels.map((l) => {
      const st: MapNode['state'] = !open.has(l.id) ? 'locked' : l.id === cur && !levelPassed(save, l.id) ? 'current' : levelPassed(save, l.id) || certified ? 'done' : 'open';
      return { id: l.id, label: l.id, state: st, stars: starsOf(l), boss: l.role === 'boss' };
    });
    const extraFirst = this.tab === 1 && certOpen(save) && !save.cert.passed;
    const extraLast = this.tab === 4;
    if (extraFirst) nodes.unshift({ id: 'cert', label: '跳级考试', state: 'open' });
    if (extraLast) nodes.push({ id: 'coming', label: '新货单在路上', state: 'open' });
    const marker = robotMarker(save);
    const btns = nodeMap(this.road, nodes, {
      marker,
      pad: this.road.clientWidth >= this.road.clientHeight ? 70 : 64,
      waves: this.road.clientWidth >= this.road.clientHeight ? 1.25 : 1.5,
      onPick: (n) => this.pick(n),
    });
    btns.forEach((b, i) => {
      const n = nodes[i];
      const m = b.querySelector('.xg-node__marker');
      b.classList.add('sok-node');
      b.dataset.testid = `node-${n.id}`;
      if (n.id === 'cert') {
        b.classList.add('sok-node--cert');
        b.innerHTML = certArt();
        b.setAttribute('aria-label', '跳级考试');
        if (m) b.append(m);
        return;
      }
      if (n.id === 'coming') {
        b.classList.add('sok-node--coming');
        if (this.focus === 'coming') b.classList.add('is-focus');
        b.innerHTML = comingArt();
        b.setAttribute('aria-label', '新货单在路上');
        return;
      }
      const l = levels[i - (extraFirst ? 1 : 0)];
      b.dataset.level = l.id;
      if (levelBroken(l)) {
        b.classList.add('sok-node--repair');
        b.dataset.testid = `node-${l.id}`;
        b.dataset.broken = '1';
        b.innerHTML = repairArt();
        if (m) b.append(m);
        b.setAttribute('aria-label', `${l.id} 维修中`);
        if (!this.loggedBroken.has(l.id)) {
          this.loggedBroken.add(l.id);
          this.ctx.marks.add('level-broken', { id: l.id, where: 'map' });
        }
        return;
      }
      if (l.role === 'boss') b.classList.add('sok-node--boss');
      if (isQuiz(l)) b.classList.add('sok-node--quiz');
      b.innerHTML = nodeArt(l, n.state === 'current' ? 'open' : n.state, n.stars ?? 0, !!save.levels[l.id]?.legacy, certified && !(save.levels[l.id]?.stars));
      if (m) b.append(m);
      b.setAttribute('aria-label', `${l.id} ${l.name}${n.state === 'locked' ? '（还没开放）' : ''}`);
    });
    void this.destroyed;
  }

  private pick(n: MapNode): void {
    if (n.id === 'coming') {
      void this.strip.say('sok.finale.next', { mood: 'happy' });
      playSfx('ui-pop', { volume: 0.6 });
      const art = this.road.querySelector<HTMLElement>('.sok-node--coming .sok-node__art');
      art?.animate([{ transform: 'rotate(0)' }, { transform: 'rotate(-7deg)' }, { transform: 'rotate(6deg)' }, { transform: 'rotate(-3deg)' }, { transform: 'rotate(0)' }], { duration: 520 });
      return;
    }
    if (n.id === 'cert') {
      void import('./overlays').then(async ({ showCertOffer }) => {
        const pick = await showCertOffer(this.ctx);
        if (pick === 'go') {
          this.ctx.certRun = { levels: [] };
          this.ctx.go({ name: 'play', id: 'cert-1', fresh: true });
        } else this.ctx.go({ name: 'play', id: '1-1' });
      });
      return;
    }
    const l = levelById(n.id);
    if (!l) return;
    if (levelBroken(l)) {
      // 维修中: a little shake, never opens
      playSfx('ui-locked', { volume: 0.6 });
      this.road.querySelector<HTMLElement>(`[data-level="${l.id}"] .sok-node__art`)?.animate([{ transform: 'rotate(0)' }, { transform: 'rotate(-6deg)' }, { transform: 'rotate(5deg)' }, { transform: 'rotate(0)' }], { duration: 420 });
      return;
    }
    if (!isLevelOpen(this.ctx.save.data, l)) return; // the kit already plays ui-locked on locked nodes
    this.ctx.go({ name: 'play', id: l.id });
  }

  private glowTab(t: Tab): void {
    const b = this.tabs.querySelector<HTMLElement>(`[data-tab="${t}"]`);
    if (!b) return;
    b.classList.add('is-glow');
    setTimeout(() => b.classList.remove('is-glow'), 2400);
  }

  destroy(): void {
    this.destroyed = true;
    this.strip.destroy();
    this.el.remove();
  }
}

/**
 * Where the map opens: the track of a level left half-way, else the frontier — the newest open
 * chapter that still has an open, unpassed level (else the newest open chapter with levels).
 */
export function defaultTab(save: Parameters<typeof chapterInfo>[0]): Tab {
  const left = save.inProgress?.id;
  if (left) {
    if (CLASSIC_LEVELS.some((l) => l.id === left)) return 'classic';
    const ch = CHAPTERS.find((c) => chapterLevels(c.ch).some((l) => l.id === left));
    if (ch) return ch.ch;
  }
  let frontier: Tab | null = null;
  let newest: Tab = 0;
  for (const c of CHAPTERS) {
    const info = chapterInfo(save, c.ch);
    if (!info.open || !info.levels.length) continue;
    newest = c.ch;
    const open = openLevels(save, c.ch);
    if (info.levels.some((l) => open.has(l.id) && !levelPassed(save, l.id))) frontier = c.ch;
  }
  return frontier ?? newest;
}

function app(ctx: AppCtx): HTMLElement {
  return ctx.app;
}
