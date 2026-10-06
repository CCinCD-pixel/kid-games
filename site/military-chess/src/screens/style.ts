/**
 * Style sheet (spec §6.10, only with ?test=1&style=1): every tile × face × colour × shape, the
 * highlight states, and a live board. ?style=board shows the board with a 明棋 opening and
 * highlights; ?style=1 the tile sheet.
 */
import type { App, Screen } from '../app';
import { parseSq } from '../core/board';
import { pieceMoves } from '../core/movegen';
import { DISPLAY_ORDER } from '../core/pieces';
import { setupStandard } from '../core/state';
import { TEMPLATES } from '../content';
import { BoardView } from '../view/board-view';
import { boardGeom, type Orientation } from '../view/layout';
import { tileSvg, type Face, type Shape } from '../view/pieces-svg';

export class StyleScreen implements Screen {
  readonly name = 'style';
  readonly el = document.createElement('div');
  private board: BoardView | null = null;

  constructor(private app: App) {
    this.el.className = 'mc-screen mc-style';
  }

  layout(o: Orientation, safeTop: number): void {
    this.el.replaceChildren();
    const mode = this.app.params.get('style');
    if (mode === 'board' || mode === 'an' || mode === 'fan') {
      this.board?.destroy();
      const b = new BoardView({ onTap: () => undefined, onDrop: () => undefined, canDrag: () => false });
      this.board = b;
      b.setGeom(boardGeom(o, safeTop));
      const t = (id: string) => TEMPLATES.find((x) => x.id === id)!.layout;
      const s = setupStandard(mode === 'an' ? 'an' : 'ming', { red: t('balanced'), blue: t('fortress') });
      if (mode === 'fan') {
        for (let p = 0; p < s.np; p++) s.pup[p] = p % 3 === 0 ? 1 : 0;
        (s as { mode: string }).mode = 'fan';
      }
      b.setOpts({ viewer: 0 });
      b.render(s);
      this.el.appendChild(b.el);
      const pid = s.board[parseSq('a6')];
      b.setLifted(pid, true);
      b.showMoves(pieceMoves(s, pid));
      b.showLastMove([parseSq('e7'), parseSq('e8')]);
      return;
    }
    const sheet = document.createElement('div');
    sheet.style.cssText = `position:absolute;left:16px;right:16px;top:${safeTop + 64}px;bottom:16px;display:flex;flex-wrap:wrap;gap:6px;align-content:flex-start;background:#7f9452;border-radius:16px;padding:14px;box-sizing:border-box;`;
    const shapes: Shape[] = o === 'portrait' ? ['wide', 'tall'] : ['tall', 'wide'];
    for (const shape of shapes) {
      for (const side of [0, 1]) {
        for (const t of DISPLAY_ORDER) sheet.insertAdjacentHTML('beforeend', tileSvg({ side, type: t, shape, face: 'up' }));
        for (const face of ['back', 'fan'] as Face[]) sheet.insertAdjacentHTML('beforeend', tileSvg({ side, type: 0, shape, face }));
      }
      // rotations for face-to-face seating and number-badge off
      for (const rot of shape === 'wide' ? [180] : [90, -90]) sheet.insertAdjacentHTML('beforeend', tileSvg({ side: 1, type: 9, shape, face: 'up', rot }));
      sheet.insertAdjacentHTML('beforeend', tileSvg({ side: 0, type: 11, shape, face: 'up', numbers: false }));
    }
    this.el.appendChild(sheet);
  }

  destroy(): void {
    this.board?.destroy();
    this.el.remove();
  }
}
