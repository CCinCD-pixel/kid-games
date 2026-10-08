/**
 * S11 和爸爸下 (spec §2.5c): mode (明棋 / 翻翻棋 / 暗棋 with real pieces → S12), seating (并排 / 对坐),
 * who moves first, Dad's handicap (司令 / 军长 / 师长 / 炸弹), then deploy (明棋) or straight to the match.
 * Dad, 2026-10-08: the family only plays 翻翻棋 — only the modes in PLAY_MODES are shown (明棋 / the
 * 实体棋裁判 stay in the code); with a single mode the three cards become one 翻翻棋 banner.
 */
import { getSettings } from '@kit/settings';
import { icon } from '@kit/ui';
import { RED } from '../core/board';
import { modeShown } from '../core/progress';
import { newMatchId, type SavedMatch } from '../ctrl/save';
import { art, type ArtId } from '../view/cards-art';
import { mcIcon } from '../view/icons';
import { tileSvg } from '../view/pieces-svg';
import { BaseScreen, abs, button, div } from './base';

type FamMode = 'ming' | 'fan' | 'physical';
const MODES: Array<{ id: FamMode; title: string; sub: string; art: ArtId }> = [
  { id: 'ming', title: '明棋', sub: '摆好阵，都看得见', art: 'ming' },
  { id: 'fan', title: '翻翻棋', sub: '翻开才知道是谁', art: 'fan' },
  { id: 'physical', title: '暗棋', sub: '用真棋，我当裁判', art: 'physical' },
];
/** 实体棋裁判 is the family 暗棋 */
const famShown = (m: FamMode): boolean => modeShown(m === 'physical' ? 'an' : m);
const SHOWN = MODES.filter((m) => famShown(m.id));
const HANDICAP: Array<{ code: string; type: number }> = [
  { code: '9', type: 11 },
  { code: '8', type: 10 },
  { code: '7', type: 9 },
  { code: 'B', type: 2 },
];

export class FamilyScreen extends BaseScreen {
  readonly name = 'family';
  private mode: FamMode;
  private seating: 'side' | 'face';
  private first: 'kid' | 'dad';
  private handicap = new Set<string>();

  constructor(app: import('../app').App) {
    super(app);
    const f = app.save.family;
    // an older save may remember 明棋: fall back to the first mode still offered
    this.mode = famShown(f.lastMode) ? f.lastMode : SHOWN[0].id;
    this.seating = f.seating;
    this.first = f.firstMover;
    this.bag.timeout(() => void this.say(SHOWN.length > 1 ? 'mc.fam.mode' : 'mc.fam.intro'), 300);
  }

  back(): boolean {
    this.app.go({ name: 'home' });
    return true;
  }

  readonly phoneReady = true;

