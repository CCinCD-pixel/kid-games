/**
 * S3 棋盘题 (spec §2.4, §3.9, §5.1–§5.3): 学堂 board items, 翻翻棋入门 scenes and 残局 on the same
 * board as a match. Goal bar on top (instruction + "第 n 步 · 最少 p 步" + the lesson's progress
 * dots), ↶ 退一步 / ⟲ 重来 / 💡 below. BLUE answers 380 ms after the child's move, from the reply book
 * (no search on the device). Failure: the reason, a short replay, back to before the move, the hint
 * ladder goes up. Done: stars fly to the progress dots, process praise, [下一题] — the last item of a
 * lesson is a milestone (showResult + the lesson's wrap line).
 */
import { ghostTap, icon, setHintReady, showResult } from '@kit/ui';
import type { App } from '../app';
import { BLUE, RED, parseSq } from '../core/board';
import { whyImmobile, whyNot, WHY_LINE } from '../core/explain';
import { isFlip, isMove, pieceCanMove, pieceMoves, type Action } from '../core/movegen';
import { parseNote, toNote } from '../core/notation';
import { NAMES } from '../core/pieces';
import { apply } from '../core/rules';
import type { GameState } from '../core/state';
import type { FailReason } from '../core/puzzle';
import { praiseLine } from '../core/praise';
import { awardCards, boardStars, cardStars, endgameTierUnlocked, promote, recordItem, starsOf } from '../core/progress';
import { backToTree, bestNow, demoLine, redMove, replayPuzzle, startPuzzle, undoMove, type PuzzleCtx, type PuzzleSpec, type StepResult } from '../ctrl/puzzle-ctrl';
import { sceneAction, sceneStart, sceneTargets } from '../ctrl/scene-ctrl';
import { CARDS, ENDGAMES, LESSONS, itemById, lessonOf, loadBook, endgameById, type BoardItem, type Endgame, type SceneItem, type Lesson } from '../content';
import { promotionCeremony } from '../view/promo';
import { MS, d } from '../view/anim';
import { BoardView } from '../view/board-view';
import { boardGeom, stageGeom } from '../view/layout';
import { animateMove } from '../view/move-anim';
import { mcIcon } from '../view/icons';
import { BaseScreen, IntroSkip, abs, button, div } from './base';

type Kind = 'board' | 'scene';


export class PuzzleScreen extends BaseScreen {
  readonly name = 'puzzle';
  private kind: Kind;
  private spec: PuzzleSpec | null = null;
  private scene: SceneItem | null = null;
  private endgame: Endgame | null;
  private lesson: Lesson | null;
  private twin: boolean;
  private board: BoardView;
  private pc: PuzzleCtx | null = null;
  private state!: GameState;
  private selected = -1;
  private busy = 0;
  private hintLevel: 0 | 1 | 2 | 3 = 0;
  private usedH3 = false;
  private fails = 0;
  /** a failure, undo or reset happened on this item (process praise mc.ok.8) */
  private retried = false;
  /** a red move of more than one step (railway, praise mc.ok.2) */
  private usedRail = false;
  private finished = false;
  private idleTimer = 0;
  private hintBtn: HTMLButtonElement | null = null;
  private goalEl!: HTMLDivElement;
  private panelBtns!: HTMLDivElement;
  private nextBtn: HTMLButtonElement | null = null;
  private loading: Promise<void>;
  /** scene: index of the next step */
  private sceneStep = 0;
  private sceneCorrections = 0;
  private resumeRed: string[] | null;

  constructor(app: App, private itemId: string, o: { twin?: boolean; resume?: boolean } = {}) {
    super(app);
    this.endgame = endgameById(itemId) ?? null;
    const it = this.endgame ? null : itemById(itemId);
    this.lesson = this.endgame ? null : lessonOf(itemId) ?? null;
    this.kind = it?.type === 'scene' ? 'scene' : 'board';
    const pr = app.save.puzzleResume;
    this.twin = !!o.twin;
    this.resumeRed = o.resume && pr && pr.id === itemId ? pr.red : null;
    if (this.resumeRed && pr) {
      this.hintLevel = pr.hintMax;
      this.fails = pr.fails;
      this.retried = pr.fails > 0;
      this.usedH3 = pr.twin;
    }
    this.board = new BoardView(
      {
        onTap: (at) => this.tap(at),
        onDrop: (pid, at) => this.drop(pid, at),
        canDrag: (pid) => this.canDrag(pid),
        onTouch: () => this.touched(),
      },
      { viewer: RED, numbers: app.save.settings.numberBadges },
    );
    if (this.kind === 'scene') {
      this.scene = it as SceneItem;
      this.state = sceneStart(this.scene);
      this.loading = Promise.resolve();
    } else {
      const src = (this.endgame ?? (it as BoardItem)) as unknown as PuzzleSpec;
      this.spec = { ...src, id: itemId };
      this.loading = this.boot();
    }
    this.state = this.state ?? this.pcState();
    this.bag.timeout(() => void this.intro(), 320);
  }

  private pcState(): GameState {
    return this.pc ? this.pc.state : startPuzzle(this.spec!, this.twin, null).state;
  }

