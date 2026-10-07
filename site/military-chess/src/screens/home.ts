/**
 * S1 营地 (spec §2.5): shoulder board + name, four big cards (学堂 / 对战 / 残局 / 和爸爸下) with a
 * progress line each, the guide and the 继续上一局 banner. Top right: 勋章柜, 规则卡 and the gear
 * (hold 3 s → the parent gate, spec §2.1 S15). "今天建议" (§4.6) rings the suggested card in gold
 * and reads `mc.home.today` once — never forced. Right after the first-time flow the first shoulder
 * board drops in quietly (no confetti, §2.6).
 */
import { getSettings, hasPin, checkPin } from '@kit/settings';
import { icon, mountKeypad } from '@kit/ui';
import type { App } from '../app';
import { ENDGAMES, LESSONS } from '../content';
import { academyDone, bestBeaten, endgameTierUnlocked, endgamesDone, lessonById, lessonPassed, nextItem } from '../core/progress';
import { RANK_NAMES, insignia } from '../view/insignia';
import { art, type ArtId } from '../view/cards-art';
import { mcIcon } from '../view/icons';
import { promotionCeremony } from '../view/promo';
import { d } from '../view/anim';
import { BaseScreen, abs, button, div } from './base';
import type { Rect } from '../view/layout';

type CardId = 'academy' | 'battle' | 'puzzle' | 'family';
interface CardDef {
  id: CardId;
  title: string;
  sub: string;
  line: string;
  art: ArtId;
}

const CARDS: CardDef[] = [
  { id: 'academy', title: '学堂', sub: '学会每一个子', line: 'mc.home.academy', art: 'academy' },
  { id: 'battle', title: '对战', sub: '和机器人比一比', line: 'mc.home.battle', art: 'battle' },
  { id: 'puzzle', title: '残局', sub: '几步扛到军旗', line: 'mc.home.puzzle', art: 'puzzle' },
  { id: 'family', title: '和爸爸下', sub: '和爸爸下一盘', line: 'mc.home.family', art: 'family' },
];

let greeted = false;
/** the parent gate refuses for 30 s after 3 wrong PINs (no "wrong" message, spec §2.1) */
let gateLockedUntil = 0;

/** "今天建议" (§4.6): the card to ring today — a deterministic function of the save */
export function todayCard(app: App): CardId {
  const s = app.save;
  const wins = (m: 'fan' | 'ming' | 'an') => s.ladder[m].wins.reduce((a, b) => a + b, 0);
  if (lessonPassed(s, lessonById('F')) && wins('fan') === 0) return 'battle';
  if (lessonPassed(s, lessonById('L5')) && endgamesDone(s, 1) < 5 && !lessonPassed(s, lessonById('L6'))) return 'puzzle';
  if (lessonPassed(s, lessonById('L7')) && wins('ming') === 0) return 'battle';
  if (lessonPassed(s, lessonById('L8')) && wins('an') === 0) return 'battle';
  if (nextItem(s)) return 'academy';
  for (const tier of [1, 2] as const) if (endgameTierUnlocked(s, tier) && endgamesDone(s, tier) < 8) return 'puzzle';
  return 'battle';
}

export class HomeScreen extends BaseScreen {
  readonly name = 'home';
  private today: CardId;
  private gearTimer = 0;
  private ftPromos: number[];

  constructor(app: App, o: { ftPromos?: number[] } = {}) {
    super(app);
    this.today = todayCard(app);
    this.ftPromos = o.ftPromos ?? [];
    if (this.ftPromos.length) {
      greeted = true;
      this.bag.timeout(() => void this.afterFt(), 500);
    }
  }

  private progress(id: CardId): { value: number; label: string } {
    const s = this.app.save;
    if (id === 'academy') {
      const n = LESSONS.reduce((a, l) => a + l.items.length, 0);
      const done = academyDone(s);
      return { value: done / n, label: `${done} / ${n}` };
    }
    if (id === 'battle') {
      const best = (['fan', 'ming', 'an'] as const).reduce((a, m) => a + bestBeaten(s, m), 0);
      return { value: best / 12, label: `${best} / 12` };
    }
    if (id === 'puzzle') {
      const done = endgamesDone(s, 1) + endgamesDone(s, 2);
      return { value: done / ENDGAMES.length, label: `${done} / ${ENDGAMES.length}` };
    }
    return { value: -1, label: s.family.games ? `下过 ${s.family.games} 盘` : '' };
  }

