/**
 * S13 勋章柜 (spec §2.5, §5.4, §5.5): the nine shoulder boards (earned ones lit, the current one
 * ringed in gold, the next ones as dark silhouettes) and the twelve knowledge cards (3 × 4 portrait,
 * 4 × 3 landscape). A card he owns opens large and reads its line; a locked card shows how it is
 * earned (an icon) and stays quiet. Never a random drop, never a "missing" count.
 */
import { icon } from '@kit/ui';
import type { App } from '../app';
import { CARDS, type KnowledgeCard } from '../content';
import { modeShown } from '../core/progress';
import { EASE, d } from '../view/anim';
import { cardArt } from '../view/knowledge-art';
import { mcIcon, type McIcon } from '../view/icons';
import { RANK_NAMES, insignia } from '../view/insignia';
import { BaseScreen, abs, button, div } from './base';

const HOW: Record<string, McIcon> = {
  'bomb-trade': 'bomb', 'camp-save': 'tent', 'flag-capture': 'flag', 'ladder-an': 'whistle', 'ladder-fan': 'hands', family: 'hands', 'physical-game': 'hands',
};

export class MedalsScreen extends BaseScreen {
  readonly name = 'medals';

  constructor(app: App) {
    super(app);
    this.bag.timeout(() => void this.say('mc.home.medals'), 300);
  }

  back(): boolean {
    this.app.go({ name: 'home' });
    return true;
  }

  readonly phoneReady = true;