  private async boot(): Promise<void> {
    const spec = this.spec!;
    let root = null;
    if (spec.blue_moves === 'best' && spec.goal.kind !== 'survive' && spec.book) root = (await loadBook(spec.book)).root;
    this.pc = this.resumeRed ? replayPuzzle(spec, this.twin, root, this.resumeRed) : startPuzzle(spec, this.twin, root);
    this.state = this.pc.state;
    if (this.board.g) this.redraw();
  }

  // ------------------------------------------------------------------ texts
  private instruction(): string {
    if (this.endgame) return `mc.i.endgame.${this.endgame.par}`;
    if (this.kind === 'scene') return `mc.i.${this.itemId}`;
    const id = `mc.i.${this.itemId}`;
    return this.app.voice.text(id) !== id ? id : 'mc.i.can';
  }

  private async intro(): Promise<void> {
    await this.loading;
    if (this.kind === 'scene') return this.runScene();
    const it = this.endgame ? null : (itemById(this.itemId) as BoardItem);
    const ghost = !!it?.ghost && !this.resumeRed && !this.twin;
    // intro items: the ghost shows the first move before he plays ("我做" → "你做")
    if (ghost) {
      // a touch takes over from the demo at once (QA r1: the 6 s demo swallowed taps)
      const gate = new IntroSkip(this.el, () => this.introSkipped());
      this.busy++;
      try {
        if (await gate.step(this.say(this.instruction()))) await this.ghostFirst(gate);
      } finally {
        this.busy = Math.max(0, this.busy - 1);
        gate.end();
      }
    } else if (this.isFirstPractice()) this.bag.timeout(() => void this.autoHint1(), 5000); // own timer: armIdle must not cancel it
    this.introDone = true;
    this.armIdle();
  }
  private introDone = false;

  /** the first practice item after a concept's intro lights H1 after 5 s without a touch */
  private isFirstPractice(): boolean {
    if (!this.lesson) return false;
    const items = this.lesson.items;
    const k = items.findIndex((x) => x.id === this.itemId);
    if (k <= 0) return false;
    const me = items[k], prev = items[k - 1];
    return me.role === 'practice' && prev.role === 'intro' && prev.concept === me.concept;
  }

  // ------------------------------------------------------------------ layout
  back(): boolean {
    this.persistResume();
    this.app.go(this.endgame ? { name: 'endgames' } : { name: 'academy', lesson: this.lesson?.id });
    return true;
  }

  persist(): void {
    this.persistResume();
  }

  private persistResume(): void {
    if (this.finished || !this.pc || this.kind !== 'board') return;
    this.app.save.puzzleResume = this.pc.red.length ? { id: this.itemId, twin: this.twin, red: [...this.pc.red], hintMax: this.hintLevel, fails: this.fails } : null;
    this.app.persist();
  }

  protected render(): void {
    const o = this.o, st = this.safeTop;
    this.el.replaceChildren();
    this.el.classList.add('mc-puzzle');
    const g = stageGeom(o, st);
    this.board.setGeom(boardGeom(o, st));
    this.el.appendChild(this.board.el);
    this.goalEl = div('mc-goal');
    this.goalEl.dataset.testid = 'goal-bar';
    this.panelBtns = div('mc-pz-btns');
    const undo = button('xg-btn xg-btn--secondary mc-pz-btn', `${icon('undo')}<span>退一步</span>`, () => this.undo(), 'pz-undo');
    const restart = button('xg-btn xg-btn--secondary mc-pz-btn', `${icon('restart')}<span>重来</span>`, () => this.restart(), 'pz-restart');
    this.hintBtn = o === 'portrait'
      ? button('xg-iconbtn mc-hint-btn', icon('hint'), () => void this.onHint(), 'hint')
      : button('xg-btn xg-btn--secondary mc-pz-btn mc-hint-btn', `${icon('hint')}<span>提示</span>`, () => void this.onHint(), 'hint');
    this.hintBtn.setAttribute('aria-label', '提示');
    this.panelBtns.append(undo, restart, this.hintBtn);
    const gh = div('mc-match__guide');
    if (o === 'portrait') {
      abs(this.goalEl, { x: 84, y: st + 6, w: 642, h: 80 });
      const panelY = g.intel.y;
      abs(gh, { x: 12, y: panelY, w: 150, h: g.intel.h });
      abs(this.caption.el, { x: 182, y: panelY, w: 616, h: 64 });
      abs(this.panelBtns, { x: 182, y: 1068 - 72, w: 616, h: 72 });
    } else {
      abs(this.goalEl, { x: 832, y: st + 12, w: 236, h: 150 });
      this.goalEl.classList.add('is-col');
      // landscape side panel (spec §2.4): goal card, companion 88 + a bubble that fits its text
      // (≤3 lines, opaque, dims when idle), one aligned row [↶][⟲][💡] at the bottom (QA r1)
      abs(gh, { x: 832, y: st + 172, w: 236, h: 100 });
      abs(this.caption.el, { x: 832, y: st + 278, w: 236, h: 0 });
      this.caption.el.classList.add('is-tall', 'is-dock');
      abs(this.panelBtns, { x: 832, y: 810 - 12 - 80, w: 236, h: 80 });
      this.panelBtns.classList.add('is-row3');
    }
    this.el.append(this.goalEl, gh, this.caption.el, this.panelBtns);
    this.placeGuide(gh, o === 'portrait' ? 120 : 88, { mood: 'happy' });
    if (this.kind === 'scene') {
      undo.style.visibility = 'hidden';
      restart.style.visibility = 'hidden';
    }
    this.redraw();
    if (this.finished) this.showNext();
  }