  protected render(): void {
    const portrait = this.o === 'portrait';
    const st = this.safeTop;
    this.el.replaceChildren();
    this.el.classList.add('mc-home');
    const save = this.app.save;
    const name = getSettings().displayName;

    // header: shoulder board + name
    const head = div('mc-home__head');
    head.dataset.testid = 'home-head';
    const showRank = save.firstRun.ft && !(this.ftPromos.length && !this.el.dataset.ftShown);
    head.innerHTML = `<span class="mc-home__rank">${showRank ? insignia(save.rank, portrait ? 116 : 110) : ''}</span><div class="mc-home__who"><b>${name}</b><span>${showRank ? RANK_NAMES[save.rank] : ''}</span></div>`;
    let cardRects: Rect[];
    if (portrait) {
      abs(head, { x: 90, y: st + 16, w: 470, h: 110 });
      const w = 360, h = 340, gap = 18, x0 = (810 - 2 * w - gap) / 2, y0 = st + 150; // QA r2: cards fill the old empty band
      cardRects = [0, 1, 2, 3].map((k) => ({ x: x0 + (k % 2) * (w + gap), y: y0 + Math.floor(k / 2) * (h + gap), w, h }));
    } else {
      abs(head, { x: 16, y: st + 70, w: 200, h: 170 });
      head.classList.add('is-col');
      const w = 400, h = 280, gap = 16, x0 = 1080 - 16 - 2 * w - gap, y0 = st + 64;
      cardRects = [0, 1, 2, 3].map((k) => ({ x: x0 + (k % 2) * (w + gap), y: y0 + Math.floor(k / 2) * (h + gap), w, h }));
    }
    this.el.append(head);

    // top-right: medals, rules, gear (hold 3 s)
    const tools = div('mc-home__tools');
    const medals = button('xg-iconbtn mc-tool-btn', icon('badge'), () => this.open('medals'), 'medals');
    const rules = button('xg-iconbtn mc-tool-btn', icon('book'), () => this.open('rules'), 'rules');
    const gear = button('xg-iconbtn mc-tool-btn mc-gear', `${icon('settings')}<svg class="mc-gear__ring" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="28" pathLength="176"/></svg>`, () => this.gearTap(), 'gear');
    this.bindGear(gear);
    tools.append(medals, rules, gear);
    abs(tools, portrait ? { x: 810 - 16 - 3 * 64 - 2 * 10, y: st + 12, w: 3 * 64 + 2 * 10, h: 64 } : { x: 1080 - 16 - 3 * 64 - 2 * 10, y: st - 6, w: 3 * 64 + 2 * 10, h: 64 });
    this.el.appendChild(tools);

    CARDS.forEach((c, k) => {
      const pr = this.progress(c.id);
      const bar = pr.value >= 0 ? `<span class="mc-cardbar"><i style="width:${Math.round(Math.min(1, pr.value) * 100)}%"></i></span><span class="mc-cardbar__t">${pr.label}</span>` : pr.label ? `<span class="mc-cardbar__t is-solo">${mcIcon('hands')}${pr.label}</span>` : '';
      const b = button(`xg-card mc-camp-card${this.today === c.id ? ' is-today' : ''}`, `
        <span class="mc-camp-card__art">${art(c.art, portrait ? 160 : 120)}</span>
        <span class="mc-camp-card__title">${c.title}</span>
        <span class="mc-camp-card__sub">${c.sub}</span>
        <span class="mc-camp-card__bar">${bar}</span>`, () => this.pick(c), `card-${c.id}`);
      abs(b, cardRects[k]);
      this.el.appendChild(b);
    });

    // guide + caption
    const guideHost = div('mc-home__guide');
    if (portrait) {
      abs(guideHost, { x: 24, y: 1080 - 16 - 150, w: 120, h: 150 });
      abs(this.caption.el, { x: 170, y: 1080 - 16 - 100, w: 624, h: 84 });
    } else {
      abs(guideHost, { x: 56, y: 810 - 16 - 150, w: 120, h: 150 });
      // QA r2: the bubble fits its text and sits right above the robot (bottom-anchored)
      abs(this.caption.el, { x: 16, y: 0, w: 220, h: 0 });
      Object.assign(this.caption.el.style, { top: 'auto', bottom: `${16 + 150 + 10}px`, height: 'auto', maxHeight: '230px' });
      this.caption.el.classList.add('is-tall');
    }
    this.el.append(guideHost, this.caption.el);
    this.placeGuide(guideHost, 120, { mood: 'happy' });

    // resume banner
    if (save.resume) {
      const modeName = save.resume.mode === 'fan' ? '翻翻棋' : save.resume.mode === 'ming' ? '明棋' : '暗棋';
      const who = save.resume.opponent.kind === 'family' ? '和爸爸' : '对战';
      const banner = button('xg-btn xg-btn--gold mc-resume', `${icon('play')}<span>继续上一局 · ${who}${modeName}</span>`, () => {
        this.app.play('ui-confirm');
        this.app.go({ name: 'match', resume: true });
      }, 'resume');
      if (portrait) abs(banner, { x: 170, y: 1080 - 16 - 64 - 100 - 12, w: 624, h: 64 });
      else abs(banner, { x: 1080 - 16 - 816, y: st + 64 + 576 + 16, w: 816, h: 64 });
      this.el.appendChild(banner);
    }
    if (!greeted) {
      greeted = true;
      this.bag.timeout(() => void this.greet(), 350);
    }
  }

  private async greet(): Promise<void> {
    const save = this.app.save;
    if (save.resume) {
      await this.say('mc.home.resume');
      return;
    }
    await this.say('mc.home.pick');
    this.ringToday();
    await this.say('mc.home.today', 'happy');
  }

