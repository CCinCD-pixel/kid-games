/**
 * S8 结果 + 战报 (spec §2.5, §5.6): own full-screen layout (not showResult). Title + result emblem,
 * three key-moment thumbnails (tap → full replay at that move), and the ways out. Family games end
 * neutrally: two hands, a small star by the winner's name, no confetti (spec §2.5c). Losses never
 * celebrate (jingle-round-over, no confetti). Ladder extras: promotion ceremony (milestone confetti),
 * new knowledge cards, the next opponent unlocked, the handicap offer after 3 losses in a row, and
 * the 暗棋 guess count.
 */
import { confetti, icon } from '@kit/ui';
import type { App } from '../app';
import { BLUE, RED } from '../core/board';
import { BOMB, FLAG, MINE, rankOf } from '../core/pieces';
import { keyMoments, type Moment } from '../core/report';
import type { GameResult, GameState, Mode } from '../core/state';
import type { SavedMatch } from '../ctrl/save';
import { startState } from '../ctrl/setup';
import { newLadderMatch } from '../ctrl/ladder';
import { modeShown } from '../core/progress';
import { CARDS } from '../content';
import { art } from '../view/cards-art';
import { cachedBoardSvg } from '../view/board-svg';
import { mcIcon } from '../view/icons';
import { insignia, RANK_NAMES } from '../view/insignia';
import { boardGeom, stationLocal } from '../view/layout';
import { cardArt } from '../view/knowledge-art';
import { opponentBadge, OPPONENTS } from '../view/hats';
import { promotionCeremony } from '../view/promo';
import { chunkLines, chunksHtml, narrowChunks, phraseWrap } from '../view/phrase';
import { BaseScreen, abs, button, div } from './base';
import type { Rect } from '../view/layout';

export interface ResultData {
  result: GameResult;
  mode: Mode;
  family: boolean;
  names: [string, string];
  kidPlayer: 0;
  winnerPlayer: number;
  match: SavedMatch;
  undos: number;
  /** test positions (?test=1) start from a custom state instead of the saved setup */
  start?: GameState;
  /** the robot (ladder) */
  level?: number;
  promotions?: number[];
  newCards?: string[];
  unlocked?: number | null;
  offer?: 0 | 1 | 2;
  guesses?: { right: number; total: number } | null;
}

const MODE_NAME: Record<Mode, string> = { ming: '明棋', fan: '翻翻棋', an: '暗棋' };

export class ResultScreen extends BaseScreen {
  readonly name = 'result';
  private moments: Moment[];
  private ceremonyDone = false;

  constructor(app: App, private data: ResultData) {
    super(app);
    const kidColour = (s: GameState) => (s.mode === 'fan' ? (s.colorOf[0] === -1 ? RED : s.colorOf[0]) : RED);
    try {
      const start = data.start ?? startState(data.match);
      this.moments = keyMoments(start, data.match.actions, kidColour);
    } catch (err) {
      console.warn('[military-chess] report unavailable', err);
      this.moments = [];
    }
    const r = data.result;
    const kidWon = data.winnerPlayer === 0;
    if (data.family) {
      app.play('ui-confirm');
      this.bag.timeout(() => void this.say('mc.fam.end', 'happy'), 400);
    } else if (kidWon) {
      app.play('jingle-win');
      this.bag.timeout(() => void this.say(r.reason === 'count' ? 'mc.end.count.win' : r.reason === 'no-moves' ? 'mc.end.win.nomoves' : 'mc.end.win', 'celebrating'), 500);
    } else {
      app.play('jingle-round-over');
      const line = r.winner === -1 ? (r.reason === 'count-draw' ? 'mc.end.count.draw' : 'mc.end.draw') : r.reason === 'count' ? 'mc.end.count.lose' : r.reason === 'no-moves' ? 'mc.end.lose.nomoves' : 'mc.end.lose';
      this.bag.timeout(() => void this.say(line, 'encouraging'), 500);
    }
    let t = 2600;
    if (data.guesses) {
      this.bag.timeout(() => void this.say('mc.rep.guess'), t);
      t += 2200;
    }
    if (data.unlocked) {
      this.bag.timeout(() => {
        app.play('unlock');
        void this.say('mc.end.levelup', 'celebrating');
      }, t);
      t += 2000;
    }
    if (data.offer) {
      this.bag.timeout(() => void this.say(data.offer === 2 ? 'mc.end.handicap.2' : 'mc.end.handicap', 'encouraging'), t);
      t += 2400;
    }
    // QA r2: "三个关键时刻" only when there really are three (a quick game shows one or two cards silently)
    if (this.moments.length === 3) this.bag.timeout(() => void this.say('mc.end.report'), t);
    // promotion ceremony first (milestone: confetti allowed)
    if (data.promotions?.length) this.bag.timeout(() => void this.ceremony(data.promotions!), 900);
    else this.ceremonyDone = true;
    // first win over a robot: milestone confetti (spec §2.5 S8)
    if (kidWon && !data.family && data.unlocked && !data.promotions?.length) this.bag.timeout(() => confetti(60), 700);
  }