  protected render(): void {
    const portrait = this.o === 'portrait';
    const st = this.safeTop;
    this.el.replaceChildren();
    this.el.classList.add('mc-family');
    const ph = this.phone;
    const W = ph ? this.W : portrait ? 810 : 1080, H = this.H, tb = this.app.topBand, sr = this.app.safeR, col = this.phoneCol;
    const title = div('mc-h1 mc-center', '和爸爸下');
    if (ph) this.phoneTitle(title);
    else {
      abs(title, { x: 100, y: st + 14, w: W - 200, h: 56 });
      this.el.appendChild(title);
    }
    // phones: the banner card, the options and 和电脑下 stacked (portrait) / two columns (landscape)
    const pBanner = portrait ? { x: 8, y: tb, w: W - 16, h: 104 } : { x: col + 4, y: 56, w: Math.round((W - col - 10 - sr) * 0.44), h: 140 };
    const pOpts = portrait ? { x: 8, y: tb + 104 + 10, w: W - 16, h: 196 } : { x: pBanner.x + pBanner.w + 10, y: 56, w: W - sr - 6 - (pBanner.x + pBanner.w + 10), h: H - 56 - 6 - 58 - 10 };
    const pCpu = portrait ? { x: 8, y: pOpts.y + pOpts.h + 10, w: W - 16, h: 56 } : { x: pBanner.x, y: pBanner.y + pBanner.h + 10, w: pBanner.w, h: 56 };
    // 和电脑下 (spec §2.5c item 6): Dad against any robot in any mode; nothing is booked for the child
    const cpu = button('xg-btn xg-btn--ghost mc-cpu-btn', `${icon('robot')}<span>和电脑下</span>`, () => {
      this.app.play('ui-open');
      this.app.go({ name: 'ladder', free: true, mode: this.mode === 'ming' ? 'ming' : 'fan' });
    }, 'cpu');
    abs(cpu, ph ? pCpu : portrait ? { x: W - 16 - 180, y: st + 14, w: 180, h: 56 } : { x: W - 16 - 190, y: st + 14, w: 190, h: 56 });
    this.el.appendChild(cpu);

    // mode cards (one mode → one wide banner card, nothing to choose)
    const one = SHOWN.length === 1;
    const n = SHOWN.length;
    const cw = one ? (portrait ? 738 : 800) : portrait ? 240 : 300, ch = one ? (portrait ? 190 : 150) : portrait ? 250 : 216, gap = portrait ? 21 : 24;
    const x0 = (W - n * cw - (n - 1) * gap) / 2, y0 = st + 86;
    SHOWN.forEach((m, k) => {
      const b = button(`xg-card mc-mode-card${this.mode === m.id ? ' is-on' : ''}`, `<span class="mc-camp-card__art">${art(m.art, portrait ? 120 : 104)}</span><span class="mc-camp-card__title">${m.title}</span><span class="mc-camp-card__sub">${m.sub}</span>${this.mode === m.id ? `<span class="mc-check">${icon('check')}</span>` : ''}`, () => {
        this.app.play('ui-select');
        this.mode = m.id;
        if (one) {
          void this.say('mc.lad.fan');
          return;
        }
        if (m.id === 'physical') {
          void this.say('mc.phy.intro');
          this.app.save.family.lastMode = this.app.save.family.lastMode;
          this.app.go({ name: 'physical' });
          return;
        }
        this.render();
      }, `mode-${m.id}`);
      abs(b, ph && one ? pBanner : { x: x0 + k * (cw + gap), y: y0, w: cw, h: ch });
      if (one) {
        b.classList.add('is-banner');
        b.querySelector('.mc-check')?.remove();
        // phones: two short lines instead of a stray "就赢" on its own
        b.querySelector('.mc-camp-card__sub')!.innerHTML = ph ? '翻开才知道是谁<br>扛到军旗就赢' : '翻开才知道是谁 · 扛到军旗就赢';
      }
      this.el.appendChild(b);
    });

    // options panel
    const panel = div('mc-panel mc-fam-opts');
    const py = y0 + ch + 24;
    const pnh = portrait ? 1080 - py - 16 - 96 - 16 - 130 : 810 - 16 - 76 - 14 - py;
    abs(panel, ph ? pOpts : portrait ? { x: 36, y: py, w: 738, h: pnh } : { x: 140, y: py, w: 800, h: pnh });
    this.el.appendChild(panel);
    const kid = getSettings().displayName;
    const dad = this.app.save.family.dadName;
    const row = (label: string, ico: string, content: HTMLElement) => {
      const r = div('mc-opt-row');
      r.innerHTML = `<span class="mc-opt-row__label">${ico}<b>${label}</b></span>`;
      r.appendChild(content);
      panel.appendChild(r);
    };
    // seating
    const seat = div('mc-seg');
    for (const [id, label, ico] of [['side', '并排坐', 'hands'], ['face', '面对面', 'swap']] as const) {
      seat.appendChild(button(`mc-seg__b${this.seating === id ? ' is-on' : ''}`, `${mcIcon(ico)}<span>${label}</span>`, () => {
        this.app.play('ui-toggle-on');
        this.seating = id;
        if (id === 'face') void this.say('mc.fam.facetoface');
        this.render();
      }, `seat-${id}`));
    }
    row('坐法', mcIcon('hands'), seat);
    // first mover
    const first = div('mc-seg');
    for (const [id, label] of [['kid', `${kid}先`], ['dad', `${dad}先`]] as const) {
      first.appendChild(button(`mc-seg__b${this.first === id ? ' is-on' : ''}`, `<span>${label}</span>`, () => {
        this.app.play('ui-toggle-on');
        this.first = id;
        void this.say(id === 'kid' ? 'mc.fam.first.kid' : 'mc.fam.first.dad');
        this.render();
      }, `first-${id}`));
    }
    row('谁先走', icon('play'), first);
    // handicap (Dad removes pieces from his own side)
    const hc = div('mc-chips');
    for (const h of HANDICAP) {
      const on = this.handicap.has(h.code);
      hc.appendChild(button(`mc-chip${on ? ' is-on' : ''}`, `${tileSvg({ side: 1, type: h.type, shape: 'wide', face: 'up' }, 'mc-tile mc-chip__tile')}${on ? `<span class="mc-chip__x">${icon('close')}</span>` : ''}`, () => {
        this.app.play(on ? 'ui-toggle-off' : 'ui-toggle-on');
        if (on) this.handicap.delete(h.code);
        else this.handicap.add(h.code);
        if (!on) void this.say('mc.fam.handicap');
        this.render();
      }, `hc-${h.code}`));
    }
    if (this.mode === 'ming') row(`${dad}让子`, icon('minus'), hc);

    // guide + caption + start
    if (ph) {
      const start = button('xg-btn xg-btn--primary xg-btn--lg mc-start', `${icon('play')}<span>开始</span>`, () => this.start(), 'start');
      const sw = portrait ? W - 76 : 260;
      abs(start, { x: W - 6 - sr - sw, y: H - 6 - 58, w: sw, h: 58 });
      this.el.appendChild(start);
      this.phoneFoot(portrait ? { lift: 58 + 6 } : { right: sw + 8 });
      return;
    }
    const gh = div('');
    if (portrait) {
      abs(gh, { x: 24, y: 1080 - 16 - 96 - 16 - 120, w: 110, h: 120 });
      abs(this.caption.el, { x: 150, y: 1080 - 16 - 96 - 16 - 100, w: 636, h: 84 });
    } else {
      abs(gh, { x: 20, y: 810 - 16 - 100, w: 84, h: 100 });
      abs(this.caption.el, { x: 116, y: 810 - 16 - 76, w: 548, h: 76 });
    }
    this.el.append(gh, this.caption.el);
    this.placeGuide(gh, portrait ? 110 : 84);
    const start = button('xg-btn xg-btn--primary xg-btn--lg mc-start', `${icon('play')}<span>开始</span>`, () => this.start(), 'start');
    abs(start, portrait ? { x: 205, y: 1080 - 16 - 96, w: 400, h: 76 } : { x: 680, y: 810 - 16 - 76 - 8, w: 260, h: 76 });
    this.el.appendChild(start);
  }

