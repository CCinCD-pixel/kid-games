/**
 * S6 对局 (spec §2.3, §8.3): board + HUD + intel + guide. Executes the reducer's effects: selection,
 * reasons for illegal moves, move/rail/collision animations with the referee reveal, end of game.
 * Opponents: family (two humans on one iPad, side by side or face to face) and the ladder robots
 * (Web Worker AI fed with redacted public views only, spec §8.5). Ladder extras: 参谋提醒 C1–C5,
 * the 💡 two-level hint, 暗棋 参谋笔记 badges + 侦察便签 tags + the certain-loss intel list, the five
 * 翻翻棋 first-game teaching points, knowledge-card events.
 */
import { icon } from '@kit/ui';
import type { App } from '../app';
import { BLUE, RED, adj, isCamp, isHQ, isRail, isRailEdge, type Side } from '../core/board';
import { badgeOf, certainDead, observe, type Knowledge } from '../core/belief';
import { coachCheck, flagDangerNow, type CoachAlert } from '../core/coach';
import { resolve } from '../core/combat';
import { WHY_LINE, type Why } from '../core/explain';
import { isFlip, isMove, legalMoves, pieceCanMove, pieceMoves, type Action } from '../core/movegen';
import { parseNote, toNote } from '../core/notation';
import { BOMB, ENG, FLAG, MINE, NAMES, rankOf, COUNTS, COUNT_POINTS } from '../core/pieces';
import { tileSvg } from '../view/pieces-svg';
import { redact } from '../core/redact';
import { quietDots, type MoveEvent } from '../core/rules';
import { playerToAct, type GameResult, type GameState } from '../core/state';
import { awardCards, promote, recordLadder, type CardEvent } from '../core/progress';
import { createMatch, transition, type Effect, type MatchCtx, type MatchEvent } from '../ctrl/match';
import { newMatchId, type SavedMatch } from '../ctrl/save';
import { countsOf, knowledgeFor, matchFromSave, startState, controllersFor } from '../ctrl/setup';
import { AiClient } from '../ai/client';
import type { Level } from '../ai/levels';
import { MS, d, dm } from '../view/anim';
import { BoardView } from '../view/board-view';
import * as fx from '../view/fx';
import { opponentBadge } from '../view/hats';
import { TurnBar, QuietDots } from '../view/hud';
import { mcIcon } from '../view/icons';
import { Intel } from '../view/intel';
import { boardGeom, seatRotation, stageGeom, type Rect } from '../view/layout';
import { badgeHtml, tagHtml, TAGS, tagCorrect, type TagKind } from '../view/notes';
import { refereeReveal } from '../view/referee';
import { BaseScreen, abs, button, div } from './base';
import type { ResultData } from './result';

const RANK_HTML = (s: GameState, pid: number): string => {
  const t = s.ptype[pid];
  const side = s.pside[pid] ? 'b' : 'r';
  if (t === BOMB) return `<span class="${side}">${mcIcon('bomb')}</span>`;
  if (t === MINE) return `<span class="${side}">${mcIcon('mine')}</span>`;
  if (t === FLAG) return `<span class="${side}">${mcIcon('flag')}</span>`;
  return `<span class="${side}">${rankOf(t)}</span>`;
};

type FanPoint = 'rail' | 'camp' | 'mine' | 'flag' | 'hq';

export class MatchScreen extends BaseScreen {
  readonly name = 'match';
  private m: SavedMatch;
  private ctx: MatchCtx;
  private board: BoardView;
  private bars: TurnBar[] = [];
  private quiet = new QuietDots();
  private intel: Intel;
  private youAre: HTMLDivElement[] = [];
  private queue: Promise<void> = Promise.resolve();
  private collisions = 0;
  private quietWarned = false;
  private turnsSpoken = 0;
  private ended = false;
  private menuOpen: HTMLElement | null = null;
  private aiTimer = 0;
  private hidden = false;
  private pendingAi: (() => void) | null = null;
  /** the robot (ladder / Dad vs computer); null in family games */
  private level: Level | null;
  private ai: AiClient | null = null;
  /** 暗棋: what RED and BLUE know about each other (public events only) */
  private know: [Knowledge, Knowledge] | null = null;
  private coachUsed = 0;
  private coachOn: boolean;
  private notesOn: boolean;
  private hintBtn: HTMLButtonElement | null = null;
  private hint = { ply: -1, stage: 0, note: null as string | null, busy: false };
  private events = new Set<CardEvent>();
  private tags = new Map<number, TagKind>();
  private fanTeach: boolean;
  private tagMenu: HTMLElement | null = null;

  /** a test position (?test=1): not resumable */
  private custom = false;
  private startState: GameState;

  constructor(app: App, route: { resume?: boolean; setup?: SavedMatch; start?: GameState }) {
    super(app);
    const m = route.resume && app.save.resume ? app.save.resume : route.setup!;
    this.m = m;
    this.level = m.opponent.kind === 'ai' ? m.opponent.level : null;
    const fanFlagLock = true; // 家规 live in the saved match (m.house)
    this.custom = !!route.start;
    const ca = app.save.settings.coachAlerts;
    this.coachOn = this.level !== null && !m.free && (ca === 'on' || (ca === 'auto' && this.level <= 2));
    this.notesOn = app.save.settings.coachNotes;
    this.fanTeach = m.mode === 'fan' && this.level !== null && !m.free && !route.start && app.save.firstRun.fanCoach.length < 5;
    const coach = this.level !== null && !m.free ? (s: GameState, a: Action) => this.coachFor(s, a) : null;
    this.startState = route.start ?? startState(m, { fanFlagLock });
    this.ctx = route.resume ? matchFromSave(m, { fanFlagLock, coach }) : createMatch(m.id, this.startState, controllersFor(m), coach);
    if (app.test && app.params.get('opp') === 'dev') this.ctx = { ...this.ctx, players: ['human', 'ai'] };
    if (m.mode === 'an') this.know = knowledgeFor(this.startState, this.ctx.notes);
    for (const [k, v] of Object.entries(m.tags ?? {})) this.tags.set(Number(k), v);
    if (this.ctx.players[1] === 'ai') {
      this.ai = new AiClient({ test: app.test, onTimeout: (id) => app.mark('ai-timeout', { id }) });
      if (app.test) (window as unknown as { __mcAi?: AiClient }).__mcAi = this.ai;
    }
    this.board = new BoardView(
      {
        onTap: (at) => this.dispatch({ type: 'tap', at }),
        onDrop: (pid, at) => this.dispatch({ type: 'drop', pid, at }),
        canDrag: (pid) => this.canDrag(pid),
        onTouch: () => {
          this.board.clearLastMove();
          this.board.clearHintArrow();
        },
        onLongPress: (at) => this.longPress(at),
      },
      { viewer: m.mode === 'an' ? m.kidSide : 0, rotOf: (pid) => this.rotOf(pid), numbers: app.save.settings.numberBadges },
    );
    this.intel = new Intel({ onCell: (line, word) => void this.say(word ?? line).then(() => (word ? this.say(line) : undefined)) });
    if (!route.resume) this.saveResume();
    app.save.stats.matches += route.resume ? 0 : 1;
    this.bag.timeout(() => {
      if (!route.resume && m.mode === 'fan') void this.say('mc.ref.first.flip');
      else if (!route.resume) void this.say('mc.ref.start');
      else void this.say('mc.home.resume');
    }, 250);
    // start: run the reducer's turnStart
    this.bag.timeout(() => this.dispatch({ type: route.resume ? 'animDone' : 'start' }), 60);
  }

