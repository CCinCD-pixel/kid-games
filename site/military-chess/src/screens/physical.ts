/**
 * S12 实体棋裁判 + S7 交接遮罩 (spec §3.12, §8.3): the family plays 暗棋 with a real board; the iPad
 * only judges collisions. PICK_COLOUR → PICK_ATTACKER → MASK (hand the iPad over; hold 600 ms) →
 * PICK_DEFENDER → VERDICT. The verdict never shows a piece identity. Going to the background (or
 * rotating) during PICK_DEFENDER returns to the mask so the attacker's choice stays secret.
 */
import { icon } from '@kit/ui';
import type { App } from '../app';
import type { Side } from '../core/board';
import { resolve, type Outcome } from '../core/combat';
import { DISPLAY_ORDER, FLAG, MARSHAL, MINE, NAMES } from '../core/pieces';
import { MS, d } from '../view/anim';
import { mcIcon } from '../view/icons';
import { tileSvg } from '../view/pieces-svg';
import { VERDICT } from '../view/referee';
import { BaseScreen, abs, button, div } from './base';

type Step = 'colour' | 'attacker' | 'mask' | 'defender' | 'verdict';

const RES_LINE: Record<Outcome, string> = { A: 'mc.phy.res.att', D: 'mc.phy.res.def', B: 'mc.phy.res.both', F: 'mc.phy.res.flag' };

export class PhysicalScreen extends BaseScreen {
  readonly name = 'physical';
  private step: Step = 'colour';
  private attColour: Side;
  private att = -1;
  private def = -1;
  private verdicts = 0;

  constructor(app: App) {
    super(app);
    this.attColour = app.save.family.lastAttacker;
    this.bag.timeout(() => void this.say('mc.phy.intro', 'happy'), 300);
  }

  back(): boolean {
    this.finishGame(false);
    this.app.go({ name: 'family' });
    return true;
  }

  pause(): void {
    if (this.step === 'defender' || this.step === 'attacker') {
      // never leave a choice on screen while the iPad might change hands
      if (this.step === 'defender') this.step = 'mask';
      this.render();
    }
  }

  layout(o: import('../view/layout').Orientation, safeTop: number): void {
    if (this.step === 'defender') this.step = 'mask'; // rotation while the defender picks → mask first
    super.layout(o, safeTop);
  }