  private redraw(): void {
    if (!this.board.g) return;
    this.board.render(this.state, true);
    this.drawGoal();
    this.renderGoalBar();
  }

  /** gold stars on reach targets, reticles on capture targets, a pennant over the BLUE flag */
  private drawGoal(): void {
    if (this.kind === 'scene' || !this.pc) {
      this.board.setGoalMarks([]);
      return;
    }
    const g = this.pc.pz.goal;
    const marks: Array<{ at: number; kind: 'star' | 'reticle' | 'pennant' }> = [];
    if (g.kind === 'reach') for (const t of g.targets ?? []) marks.push({ at: parseSq(t), kind: 'star' });
    if (g.kind === 'capture') for (const t of g.targets ?? []) {
      const pid = this.pc.s0.board[parseSq(t)];
      if (pid >= 0 && this.state.palive[pid]) marks.push({ at: this.state.ppos[pid], kind: 'reticle' });
    }
    if (g.kind === 'flag') for (let p = 0; p < this.state.np; p++) if (this.state.palive[p] && this.state.pside[p] === BLUE && this.state.ptype[p] === 0) marks.push({ at: this.state.ppos[p], kind: 'pennant' });
    if (g.kind === 'survive' && g.guard && g.guard !== 'flag') {
      const pid = this.pc.s0.board[parseSq(g.guard)];
      if (pid >= 0 && this.state.palive[pid]) marks.push({ at: this.state.ppos[pid], kind: 'star' });
    }
    this.board.setGoalMarks(marks);
  }

  private renderGoalBar(): void {
    const used = this.pc ? this.pc.red.length : this.sceneStep;
    const par = this.pc?.spec.par ?? 0;
    const text = this.app.voice.text(this.instruction());
    const step = Math.min(used + (this.finished ? 0 : 1), 99);
    const steps = this.kind === 'scene' ? '' : `<span class="mc-steps" data-testid="steps">第 ${step} 步 · 最少 ${par} 步</span>`;
    const items = this.endgame ? ENDGAMES.filter((e) => e.tier === this.endgame!.tier) : this.lesson?.items ?? [];
    const dots = items.map((x) => `<i class="mc-pdot${x.id === this.itemId ? ' is-cur' : ''}${starsOf(this.app.save, x.id) ? ' is-done' : ''}" data-id="${x.id}">${starsOf(this.app.save, x.id) ? mcIcon('star') : ''}</i>`).join('');
    this.goalEl.innerHTML = `<div class="mc-goal__row"><span class="mc-goal__ico">${mcIcon(this.goalIcon())}</span><b class="mc-goal__text">${text}</b>${this.twin ? `<span class="mc-twin-tag">${mcIcon('swap')}</span>` : ''}</div><div class="mc-goal__row is-sub">${steps}<span class="mc-pdots" data-testid="pdots">${dots}</span></div>`;
    this.goalEl.onclick = () => void this.say(this.instruction());
    if (this.kind === 'scene') this.renderYouAre();
  }

  private goalIcon(): 'flag' | 'star' | 'swords' | 'shield' | 'flipcard' {
    if (this.kind === 'scene') return 'flipcard';
    const k = this.pc?.pz.goal.kind ?? this.spec!.goal.kind;
    return k === 'flag' ? 'flag' : k === 'reach' ? 'star' : k === 'survive' ? 'shield' : 'swords';
  }

  // ------------------------------------------------------------------ input
  private lastTouch = 0;
  private touched(): void {
    this.lastTouch = performance.now();
    this.board.clearLastMove();
    this.board.clearHintArrow();
    this.armIdle();
  }

  /** H0: 30 s without a touch → 💡 glows, the guide looks at the board (no answer given) */
  private armIdle(): void {
    clearTimeout(this.idleTimer);
    if (this.hintBtn) setHintReady(this.hintBtn, this.fails >= 2);
    this.idleTimer = this.bag.timeout(() => {
      if (this.finished) return;
      if (this.hintBtn) setHintReady(this.hintBtn, true);
      const r = this.board.el.getBoundingClientRect();
      this.guide?.bot.lookAt(r.left + r.width / 2, r.top + r.height / 2);
    }, 30000);
  }

  private canDrag(pid: number): boolean {
    if (this.busy || this.finished || this.kind === 'scene') return false;
    return this.state.pside[pid] === RED && this.state.turn === RED && pieceCanMove(this.state, pid);
  }

  private tap(at: number): void {
    if (this.kind === 'scene') {
      void this.sceneTap(at);
      return;
    }
    if (this.busy || this.finished || !this.pc) return;
    const s = this.state;
    const occ = s.board[at];
    if (occ >= 0 && s.pside[occ] === RED) {
      if (this.selected === occ) return this.deselect();
      const im = whyImmobile(s, occ);
      if (im) {
        this.app.play('bump');
        void this.board.deny(occ, im === 'hq' ? 'lock' : null);
        const line = WHY_LINE[im];
        if (line) void this.say(line, 'thinking');
        return;
      }
      this.select(occ);
      return;
    }
    if (this.selected >= 0) {
      const m = pieceMoves(s, this.selected).find((x) => x.to === at);
      if (m) return void this.commit(m, false);
      this.refuse(this.selected, at, false);
      return;
    }
    if (occ >= 0) {
      this.app.play('ui-tap');
      if (this.board.faceOf(s, occ) === 'up') void this.say(`mc.w.${NAMES[s.ptype[occ]]}`);
      else void this.board.deny(occ, 'q');
    }
  }