  private ringToday(): void {
    const el = this.el.querySelector<HTMLElement>(`[data-testid="card-${this.today}"]`);
    el?.animate([{ boxShadow: '0 0 0 0 rgba(246,185,52,.0)' }, { boxShadow: '0 0 0 10px rgba(246,185,52,.75)' }, { boxShadow: '0 0 0 0 rgba(246,185,52,.0)' }], { duration: d(900), iterations: 2 });
  }

  /** right after the first-time flow: the 学堂 card breathes, the first shoulder board drops (quiet) */
  private async afterFt(): Promise<void> {
    this.today = 'academy';
    void this.say('mc.home.pick');
    this.el.querySelector('[data-testid="card-academy"]')?.classList.add('is-today', 'is-breathe');
    await this.bag.wait(d(900));
    await promotionCeremony(this.el, this.ftPromos, { play: (n) => this.app.play(n), say: (l) => void this.say(l, 'celebrating'), wait: (ms) => this.bag.wait(ms), quiet: true });
    this.el.dataset.ftShown = '1';
    this.ftPromos = [];
    this.render();
    this.el.querySelector('[data-testid="card-academy"]')?.classList.add('is-today', 'is-breathe');
  }

  private open(r: 'medals' | 'rules'): void {
    this.app.play('ui-open');
    void this.say(r === 'medals' ? 'mc.home.medals' : 'mc.home.rules');
    this.app.go(r === 'medals' ? { name: 'medals' } : { name: 'rules', from: 'home' });
  }

  private pick(c: CardDef): void {
    this.app.play('ui-confirm');
    void this.say(c.line);
    if (c.id === 'family') this.app.go({ name: 'family' });
    else if (c.id === 'academy') this.app.go({ name: 'academy' });
    else if (c.id === 'battle') this.app.go({ name: 'ladder' });
    else this.app.go({ name: 'endgames' });
  }

  // ------------------------------------------------------------------ parent gate (§2.1 S15)
  private gearTap(): void {
    // a short tap does nothing visible beyond the ring hint: grown-ups hold it
    this.app.play('ui-tap');
  }

  private bindGear(gear: HTMLButtonElement): void {
    const ring = gear.querySelector<SVGElement>('.mc-gear__ring')!;
    const circle = ring.querySelector('circle')!;
    let anim: Animation | null = null;
    const cancel = (): void => {
      clearTimeout(this.gearTimer);
      anim?.cancel();
      anim = null;
    };
    gear.addEventListener('pointerdown', () => {
      if (Date.now() < gateLockedUntil) return;
      cancel();
      anim = circle.animate([{ strokeDashoffset: '176' }, { strokeDashoffset: '0' }], { duration: 3000, fill: 'forwards' });
      ring.style.opacity = '1';
      this.gearTimer = window.setTimeout(() => {
        cancel();
        ring.style.opacity = '';
        this.app.play('ui-open');
        this.openGate();
      }, 3000);
    });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave'] as const) gear.addEventListener(ev, () => {
      cancel();
      ring.style.opacity = '';
    });
  }

  private openGate(): void {
    const openedAt = Date.now();
    const scrim = div('mc-scrim');
    scrim.dataset.testid = 'parent-gate';
    const sheet = div('mc-sheet mc-gate');
    const close = (): void => scrim.remove();
    if (!hasPin()) {
      sheet.innerHTML = `<h2>${icon('parent')}家长面板</h2><p class="mc-gate__p">家长面板要先在大厅的家长页设置密码</p>`;
      const row = div('mc-row');
      row.append(
        button('xg-btn xg-btn--secondary xg-btn--lg', '<span>算了</span>', () => close(), 'gate-cancel'),
        button('xg-btn xg-btn--primary xg-btn--lg', `${icon('parent')}<span>去家长页</span>`, () => void this.app.shell.leave('/parent/'), 'gate-parent'),
      );
      sheet.appendChild(row);
    } else {
      sheet.innerHTML = `<h2>${icon('parent')}家长面板</h2>`;
      const pad = div('mc-gate__pad');
      let tries = 0;
      mountKeypad(pad, {
        maxLength: 6,
        placeholder: '····',
        onSubmit: (v) => {
          if (v.length >= 4 && checkPin(v)) {
            close();
            this.app.go({ name: 'parent' });
            return true;
          }
          tries++;
          if (tries >= 3) {
            gateLockedUntil = Date.now() + 30_000;
            close();
          }
          return false;
        },
      });
      sheet.appendChild(pad);
      sheet.appendChild(button('xg-btn xg-btn--ghost', '<span>算了</span>', () => close(), 'gate-cancel'));
    }
    scrim.addEventListener('click', (e) => {
      // the finger that held the gear lifts over the new scrim: ignore that first click
      if (e.target === scrim && Date.now() - openedAt > 600) close();
    });
    abs(sheet, this.o === 'portrait' ? { x: 165, y: 220, w: 480, h: 0 } : { x: 300, y: 60, w: 480, h: 0 });
    sheet.style.height = 'auto';
    scrim.appendChild(sheet);
    this.el.appendChild(scrim);
  }

  destroy(): void {
    clearTimeout(this.gearTimer);
    super.destroy();
  }
}