  // ------------------------------------------------------------------ seats & helpers
  private seating(): 'side' | 'face' {
    return this.m.opponent.kind === 'family' ? this.m.opponent.seating : 'side';
  }
  /** which player plays `colour` (翻翻棋: by the first flip; −1 while undecided) */
  private playerOf(colour: number): number {
    const s = this.ctx.state;
    if (s.mode !== 'fan') return colour;
    return s.colorOf[0] === colour ? 0 : s.colorOf[1] === colour ? 1 : -1;
  }
  /** the child's colour (−1 in 翻翻棋 before the first flip) */
  private kidColour(s: GameState = this.ctx.state): number {
    return s.mode === 'fan' ? s.colorOf[0] : this.m.kidSide;
  }
  private rotOf(pid: number): number {
    const p = this.playerOf(this.ctx.state.pside[pid]);
    if (p < 0) return 0;
    return seatRotation(this.o, this.seating(), p === 0 ? 'near' : 'far');
  }
  private nameOf(player: number): string {
    if (this.m.opponent.kind === 'family') return this.m.opponent.names[player];
    return player === 0 ? '你' : this.level ? ['豆豆', '铁蛋', '雷达', '老将'][this.level - 1] : '机器人';
  }
  private canDrag(pid: number): boolean {
    const c = this.ctx;
    if (c.lock > 0 || (c.phase !== 'idle' && c.phase !== 'selected')) return false;
    if (c.players[playerToAct(c.state)] !== 'human') return false;
    return c.state.pside[pid] === c.state.turn && pieceCanMove(c.state, pid);
  }
  /** the enemy's per-type totals from `side`'s point of view (handicap-aware) */
  private enemyCounts(side: Side): number[] {
    return this.m.mode === 'fan' ? COUNTS.slice() : countsOf(this.m, (1 - side) as Side);
  }

  back(): boolean {
    this.leave();
    return true;
  }

  private leave(): void {
    this.saveResume();
    this.ai?.reset();
    if (this.m.opponent.kind === 'family' || this.m.free) this.app.go({ name: 'family' });
    else this.app.go({ name: 'ladder', mode: this.m.mode });
  }

  persist(): void {
    if (!this.ended) this.saveResume();
  }

  pause(): void {
    this.hidden = true;
    this.board.finishAll();
    this.persist();
  }
  resume(): void {
    this.hidden = false;
    if (this.pendingAi) {
      const f = this.pendingAi;
      this.pendingAi = null;
      f();
    }
  }

  private saveResume(): void {
    if (this.ended || this.custom) return;
    const tags: SavedMatch['tags'] = {};
    for (const [k, v] of this.tags) tags[k] = v;
    this.app.save.resume = { ...this.m, actions: [...this.ctx.notes], undos: this.ctx.undos, tags };
    this.app.persist();
  }

  // ------------------------------------------------------------------ layout
  protected render(): void {
    const o = this.o, st = this.safeTop;
    const face = this.seating() === 'face';
    this.el.replaceChildren();
    this.el.classList.add('mc-match');
    const g = stageGeom(o, st);
    const bg = boardGeom(o, st);
    this.board.setGeom(bg);
    this.el.appendChild(this.board.el);
    this.board.el.style.transform = '';
    this.bars = [];
    const near = new TurnBar('turn');
    this.bars.push(near);
    let intelRect: Rect, guideRect: Rect, capRect: Rect, menuRect: Rect, hintRect: Rect | null = null;
    let dock = false;
    if (o === 'portrait') {
      const panelY = g.intel.y, panelH = g.intel.h;
      menuRect = g.buttons[1];
      hintRect = g.buttons[0];
      guideRect = { x: 12, y: panelY, w: 150, h: panelH };
      if (face) {
        const far = new TurnBar('turn-far');
        abs(far.el, g.turnBar);
        far.el.classList.add('is-far');
        this.bars.push(far);
        this.el.appendChild(far.el);
        abs(near.el, { x: 225, y: 1068 - 52, w: 360, h: 52 });
        intelRect = { x: g.intel.x, y: panelY, w: g.intel.w, h: panelH - 60 };
      } else {
        abs(near.el, g.turnBar);
        intelRect = { x: g.intel.x, y: panelY, w: g.intel.w, h: panelH };
      }
      capRect = { x: intelRect.x, y: intelRect.y, w: intelRect.w, h: 64 };
      abs(this.quiet.el, { x: 225, y: (face ? 1068 - 52 : g.turnBar.y + 52) + (face ? -14 : 3), w: 360, h: 12 });
    } else if (!face) {
      abs(near.el, g.turnBar);
      intelRect = g.intel;
      guideRect = { x: g.companion.x, y: g.companion.y, w: g.companion.w, h: 100 };
      capRect = { x: g.companion.x, y: g.companion.y + 104, w: g.companion.w, h: 0 };
      dock = true;
      menuRect = { x: 1068 - 56, y: 810 - 12 - 56, w: 56, h: 56 };
      hintRect = { x: 1068 - 56 - 12 - 56, y: 810 - 12 - 56, w: 56, h: 56 };
      abs(this.quiet.el, { x: g.turnBar.x, y: g.turnBar.y + 58, w: g.turnBar.w, h: 12 });
      near.el.classList.add('is-narrow');
    } else {
      // face to face in landscape: both seats on the short edges; board slightly smaller in between
      const k = 0.9;
      const bw = bg.rect.w * k, bh = bg.rect.h * k;
      const bx = 76, by = (810 - bh) / 2 + 8;
      this.board.el.style.left = `${bx}px`;
      this.board.el.style.top = `${by}px`;
      this.board.el.style.transformOrigin = '0 0';
      this.board.el.style.transform = `scale(${k})`;
      abs(near.el, { x: 12 + 26 - 150, y: 405 - 26, w: 300, h: 52 });
      near.el.style.transform = 'rotate(90deg)';
      const far = new TurnBar('turn-far');
      abs(far.el, { x: 1068 - 26 - 150, y: 405 - 26, w: 300, h: 52 });
      far.el.style.transform = 'rotate(-90deg)';
      this.bars.push(far);
      this.el.appendChild(far.el);
      const px = bx + bw + 12, pw = 1068 - 52 - 12 - px;
      intelRect = { x: px, y: st + 12, w: pw, h: 330 };
      guideRect = { x: px, y: st + 360, w: 80, h: 100 };
      capRect = { x: px, y: st + 466, w: pw, h: 150 };
      menuRect = { x: px + pw - 56, y: 810 - 12 - 56, w: 56, h: 56 };
      hintRect = { x: px + pw - 56 - 12 - 56, y: 810 - 12 - 56, w: 56, h: 56 };
      abs(this.quiet.el, { x: px, y: st + 346, w: pw, h: 12 });
    }
    this.el.appendChild(near.el);
    abs(this.intel.el, intelRect);
    this.el.appendChild(this.intel.el);
    this.el.appendChild(this.quiet.el);
    const gh = div('mc-match__guide');
    abs(gh, guideRect);
    this.el.appendChild(gh);
    this.placeGuide(gh, o === 'portrait' ? 120 : 88, { mood: 'happy' });
    abs(this.caption.el, capRect);
    this.caption.el.classList.toggle('is-tall', o === 'landscape');
    this.caption.el.classList.toggle('is-dock', dock);
    this.el.appendChild(this.caption.el);
    const menu = button('xg-iconbtn mc-menu-btn', icon('grid'), () => this.openMenu(), 'menu');
    menu.setAttribute('aria-label', '菜单');
    abs(menu, menuRect);
    this.el.appendChild(menu);
    this.hintBtn = null;
    if (hintRect) {
      const hb = button('xg-iconbtn mc-hint-btn', icon('hint'), () => this.onHint(), 'hint');
      hb.setAttribute('aria-label', '提示');
      abs(hb, hintRect);
      this.el.appendChild(hb);
      this.hintBtn = hb;
    }
    this.youAre = [];
    this.board.render(this.ctx.state, true);
    this.refreshNotes();
    this.refreshHud();
    if (this.menuOpen) {
      this.menuOpen.remove();
      this.menuOpen = null;
    }
  }

