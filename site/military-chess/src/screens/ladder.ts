/**
 * S9 对战天梯 (spec §2.5, §4.4): three mode tabs (翻翻棋 / 明棋 / 暗棋; a mode opens with its lesson)
 * and four robot opponents per mode. Two wins open the next robot (handicap / undo wins count; the
 * dots show 让 / 悔). Tap a robot → it is introduced (mc.opp.N) and selected; 开始 starts the game
 * (明棋 / 暗棋 go through 布阵 first). `free` = Dad vs the computer: every mode and robot, nothing booked.
 */
import { icon, segmented, shouldAutoSkip } from '@kit/ui';
import type { App } from '../app';
import type { Mode } from '../core/state';
import { MODE_LESSON, PLAY_MODES, ladderModeUnlocked, ladderOpen, type LadderMode } from '../core/progress';
import { LESSONS } from '../content';
import { newLadderMatch } from '../ctrl/ladder';
import type { Level } from '../ai/levels';
import { mcIcon } from '../view/icons';
import { mountOpponent, OPPONENTS } from '../view/hats';
import type { Companion } from '@kit/companion';
import { BaseScreen, abs, button, div } from './base';

const ALL_MODES: Array<{ id: LadderMode; label: string; line: string; lesson: string }> = [
  { id: 'fan', label: '翻翻棋', line: 'mc.lad.fan', lesson: 'F' },
  { id: 'ming', label: '明棋', line: 'mc.lad.ming', lesson: 'L7' },
  { id: 'an', label: '暗棋', line: 'mc.lad.an', lesson: 'L8' },
];
/** Dad, 2026-10-08: only 翻翻棋 is offered (PLAY_MODES); with one mode the tabs become a title line */
const MODES = ALL_MODES.filter((m) => PLAY_MODES.includes(m.id));

export class LadderScreen extends BaseScreen {
  readonly name = 'ladder';
  private mode: LadderMode;
  private pick: Level | null = null;
  private heads: Companion[] = [];
  private free: boolean;

  constructor(app: App, o: { mode?: Mode; free?: boolean } = {}) {
    super(app);
    this.free = !!o.free;
    const firstOpen = MODES.find((m) => this.modeOpen(m.id))?.id ?? MODES[0].id;
    this.mode = o.mode && MODES.some((m) => m.id === o.mode) && this.modeOpen(o.mode) ? o.mode : firstOpen;
    const open = this.open();
    this.pick = open as Level;
    this.bag.timeout(() => void this.say('mc.lad.pick'), 300);
  }

  private modeOpen(m: LadderMode): boolean {
    // the parent's 跳过开场和教学 also skips the 翻翻棋入门 lesson that opens the 翻翻棋 ladder
    return this.free || ladderModeUnlocked(this.app.save, m) || (m === 'fan' && shouldAutoSkip());
  }
  private open(): number {
    return this.free ? 4 : ladderOpen(this.app.save, this.mode);
  }

  back(): boolean {
    this.app.go(this.free ? { name: 'family' } : { name: 'home' });
    return true;
  }

  readonly phoneReady = true;

