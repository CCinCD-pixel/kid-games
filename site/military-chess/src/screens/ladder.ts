/**
 * S9 对战天梯 (spec §2.5, §4.4): three mode tabs (翻翻棋 / 明棋 / 暗棋; a mode opens with its lesson)
 * and four robot opponents per mode. Two wins open the next robot (handicap / undo wins count; the
 * dots show 让 / 悔). Tap a robot → it is introduced (mc.opp.N) and selected; 开始 starts the game
 * (明棋 / 暗棋 go through 布阵 first). `free` = Dad vs the computer: every mode and robot, nothing booked.
 */
import { icon, segmented } from '@kit/ui';
import type { App } from '../app';
import type { Mode } from '../core/state';
import { MODE_LESSON, ladderModeUnlocked, ladderOpen, type LadderMode } from '../core/progress';
import { LESSONS } from '../content';
import { newLadderMatch } from '../ctrl/ladder';
import type { Level } from '../ai/levels';
import { mcIcon } from '../view/icons';
import { mountOpponent, OPPONENTS } from '../view/hats';
import type { Companion } from '@kit/companion';
import { BaseScreen, abs, button, div } from './base';

const MODES: Array<{ id: LadderMode; label: string; line: string; lesson: string }> = [
  { id: 'fan', label: '翻翻棋', line: 'mc.lad.fan', lesson: 'F' },
  { id: 'ming', label: '明棋', line: 'mc.lad.ming', lesson: 'L7' },
  { id: 'an', label: '暗棋', line: 'mc.lad.an', lesson: 'L8' },
];

export class LadderScreen extends BaseScreen {
  readonly name = 'ladder';
  private mode: LadderMode;
  private pick: Level | null = null;
  private heads: Companion[] = [];
  private free: boolean;

  constructor(app: App, o: { mode?: Mode; free?: boolean } = {}) {
    super(app);
    this.free = !!o.free;
    const firstOpen = MODES.find((m) => this.modeOpen(m.id))?.id ?? 'fan';
    this.mode = o.mode && this.modeOpen(o.mode) ? o.mode : firstOpen;
    const open = this.open();
    this.pick = open as Level;
    this.bag.timeout(() => void this.say('mc.lad.pick'), 300);
  }

  private modeOpen(m: LadderMode): boolean {
    return this.free || ladderModeUnlocked(this.app.save, m);
  }
  private open(): number {
    return this.free ? 4 : ladderOpen(this.app.save, this.mode);
  }

  back(): boolean {
    this.app.go(this.free ? { name: 'family' } : { name: 'home' });
    return true;
  }

  protected render(): void {
    for (const h of this.heads) h.destroy();
    this.heads = [];
    const portrait = this.o === 'portrait';
    const st = this.safeTop;
    const W = portrait ? 810 : 1080, H = portrait ? 1080 : 810;
    this.el.replaceChildren();
    this.el.classList.add('mc-ladder');
    const title = div('mc-h1 mc-center', this.free ? '和电脑下' : '对战');
    abs(title, { x: 100, y: st + 10, w: W - 200, h: 56 });
    this.el.appendChild(title);

    // mode tabs
    const tabs = div('mc-tabs');
    tabs.dataset.testid = 'mode-tabs';
    segmented(tabs, {
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
    abs(tabs, portrait ? { x: 105, y: st + 76, w: 600, h: 64 } : { x: 240, y: st + 72, w: 600, h: 64 });
    this.el.appendChild(tabs);

    // opponent cards
    const open = this.open();
    const t = this.app.save.ladder[this.mode];
    const cardRect = (k: number) => (portrait ? { x: 60, y: st + 160 + k * 170, w: 690, h: 156 } : { x: 32 + k * 258, y: st + 160, w: 244, h: 420 });
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
      this.heads.push(mountOpponent(host, lvl, portrait ? 120 : 150, locked ? 'idle' : this.pick === lvl ? 'happy' : 'idle'));
    });

    // start
    // start (a flag, not crossed swords: those read as ✕) — or, while the mode is shut, a lock card that
    // names the lesson that opens it instead of a greyed button under a lit opponent (QA r1)
    const startRect = portrait ? { x: 255, y: 1080 - 16 - 96, w: 400, h: 76 } : { x: 600, y: 810 - 16 - 84, w: 400, h: 76 };
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
