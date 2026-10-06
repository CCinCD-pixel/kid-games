/**
 * Match controller (spec §8.3): a pure reducer transition(ctx, event) → { ctx, effects }. The match
 * screen executes the effects (animation, AI request, narration, save) and feeds events back. The
 * reducer owns the input lock (R10): while `lock > 0` or the side to move is not a human, taps
 * change nothing (they produce a `deadTap` effect for the wobble feedback).
 *
 * Players: 0 and 1. In 明棋/暗棋 player p plays colour p (0 = RED = the near seat / the child).
 * In 翻翻棋 the colours are decided by the first flip (state.colorOf).
 */
import type { Side } from '../core/board';
import { coachCheck, type CoachAlert } from '../core/coach';
import { whyImmobile, whyNot, type Why } from '../core/explain';
import { isFlip, legalMoves, pieceMoves, type Action, type Move } from '../core/movegen';
import { toNote } from '../core/notation';
import { agreeDraw, apply, type MoveEvent } from '../core/rules';
import { playerToAct, type GameResult, type GameState } from '../core/state';

export type Controller = 'human' | 'ai';
export type Phase = 'idle' | 'selected' | 'animating' | 'thinking' | 'confirm' | 'ended';

export interface MatchCtx {
  id: string;
  phase: Phase;
  state: GameState;
  /** positions before each ply (undo) */
  history: GameState[];
  notes: string[];
  selected: number;
  lock: number;
  players: [Controller, Controller];
  /** id of the outstanding AI request (`<matchId>:<ply>`) */
  thinkId: string | null;
  /** action waiting for a yes/no (参谋提醒 C1–C5, incl. the last mobile piece entering a 大本营, E4) */
  pending: Action | null;
  deadTaps: number;
  undos: number;
  /** the child's coach check before a human commit (pure; null = never ask) */
  coach: ((s: GameState, a: Action) => CoachAlert | null) | null;
}

export type MatchEvent =
  | { type: 'start' }
  | { type: 'tap'; at: number }
  | { type: 'drop'; pid: number; at: number }
  | { type: 'animDone' }
  | { type: 'aiMove'; id: string; note: string; action: Action }
  | { type: 'confirm'; yes: boolean }
  | { type: 'undo'; player: 0 | 1 }
  | { type: 'agreeDraw' }
  | { type: 'lock' }
  | { type: 'unlock' };

export type Effect =
  | { kind: 'select'; pid: number; moves: Move[] }
  | { kind: 'deselect' }
  | { kind: 'deny'; pid: number; at: number; why: Why; drop: boolean }
  | { kind: 'info'; pid: number }
  | { kind: 'deadTap'; animating: boolean }
  | { kind: 'commit'; action: Action; event: MoveEvent; before: GameState; after: GameState; note: string; player: 0 | 1 }
  | { kind: 'think'; id: string; state: GameState }
  | { kind: 'turn'; player: 0 | 1; ai: boolean }
  | { kind: 'coach'; alert: CoachAlert; action: Action }
  | { kind: 'end'; result: GameResult }
  | { kind: 'restored' }
  | { kind: 'save' };

export interface Step {
  ctx: MatchCtx;
  effects: Effect[];
}

export function createMatch(id: string, state: GameState, players: [Controller, Controller], coach: MatchCtx['coach'] = null): MatchCtx {
  return { id, phase: 'animating', state, history: [], notes: [], selected: -1, lock: 1, players, thinkId: null, pending: null, deadTaps: 0, undos: 0, coach };
}

/** Rebuild a match from its notes (resume). Ends in the 'animating' phase; dispatch 'animDone' to start. */
export function restoreMatch(id: string, start: GameState, players: [Controller, Controller], notes: readonly string[], parse: (s: GameState, n: string) => Action | null, coach: MatchCtx['coach'] = null): MatchCtx {
  const ctx = createMatch(id, start, players, coach);
  let s = start;
  for (const n of notes) {
    const a = parse(s, n);
    if (!a) break;
    ctx.history.push(s);
    ctx.notes.push(n);
    s = apply(s, a).state;
  }
  ctx.state = s;
  return ctx;
}