  back(): boolean {
    this.app.go(this.data.family || this.data.match.free ? { name: 'family' } : { name: 'ladder', mode: this.data.mode });
    return true;
  }

  private titleText(): { title: string; sub: string } {
    const d0 = this.data, r = d0.result;
    const reason = r.reason === 'flag' ? '扛到了军旗' : r.reason === 'no-moves' ? '对方没棋可走了' : r.reason === 'count' ? `清点兵力 ${r.tally![0]} : ${r.tally![1]}` : '';
    if (d0.winnerPlayer === -1) {
      const sub = r.reason === 'agreed' ? '两个人都同意和棋' : r.reason === 'both-immobile' ? '两边都不能走了' : r.reason === 'count-draw' ? `清点兵力 ${r.tally![0]} : ${r.tally![1]}` : '好久没有交手';
      return { title: '和棋', sub };
    }
    if (d0.family) return { title: `${d0.names[d0.winnerPlayer]}赢了`, sub: reason };
    if (d0.winnerPlayer === 0) return { title: '演习胜利', sub: reason };
    const lostSub = r.reason === 'flag' ? '这局对方扛到了军旗' : r.reason === 'no-moves' ? '我们没棋可走了' : r.reason === 'count' ? `清点兵力：${d0.names[1]}多一点` : reason;
    return { title: '这局结束啦', sub: lostSub };
  }

  readonly phoneReady = true;