  // ------------------------------------------------------------------ HUD
  private refreshHud(): void {
    const s = this.ctx.state;
    const p = s.result ? -1 : playerToAct(s);
    const thinking = this.ctx.phase === 'thinking';
    for (let k = 0; k < this.bars.length; k++) {
      const seatPlayer = k; // bar 0 = near seat (player 0), bar 1 = far seat (player 1)
      let text: string;
      if (s.result) text = '这局结束啦';
      else if (thinking) text = `${this.nameOf(1)}在想`;
      else if (s.turn === -1) text = this.bars.length > 1 ? (p === seatPlayer ? '你先翻一个' : `${this.nameOf(p)}先翻`) : p === 0 ? '你先翻一个' : `${this.nameOf(p)}先翻一个`;
      else if (this.bars.length > 1) text = p === seatPlayer ? '轮到你了' : `等${this.nameOf(p)}走`;
      else text = this.m.opponent.kind === 'family' ? `轮到${this.nameOf(p)}了` : p === 0 ? '轮到你了' : `${this.nameOf(p)}在想`;
      this.bars[k].set(s.turn, text, { thinking });
      this.bars[k].setAvatar(this.level && p === 1 && !s.result ? opponentBadge(this.level, 40) : null);
    }
    this.quiet.set(quietDots(s));
    if (s.mode === 'fan') {
      const me: number = p >= 0 && s.colorOf[p as 0 | 1] !== -1 ? s.colorOf[p as 0 | 1] : RED;
      const kid = this.level ? (s.colorOf[0] === -1 ? RED : s.colorOf[0]) : me;
      this.intel.renderFan(s, 1 - kid, kid, { cols: this.o === 'portrait' ? 7 : 2, compact: this.o === 'landscape' || this.seating() === 'face' });
      this.showYouAre();
    } else if (s.mode === 'an' && this.know) {
      const kid = this.m.kidSide;
      const k = this.know[kid];
      this.intel.renderAn(1 - kid, this.enemyCounts(kid), certainDead(k, s), { cols: this.o === 'portrait' ? 6 : 2, compact: this.o === 'landscape' });
    } else {
      const names: [string, string] = this.m.opponent.kind === 'family' ? [this.m.opponent.names[0], this.m.opponent.names[1]] : ['我们', this.nameOf(1)];
      this.intel.renderLosses(s, names, 8);
    }
    this.refreshHintBtn();
  }

  private refreshHintBtn(): void {
    if (!this.hintBtn) return;
    const s = this.ctx.state;
    const usable = !s.result && this.ctx.phase !== 'thinking' && this.ctx.players[playerToAct(s)] === 'human' && s.turn !== -1;
    this.hintBtn.disabled = !usable;
    this.hintBtn.classList.toggle('is-off', !usable);
  }

  /** 翻翻棋: who plays which colour, next to each seat's turn bar, once the first flip decided it */
  private showYouAre(): void {
    const s = this.ctx.state;
    for (const el of this.youAre) el.remove();
    this.youAre = [];
    if (s.colorOf[0] === -1) return;
    const face = this.seating() === 'face';
    const family = this.m.opponent.kind === 'family';
    const chip = (player: number, text: string, rect: Rect, rot: number) => {
      const c = s.colorOf[player] as number;
      const el = div('mc-youare', `<i></i><span>${text}</span>`);
      el.dataset.c = String(c);
      el.dataset.testid = `youare-${player}`;
      el.addEventListener('click', () => void this.say(c === 0 ? 'mc.ref.youare.red' : 'mc.ref.youare.blue'));
      abs(el, rect);
      if (rot) el.style.transform = `rotate(${rot}deg)`;
      this.el.appendChild(el);
      this.youAre.push(el);
    };
    const colourName = (p: number) => (s.colorOf[p] === 0 ? '红方' : '蓝方');
    const st = this.safeTop;
    if (face) {
      if (this.o === 'portrait') {
        chip(0, `你是${colourName(0)}`, { x: 76, y: 1068 - 48, w: 140, h: 44 }, 0);
        chip(1, `你是${colourName(1)}`, { x: 594, y: st + 16, w: 140, h: 44 }, 180);
      } else {
        chip(0, `你是${colourName(0)}`, { x: 12 + 26 - 70, y: 640 - 22, w: 140, h: 44 }, 90);
        chip(1, `你是${colourName(1)}`, { x: 1068 - 26 - 70, y: 170 - 22, w: 140, h: 44 }, -90);
      }
      return;
    }
    if (!family) {
      chip(0, `你是${colourName(0)}`, this.o === 'portrait' ? { x: 76, y: st + 16, w: 140, h: 44 } : { x: 832, y: 810 - 12 - 56 - 56, w: 160, h: 44 }, 0);
      return;
    }
    // side by side: a two-line legend (names + colours)
    const legend = div('mc-legend', [0, 1].map((p) => `<span data-c="${s.colorOf[p]}"><i></i>${this.nameOf(p)}·${colourName(p)}</span>`).join(''));
    legend.dataset.testid = 'youare-legend';
    abs(legend, this.o === 'portrait' ? { x: 76, y: st + 8, w: 144, h: 60 } : { x: 832, y: 810 - 12 - 62 - 62, w: 170, h: 60 });
    legend.addEventListener('click', () => void this.say(s.colorOf[playerToAct(s)] === 0 ? 'mc.ref.youare.red' : 'mc.ref.youare.blue'));
    this.el.appendChild(legend);
    this.youAre.push(legend);
  }

  /** 暗棋: 参谋笔记 badges + 侦察便签 tags on the opponent's pieces (child's view) */
  private refreshNotes(): void {
    const s = this.ctx.state;
    if (s.mode !== 'an' || !this.know) return;
    const kid = this.m.kidSide;
    const k = this.know[kid];
    for (let p = 0; p < s.np; p++) {
      if (s.pside[p] === kid || !s.palive[p]) continue;
      const shown = s.ptype[p] === FLAG && s.flagShown[s.pside[p]];
      const b = this.notesOn && !shown ? badgeOf(k, p) : null;
      this.board.setBadge(p, b ? badgeHtml(b) : null);
      const t = this.tags.get(p);
      this.board.setTag(p, t ? tagHtml(t) : null);
    }
  }

  // ------------------------------------------------------------------ reducer plumbing
  private dispatch(ev: MatchEvent): void {
    if (this.ended && ev.type !== 'animDone') return;
    const step = transition(this.ctx, ev);
    this.ctx = step.ctx;
    for (const e of step.effects) this.queue = this.queue.then(() => this.run(e)).catch((err) => console.error(err));
  }

  private async run(e: Effect): Promise<void> {
    switch (e.kind) {
      case 'select':
        this.app.play('ui-pick');
        for (let p = 0; p < this.ctx.state.np; p++) if (p !== e.pid) this.board.setLifted(p, false);
        this.board.setLifted(e.pid, true);
        this.board.showMoves(e.moves);
        return;
      case 'deselect':
        this.board.clearHighlights();
        for (let p = 0; p < this.ctx.state.np; p++) this.board.setLifted(p, false);
        return;
      case 'deny':
        return this.deny(e.pid, e.why, e.drop);
      case 'info':
        return this.info(e.pid);
      case 'deadTap':
        if (!e.animating) for (const b of this.bars) b.wobble();
        return;
      case 'turn':
        this.refreshHud();
        if (this.m.opponent.kind !== 'family' && !e.ai && this.turnsSpoken < 3 && this.ctx.state.ply > 0) {
          this.turnsSpoken++;
          void this.say('mc.ref.turn.you');
        }
        if (!e.ai) this.checkFanTeach();
        return;
      case 'think':
        return this.think(e.id, e.state);
      case 'commit':
        this.observeCommit(e.event, e.before, e.player);
        return this.animateCommit(e.event, e.before, e.after);
      case 'coach':
        return this.showCoach(e.alert);
      case 'save':
        this.saveResume();
        return;
      case 'restored':
        if (this.m.mode === 'an') this.know = knowledgeFor(this.startState, this.ctx.notes);
        this.board.render(this.ctx.state, true);
        this.board.clearLastMove();
        this.refreshNotes();
        this.refreshHud();
        return;
      case 'end':
        return this.end(e.result);
    }
  }

  private async deny(pid: number, why: Why, drop: boolean): Promise<void> {
    if (why === 'own') return;
    this.app.play('bump');
    this.board.dropRefused(pid);
    if (drop) await this.board.springBack(pid);
    void this.board.deny(pid, why === 'hq' ? 'lock' : null);
    const line = WHY_LINE[why];
    if (line) void this.say(line, 'thinking');
  }