  protected render(): void {
    for (const h of this.heads) h.destroy();
    this.heads = [];
    const portrait = this.o === 'portrait';
    const st = this.safeTop;
    const ph = this.phone;
    const W = ph ? this.W : portrait ? 810 : 1080, H = ph ? this.H : portrait ? 1080 : 810;
    const tb = this.app.topBand, sr = this.app.safeR, col = this.phoneCol;
    this.el.replaceChildren();
    this.el.classList.add('mc-ladder');
    const title = div('mc-h1 mc-center', this.free ? '和电脑下' : '对战');
    if (ph) this.phoneTitle(title);
    else {
      abs(title, { x: 100, y: st + 10, w: W - 200, h: 56 });
      this.el.appendChild(title);
    }

    // mode tabs (one mode → a quiet title line instead)
    const tabs = div(MODES.length > 1 ? 'mc-tabs' : 'mc-tabs mc-mode-line');
    tabs.dataset.testid = 'mode-tabs';
    if (MODES.length === 1) tabs.innerHTML = `<b>${MODES[0].label}</b><span>翻开才知道是谁 · 扛到军旗就赢</span>`;
    else segmented(tabs, {
      options: MODES.map((m) => ({ id: m.id, label: m.label + (this.modeOpen(m.id) ? '' : ' ') })),
      value: this.mode,
      night: true,
      onChange: (id) => this.switchMode(id as LadderMode),
    });
    for (const m of MODES) {
      const b = tabs.querySelector<HTMLElement>(`button[data-id="${m.id}"]`);
      if (b && !this.modeOpen(m.id)) b.insertAdjacentHTML('afterbegin', icon('lock'));
      if (b) b.dataset.testid = `tab-${m.id}`;
    }
    // phones: portrait under the 🏠 band; landscape beside the title is too tight → a line under it
    if (ph) abs(tabs, portrait ? { x: 8, y: tb, w: W - 16, h: 56 } : { x: col + 4, y: 60, w: W - col - 10 - sr, h: 28 });
    else abs(tabs, portrait ? { x: 105, y: st + 76, w: 600, h: 64 } : { x: 240, y: st + 72, w: 600, h: 64 });
    if (ph && !portrait) tabs.classList.add('is-flat');
    this.el.appendChild(tabs);

    // opponent cards
    const open = this.open();
    const t = this.app.save.ladder[this.mode];
    // phones: 4 rows above the 开始 foot (portrait) / 4 columns (landscape)
    // portrait keeps a caption band (60) between the robots and 开始: the bubble never covers a robot
    const pTop = tb + 60, pFoot = H - 6 - 58 - 6 - 72, pGap = 8;
    const pH = Math.floor((pFoot - pTop - 3 * pGap) / 4);
    const lTop = 92, lW = (W - col - 4 - 6 - sr - 3 * 10) / 4, lH = H - 6 - 58 - 14 - lTop;
    const cardRect = (k: number) => (ph
      ? portrait ? { x: 8, y: pTop + k * (pH + pGap), w: W - 16, h: pH } : { x: col + 4 + k * (lW + 10), y: lTop, w: lW, h: lH }
      : portrait ? { x: 60, y: st + 160 + k * 170, w: 690, h: 156 } : { x: 32 + k * 258, y: st + 160, w: 244, h: 420 });
    OPPONENTS.forEach((op, k) => {
      const lvl = (k + 1) as Level;
      const locked = lvl > open;
      const wins = this.free ? 0 : t.wins[k];
      const hw = this.free ? 0 : t.handicapWins[k];
      const uw = this.free ? 0 : t.undoWins[k];
      const kinds: string[] = [];
      for (let i = 0; i < Math.max(0, wins - hw - uw); i++) kinds.push('');
      for (let i = 0; i < hw; i++) kinds.push('让');
      for (let i = 0; i < uw; i++) kinds.push('悔');
      const dots = [0, 1].map((i) => (i < Math.min(wins, kinds.length) ? `<i class="mc-dot is-on">${kinds[i] ? `<em>${kinds[i]}</em>` : ''}</i>` : '<i class="mc-dot"></i>')).join('');
      const extra = wins > 2 ? `<span class="mc-dot-more">+${wins - 2}</span>` : '';
      const modeShut = !this.modeOpen(this.mode);
      const card = button(`xg-card mc-opp-card${locked ? ' is-locked' : ''}${modeShut ? ' is-modeshut' : ''}${this.pick === lvl && !modeShut ? ' is-on' : ''}`, `
        <span class="mc-opp-card__head"></span>
        <span class="mc-opp-card__txt"><b>${op.name}</b><span>${op.title} · 第 ${lvl} 关</span><span class="mc-dots" data-testid="dots-${lvl}">${dots}${extra}</span></span>
        ${locked ? `<span class="mc-opp-card__lock">${icon('lock')}</span>` : ''}`, () => this.choose(lvl, locked), `opp-${lvl}`);
      abs(card, cardRect(k));
      if (!portrait) card.classList.add('is-col');
      this.el.appendChild(card);
      const host = card.querySelector<HTMLElement>('.mc-opp-card__head')!;
      this.heads.push(mountOpponent(host, lvl, ph ? (portrait ? Math.min(76, pH - 12) : Math.min(96, lH - 120)) : portrait ? 120 : 150, locked ? 'idle' : this.pick === lvl ? 'happy' : 'idle'));
    });

    // start
    // start (a flag, not crossed swords: those read as ✕) — or, while the mode is shut, a lock card that
    // names the lesson that opens it instead of a greyed button under a lit opponent (QA r1)
    const startRect = ph
      ? portrait ? { x: 70, y: H - 6 - 58, w: W - 76, h: 58 } : { x: W - 6 - sr - 280, y: H - 6 - 58, w: 280, h: 58 }
      : portrait ? { x: 255, y: 1080 - 16 - 96, w: 400, h: 76 } : { x: 600, y: 810 - 16 - 84, w: 400, h: 76 };
    if (this.modeOpen(this.mode)) {
      const start = button('xg-btn xg-btn--primary xg-btn--lg mc-start', `${mcIcon('flag')}<span>开始演习</span>`, () => this.start(), 'ladder-start');
      abs(start, startRect);
      start.disabled = !this.pick || this.pick > open;
      this.el.appendChild(start);
    } else {
      const les = LESSONS.find((l) => l.id === MODE_LESSON[this.mode as LadderMode]);
      const lock = button('mc-modelock', `<span class="mc-modelock__ico">${icon('lock')}</span><span class="mc-modelock__t">学完<b>${les?.title ?? ''}</b>就开放</span>`, () => this.start(), 'ladder-start');
      abs(lock, startRect);
      this.el.appendChild(lock);
    }

    if (ph) {
      this.phoneFoot(portrait ? { lift: 58 + 6 } : { right: 280 + 8 });
      if (!portrait) this.caption.el.style.bottom = '6px';
      return;
    }
    const gh = div('');
    if (portrait) {
      abs(gh, { x: 24, y: 1080 - 16 - 120, w: 110, h: 120 });
      abs(this.caption.el, { x: 30, y: 1080 - 16 - 96 - 100, w: 750, h: 84 });
    } else {
      abs(gh, { x: 24, y: 810 - 16 - 110, w: 90, h: 110 });
      abs(this.caption.el, { x: 124, y: 810 - 16 - 84, w: 460, h: 76 });
    }
    this.el.append(gh, this.caption.el);
    this.placeGuide(gh, portrait ? 110 : 90);
    void H;
  }

  private switchMode(id: LadderMode): void {
    const m = MODES.find((x) => x.id === id)!;
    if (!this.modeOpen(id)) {
      this.app.play('ui-locked');
      void this.say('mc.lad.lockedmode', 'thinking');
      this.render();
      return;
    }
    this.app.play('ui-select');
    this.mode = id;
    this.pick = this.open() as Level;
    void this.say(m.line);
    this.render();
  }

  private choose(lvl: Level, locked: boolean): void {
    if (locked) {
      this.app.play('ui-locked');
      void this.say('mc.lad.locked', 'thinking');
      return;
    }
    this.app.play('ui-select');
    this.pick = lvl;
    void this.say(OPPONENTS[lvl - 1].line);
    this.render();
  }

  private start(): void {
    if (!this.pick || !this.modeOpen(this.mode)) return;
    this.app.play('ui-confirm');
    const m = newLadderMatch(this.app.save, this.mode, this.pick, { free: this.free });
    if (this.mode === 'fan') this.app.go({ name: 'match', setup: m });
    else this.app.go({ name: 'deploy', next: { match: m, who: 'kid' } });
  }

  destroy(): void {
    for (const h of this.heads) h.destroy();
    super.destroy();
  }
}