  protected render(): void {
    const portrait = this.o === 'portrait';
    const st = this.safeTop;
    const ph = this.phone;
    this.el.replaceChildren();
    this.el.classList.add('mc-result');
    const dt = this.data;
    const { title, sub } = this.titleText();
    const head = div('mc-result__head');
    head.dataset.testid = 'result-head';
    const emSize = ph ? 64 : 120;
    const emblem = dt.family ? art('hands', emSize) : dt.winnerPlayer === 0 ? art('flag-gold', emSize) : `<span class="mc-neutral">${mcIcon(dt.winnerPlayer === -1 ? 'hands' : 'shield')}</span>`;
    const names = dt.family
      ? `<div class="mc-result__names">${[0, 1].map((p) => `<span>${p === dt.winnerPlayer ? mcIcon('star', 'mc-winstar') : ''}${dt.names[p]}</span>`).join('<i>·</i>')}</div>`
      : '';
    const opp = dt.level ? `<span class="mc-result__opp">${opponentBadge(dt.level as 1 | 2 | 3 | 4, ph ? 30 : 44)}<b>${OPPONENTS[dt.level - 1].name}</b></span>` : '';
    const rankShown = this.ceremonyDone && !!dt.promotions?.length;
    const rankNow = rankShown ? `<div class="mc-result__rank">${insignia(this.app.save.rank, ph ? 56 : 92)}<b>${RANK_NAMES[this.app.save.rank]}</b></div>` : '';
    // ladder win: the robot's win dots (●●○ → next robot), the new one pops in (QA r1/r2 minor)
    let dotsRow = '';
    if (dt.level && !dt.family && !dt.match.free && dt.winnerPlayer === 0) {
      const wins = this.app.save.ladder[dt.mode].wins[dt.level - 1];
      const dots = [0, 1].map((i) => `<i class="mc-dot${i < Math.min(wins, 2) ? ' is-on' : ''}${i === Math.min(wins, 2) - 1 ? ' is-new' : ''}"></i>`).join('');
      dotsRow = `<div class="mc-dots mc-result__dots" data-testid="result-dots">${dots}${wins > 2 ? `<span class="mc-dot-more">+${wins - 2}</span>` : ''}</div>`;
    }
    // Dad, 2026-10-08: a flag game ends with the rule in words (any piece may take it; it wins at once)
    const lock = dt.mode === 'fan' && (dt.match.house?.fanFlagLock ?? true);
    const ruleLine = this.data.result.reason === 'flag' ? `<p class="mc-rule-line" data-testid="flag-rule">${phraseWrap('扛到军旗立刻获胜')}${lock ? ` · ${phraseWrap('翻翻棋要先挖光对方地雷')}` : ''}</p>` : '';
    // phones: the new shoulder board stands in for the emblem (no room for both)
    const emblemBox = ph && rankShown ? '' : `<div class="mc-result__emblem">${emblem}</div>`;
    head.innerHTML = `${emblemBox}<h1 class="mc-h1" data-testid="result-title">${title}</h1><p class="mc-sub">${phraseWrap(MODE_NAME[dt.mode])}${opp ? ' · ' : ''}${opp}${sub ? ' · ' + phraseWrap(sub) : ''}</p>${ruleLine}${dotsRow}${names}${rankNow}`;
    if (!portrait) head.classList.add('is-col');
    this.el.appendChild(head);
    if (ph) {
      this.renderPhone(head);
      return;
    }
    abs(head, portrait ? { x: 60, y: st + 24, w: 690, h: 290 } : { x: 16, y: st + 40, w: 260, h: 520 });

    // key moments
    const strip = div('mc-moments');
    strip.dataset.testid = 'moments';
    const n = Math.max(1, this.moments.length);
    const gap = portrait ? 15 : 16;
    const tw = portrait ? 240 : 250, th = portrait ? 316 : 330;
    const x0 = portrait ? (810 - n * tw - (n - 1) * gap) / 2 : 300 + (764 - n * tw - (n - 1) * gap) / 2;
    const y0 = portrait ? st + 322 : st + 40;
    this.moments.forEach((m, k) => {
      const card = this.momentCard(m, k, tw, phraseWrap(this.app.voice.text(m.line)));
      abs(card, { x: x0 + k * (tw + gap), y: y0, w: tw, h: th });
      strip.appendChild(card);
    });
    this.el.appendChild(strip);

    // info row: guesses, new cards, unlocked opponent, handicap offer
    const info = div('mc-result__info');
    info.dataset.testid = 'result-info';
    const chips: string[] = [];
    if (dt.guesses) chips.push(`<span class="mc-chip-info" data-testid="guesses">${mcIcon('flag')}<b>${dt.guesses.right}</b><i>/</i><b>${dt.guesses.total}</b>${icon('check')}</span>`);
    for (const id of dt.newCards ?? []) {
      const c = CARDS.find((x) => x.id === id);
      if (c) chips.push(`<span class="mc-chip-info is-card" data-card="${id}" role="button" aria-label="新卡片：${c.title}"><em class="mc-chip-info__k">新卡片</em>${cardArt(c.art, 54)}<b>${c.title}</b></span>`);
    }
    if (dt.unlocked && dt.unlocked <= 4) chips.push(`<span class="mc-chip-info is-unlock">${icon('unlock')}${opponentBadge(dt.unlocked as 1 | 2 | 3 | 4, 40)}<b>${OPPONENTS[dt.unlocked - 1].name}</b></span>`);
    info.innerHTML = chips.join('');
    this.cardTaps(info);
    abs(info, portrait ? { x: 30, y: y0 + th + 14, w: 750, h: 78 } : { x: 300, y: y0 + th + 14, w: 764, h: 78 });
    this.el.appendChild(info);

    const acts = this.actions();
    abs(acts, portrait ? { x: 30, y: 1080 - 16 - 76 - 120, w: 750, h: 76 } : { x: 300, y: 810 - 16 - 76, w: 764, h: 76 });
    this.el.appendChild(acts);

    const gh = div('');
    if (portrait) {
      abs(gh, { x: 24, y: 1080 - 16 - 110, w: 100, h: 110 });
      abs(this.caption.el, { x: 140, y: 1080 - 16 - 92, w: 646, h: 80 });
    } else {
      abs(gh, { x: 40, y: 810 - 16 - 236, w: 100, h: 110 });
      abs(this.caption.el, { x: 16, y: 810 - 16 - 120, w: 260, h: 110 });
    }
    this.el.append(gh, this.caption.el);
    this.placeGuide(gh, 100, { mood: dt.family ? 'happy' : dt.winnerPlayer === 0 ? 'celebrating' : 'encouraging' });
  }