  private info(pid: number): void {
    const s = this.ctx.state;
    const face = this.board.faceOf(s, pid);
    if (face === 'up') {
      this.app.play('ui-tap');
      void this.say(`mc.w.${NAMES[s.ptype[pid]]}`);
    } else if (face === 'back') {
      // E20: an enemy back in 暗棋 — "?" shake and its 参谋笔记, if any
      this.app.play('ui-tap');
      void this.board.deny(pid, 'q');
      if (this.know && this.notesOn) {
        const b = badgeOf(this.know[this.m.kidSide], pid);
        if (b) void this.say(b.line, 'thinking');
      }
    }
  }

  // ------------------------------------------------------------------ the robot
  private think(id: string, s: GameState): void {
    this.refreshHud();
    const started = performance.now();
    const me = (s.mode === 'fan' ? (s.turn === -1 ? RED : s.turn) : s.turn) as Side;
    const deliver = (note: string) => {
      if (this.ended || this.ctx.thinkId !== id) return;
      const a = parseNote(this.ctx.state, note) ?? legalMoves(this.ctx.state)[0];
      if (!a) return;
      const send = () => this.dispatch({ type: 'aiMove', id, note: toNote(a), action: a });
      if (this.hidden) this.pendingAi = send; // E18: animate when the page is back
      else send();
    };
    const extra = this.app.test ? Number(this.app.params.get('aiwait') ?? 0) : 0;
    if (!this.ai) {
      // ?test=1&opp=dev family position: seeded random mover
      this.aiTimer = this.bag.timeout(() => {
        const ms = legalMoves(s);
        if (ms.length) deliver(toNote(ms[(s.ply * 7919) % ms.length]));
      }, d(MS.thinkMin) + extra);
      return;
    }
    const view = redact(s, me, this.know ? this.know[me] : null, this.know ? this.enemyCounts(me) : null);
    // the parent panel may override the ladder robot's strength (never Dad's 和电脑下 games)
    const lvl = ((!this.m.free && this.app.save.settings.aiOverride) || this.level || 1) as Level;
    void this.ai.think(id, view, lvl, `mc:ai:${this.m.id}:${s.ply}`).then((ans) => {
      // spec §10.2 R6: an infeasible knowledge mask fell back to count-only sampling (never seen in self-play)
      if (ans.stats?.beliefResets) this.app.mark('belief-reset', { ply: s.ply, n: ans.stats.beliefResets });
      const wait = Math.max(0, d(MS.thinkMin) - (performance.now() - started)) + extra;
      this.aiTimer = this.bag.timeout(() => deliver(ans.note), wait);
    });
  }

  // ------------------------------------------------------------------ coach (C1–C5)
  private coachFor(s: GameState, a: Action): CoachAlert | null {
    if (this.ctx && this.ctx.players[playerToAct(s)] !== 'human') return null;
    const kid = this.kidColour(s);
    if (kid < 0) return null;
    let hidden: number[] | null = null;
    if (s.mode === 'fan') {
      hidden = new Array(24).fill(0);
      for (let p = 0; p < s.np; p++) if (s.palive[p] && !s.pup[p]) hidden[s.pside[p] * 12 + s.ptype[p]]++;
    }
    return coachCheck(s, a, { me: kid as Side, knowledge: this.know ? this.know[kid] : null, hidden, used: this.coachUsed, enabled: this.coachOn });
  }

  private showCoach(alert: CoachAlert): Promise<void> {
    if (alert.code !== 'C1') this.coachUsed++;
    this.m.coachWarnings++;
    this.board.pulse(alert.marks, 3);
    void this.say(alert.line, 'thinking');
    this.app.mark('coach', { code: alert.code });
    let extra = '';
    if (alert.beads) {
      const [big, all] = alert.beads;
      extra = `<div class="mc-beads" data-testid="beads"><div><span>可能比它大的</span>${'<i class="is-hot"></i>'.repeat(Math.min(big, 12))}</div><div><span>还没翻的</span>${'<i></i>'.repeat(Math.min(all, 24))}</div></div>`;
    }
    const text = this.app.voice.text(alert.line);
    return this.sheet(text + extra, [
      { label: '还是走这步', kind: 'secondary', act: () => {
        this.m.coachOverrides++;
        void this.say('mc.coach.ok');
        this.dispatch({ type: 'confirm', yes: true });
      } },
      { label: '再想想', kind: 'primary', act: () => this.dispatch({ type: 'confirm', yes: false }) },
    ]);
  }

  // ------------------------------------------------------------------ 💡 hint (two levels, never moves)
  private async onHint(): Promise<void> {
    const s = this.ctx.state;
    if (s.result || this.ctx.phase === 'thinking' || this.ctx.players[playerToAct(s)] !== 'human' || s.turn === -1 || this.hint.busy) {
      this.app.play('ui-locked');
      return;
    }
    if (this.hint.ply !== s.ply) this.hint = { ply: s.ply, stage: 0, note: null, busy: false };
    const me = s.turn as Side;
    this.app.play('hint');
    this.m.hints++;
    this.app.mark('hint', { level: this.hint.stage + 1, ply: s.ply });
    const k = this.know ? this.know[me] : null;
    if (this.hint.stage === 0) {
      this.hint.stage = 1;
      const danger = flagDangerNow(s, me, k);
      if (danger.length) {
        this.board.pulse(danger, 3);
        void this.say('mc.coach.flag', 'thinking');
        return;
      }
      const sure = this.sureWin(s, me);
      if (sure >= 0) {
        this.board.pulse([sure], 3);
        void this.say('mc.hint.piece', 'thinking');
        return;
      }
      const note = await this.hintMove();
      const a = note ? parseNote(this.ctx.state, note) : null;
      if (a && isMove(a) && this.ctx.state.ply === s.ply) {
        this.board.pulse([a.from], 3);
        void this.say('mc.hint.piece', 'thinking');
      }
      return;
    }
    const note = await this.hintMove();
    const a = note ? parseNote(this.ctx.state, note) : null;
    if (!a || this.ctx.state.ply !== s.ply) return;
    if (isMove(a)) {
      this.board.showHintArrow(a.path);
      this.board.pulse([a.from], 2);
    } else if (isFlip(a)) this.board.pulse([a.flip], 3);
    void this.say('mc.hint.where', 'thinking');
  }

  /** an enemy piece the child can take for sure (public information), −1 if none */
  private sureWin(s: GameState, me: Side): number {
    let best = -1, bestV = -1;
    for (const a of legalMoves(s)) {
      if (!isMove(a) || a.kind !== 'attack') continue;
      const def = s.board[a.to];
      let known = -1;
      if (s.mode === 'an') {
        if (s.ptype[def] === FLAG && s.flagShown[s.pside[def]]) known = FLAG;
        else if (this.know) {
          const m = this.know[me].mask[def];
          if (m && (m & (m - 1)) === 0) known = 31 - Math.clz32(m);
        }
      } else known = s.ptype[def];
      if (known < 0) continue;
      const r = resolve(s.ptype[a.pid], known);
      if ((r === 'A' || r === 'F') && (r === 'F' ? 1000 : known) > bestV) {
        bestV = r === 'F' ? 1000 : known;
        best = a.to;
      }
    }
    return best;
  }

  private async hintMove(): Promise<string | null> {
    if (this.hint.note) return this.hint.note;
    if (!this.ai) this.ai = new AiClient({ test: this.app.test });
    const s = this.ctx.state;
    const me = s.turn as Side;
    this.hint.busy = true;
    const view = redact(s, me, this.know ? this.know[me] : null, this.know ? this.enemyCounts(me) : null);
    const ans = await this.ai.hint(`hint:${this.m.id}:${s.ply}`, view, `mc:hint:${this.m.id}:${s.ply}`);
    this.hint.busy = false;
    if (this.hint.ply === s.ply) this.hint.note = ans.note;
    return ans.note;
  }

  // ------------------------------------------------------------------ 侦察便签 (long press an enemy back)
  private longPress(at: number): void {
    const s = this.ctx.state;
    if (s.mode !== 'an' || this.ended) return;
    const pid = s.board[at];
    if (pid < 0 || s.pside[pid] === this.m.kidSide || this.board.faceOf(s, pid) !== 'back') return;
    this.openTagMenu(pid, at);
  }