  protected render(): void {
    const portrait = this.o === 'portrait', st = this.safeTop;
    const ph = this.phone;
    const W = ph ? this.W : portrait ? 810 : 1080, H = this.H, tb = this.app.topBand, col = this.phoneCol, sr = this.app.safeR;
    this.el.replaceChildren();
    this.el.classList.add('mc-medals');
    const title = div('mc-h1 mc-center', '勋章柜');
    if (ph) this.phoneTitle(title);
    else {
      abs(title, { x: 100, y: st + 10, w: W - 200, h: 56 });
      this.el.appendChild(title);
    }
    const rank = this.app.save.firstRun.ft ? this.app.save.rank : -1;
    const cab = div('mc-cabinet');
    // phones: the cabinet fills the area above the foot (portrait) / right of the 🏠 column (landscape);
    // shoulder boards wrap in rows (5 + 4 / 3 × 3) above / beside the cards
    const foot = H - 6 - 72 - 6;
    const pCab = portrait ? { x: 4, y: tb - 4, w: W - 8, h: foot - tb + 4 } : { x: col + 4, y: 50, w: W - col - 10 - sr, h: H - 56 };
    const pRail = portrait ? { x: pCab.x + 6, y: pCab.y + 6, w: pCab.w - 12, h: 150 } : { x: pCab.x + 8, y: pCab.y + 8, w: 222, h: pCab.h - 16 };
    const pBox = portrait ? { x: pCab.x + 10, y: pRail.y + pRail.h + 8, w: pCab.w - 20, h: pCab.y + pCab.h - (pRail.y + pRail.h + 8) - 10 } : { x: pRail.x + pRail.w + 10, y: pCab.y + 10, w: pCab.x + pCab.w - (pRail.x + pRail.w + 10) - 10, h: pCab.h - 20 };
    if (ph) abs(cab, pCab);
    else abs(cab, portrait ? { x: 12, y: st + 68, w: 786, h: 1080 - st - 68 - 130 } : { x: 8, y: st + 64, w: 1064, h: 810 - st - 64 - 112 });
    this.el.appendChild(cab);

    // shoulder boards
    const rail = div(`mc-ranks${ph ? ' is-wrap' : portrait ? '' : ' is-col'}`);
    rail.dataset.testid = 'ranks';
    RANK_NAMES.forEach((n, r) => {
      const st2 = r < rank ? 'is-done' : r === rank ? 'is-cur' : 'is-next';
      const b = button(`mc-rankcell ${st2}`, `${insignia(r, ph ? 46 : portrait ? 118 : 92)}<span>${r <= rank ? n : ''}</span>`, () => {
        this.app.play(r <= rank ? 'ui-tap' : 'ui-locked');
        if (r <= rank) void this.say(`mc.w.${n}`);
      }, `rank-${r}`);
      rail.appendChild(b);
    });
    // QA r2: shoulder boards readable (≥ 64 px): 2 rows in portrait, a wider column in landscape
    abs(rail, ph ? pRail : portrait ? { x: 22, y: st + 76, w: 766, h: 186 } : { x: 18, y: st + 72, w: 206, h: 810 - st - 72 - 124 });
    this.el.appendChild(rail);

    // knowledge cards
    const grid = div('mc-kcards');
    grid.dataset.testid = 'cards';
    // a card earned only in a mode that is not offered (裁判 = the ladder 暗棋) shows once it is owned
    const cards = CARDS.filter((c) => !(c.unlock.kind === 'event' && c.unlock.id === 'ladder-an' && !modeShown('an')) || this.app.save.cards.includes(c.id));
    const cols = ph ? (portrait ? 4 : 4) : portrait ? 3 : 4;
    const box = ph ? pBox : portrait ? { x: 28, y: st + 272, w: 754, h: 1080 - st - 272 - 146 } : { x: 236, y: st + 76, w: 820, h: 810 - st - 76 - 124 };
    const gap = ph ? 8 : 14;
    const cw = (box.w - (cols - 1) * gap) / cols;
    const rows = Math.ceil(cards.length / cols);
    const ch = Math.min((box.h - (rows - 1) * gap) / rows, cw * 0.86);
    cards.forEach((c, k) => {
      const own = this.app.save.cards.includes(c.id);
      const how = c.unlock.kind === 'lesson' ? `<span class="mc-kcard__how">${icon('book')}<b>${c.unlock.id === 'F' ? '翻' : c.unlock.id.slice(1)}</b></span>` : `<span class="mc-kcard__how">${mcIcon(HOW[c.unlock.id] ?? 'star')}</span>`;
      const b = button(`mc-kcard${own ? ' is-own' : ' is-locked'}`, own ? `${cardArt(c.art, Math.round(ch * 0.62))}<b class="mc-kcard__t">${c.title}</b>` : `<span class="mc-kcard__sil">${cardArt(c.art, Math.round(ch * 0.62))}</span>${how}<span class="mc-kcard__lock">${icon('lock')}</span>`, () => this.openCard(c, own), `kcard-${c.id}`);
      // the last, shorter row is centred
      const row = Math.floor(k / cols), inRow = Math.min(cols, cards.length - row * cols);
      const rx = box.x + ((cols - inRow) * (cw + gap)) / 2;
      abs(b, { x: rx + (k % cols) * (cw + gap), y: box.y + row * (ch + gap), w: cw, h: ch });
      this.el.appendChild(b);
    });

    if (ph) {
      this.phoneFoot();
      return;
    }
    const gh = div('');
    if (portrait) {
      abs(gh, { x: 24, y: 1080 - 16 - 120, w: 110, h: 120 });
      abs(this.caption.el, { x: 150, y: 1080 - 16 - 96, w: 636, h: 84 });
    } else {
      abs(gh, { x: 186, y: 810 - 16 - 104, w: 96, h: 104 });
      abs(this.caption.el, { x: 296, y: 810 - 16 - 84, w: 768, h: 76 });
    }
    this.el.append(gh, this.caption.el);
    this.placeGuide(gh, portrait ? 110 : 96);
  }

  private openCard(c: KnowledgeCard, own: boolean): void {
    if (!own) {
      this.app.play('ui-locked');
      return;
    }
    this.app.play('ui-open');
    const portrait = this.o === 'portrait';
    const scrim = div('mc-scrim');
    scrim.dataset.testid = 'card-big';
    const card = div('mc-kbig', `${cardArt(c.art, portrait ? 330 : 300)}<h2>${c.title}</h2><p>${this.app.voice.text(c.line)}</p>`);
    card.appendChild(button('xg-iconbtn mc-kbig__close', icon('close'), () => close(), 'card-close'));
    abs(card, portrait ? { x: 105, y: 190, w: 600, h: 640 } : { x: 260, y: 60, w: 560, h: 620 });
    scrim.appendChild(card);
    const close = (): void => {
      this.app.play('ui-close');
      this.app.voice.stop();
      scrim.remove();
    };
    scrim.addEventListener('click', (e) => {
      if (e.target === scrim) close();
    });
    this.el.appendChild(scrim);
    card.animate([{ transform: 'scale(.6) rotate(-4deg)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: d(320), easing: EASE.back });
    void this.say(c.line);
  }
}
