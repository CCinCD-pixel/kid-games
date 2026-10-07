/**
 * S0b 首次上手 (spec §2.6): the first 60 seconds, almost without words, on the real board.
 *  1. the board slides in; a red 团长 and a blue 营长 land on both ends of the middle bridge;
 *  2. the guide hops in: "数字越大，官越大"; the ghost hand taps 团长 → 营长;
 *  3. "点团长，再点营长": he does it — 5 > 4, the 营长 leaves;
 *  4. a blue 师长 drops next to them and a red 军长 appears: "哪个子比师长大？" — the 团长 bounces
 *     (5 < 7) and the position is restored; the 军长 wins (8 > 7). 5 s idle → the ghost points at 军长;
 *  5. gold sparks, then the camp: the 学堂 card glows, the first shoulder board (工兵) drops, quietly.
 * Logged as `ft` { firstSuccessMs, deadTaps, helpCount }. Runs once (save.firstRun.ft).
 */
import { ghostTap } from '@kit/ui';
import type { App } from '../app';
import { BLUE, RED, parseSq } from '../core/board';
import { pieceMoves } from '../core/movegen';
import { apply } from '../core/rules';
import { addPiece, newState, type GameState } from '../core/state';
import { promote } from '../core/progress';
import { EASE, d } from '../view/anim';
import { BoardView } from '../view/board-view';
import * as fx from '../view/fx';
import { boardGeom, stageGeom } from '../view/layout';
import { animateMove } from '../view/move-anim';
import { BaseScreen, IntroSkip, abs, div } from './base';

type Step = 'intro' | 'first' | 'second' | 'end';

export class FtScreen extends BaseScreen {
  readonly name = 'ft';
  private board: BoardView;
  private state: GameState;
  private step: Step = 'intro';
  private selected = -1;
  private busy = 0;
  private t0 = 0;
  private firstSuccessMs = -1;
  private deadTaps = 0;
  private helpCount = 0;
  private idle = 0;
  private slid = false;

  constructor(app: App) {
    super(app);
    const s = newState('ming', { puzzle: 'static' });
    addPiece(s, RED, 7, parseSq('c6')); // 团长 (5)
    addPiece(s, BLUE, 6, parseSq('c7')); // 营长 (4)
    s.turn = RED;
    this.state = s;
    this.board = new BoardView(
      { onTap: (at) => this.tap(at), onDrop: (pid, at) => this.drop(pid, at), canDrag: (pid) => this.canDrag(pid), onTouch: () => this.touched() },
      { viewer: RED, numbers: true },
    );
    this.bag.timeout(() => void this.run(), 200);
  }

  back(): boolean {
    // leaving early is fine: the camp, FT stays not-done (it comes back next time)
    this.app.go({ name: 'home', skipFt: true });
    return true;
  }