  private start(): void {
    this.app.play('ui-confirm');
    const f = this.app.save.family;
    f.seating = this.seating;
    f.firstMover = this.first;
    if (this.mode !== 'physical') f.lastMode = this.mode;
    this.app.persist();
    const id = newMatchId();
    const handicap = [...this.handicap].join('');
    const firstMover = this.first === 'kid' ? RED : 1;
    const setup: SavedMatch = {
      v: 1,
      id,
      mode: this.mode === 'fan' ? 'fan' : 'ming',
      setup: this.mode === 'fan' ? { firstMover: RED, fanSeed: `mc:fan:${id}`, firstPlayer: firstMover as 0 | 1 } : { firstMover: firstMover as 0 | 1, handicap: handicap ? { red: '', blue: handicap } : undefined },
      actions: [],
      opponent: { kind: 'family', seating: this.seating, names: [getSettings().displayName, f.dadName] },
      kidSide: RED,
      kidSeat: 'near',
      tags: {},
      hints: 0,
      coachWarnings: 0,
      coachOverrides: 0,
      undos: 0,
      startedAt: Date.now(),
      ladder: false,
      house: { fanFlagLock: this.app.save.settings.fanFlagRule !== 'easy', quietLimit: this.mode === 'ming' ? this.app.save.settings.familyQuiet : undefined, shuttleMax: this.app.save.settings.shuttleMax },
    };
    if (this.mode === 'fan') this.app.go({ name: 'match', setup });
    else this.app.go({ name: 'deploy', next: { match: setup, who: 'kid' } });
  }
}