  private openTagMenu(pid: number, at: number): void {
    this.tagMenu?.remove();
    this.app.play('ui-open');
    const c = this.board.center(at);
    const g = this.board.g.rect;
    const scrim = div('mc-scrim mc-scrim--clear');
    const menu = div('mc-tagmenu');
    menu.dataset.testid = 'tag-menu';
    const R = 86;
    const items = [...TAGS.map((t) => ({ id: t.id as TagKind | 'none', label: t.label, html: tagHtml(t.id) })), { id: 'none' as const, label: '不猜了', html: icon('close') }];
    items.forEach((it, k) => {
      const ang = -Math.PI / 2 + (k * 2 * Math.PI) / items.length;
      const b = button('mc-tagmenu__b', `${it.html}<span>${it.label}</span>`, () => {
        close();
        if (it.id === 'none') this.tags.delete(pid);
        else this.tags.set(pid, it.id);
        this.app.play(it.id === 'none' ? 'ui-close' : 'ui-pop');
        this.refreshNotes();
        this.saveResume();
      }, `tag-${it.id}`);
      b.style.left = `${Math.round(Math.cos(ang) * R)}px`;
      b.style.top = `${Math.round(Math.sin(ang) * R)}px`;
      menu.appendChild(b);
    });
    const x = g.x + Math.min(g.w - 130, Math.max(130, c.x)), y = g.y + Math.min(g.h - 120, Math.max(120, c.y));
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    const close = () => {
      scrim.remove();
      this.tagMenu = null;
    };
    scrim.addEventListener('click', (e) => {
      if (e.target === scrim) close();
    });
    scrim.appendChild(menu);
    this.el.appendChild(scrim);
    this.tagMenu = scrim;
  }

  // ------------------------------------------------------------------ bookkeeping on every commit
  private observeCommit(ev: MoveEvent, before: GameState, player: 0 | 1): void {
    if (this.know) {
      observe(this.know[0], before, ev);
      observe(this.know[1], before, ev);
      for (const p of ev.removed) {
        this.tags.delete(p);
        this.board.setBadge(p, null);
      }
    }
    if (this.hint.ply !== before.ply + 1) this.hint = { ply: -1, stage: 0, note: null, busy: false };
    this.board.clearHintArrow();
    const kid = this.kidColour(before);
    const a = ev.action;
    // knowledge-card events (spec §5.5)
    if (ev.outcome && isMove(a)) {
      const tA = before.ptype[ev.att!], tD = before.ptype[ev.def!];
      const kidAtt = before.pside[ev.att!] === kid;
      if (ev.outcome === 'B' && ((kidAtt && tA === BOMB && tD >= 10) || (!kidAtt && tD === BOMB && tA >= 10))) this.events.add('bomb-trade');
      if (ev.outcome === 'F' && kidAtt) this.events.add('flag-capture');
    }
    // 行营 card: a ≥ 团长 that was under a certain attack steps into a camp (明棋 / 翻翻棋: public)
    if (player === 0 && isMove(a) && a.kind === 'move' && isCamp(a.to) && before.mode !== 'an' && rankOf(before.ptype[a.pid]) >= 5) {
      const enemy = 1 - kid;
      const probe: GameState = { ...before, turn: enemy as Side };
      for (let q = 0; q < probe.np; q++) {
        if (probe.pside[q] !== enemy || !pieceCanMove(probe, q)) continue;
        if (resolve(probe.ptype[q], before.ptype[a.pid]) !== 'A') continue;
        if (pieceMoves(probe, q).some((m) => m.to === a.from)) {
          this.events.add('camp-save');
          break;
        }
      }
    }
  }

  /** the five 翻翻棋 teaching points of the child's first ladder 翻翻棋 (each once, ever) */
  private checkFanTeach(): void {
    if (!this.fanTeach || this.ended) return;
    const s = this.ctx.state;
    if (s.colorOf[0] === -1) return;
    const seen = this.app.save.firstRun.fanCoach;
    const kid = s.colorOf[0];
    const show = (id: FanPoint, line: string, stations: number[]) => {
      seen.push(id);
      this.app.persist();
      // a light touch: pulse + one line, the board stays live (spec §9.7 #10: don't interrupt)
      this.board.pulse(stations, 2);
      void this.say(line, 'surprised');
      if (seen.length >= 5) this.fanTeach = false;
    };
    if (!seen.includes('rail')) {
      for (let p = 0; p < s.np; p++) {
        if (s.pside[p] !== kid || !pieceCanMove(s, p) || !isRail(s.ppos[p])) continue;
        const far = pieceMoves(s, p).find((m) => m.path.length > 2);
        if (far) return show('rail', 'mc.coach.fan.rail', far.path);
      }
    }
    if (!seen.includes('camp')) {
      for (let p = 0; p < s.np; p++) {
        if (!s.palive[p] || !s.pup[p]) continue;
        const at = s.ppos[p];
        if (isCamp(at) || adj[at].some(isCamp)) {
          if (isCamp(at)) return show('camp', 'mc.coach.fan.camp', [at]);
        }
      }
    }
    if (!seen.includes('hq')) {
      for (let p = 0; p < s.np; p++) if (s.palive[p] && s.pup[p] && isHQ(s.ppos[p]) && s.ptype[p] !== FLAG) return show('hq', 'mc.ref.hq', [s.ppos[p]]);
    }
  }

  /** flip-time teaching points (mine / bomb / flag) */
  private fanFlipTeach(ev: MoveEvent): void {
    if (!this.fanTeach || !ev.flipped) return;
    const seen = this.app.save.firstRun.fanCoach;
    const t = ev.flipped.type;
    const at = this.ctx.state.ppos[ev.flipped.pid];
    let id: FanPoint | null = null, line = '';
    if ((t === MINE || t === BOMB) && !seen.includes('mine')) {
      id = 'mine';
      line = t === MINE ? 'mc.coach.fan.mine' : 'mc.coach.fan.bomb';
    } else if (t === FLAG && !seen.includes('flag')) {
      id = 'flag';
      line = 'mc.coach.fan.flag';
    }
    if (!id) return;
    seen.push(id);
    this.app.persist();
    this.board.pulse([at], 2);
    void this.say(line, 'surprised');
    if (seen.length >= 5) this.fanTeach = false;
  }

  // ------------------------------------------------------------------ the move animation
  private wait(ms: number): Promise<void> {
    return this.bag.wait(ms);
  }

  private isRailMove(path: number[]): boolean {
    if (path.length > 2) return true;
    return path.length === 2 && isRail(path[0]) && isRail(path[1]) && isRailEdge(path[0], path[1]);
  }

