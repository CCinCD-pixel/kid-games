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
import { CARDS } from '../content';
import { art } from '../view/cards-art';
import { cachedBoardSvg } from '../view/board-svg';
import { mcIcon } from '../view/icons';
import { insignia, RANK_NAMES } from '../view/insignia';
import { boardGeom, stationLocal } from '../view/layout';
import { cardArt } from '../view/knowledge-art';
import { opponentBadge, OPPONENTS } from '../view/hats';
import { promotionCeremony } from '../view/promo';
import { BaseScreen, abs, button, div } from './base';

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
    if (this.moments.length) this.bag.timeout(() => void this.say('mc.end.report'), t);
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

  protected render(): void {
    const portrait = this.o === 'portrait';
    const st = this.safeTop;
    this.el.replaceChildren();
    this.el.classList.add('mc-result');
    const dt = this.data;
    const { title, sub } = this.titleText();
    const head = div('mc-result__head');
    head.dataset.testid = 'result-head';
    const emblem = dt.family ? art('hands', 120) : dt.winnerPlayer === 0 ? art('flag-gold', 120) : `<span class="mc-neutral">${mcIcon(dt.winnerPlayer === -1 ? 'hands' : 'shield')}</span>`;
    const names = dt.family
      ? `<div class="mc-result__names">${[0, 1].map((p) => `<span>${p === dt.winnerPlayer ? mcIcon('star', 'mc-winstar') : ''}${dt.names[p]}</span>`).join('<i>·</i>')}</div>`
      : '';
    const opp = dt.level ? `<span class="mc-result__opp">${opponentBadge(dt.level as 1 | 2 | 3 | 4, 44)}<b>${OPPONENTS[dt.level - 1].name}</b></span>` : '';
    const rankNow = this.ceremonyDone && dt.promotions?.length ? `<div class="mc-result__rank">${insignia(this.app.save.rank, 92)}<b>${RANK_NAMES[this.app.save.rank]}</b></div>` : '';
    head.innerHTML = `<div class="mc-result__emblem">${emblem}</div><h1 class="mc-h1" data-testid="result-title">${title}</h1><p class="mc-sub">${MODE_NAME[dt.mode]}${opp ? ' · ' : ''}${opp}${sub ? ' · ' + sub : ''}</p>${names}${rankNow}`;
    abs(head, portrait ? { x: 60, y: st + 24, w: 690, h: 290 } : { x: 16, y: st + 40, w: 260, h: 520 });
    if (!portrait) head.classList.add('is-col');
    this.el.appendChild(head);

    // key moments
    const strip = div('mc-moments');
    strip.dataset.testid = 'moments';
    const tw = portrait ? 240 : 250, th = portrait ? 316 : 330, gap = portrait ? 15 : 16;
    const n = Math.max(1, this.moments.length);
    const x0 = portrait ? (810 - n * tw - (n - 1) * gap) / 2 : 300 + (764 - n * tw - (n - 1) * gap) / 2;
    const y0 = portrait ? st + 322 : st + 40;
    this.moments.forEach((m, k) => {
      const card = button('mc-moment', `${miniBoard(m, tw - 16)}<span class="mc-moment__cap">${this.app.voice.text(m.line)}</span>`, () => {
        this.app.play('ui-open');
        void this.say(m.line);
        this.app.go({ name: 'review', data: this.data, ply: m.ply });
      }, `moment-${k}`);
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
      if (c) chips.push(`<span class="mc-chip-info is-card" data-card="${id}">${cardArt(c.art, 54)}<b>${c.title}</b></span>`);
    }
    if (dt.unlocked && dt.unlocked <= 4) chips.push(`<span class="mc-chip-info is-unlock">${icon('unlock')}${opponentBadge(dt.unlocked as 1 | 2 | 3 | 4, 40)}<b>${OPPONENTS[dt.unlocked - 1].name}</b></span>`);
    info.innerHTML = chips.join('');
    info.addEventListener('click', (e) => {
      const c = (e.target as HTMLElement).closest<HTMLElement>('[data-card]');
      if (c) void this.say(CARDS.find((x) => x.id === c.dataset.card)!.line);
    });
    abs(info, portrait ? { x: 30, y: y0 + th + 14, w: 750, h: 78 } : { x: 300, y: y0 + th + 14, w: 764, h: 78 });
    this.el.appendChild(info);

    // actions
    const acts = div('mc-result__acts');
    const ladder = !dt.family && !dt.match.free;
    const again = button('xg-btn xg-btn--primary xg-btn--lg', `${icon('restart')}<span>再来一局</span>`, () => this.again(0), 'again');
    acts.appendChild(again);
    if (ladder && dt.offer) {
      acts.appendChild(button('xg-btn xg-btn--gold xg-btn--lg', `${icon('minus')}<span>${dt.offer === 2 ? '让它少两个子' : '让它少个军长'}</span>`, () => this.again(dt.offer!), 'handicap'));
    }
    const other = button('xg-btn xg-btn--secondary xg-btn--lg', `${icon('swap')}<span>${ladder ? '换个对手' : '换玩法'}</span>`, () => this.app.go(dt.family || dt.match.free ? { name: 'family' } : { name: 'ladder', mode: dt.mode }), 'other');
    const home = button('xg-btn xg-btn--secondary xg-btn--lg', `${icon('home')}<span>回营地</span>`, () => this.app.go({ name: 'home' }), 'camp');
    acts.append(other, home);
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

  /** promotion (§5.4): the shared ceremony, then the head shows the new shoulder board */
  private async ceremony(ranks: number[]): Promise<void> {
    await promotionCeremony(this.el, ranks, { play: (n) => this.app.play(n), say: (l) => void this.say(l, 'celebrating'), wait: (ms) => this.bag.wait(ms) });
    this.ceremonyDone = true;
    this.render();
  }

  private again(handicap: 0 | 1 | 2): void {
    this.app.play('ui-confirm');
    const m = this.data.match;
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