  private drop(pid: number, at: number): void {
    if (this.busy || this.finished || !this.pc) return;
    const m = pieceMoves(this.state, pid).find((x) => x.to === at);
    if (m) {
      this.selected = pid;
      return void this.commit(m, true);
    }
    this.refuse(pid, at, true);
  }

  private select(pid: number): void {
    this.app.play('ui-pick');
    this.deselect(true);
    this.selected = pid;
    this.board.setLifted(pid, true);
    this.board.showMoves(pieceMoves(this.state, pid));
  }
  private deselect(silent = false): void {
    if (this.selected >= 0) this.board.setLifted(this.selected, false);
    this.selected = -1;
    this.board.clearHighlights();
    if (!silent) this.app.play('ui-tap');
  }

  private refuse(pid: number, at: number, dropped: boolean): void {
    const why = whyNot(this.state, pid, at);
    if (why === 'own') return;
    this.app.play('bump');
    this.board.dropRefused(pid);
    if (dropped) void this.board.springBack(pid);
    void this.board.deny(pid, why === 'hq' ? 'lock' : null);
    const line = why === 'mountain' ? 'mc.why.crossing' : why === 'rail.turn' ? 'mc.why.rail.turn' : WHY_LINE[why];
    if (line) void this.say(line, 'thinking');
  }

  // ------------------------------------------------------------------ a move
  private async commit(a: Action, dragged: boolean): Promise<void> {
    if (!this.pc || this.busy) return;
    this.busy++;
    clearTimeout(this.idleTimer);
    const before = this.state;
    this.board.setLifted(this.selected, false);
    this.selected = -1;
    const { ctx, step } = redMove(this.pc, a);
    if (isMove(a) && a.path.length > 2) this.usedRail = true;
    this.app.mark('puzzle-move', { id: this.itemId, note: toNote(a) });
    await animateMove(this.board, this.io(), step.red, before, step.afterRed, { dragged });
    this.state = step.afterRed;
    if (step.reply && !(step.reply.action && 'pass' in step.reply.action)) {
      await this.bag.wait(d(380));
      await animateMove(this.board, this.io(), step.reply, step.afterRed, step.after);
      const ra = step.reply.action;
      if (isMove(ra)) this.board.showLastMove(ra.path);
    }
    this.state = step.after;
    this.board.render(this.state);
    this.drawGoal();
    if (step.kind === 'continue') {
      this.pc = ctx;
      this.renderGoalBar();
      this.persistResume();
      this.busy--;
      this.armIdle();
      return;
    }
    if (step.kind === 'done') {
      this.pc = ctx;
      this.busy--;
      return this.done(step);
    }
    await this.fail(step, before);
    this.busy--;
    this.armIdle();
  }

  private io() {
    return { play: (n: string, o?: { step?: number }) => this.app.play(n, o), say: (l: string) => void this.say(l, 'happy'), wait: (ms: number) => this.bag.wait(ms), kid: RED };
  }

  /** R9.4: say why, show it, go back to before the move, the hint ladder goes up */
  private async fail(step: Extract<StepResult, { kind: 'fail' }>, before: GameState): Promise<void> {
    this.fails++;
    this.retried = true;
    this.app.play('try-again');
    const line = this.failLine(step.reason, step);
    this.guide?.mood('encouraging');
    await this.say(line, 'encouraging');
    await this.bag.wait(d(500));
    // back to before this move (both plies): the context was never advanced
    this.state = before;
    this.board.clearLastMove();
    this.board.render(this.state, true);
    for (let p = 0; p < this.state.np; p++) {
      const el = this.board.pieceEl(p);
      el?.animate([{ opacity: 0.3 }, { opacity: 1 }], { duration: d(300) });
    }
    this.drawGoal();
    this.renderGoalBar();
    this.persistResume();
    this.app.mark('puzzle-fail', { id: this.itemId, reason: step.reason, fails: this.fails });
    // the hint ladder goes up one step: H1 lights by itself; H2 glows after 2 failures; H3 is offered after 4
    if (this.hintLevel === 0) {
      this.hintLevel = 1;
      this.bag.timeout(() => this.hint1(), d(400));
    }
    if (this.fails >= 2 && this.hintBtn) setHintReady(this.hintBtn, true);
    if (this.fails === 4) void this.offerShow();
  }

  private failLine(reason: FailReason, step: Extract<StepResult, { kind: 'fail' }>): string {
    if (reason === 'flaglost') return 'mc.why.flaglost';
    if (reason === 'held') return 'mc.why.held';
    if (reason === 'budget') return 'mc.why.budget';
    if (reason === 'nomoves') return 'mc.ref.nomoves.lose';
    // a specific rule: what happened to the child's piece in this move
    const ev = step.red;
    if (ev.outcome && ev.att !== undefined) {
      const tD = step.red.def !== undefined ? this.state.ptype[step.red.def] : -1;
      if (ev.outcome === 'D') return tD === 1 ? 'mc.why.mine.die' : 'mc.why.bigger';
      if (ev.outcome === 'B') return this.state.ptype[ev.att] === 2 || tD === 2 ? 'mc.why.bomb' : 'mc.why.equal';
    }
    if (step.reply?.outcome) return 'mc.why.held';
    return 'mc.hint.again';
  }