  private async animateCommit(ev: MoveEvent, before: GameState, after: GameState): Promise<void> {
    const b = this.board;
    b.clearHighlights();
    for (let p = 0; p < before.np; p++) b.setLifted(p, false);
    const a = ev.action;
    if (isFlip(a)) {
      const pid = before.board[a.flip];
      this.app.play('flip');
      // the flip reveals: render the new face mid-turn
      await b.flip(pid, after);
      if (before.turn === -1) {
        this.guide?.mood('surprised');
        void this.say(after.colorOf[0] === 0 ? 'mc.ref.youare.red' : 'mc.ref.youare.blue');
      } else this.fanFlipTeach(ev);
      if (this.fanTeach && ev.flipped && isHQ(a.flip) && !this.app.save.firstRun.fanCoach.includes('hq')) {
        this.app.save.firstRun.fanCoach.push('hq');
        void this.say('mc.ref.hq');
      }
      await this.afterEffects(ev, after);
      return this.finishCommit(after, null);
    }
    if (!isMove(a)) return this.finishCommit(after, null);
    const rail = this.isRailMove(a.path);
    const railClick = (k: number) => this.app.play('mc.rail', { step: k });
    const dragged = b.takeDropped(a.pid);
    if (ev.outcome === null) {
      if (dragged) {
        this.app.play('ui-snap');
        await b.glideTo(a.pid, a.to);
      } else {
        if (rail) b.flashPath(a.path, dm(Math.min(MS.railMax, MS.railBase + MS.railPerStation * (a.path.length - 1))) + 200);
        await b.moveAlong(a.pid, a.path, { rail, onStation: rail ? railClick : undefined });
      }
      this.app.play('place-piece');
      if (isHQ(a.to)) {
        // a piece just froze in a 大本营
        if (!this.app.save.firstRun.seenHqTip && this.m.mode === 'fan') {
          this.app.save.firstRun.seenHqTip = true;
          void this.say('mc.ref.hq');
        }
      }
      await this.afterEffects(ev, after);
      return this.finishCommit(after, a.path);
    }
    // ---- collision
    this.collisions++;
    const att = ev.att!, def = ev.def!;
    if (dragged) await b.glideTo(att, a.to, 0.7);
    else {
      if (rail) b.flashPath(a.path, 500);
      await b.moveAlong(att, a.path, { rail, stopShort: 0.7, onStation: rail ? railClick : undefined });
    }
    this.app.play('capture');
    await b.clash(att, def);
    const at = b.center(a.to);
    const viewerSees = (pid: number) => b.faceOf(before, pid) === 'up' && b.faceOf(after.palive[pid] ? after : before, pid) === 'up';
    const hidden = before.mode === 'an' && (!viewerSees(att) || !viewerSees(def));
    const tAtt = before.ptype[att], tDef = before.ptype[def];
    const kidLostBig = ev.removed.some((p) => before.pside[p] === this.m.kidSide && rankOf(before.ptype[p]) >= 7);
    const kidSeesBomb = (tAtt === BOMB && before.pside[att] === this.m.kidSide) || (tDef === BOMB && before.pside[def] === this.m.kidSide);
    const big = ev.outcome === 'F' || ev.flagShown.length > 0 || kidSeesBomb || kidLostBig;
    if (hidden) {
      const fast = this.app.save.settings.refereeSpeed === 'fast';
      const full = big || (!fast && this.collisions <= 3);
      await refereeReveal(b.fxLayer, this.clampFx(at.x, at.y - 46), ev.outcome!, full, { play: (n) => this.app.play(n), say: (l) => this.say(l, 'surprised'), whistle: () => this.guide?.mood('surprised') }, (ms) => this.wait(ms));
    } else {
      const op = ev.outcome === 'A' ? '&gt;' : ev.outcome === 'D' ? '&lt;' : ev.outcome === 'B' ? '=' : '&gt;';
      const special = tAtt === BOMB || tDef === BOMB || tDef === MINE || tDef === FLAG;
      const opHtml = special ? (ev.outcome === 'A' ? mcIcon('swords') : ev.outcome === 'D' ? mcIcon('shield') : ev.outcome === 'B' ? mcIcon('smoke') : mcIcon('flag')) : `<span class="op">${op}</span>`;
      void fx.plate(b.fxLayer, this.clampFx(at.x, at.y - 52), `${RANK_HTML(before, att)}${opHtml}${RANK_HTML(before, def)}`, special ? 500 : (MS.plateHold as number));
      await this.wait(d(MS.plate * 0.6));
    }
    await this.resolveFx(ev, before, after, hidden);
    await this.afterEffects(ev, after);
    return this.finishCommit(after, a.path);
  }

  /** keep plates / badges inside the board */
  private clampFx(x: number, y: number): { x: number; y: number } {
    const g = this.board.g.rect;
    return { x: Math.min(g.w - 110, Math.max(110, x)), y: Math.min(g.h - 40, Math.max(40, y)) };
  }

  /** what happens to the two tiles after the verdict */
  private async resolveFx(ev: MoveEvent, before: GameState, after: GameState, hidden: boolean): Promise<void> {
    const b = this.board;
    const a = ev.action as { to: number; from: number };
    const att = ev.att!, def = ev.def!;
    const tAtt = before.ptype[att], tDef = before.ptype[def];
    const at = b.center(a.to);
    const seesOwn = (pid: number) => !hidden || before.pside[pid] === this.m.kidSide;
    const tray = (pid: number) => ({ x: at.x, y: before.pside[pid] === 0 ? at.y + 120 : at.y - 120 });
    switch (ev.outcome) {
      case 'A': {
        if (tDef === MINE && tAtt === ENG && seesOwn(def) && seesOwn(att)) {
          this.app.play('mc.shovel');
          void fx.sparks(b.fxLayer, at, 8);
          void this.say('mc.ref.mine.clear', 'happy');
        }
        await Promise.all([b.remove(def, tray(def)), this.wait(d(120))]);
        await b.settle(att, a.to);
        void b.gleam(att);
        return;
      }
      case 'D': {
        if (tDef === MINE && (!hidden || before.pside[def] === this.m.kidSide)) {
          this.app.play('mc.mine');
          void fx.mineDust(b.fxLayer, at);
          void b.shake(3, MS.mineShake);
          void this.say('mc.ref.mine', 'surprised');
        }
        await b.remove(att, tray(att));
        void b.gleam(def);
        // the defender's tile was never moved; nothing to settle
        return;
      }
      case 'B': {
        const bombVisible = (tAtt === BOMB && seesOwn(att)) || (tDef === BOMB && seesOwn(def));
        if (bombVisible) {
          this.app.play('mc.boom');
          void fx.bomb(b.fxLayer, at);
          void b.shake(6, MS.bombShake);
          void this.say('mc.ref.bomb', 'surprised');
        } else {
          void fx.smoke(b.fxLayer, at);
          void fx.shards(b.fxLayer, at, '#9aa0a8');
        }
        await Promise.all([b.remove(att), b.remove(def)]);
        return;
      }
      case 'F': {
        this.app.play('mc.flag');
        await b.remove(def, { x: at.x, y: at.y - 60 });
        await b.settle(att, a.to);
        const kidWon = this.m.opponent.kind !== 'family' && after.pside[att] === this.kidColour(before);
        if (kidWon) void fx.ribbons(b.fxLayer, at);
        else void fx.sparks(b.fxLayer, at, 10);
        void b.gleam(att);
        void this.say('mc.ref.flag', kidWon || this.m.opponent.kind === 'family' ? 'celebrating' : 'encouraging');
        await this.wait(d(MS.flagCapture / 2));
        return;
      }
    }
  }

  /** flags shown after a 司令 went down, auto flips, quiet warning */
  private async afterEffects(ev: MoveEvent, after: GameState): Promise<void> {
    const b = this.board;
    for (const pid of ev.autoFlipped) {
      this.app.play('flip');
      await b.flip(pid, after);
    }
    if (ev.flagShown.length) {
      for (const side of ev.flagShown) {
        let flagPid = -1;
        for (let p = 0; p < after.np; p++) if (after.palive[p] && after.pside[p] === side && after.ptype[p] === FLAG) flagPid = p;
        b.render(after, true);
        const el = flagPid >= 0 ? b.pieceEl(flagPid) : null;
        if (el) await el.animate([{ transform: el.style.transform + ' scale(1)' }, { transform: el.style.transform + ' scale(1.25)' }, { transform: el.style.transform + ' scale(1)' }], { duration: d(MS.flagShow) }).finished.catch(() => undefined);
        this.app.play('ui-pop-big');
        void this.say(side === RED ? 'mc.ref.marshal.red' : 'mc.ref.marshal.blue', 'surprised');
      }
    }
    const dots = quietDots(after);
    if (dots === 10 && !this.quietWarned && !after.result) {
      this.quietWarned = true;
      void this.say(this.m.ladder ? 'mc.ref.quiet.count' : 'mc.ref.quiet.draw', 'thinking');
    }
    if (dots === 0) this.quietWarned = false;
  }

  private finishCommit(after: GameState, path: number[] | null): void {
    this.board.render(after);
    this.refreshNotes();
    if (path && !after.result) this.board.showLastMove(path);
    this.saveResume();
    this.dispatch({ type: 'animDone' });
  }

