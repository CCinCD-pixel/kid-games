// play/replay.ts — 复盘播放器：在视图上前进 / 后退 / 跳转 / 自动播放一局记录（着法列表）。动画走 view.animateMove / animateUndo；
// 跳转用 setState（无动画）。计时器可注入（单测）；reducedMotion 下间隔缩短。不改 Game 以外的状态。
import { createGame, type GameImpl } from '../core/game';
import type { Disposable, GameRules, Sq } from '../core/types';
import type { BoardViewImpl } from '../view/board-view';

export interface ReplayOptions<M, S> {
  rules: GameRules<M, S>; view: BoardViewImpl<M, S>; startFen: string; moves: readonly string[]; cfg?: unknown;
  /** 自动播放每手之间的间隔（毫秒，不含动画；缺省 650） */
  gapMs?: number;
  setTimer?: (f: () => void, ms: number) => unknown; clearTimer?: (h: unknown) => void;
}
export interface ReplayPlayer<M> {
  readonly ply: number; readonly total: number; readonly playing: boolean; readonly atEnd: boolean; readonly moves: readonly M[];
  next(): Promise<boolean>; prev(): Promise<boolean>; goto(ply: number): void;
  play(): void; pause(): void; toggle(): void;
  onChange(cb: (e: { ply: number; total: number; playing: boolean }) => void): Disposable;
  destroy(): void;
}
export function createReplayPlayer<M, S>(o: ReplayOptions<M, S>): ReplayPlayer<M> {
  const { rules, view } = o; const setT = o.setTimer ?? ((f, ms) => setTimeout(f, ms)); const clrT = o.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  const g: GameImpl<M, S> = createGame(rules, o.startFen); const states: S[] = [g.state()]; const moves: M[] = []; const lasts: ([Sq, Sq] | null)[] = [null];
  for (const t of o.moves) { const m = rules.decode(g.state(), t); if (m === null) break; const i = rules.moveInfo(g.state(), m); g.play(m); moves.push(m); states.push(g.state()); lasts.push([i.from, i.to]); }
  let ply = 0; let playing = false; let busy = false; let timer: unknown = null; let destroyed = false; const subs = new Set<(e: { ply: number; total: number; playing: boolean }) => void>();
  const emit = (): void => { for (const cb of [...subs]) cb({ ply, total: moves.length, playing }); };
  const setLast = (): void => { const l = lasts[ply]; if (l) view.setLastMove(l[0], l[1]); else view.setLastMove(null); };
  view.setState(states[0]); view.setLastMove(null);
  const stopTimer = (): void => { if (timer !== null) { clrT(timer); timer = null; } };
  const schedule = (): void => { stopTimer(); if (!playing || destroyed) return; timer = setT(() => { timer = null; void api.next().then((ok) => { if (!ok) { playing = false; emit(); } else schedule(); }); }, view.reduced ? Math.min(200, o.gapMs ?? 650) : o.gapMs ?? 650); };
  const api: ReplayPlayer<M> = {
    get ply() { return ply; }, get total() { return moves.length; }, get playing() { return playing; }, get atEnd() { return ply >= moves.length; }, moves,
    async next() { if (destroyed || busy || ply >= moves.length) return false; busy = true; try { view.finishAnimations(); const before = states[ply]; const m = moves[ply]; ply++; emit(); await view.animateMove(m, before); setLast(); return true; } finally { busy = false; } },
    async prev() { if (destroyed || busy || ply <= 0) return false; busy = true; try { view.finishAnimations(); const after = states[ply]; const m = moves[ply - 1]; ply--; emit(); await view.animateUndo(m, after, states[ply]); setLast(); return true; } finally { busy = false; } },
    goto(n) { if (destroyed) return; stopTimer(); playing = false; view.finishAnimations(); ply = Math.max(0, Math.min(moves.length, Math.round(n))); view.setState(states[ply]); setLast(); emit(); },
    play() { if (destroyed || playing) return; if (ply >= moves.length) api.goto(0); playing = true; emit(); schedule(); },
    pause() { playing = false; stopTimer(); emit(); }, toggle() { if (playing) api.pause(); else api.play(); },
    onChange(cb) { subs.add(cb); return { dispose: () => subs.delete(cb) }; },
    destroy() { destroyed = true; stopTimer(); subs.clear(); },
  };
  return api;
}