  // ------------------------------------------------------------------ undo / restart
  private undo(): void {
    if (this.busy || this.finished || !this.pc || !this.pc.red.length) {
      this.app.play('ui-locked');
      return;
    }
    this.app.play('ui-back');
    this.retried = true;
    this.pc = undoMove(this.pc);
    this.state = this.pc.state;
    this.board.clearLastMove();
    this.board.clearHintArrow();
    this.redraw();
    this.persistResume();
    void this.say('mc.hint.undo');
  }

  private restart(): void {
    if (this.busy || !this.pc) return;
    this.app.play('ui-back');
    this.retried = true;
    this.usedRail = false;
    this.finished = false;
    this.pc = startPuzzle(this.pc.spec, this.pc.twin, this.pc.root);
    this.state = this.pc.state;
    this.board.clearLastMove();
    this.board.clearHintArrow();
    this.nextBtn?.remove();
    this.nextBtn = null;
    this.panelBtns.style.display = '';
    this.redraw();
    this.persistResume();
  }

  // ------------------------------------------------------------------ hints H1–H3 (spec §5.1)
  private async onHint(): Promise<void> {
    if (this.kind === 'scene') return this.sceneHint();
    if (this.busy || this.finished || !this.pc) return;
    this.app.play('hint');
    if (this.hintBtn) setHintReady(this.hintBtn, false);
    this.armIdle();
    // off the tree: first go back to the last position that was on it
    if (!this.pc.node && this.pc.red.length) {
      void this.say('mc.hint.back', 'thinking');
      this.pc = backToTree(this.pc);
      this.state = this.pc.state;
      this.board.clearLastMove();
      this.redraw();
      this.persistResume();
      return;
    }
    const level = Math.min(3, this.hintLevel + 1) as 1 | 2 | 3;
    this.hintLevel = level;
    this.app.mark('hint', { id: this.itemId, level });
    if (level === 1) return this.hint1();
    if (level === 2) return this.hint2();
    return this.hint3();
  }

  private bestAction(): Action | null {
    if (!this.pc) return null;
    const b = bestNow(this.pc);
    return b.length ? parseNote(this.state, b[0]) : null;
  }

  private hint1(): void {
    const a = this.bestAction();
    if (!a || !isMove(a)) return;
    this.board.pulse([a.from], 3);
    if (this.pc!.pz.goal.kind === 'reach') this.board.pulse([a.from, ...(this.pc!.pz.goal.targets ?? []).map(parseSq)], 2);
    void this.say('mc.hint.piece', 'thinking');
  }
  private async autoHint1(): Promise<void> {
    if (this.busy || this.finished || this.hintLevel > 0 || this.lastTouch > 0 || (this.pc && this.pc.red.length)) return;
    this.hintLevel = 1;
    this.hint1();
  }

  private hint2(): void {
    const a = this.bestAction();
    if (!a || !isMove(a)) return;
    this.board.showHintArrow(a.path);
    this.board.pulse([a.from], 2);
    void this.say('mc.hint.where', 'thinking');
  }

  /** H3: the ghost plays the main line from here, then the mirror twin (max 2★) */
  private async hint3(): Promise<void> {
    if (!this.pc) return;
    this.busy++;
    this.usedH3 = true;
    void this.say('mc.hint.show', 'happy');
    await this.bag.wait(d(600));
    const line = demoLine(this.pc);
    let s = this.state;
    for (const st of line) {
      const a = st.red;
      if (isMove(a)) {
        await this.ghostAt(a.from);
        await this.ghostAt(a.to);
      }
      await animateMove(this.board, this.io(), st.result.red, s, st.result.afterRed);
      s = st.result.afterRed;
      if (st.result.reply && isMove(st.result.reply.action)) {
        await this.bag.wait(d(300));
        await animateMove(this.board, this.io(), st.result.reply, s, st.result.after);
      }
      s = st.result.after;
      await this.bag.wait(d(250));
    }
    await this.bag.wait(d(700));
    // the twin: the same idea, mirrored
    this.twin = !this.twin;
    this.pc = startPuzzle(this.pc.spec, this.twin, this.pc.root);
    this.state = this.pc.state;
    this.board.clearLastMove();
    this.board.clearHintArrow();
    this.redraw();
    this.hintLevel = 0;
    this.persistResume();
    void this.say('mc.hint.twin', 'encouraging');
    this.busy--;
  }

  private async offerShow(): Promise<void> {
    const scrim = div('mc-scrim');
    const sheet = div('mc-sheet');
    sheet.innerHTML = `<p class="mc-ask">${this.app.voice.text('mc.hint.show')}？</p>`;
    const row = div('mc-row');
    const go = button('xg-btn xg-btn--primary xg-btn--lg', '<span>好，看一遍</span>', () => {
      drop();
      this.hintLevel = 2;
      void this.onHint();
    }, 'show-yes');
    const no = button('xg-btn xg-btn--secondary xg-btn--lg', '<span>我自己来</span>', () => drop(), 'show-no');
    row.append(no, go);
    sheet.appendChild(row);
    scrim.appendChild(sheet);
    const drop = this.keepOverlay(scrim, () => {
      abs(sheet, this.o === 'portrait' ? { x: 105, y: 400, w: 600, h: 0 } : { x: 240, y: 280, w: 600, h: 0 });
      sheet.style.height = 'auto';
    });
    void this.say('mc.hint.show', 'happy');
  }