  private momentCard(m: Moment, k: number, tw: number, capHtml: string): HTMLButtonElement {
    return button('mc-moment', `${miniBoard(m, tw - 16)}${capHtml ? `<span class="mc-moment__cap">${capHtml}</span>` : ''}`, () => {
      this.app.play('ui-open');
      void this.say(m.line);
      this.app.go({ name: 'review', data: this.data, ply: m.ply });
    }, `moment-${k}`);
  }

  /** a tapped new card says its line */
  private cardTaps(info: HTMLElement): void {
    info.addEventListener('click', (e) => {
      const c = (e.target as HTMLElement).closest<HTMLElement>('[data-card]');
      if (c) void this.say(CARDS.find((x) => x.id === c.dataset.card)!.line);
    });
  }

  /** the ways out: 再来一局 (+ the handicap offer) · 换个对手 / 重新设置 · 回营地 */
  private actions(): HTMLDivElement {
    const dt = this.data;
    const acts = div('mc-result__acts');
    const ladder = !dt.family && !dt.match.free;
    acts.appendChild(button('xg-btn xg-btn--primary xg-btn--lg', `${icon('restart')}<span>再来一局</span>`, () => this.again(0), 'again'));
    if (ladder && dt.offer) {
      acts.appendChild(button('xg-btn xg-btn--gold xg-btn--lg', `${icon('minus')}<span>${dt.offer === 2 ? '让它少两个子' : '让它少个军长'}</span>`, () => this.again(dt.offer!), 'handicap'));
    }
    // family / free games (QA fb1 minor): only 翻翻棋 is offered now, so this opens the seats + who-starts setup
    const other = button('xg-btn xg-btn--secondary xg-btn--lg', ladder ? `${icon('swap')}<span>换个对手</span>` : `${icon('settings')}<span>重新设置</span>`, () => this.app.go(dt.family || dt.match.free ? { name: 'family' } : { name: 'ladder', mode: dt.mode }), 'other');
    const home = button('xg-btn xg-btn--secondary xg-btn--lg', `${icon('home')}<span>回营地</span>`, () => this.app.go({ name: 'home' }), 'camp');
    acts.append(other, home);
    return acts;
  }

  /** phones: the reward tiles (暗棋 guesses, each new card, the robot unlocked) */
  private rewardCount(): number {
    const dt = this.data;
    const cards = (dt.newCards ?? []).filter((id) => CARDS.some((c) => c.id === id)).length;
    return (dt.guesses ? 1 : 0) + cards + (dt.unlocked && dt.unlocked <= 4 ? 1 : 0);
  }

