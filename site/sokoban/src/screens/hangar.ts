/**
 * S9 机库 (spec §2.1, §5.5): 小推 on a turntable (tap him to turn him round), the rockets each route
 * received, and three tabs —
 *  - 装扮: the five v1 slots (名牌, 帽子, 肩灯, 徽章, 涂装); an owned item is put on (or 不戴) with one
 *    tap and shows at once everywhere; items not earned yet are paper silhouettes with their milestone;
 *  - 知识卡: the five cards (art + title); a tap enlarges it and reads its sentence; not-yet cards
 *    show which chapter brings them;
 *  - 本领 (小推的本领, spec §3.2): 滑动走路 自动 / 开 / 关 and — after the chapter-2 upgrade — 自动绕路 开 / 关.
 * Every label is voiced; nothing is bought, nothing is random.
 */
import type { LayoutInfo } from '@kit/shell';
import { icon, segmented } from '@kit/ui';
import { playMusic } from '../audio/music';
import { playSfx } from '../audio/sfx';
import { cardArt } from '../art/cards';
import { cosmeticsOf, redrawRobot, robotCanvas } from '../art/robotArt';
import type { AppCtx, Route, Screen } from '../app/context';
import { CARDS, COSMETICS, type CosmeticDef, type CosmeticSlot } from '../data';
import { mountSky } from '../render/backdrop';
import { drawRobot, restPose, type Cosmetics, type Facing } from '../render/robot';
import { CompanionStrip } from './companion';
import { setPhraseText } from './wrap';

const SLOTS: { slot: CosmeticSlot; name: string }[] = [
  { slot: 'plate', name: '名牌' },
  { slot: 'hat', name: '帽子' },
  { slot: 'lamp', name: '肩灯' },
  { slot: 'badge', name: '徽章' },
  { slot: 'paint', name: '涂装' },
];

/**
 * Close-up framing per slot (robot units: feet at y 0, head top ≈ −116; front view). The card shows
 * the item itself large — 铭牌 on the chest, 肩灯 lit on both shoulders — not a 60 px whole robot
 * where every item looked the same (QA r1). Paint jobs show the whole robot.
 */
const FOCUS: Partial<Record<CosmeticSlot, { x: number; y: number; span: number }>> = {
  plate: { x: 0, y: -46, span: 46 },
  hat: { x: 0, y: -100, span: 78 },
  badge: { x: 12, y: -44, span: 42 },
  paint: { x: 0, y: -60, span: 128 },
};

function itemThumb(slot: CosmeticSlot, cosmetics: Cosmetics, size: number): HTMLCanvasElement {
  const f = FOCUS[slot] ?? { x: 0, y: -60, span: 128 };
  const c = document.createElement('canvas');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = c.height = Math.round(size * dpr);
  c.style.width = c.style.height = `${size}px`;
  c.className = 'sok-item__thumb';
  const g = c.getContext('2d')!;
  g.scale(dpr, dpr);
  if (slot === 'lamp') {
    drawLampIcon(g, size);
    return c;
  }
  const s = (size * 100) / f.span;
  drawRobot(g, size / 2 - (f.x * s) / 100, size / 2 - (f.y * s) / 100, s, { ...restPose(1), eyes: 'happy', cosmetics });
  return c;
}