  /** the kit ghost hand over a station of the board */
  private async ghostAt(at: number): Promise<void> {
    const c = this.board.center(at);
    const t = document.createElement('div');
    Object.assign(t.style, { position: 'absolute', left: `${c.x - 2}px`, top: `${c.y - 2}px`, width: '4px', height: '4px' });
    this.board.fxLayer.appendChild(t);
    await ghostTap(t);
    t.remove();
  }

  /** intro items: the ghost shows the first move (it is not played: "我做" → "你做") */
  private async ghostFirst(gate: IntroSkip): Promise<void> {
    const a = this.bestAction();
    if (!a || !isMove(a)) return;
    try {
      if (!(await gate.step(this.ghostAt(a.from)))) return;
      this.board.setLifted(a.pid, true);
      this.board.showMoves([a]);
      this.board.showHintArrow(a.path);
      if (!(await gate.step(this.ghostAt(a.to)))) return;
      if (!(await gate.step(this.bag.wait(d(400))))) return;
    } finally {
      this.board.setLifted(a.pid, false);
      this.board.clearHighlights();
    }
    void this.say(this.instruction(), 'happy');
  }

  /** the child touched the board during the intro demo: hand over at once */
  private introSkipped(): void {
    this.app.voice.stop();
    this.app.mark('intro-skip', { id: this.itemId });
    this.guide?.react('nod');
  }

  // ------------------------------------------------------------------ done
  private done(step: Extract<StepResult, { kind: 'done' }>): void {
    this.finished = true;
    clearTimeout(this.idleTimer);
    const pc = this.pc!;
    const moves = pc.red.length;
    const stars = boardStars(moves, pc.spec.par, false, this.usedH3);
    const save = this.app.save;
    recordItem(save, this.itemId, stars, { moves, hintMax: this.hintLevel });
    save.puzzleResume = null;
    const lesson = this.lesson;
    const newCards = awardCards(save);
    const promos = promote(save);
    this.app.persist();
    this.app.hub();
    this.app.mark(this.endgame ? 'endgame-complete' : 'item-complete', { id: this.itemId, stars, moves, hintMax: this.hintLevel, fails: this.fails, twin: this.twin });
    if (step.noMoves) void this.say('mc.ref.nomoves.win', 'celebrating');
    this.flyStars(stars);
    const lastOfLesson = !!lesson && lesson.items[lesson.items.length - 1].id === this.itemId;
    this.bag.timeout(() => {
      if (!step.noMoves) void this.say(praiseLine({ kind: 'board', goal: pc.pz.goal.kind, guard: pc.pz.goal.guard, lesson: lesson?.id ?? null, moves, par: pc.spec.par, rail: this.usedRail, retried: this.retried || this.twin }), 'celebrating');
      this.guide?.react('hop');
    }, d(900));
    if (lesson && lastOfLesson) this.bag.timeout(() => void this.lessonDone(lesson, newCards, promos), d(2200));
    else this.bag.timeout(() => void this.afterDone(promos), d(1100));
  }

  private flyStars(n: number): void {
    const layer = this.el;
    const br = this.board.el.getBoundingClientRect();
    const target = this.goalEl.querySelector<HTMLElement>('.mc-pdot.is-cur') ?? this.goalEl;
    const tr = target.getBoundingClientRect();
    const sr = this.el.getBoundingClientRect();
    const k = sr.width / (this.o === 'portrait' ? 810 : 1080);
    const from = { x: (br.left + br.width / 2 - sr.left) / k, y: (br.top + br.height / 2 - sr.top) / k };
    const to = { x: (tr.left + tr.width / 2 - sr.left) / k, y: (tr.top + tr.height / 2 - sr.top) / k };
    for (let i = 0; i < 3; i++) {
      const st = div(`mc-flystar${i < n ? '' : ' is-slot'}`, mcIcon('star'));
      st.dataset.testid = 'flystar';
      abs(st, { x: from.x - 40 + (i - 1) * 90, y: from.y - 40, w: 80, h: 80 });
      layer.appendChild(st);
      if (i >= n) {
        st.animate([{ opacity: 0, transform: 'scale(.4)' }, { opacity: 0.6, transform: 'scale(1)' }, { opacity: 0 }], { duration: d(900), fill: 'forwards' }).onfinish = () => st.remove();
        continue;
      }
      this.bag.timeout(() => this.app.play(`star-${i + 1}`), d(150 + i * 220));
      const dx = to.x - (from.x + (i - 1) * 90), dy = to.y - from.y;
      st.animate([
        { transform: 'translate(0,0) scale(.3)', opacity: 0 },
        { transform: 'translate(0,-30px) scale(1.25)', opacity: 1, offset: 0.35 },
        { transform: `translate(${dx}px, ${dy}px) scale(.35)`, opacity: 1 },
      ], { duration: d(MS.flagCapture * 0.75), delay: d(i * 160), easing: 'cubic-bezier(.22,1.4,.36,1)', fill: 'forwards' }).onfinish = () => {
        st.remove();
        this.renderGoalBar();
      };
    }
  }