const humanToAct = (ctx: MatchCtx): boolean => !ctx.state.result && ctx.players[playerToAct(ctx.state)] === 'human';
/** the colour the acting player owns (−1 before the first 翻翻棋 flip) */
const actingColour = (s: GameState): Side | -1 => s.turn;

function turnStart(ctx: MatchCtx, fx: Effect[]): MatchCtx {
  const s = ctx.state;
  if (s.result) {
    fx.push({ kind: 'end', result: s.result });
    return { ...ctx, phase: 'ended', lock: 0, selected: -1, thinkId: null };
  }
  const player = playerToAct(s);
  if (ctx.players[player] === 'ai') {
    const id = `${ctx.id}:${s.ply}`;
    fx.push({ kind: 'turn', player, ai: true });
    fx.push({ kind: 'think', id, state: s });
    return { ...ctx, phase: 'thinking', lock: 1, thinkId: id, selected: -1 };
  }
  fx.push({ kind: 'turn', player, ai: false });
  return { ...ctx, phase: 'idle', lock: 0, selected: -1, thinkId: null };
}

function commit(ctx: MatchCtx, action: Action, fx: Effect[]): MatchCtx {
  const before = ctx.state;
  const player = playerToAct(before);
  const { state, event } = apply(before, action);
  const note = toNote(action);
  if (ctx.selected >= 0) fx.push({ kind: 'deselect' });
  fx.push({ kind: 'commit', action, event, before, after: state, note, player });
  fx.push({ kind: 'save' });
  return { ...ctx, phase: 'animating', lock: 1, state, history: [...ctx.history, before], notes: [...ctx.notes, note], selected: -1, pending: null };
}

/** a human commit goes through the coach first (C1–C5; E4 = C5 always asks) */
function commitOrAsk(ctx: MatchCtx, action: Action, fx: Effect[]): MatchCtx {
  // without a coach (family games, tests) only E4 / C5 asks
  const s = ctx.state;
  const alert = ctx.coach ? ctx.coach(s, action) : coachCheck(s, action, { me: (s.turn === -1 ? 0 : s.turn) as Side, knowledge: null, hidden: null, used: 0, enabled: false });
  if (alert) {
    fx.push({ kind: 'coach', alert, action });
    return { ...ctx, phase: 'confirm', lock: 1, pending: action };
  }
  return commit(ctx, action, fx);
}

function tryMove(ctx: MatchCtx, pid: number, at: number, drop: boolean, fx: Effect[]): MatchCtx {
  const s = ctx.state;
  const m = pieceMoves(s, pid).find((mm) => mm.to === at);
  if (!m) {
    const why = whyNot(s, pid, at);
    fx.push({ kind: 'deny', pid, at, why, drop });
    return ctx;
  }
  return commitOrAsk(ctx, m, fx);
}