  protected render(): void {
    const portrait = this.o === 'portrait';
    const st = this.safeTop;
    const W = portrait ? 810 : 1080, H = portrait ? 1080 : 810;
    this.el.replaceChildren();
    this.el.classList.add('mc-physical');
    this.el.dataset.step = this.step;
    if (this.step === 'mask') return this.renderMask(W, H);

    // step bar ① ② ③
    const steps = div('mc-steps');
    const idx = this.step === 'colour' || this.step === 'attacker' ? 0 : this.step === 'defender' ? 1 : 2;
    steps.innerHTML = ['进攻方点子', '防守方点子', '结果'].map((t, k) => `<span class="${k === idx ? 'is-on' : k < idx ? 'is-done' : ''}"><b>${k + 1}</b>${t}</span>`).join('');
    abs(steps, { x: 90, y: st + 14, w: W - 180, h: 56 });
    this.el.appendChild(steps);

    const gh = div('');
    if (portrait) {
      abs(gh, { x: 24, y: H - 16 - 120, w: 100, h: 120 });
      abs(this.caption.el, { x: 140, y: H - 16 - 92, w: 646, h: 80 });
    } else {
      abs(gh, { x: 24, y: H - 16 - 116, w: 96, h: 116 });
      abs(this.caption.el, { x: 136, y: H - 16 - 80, w: 760, h: 72 });
    }
    this.el.append(gh, this.caption.el);
    this.placeGuide(gh, portrait ? 100 : 96, { mood: this.step === 'verdict' ? 'surprised' : 'happy' });

    if (this.step === 'colour') {
      const ask = div('mc-h2 mc-center', '谁来进攻？');
      abs(ask, { x: 60, y: st + 110, w: W - 120, h: 50 });
      this.el.appendChild(ask);
      for (const c of [0, 1] as Side[]) {
        const b = button(`mc-colour-btn${this.attColour === c ? ' is-last' : ''}`, `${tileSvg({ side: c, type: 0, shape: 'wide', face: 'back' }, 'mc-tile mc-colour-btn__tile')}<span>${c === 0 ? '红方进攻' : '蓝方进攻'}</span>`, () => {
          this.app.play('ui-select');
          this.attColour = c;
          this.app.save.family.lastAttacker = c;
          this.step = 'attacker';
          void this.say('mc.phy.att');
          this.render();
        }, `att-${c}`);
        b.dataset.c = String(c);
        abs(b, portrait ? { x: 105, y: st + 200 + c * 290, w: 600, h: 250 } : { x: 120 + c * 440, y: st + 150, w: 400, h: 380 });
        this.el.appendChild(b);
      }
      const done = button('xg-btn xg-btn--ghost mc-phy-done', `${icon('check')}<span>这盘下完了</span>`, () => {
        this.finishGame(true);
        this.app.go({ name: 'family' });
      }, 'phy-done');
      abs(done, portrait ? { x: 255, y: st + 790, w: 300, h: 56 } : { x: 900, y: st + 14, w: 168, h: 56 });
      this.el.appendChild(done);
      return;
    }

    if (this.step === 'attacker' || this.step === 'defender') {
      const colour: Side = this.step === 'attacker' ? this.attColour : ((1 - this.attColour) as Side);
      const label = div('mc-h2 mc-center', this.step === 'attacker' ? `${colour === 0 ? '红方' : '蓝方'}进攻：悄悄点你的子` : `${colour === 0 ? '红方' : '蓝方'}防守：悄悄点你的子`);
      abs(label, { x: 40, y: st + 86, w: W - 80, h: 48 });
      this.el.appendChild(label);
      const grid = div('mc-phy-grid');
      const cols = portrait ? 3 : 6;
      const cw = portrait ? 220 : 160, ch = portrait ? 150 : 150, gap = 16;
      const gx = (W - cols * cw - (cols - 1) * gap) / 2, gy = st + 150;
      DISPLAY_ORDER.forEach((t, k) => {
        const disabled = this.step === 'attacker' && (t === MINE || t === FLAG);
        const b = button(`mc-phy-key${disabled ? ' is-off' : ''}`, `${tileSvg({ side: colour, type: t, shape: 'wide', face: 'up' }, 'mc-tile mc-phy-key__tile')}`, () => {
          if (disabled) {
            this.app.play('ui-locked');
            void this.say('mc.ref.immobile', 'thinking');
            return;
          }
          this.app.play('lock-in');
          if (this.step === 'attacker') {
            this.att = t;
            this.step = 'mask';
            this.app.play('mc.handoff');
            void this.say('mc.phy.handoff');
          } else {
            this.def = t;
            this.step = 'verdict';
          }
          this.render();
        }, `key-${t}`);
        b.setAttribute('aria-label', NAMES[t]);
        abs(b, { x: gx + (k % cols) * (cw + gap), y: gy + Math.floor(k / cols) * (ch + gap), w: cw, h: ch });
        grid.appendChild(b);
      });
      this.el.appendChild(grid);
      return;
    }

    // verdict — big words only, never a piece name
    const out = resolve(this.att, this.def);
    const panel = div('mc-panel mc-verdict');
    panel.dataset.testid = 'verdict-panel';
    const main = out === 'A' ? '把<b>防守方</b>的子拿下来' : out === 'D' ? '把<b>进攻方</b>的子拿下来' : out === 'B' ? '<b>两个子</b>都拿下来' : '扛到军旗了，<b>进攻方</b>赢！';
    const marshalDown = out !== 'F' && ((out === 'A' && this.def === MARSHAL) || (out === 'D' && this.att === MARSHAL) || (out === 'B' && (this.att === MARSHAL || this.def === MARSHAL)));
    const downSides: Side[] = [];
    if (marshalDown) {
      if ((out === 'D' || out === 'B') && this.att === MARSHAL) downSides.push(this.attColour);
      if ((out === 'A' || out === 'B') && this.def === MARSHAL) downSides.push((1 - this.attColour) as Side);
    }
    panel.innerHTML = `<div class="mc-verdict__whistle">${mcIcon('whistle')}</div><div class="mc-verdict__badge-slot"></div><p class="mc-verdict__main">${main}</p>${downSides.map((sd) => `<p class="mc-verdict__marshal">${mcIcon('flag')}<b>${sd === 0 ? '红方' : '蓝方'}</b>司令下场了，亮出军旗吧</p>`).join('')}`;
    abs(panel, portrait ? { x: 60, y: st + 150, w: 690, h: 560 } : { x: 140, y: st + 90, w: 800, h: 520 });
    panel.style.opacity = '0';
    this.el.appendChild(panel);
    const again = button('xg-btn xg-btn--primary xg-btn--lg', `${icon('next')}<span>下一次碰子</span>`, () => {
      this.app.play('ui-confirm');
      this.att = this.def = -1;
      this.step = 'colour';
      this.render();
    }, 'phy-next');
    abs(again, portrait ? { x: 155, y: st + 740, w: 500, h: 76 } : { x: 290, y: st + 630, w: 500, h: 76 });
    again.style.opacity = '0';
    this.el.appendChild(again);
    void this.reveal(panel, again, out, downSides.length > 0);
  }