  private async afterDone(promos: number[]): Promise<void> {
    if (promos.length) await promotionCeremony(this.el, promos, { play: (n) => this.app.play(n), say: (l) => void this.say(l, 'celebrating'), wait: (ms) => this.bag.wait(ms) });
    this.showNext();
  }

  private showNext(): void {
    this.panelBtns.style.display = 'none';
    this.nextBtn?.remove();
    const next = this.nextId();
    const label = next ? '下一题' : '回去看看';
    const b = button('xg-btn xg-btn--primary xg-btn--lg mc-next', `<span>${label}</span>${icon('next')}`, () => this.goNext(), 'next');
    if (this.o === 'portrait') abs(b, { x: 300, y: 1068 - 80, w: 400, h: 76 });
    else abs(b, { x: 832, y: 810 - 12 - 76, w: 236, h: 76 });
    this.el.appendChild(b);
    this.nextBtn = b;
    b.animate([{ transform: 'translateY(30px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: d(260), easing: 'cubic-bezier(.2,.8,.2,1)' });
    if (this.endgame || this.pc) {
      const teach = this.endgame ? this.endgame.teaches : (itemById(this.itemId) as BoardItem | undefined)?.teaches;
      if (teach) this.caption.show(teach);
    }
  }

  private nextId(): string | null {
    if (this.endgame) {
      const tier = ENDGAMES.filter((e) => e.tier === this.endgame!.tier);
      const k = tier.findIndex((e) => e.id === this.itemId);
      return tier[k + 1]?.id ?? null;
    }
    if (!this.lesson) return null;
    const k = this.lesson.items.findIndex((x) => x.id === this.itemId);
    return this.lesson.items[k + 1]?.id ?? null;
  }

  private goNext(): void {
    this.app.play('ui-confirm');
    const n = this.nextId();
    if (n) this.app.go({ name: 'item', id: n });
    else this.app.go(this.endgame ? { name: 'endgames' } : { name: 'academy', lesson: this.lesson?.id });
  }

  /** the lesson is done: a milestone (kit showResult, confetti for 3★) + the wrap line */
  private async lessonDone(l: Lesson, cards: string[], promos: number[]): Promise<void> {
    const save = this.app.save;
    const stars = Math.max(1, Math.min(3, Math.floor(l.items.reduce((a, it) => a + starsOf(save, it.id), 0) / l.items.length))) as 1 | 2 | 3;
    this.app.play('chapter-complete');
    this.app.mark('lesson-complete', { lesson: l.id, stars });
    void this.say(`mc.wrap.${l.id}`, 'celebrating');
    const unlocks: string[] = [];
    if (l.unlocks === 'ladder:fan') unlocks.push('翻翻棋对战开放了');
    if (l.unlocks === 'ladder:ming') unlocks.push('明棋对战开放了');
    if (l.unlocks === 'ladder:an') unlocks.push('暗棋对战开放了');
    if (l.id === 'L5' && endgameTierUnlocked(save, 1)) unlocks.push('残局开放了');
    const nextLesson = LESSONS[LESSONS.indexOf(l) + 1];
    const act = await showResult({
      ribbon: `${l.title} · 学完了`,
      stars,
      // break after the lead-in ("告诉爸爸：") and balance the rest (QA r1: '…官 / 大，…' split)
      title: `<span class="mc-wraptitle">${l.wrap.replace('：', '：<br>')}</span>`,
      text: [...unlocks, ...cards.map((c) => `获得知识卡：${CARDS.find((x) => x.id === c)?.title ?? c}`)].join('　'),
      actions: [
        { id: 'map', label: '回学堂', kind: 'secondary', icon: 'map' },
        ...(nextLesson ? [{ id: 'next', label: '下一课', kind: 'primary' as const, icon: 'next' as const }] : []),
      ],
      accentGame: 'army',
    });
    if (promos.length) await promotionCeremony(this.el, promos, { play: (n) => this.app.play(n), say: (l) => void this.say(l, 'celebrating'), wait: (ms) => this.bag.wait(ms) });
    if (act === 'next' && nextLesson) this.app.go({ name: 'academy', lesson: nextLesson.id });
    else this.app.go({ name: 'academy', lesson: l.id });
  }

  // ------------------------------------------------------------------ scenes (翻翻棋入门 F-1–F-3)
  private async runScene(): Promise<void> {
    const sc = this.scene!;
    await this.say(this.instruction());
    while (this.sceneStep < sc.steps.length && !this.finished) {
      const st = sc.steps[this.sceneStep];
      if (st.who === 'ref') {
        if (st.say) await this.say(st.say, 'surprised');
        this.sceneStep++;
        continue;
      }
      if (st.who === 'ai') {
        await this.bag.wait(d(600));
        const a = sceneAction(this.state, st.act!);
        if (a) await this.playScene(a);
        if (st.say) await this.say(st.say, 'thinking');
        this.sceneStep++;
        continue;
      }
      // kid: light the target, wait for the right tap (a "reject" step says its line after the refusal)
      this.lightScene();
      if (st.say && !st.reject) void this.say(st.say, 'happy');
      await new Promise<void>((res) => (this.sceneWait = res));
      this.sceneStep++;
    }
    if (!this.finished) this.sceneDone();
  }
  private sceneWait: (() => void) | null = null;

  private lightScene(): void {
    const st = this.scene!.steps[this.sceneStep];
    const t = sceneTargets(st);
    if (!t) return;
    this.board.pulse([t.from], 2);
    this.board.setGoalMarks([{ at: this.selected >= 0 ? t.to : t.from, kind: 'reticle' }]);
  }

  private async sceneTap(at: number): Promise<void> {
    if (this.busy || this.finished || !this.sceneWait) return;
    const st = this.scene!.steps[this.sceneStep];
    const t = sceneTargets(st);
    if (!t || !st.act) return;
    // F-2: "select a3" then the refused target
    if (st.act.startsWith('select ')) {
      if (this.selected < 0 && at === t.from) {
        this.select(this.state.board[at]);
        this.board.setGoalMarks([{ at: t.to, kind: 'reticle' }]);
        return;
      }
      if (this.selected >= 0 && at === t.to) {
        this.app.play('bump');
        void this.board.deny(this.state.board[at], 'q');
        this.deselect(true);
        this.board.setGoalMarks([]);
        const done = this.sceneWait;
        this.sceneWait = null;
        this.busy++;
        if (st.say) await this.say(st.say, 'thinking');
        this.busy--;
        done?.();
        return;
      }
      return this.sceneWrongTap(at);
    }
    if (st.act.startsWith('flip ')) {
      if (at !== t.from) return this.sceneWrongTap(at);
      const a = sceneAction(this.state, st.act);
      if (!a) return;
      this.board.setGoalMarks([]);
      await this.playScene(a);
      const done = this.sceneWait;
      this.sceneWait = null;
      done?.();
      return;
    }
    // a move: tap the piece, then the target
    if (this.selected < 0) {
      if (at !== t.from) return this.sceneWrongTap(at);
      this.select(this.state.board[at]);
      this.board.setGoalMarks([{ at: t.to, kind: 'reticle' }]);
      return;
    }
    if (at !== t.to) return this.sceneWrongTap(at);
    const a = sceneAction(this.state, st.act);
    if (!a) return;
    this.deselect(true);
    this.board.setGoalMarks([]);
    await this.playScene(a);
    const done = this.sceneWait;
    this.sceneWait = null;
    done?.();
  }

  private sceneWrongTap(at: number): void {
    this.sceneCorrections++;
    this.app.play('bump');
    const pid = this.state.board[at];
    if (pid >= 0) void this.board.deny(pid, null);
    this.lightScene();
  }

  private async playScene(a: Action): Promise<void> {
    this.busy++;
    const before = this.state;
    const { state, event } = apply(before, a);
    await animateMove(this.board, this.io(), event, before, state);
    this.state = state;
    if (isFlip(a) && before.turn === -1) {
      void this.say(state.colorOf[0] === 0 ? 'mc.ref.youare.red' : 'mc.ref.youare.blue', 'surprised');
      this.renderYouAre();
      await this.bag.wait(d(1400));
    }
    this.busy--;
  }

  /** 翻翻棋 scenes: "你是红方" chip in the goal bar once the first flip decided it */
  private renderYouAre(): void {
    this.goalEl.querySelector('.mc-youare')?.remove();
    const s = this.state;
    if (s.mode !== 'fan' || s.colorOf[0] === -1) return;
    const c = s.colorOf[0];
    const el = div('mc-youare is-inline', `<i></i><span>你是${c === 0 ? '红方' : '蓝方'}</span>`);
    el.dataset.c = String(c);
    el.dataset.testid = 'youare-0';
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      void this.say(c === 0 ? 'mc.ref.youare.red' : 'mc.ref.youare.blue');
    });
    // QA r2 major: its own slot in the sub-row (beside the step dots), never over the instruction
    (this.goalEl.querySelector('.mc-goal__row.is-sub') ?? this.goalEl).appendChild(el);
  }

  private sceneHint(): void {
    this.app.play('hint');
    const st = this.scene!.steps[this.sceneStep];
    this.lightScene();
    if (st?.say) void this.say(st.say, 'thinking');
  }

  private sceneDone(): void {
    this.finished = true;
    const save = this.app.save;
    const stars = cardStars(this.sceneCorrections);
    recordItem(save, this.itemId, stars, { hintMax: 0 });
    awardCards(save);
    const promos = promote(save);
    this.app.persist();
    this.app.hub();
    this.app.mark('item-complete', { id: this.itemId, stars });
    this.flyStars(stars);
    void this.say(praiseLine({ kind: 'scene', retried: this.sceneCorrections > 0 }), 'celebrating');
    this.bag.timeout(() => void this.afterDone(promos), d(1100));
  }

  destroy(): void {
    clearTimeout(this.idleTimer);
    this.board.destroy();
    super.destroy();
  }

  /** ?test=1 */
  debug() {
    return {
      state: () => this.state,
      pc: () => this.pc,
      busy: () => this.busy,
      finished: () => this.finished,
      board: this.board,
      loading: () => this.loading,
      hintLevel: () => this.hintLevel,
      twin: () => this.twin,
      introDone: () => this.introDone,
      sceneWaiting: () => !!this.sceneWait,
    };
  }
}

