/**
 * S14 规则卡 (spec §2.5, §2.7): eight cards paged with ◀ ▶ (and a swipe). Each card: a short rule
 * (≤ 20 characters), a crop of the real board showing it, read aloud when it opens (`mc.rule.N`).
 * The back of each card (翻过来) holds the full rule for grown-ups in small print — not read aloud.
 * Opened from the camp or from a match's ⋯ menu (then 返回 resumes the match).
 */
import { icon } from '@kit/ui';
import { onSwipe as swipe } from '@kit/input';
import type { App } from '../app';
import { EASE, d } from '../view/anim';
import { ruleArt } from '../view/rule-art';
import { BaseScreen, abs, button, div } from './base';
import { phraseWrap } from '../view/phrase';


const TITLES = ['大吃小', '炸弹和地雷', '公路和山界', '行营和大本营', '铁路和工兵', '扛军旗', '布阵', '翻翻棋'];

/** the grown-up version (card back) — standard 陆战棋 as implemented (spec §3) */
const BACKS = [
  '军衔从小到大：工兵 1、排长 2、连长 3、营长 4、团长 5、旅长 6、师长 7、军长 8、司令 9。两子相碰，大的留下，小的下场；一样大一起下场。',
  '炸弹碰到任何子都一起下场（碰到军旗算扛到军旗）；炸弹不能放第一排。地雷不能走；工兵碰地雷，地雷下场；其他子碰地雷，进攻的子下场；炸弹碰地雷一起下场。要去碰一颗看得见的地雷时，参谋会先问一声。',
  '公路（细线）每次走一站。山界只能从左、中、右三个路口通过（中路算铁路）。斜线只连行营。',
  '行营里的子不能被攻击，开局行营必须空着。大本营里的子不能再动；军旗必须放在大本营里。',
  '铁路（粗线）上可以直行任意多站，不能越过别的子，碰到的第一个敌子可以攻击；只有工兵能在铁路上拐弯。',
  '任何能走的子都能扛军旗（工兵、炸弹也行，大官小兵都一样），扛到就立刻获胜，不用扛回家。翻翻棋要先挖光对方 3 颗地雷才能扛。司令下场后，它那一方的军旗亮出来。对方没有能走的子也算赢。',
  '军旗在大本营；地雷只能放在最后两排；炸弹不能放在第一排；行营开局要空。一个子来回走最多 4 次。',
  '50 枚子全部背面朝上，第一个翻开的子决定你的颜色；暗子不能被攻击。对方 3 颗地雷全部下场之前，它的军旗不能扛（家规可改）；挖光以后，谁扛到军旗谁立刻获胜。安静 40 步：家庭局和棋，天梯清点兵力。',
];

/** Dad, 2026-10-08: the flag rule in words on the front of the cards that teach it (not read aloud) */
const FRONT_NOTES: Record<number, string> = {
  5: '哪个子扛都一样 · 扛到军旗立刻获胜',
  7: '翻翻棋要先挖光对方地雷，才能扛军旗',
};


export class RulesScreen extends BaseScreen {
  readonly name = 'rules';
  private k: number;
  private flipped = false;
  private swipeOff: (() => void) | null = null;

  constructor(app: App, private from: 'home' | 'match', card = 0) {
    super(app);
    this.k = Math.max(0, Math.min(7, card));
    this.bag.timeout(() => void this.say(`mc.rule.${this.k + 1}`), 320);
  }

  back(): boolean {
    if (this.from === 'match' && this.app.save.resume) this.app.go({ name: 'match', resume: true });
    else this.app.go({ name: 'home' });
    return true;
  }

  readonly phoneReady = true;

