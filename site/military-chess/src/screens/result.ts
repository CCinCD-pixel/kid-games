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
import { phraseWrap } from '../view/phrase';
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
    const ph = this.phone, W = this.W, H = this.H, col = this.phoneCol, sr = this.app.safeR;
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
    const rankNow = this.ceremonyDone && dt.promotions?.length ? `<div class="mc-result__rank">${insignia(this.app.save.rank, ph ? 56 : 92)}<b>${RANK_NAMES[this.app.save.rank]}</b></div>` : '';
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
    head.innerHTML = `<div class="mc-result__emblem">${emblem}</div><h1 class="mc-h1" data-testid="result-title">${title}</h1><p class="mc-sub">${phraseWrap(MODE_NAME[dt.mode])}${opp ? ' · ' : ''}${opp}${sub ? ' · ' + phraseWrap(sub) : ''}</p>${ruleLine}${dotsRow}${names}${rankNow}`;
    // phones: portrait = head · moments · chips · actions (2 × 2) from top to bottom, the guide tucked
    // under the 🏠; landscape = head left, moments + chips + actions right
    const nAct = 3 + (!dt.family && !dt.match.free && dt.offer ? 1 : 0);
    const pActH = portrait && nAct > 3 ? 2 * 54 + 8 : 54;
    const pActs = portrait ? { x: 8, y: H - 6 - pActH, w: W - 16, h: pActH } : { x: col + 4 + 250, y: H - 6 - 54, w: W - (col + 4 + 250) - 6 - sr, h: 54 };
    const pInfo = portrait ? { x: 8, y: pActs.y - 6 - 52, w: W - 16, h: 52 } : { x: pActs.x, y: pActs.y - 6 - 52, w: pActs.w, h: 52 };
    const pHead = portrait ? { x: 8, y: 6, w: W - 16, h: 206 } : { x: col + 4, y: 6, w: 240, h: H - 12 };
    // portrait: the guide stands left of the moments
    // portrait: a caption band (62) between the moments and the chips keeps the bubble off them
    const pStrip = portrait ? { x: 70, y: pHead.y + pHead.h + 4, w: W - 78, h: pInfo.y - 6 - 62 - (pHead.y + pHead.h + 4) } : { x: pActs.x, y: 6, w: pActs.w, h: pInfo.y - 6 - 6 };
    if (ph) abs(head, pHead);
    else abs(head, portrait ? { x: 60, y: st + 24, w: 690, h: 290 } : { x: 16, y: st + 40, w: 260, h: 520 });
    if (!portrait) head.classList.add('is-col');
    this.el.appendChild(head);

    // key moments
    const strip = div('mc-moments');
    strip.dataset.testid = 'moments';
    const n = Math.max(1, this.moments.length);
    const gap = ph ? 8 : portrait ? 15 : 16;
    // a mini board is 652 : 810; its caption takes ~2 lines under it
    const pTw = Math.min((pStrip.w - (n - 1) * gap) / n, (pStrip.h - 58) * (652 / 810) + 16);
    const tw = ph ? pTw : portrait ? 240 : 250, th = ph ? pStrip.h : portrait ? 316 : 330;
    const x0 = ph ? pStrip.x + (pStrip.w - n * tw - (n - 1) * gap) / 2 : portrait ? (810 - n * tw - (n - 1) * gap) / 2 : 300 + (764 - n * tw - (n - 1) * gap) / 2;
    const y0 = ph ? pStrip.y : portrait ? st + 322 : st + 40;
    this.moments.forEach((m, k) => {
      const card = button('mc-moment', `${miniBoard(m, tw - 16)}<span class="mc-moment__cap">${phraseWrap(this.app.voice.text(m.line))}</span>`, () => {
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
      if (c) chips.push(`<span class="mc-chip-info is-card" data-card="${id}" role="button" aria-label="新卡片：${c.title}"><em class="mc-chip-info__k">新卡片</em>${cardArt(c.art, ph ? 36 : 54)}<b>${c.title}</b></span>`);
    }
    if (dt.unlocked && dt.unlocked <= 4) chips.push(`<span class="mc-chip-info is-unlock">${icon('unlock')}${opponentBadge(dt.unlocked as 1 | 2 | 3 | 4, ph ? 30 : 40)}<b>${OPPONENTS[dt.unlocked - 1].name}</b></span>`);
    info.innerHTML = chips.join('');
    info.addEventListener('click', (e) => {
      const c = (e.target as HTMLElement).closest<HTMLElement>('[data-card]');
      if (c) void this.say(CARDS.find((x) => x.id === c.dataset.card)!.line);
    });
    abs(info, ph ? pInfo : portrait ? { x: 30, y: y0 + th + 14, w: 750, h: 78 } : { x: 300, y: y0 + th + 14, w: 764, h: 78 });
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
    if (ph) {
      abs(acts, pActs);
      acts.classList.toggle('is-grid', portrait && nAct > 3);
      acts.dataset.n = String(nAct);
    } else abs(acts, portrait ? { x: 30, y: 1080 - 16 - 76 - 120, w: 750, h: 76 } : { x: 300, y: 810 - 16 - 76, w: 764, h: 76 });
    this.el.appendChild(acts);
    if (ph) {
      const gh = div('mc-pguide');
      if (portrait) {
        abs(gh, { x: 4, y: pStrip.y + 6, w: 60, h: 72 });
        this.phoneCaption(8, H - pInfo.y + 4);
      } else {
        abs(gh, { x: 4 + this.app.safeL, y: H - 6 - 72, w: 60, h: 72 });
        this.phoneCaption(pActs.x, 6 + 54 + 6);
      }
      this.el.append(gh, this.caption.el);
      this.placeGuide(gh, 60, { mood: dt.family ? 'happy' : dt.winnerPlayer === 0 ? 'celebrating' : 'encouraging' });
      return;
    }

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