  /** at most `cap` tiles: past that, the extra new cards fold into one "+n" tile (the album has them all) */
  private rewardTiles(cap: number): string {
    const dt = this.data;
    const lead: string[] = [], tail: string[] = [];
    if (dt.guesses) lead.push(`<span class="mc-rtile is-guess" data-testid="guesses">${mcIcon('flag')}<span class="mc-rtile__t"><em>猜对了</em><b>${dt.guesses.right} / ${dt.guesses.total}</b></span></span>`);
    if (dt.unlocked && dt.unlocked <= 4) tail.push(`<span class="mc-rtile is-unlock" data-testid="unlocked"><span class="mc-rtile__art">${opponentBadge(dt.unlocked as 1 | 2 | 3 | 4, 40)}</span><span class="mc-rtile__t"><em>新对手</em><b>${OPPONENTS[dt.unlocked - 1].name}</b></span></span>`);
    const cards = (dt.newCards ?? []).map((id) => CARDS.find((c) => c.id === id)).filter((c): c is (typeof CARDS)[number] => !!c);
    const room = Math.max(0, cap - lead.length - tail.length);
    const shown = cards.length > room ? cards.slice(0, Math.max(0, room - 1)) : cards;
    const tiles = shown.map((c) => `<span class="mc-rtile is-card" data-card="${c.id}" role="button" aria-label="新卡片：${c.title}"><span class="mc-rtile__art">${cardArt(c.art, 32)}</span><span class="mc-rtile__t"><em>新卡片</em><b>${c.title}</b></span></span>`);
    if (shown.length < cards.length) tiles.push(`<span class="mc-rtile is-more" data-testid="more-cards"><span class="mc-rtile__t"><em>还有新卡片</em><b>+${cards.length - shown.length}</b></span></span>`);
    return [...lead, ...tiles, ...tail].join('');
  }