/** 双肩工作灯 as an icon: the lamp on its bracket on 小推's amber shoulder, lit, with light rays. */
function drawLampIcon(g: CanvasRenderingContext2D, size: number): void {
  const cx = size / 2;
  const cy = size * 0.47;
  const r = size * 0.17;
  g.save();
  // the shoulder it sits on
  g.fillStyle = '#F9A726';
  g.beginPath();
  g.roundRect(size * 0.08, cy + r * 1.35, size * 0.84, size, size * 0.12);
  g.fill();
  g.fillStyle = '#FFC86B';
  g.fillRect(size * 0.16, cy + r * 1.6, size * 0.68, size * 0.05);
  // glow + rays
  const glow = g.createRadialGradient(cx, cy, r * 0.4, cx, cy, r * 2.1);
  glow.addColorStop(0, 'rgba(255, 216, 99, .6)');
  glow.addColorStop(1, 'rgba(255, 216, 99, 0)');
  g.fillStyle = glow;
  g.beginPath();
  g.arc(cx, cy, r * 2.1, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#F6B934';
  g.lineCap = 'round';
  g.lineWidth = size * 0.04;
  for (const a of [-2.55, -2.05, -1.57, -1.09, -0.59]) {
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * r * 1.5, cy + Math.sin(a) * r * 1.5);
    g.lineTo(cx + Math.cos(a) * r * 2.1, cy + Math.sin(a) * r * 2.1);
    g.stroke();
  }
  // bracket + lamp
  g.fillStyle = '#4A3D58';
  g.beginPath();
  g.roundRect(cx - r * 0.45, cy + r * 0.6, r * 0.9, r * 0.9, r * 0.2);
  g.fill();
  g.beginPath();
  g.arc(cx, cy, r * 1.12, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#FFF1C9';
  g.beginPath();
  g.arc(cx, cy, r * 0.82, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#FFFFFF';
  g.beginPath();
  g.arc(cx - r * 0.3, cy - r * 0.3, r * 0.22, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

const UNLOCK_TEXT = (c: CosmeticDef): string =>
  c.unlock.type === 'chapter' ? `第 ${c.unlock.ch} 章完成` : c.unlock.type === 'classicAll' ? '经典仓库全通过' : c.unlock.type === 'random' ? `随机货单 ${c.unlock.n} 次` : '以后';

type Tab = 'items' | 'cards' | 'skills';

/** Mini diagrams of the two skills (QA r2: the 本领 panel was bare paper). Same palette as the board. */
const TILE = (x: number, y: number, w = 40) => `<rect x="${x}" y="${y}" width="${w - 3}" height="${w - 3}" rx="7" fill="#F1E2C2" stroke="#D8BF8F" stroke-width="2"/>`;
const BOT = (x: number, y: number) => `<g transform="translate(${x} ${y})"><rect x="-13" y="-6" width="26" height="20" rx="6" fill="#F6A21E" stroke="#8A4E0A" stroke-width="2"/><rect x="-12" y="-22" width="24" height="17" rx="6" fill="#F6B934" stroke="#8A4E0A" stroke-width="2"/><rect x="-8" y="-18" width="16" height="9" rx="3" fill="#1D2647"/><circle cx="-4" cy="-13.5" r="1.8" fill="#8FF7EC"/><circle cx="4" cy="-13.5" r="1.8" fill="#8FF7EC"/></g>`;
const CRATE = (x: number, y: number) => `<g transform="translate(${x} ${y})"><rect x="0" y="4" width="34" height="30" rx="6" fill="#74491E"/><rect x="0" y="0" width="34" height="28" rx="6" fill="#A27038" stroke="#4A2D12" stroke-width="2"/><rect x="14" y="0" width="6" height="28" fill="#F9A726"/></g>`;
const SWIPE_DEMO = `<svg viewBox="0 0 300 96"><g>${[0, 1, 2, 3, 4, 5].map((i) => TILE(14 + i * 46, 30, 46)).join('')}</g>${BOT(37, 62)}<g opacity=".35">${BOT(129, 62)}</g><g opacity=".6">${BOT(83, 62)}</g><path d="M150 22h96" stroke="#F9A726" stroke-width="7" stroke-linecap="round" stroke-dasharray="2 14"/><path d="M244 10l20 12-20 12z" fill="#F9A726"/><g transform="translate(230 52) rotate(-12)"><path d="M0 0c0-6 9-6 9 0v12c0-5 8-5 8 0v3c0-5 8-5 8 0v3c0-5 8-5 8 0v12c0 10-7 16-17 16h-4C4 46 0 40 0 33z" fill="#FFE0BE" stroke="#8A4E0A" stroke-width="2.4"/></g></svg>`;
const AUTO_DEMO = `<svg viewBox="0 0 300 120"><g>${[0, 1, 2, 3, 4, 5].map((c) => [0, 1].map((r) => TILE(14 + c * 46, 14 + r * 46, 46)).join('')).join('')}</g>${CRATE(150, 20)}<path d="M37 84H210V37" fill="none" stroke="#1AA892" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="1 11"/>${BOT(37, 92)}<g transform="translate(212 46)"><path d="M-9 -2l9 -10 9 10z" fill="#1AA892"/></g>${BOT(212, 46)}<path d="M196 34h-18" stroke="#E4513D" stroke-width="5" stroke-linecap="round"/><path d="M182 26l-10 8 10 8z" fill="#E4513D"/></svg>`;

export class HangarScreen implements Screen {
  readonly el: HTMLDivElement;
  private readonly hud: HTMLDivElement;
  private readonly stage: HTMLDivElement;
  private readonly panel: HTMLDivElement;
  private readonly tabsEl: HTMLDivElement;
  private readonly strip: CompanionStrip;
  private robot: HTMLCanvasElement;
  private facing: Facing = 1;
  private tab: Tab = 'items';
  /** spec S9: 小推 ≈ 240–280 px tall on the turntable (QA r2: was ~150) */
  private robotSize = 256;

  constructor(private readonly ctx: AppCtx, private readonly back: Route = { name: 'map' }) {
    playMusic();
    this.el = document.createElement('div');
    this.el.className = 'sok-hangar';
    this.el.dataset.testid = 'hangar';
    ctx.app.append(this.el);
    mountSky(document.body, 'earth', 'hangar');
    this.hud = document.createElement('div');
    this.hud.className = 'sok-hud sok-hud--map';
    this.hud.innerHTML = `<div class="sok-plate sok-plate--title"><span class="sok-plate__title">小推的机库</span></div>`;
    const backBtn = document.createElement('button');
    backBtn.type = 'button';
    backBtn.className = 'xg-iconbtn sok-hud__btn sok-hud__btn--map';
    backBtn.setAttribute('aria-label', '回地图');
    backBtn.dataset.testid = 'hangar-back';
    backBtn.innerHTML = icon('map');
    backBtn.addEventListener('click', () => this.ctx.go(this.back));
    this.hud.append(backBtn);
    this.stage = document.createElement('div');
    this.stage.className = 'sok-hangar__stage';
    this.robot = robotCanvas(this.robotSize, this.robotSize * 1.12, this.robotSize * 0.74, { cosmetics: cosmeticsOf(ctx.save.data) }, this.robotSize * 1.06, 'sok-hangar__robot');
    const turntable = document.createElement('div');
    turntable.className = 'sok-hangar__turntable';
    const robotBtn = document.createElement('button');
    robotBtn.type = 'button';
    robotBtn.className = 'sok-hangar__robotbtn';
    robotBtn.setAttribute('aria-label', '小推，点一下转个身');
    robotBtn.append(this.robot);
    robotBtn.addEventListener('click', () => this.turn());
    const stats = document.createElement('div');
    stats.className = 'sok-hangar__stats';
    const L = ctx.save.data.launched.byDest;
    stats.innerHTML = [['天宫', L.tiangong, '#3F7BE6'], ['月宫', L.moon, '#8170DB'], ['火星', L.mars, '#EB6A3C']]
      .map(([n, v, c]) => `<div class="sok-hangar__stat" style="--c:${c}">${icon('rocket')}<span>${n}</span><b>${v}</b></div>`).join('');
    this.stage.append(turntable, robotBtn, stats);
    this.tabsEl = document.createElement('div');
    this.tabsEl.className = 'sok-hangar__tabs';
    this.panel = document.createElement('div');
    this.panel.className = 'sok-hangar__panel';
    this.el.append(this.hud, this.stage, this.tabsEl, this.panel);
    this.strip = new CompanionStrip(this.el, ctx.voice);
    this.strip.el.classList.add('sok-comp--hangar');
    segmented(this.tabsEl, {
      options: [{ id: 'items', label: '装扮', icon: 'robot' }, { id: 'cards', label: '知识卡', icon: 'book' }, { id: 'skills', label: '本领', icon: 'settings' }],
      value: 'items',
      onChange: (id) => {
        this.tab = id as Tab;
        this.render();
        if (id === 'skills') void this.strip.say('sok.hangar.skills', { mood: 'happy', interrupt: true });
      },
    });
    this.layout(ctx.layout());
    void this.strip.say('sok.hangar.intro', { mood: 'happy' });
  }

  layout(l: LayoutInfo): void {
    const T = Math.round(l.safe.top);
    const portrait = l.height > l.width;
    this.el.dataset.orient = portrait ? 'portrait' : 'landscape';
    const place = (el: HTMLElement, x: number, y: number, w: number, h: number) => {
      Object.assign(el.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` });
      // the 本领 panel shrinks to its content but never past the room it was given
      if (el === this.panel) el.style.setProperty('--sok-panel-max', `${h}px`);
    };
    const phone = Math.min(l.width, l.height) < 600;
    this.el.toggleAttribute('data-phone', phone);
    if (phone) {
      // phones: a smaller 小推 on the turntable, the companion over him, the panel scrolls
      const L = 12 + Math.round(l.safe.left || 0);
      const R = 12 + Math.round(l.safe.right || 0);
      const bottom = l.height - Math.max(8, Math.round(l.safe.bottom || 0));
      place(this.hud, 0, T, l.width, portrait ? 64 : 60);
      if (portrait) {
        const stageH = Math.round(Math.min(240, l.height * 0.32));
        this.setRobotSize(Math.round(Math.max(110, Math.min(200, (stageH - 30) / 1.25))));
        place(this.stage, L, T + 68, l.width - L - R, stageH);
        place(this.tabsEl, L, T + 72 + stageH, l.width - L - R, 60);
        place(this.panel, L, T + 140 + stageH, l.width - L - R, bottom - (T + 140 + stageH));
        this.strip.layout({ x: L, y: T + 68, w: l.width - L - R, h: 64 }, 'portrait');
      } else {
        const stageW = 236;
        this.setRobotSize(Math.round(Math.max(100, Math.min(170, (bottom - T - 64 - 110) / 1.12))));
        place(this.stage, L, T + 72, stageW, bottom - (T + 72));
        place(this.tabsEl, L + stageW + 12, T + 64, l.width - R - (L + stageW + 12), 60);
        place(this.panel, L + stageW + 12, T + 132, l.width - R - (L + stageW + 12), bottom - (T + 132));
        this.strip.layout({ x: L, y: T + 72, w: stageW, h: 64 }, 'portrait');
      }
      this.render();
      return;
    }
    this.setRobotSize(256);
    place(this.hud, 0, T, l.width, 76);
    if (portrait) {
      place(this.stage, 16, T + 84, l.width - 32, 362);
      place(this.tabsEl, 16 + (l.width - 32 - 480) / 2, T + 452, 480, 64);
      place(this.panel, 16, T + 526, l.width - 32, l.height - 16 - (T + 526));
      // the companion speaks above 小推's head (full width), the robot stands below it
      this.strip.layout({ x: 16, y: T + 84, w: l.width - 32 - 190, h: 72 }, 'portrait');
    } else {
      place(this.stage, 16, T + 84, 360, l.height - 16 - (T + 84));
      place(this.tabsEl, 392 + (l.width - 408 - 480) / 2, T + 84, 480, 64);
      place(this.panel, 392, T + 160, l.width - 408, l.height - 16 - (T + 160));
      this.strip.layout({ x: 16, y: T + 84, w: 360, h: 230 }, 'landscape');
    }
    this.render();
  }

  /** 小推's size on the turntable (phones get a smaller one); redrawn only when it changes. */
  private setRobotSize(n: number): void {
    if (n === this.robotSize) return;
    this.robotSize = n;
    const next = robotCanvas(n, n * 1.12, n * 0.74, { facing: this.facing, cosmetics: cosmeticsOf(this.ctx.save.data) }, n * 1.06, 'sok-hangar__robot');
    this.robot.replaceWith(next);
    this.robot = next;
    this.el.style.setProperty('--sok-robot', `${n}px`);
  }

  private turn(): void {
    this.facing = ([3, 0, 2, 1] as Facing[])[[1, 3, 0, 2].indexOf(this.facing)];
    playSfx('ui-tick', { volume: 0.5 });
    this.redraw({ facing: this.facing, eyes: 'happy' });
  }

  private redraw(pose: Record<string, unknown> = {}): void {
    redrawRobot(this.robot, this.robotSize, this.robotSize * 1.12, this.robotSize * 0.74, { facing: this.facing, cosmetics: cosmeticsOf(this.ctx.save.data), ...pose }, this.robotSize * 1.06);
  }

  private render(): void {
    this.panel.textContent = '';
    this.panel.dataset.tab = this.tab;
    if (this.tab === 'items') this.renderItems();
    else if (this.tab === 'cards') this.renderCards();
    else this.renderSkills();
  }

  private renderItems(): void {
    const save = this.ctx.save.data;
    for (const { slot, name } of SLOTS) {
      const row = document.createElement('div');
      row.className = 'sok-slot';
      row.innerHTML = `<span class="sok-slot__name">${name}</span>`;
      const opts = document.createElement('div');
      opts.className = 'sok-slot__opts';
      const items = COSMETICS.filter((c) => c.slot === slot);
      const equipped = save.cosmetics.equipped[slot];
      const none = document.createElement('button');
      none.type = 'button';
      none.className = `sok-item sok-item--none${!equipped ? ' is-on' : ''}`;
      none.innerHTML = `<span class="sok-item__label">不戴</span>`;
      none.addEventListener('click', () => this.equip(slot, undefined));
      opts.append(none);
      for (const it of items) {
        const owned = save.cosmetics.owned.includes(it.id);
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `sok-item${owned ? '' : ' is-locked'}${equipped === it.id ? ' is-on' : ''}`;
        b.dataset.item = it.id;
        b.dataset.testid = `item-${it.id}`;
        b.append(itemThumb(slot, cosmeticsOf({ cosmetics: { equipped: { [slot]: it.id } } }), 80));
        const label = document.createElement('span');
        label.className = 'sok-item__label';
        setPhraseText(label, owned ? it.name : UNLOCK_TEXT(it));
        b.append(label);
        if (!owned) b.insertAdjacentHTML('beforeend', `<span class="sok-item__lock">${icon('lock')}</span>`);
        b.addEventListener('click', () => {
          if (!owned) {
            playSfx('ui-locked');
            void this.strip.say(it.line, { mood: 'encouraging', interrupt: true });
            return;
          }
          this.equip(slot, it.id);
          void this.strip.say(it.line, { mood: 'happy', interrupt: true });
        });
        opts.append(b);
      }
      row.append(opts);
      this.panel.append(row);
    }
  }

  private equip(slot: CosmeticSlot, id: string | undefined): void {
    this.ctx.save.update((s) => {
      if (id) s.cosmetics.equipped[slot] = id;
      else delete s.cosmetics.equipped[slot];
    });
    playSfx(id ? 'unlock' : 'ui-tick', { volume: id ? 0.6 : 0.5 });
    this.redraw({ eyes: 'happy', cheer: id ? 0.5 : 0 });
    this.robot.classList.remove('is-click');
    void this.robot.offsetWidth;
    this.robot.classList.add('is-click');
    this.render();
  }

  private renderCards(): void {
    const save = this.ctx.save.data;
    const grid = document.createElement('div');
    grid.className = 'sok-cards';
    for (const c of CARDS) {
      const owned = save.cards.includes(c.id);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `sok-kcard${owned ? '' : ' is-locked'}`;
      b.dataset.card = c.id;
      b.innerHTML = `<span class="sok-kcard__art">${cardArt(c.id)}</span><span class="sok-kcard__title">${owned ? c.title : `第 ${c.ch} 章`}</span>${owned ? '' : `<span class="sok-kcard__lock">${icon('lock')}</span>`}`;
      b.addEventListener('click', () => {
        if (!owned) {
          playSfx('ui-locked');
          return;
        }
        this.openCard(c.id);
      });
      grid.append(b);
    }
    this.panel.append(grid);
  }

  private openCard(id: string): void {
    const c = CARDS.find((x) => x.id === id)!;
    const scrim = document.createElement('div');
    scrim.className = 'xg-scrim xg-root sok-kview';
    scrim.dataset.xgGame = 'porter';
    scrim.innerHTML = `<div class="xg-modal sok-kview__panel"><div class="xg-ribbon">知识卡</div><div class="sok-kview__art">${cardArt(c.id)}</div><h2 class="xg-modal__title">${c.title}</h2><p class="sok-kview__text">${c.text}</p><div class="xg-modal__actions"><button type="button" class="xg-btn xg-btn--primary xg-btn--lg" data-act="ok">${icon('check')}<span>好</span></button></div></div>`;
    document.body.append(scrim);
    playSfx('ui-open');
    void this.ctx.voice.say(c.line, { interrupt: true });
    scrim.addEventListener('click', (e) => {
      if (!(e.target as Element).closest('[data-act]') && e.target !== scrim) return;
      playSfx('ui-close');
      this.ctx.voice.stop();
      scrim.classList.add('is-leaving');
      setTimeout(() => scrim.remove(), 240);
    });
  }

  private renderSkills(): void {
    const save = this.ctx.save.data;
    const swipe = document.createElement('div');
    swipe.className = 'sok-skill';
    swipe.innerHTML = `<button type="button" class="sok-skill__name" data-line="sok.skill.swipe">${icon('hand')}<span>滑动走路</span>${icon('listen', 'sok-skill__listen')}</button><div class="sok-skill__demo" aria-hidden="true">${SWIPE_DEMO}</div>`;
    const seg1 = document.createElement('div');
    seg1.dataset.testid = 'skill-swipe';
    swipe.append(seg1);
    segmented(seg1, {
      options: [{ id: 'auto', label: '自动' }, { id: 'on', label: '开' }, { id: 'off', label: '关' }],
      value: save.settings.swipe,
      onChange: (id) => {
        this.ctx.save.update((s) => {
          s.settings.swipe = id as 'auto' | 'on' | 'off';
        });
        playSfx(id === 'off' ? 'ui-toggle-off' : 'ui-toggle-on');
      },
    });
    this.panel.append(swipe);
    if (save.arrows !== 'locked') {
      const auto = document.createElement('div');
      auto.className = 'sok-skill';
      auto.innerHTML = `<button type="button" class="sok-skill__name" data-line="sok.skill.auto">${icon('next')}<span>自动绕路</span>${icon('listen', 'sok-skill__listen')}</button><div class="sok-skill__demo" aria-hidden="true">${AUTO_DEMO}</div>`;
      const seg2 = document.createElement('div');
      seg2.dataset.testid = 'skill-auto';
      auto.append(seg2);
      segmented(seg2, {
        options: [{ id: 'on', label: '开' }, { id: 'off', label: '关' }],
        value: save.settings.autoRoute ? 'on' : 'off',
        onChange: (id) => {
          this.ctx.save.update((s) => {
            s.settings.autoRoute = id === 'on';
          });
          playSfx(id === 'on' ? 'ui-toggle-on' : 'ui-toggle-off');
        },
      });
      this.panel.append(auto);
    }
    // 再看一遍 (Dad's feedback 2026-10-08: the opening and the first lesson can be skipped, so they
    // stay replayable here): the opening scene, and 0-1 with its ghost-hand teaching
    const again = document.createElement('div');
    again.className = 'sok-skill sok-skill--again';
    again.dataset.testid = 'skill-again';
    again.innerHTML = `<span class="sok-skill__name sok-skill__name--static">${icon('restart')}<span>再看一遍</span></span><div class="sok-again"><button type="button" class="xg-btn xg-btn--secondary xg-btn--sm" data-again="opening" data-testid="again-opening">${icon('play')}<span>开场</span></button><button type="button" class="xg-btn xg-btn--secondary xg-btn--sm" data-again="lesson" data-testid="again-lesson">${icon('hand')}<span>第一课</span></button></div>`;
    again.querySelector('[data-again="opening"]')!.addEventListener('click', () => this.ctx.go({ name: 'opening', replay: { name: 'hangar', back: this.back } }));
    again.querySelector('[data-again="lesson"]')!.addEventListener('click', () => this.ctx.go({ name: 'play', id: '0-1', fresh: true }));
    this.panel.append(again);
    this.panel.querySelectorAll<HTMLElement>('[data-line]').forEach((b) => b.addEventListener('click', () => void this.strip.say(b.dataset.line!, { mood: 'happy', interrupt: true })));
  }

  destroy(): void {
    this.strip.destroy();
    this.el.remove();
  }
}
