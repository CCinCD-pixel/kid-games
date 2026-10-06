/**
 * 全盘复盘 (spec §5.6): the finished game replayed move by move with everything face up (◀ ▶), opened
 * on a key moment. Read-only: the board never takes input here.
 */
import { icon } from '@kit/ui';
import type { App } from '../app';
import { isFlip, isMove } from '../core/movegen';
import { parseNote } from '../core/notation';
import { apply } from '../core/rules';
import type { GameState } from '../core/state';
import { startState } from '../ctrl/setup';
import { BoardView } from '../view/board-view';
import { boardGeom } from '../view/layout';
import { BaseScreen, abs, button, div } from './base';
import type { ResultData } from './result';

export class ReviewScreen extends BaseScreen {
  readonly name = 'review';
  private states: GameState[] = [];
  private paths: number[][] = [];
  private k: number;
  private board: BoardView;
  private counter!: HTMLDivElement;

  constructor(app: App, private data: ResultData, ply = 0) {
    super(app);
    let s = data.start ?? startState(data.match);
    this.states.push(s);
    this.paths.push([]);
    for (const n of data.match.actions) {
      const a = parseNote(s, n);
      if (!a) break;
      s = apply(s, a).state;
      this.states.push(s);
      this.paths.push(isMove(a) ? a.path : isFlip(a) ? [a.flip] : []);
    }
    // a key moment's ply = the move index → the position after it
    this.k = Math.max(0, Math.min(this.states.length - 1, ply + 1));
    this.board = new BoardView({ onTap: () => undefined, onDrop: () => undefined, canDrag: () => false }, { viewer: -1, numbers: app.save.settings.numberBadges });
  }

  back(): boolean {
    this.app.go({ name: 'result', data: this.data });
    return true;
  }

  protected render(): void {
    const portrait = this.o === 'portrait';
    const st = this.safeTop;
    this.el.replaceChildren();
    this.el.classList.add('mc-review');
    const g = boardGeom(this.o, st);
    this.board.setGeom(g);
    this.el.appendChild(this.board.el);
    const bar = div('mc-review__bar');
    const prev = button('xg-iconbtn xg-iconbtn--lg', icon('back'), () => this.step(-1), 'review-prev');
    const next = button('xg-iconbtn xg-iconbtn--lg', icon('next'), () => this.step(1), 'review-next');
    this.counter = div('mc-review__n');
    this.counter.dataset.testid = 'review-n';
    bar.append(prev, this.counter, next);
    abs(bar, portrait ? { x: 205, y: 1080 - 16 - 76 - 70, w: 400, h: 76 } : { x: 840, y: 810 / 2 - 38, w: 228, h: 76 });
    this.el.appendChild(bar);
    const done = button('xg-btn xg-btn--secondary', `${icon('check')}<span>看完了</span>`, () => this.back(), 'review-done');
    abs(done, portrait ? { x: 280, y: 1080 - 16 - 64, w: 250, h: 60 } : { x: 856, y: 810 - 16 - 64, w: 200, h: 60 });
    this.el.appendChild(done);
    this.show();
  }

  private step(dk: number): void {
    const k = this.k + dk;
    if (k < 0 || k >= this.states.length) {
      this.app.play('ui-locked');
      return;
    }
    this.app.play('ui-tap');
    this.k = k;
    this.show();
  }

  private show(): void {
    const s = this.states[this.k];
    this.board.render(s, true);
    const p = this.paths[this.k];
    if (p.length >= 2) this.board.showLastMove(p);
    else this.board.clearLastMove();
    if (p.length === 1) this.board.pulse(p, 1);
    this.counter.innerHTML = `<b>${this.k}</b><i>/</i><span>${this.states.length - 1}</span>`;
  }

  destroy(): void {
    this.board.destroy();
    super.destroy();
  }
}