  /**
   * Phones (QA fb1 major): portrait = head · moments · reward tiles · actions from top to bottom (the guide
   * beside the moments, the caption bubble in a band above the tiles); landscape = head left above the
   * guide + caption, moments · tiles · actions right. The tiles take the rows they need (≤ 2), the moment
   * cards are as tall as their board + caption (not the whole strip) and shrink before anything spills.
   */
  private renderPhone(head: HTMLElement): void {
    const dt = this.data;
    const portrait = this.o === 'portrait';
    const W = this.W, H = this.H, col = this.phoneCol, sr = this.app.safeR, sl = this.app.safeL;
    const TILE_H = 54, TGAP = 8, TILE_MIN = 119, TILE_MAX = 156;
    const nAct = 3 + (!dt.family && !dt.match.free && dt.offer ? 1 : 0);
    const nTiles = this.rewardCount();
    const n = Math.max(1, this.moments.length), gap = 8;
    const texts = this.moments.map((m) => this.app.voice.text(m.line));
    const grid = (width: number, maxRows: number) => {
      if (!nTiles) return { cols: 0, rows: 0, w: 0, h: 0, cap: 0 };
      const cols = Math.max(1, Math.min(nTiles, Math.floor((width + TGAP) / (TILE_MIN + TGAP))));
      const rows = Math.ceil(Math.min(nTiles, cols * maxRows) / cols);
      return { cols, rows, w: Math.min(TILE_MAX, Math.floor((width - (cols - 1) * TGAP) / cols)), h: rows * TILE_H + (rows - 1) * TGAP, cap: cols * maxRows };
    };
    // moment cards: the widest that fits; height = padding + mini board + caption lines (16 px type)
    const fit = (sw: number, sh: number): { tw: number; th: number; cpl: number } | null => {
      for (let tw = Math.floor(Math.min(portrait ? 150 : 170, (sw - (n - 1) * gap) / n)); tw >= 64; tw -= 2) {
        const cpl = Math.max(2, Math.floor((tw - 10) / 16));
        const lines = Math.max(1, ...texts.map((t) => chunkLines(narrowChunks(t, cpl), cpl)));
        const th = Math.ceil(10 + Math.round((tw - 16) * (810 / 652)) + 4 + lines * 19.2 + 2);
        if (th <= sh) return { tw, th, cpl };
      }
      return null;
    };

    let headBox: Rect, acts: Rect, stripBox: Rect, info: Rect, g = grid(0, 1), f: { tw: number; th: number; cpl: number } | null = null;
    if (portrait) {
      const actH = nAct > 3 ? 2 * 54 + 8 : 54;
      acts = { x: 8, y: H - 6 - actH, w: W - 16, h: actH };
      // the head is as tall as its lines (measured), so the moments get the rest
      abs(head, { x: 8, y: 6, w: W - 16, h: 0 });
      head.style.height = 'auto';
      headBox = { x: 8, y: 6, w: W - 16, h: Math.min(236, Math.max(132, head.offsetHeight + 10)) };
      info = { x: 8, y: acts.y, w: W - 16, h: 0 };
      stripBox = { x: 70, y: 0, w: W - 78, h: 0 };
      for (const maxRows of [2, 1]) {
        g = grid(W - 16, maxRows);
        info = { x: 8, y: acts.y - (g.rows ? 6 + g.h : 0), w: W - 16, h: g.h };
        const top = headBox.y + headBox.h + 4;
        // a caption band (62) between the moments and the tiles keeps the bubble off them
        stripBox = { x: 70, y: top, w: W - 78, h: info.y - 6 - 62 - top };
        f = fit(stripBox.w, stripBox.h);
        if (f) break;
      }
    } else {
      const rx = col + 4 + 250, rw = W - rx - 6 - sr;
      acts = { x: rx, y: H - 6 - 54, w: rw, h: 54 };
      // left column: the head above the guide + caption (they stand at the bottom left)
      headBox = { x: col + 4, y: 6, w: 240, h: H - 6 - 72 - 6 - 6 };
      info = { x: rx, y: acts.y, w: rw, h: 0 };
      stripBox = { x: rx, y: 6, w: rw, h: 0 };
      for (const maxRows of [2, 1]) {
        g = grid(rw, maxRows);
        info = { x: rx, y: acts.y - (g.rows ? 6 + g.h : 0), w: rw, h: g.h };
        stripBox = { x: rx, y: 6, w: rw, h: info.y - 6 - 6 };
        f = fit(stripBox.w, stripBox.h);
        if (f) break;
      }
    }
    abs(head, headBox);

    // key moments (no room for the words on a very short screen: the board alone, tap → replay says it)
    const strip = div('mc-moments');
    strip.dataset.testid = 'moments';
    const tw = f ? f.tw : Math.floor(Math.min((stripBox.w - (n - 1) * gap) / n, (stripBox.h - 10) * (652 / 810) + 16));
    const th = f ? f.th : stripBox.h;
    const x0 = stripBox.x + (stripBox.w - n * tw - (n - 1) * gap) / 2;
    const y0 = stripBox.y + Math.max(0, Math.round((stripBox.h - th) / 2));
    this.moments.forEach((m, k) => {
      const cap = f ? chunksHtml(narrowChunks(texts[k], f.cpl)) : '';
      const card = this.momentCard(m, k, tw, cap);
      abs(card, { x: x0 + k * (tw + gap), y: y0, w: tw, h: th });
      strip.appendChild(card);
    });
    this.el.appendChild(strip);

    // reward tiles
    const tiles = div('mc-result__info is-tiles');
    tiles.dataset.testid = 'result-info';
    tiles.innerHTML = this.rewardTiles(g.cap);
    tiles.style.setProperty('--tile-w', `${g.w}px`);
    this.cardTaps(tiles);
    abs(tiles, info);
    this.el.appendChild(tiles);

    const actsEl = this.actions();
    abs(actsEl, acts);
    actsEl.classList.toggle('is-grid', portrait && nAct > 3);
    actsEl.dataset.n = String(nAct);
    this.el.appendChild(actsEl);

    const gh = div('mc-pguide');
    if (portrait) {
      abs(gh, { x: 4, y: y0 + 6, w: 60, h: 72 });
      this.phoneCaption(8, H - info.y + 4);
    } else {
      abs(gh, { x: 4 + sl, y: H - 6 - 72, w: 60, h: 72 });
      this.phoneCaption(4 + sl + 66, 6, W - 6 - sr - (headBox.x + headBox.w));
    }
    this.el.append(gh, this.caption.el);
    this.placeGuide(gh, 60, { mood: dt.family ? 'happy' : dt.winnerPlayer === 0 ? 'celebrating' : 'encouraging' });
  }