  protected render(): void {
    const portrait = this.o === 'portrait', st = this.safeTop;
    const ph = this.phone;
    const W = ph ? this.W : portrait ? 810 : 1080, H = ph ? this.H : portrait ? 1080 : 810;
    const tb = this.app.topBand, col = this.phoneCol, sr = this.app.safeR;
    this.el.replaceChildren();
    this.el.classList.add('mc-rules');
    const title = div('mc-h1 mc-center', '规则卡');
    const againW = this.from === 'home' ? 172 : 0;
    if (ph) this.phoneTitle(title, againW ? againW + 12 + sr : 0);
    else {
      abs(title, { x: 100, y: st + 10, w: W - 200, h: 56 });
      this.el.appendChild(title);
    }
    // 跳过 never loses the first-time lesson: it replays from here (Dad, 2026-10-08)
    if (this.from === 'home') {
      const again = button('xg-btn xg-btn--ghost mc-cpu-btn mc-ft-again', `${icon('play')}<span>再玩一次开场</span>`, () => {
        this.app.play('ui-open');
        this.app.go({ name: 'ft' });
      }, 'ft-again');
      if (ph) abs(again, { x: W - 6 - sr - againW, y: portrait ? Math.round(tb - (8 + 28) / (this.app.scale || 1) - 27) : 4, w: againW, h: 54 });
      else abs(again, { x: W - 16 - 220, y: st + 10, w: 220, h: 56 });
      this.el.appendChild(again);
    }

    // phones: the card fills the area between the band and the paging row (portrait). Landscape (QA fb1 r2
    // major): it ends above the narration strip — the guide and the caption bubble bottom-left, 70 units
    // tall — so a line being read never covers 翻过来; the page dots move into the card's title row.
    const pland = ph && !portrait;
    const foot = H - 6 - 72 - 6;
    // landscape: the card starts under the title box (phoneTitle: 62 units on a 390-high phone, more on a smaller one)
    const top = Math.max(62, Math.round(tb - 36 / (this.app.scale || 1) + 22));
    const pc = portrait ? { x: 8, y: tb, w: W - 16, h: foot - 60 - tb } : { x: col + 4 + 62, y: top, w: W - (col + 4 + 62) - 6 - sr - 62, h: H - 6 - 70 - 6 - top };
    const cw = ph ? pc.w : portrait ? 620 : 760, ch = ph ? pc.h : portrait ? 760 : 560;
    const cx = ph ? pc.x : (W - cw) / 2, cy = ph ? pc.y : st + 74;
    const card = div(`mc-rulecard${this.flipped ? ' is-back' : ''}`);
    card.dataset.testid = 'rule-card';
    card.dataset.k = String(this.k + 1);
    abs(card, { x: cx, y: cy, w: cw, h: ch });
    const text = this.app.voice.text(`mc.rule.${this.k + 1}`);
    const dotsHtml = Array.from({ length: 8 }, (_, i) => `<i class="${i === this.k ? 'is-cur' : ''}"></i>`).join('');
    const head = `<div class="mc-rulecard__n">${this.k + 1}</div>${pland ? `<div class="mc-ruledots is-in" data-testid="rule-dots">${dotsHtml}</div>` : ''}<h2>${TITLES[this.k]}</h2>`;
    if (!this.flipped) {
      const note = FRONT_NOTES[this.k] ? `<p class="mc-rulecard__front-note" data-testid="rule-note">${FRONT_NOTES[this.k].split(' · ').map((t) => phraseWrap(t)).join(' · ')}</p>` : '';
      if (pland) {
        // the art fills the row under the title (never up into it); the words, the note and 翻过来 beside it
        const ah = ch - 56;
        const aw = Math.min(Math.round(ah * 1.48), Math.round((cw - 42) * (cw < 560 ? 0.5 : 0.55)));
        card.innerHTML = `${head}<div class="mc-rulecard__art">${ruleArt(this.k + 1, aw, ah)}</div><div class="mc-rulecard__side"><p class="mc-rulecard__t">${phraseWrap(text)}</p>${note}</div>`;
        card.classList.add('is-row', 'is-pland');
        card.style.gridTemplateColumns = `${aw}px minmax(0, 1fr)`;
      } else {
        const art = ph ? ruleArt(this.k + 1, cw - 28, Math.round(Math.min(290, ch * 0.56))) : portrait ? ruleArt(this.k + 1, cw - 60, 440) : ruleArt(this.k + 1, 440, 400);
        card.innerHTML = `${head}<div class="mc-rulecard__art">${art}</div><p class="mc-rulecard__t">${phraseWrap(text)}</p>${note}`;
        if (!portrait) card.classList.add('is-row');
      }
    } else {
      const back = `<p class="mc-rulecard__back">${BACKS[this.k]}</p>`;
      const fine = '<p class="mc-rulecard__note">谜题和残局永远按标准规则；家规在家长面板里改。</p>';
      card.innerHTML = pland ? `${head}${back}<div class="mc-rulecard__foot">${fine}</div>` : `${head}${back}${fine}`;
      if (pland) card.classList.add('is-pland');
    }
    const flipBtn = button('xg-btn xg-btn--ghost mc-rulecard__flip', `${icon('swap')}<span>${this.flipped ? '翻回来' : '翻过来'}</span>`, () => this.flip(), 'rule-flip');
    // a finger-sized target on the smallest landscape phone too (44 CSS px, the stage is scaled)
    if (pland) flipBtn.style.minHeight = `${Math.ceil(44 / (this.app.scale || 1))}px`;
    (card.querySelector('.mc-rulecard__side, .mc-rulecard__foot') ?? card).appendChild(flipBtn);
    card.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('button')) return;
      if (!this.flipped) void this.say(`mc.rule.${this.k + 1}`);
    });
    this.el.appendChild(card);
    this.swipeOff?.();
    this.swipeOff = swipe(card, (dir) => {
      if (dir === 'left') this.page(1);
      if (dir === 'right') this.page(-1);
    });

    // paging
    const prev = button('xg-iconbtn mc-page-btn', icon('back'), () => this.page(-1), 'rule-prev');
    const next = button('xg-iconbtn mc-page-btn', icon('next'), () => this.page(1), 'rule-next');
    prev.disabled = this.k === 0;
    next.disabled = this.k === 7;
    const dots = div('mc-ruledots', dotsHtml);
    if (ph && portrait) {
      abs(prev, { x: 8, y: cy + ch + 4, w: 54, h: 54 });
      abs(next, { x: W - 8 - 54, y: cy + ch + 4, w: 54, h: 54 });
      abs(dots, { x: 70, y: cy + ch + 19, w: W - 140, h: 24 });
    } else if (ph) {
      abs(prev, { x: col + 4, y: cy + ch / 2 - 27, w: 54, h: 54 });
      abs(next, { x: W - 6 - sr - 54, y: cy + ch / 2 - 27, w: 54, h: 54 });
    } else if (portrait) {
      abs(prev, { x: 24, y: cy + ch + 20, w: 72, h: 72 });
      abs(next, { x: W - 24 - 72, y: cy + ch + 20, w: 72, h: 72 });
      abs(dots, { x: 120, y: cy + ch + 44, w: W - 240, h: 24 });
    } else {
      abs(prev, { x: 24, y: cy + ch / 2 - 36, w: 72, h: 72 });
      abs(next, { x: W - 24 - 72, y: cy + ch / 2 - 36, w: 72, h: 72 });
      abs(dots, { x: cx, y: cy + ch + 14, w: cw, h: 24 });
    }
    this.el.append(prev, next);
    if (!pland) this.el.appendChild(dots);
    if (ph) {
      this.phoneFoot(portrait ? {} : { x: cx });
      return;
    }

    const gh = div('');
    if (portrait) {
      abs(gh, { x: 24, y: H - 16 - 110, w: 100, h: 110 });
      abs(this.caption.el, { x: 140, y: H - 16 - 92, w: 646, h: 80 });
    } else {
      abs(gh, { x: 24, y: H - 16 - 100, w: 90, h: 100 });
      abs(this.caption.el, { x: 130, y: H - 16 - 80, w: 820, h: 72 });
    }
    this.el.append(gh, this.caption.el);
    this.placeGuide(gh, portrait ? 100 : 90);
  }

  destroy(): void {
    this.swipeOff?.();
    super.destroy();
  }

  private flip(): void {
    this.app.play('flip');
    this.flipped = !this.flipped;
    this.render();
    const card = this.el.querySelector<HTMLElement>('.mc-rulecard');
    card?.animate([{ transform: 'perspective(1200px) rotateY(80deg)', opacity: 0.6 }, { transform: 'none', opacity: 1 }], { duration: d(260), easing: EASE.out });
    if (!this.flipped) void this.say(`mc.rule.${this.k + 1}`);
    else this.app.voice.stop();
  }

  private page(dir: number): void {
    const k = this.k + dir;
    if (k < 0 || k > 7) {
      this.app.play('bump');
      return;
    }
    this.app.play('ui-slide');
    this.k = k;
    this.flipped = false;
    this.render();
    const card = this.el.querySelector<HTMLElement>('.mc-rulecard');
    card?.animate([{ transform: `translateX(${dir * 80}px)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: d(240), easing: EASE.out });
    void this.say(`mc.rule.${this.k + 1}`);
  }
}