export function transition(ctx: MatchCtx, ev: MatchEvent): Step {
  const fx: Effect[] = [];
  switch (ev.type) {
    case 'start':
    case 'animDone': {
      if (ev.type === 'animDone' && ctx.phase !== 'animating') return { ctx, effects: fx };
      return { ctx: turnStart(ctx, fx), effects: fx };
    }
    case 'lock':
      return { ctx: { ...ctx, lock: ctx.lock + 1 }, effects: fx };
    case 'unlock':
      return { ctx: { ...ctx, lock: Math.max(0, ctx.lock - 1) }, effects: fx };
    case 'aiMove': {
      if (ctx.phase !== 'thinking' || ev.id !== ctx.thinkId) return { ctx, effects: fx }; // stale answer (R10.2)
      const legal = legalMoves(ctx.state).some((a) => toNote(a) === ev.note);
      if (!legal) return { ctx, effects: fx };
      return { ctx: commit({ ...ctx, thinkId: null }, ev.action, fx), effects: fx };
    }
    case 'confirm': {
      if (ctx.phase !== 'confirm' || !ctx.pending) return { ctx, effects: fx };
      if (ev.yes) return { ctx: commit({ ...ctx, phase: 'idle', lock: 0 }, ctx.pending, fx), effects: fx };
      fx.push({ kind: 'deselect' });
      return { ctx: { ...ctx, phase: 'idle', lock: 0, pending: null, selected: -1 }, effects: fx };
    }
    case 'undo': {
      if (ctx.phase !== 'idle' && ctx.phase !== 'selected') return { ctx, effects: fx };
      if (ctx.state.mode !== 'ming' || ctx.lock > 0) return { ctx, effects: fx };
      // go back to just before `player`'s last move
      let k = ctx.history.length - 1;
      while (k >= 0 && playerToAct(ctx.history[k]) !== ev.player) k--;
      if (k < 0) return { ctx, effects: fx };
      const state = ctx.history[k];
      const next: MatchCtx = { ...ctx, state, history: ctx.history.slice(0, k), notes: ctx.notes.slice(0, k), selected: -1, undos: ctx.undos + 1 };
      fx.push({ kind: 'deselect' }, { kind: 'restored' }, { kind: 'save' });
      return { ctx: turnStart(next, fx), effects: fx };
    }
    case 'agreeDraw': {
      if (ctx.phase === 'ended' || ctx.phase === 'animating') return { ctx, effects: fx };
      const state = agreeDraw(ctx.state);
      fx.push({ kind: 'deselect' }, { kind: 'save' });
      return { ctx: turnStart({ ...ctx, state }, fx), effects: fx };
    }
    case 'tap':
    case 'drop': {
      if (ctx.lock > 0 || !humanToAct(ctx) || (ctx.phase !== 'idle' && ctx.phase !== 'selected')) {
        fx.push({ kind: 'deadTap', animating: ctx.phase === 'animating' });
        return { ctx: { ...ctx, deadTaps: ctx.deadTaps + 1 }, effects: fx };
      }
      const s = ctx.state;
      if (ev.type === 'drop') {
        if (s.pside[ev.pid] !== actingColour(s)) return { ctx, effects: fx };
        if (ev.at === s.ppos[ev.pid]) return { ctx, effects: fx };
        return { ctx: tryMove(ctx, ev.pid, ev.at, true, fx), effects: fx };
      }
      const at = ev.at;
      const occ = s.board[at];
      // 翻翻棋: tapping a face-down piece flips it
      if (s.mode === 'fan' && occ >= 0 && !s.pup[occ]) {
        const flip = legalMoves(s).find((a) => isFlip(a) && a.flip === at);
        if (flip) return { ctx: commitOrAsk(ctx, flip, fx), effects: fx };
      }
      const colour = actingColour(s);
      if (occ >= 0 && s.pside[occ] === colour) {
        if (ctx.selected === occ) {
          fx.push({ kind: 'deselect' });
          return { ctx: { ...ctx, phase: 'idle', selected: -1 }, effects: fx };
        }
        const im = whyImmobile(s, occ);
        if (im) {
          fx.push({ kind: 'deny', pid: occ, at, why: im, drop: false });
          return { ctx, effects: fx };
        }
        const moves = pieceMoves(s, occ);
        fx.push({ kind: 'select', pid: occ, moves });
        return { ctx: { ...ctx, phase: 'selected', selected: occ }, effects: fx };
      }
      if (ctx.selected >= 0) return { ctx: tryMove(ctx, ctx.selected, at, false, fx), effects: fx };
      if (occ >= 0) fx.push({ kind: 'info', pid: occ });
      return { ctx, effects: fx };
    }
  }
  return { ctx, effects: fx };
}