  /** promotion (§5.4): the shared ceremony, then the head shows the new shoulder board */
  private async ceremony(ranks: number[]): Promise<void> {
    await promotionCeremony(this.el, ranks, { play: (n) => this.app.play(n), say: (l) => void this.say(l, 'celebrating'), wait: (ms) => this.bag.wait(ms) });
    this.ceremonyDone = true;
    this.render();
  }

  private again(handicap: 0 | 1 | 2): void {
    this.app.play('ui-confirm');
    const m = this.data.match;
    if (!modeShown(m.mode)) {
      // a 明棋 / 暗棋 game resumed from an older save (those modes are not offered any more): pick a
      // 翻翻棋 game instead of starting the hidden mode again
      this.app.go(this.data.family || m.free ? { name: 'family' } : { name: 'ladder', mode: 'fan' });
      return;
    }
    if (!this.data.family && m.opponent.kind === 'ai') {
      const next = newLadderMatch(this.app.save, m.mode, m.opponent.level, { handicap, free: m.free });
      if (m.mode === 'fan') this.app.go({ name: 'match', setup: next });
      else this.app.go({ name: 'deploy', next: { match: next, who: 'kid' } });
      return;
    }
    const id = String(Date.now().toString(36));
    const next: SavedMatch = { ...m, id, actions: [], undos: 0, tags: {}, hints: 0, coachWarnings: 0, coachOverrides: 0, startedAt: Date.now(), setup: { ...m.setup, fanSeed: m.mode === 'fan' ? `mc:fan:${id}` : undefined } };
    if (m.mode === 'fan') this.app.go({ name: 'match', setup: next });
    else this.app.go({ name: 'deploy', next: { match: { ...next, setup: { ...next.setup, red: undefined, blue: undefined } }, who: 'kid' } });
  }
}

/** a key moment drawn as a small board (portrait geometry, everything face up) */
export function miniBoard(m: { state: GameState; path: number[] }, width: number): string {
  const g = boardGeom('portrait', 0);
  const k = width / g.rect.w;
  const s = m.state;
  let pieces = '';
  for (let p = 0; p < s.np; p++) {
    if (!s.palive[p]) continue;
    const c = stationLocal(g, s.ppos[p]);
    const t = s.ptype[p];
    const fill = s.pside[p] === RED ? '#b8342a' : '#2d5ba3';
    const label = t === BOMB ? '炸' : t === MINE ? '雷' : t === FLAG ? '旗' : String(rankOf(t));
    pieces += `<g><rect x="${c.x - 40}" y="${c.y - 21}" width="80" height="42" rx="${s.pside[p] === BLUE ? 9 : 4}" fill="${fill}"/><text x="${c.x}" y="${c.y + 11}" text-anchor="middle" class="mc-mini-t">${label}</text></g>`;
  }
  let arrow = '';
  if (m.path.length >= 2) {
    const pts = m.path.map((i) => stationLocal(g, i));
    arrow = `<path d="${pts.map((q, i) => `${i ? 'L' : 'M'}${q.x} ${q.y}`).join('')}" fill="none" stroke="#f6b934" stroke-width="12" stroke-linecap="round" stroke-linejoin="round" opacity=".9"/><circle cx="${pts[pts.length - 1].x}" cy="${pts[pts.length - 1].y}" r="34" fill="none" stroke="#f6b934" stroke-width="8"/>`;
  }
  return `<svg class="mc-miniboard" viewBox="0 0 ${g.rect.w} ${g.rect.h}" width="${width}" height="${Math.round(g.rect.h * k)}" aria-hidden="true">${cachedBoardSvg(g).replace(/^<svg[^>]*>/, '<g>').replace(/<\/svg>$/, '</g>')}${pieces}${arrow}</svg>`;
}