  private async reveal(panel: HTMLElement, again: HTMLElement, out: Outcome, marshal: boolean): Promise<void> {
    this.verdicts++;
    this.app.save.family.physicalVerdicts++;
    this.app.persist();
    this.guide?.mood('surprised');
    this.app.play('mc.whistle');
    await this.bag.wait(d(320));
    this.app.play('mc.reveal');
    await this.bag.wait(d(420));
    this.app.play('chime');
    panel.animate([{ opacity: 0, transform: 'scale(.92)' }, { opacity: 1, transform: 'scale(1)' }], { duration: d(260), easing: 'ease-out', fill: 'forwards' });
    const slot = panel.querySelector<HTMLElement>('.mc-verdict__badge-slot')!;
    const v = VERDICT[out];
    const badge = div('mc-verdict-badge is-static', `${mcIcon(v.icon)}<span>${v.text}</span>`);
    badge.dataset.o = out;
    slot.appendChild(badge);
    badge.animate([{ transform: 'scale(.2)', opacity: 0 }, { transform: 'scale(1.12)', opacity: 1, offset: 0.65 }, { transform: 'scale(1)', opacity: 1 }], { duration: d(420), easing: 'cubic-bezier(.2,1.6,.4,1)', fill: 'forwards' });
    if (out === 'F') this.app.play('mc.flag');
    await this.say(RES_LINE[out]);
    if (marshal) {
      this.app.play('ui-pop-big');
      await this.say('mc.phy.marshal');
    }
    again.animate([{ opacity: 0 }, { opacity: 1 }], { duration: d(MS.snap), fill: 'forwards' });
  }

  private renderMask(W: number, H: number): void {
    const mask = div('mc-mask');
    mask.dataset.testid = 'handoff';
    abs(mask, { x: 0, y: 0, w: W, h: H });
    const def = (1 - this.attColour) as Side;
    mask.innerHTML = `<div class="mc-mask__disc" data-c="${def}">${mcIcon('hands')}</div><p class="mc-h1">交给防守的一方</p><p class="mc-sub">${def === 0 ? '红方' : '蓝方'}准备好了，就按住下面的按钮</p>`;
    const hold = div('mc-hold');
    hold.dataset.testid = 'hold';
    hold.innerHTML = `<svg viewBox="0 0 160 160" aria-hidden="true"><circle cx="80" cy="80" r="70" class="mc-hold__track"/><circle cx="80" cy="80" r="70" class="mc-hold__ring"/></svg><span>按住</span>`;
    mask.appendChild(hold);
    this.el.appendChild(mask);
    mask.animate([{ transform: 'translateY(40px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: d(MS.handoffUp), easing: 'cubic-bezier(.22,1.4,.36,1)' });
    let timer = 0;
    let anim: Animation | null = null;
    const ring = hold.querySelector<SVGCircleElement>('.mc-hold__ring')!;
    const start = (e: PointerEvent) => {
      e.preventDefault();
      this.app.play('ui-press');
      anim = ring.animate([{ strokeDashoffset: '440' }, { strokeDashoffset: '0' }], { duration: d(MS.handoffHold), fill: 'forwards' });
      timer = window.setTimeout(() => {
        this.app.play('mc.handoff');
        this.step = 'defender';
        void this.say('mc.phy.def');
        this.render();
      }, d(MS.handoffHold));
    };
    const stop = () => {
      clearTimeout(timer);
      anim?.cancel();
    };
    hold.addEventListener('pointerdown', start);
    hold.addEventListener('pointerup', stop);
    hold.addEventListener('pointerleave', stop);
    hold.addEventListener('pointercancel', stop);
    this.bag.on(() => clearTimeout(timer));
    void this.say('mc.phy.ready');
  }

  private finishGame(counted: boolean): void {
    if (this.verdicts > 0 && counted) {
      this.app.save.family.physicalGames++;
      this.app.persist();
      this.app.mark('physical-game', { verdicts: this.verdicts });
    }
    this.verdicts = 0;
  }
}
