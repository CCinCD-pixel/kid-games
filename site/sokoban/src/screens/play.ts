/**
 * S3 关卡屏 (spec §2.2, §3): HUD (level plate, push counter, 💡), the warehouse, the companion strip
 * and the action bar (撤销 / 重做 / 重来 / 地图). Input → session (logic first) → board choreography,
 * sounds and lines. Two-layer deadlock feedback, the stuck prompt, the hint ladder (H0–H3), the
 * chapter-0 tutor, saving the level in progress; on the win the launch sequence (S4), the result
 * card (S5) and what follows it (跳级考试, chapter rewards, the v1 finale, the 收尾卡). Fixed levels,
 * 跳级考试, 经典仓库, 镜子仓库 twins and 随机新仓库 orders all play here.
 */
import type { LayoutInfo } from '@kit/shell';
import { icon, mountSkipButton, shouldAutoSkip, showResult, type ResultAction } from '@kit/ui';
import { detectAll } from '@engines/puzzle/src/deadlock';
import { TIERS } from '@engines/puzzle/src/generator';
import { nb } from '@engines/puzzle/src/level';
import type { DeadType, Dir } from '@engines/puzzle/src/types';
import { stopMusic } from '../audio/music';
import { playSfx } from '../audio/sfx';
import { chapterEmblem } from '../art/emblems';
import { gameIcon } from '../art/icons';
import { cosmeticsOf } from '../art/robotArt';
import { applyCertPass, applyLevelResult, applyRandomResult, destFor, hallFor, type Outcome } from '../app/collection';
import type { AppCtx, Screen } from '../app/context';
import { deadMarkerFor, inputModeFor, stuckDelayFor, swipeEnabled, type InputMode } from '../app/settings';
import { canName, levelPassed, nextAfter, type NextStep } from '../app/unlock';
import { noteActive, noteLevel, noteRandomH3, slowDue, storeVisit } from '../app/visit';
import { chapterOf, levelById, paramsFor, type Dest, type LevelDef } from '../data';
import { PlaySession, holdGap, type SessionEvent } from '../game/session';
import { starsFor } from '../game/stars';
import { HintLadder } from '../hints/ladder';
import { attachBoardInput, type BoardGesture } from '../input/boardInput';
import { mountSky } from '../render/backdrop';
import { BoardView } from '../render/board';
import { ghostTapAt, hideGhostHand } from '../render/ghostHand';
import { HALLS } from '../render/halls';
import { PHONE_PAD_X, boardGeom, phoneLandscapeTall, playLayout, type Rect } from '../render/layout';
import { CompanionStrip } from './companion';
import { ceremonies, follow, tabOf } from './flow';
import { LaunchSequence } from './launch';

const DEAD_LINE: Record<DeadType, string> = {
  corner: 'sok.dead.corner.first',
  wall: 'sok.dead.wall.first',
  pair: 'sok.dead.pair.first',
  square: 'sok.dead.square.first',
};
const PRIORITY: DeadType[] = ['corner', 'wall', 'pair', 'square'];
const AUTO_LINE_ROLES = new Set(['intro', 'twist', 'boss', 'quiz', 'cert', 'random']);
/**
 * 0-1's ghost-hand teaching was seen: 跳过 tapped (or the parent switch), or 0-1 solved. A plain 0-1
 * entry (reload, 再来一次, map) then no longer teaches; only 机库 → 本领 → 再看一遍 → 第一课 does (QA fb1 r2).
 */
export const LESSON_SEEN = 'lesson.0-1';

export interface PlayOptions {
  fresh?: boolean;
  newChapter?: number;
  /** 0-1 asked for again from 机库 → 本领 → 再看一遍: its teaching plays even with 跳过开场和教学 on */
  lesson?: boolean;
}

/** praise lines of the last few result cards this page load (a lesson praise is not repeated within 3 results) */
const recentPraise: string[] = [];

export class PlayScreen implements Screen {
  readonly ownsClock = true;
  readonly el: HTMLDivElement;
  readonly session: PlaySession;
  board!: BoardView;
  private readonly strip: CompanionStrip;
  private readonly hud: HTMLDivElement;
  private readonly plate: HTMLButtonElement;
  private readonly chip: HTMLDivElement;
  private readonly inputLayer: HTMLDivElement;
  private readonly btn: { undo: HTMLButtonElement; redo: HTMLButtonElement; restart: HTMLButtonElement; map: HTMLButtonElement };
  private readonly stuckBtn: HTMLButtonElement;
  /** 💡 (none in the 跳级考试) */
  readonly hintBtn: HTMLButtonElement | null = null;
  ladder: HintLadder | null = null;
  private launch: LaunchSequence | null = null;
  /** the H3 ghost demo is playing: a tap aborts it, nothing else */
  private demo = false;
  /** hint presses this run (the result card shows it when > 0) */
  private detachInput: (() => void) | null = null;
  readonly mode: InputMode;
  private swipeOn: boolean;
  /** animations in flight; inputs queue (length 1) */
  private busy = false;
  private queued: (() => Promise<void>) | null = null;
  private locked = true;
  private gen = 0;
  private selected = -1;
  private unreachStreak = 0;
  private tipUnreachSaid = false;
  private pendingTimer: ReturnType<typeof setTimeout> | null = null;
  private stuck: { pushes: number; timer: ReturnType<typeof setTimeout> | null; shown: boolean } | null = null;
  private deadUndoSaid = false;
  private pushesSinceDead = -1;
  private spotSaid = false;
  private rewindRate = 1;
  private holdTimer: ReturnType<typeof setTimeout> | null = null;
  private holdCount = 0;
  private activeMs = 0;
  private lastActive = performance.now();
  private undoToStart = 0;
  private tutorTimers: ReturnType<typeof setTimeout>[] = [];
  /** 跳过 pills on screen (Dad's feedback 2026-10-08): removed when their moment ends or the screen goes */
  private readonly skipOffs = new Set<() => void>();
  /** the child (or Dad) skipped 0-1's ghost-hand teaching: no more hands or 先走到… lines this run */
  private tutorSkipped = false;
  /** the first lesson replayed on purpose (PlayOptions.lesson): the parent switch does not skip it */
  private readonly lesson: boolean;
  /** the 0-1 teaching's 跳过 pill (gone at the first push) */
  private tutorSkipOff: (() => void) | null = null;
  /** a `level-leave {hidden}` was written for the current hide (spec §8.8) */
  private hiddenLeave = false;
  private finished = false;
  private destroyed = false;
  readonly def: LevelDef;
  private firstEntry: boolean;
  private deadSeenThisRun = 0;
  /** tutorial ghost hands stop the moment the child acts */
  private ghostCtl = new AbortController();
  /** "回到能推完的地方" used this run (the pass is then not clean) */
  private usedRewind = false;
  /** onboarding marks (spec §2.3): active ms at the first push / first undo of this run */
  private firstPushMs: number | null = null;
  private firstUndoMs: number | null = null;
  private readonly onceKey = (k: string) => this.ctx.save.data.onceLines.includes(k);

