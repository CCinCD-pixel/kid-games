/**
 * One move, animated on a BoardView (spec §6.8) for the puzzle, scene and FT screens: road step /
 * rail glide with per-station clicks, collision approach + clash, the "7 > 5" plate, then the
 * verdict's effect (mine dust, bomb, digging sparks, flag ribbons, tiles leaving). Everything is
 * face up here (puzzles are 明棋-like; L8-8's hidden mines are never touched by the solution).
 */
import { isRail, isRailEdge } from '../core/board';
import { isFlip, isMove } from '../core/movegen';
import { BOMB, ENG, FLAG, MINE, rankOf } from '../core/pieces';
import type { MoveEvent } from '../core/rules';
import type { GameState } from '../core/state';
import { MS, d, dm } from './anim';
import type { BoardView } from './board-view';
import * as fx from './fx';
import { mcIcon } from './icons';

export interface AnimIO {
  play(name: string, o?: { step?: number }): void;
  say?(line: string): void;
  wait(ms: number): Promise<void>;
  /** the child's side (ribbons on its flag captures) */
  kid: number;
}

const rankHtml = (s: GameState, pid: number): string => {
  const t = s.ptype[pid];
  const side = s.pside[pid] ? 'b' : 'r';
  if (t === BOMB) return `<span class="${side}">${mcIcon('bomb')}</span>`;
  if (t === MINE) return `<span class="${side}">${mcIcon('mine')}</span>`;
  if (t === FLAG) return `<span class="${side}">${mcIcon('flag')}</span>`;
  return `<span class="${side}">${rankOf(t)}</span>`;
};

const railMove = (path: number[]): boolean => path.length > 2 || (path.length === 2 && isRail(path[0]) && isRail(path[1]) && isRailEdge(path[0], path[1]));

export async function animateMove(b: BoardView, io: AnimIO, ev: MoveEvent, before: GameState, after: GameState, o: { dragged?: boolean } = {}): Promise<void> {
  b.clearHighlights();
  for (let p = 0; p < before.np; p++) b.setLifted(p, false);
  const a = ev.action;
  if (isFlip(a)) {
    io.play('flip');
    await b.flip(before.board[a.flip], after);
    b.render(after);
    return;
  }
  if (!isMove(a)) {
    b.render(after);
    return;
  }
  const rail = railMove(a.path);
  const click = (k: number) => io.play('mc.rail', { step: k });
  const dragged = o.dragged ?? b.takeDropped(a.pid);
  if (ev.outcome === null) {
    if (dragged) {
      io.play('ui-snap');
      await b.glideTo(a.pid, a.to);
    } else {
      if (rail) b.flashPath(a.path, dm(Math.min(MS.railMax, MS.railBase + MS.railPerStation * (a.path.length - 1))) + 200);
      await b.moveAlong(a.pid, a.path, { rail, onStation: rail ? click : undefined });
    }
    io.play('place-piece');
    b.render(after);
    return;
  }
  const att = ev.att!, def = ev.def!;
  if (dragged) await b.glideTo(att, a.to, 0.7);
  else {
    if (rail) b.flashPath(a.path, 500);
    await b.moveAlong(att, a.path, { rail, stopShort: 0.7, onStation: rail ? click : undefined });
  }
  io.play('capture');
  await b.clash(att, def);
  const at = b.center(a.to);
  const g = b.g.rect;
  const pt = { x: Math.min(g.w - 110, Math.max(110, at.x)), y: Math.min(g.h - 40, Math.max(40, at.y - 52)) };
  const tA = before.ptype[att], tD = before.ptype[def];
  const special = tA === BOMB || tD === BOMB || tD === MINE || tD === FLAG;
  const op = ev.outcome === 'A' ? '&gt;' : ev.outcome === 'D' ? '&lt;' : ev.outcome === 'B' ? '=' : '&gt;';
  const opHtml = special ? (ev.outcome === 'A' ? mcIcon('swords') : ev.outcome === 'D' ? mcIcon('shield') : ev.outcome === 'B' ? mcIcon('smoke') : mcIcon('flag')) : `<span class="op">${op}</span>`;
  void fx.plate(b.fxLayer, pt, `${rankHtml(before, att)}${opHtml}${rankHtml(before, def)}`, special ? 500 : (MS.plateHold as number));
  await io.wait(d(MS.plate * 0.6));
  const tray = (pid: number) => ({ x: at.x, y: before.pside[pid] === 0 ? at.y + 120 : at.y - 120 });
  switch (ev.outcome) {
    case 'A':
      if (tD === MINE && tA === ENG) {
        io.play('mc.shovel');
        void fx.sparks(b.fxLayer, at, 8);
        io.say?.('mc.ref.mine.clear');
      }
      await Promise.all([b.remove(def, tray(def)), io.wait(d(120))]);
      await b.settle(att, a.to);
      void b.gleam(att);
      break;
    case 'D':
      if (tD === MINE) {
        io.play('mc.mine');
        void fx.mineDust(b.fxLayer, at);
        void b.shake(3, MS.mineShake);
      }
      await b.remove(att, tray(att));
      void b.gleam(def);
      break;
    case 'B':
      if (tA === BOMB || tD === BOMB) {
        io.play('mc.boom');
        void fx.bomb(b.fxLayer, at);
        void b.shake(6, MS.bombShake);
      } else {
        void fx.smoke(b.fxLayer, at);
        void fx.shards(b.fxLayer, at, '#9aa0a8');
      }
      await Promise.all([b.remove(att), b.remove(def)]);
      break;
    case 'F':
      io.play('mc.flag');
      await b.remove(def, { x: at.x, y: at.y - 60 });
      await b.settle(att, a.to);
      if (before.pside[att] === io.kid) void fx.ribbons(b.fxLayer, at);
      void b.gleam(att);
      await io.wait(d(MS.flagCapture / 2));
      break;
  }
  b.render(after);
}