  // ------------------------------------------------------------------ end of game
  private async end(r: GameResult): Promise<void> {
    if (this.ended) return;
    this.ended = true;
    this.ai?.reset();
    this.refreshHud();
    const s = this.ctx.state;
    if (r.reason === 'count' || r.reason === 'count-draw') {
      void this.say('mc.ref.count.start', 'thinking');
      await this.countAnimation(s, r);
    } else if (r.reason === 'no-moves') {
      void this.say(this.m.opponent.kind === 'family' ? 'mc.ref.nomoves.win' : this.playerOf(r.winner) === 0 ? 'mc.ref.nomoves.win' : 'mc.ref.nomoves.lose');
      await this.wait(d(900));
    } else if (r.reason === 'quiet' || r.reason === 'ply-cap' || r.reason === 'agreed') {
      if (r.reason !== 'agreed') void this.say('mc.ref.draw.quiet');
      await this.wait(d(700));
    } else if (r.reason === 'both-immobile') {
      void this.say('mc.ref.draw.both');
      await this.wait(d(900));
    } else await this.wait(d(500));
    let guesses: { right: number; total: number } | null = null;
    if (this.m.mode === 'an') guesses = await this.revealAll(s);
    const book = this.recordEnd(r, guesses);
    const data: ResultData = {
      result: r,
      mode: this.m.mode,
      family: this.m.opponent.kind === 'family',
      names: this.m.opponent.kind === 'family' ? [this.m.opponent.names[0], this.m.opponent.names[1]] : ['你', this.nameOf(1)],
      kidPlayer: 0,
      winnerPlayer: r.winner === -1 ? -1 : this.playerOf(r.winner),
      match: { ...this.m, actions: [...this.ctx.notes] },
      undos: this.ctx.undos,
      start: this.custom ? this.startState : undefined,
      level: this.level ?? undefined,
      ...book,
      guesses,
    };
    this.app.go({ name: 'result', data });
  }

  /** 暗棋: every hidden piece turns over in a 40 ms wave; tags are marked ✓/✗ */
  private async revealAll(s: GameState): Promise<{ right: number; total: number } | null> {
    void this.say('mc.end.reveal', 'happy');
    const kid = this.m.kidSide;
    const downs: number[] = [];
    for (let p = 0; p < s.np; p++) if (s.palive[p] && s.pside[p] !== kid && this.board.faceOf(s, p) === 'back') downs.push(p);
    this.board.clearBadges();
    this.board.setOpts({ viewer: -1 });
    let right = 0, total = 0;
    for (const [pid, t] of this.tags) {
      total++;
      if (tagCorrect(t, s.ptype[pid])) right++;
    }
    for (let i = 0; i < downs.length; i++) {
      const p = downs[i];
      if (i % 4 === 0) this.app.play('flip');
      void this.board.flip(p, s);
      const t = this.tags.get(p);
      if (t) {
        const ok = tagCorrect(t, s.ptype[p]);
        this.board.setTag(p, `${tagHtml(t)}<i class="mc-tag__mark ${ok ? 'is-ok' : 'is-no'}">${ok ? icon('check') : icon('close')}</i>`);
      }
      await this.wait(d(40));
    }
    await this.wait(d(900));
    return total ? { right, total } : null;
  }

  private recordEnd(r: GameResult, guesses: { right: number; total: number } | null): Pick<ResultData, 'promotions' | 'newCards' | 'unlocked' | 'offer'> {
    const save = this.app.save;
    if (!this.custom) save.resume = null;
    const out: Pick<ResultData, 'promotions' | 'newCards' | 'unlocked' | 'offer'> = { promotions: [], newCards: [], unlocked: null, offer: 0 };
    const wp = r.winner === -1 ? -1 : this.playerOf(r.winner);
    if (this.m.opponent.kind === 'family') {
      const f = save.family;
      f.games++;
      f.log = [...(f.log ?? []), Date.now()].slice(-100);
      if (wp === 0) f.kidWins++;
      else if (wp === 1) f.dadWins++;
      else f.draws++;
      this.events.add('family');
      this.app.mark('family-game', { mode: this.m.mode, winner: wp });
    } else if (!this.m.free && !this.custom && this.level) {
      const outcome = wp === 0 ? 'win' : wp === 1 ? 'loss' : 'draw';
      const res = recordLadder(save, { mode: this.m.mode, level: this.level as 1 | 2 | 3 | 4, outcome, handicap: !!this.m.setup.handicap?.blue, undo: this.ctx.undos > 0 });
      out.unlocked = res.unlocked;
      out.offer = res.offer;
      if (this.m.mode === 'an') {
        this.events.add('ladder-an');
        // the first finished ladder 暗棋 switches the referee to "fast" (big moments only, §3.8)
        save.settings.refereeSpeed = 'fast';
      }
      if (guesses) {
        save.tagStats.games++;
        save.tagStats.correct += guesses.right;
        save.tagStats.total += guesses.total;
      }
    }
    if (!this.custom && !this.m.free) {
      out.newCards = awardCards(save, [...this.events]);
      out.promotions = promote(save);
      for (const r2 of out.promotions) this.app.mark('promotion', { rank: r2 });
    }
    this.app.persist();
    this.app.hub();
    this.app.mark('match-end', {
      mode: this.m.mode, family: this.m.opponent.kind === 'family', level: this.level, reason: r.reason, winner: r.winner, plies: this.ctx.state.ply,
      deadTaps: this.ctx.deadTaps, undos: this.ctx.undos, hints: this.m.hints, coachWarnings: this.m.coachWarnings, coachOverrides: this.m.coachOverrides,
    });
    return out;
  }

  /** 清点兵力: flip what is still face down, line the survivors up in two rows, add up the points */
  private async countAnimation(s: GameState, r: GameResult): Promise<void> {
    const b = this.board;
    // wave-flip every face-down piece (30 ms apart)
    const downs: number[] = [];
    for (let p = 0; p < s.np; p++) if (s.palive[p] && b.pieceEl(p)?.dataset.face !== 'up') downs.push(p);
    this.board.clearBadges();
    this.board.setOpts({ viewer: -1 });
    for (const p of downs) {
      void b.flip(p, s);
      await this.wait(d(30));
    }
    const layer = div('mc-count');
    layer.dataset.testid = 'count';
    const g = this.board.g.rect;
    abs(layer, { x: 0, y: 0, w: g.w, h: g.h });
    b.fxLayer.appendChild(layer);
    const rows: string[] = [];
    const tally = r.tally ?? [0, 0];
    for (const side of [BLUE, RED] as Side[]) {
      // the survivors as little pieces, biggest first; 地雷/军旗 count 0 and come last, dimmed
      const types: number[] = [];
      for (let p = 0; p < s.np; p++) if (s.palive[p] && s.pside[p] === side) types.push(s.ptype[p]);
      types.sort((a, b) => COUNT_POINTS[b] - COUNT_POINTS[a] || b - a);
      const items = types.map((t) => {
        const pts = COUNT_POINTS[t];
        return `<span class="mc-count__it${pts ? '' : ' is-zero'}" data-pts="${pts}">${tileSvg({ side, type: t, shape: 'wide', face: 'up', numbers: false }, 'mc-tile mc-mini')}<b>${pts}</b></span>`;
      });
      const dense = types.length > 12 ? ' is-dense' : '';
      rows.push(`<div class="mc-count__row${dense}" data-side="${side}"><div class="mc-count__items">${items.join('')}</div><div class="mc-count__sum" data-testid="sum-${side}">0</div></div>`);
    }
    layer.innerHTML = `<div class="mc-count__panel">${mcIcon('scale', 'mc-count__scale')}${rows.join('')}</div>`;
    layer.animate([{ opacity: 0 }, { opacity: 1 }], { duration: d(200), fill: 'forwards' });
    const total = d(MS.countTotal);
    for (const row of layer.querySelectorAll<HTMLElement>('.mc-count__row')) {
      const side = Number(row.dataset.side) as Side;
      const its = [...row.querySelectorAll<HTMLElement>('.mc-count__it')];
      const sumEl = row.querySelector<HTMLElement>('.mc-count__sum')!;
      let sum = 0;
      for (let k = 0; k < its.length; k++) {
        const pts = Number(its[k].dataset.pts);
        sum += pts;
        its[k].classList.add('is-on');
        sumEl.textContent = String(sum);
        if (pts) sumEl.animate([{ transform: 'scale(1.18)' }, { transform: 'scale(1)' }], { duration: d(160), easing: 'ease-out' });
        this.app.play('mc.tally', { step: k });
        await this.wait(Math.max(8, total / 2 / Math.max(1, its.length)));
      }
      sumEl.textContent = String(tally[side]);
    }
    const winRow = r.winner === -1 ? null : layer.querySelector<HTMLElement>(`.mc-count__row[data-side="${r.winner}"]`);
    if (winRow) {
      winRow.classList.add('is-win');
      this.app.play('ui-pop-big');
    }
    await this.wait(d(1400));
  }