  protected render(): void {
    const o = this.o, st = this.safeTop;
    this.el.replaceChildren();
    this.el.classList.add('mc-ft');
    const g = stageGeom(o, st);
    this.board.setGeom(boardGeom(o, st));
    this.el.appendChild(this.board.el);
    const gh = div('mc-match__guide');
    if (o === 'portrait') {
      abs(gh, { x: 12, y: g.intel.y, w: 150, h: g.intel.h });
      abs(this.caption.el, { x: 182, y: g.intel.y + 30, w: 616, h: 84 });
      this.caption.el.classList.remove('is-tall', 'is-dock');
    } else {
      abs(gh, { x: 832, y: st + 300, w: 236, h: 200 });
      // the bubble fits its text (same docked bubble as puzzles / matches, QA r3)
      abs(this.caption.el, { x: 832, y: st + 520, w: 236, h: 0 });
      this.caption.el.classList.add('is-tall', 'is-dock');
    }
    this.el.append(gh, this.caption.el);
    this.placeGuide(gh, o === 'portrait' ? 120 : 150, { mood: 'happy' });
    this.board.render(this.state, true);
    if (!this.slid) {
      this.slid = true;
      this.board.el.animate([{ transform: 'translateY(520px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: d(420), easing: EASE.spring });
      gh.style.visibility = 'hidden';
    }
  }

  private async run(): Promise<void> {
    this.busy++;
    // pieces land on the bridge
    await this.bag.wait(d(480));
    this.app.play('place-piece');
    for (let p = 0; p < this.state.np; p++) this.board.pieceEl(p)?.animate([{ transform: `${this.board.pieceEl(p)!.style.transform} translateY(-60px)`, opacity: 0 }, { transform: this.board.pieceEl(p)!.style.transform, opacity: 1 }], { duration: d(260), delay: d(p * 120), easing: EASE.back });
    await this.bag.wait(d(700));
    // the referee hops in
    const gh = this.el.querySelector<HTMLElement>('.mc-match__guide');
    if (gh) {
      gh.style.visibility = '';
      gh.animate([{ transform: 'translate(60px, 80px) scale(.6)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: d(420), easing: EASE.back });
    }
    this.guide?.react('hop');
    // QA r2 major: the demo used to swallow the child's taps for ~7 s. Now the first touch takes over
    // (like the items' IntroSkip): the demo stops and the 团长 is lifted, ready for "点团长，再点营长".
    const c6 = this.state.board[parseSq('c6')];
    const gate = new IntroSkip(this.el, () => {
      this.app.voice.stop();
      this.app.play('ui-pick');
    });
    try {
      // the ghost: 团长 → 营长 (shown, not played)
      if (await gate.step(this.say('mc.ft.1', 'happy'))) {
        if (await gate.step(this.ghostAt('c6'))) {
          this.board.setLifted(c6, true);
          this.board.showMoves(pieceMoves(this.state, c6));
          await gate.step(this.ghostAt('c7'));
        }
      }
    } finally {
      gate.end();
    }
    this.board.setLifted(c6, false);
    this.board.clearHighlights();
    this.busy--;
    this.step = 'first';
    this.t0 = performance.now();
    if (gate.skipped) {
      // the touch that ended the demo picks the 团长 up: instant, visible feedback
      this.selected = c6;
      this.board.setLifted(c6, true);
      this.board.showMoves(pieceMoves(this.state, c6));
    }
    void this.say('mc.ft.2', 'happy');
    this.armIdle();
  }

  private async ghostAt(sqName: string): Promise<void> {
    const c = this.board.center(parseSq(sqName));
    const t = document.createElement('div');
    Object.assign(t.style, { position: 'absolute', left: `${c.x - 2}px`, top: `${c.y - 2}px`, width: '4px', height: '4px' });
    this.board.fxLayer.appendChild(t);
    await ghostTap(t);
    t.remove();
  }

  private touched(): void {
    this.armIdle();
  }

  /** 5 s without a touch in a step → the ghost shows the piece to use */
  private armIdle(): void {
    clearTimeout(this.idle);
    if (this.step !== 'first' && this.step !== 'second') return;
    this.idle = this.bag.timeout(() => void this.help(), 5000);
  }

  private async help(): Promise<void> {
    if (this.busy || (this.step !== 'first' && this.step !== 'second')) return;
    this.helpCount++;
    const from = this.step === 'first' ? 'c6' : 'a7';
    this.busy++;
    await this.ghostAt(from);
    this.board.pulse([parseSq(from)], 2);
    this.busy--;
    void this.say(this.step === 'first' ? 'mc.ft.2' : 'mc.ft.choose', 'thinking');
    this.armIdle();
  }

  private canDrag(pid: number): boolean {
    return !this.busy && (this.step === 'first' || this.step === 'second') && this.state.pside[pid] === RED;
  }

  private tap(at: number): void {
    if (this.busy || (this.step !== 'first' && this.step !== 'second')) {
      // never silent (kit ≤100 ms feedback rule): a tap while pieces move / the guide talks still answers
      if (this.step === 'end') return;
      this.deadTaps++;
      this.app.play('ui-tap');
      const occ = this.state.board[at];
      if (occ >= 0) this.board.pulse([at], 1);
      return;
    }
    const s = this.state;
    const occ = s.board[at];
    if (occ >= 0 && s.pside[occ] === RED) {
      if (this.selected === occ) {
        this.board.setLifted(occ, false);
        this.board.clearHighlights();
        this.selected = -1;
        return;
      }
      if (this.selected >= 0) this.board.setLifted(this.selected, false);
      this.selected = occ;
      this.app.play('ui-pick');
      this.board.setLifted(occ, true);
      this.board.showMoves(pieceMoves(s, occ));
      return;
    }
    if (this.selected >= 0) {
      const m = pieceMoves(s, this.selected).find((x) => x.to === at);
      if (m && occ >= 0) return void this.commit(this.selected, at, false);
    }
    this.deadTaps++;
    this.app.play('ui-tap');
    if (occ >= 0) void this.board.deny(occ, null);
  }

  private drop(pid: number, at: number): void {
    if (this.busy) {
      this.deadTaps++;
      void this.board.springBack(pid);
      return;
    }
    const m = pieceMoves(this.state, pid).find((x) => x.to === at);
    if (m && this.state.board[at] >= 0) {
      this.selected = pid;
      void this.commit(pid, at, true);
      return;
    }
    this.deadTaps++;
    void this.board.springBack(pid);
  }

  private async commit(pid: number, at: number, dragged: boolean): Promise<void> {
    const m = pieceMoves(this.state, pid).find((x) => x.to === at);
    if (!m) return;
    this.busy++;
    clearTimeout(this.idle);
    this.board.setLifted(pid, false);
    this.selected = -1;
    const before = this.state;
    const { state, event } = apply(before, m);
    const io = { play: (n: string, o?: { step?: number }) => this.app.play(n, o), wait: (ms: number) => this.bag.wait(ms), kid: RED };
    await animateMove(this.board, io, event, before, state, { dragged });
    if (this.step === 'first') {
      // 5 > 4
      this.firstSuccessMs = Math.round(performance.now() - this.t0);
      this.app.play('correct');
      await this.say('mc.ft.ok', 'celebrating');
      this.state = { ...state, turn: RED };
      await this.second();
      // QA r2 major: input opens as soon as the new pieces have landed; the question plays over it
      this.busy--;
      void this.say('mc.ft.choose', 'happy');
      this.armIdle();
      return;
    }
    if (event.outcome === 'D') {
      // the 团长 bounced: put everything back and ask again
      this.app.play('try-again');
      void this.say('mc.ft.bigger', 'encouraging');
      await this.bag.wait(d(500));
      this.state = { ...before };
      this.board.render(this.state, true);
      for (let p = 0; p < this.state.np; p++) this.board.pieceEl(p)?.animate([{ opacity: 0.3 }, { opacity: 1 }], { duration: d(300) });
      this.busy--;
      this.armIdle();
      return;
    }
    // 8 > 7: done
    this.state = state;
    this.step = 'end';
    this.busy--;
    await this.finish();
  }

  /** step 4: a 师长 drops in at b7, a 军长 appears at a7 */
  private async second(): Promise<void> {
    const s = this.state;
    const blue = addPiece(s, BLUE, 9, parseSq('b7')); // 师长 (7)
    const red = addPiece(s, RED, 10, parseSq('a7')); // 军长 (8)
    s.turn = RED;
    this.board.render(s, true);
    const pb = this.board.pieceEl(blue), pr = this.board.pieceEl(red);
    if (pb) pb.animate([{ transform: `${pb.style.transform} translateY(-120px)`, opacity: 0 }, { transform: pb.style.transform, opacity: 1 }], { duration: d(360), easing: EASE.back });
    this.app.play('place-piece');
    await this.bag.wait(d(300));
    if (pr) pr.animate([{ transform: `${pr.style.transform} scale(.4)`, opacity: 0 }, { transform: pr.style.transform, opacity: 1 }], { duration: d(320), easing: EASE.back });
    this.app.play('ui-pop');
    this.step = 'second';
  }

  private async finish(): Promise<void> {
    const at = this.board.center(parseSq('b7'));
    this.app.play('correct-big');
    void fx.sparks(this.board.fxLayer, at, 8);
    this.guide?.react('hop');
    const save = this.app.save;
    save.firstRun.ft = true;
    const promos = promote(save);
    this.app.persist();
    this.app.hub();
    this.app.mark('ft', { firstSuccessMs: this.firstSuccessMs, deadTaps: this.deadTaps, helpCount: this.helpCount });
    await this.bag.wait(d(1100));
    this.app.go({ name: 'home', ftPromos: promos });
  }

  destroy(): void {
    clearTimeout(this.idle);
    this.board.destroy();
    super.destroy();
  }

  debug() {
    return { step: () => this.step, busy: () => this.busy, board: this.board, state: () => this.state, log: () => ({ firstSuccessMs: this.firstSuccessMs, deadTaps: this.deadTaps, helpCount: this.helpCount }) };
  }
}