  constructor(private readonly ctx: AppCtx, def: LevelDef, opts: PlayOptions = {}) {
    this.def = def;
    const save = ctx.save.data;
    this.session = new PlaySession(def.map, { deadMarker: deadMarkerFor(save, def) });
    this.mode = inputModeFor(save, def);
    this.swipeOn = swipeEnabled(save, def);
    this.firstEntry = !(save.levels[def.id]?.plays);
    this.lesson = !!opts.lesson && def.id === '0-1';
    // restore a level left half-way (not after 再来一次)
    if (!opts.fresh && save.inProgress?.id === def.id && save.inProgress.hist) this.session.restoreHistory(save.inProgress.hist);
    this.el = document.createElement('div');
    this.el.className = 'sok-play';
    this.el.dataset.level = def.id;
    this.el.dataset.mode = this.mode;
    ctx.app.append(this.el);
    mountSky(document.body, HALLS[hallFor(def)].sky, def.id);
    // HUD
    this.hud = document.createElement('div');
    this.hud.className = 'sok-hud';
    this.plate = document.createElement('button');
    this.plate.type = 'button';
    this.plate.className = 'sok-plate';
    this.plate.dataset.sfx = 'ui-tap';
    const base = def.twinOf ? levelById(def.twinOf) : def;
    const ch = base?.track === 'classic' ? 'classic' : def.track === 'random' ? 'random' : def.track === 'cert' ? 'cert' : `ch${base?.ch ?? def.ch}`;
    // child-facing tags only (QA r3): 0-1 / C10 / T2 / 跳级考试 — never an internal slug like cert-1
    const tag = def.track === 'random' ? `T${def.random?.tier ?? 1}` : def.track === 'cert' ? '跳级考试' : def.twinOf ?? def.id;
    const title = def.track === 'twin' ? `镜子·${def.name}` : def.name;
    this.plate.innerHTML = `<span class="sok-plate__badge">${chapterEmblem(ch, 40)}</span><span class="sok-plate__title"><b>${tag}</b> ${title}</span>`;
    this.plate.setAttribute('aria-label', `${tag} ${title}，再听一遍这关讲什么`);
    this.plate.addEventListener('click', () => void this.strip.say(def.say, { mood: 'encouraging' }));
    this.chip = document.createElement('div');
    this.chip.className = 'xg-chip sok-pushes';
    this.chip.setAttribute('aria-label', '推了几下');
    this.chip.innerHTML = `${gameIcon('crate')}<b data-testid="pushes">0</b>`;
    this.hud.append(this.plate, this.chip);
    if (paramsFor(def).hints !== false) {
      const hb = document.createElement('button');
      hb.type = 'button';
      hb.className = 'xg-iconbtn xg-hint sok-hintbtn';
      hb.innerHTML = `${icon('hint')}<i class="sok-cool" aria-hidden="true"></i>`;
      hb.setAttribute('aria-label', '小灯泡提示');
      hb.dataset.testid = 'hint';
      hb.dataset.sfx = 'ui-tap';
      this.hud.append(hb);
      this.hintBtn = hb;
      this.hud.classList.add('has-hint');
    }
    this.el.append(this.hud);
    // board
    const host = document.createElement('div');
    host.className = 'sok-boardhost';
    this.el.append(host);
    this.board = new BoardView(host, {
      level: this.session.level, hall: HALLS[hallFor(def)], levelId: def.id,
      crates: this.session.crates, player: this.session.player,
      reducedMotion: ctx.reduced, instant: ctx.instant, slowmo: ctx.slowmo, sfx: (n, o) => playSfx(n, o),
      cosmetics: cosmeticsOf(save),
    });
    this.inputLayer = document.createElement('div');
    this.inputLayer.className = 'sok-input';
    this.inputLayer.dataset.testid = 'board';
    this.el.append(this.inputLayer);
    // companion
    this.strip = new CompanionStrip(this.el, ctx.voice);
    // actions
    const mk = (cls: string, html: string, label: string, testid: string) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = cls;
      b.innerHTML = html;
      b.setAttribute('aria-label', label);
      b.dataset.testid = testid;
      this.el.append(b);
      return b;
    };
    this.btn = {
      undo: mk('xg-btn xg-btn--accent xg-btn--lg sok-act sok-act--undo', `${icon('undo')}<span>撤销</span><i class="sok-count" aria-hidden="true"></i><i class="sok-ring" aria-hidden="true"></i>`, '撤销', 'undo'),
      redo: mk('xg-iconbtn xg-iconbtn--lg sok-act sok-act--redo', `${icon('redo')}<i class="sok-count" aria-hidden="true"></i>`, '重做', 'redo'),
      restart: mk('xg-iconbtn xg-iconbtn--lg sok-act sok-act--restart', icon('restart'), '重来', 'restart'),
      map: mk('xg-iconbtn xg-iconbtn--lg sok-act sok-act--map', icon('map'), '地图', 'map'),
    };
    this.stuckBtn = mk('xg-btn xg-btn--accent sok-stuck', `${icon('undo')}<span>回到能推完的地方</span>`, '回到能推完的地方', 'rewind-solvable');
    this.stuckBtn.hidden = true;
    this.stuckBtn.addEventListener('click', () => void this.rewindToSolvable());
    this.bindHold(this.btn.undo, () => this.undo());
    this.bindHold(this.btn.redo, () => this.redo());
    this.btn.restart.addEventListener('click', () => this.restart());
    this.btn.map.addEventListener('click', () => this.toMap());
    this.detachInput = attachBoardInput(this.inputLayer, {
      swipeOn: () => this.swipeOn,
      enabled: () => (!this.locked || this.demo) && !this.finished,
      onGesture: (g) => this.onGesture(g),
    });
    for (const b of [this.btn.undo, this.btn.redo, this.btn.restart]) b.addEventListener('pointerdown', () => this.ladder?.noteTouch());
    if (this.hintBtn) {
      const slow = typeof def.ch === 'number' && slowDue(ctx.visit, def.ch);
      const quiet = (slow ? 20 : paramsFor(def).h0Seconds ?? 30) * 1000;
      this.ladder = new HintLadder({
        ctx, def, session: this.session, board: this.board, strip: this.strip,
        busy: () => this.busy || this.board.anim.active,
        setDemo: (on) => this.setDemo(on),
        offerRewind: (line) => this.offerRewind(line),
        rewindTo: (len) => this.rewindTo(len),
      }, this.hintBtn, quiet);
      this.slowStart = slow;
    }
    this.layout(ctx.layout());
    this.refreshHud();
    void this.start();
  }

  private slowStart = false;

  // ------------------------------------------------------------------ lifecycle

  private async start(): Promise<void> {
    const def = this.def;
    const p = paramsFor(def);
    this.ctx.client.load(def.id, def.map, { ref: def.ref, maxStates: p.graph.maxStates, maxMs: p.graph.maxMs });
    this.ctx.marks.add('level-start', { id: def.id, track: def.track });
    stopMusic();
    const quick = !this.firstEntry;
    await this.board.enter(quick);
    if (this.destroyed) return;
    this.board.syncLocks(true);
    // marks of a restored state
    if (this.session.marks.size) void this.board.showDead([...this.session.marks.keys()]);
    this.locked = false;
    this.refreshHud();
    // the parent switch 跳过开场和教学: every intro line and teaching demo is skipped as if 跳过 was tapped —
    // except the first lesson asked for again (再看一遍 → 第一课), as the opening replay plays too (QA fb1 r1)
    const auto = shouldAutoSkip() && !this.lesson;
    const save = this.ctx.save.data;
    // 0-1: the ghost hand comes 1–4 s after the board lands, while the chapter line plays (spec §2.3);
    // once seen (skipped, or 0-1 solved — older saves too) only the lesson asked for again teaches
    const teach = def.id === '0-1' && !auto && (this.lesson || (!this.onceKey(LESSON_SEEN) && !levelPassed(save, '0-1')));
    if (def.id === '0-1') {
      if (auto) this.skipTutorial('auto');
      else if (teach) this.tutor();
      else this.tutorSkipped = true;
    }
    // chapter intro (first time), the level line on first entry of key levels, the arrows upgrade;
    // each intro line can be skipped (0-1's teaching 跳过 already covers its chapter line) and is seen then
    const chN = typeof def.ch === 'number' ? def.ch : -1;
    if (chN >= 0 && !save.chaptersSeen.includes(chN)) {
      this.ctx.save.update((s) => s.chaptersSeen.push(chN));
      const c = chapterOf(chN);
      if (c?.introLine && !auto) await this.introLine(c.introLine, { mood: 'encouraging', polite: true }, !teach);
    } else if (def.track === 'classic' && !this.onceKey('sok.classic.intro')) {
      this.once('sok.classic.intro');
      if (!auto) await this.introLine('sok.classic.intro', { mood: 'happy' });
    } else if (def.track === 'random' && !this.onceKey('sok.random.intro')) {
      this.once('sok.random.intro');
      if (!auto) await this.introLine('sok.random.intro', { mood: 'happy' });
    }
    if (this.slowStart && !this.destroyed) await this.strip.say('sok.tip.slow', { mood: 'encouraging', polite: true });
    if (this.destroyed || this.finished) return;
    if (this.mode === 'arrows' && save.arrows === 'celebrate') await this.upgradeCelebration();
    if (this.destroyed || this.finished) return;
    if ((this.firstEntry || def.track === 'random') && AUTO_LINE_ROLES.has(def.role)) void this.strip.say(def.say, { mood: 'encouraging', polite: true });
    if (def.id !== '0-1') this.tutor();
    this.ladder?.prefetch();
  }

  // ------------------------------------------------------------------ 跳过 (Dad's feedback 2026-10-08)

  /**
   * The kit's 跳过 pill for a teaching moment (appears after 1.5 s, top-right; the 💡 key steps
   * aside meanwhile). Returns its disposer; every pill also goes with the screen.
   */
  private skipOffer(onSkip: () => void, what: 'teach' | 'intro' | 'upgrade' | 'launch'): () => void {
    // tests (instant) never get a pill over the 💡 key; ?anim=real tests do
    if (this.destroyed || this.ctx.instant) return () => {};
    let off: () => void = () => {};
    const dispose = () => {
      if (!this.skipOffs.delete(dispose)) return;
      off();
      if (!this.skipOffs.size) delete this.el.dataset.skipping;
    };
    off = mountSkipButton(document.body, () => {
      dispose();
      this.ctx.marks.add('skip', { id: this.def.id, what });
      this.ctx.marks.flush();
      onSkip();
    });
    this.skipOffs.add(dispose);
    this.el.dataset.skipping = '';
    return dispose;
  }

  /** A chapter / track intro line with its 跳过 (the line stops; the chapter is seen either way). */
  private async introLine(id: string, o: { mood: 'encouraging' | 'happy'; polite?: boolean }, offer = true): Promise<void> {
    const off = offer ? this.skipOffer(() => this.strip.hide(), 'intro') : () => {};
    await this.strip.say(id, o);
    off();
  }

  /**
   * 0-1's ghost-hand teaching skipped (跳过, or the parent switch): no more hands, footprints or
   * 先走到… lines; the level itself stays to be played, and the opening and the teaching count as seen.
   */
  private skipTutorial(why: 'tap' | 'auto'): void {
    this.tutorSkipped = true;
    for (const t of this.tutorTimers) clearTimeout(t);
    this.tutorTimers = [];
    this.stopGhost();
    hideGhostHand();
    this.board.releaseFootprint();
    if (why === 'tap') this.strip.hide();
    this.tutorSkipOff?.();
    this.tutorSkipOff = null;
    // skipping marks the teaching seen (Dad's feedback 2026-10-08): it does not come back on the next 0-1
    if ((!this.ctx.save.data.tutorialDone || !this.onceKey(LESSON_SEEN)) && !this.ctx.save.readOnly) {
      this.ctx.save.update((s) => {
        s.tutorialDone = true;
        if (!s.onceLines.includes(LESSON_SEEN)) s.onceLines.push(LESSON_SEEN);
      });
    }
  }

  layout(l: LayoutInfo): void {
    let g = playLayout(l.width, l.height, l.safe.top, l.safe);
    // a phone held sideways: the board at full height when that gives this warehouse bigger cells
    const tall = phoneLandscapeTall(g, l.safe);
    const { W, H } = this.session.level;
    if (tall && boardGeom(tall.board, W, H, PHONE_PAD_X).s > boardGeom(g.board, W, H, PHONE_PAD_X).s) g = tall;
    this.el.dataset.orient = g.orientation;
    this.el.toggleAttribute('data-phone', g.phone);
    const place = (el: HTMLElement, r: Rect) => Object.assign(el.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
    place(this.hud, g.hud);
    // the level plate: in the HUD row, or docked at the top of the right column (phoneLandscapeTall)
    if (g.plate) {
      Object.assign(this.plate.style, { left: `${g.plate.x - g.hud.x}px`, top: `${g.plate.y - g.hud.y}px`, width: `${g.plate.w}px`, height: `${g.plate.h}px` });
      this.plate.dataset.docked = '';
    } else if (this.plate.hasAttribute('data-docked')) {
      Object.assign(this.plate.style, { left: '', top: '', width: '', height: '' });
      delete this.plate.dataset.docked;
    }
    place(this.inputLayer, g.board);
    place(this.btn.undo, g.actions.undo);
    place(this.btn.redo, g.actions.redo);
    place(this.btn.restart, g.actions.restart);
    place(this.btn.map, g.actions.map);
    // a narrow phone: 撤销 shows its icon only (the key keeps its colour and place)
    this.btn.undo.toggleAttribute('data-compact', g.actions.undo.w < 110);
    this.strip.layout(g.side, g.stripMode);
    const sbW = Math.min(340, g.board.w);
    const sb = g.orientation === 'portrait'
      ? { x: g.board.x + g.board.w / 2 - sbW / 2, y: g.board.y + g.board.h - (g.phone ? 60 : 76), w: sbW, h: g.phone ? 52 : 64 }
      : { x: g.side.x, y: g.side.y + g.side.h - (g.phone ? 56 : 70), w: g.side.w, h: g.phone ? 52 : 64 };
    place(this.stuckBtn, sb);
    this.board.layout(g.board, g.phone ? PHONE_PAD_X : undefined);
    mountSky(document.body, HALLS[hallFor(this.def)].sky, this.def.id);
  }

  pause(): void {
    this.trackActive();
    this.board.setHidden(true);
    if (this.pendingTimer) clearTimeout(this.pendingTimer);
    this.pendingTimer = null;
    // spec §3.10 切后台: Worker requests are cancelled (callers get their safe "unknown" answer)
    this.ctx.client.cancelPending();
    this.persist();
    // spec §8.8: level-leave also covers the page being hidden (iPadOS may evict a backgrounded app)
    if (!this.finished && !this.hiddenLeave) {
      this.hiddenLeave = true;
      this.ctx.marks.add('level-leave', { id: this.def.id, pushes: this.session.pushes, ms: Math.round(this.activeMs), hidden: true });
    }
    this.ctx.marks.flush();
  }

  resume(): void {
    this.lastActive = performance.now();
    this.board.setHidden(false);
    if (this.session.pending.length) this.armPendingTimer();
    // back from the background: the level goes on (its next leave/complete closes it again)
    if (this.hiddenLeave && !this.finished && !this.destroyed) this.ctx.marks.add('level-resume', { id: this.def.id });
    this.hiddenLeave = false;
  }

  persist(): void {
    if (this.finished || this.ctx.save.readOnly) return;
    this.ctx.save.data.inProgress = this.progressRecord();
    this.ctx.save.save();
  }

  /** The in-progress record (random orders keep their warehouse, spec §8.7 / review B20). */
  private progressRecord(): NonNullable<typeof this.ctx.save.data.inProgress> | undefined {
    const hist = this.session.serializeHistory();
    if (!hist) return undefined;
    const r = this.def.random;
    if (this.def.track === 'random' && r) {
      return { id: this.def.id, hist, at: Date.now(), tier: r.tier, seed: r.seed, poolIdx: r.poolIdx, rnd: { tier: r.tier as 1 | 2 | 3, seed: r.seed, poolIdx: r.poolIdx, hash: r.hash, map: this.def.map, pushes: this.def.opt.pushes, moves: this.def.opt.moves, ref: this.def.ref, lesson: rndLesson(this.def.say) } };
    }
    return { id: this.def.id, hist, at: Date.now() };
  }

  destroy(): void {
    this.destroyed = true;
    this.gen += 1;
    this.ghostCtl.abort();
    hideGhostHand();
    if (!this.finished) {
      this.persist();
      this.trackActive();
      // left unfinished: the level still books its active time into the visit (it owns the clock)
      noteActive(this.ctx.visit, this.activeMs);
      storeVisit(this.ctx.visit);
      this.ctx.marks.add('level-leave', { id: this.def.id, pushes: this.session.pushes, ms: Math.round(this.activeMs) });
      this.ctx.marks.flush();
    }
    for (const t of this.tutorTimers) clearTimeout(t);
    for (const off of [...this.skipOffs]) off();
    if (this.pendingTimer) clearTimeout(this.pendingTimer);
    if (this.stuck?.timer) clearTimeout(this.stuck.timer);
    if (this.holdTimer) clearTimeout(this.holdTimer);
    this.ladder?.destroy();
    this.launch?.finish();
    this.detachInput?.();
    this.strip.destroy();
    this.board.destroy();
    this.el.remove();
  }

  private trackActive(): void {
    const now = performance.now();
    this.activeMs += Math.min(60000, now - this.lastActive);
    this.lastActive = now;
    if (this.activeMs > 8 * 60_000 && !this.skipAsked && !this.finished) this.askSkip();
    this.ladder?.noteActive(this.activeMs);
  }

  private skipAsked = false;

  /** Same level 8 minutes and the next one is open → ask once (spec §5.2). Never pushes. */
  private askSkip(): void {
    this.skipAsked = true;
    const next = nextAfter(this.ctx.save.data, this.def.id, false);
    if (next.kind !== 'level' || !next.id) return;
    const id = next.id;
    void this.strip.say('sok.tip.skip', { mood: 'encouraging', hold: 9000 });
    const box = document.createElement('div');
    box.className = 'sok-skip';
    box.innerHTML = `<button type="button" class="xg-btn xg-btn--primary" data-act="go">${icon('next')}<span>去下一关</span></button><button type="button" class="xg-btn xg-btn--secondary" data-act="stay"><span>接着想</span></button>`;
    this.el.append(box);
    box.addEventListener('click', (e) => {
      const act = (e.target as Element).closest<HTMLElement>('[data-act]')?.dataset.act;
      if (!act) return;
      box.remove();
      this.strip.hide();
      if (act === 'go') {
        this.persist();
        this.ctx.go({ name: 'play', id });
      }
    });
  }

  private once(k: string): void {
    if (!this.ctx.save.data.onceLines.includes(k)) this.ctx.save.update((s) => s.onceLines.push(k));
  }

  // ------------------------------------------------------------------ HUD

  private refreshHud(bump = false): void {
    const n = this.session.pushes;
    const b = this.chip.querySelector('b')!;
    if (b.textContent !== String(n)) {
      b.textContent = String(n);
      if (bump) {
        this.chip.classList.remove('is-bump');
        void this.chip.offsetWidth;
        this.chip.classList.add('is-bump');
      }
    }
    const undoOk = this.session.canUndo;
    this.btn.undo.toggleAttribute('aria-disabled', !undoOk);
    this.btn.undo.classList.toggle('is-disabled', !undoOk);
    const redoOk = this.session.canRedo;
    // the redo tip belongs after the undo lesson (spec §2.3): never on 0-3's corrective undo
    if (redoOk && this.btn.redo.hidden && !this.onceKey('sok.tut.redo') && this.def.id !== '0-3') {
      this.once('sok.tut.redo');
      void this.strip.say('sok.tut.redo');
    }
    this.btn.redo.hidden = !redoOk;
    const rs = this.session.canRestart;
    this.btn.restart.toggleAttribute('aria-disabled', !rs);
    this.btn.restart.classList.toggle('is-disabled', !rs);
    this.el.dataset.pushes = String(n);
  }

  private pulseUndo(on: boolean): void {
    this.btn.undo.classList.toggle('is-pulse', on);
    if (on) this.btn.undo.dataset.pulse = '';
    else delete this.btn.undo.dataset.pulse;
  }

  // ------------------------------------------------------------------ input

  private run(action: () => Promise<void>): void {
    if (this.busy) {
      this.queued = action;
      return;
    }
    this.busy = true;
    const gen = this.gen;
    void action()
      .catch((e) => console.error('[sokoban] action failed', e))
      .finally(() => {
        if (gen !== this.gen) return;
        this.busy = false;
        const q = this.queued;
        this.queued = null;
        if (q && !this.locked && !this.finished) this.run(q);
      });
  }

  private onGesture(g: BoardGesture): void {
    this.board.noteInput();
    this.ladder?.noteTouch();
    if (this.demo) {
      // a tap during the H3 demo only ends the demo (the real board never moved)
      this.board.abortDemo();
      return;
    }
    this.stopGhost();
    this.trackActive();
    if (this.stuck && !this.stuck.shown) this.armStuckTimer();
    // the next action reveals delayed marks (undo/restart are buttons: those count as rescue)
    if (this.session.pending.length) void this.perform(this.session.revealPending());
    if (g.kind === 'miss') {
      this.board.ripple(g.x, g.y);
      this.board.glance(g.x, g.y);
      return;
    }
    if (g.kind === 'swipe') {
      this.deselect();
      this.run(() => this.swipe(g.dir));
      return;
    }
    const hit = this.board.hitTest(g.x, g.y);
    switch (hit.kind) {
      case 'arrow':
        this.run(() => this.arrowPush(hit.dir as Dir));
        break;
      case 'robot':
        this.deselect();
        void this.board.hop();
        break;
      case 'crate': {
        const slot = hit.slot;
        this.whenFree(() => this.tapCrate(slot));
        break;
      }
      case 'floor': {
        const cell = hit.cell;
        // answer at once (≤ 100 ms), decide when the robot is free: a new target during a walk
        // re-paths from wherever the robot stands after the current cell (spec §3.2 input queue)
        if (this.busy) this.board.flashTarget(cell);
        this.whenFree(() => this.tapFloor(cell, true));
        break;
      }
      default:
        this.deselect();
        this.board.ripple(g.x, g.y);
    }
  }

  /**
   * Run a tap decision now, or — while an animation runs — as the one queued action (the newest tap
   * wins), so it is judged against the state the robot is really in when it gets its turn.
   */
  private whenFree(decide: () => void): void {
    if (!this.busy) {
      decide();
      return;
    }
    this.queued = async () => decide();
  }

  private stopGhost(): void {
    this.ghostCtl.abort();
    this.ghostCtl = new AbortController();
    this.board.hideRoute();
  }

  private deselect(): void {
    if (this.selected < 0) return;
    this.selected = -1;
    delete this.el.dataset.arrows;
    this.board.hideArrows();
  }

  private select(slot: number, dirs: Dir[]): void {
    this.selected = slot;
    this.el.dataset.arrows = String(dirs.length);
    this.board.showArrows(slot, dirs);
    playSfx('ui-select', { volume: 0.5 });
  }

  private showFootprints(slot: number, dirs: Dir[]): void {
    this.session.stats.footprintShows += 1;
    this.el.dataset.footprints = String(dirs.length);
    playSfx('ui-tick', { volume: 0.4 });
    this.board.showFootprints(dirs.map((d) => ({ cell: this.session.standFor(slot, d), dir: d })));
    if (!this.onceKey('sok.tut.stand')) {
      this.once('sok.tut.stand');
      void this.strip.say('sok.tut.stand', { mood: 'encouraging' });
    }
  }

  private tapCrate(slot: number): void {
    const s = this.session;
    if (this.selected === slot) {
      this.deselect();
      return;
    }
    const adjDir = s.adjacentDir(slot);
    if (adjDir >= 0) {
      const adj = adjDir as Dir;
      if (s.canPush(slot, adj)) {
        this.deselect();
        this.run(() => this.push(slot, adj));
        return;
      }
      const dirs = s.legalDirs(slot).filter((d) => d !== adj);
      this.deselect();
      this.run(async () => {
        await this.board.bump(adj, slot);
      });
      if (dirs.length) {
        if (this.mode === 'arrows') this.select(slot, dirs);
        else this.showFootprints(slot, dirs);
      }
      return;
    }
    s.stats.boxFirstTaps += 1;
    const dirs = s.legalDirs(slot);
    if (!dirs.length) {
      this.deselect();
      void this.board.shakeCrate(slot);
      playSfx('bump', { volume: 0.4 });
      return;
    }
    if (this.mode === 'arrows') {
      this.deselect();
      this.select(slot, dirs);
    } else {
      this.deselect();
      this.showFootprints(slot, dirs);
    }
  }

  private tapFloor(cell: number, flashed = false): void {
    this.deselect();
    const path = this.session.pathTo(cell, this.board.robot.pose.facing);
    if (path === null) {
      this.session.stats.unreachableTaps += 1;
      this.board.unreachable(cell);
      playSfx('bump', { volume: 0.5 });
      this.unreachStreak += 1;
      if (this.unreachStreak >= 3 && !this.tipUnreachSaid) {
        this.tipUnreachSaid = true;
        void this.strip.say('sok.tip.unreach', { mood: 'encouraging' });
      }
      return;
    }
    this.unreachStreak = 0;
    if (!flashed || !this.busy) this.board.flashTarget(cell);
    if (!path.length) return;
    this.run(() => this.walk(path));
  }

  /** Walk cell by cell; a newer input stops the walk after the current cell (then re-paths). */
  private async walk(path: number[]): Promise<void> {
    const gen = this.gen;
    const l = this.session.level;
    for (let i = 0; i < path.length; i += 1) {
      const from = this.session.player;
      let dir = -1;
      for (let d = 0; d < 4; d += 1) if (nb(l, from, d) === path[i]) dir = d;
      if (dir < 0 || this.session.crateAt(path[i]) >= 0) break;
      const last = i === path.length - 1 || this.queued !== null;
      await this.board.step(dir, last, path.length);
      if (gen !== this.gen) return;
      this.session.player = path[i];
      if (this.queued) break;
    }
    this.tutorOnWalk();
  }

  private async swipe(dir: Dir): Promise<void> {
    const s = this.session;
    const to = nb(s.level, s.player, dir);
    if (to < 0 || !s.level.floor[to]) {
      await this.board.bump(dir);
      return;
    }
    const slot = s.crateAt(to);
    if (slot >= 0) {
      if (s.canPush(slot, dir)) await this.push(slot, dir);
      else await this.board.bump(dir, slot);
      return;
    }
    await this.walk([to]);
  }

  /** Row 1: walk to the stand cell behind the selected crate and push once; the crate stays selected. */
  private async arrowPush(dir: Dir): Promise<void> {
    const slot = this.selected;
    if (slot < 0) return;
    const s = this.session;
    const stand = s.standFor(slot, dir);
    const path = s.pathTo(stand, this.board.robot.pose.facing);
    if (path === null) {
      await this.board.bump(dir, slot);
      return;
    }
    if (this.board.arrows) this.board.arrows.pressed = dir;
    if (path.length) await this.walk(path);
    if (this.session.player !== stand) return;
    s.stats.arrowPushes += 1;
    await this.push(slot, dir, true);
    if (this.finished || this.selected !== slot) return;
    const dirs = s.legalDirs(slot);
    if (dirs.length) this.board.showArrows(slot, dirs);
    else this.deselect();
  }

  // ------------------------------------------------------------------ moves

  async push(slot: number, dir: Dir, keepSelection = false): Promise<void> {
    if (!keepSelection) this.deselect();
    const ev = this.session.push(slot, dir);
    if (!ev) {
      await this.board.bump(dir, slot);
      return;
    }
    if (this.pushesSinceDead >= 0) this.pushesSinceDead += 1;
    if (this.firstPushMs === null) {
      this.trackActive();
      this.firstPushMs = Math.round(this.activeMs);
    }
    // he pushed by himself: 0-1's teaching (and its 跳过) is over
    this.tutorSkipOff?.();
    this.tutorSkipOff = null;
    this.ladder?.noteMove('push');
    this.afterMove();
    const gen = this.gen;
    await this.perform(ev);
    if (gen !== this.gen || this.destroyed) return;
    this.tutorOnPush();
  }

  /** Play session events on the board. */
  private async perform(events: SessionEvent[]): Promise<void> {
    // an undo / restart / redo pressed while a push still animates bumps gen (interrupt()); the
    // cancelled push's later events (dead ✕, naming lines, tutor) must not run on the reverted board
    const gen = this.gen;
    for (const e of events) {
      if (gen !== this.gen || this.destroyed) return;
      switch (e.type) {
        case 'push': {
          this.refreshHud(true);
          if (e.lockIn && !this.onceKey('sok.tut.pad')) {
            this.once('sok.tut.pad');
            void this.strip.say('sok.tut.pad', { mood: 'happy' });
          }
          await this.board.push(e.slot, e.dir, { lockIn: e.lockIn, unlatch: e.unlatch, locked: e.locked, redo: e.redo });
          break;
        }
        case 'dead':
          if (e.shown) void this.deadFeedback(e.marks.map((m) => m.slot), e.marks.map((m) => m.type));
          else this.armPendingTimer();
          break;
        case 'deadShown':
          if (this.pendingTimer) clearTimeout(this.pendingTimer);
          this.pendingTimer = null;
          void this.deadFeedback(e.marks.map((m) => m.slot), e.marks.map((m) => m.type));
          break;
        case 'selfRescue':
          if (this.pendingTimer) clearTimeout(this.pendingTimer);
          this.pendingTimer = null;
          this.selfRescue();
          break;
        case 'solved':
          // the launch + result card run on their own: the push that solved it is done
          void this.win();
          return;
        default:
          break;
      }
    }
  }

  private armPendingTimer(): void {
    if (this.pendingTimer) clearTimeout(this.pendingTimer);
    this.pendingTimer = setTimeout(() => {
      this.pendingTimer = null;
      if (this.session.pending.length) void this.perform(this.session.revealPending());
    }, 4000);
  }

  private async deadFeedback(slots: number[], types: DeadType[]): Promise<void> {
    this.deadSeenThisRun += 1;
    this.ladder?.noteDead();
    this.pushesSinceDead = 0;
    playSfx('try-again', { volume: 0.7 });
    this.pulseUndo(true);
    void this.board.showDead(slots);
    const save = this.ctx.save.data;
    const top = PRIORITY.find((t) => types.includes(t))!;
    let line: string | null = null;
    if (canName(save, top, this.def.id)) {
      if (!save.named.includes(top)) {
        line = DEAD_LINE[top];
        this.ctx.save.update((s) => s.named.push(top));
      }
    } else if (!save.named.includes('generic')) {
      line = 'sok.dead.generic';
      this.ctx.save.update((s) => s.named.push('generic'));
    }
    const undosBefore = this.session.stats.undos;
    if (line) await this.strip.say(line, { mood: 'thinking' });
    if (!this.onceKey('sok.tut.undo')) {
      this.once('sok.tut.undo');
      // already found the undo button by himself → no need to tell him any more
      if (this.session.stats.undos === undosBefore && !this.destroyed) await this.strip.say('sok.tut.undo', { mood: 'encouraging', interrupt: false });
    }
  }

  /** The board is fine again (undo / restart cleared the last ✕): a "stuck" caption must not stay up. */
  private clearDeadCaption(): void {
    if (this.strip.el.classList.contains('is-on') && /^sok\.(dead\.|tut\.undo$)/.test(this.strip.lastId)) this.strip.hide();
  }

  private selfRescue(): void {
    if (!this.spotSaid) {
      this.spotSaid = true;
      void this.strip.say('sok.praise.spot', { mood: 'happy' });
    } else {
      playSfx('chime', { volume: 0.6, rate: 1.5 });
      this.btn.undo.classList.remove('is-spot');
      void this.btn.undo.offsetWidth;
      this.btn.undo.classList.add('is-spot');
    }
    burst(this.btn.undo, 12);
  }

  /** Layer 2 (invisible deadlock): ask the Worker after every move; prompt after N pushes or M ms. */
  private afterMove(): void {
    if (this.session.solved) return;
    if (this.pushesSinceDead >= 3 && !this.deadUndoSaid && this.session.marks.size) {
      this.deadUndoSaid = true;
      void this.strip.say('sok.dead.undo', { mood: 'encouraging' });
    }
    const gen = this.gen;
    const histLen = this.session.history.length;
    const snap = this.session.snapshot();
    void this.ctx.client.togo({ player: snap.player, boxes: snap.crates }).then((t) => {
      if (gen !== this.gen || this.session.history.length !== histLen || this.destroyed) return;
      const visible = detectAll(this.session.level, this.session.crates).length > 0;
      if (t === -1 && !visible) {
        if (!this.stuck) {
          this.session.stats.dead.invisible += 1;
          this.ladder?.noteDead();
          this.stuck = { pushes: this.session.stats.pushActions, timer: null, shown: false };
          this.armStuckTimer();
        } else if (!this.stuck.shown && this.session.stats.pushActions - this.stuck.pushes >= stuckDelayFor(this.def).pushes) this.showStuck();
      } else this.clearStuck();
    });
  }

  private armStuckTimer(): void {
    if (!this.stuck) return;
    if (this.stuck.timer) clearTimeout(this.stuck.timer);
    this.stuck.timer = setTimeout(() => this.showStuck(), stuckDelayFor(this.def).ms);
  }

  private showStuck(): void {
    if (!this.stuck || this.stuck.shown || this.finished) return;
    this.stuck.shown = true;
    void this.strip.say('sok.stuck.1', { mood: 'thinking', hold: 8000 });
    if (paramsFor(this.def).rewindButton) {
      this.stuckBtn.hidden = false;
      this.stuckBtn.classList.add('is-in');
    }
    this.pulseUndo(true);
  }

  private clearStuck(): void {
    if (!this.stuck) return;
    if (this.stuck.timer) clearTimeout(this.stuck.timer);
    this.stuck = null;
    this.stuckBtn.hidden = true;
    this.stuckBtn.classList.remove('is-in');
    if (!this.session.marks.size) this.pulseUndo(false);
  }

  private async rewindToSolvable(): Promise<void> {
    this.stuckBtn.hidden = true;
    this.usedRewind = true;
    const idx = await this.ctx.client.rewindIndex(this.session.historyStates().map((s) => ({ player: s.player, boxes: s.crates })));
    void this.strip.say('sok.stuck.2', { mood: 'encouraging' });
    await this.rewindTo(idx);
    this.clearStuck();
  }

  /** Undo back to `len` history entries at the long-press pace (220 → ×0.8 → 150 ms). */
  async rewindTo(len: number): Promise<void> {
    let k = 0;
    while (this.session.history.length > len && !this.destroyed && !this.finished) {
      if (!this.undo(k > 0)) break;
      await new Promise((r) => setTimeout(r, this.ctx.test ? 0 : holdGap(Math.max(1, k))));
      k += 1;
    }
  }

  /** 💡 in a state that cannot be finished (spec §5.1): the rewind offer at once, with this line. */
  offerRewind(line: string): void {
    if (this.finished) return;
    if (!this.stuck) this.stuck = { pushes: this.session.stats.pushActions, timer: null, shown: false };
    if (this.stuck.timer) clearTimeout(this.stuck.timer);
    this.stuck.shown = true;
    void this.strip.say(line, { mood: 'thinking', hold: 8000, interrupt: true });
    if (paramsFor(this.def).rewindButton) {
      this.stuckBtn.hidden = false;
      this.stuckBtn.classList.remove('is-in');
      void this.stuckBtn.offsetWidth;
      this.stuckBtn.classList.add('is-in');
    }
    this.pulseUndo(true);
  }

  /** The H3 ghost demo locks the board (a tap ends the demo). */
  private setDemo(on: boolean): void {
    this.demo = on;
    this.locked = on || this.finished;
    this.el.toggleAttribute('data-demo', on);
  }

  // ------------------------------------------------------------------ undo / redo / restart

  private interrupt(): void {
    this.gen += 1;
    this.queued = null;
    this.busy = false;
    this.board.finishNow();
    this.board.place(this.session.player, this.session.crates);
  }

  undo(fast = false): boolean {
    if (this.demo) this.board.abortDemo();
    if (this.finished || this.locked) return false;
    if (!this.session.canUndo) return false;
    this.interrupt();
    this.ladder?.noteMove('undo');
    this.deselect();
    const ev = this.session.undo();
    if (!ev) return false;
    if (this.firstUndoMs === null) {
      this.trackActive();
      this.firstUndoMs = Math.round(this.activeMs);
    }
    this.rewindRate = fast ? Math.min(1.3, this.rewindRate + 0.05) : 1;
    for (const e of ev) {
      if (e.type === 'undo') {
        const facing = e.entry.kind === 'push' ? e.entry.dir : 1;
        void this.board.rewind(e.to.player, e.to.crates, facing, this.rewindRate);
      } else if (e.type === 'selfRescue') this.selfRescue();
    }
    this.board.clearDead(new Set(this.session.marks.keys()));
    for (const slot of this.session.marks.keys()) this.board.marks.set(slot, { t: 1 });
    if (!this.session.marks.size) {
      this.pulseUndo(false);
      this.clearDeadCaption();
    }
    this.pushesSinceDead = this.session.marks.size ? this.pushesSinceDead : -1;
    this.refreshHud(true);
    if (this.stuck) this.afterMoveCheckAfterUndo();
    // tutor: back at the start twice in one level → restart tip (once in the game)
    if (this.session.pushes === 0 && this.session.history.every((h) => h.kind === 'push') && this.session.history.length === 0) {
      this.undoToStart += 1;
      if (this.undoToStart >= 2 && !this.onceKey('sok.tut.restart')) {
        this.once('sok.tut.restart');
        void this.strip.say('sok.tut.restart', { mood: 'encouraging' });
        this.btn.restart.classList.add('is-flash');
        setTimeout(() => this.btn.restart.classList.remove('is-flash'), 1600);
      }
    }
    this.saveSoon();
    return true;
  }

  private afterMoveCheckAfterUndo(): void {
    const gen = this.gen;
    const snap = this.session.snapshot();
    void this.ctx.client.togo({ player: snap.player, boxes: snap.crates }).then((t) => {
      if (gen === this.gen && t >= 0) this.clearStuck();
    });
  }

  redo(): boolean {
    if (this.demo) this.board.abortDemo();
    if (this.finished || this.locked || !this.session.canRedo) return false;
    this.interrupt();
    this.ladder?.noteMove('redo');
    this.deselect();
    const ev = this.session.redo();
    if (!ev) return false;
    const head = ev[0];
    if (head.type === 'redo' && head.entry.kind === 'restart') {
      void this.board.restartTo(this.session.player, this.session.crates);
      this.board.clearDead();
      this.refreshHud(true);
      this.saveSoon();
      return true;
    }
    if (head.type === 'redo' && head.entry.kind === 'push') this.board.place(head.entry.before.player, head.from.crates, head.entry.dir);
    this.busy = true;
    const gen = this.gen;
    void this.perform(ev.slice(1)).finally(() => {
      if (gen !== this.gen) return;
      this.busy = false;
      // a tap made during the replayed push runs now (same input queue as run(), spec §3.2)
      const q = this.queued;
      this.queued = null;
      if (q && !this.locked && !this.finished) this.run(q);
    });
    this.afterMove();
    this.refreshHud(true);
    this.saveSoon();
    return true;
  }

  restart(): void {
    if (this.demo) this.board.abortDemo();
    if (this.finished || this.locked || !this.session.canRestart) return;
    this.interrupt();
    this.ladder?.noteMove('restart');
    this.ladder?.noteRestart();
    this.deselect();
    const ev = this.session.restart();
    if (!ev) return;
    void this.board.restartTo(this.session.player, this.session.crates);
    this.board.clearDead();
    this.pulseUndo(false);
    this.clearDeadCaption();
    this.clearStuck();
    if (ev.some((e) => e.type === 'selfRescue')) this.selfRescue();
    this.refreshHud(true);
    this.saveSoon();
  }

  private saveSoon(): void {
    if (this.ctx.save.readOnly) return;
    this.ctx.save.data.inProgress = this.progressRecord();
    this.ctx.save.saveSoon();
  }

  /** Long press: one action at once; from 600 ms repeats 220 → ×0.8 → ≥150 ms; a −n/+n badge counts. */
  private bindHold(b: HTMLButtonElement, act: () => boolean): void {
    const badge = b.querySelector<HTMLElement>('.sok-count')!;
    const sign = b === this.btn?.undo || b.classList.contains('sok-act--undo') ? '−' : '+';
    const stop = () => {
      if (this.holdTimer) clearTimeout(this.holdTimer);
      this.holdTimer = null;
      setTimeout(() => {
        badge.textContent = '';
        b.classList.remove('is-holding');
      }, 500);
    };
    b.addEventListener('pointerdown', (e) => {
      if (!e.isPrimary || this.holdTimer) return;
      this.holdCount = 0;
      const fire = (i: number) => {
        const ok = act();
        if (!ok) return stop();
        this.holdCount += 1;
        if (i > 0) {
          badge.textContent = `${sign}${this.holdCount}`;
          b.classList.add('is-holding');
          badge.classList.remove('is-bump');
          void badge.offsetWidth;
          badge.classList.add('is-bump');
        }
        this.holdTimer = setTimeout(() => fire(i + 1), holdGap(i + 1));
      };
      fire(0);
    });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave'] as const) b.addEventListener(ev, stop);
    b.addEventListener('click', (e) => e.preventDefault());
    b.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') act();
    });
  }

  // ------------------------------------------------------------------ win

  private async win(): Promise<void> {
    if (this.finished) return;
    this.finished = true;
    this.stopGhost();
    for (const off of [...this.skipOffs]) off();
    this.tutorSkipOff = null;
    if (this.demo) this.board.abortDemo();
    this.locked = true;
    this.queued = null;
    this.deselect();
    this.clearStuck();
    this.pulseUndo(false);
    this.board.clearHints();
    this.ladder?.destroy();
    if (this.pendingTimer) clearTimeout(this.pendingTimer);
    this.trackActive();
    const s = this.session;
    const def = this.def;
    const hintMax = this.ladder?.usedMax ?? 0;
    const usedH3 = this.ladder?.usedH3 ?? false;
    const stars = starsFor(s.pushes, def.opt.pushes, def.star2, usedH3);
    // clean (spec §5.4): at most H1 this time and never "回到能推完的地方"
    const clean = hintMax <= 1 && !this.usedRewind;
    const ctx = this.ctx;
    let outcome: Outcome | null = null;
    let certPassed = false;
    const certRun = ctx.certRun;
    ctx.save.update((d) => {
      if (def.track === 'random' && def.random) outcome = applyRandomResult(d, Math.min(3, def.random.tier) as 1 | 2 | 3, def.random.hash);
      else outcome = applyLevelResult(d, def, { pushes: s.pushes, stars, hintMax, clean });
      // 跳级考试: both levels in one go (spec §3.8)
      if (def.track === 'cert') {
        if (def.id === 'cert-1') ctx.certRun = { levels: ['cert-1'] };
        else if (def.id === 'cert-2' && certRun?.levels.includes('cert-1')) {
          const c = applyCertPass(d);
          certPassed = true;
          const o = outcome as unknown as Outcome;
          o.openedChapters = [...new Set([...o.openedChapters, ...c.openedChapters])];
          o.completedChapters = [...new Set([...o.completedChapters, ...c.completedChapters])];
          o.newItems = [...o.newItems, ...c.newItems];
          o.newCards = [...o.newCards, ...c.newCards];
          o.arrowsUnlocked = o.arrowsUnlocked || c.arrowsUnlocked;
          o.openedTiers = [...o.openedTiers, ...c.openedTiers];
          ctx.certRun = null;
        }
      }
      d.inProgress = undefined;
      d.stats.pushes += s.stats.pushActions;
      d.stats.undos += s.stats.undos;
      d.stats.redos += s.stats.redos;
      d.stats.restarts += s.stats.restarts;
      d.stats.deadEvents += s.stats.dead.corner + s.stats.dead.wall + s.stats.dead.pair + s.stats.dead.square + s.stats.dead.invisible;
      d.stats.deadDelayed += s.stats.delayed.events;
      d.stats.selfRescues += s.stats.delayed.rescued;
      d.stats.activeMs += Math.round(this.activeMs);
      if (def.id === '0-1') {
        d.tutorialDone = true;
        if (!d.onceLines.includes(LESSON_SEEN)) d.onceLines.push(LESSON_SEEN);
      }
    });
    const o = outcome as unknown as Outcome;
    const dest = destFor(def);
    noteLevel(ctx.visit, { id: def.id, ch: def.ch, h3: usedH3, activeMs: this.activeMs, dest, launched: o.launchCounted });
    if (def.track === 'random' && def.random) this.suggestSmaller = noteRandomH3(ctx.visit, Math.min(3, def.random.tier) as 1 | 2 | 3, usedH3);
    storeVisit(ctx.visit);
    ctx.hub();
    ctx.marks.add('level-complete', {
      id: def.id, pushes: s.pushes, opt: def.opt.pushes, stars, hintMax, h3: usedH3, undos: s.stats.undos, redos: s.stats.redos,
      restarts: s.stats.restarts, ms: Math.round(this.activeMs), clean, first: o.firstPass, arrowPushes: s.stats.arrowPushes,
      footprintShows: s.stats.footprintShows, dead: { ...s.stats.dead }, delayed: { ...s.stats.delayed },
    });
    if (def.track === 'random' && def.random) {
      ctx.marks.add('random', { tier: def.random.tier, seed: def.random.seed, fromPool: def.random.poolIdx !== undefined, genMs: def.random.genMs ?? null, pushes: s.pushes, opt: def.opt.pushes, ms: Math.round(this.activeMs) });
    }
    if (def.id === 'cert-2' || (def.track === 'cert' && certPassed)) ctx.marks.add('cert', { passed: certPassed, undos: s.stats.undos, restarts: s.stats.restarts, ms: Math.round(this.activeMs) });
    if (def.id === '0-1' && o.firstPass) {
      ctx.marks.add('onboard', { firstPushMs: this.firstPushMs, firstUndoMs: this.firstUndoMs, unreachableTaps: s.stats.unreachableTaps, boxFirstTaps: s.stats.boxFirstTaps });
    }
    ctx.marks.flush();
    // S4: the launch (spec §3.5): every route's first launch and a boss's first pass cannot be skipped
    const boss = def.role === 'boss' && def.track !== 'twin';
    // the long launches (a route's first, a boss's first pass) are not tap-to-skip, but they carry the
    // kit's 跳过 (Dad's feedback 2026-10-08); with the parent switch they become tap-to-skip ones.
    // The pill comes with the board's finale, so once its 1.5 s are up it stays for the rest of the
    // flight and the arrival line (mounted with the flight it was up ~0.7 s and left mid-line; QA fb1 r1)
    const longLaunch = (o.firstOnRoute || (boss && o.firstPass)) && !shouldAutoSkip();
    let launchSkipped = false;
    let skippedNow = () => {};
    const skipped = new Promise<void>((r) => {
      skippedNow = r;
    });
    const offLaunch = longLaunch ? this.skipOffer(() => {
      launchSkipped = true;
      this.launch?.finish();
      this.strip.hide();
      skippedNow();
    }, 'launch') : () => {};
    await this.board.anim.wait(ctx.test ? 0 : 120);
    await this.board.finale();
    if (this.destroyed) return;
    // 跳过 already tapped (a slow finale): no flight, straight on to the card
    if (!launchSkipped) await this.fly(dest, boss, o.firstOnRoute, longLaunch);
    // a line still being said (the first lock-in's "推上发射台…", the arrival line) ends first
    await Promise.race([this.strip.settle(ctx.test ? 0 : 2600), skipped]);
    offLaunch();
    this.strip.hide();
    // test mode is instant: let the winning tap's click finish before the card's buttons exist
    if (ctx.test) await new Promise((r) => setTimeout(r, 120));
    if (this.destroyed) return;
    await this.result(stars, o, certPassed);
  }

  /** The rocket's flight (LaunchSequence) to the route's destination; resolves when it has ended. */
  private async fly(dest: Dest, boss: boolean, firstOnRoute: boolean, locked: boolean): Promise<void> {
    const ctx = this.ctx;
    this.launch = new LaunchSequence({
      kind: dest,
      boss,
      firstOnRoute,
      locked,
      reduced: ctx.reduced,
      instant: ctx.instant,
      boardRect: () => this.board.gridRectPage(),
      boardOutline: () => this.board.outlinePage(),
      shakeEl: this.el,
      sfx: (n, so) => playSfx(n, so),
      say: (id) => {
        // the rocket has arrived: the caption comes back for the destination line
        delete this.el.dataset.launchFly;
        return this.strip.say(id, { mood: 'celebrating', interrupt: true });
      },
    });
    this.el.dataset.launch = dest;
    // portrait: the rocket rises through the caption strip under the board — the strip steps
    // aside during the flight instead of being covered (QA r2); the voice goes on
    this.el.dataset.launchFly = '1';
    await this.launch.run();
    this.launch = null;
    delete this.el.dataset.launch;
    delete this.el.dataset.launchFly;
  }

  private suggestSmaller = false;

  private praiseLine(stars: number): string {
    const s = this.session;
    const lvlNo = Number(this.def.id.split('-')[1] ?? this.def.id.replace(/\D/g, ''));
    if (s.stats.undos > 0 && this.deadSeenThisRun > 0) return 'sok.praise.undo';
    if (stars === 3 && this.def.ch !== 0 && lvlNo % 2 === 0) return 'sok.praise.lean';
    const line = `sok.praise.${this.def.lesson}`;
    // no repeat within the last 3 results (QA r3: 0-2 and 0-4 both teach 'turn', two minutes apart)
    if (!recentPraise.includes(line)) return line;
    const alt = s.pushes <= this.def.opt.pushes ? ['sok.praise.lean', 'sok.praise.plain'] : ['sok.praise.plain'];
    return alt.find((a) => !recentPraise.includes(a)) ?? alt[0];
  }

  private async result(stars: 1 | 2 | 3, o: Outcome, certPassed: boolean): Promise<void> {
    const def = this.def;
    const ctx = this.ctx;
    const save = ctx.save.data;
    const random = def.track === 'random';
    const next: NextStep = random ? { kind: 'map' } : certPassed ? { kind: 'level', id: '2-1', newChapter: 2 } : nextAfter(save, def.id, o.firstPass);
    const praise = certPassed ? 'sok.cert.pass' : this.praiseLine(stars);
    recentPraise.push(praise);
    if (recentPraise.length > 3) recentPraise.shift();
    const actions: ResultAction[] = [];
    if (random) {
      actions.push({ id: 'again-random', label: '再来一个', kind: 'primary', icon: 'plus' }, { id: 'map', label: '地图', kind: 'secondary', icon: 'map' });
    } else {
      actions.push({ id: 'next', label: next.kind === 'map' ? '回地图' : '下一关', kind: 'primary', icon: 'next' });
      actions.push({ id: 'again', label: '再来一次', kind: 'secondary', icon: 'restart' });
      if (next.kind !== 'map') actions.push({ id: 'map', label: '地图', kind: 'secondary', icon: 'map' });
      // 镜子仓库: only after H3 was used on a fixed level (spec §5.1)
      if (this.ladder?.usedH3 && def.track !== 'twin' && def.track !== 'cert') actions.push({ id: 'twin', label: '镜子仓库', kind: 'gold', icon: 'swap' });
    }
    const ribbon = random ? `随机新仓库 · ${TIERS[def.random?.tier ?? 1].name}` : def.track === 'twin' ? `${def.twinOf} 镜子仓库` : def.track === 'cert' ? `跳级考试 · ${def.name}` : `${def.id} ${def.name}`;
    // spec §2.1 S5: statements, not questions — 推了 N 下 / 用了 N 次提示 (sentence tiles, see onOpen)
    const sentences = [['推了', '下']];
    const stats = [{ label: '推了 下', value: `${this.session.pushes}`, best: o.newBest && !o.firstPass }];
    const hintsGiven = this.ladder?.given ?? 0;
    if (hintsGiven > 0) {
      stats.push({ label: '用了 次提示', value: `${hintsGiven}`, best: false });
      sentences.push(['用了', '次提示']);
    }
    void ctx.voice.say(praise, { interrupt: true });
    const choice = await showResult({
      ribbon,
      stars,
      title: ctx.voice.text(praise),
      stats,
      actions,
      accentGame: 'porter',
      onOpen: (panel) => {
        panel.classList.add('sok-result');
        panel.dataset.testid = 'result';
        panel.dataset.stars = String(stars);
        panel.querySelectorAll<HTMLElement>('.xg-stat').forEach((tile, i) => {
          const sn = sentences[i];
          const b = tile.querySelector('b');
          if (!sn || !b) return;
          tile.classList.add('sok-stat');
          tile.setAttribute('aria-label', `${sn[0]} ${b.textContent} ${sn[1]}`);
          const pre = document.createElement('span');
          pre.textContent = sn[0];
          const post = tile.querySelector('span') ?? document.createElement('span');
          post.textContent = sn[1];
          tile.replaceChildren(pre, b, post);
        });
      },
    });
    if (this.destroyed) return;
    ctx.voice.stop();
    // what the card leads into: chapter rewards, other milestone items, the v1 finale, the 收尾卡
    if ((await ceremonies(ctx, def, o, () => !this.destroyed)) === 'hub' || this.destroyed) return;
    // 再来一次 after the first lesson asked for again: the teaching comes again too
    if (choice === 'again' && this.lesson) {
      ctx.go({ name: 'play', id: def.id, fresh: true, lesson: true });
      return;
    }
    await follow(ctx, def, choice, next, o, async () => {
      if (this.suggestSmaller && (def.random?.tier ?? 1) > 1) await this.strip.say('sok.random.smaller', { mood: 'encouraging' });
    });
  }

  private toMap(): void {
    this.persist();
    if (this.def.track === 'cert' && !this.ctx.save.data.cert.passed) {
      // leaving the exam half-way: it does not count, nothing is lost (spec §3.8)
      this.ctx.certRun = null;
      this.ctx.go({ name: 'map', tab: 1, say: 'sok.cert.later' });
      return;
    }
    this.ctx.go({ name: 'map', tab: tabOf(this.def) });
  }

  // ------------------------------------------------------------------ the 自动绕行 upgrade (spec §6.6)

  private async upgradeCelebration(): Promise<void> {
    // the upgrade is granted first: skipping the show (跳过 / the parent switch) never loses it
    this.ctx.save.update((s) => {
      s.arrows = 'on';
    });
    if (shouldAutoSkip()) return;
    this.locked = true;
    playSfx('unlock');
    playSfx('powerup', { volume: 0.8 });
    let skipped = false;
    const off = this.skipOffer(() => {
      skipped = true;
      this.stopGhost();
      hideGhostHand();
      this.board.hideArrows();
      this.strip.hide();
      this.board.robot.pose.eyes = 'normal';
      this.board.requestFrame();
      this.locked = false;
    }, 'upgrade');
    // 2.5 s: the visor lights a route pictogram in a ring of LEDs while the companion tells it
    const line = this.strip.say('sok.tut.upgrade', { mood: 'celebrating' });
    await this.board.upgradeFlourish();
    if (!skipped) await Promise.race([line, new Promise((r) => setTimeout(r, this.ctx.test ? 0 : 1600))]);
    if (!skipped && !this.destroyed && !this.ctx.instant) await this.arrowDemo();
    off();
    if (this.destroyed || skipped) return;
    this.board.robot.pose.eyes = 'normal';
    this.board.requestFrame();
    this.locked = false;
    // he may already play; the level's own line waits until this one is said (no cut-off)
    await this.strip.say('sok.tut.arrows', { mood: 'encouraging' });
  }

  /**
   * Ghost demonstration (≤ 3 s, the real state never changes): a ghost hand taps a crate, its arrows
   * slide out, the hand taps one arrow, and a cyan ghost 小推 walks round to the stand cell and
   * pushes a ghost crate one cell. Picks the crate/arrow whose walk shows the detour best.
   */
  private async arrowDemo(): Promise<void> {
    const s = this.session;
    // a short visible detour (about 4 cells) reads best; a zero-length walk shows nothing
    const score = (n: number) => (n === 0 ? 100 : Math.abs(n - 4));
    let best: { slot: number; dir: Dir; path: number[] } | null = null;
    for (let slot = 0; slot < s.crates.length; slot += 1) {
      for (const dir of s.legalDirs(slot)) {
        const path = s.pathTo(s.standFor(slot, dir), this.board.robot.pose.facing);
        if (path && (!best || score(path.length) < score(best.path.length))) best = { slot, dir, path };
      }
    }
    if (!best) return;
    const sig = this.ghostCtl.signal;
    const c = this.board.crateCenterPage(best.slot);
    if (!(await ghostTapAt(c.x, c.y, sig, { fast: true })) || this.destroyed) return;
    playSfx('ui-select', { volume: 0.5 });
    this.board.showArrows(best.slot, s.legalDirs(best.slot));
    await new Promise((r) => setTimeout(r, 180));
    const a = this.board.arrowCenterPage(best.slot, best.dir);
    if (!(await ghostTapAt(a.x, a.y, sig, { fast: true })) || this.destroyed) return;
    if (this.board.arrows) this.board.arrows.pressed = best.dir;
    await this.board.ghostWalkPush(best.path, best.slot, best.dir);
    this.board.hideArrows();
  }

  // ------------------------------------------------------------------ chapter-0 tutor (spec §2.3)

  private later(ms: number, fn: () => void): void {
    if (this.ctx.test) return;
    this.tutorTimers.push(setTimeout(() => {
      // the logic state is final at the push itself (the win animation runs on): nothing after it
      if (!this.destroyed && !this.finished && !this.session.solved) fn();
    }, ms));
  }

  private tutor(): void {
    const id = this.def.id;
    const s = this.session;
    if (id === '0-1') {
      if (this.tutorSkipped) return;
      // 跳过 for the teaching (it goes at his first push)
      if (s.pushes === 0) this.tutorSkipOff = this.skipOffer(() => this.skipTutorial('tap'), 'teach');
      // the ghost shows where to stand (spec §2.3); only while he has not started himself
      const stand = s.standFor(0, 2);
      const fresh = () => s.pushes === 0 && s.player === s.level.start.player;
      const untouched = () => fresh() && !this.busy;
      // the hand taps the stand cell, then its footprint stays lit until he moves (脚印光圈)
      const show = (tries = 0) => {
        if (!fresh()) return;
        if (this.busy) {
          if (tries < 12) this.later(250, () => show(tries + 1));
          return;
        }
        const p = this.board.cellCenterPage(stand);
        void ghostTapAt(p.x, p.y, this.ghostCtl.signal).then((done) => {
          if (done && fresh() && !this.destroyed) this.board.holdFootprint(stand, 2);
        });
      };
      this.later(700, () => show());
      this.later(6700, () => {
        if (!untouched()) return;
        show();
        void this.strip.say('sok.tut.walk', { mood: 'encouraging' });
      });
    } else if (id === '0-2') {
      // 8 s without a push: the dashed route round to the crate's left side + the line
      this.later(8000, () => {
        if (s.pushes > 0 || this.busy) return;
        const stand = s.standFor(0, 3);
        const path = s.pathTo(stand, this.board.robot.pose.facing);
        if (path && path.length) void this.board.showRoute(path, 3);
        void this.strip.say('sok.tut.behind', { mood: 'encouraging' });
      });
    } else if (id === '0-4') {
      this.later(8000, () => {
        if (s.pushes === 0) void this.strip.say('sok.tut.turn', { mood: 'encouraging' });
      });
    }
  }

  private tutorOnWalk(): void {
    if (this.def.id !== '0-1' || this.tutorSkipped) return;
    if (this.session.player !== this.session.level.start.player) this.board.releaseFootprint();
    if (this.session.pushes > 0) return;
    const stand = this.session.standFor(0, 2);
    if (this.session.player !== stand) return;
    const ready = () => this.session.pushes === 0 && this.session.player === stand && !this.busy;
    this.later(250, () => {
      if (!ready()) return;
      const c = this.board.crateCenterPage(0);
      void ghostTapAt(c.x, c.y, this.ghostCtl.signal);
    });
    this.later(5250, () => {
      if (ready()) void this.strip.say('sok.tut.push', { mood: 'encouraging' });
    });
  }

  private tutorOnPush(): void {
    /* lock-in and deadlock lines are spoken from perform()/deadFeedback() */
  }

  // ------------------------------------------------------------------ test hooks

  /** Replay a LURD line instantly (tests: __sok.replay). */
  async replay(lurd: string): Promise<void> {
    for (const ch of lurd) {
      if (this.finished) return;
      const d = 'udlr'.indexOf(ch.toLowerCase()) as Dir;
      const to = nb(this.session.level, this.session.player, d);
      if (ch === ch.toUpperCase()) {
        const slot = this.session.crateAt(to);
        await this.push(slot, d);
      } else {
        this.session.player = to;
        this.board.place(this.session.player, this.session.crates, d);
      }
    }
  }

  /** Tap a cell centre through the real input path (tests). */
  tapCell(cell: number): void {
    const p = this.board.cellCenterPage(cell);
    this.onGesture({ kind: 'tap', x: p.x, y: p.y });
  }

  /** Tap a crate where it is drawn right now, through the real input path (tests). */
  tapCrateAt(slot: number): void {
    const p = this.board.crateCenterPage(slot);
    this.onGesture({ kind: 'tap', x: p.x, y: p.y });
  }

  get isBusy(): boolean {
    return this.busy || this.board.anim.active;
  }
}

/** sok.rnd.<key> → the generator's lesson key (random in-progress record). */
function rndLesson(say: string): 'park' | 'order' | 'color' | 'pair' | 'corner' | 'wall' | 'plan' {
  const k = say.replace('sok.rnd.', '');
  return (['park', 'order', 'color', 'pair', 'corner', 'wall', 'plan'] as const).find((x) => x === k) ?? 'plan';
}

/** A small paper-confetti burst from an element (12 bits, 400 ms; skipped with reduced motion). */
function burst(el: HTMLElement, n: number): void {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const r = el.getBoundingClientRect();
  const colors = ['#F6B934', '#1AA892', '#8FF7EC', '#FFFAF0', '#EB6A3C'];
  for (let i = 0; i < n; i += 1) {
    const b = document.createElement('i');
    b.className = 'sok-bit';
    const a = (i / n) * Math.PI * 2;
    b.style.cssText = `left:${r.left + r.width / 2}px;top:${r.top + 10}px;background:${colors[i % colors.length]};--dx:${Math.cos(a) * 70}px;--dy:${Math.sin(a) * 50 - 40}px;--rot:${(i * 67) % 360}deg`;
    document.body.append(b);
    setTimeout(() => b.remove(), 450);
  }
}