  // ------------------------------------------------------------------ menu
  private openMenu(): void {
    if (this.menuOpen || this.ended) return;
    this.app.play('ui-open');
    this.dispatch({ type: 'lock' });
    const family = this.m.opponent.kind === 'family';
    const an = this.m.mode === 'an';
    const items: Array<{ label: string; ico: string; act: () => void; testid: string; show: boolean }> = [
      { label: '规则卡', ico: icon('book'), act: () => this.openRules(), testid: 'menu-rules', show: true },
      { label: this.notesOn ? '参谋笔记：开' : '参谋笔记：关', ico: mcIcon('eye'), act: () => this.toggleNotes(), testid: 'menu-notes', show: an },
      { label: this.coachOn ? '参谋提醒：开' : '参谋提醒：关', ico: icon('info'), act: () => this.toggleCoach(), testid: 'menu-coach', show: !family && !this.m.free },
      { label: '悔一步', ico: icon('undo'), act: () => this.askUndo(), testid: 'menu-undo', show: this.m.mode === 'ming' && this.ctx.history.length > 0 },
      { label: '求和', ico: mcIcon('hands'), act: () => this.askDraw(), testid: 'menu-draw', show: family },
      { label: '重新开始', ico: icon('restart'), act: () => this.askRestart(), testid: 'menu-restart', show: true },
      { label: '先离开（会存好）', ico: icon('home'), act: () => this.leave(), testid: 'menu-leave', show: true },
    ];
    const close = () => {
      scrim.remove();
      this.menuOpen = null;
      this.dispatch({ type: 'unlock' });
    };
    const scrim = div('mc-scrim');
    scrim.dataset.testid = 'menu-sheet';
    const sheet = div('mc-sheet mc-menu');
    sheet.innerHTML = '<h2>暂停一下</h2>';
    for (const it of items.filter((x) => x.show)) {
      sheet.appendChild(button('xg-btn xg-btn--secondary xg-btn--block', `${it.ico}<span>${it.label}</span>`, () => {
        this.app.play('ui-tap');
        close();
        it.act();
      }, it.testid));
    }
    sheet.appendChild(button('xg-btn xg-btn--primary xg-btn--block', `${icon('play')}<span>接着下</span>`, () => {
      this.app.play('ui-close');
      close();
    }, 'menu-close'));
    scrim.addEventListener('click', (e) => {
      if (e.target === scrim) close();
    });
    abs(sheet, this.o === 'portrait' ? { x: 205, y: 200, w: 400, h: 0 } : { x: 340, y: 60, w: 400, h: 0 });
    sheet.style.height = 'auto';
    scrim.appendChild(sheet);
    this.el.appendChild(scrim);
    this.menuOpen = scrim;
  }

  private openRules(): void {
    this.saveResume();
    this.app.go({ name: 'rules', from: 'match' });
  }

  private toggleNotes(): void {
    this.notesOn = !this.notesOn;
    this.app.save.settings.coachNotes = this.notesOn;
    this.app.persist();
    this.refreshNotes();
  }
  private toggleCoach(): void {
    this.coachOn = !this.coachOn;
    this.app.save.settings.coachAlerts = this.coachOn ? 'on' : 'off';
    this.app.persist();
    void this.say(this.coachOn ? 'mc.coach.ok' : 'mc.home.pick');
  }

  private sheet(text: string, actions: Array<{ label: string; kind: 'primary' | 'secondary'; act: () => void }>, rot = 0): Promise<void> {
    return new Promise((resolveP) => {
      const scrim = div('mc-scrim');
      const sheet = div('mc-sheet');
      sheet.dataset.testid = 'sheet';
      sheet.innerHTML = `<p class="mc-ask">${text}</p>`;
      const row = div('mc-row');
      for (const a of actions) {
        row.appendChild(button(`xg-btn xg-btn--${a.kind} xg-btn--lg`, `<span>${a.label}</span>`, () => {
          this.app.play('ui-tap');
          scrim.remove();
          a.act();
          resolveP();
        }, `sheet-${a.kind}`));
      }
      sheet.appendChild(row);
      abs(sheet, this.o === 'portrait' ? { x: 105, y: 380, w: 600, h: 0 } : { x: 240, y: 260, w: 600, h: 0 });
      sheet.style.height = 'auto';
      if (rot) sheet.style.transform = `rotate(${rot}deg)`;
      scrim.appendChild(sheet);
      this.el.appendChild(scrim);
    });
  }

  /** the other player has to agree (family); vs AI it's immediate */
  private otherSeatRot(): number {
    if (this.seating() !== 'face') return 0;
    const asker = playerToAct(this.ctx.state);
    const other = 1 - asker;
    return seatRotation(this.o, 'face', other === 0 ? 'near' : 'far');
  }

  private askUndo(): void {
    const lastMover = this.ctx.history.length ? playerToAct(this.ctx.history[this.ctx.history.length - 1]) : -1;
    if (lastMover < 0) return;
    if (this.m.opponent.kind !== 'family') {
      if (this.ctx.phase === 'thinking') {
        if (this.ctx.thinkId) this.ai?.cancel(this.ctx.thinkId);
        this.ctx = { ...this.ctx, phase: 'idle', lock: 0, thinkId: null };
      }
      this.dispatch({ type: 'undo', player: 0 });
      return;
    }
    const other = 1 - lastMover;
    this.dispatch({ type: 'lock' });
    void this.sheet(`${this.nameOf(lastMover)}想悔一步，${this.nameOf(other)}同意吗？`, [
      { label: '不同意', kind: 'secondary', act: () => this.dispatch({ type: 'unlock' }) },
      { label: '同意', kind: 'primary', act: () => {
        this.dispatch({ type: 'unlock' });
        this.dispatch({ type: 'undo', player: lastMover as 0 | 1 });
      } },
    ], seatRotation(this.o, this.seating(), other === 0 ? 'near' : 'far'));
  }

  private askDraw(): void {
    void this.say('mc.fam.draw.offer');
    this.dispatch({ type: 'lock' });
    void this.sheet('要和棋吗？两个人都同意才算', [
      { label: '接着下', kind: 'secondary', act: () => this.dispatch({ type: 'unlock' }) },
      { label: '同意和棋', kind: 'primary', act: () => {
        this.dispatch({ type: 'unlock' });
        this.dispatch({ type: 'agreeDraw' });
      } },
    ], this.otherSeatRot());
  }

  private askRestart(): void {
    this.dispatch({ type: 'lock' });
    void this.sheet('重新开始这一盘吗？', [
      { label: '不了', kind: 'secondary', act: () => this.dispatch({ type: 'unlock' }) },
      { label: '重新开始', kind: 'primary', act: () => {
        this.ended = true;
        clearTimeout(this.aiTimer);
        this.ai?.reset();
        const id = newMatchId();
        const m: SavedMatch = { ...this.m, id, actions: [], undos: 0, tags: {}, hints: 0, coachWarnings: 0, coachOverrides: 0, startedAt: Date.now(), setup: { ...this.m.setup, fanSeed: this.m.mode === 'fan' ? `mc:fan:${id}` : undefined } };
        this.app.save.resume = null;
        this.app.go({ name: 'match', setup: m });
      } },
    ]);
  }

  destroy(): void {
    clearTimeout(this.aiTimer);
    this.ai?.destroy();
    this.board.destroy();
    super.destroy();
  }

  /** debug hooks (?test=1) */
  debug() {
    return {
      ctx: () => this.ctx,
      dispatch: (ev: MatchEvent) => this.dispatch(ev),
      board: this.board,
      idle: () => this.queue,
      know: () => this.know,
      ai: () => this.ai,
      setQuiet: (q: number) => {
        this.ctx = { ...this.ctx, state: { ...this.ctx.state, quiet: q } };
      },
    };
  }
}
