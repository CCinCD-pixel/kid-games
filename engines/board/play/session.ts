// play/session.ts — 对局会话：Game + BoardView + InputController + AiHost 的胶水。
// 一手棋的流程：输入提交 → Game.play → 动画 → 将军 / 终局呈现 → 轮到机器人则请求 AI（持 'ai' 锁）→ 同样的流程。
// 悔棋 / 重开 / 认输 / 翻转先 bump AI（epoch 取消）再 finishAnimations。游戏只写 HUD、音效、课程与存档，不再手写这套循环。
import { createGame, replayMoves, type GameImpl } from '../core/game';
import type { AiHost, Disposable, GameRules, InputHooks, Outcome, RobotLevel, SearchBudget, Side, Sq } from '../core/types';
import type { AiMoveResult } from '../ai/protocol';
import { isCancelled } from '../ai/host';
import { createInputController, type InputControllerImpl, type InputOptions } from '../input/input-controller';
import type { BoardViewImpl } from '../view/board-view';
import { acceptsInput, nextPhase, type Phase, type PhaseEvent } from './states';

export interface RobotConfig {
  level: RobotLevel; gameSeed: number; budget?: SearchBudget; cfg?: unknown;
  /** 落子前的停顿（毫秒；让对手走得像人；reducedMotion 时缩短） */
  thinkMs?: number;
  /** 额外要排除的着法（encode 串） */
  exclude?(game: GameImpl<unknown, unknown>): readonly string[];
}
export interface SessionOptions<M, S> {
  rules: GameRules<M, S>; view: BoardViewImpl<M, S>;
  game?: GameImpl<M, S>; startFen?: string;
  seat: 'single' | 'f2f'; kidSide?: Side;
  ai?: AiHost; robot?: RobotConfig | null;
  promotion?: InputHooks<M, S>['promotion']; input?: InputOptions;
  /** 画将军 / 将军子 / 见面线与印章（缺省开） */
  marks?: boolean; stamps?: boolean;
}
export interface MoveEvent<M> { m: M; encoded: string; by: Side; check: boolean; capture: boolean; ply: number; robot: boolean }
export interface SessionEvents<M> {
  move: MoveEvent<M>; end: { outcome: Outcome }; phase: { phase: Phase }; illegal: { reason: string | null; from: Sq; to: Sq };
  select: { sq: Sq | null; legal: Sq[] }; undo: { m: M }; restart: Record<string, never>; resign: { side: Side }; aiThinking: { on: boolean }; aiError: { error: unknown };
}
export type SessionState = 'idle' | 'selected' | 'dragging' | 'animating' | 'aiThinking' | 'ended';
export interface Session<M, S> {
  readonly game: GameImpl<M, S>; readonly view: BoardViewImpl<M, S>; readonly input: InputControllerImpl<M, S>;
  readonly phase: Phase; readonly state: SessionState; readonly kidSide: Side; readonly robot: RobotConfig | null;
  outcome(): Outcome;
  /** 程序化走一手（课 / 重放 / 测试）；返回动画结束 */
  play(m: M, o?: { robot?: boolean }): Promise<void>;
  undo(): Promise<boolean>; restart(fen?: string): void; resign(side: Side): void;
  setRobot(r: RobotConfig | null, kidSide?: Side): void;
  /** 轮到机器人则开始思考（重开 / 悔棋 / 设置变更后调用；内部已自动调用） */
  poke(): void;
  on<K extends keyof SessionEvents<M>>(ev: K, cb: (e: SessionEvents<M>[K]) => void): Disposable;
  destroy(): void;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const other = (s: Side): Side => (s === 0 ? 1 : 0);

export function createSession<M, S>(o: SessionOptions<M, S>): Session<M, S> {
  const { rules, view } = o; const kt = rules.meta.kingType;
  let game: GameImpl<M, S> = o.game ?? createGame(rules, o.startFen); let phase: Phase = 'play'; let override: Outcome | null = null; let kidSide: Side = o.kidSide ?? 0; let robot: RobotConfig | null = o.robot ?? null;
  let epoch = 0; let destroyed = false; let aiRelease: (() => void) | null = null; let checkMarks: Disposable[] = []; let lasts: [Sq, Sq][] = [];
  const subs = new Map<string, Set<(e: never) => void>>();
  const emit = <K extends keyof SessionEvents<M>>(ev: K, e: SessionEvents<M>[K]): void => { for (const cb of [...(subs.get(ev) ?? [])]) { try { (cb as (x: SessionEvents<M>[K]) => void)(e); } catch (err) { console.warn('[session] listener', err); } } };
  const setPhase = (e: PhaseEvent): void => { const n = nextPhase(phase, e); if (n !== phase) { phase = n; emit('phase', { phase }); } };
  const outcome = (): Outcome => override ?? game.status();
  const robotSide = (): Side | null => (o.seat === 'f2f' || !robot ? null : other(kidSide));
  const isRobotTurn = (): boolean => robotSide() === game.turn() && !outcome().over;
  const buildLasts = (): void => { lasts = []; const tmp = createGame(rules, game.startFen); for (const m of game.moves) { const i = rules.moveInfo(tmp.state(), m); lasts.push([i.from, i.to]); tmp.play(m); } };
  buildLasts();

  function refreshCheck(): void {
    for (const m of checkMarks) m.dispose(); checkMarks = []; if (o.marks === false) return; const s = game.state(); const chk = rules.check(s); if (!chk) return;
    checkMarks.push(view.mark('check', [chk.king], { id: 'bk-check', pulse: true })); if (chk.by.length) checkMarks.push(view.mark('checker', [...chk.by], { id: 'bk-checker' }));
    const kingBy = chk.by.find((b) => { const p = rules.pieceAt(s, b); return !!p && p.type === kt; }); if (kingBy !== undefined) checkMarks.push(view.mark('sight', [chk.king, kingBy], { id: 'bk-sight' }));
  }
  function kingSq(side: Side): Sq | null { if (kt === null) return null; const s = game.state(); for (let q = 0; q < rules.geometry.squares; q++) { const p = rules.pieceAt(s, q); if (p && p.type === kt && p.side === side) return q; } return null; }
  function present(): void {
    refreshCheck(); if (o.stamps === false) return; const out = outcome(); const chk = rules.check(game.state());
    if (out.over) { if (out.reason === 'checkmate' && chk) void view.stamp('mate', chk.king); else if (out.winner === null && !chk && out.reason.startsWith('stalemate')) { const k = kingSq(game.turn()); if (k !== null) void view.stamp('stalemate', k); } else if (out.winner !== null && !chk && out.reason.startsWith('stalemate')) { const k = kingSq(game.turn()); if (k !== null) void view.stamp('stalemate', k); } }
    else if (chk) void view.stamp('check', chk.king);
  }

  async function commitMove(m: M, byRobot: boolean): Promise<void> {
    if (destroyed || !(phase === 'play' || (phase === 'aiThinking' && byRobot))) return;
    setPhase({ t: 'commit' }); const before = game.state(); const by = game.turn(); const info = rules.moveInfo(before, m); game.play(m); lasts.push([info.from, info.to]);
    const done = view.animateMove(m, before); const chk = rules.check(game.state());
    emit('move', { m, encoded: rules.encode(m), by, check: !!chk, capture: !!info.capture, ply: game.ply(), robot: byRobot }); present(); await done;
    if (destroyed) return; const out = outcome(); setPhase({ t: 'animDone', over: out.over, robotTurn: isRobotTurn() });
    if (out.over) emit('end', { outcome: out }); else if (phase === 'aiThinking') startAi();
  }
  function startAi(): void {
    if (!robot || !o.ai || aiRelease) return; const my = ++epoch; const cfg = robot; const ai = o.ai; aiRelease = view.el ? lockAi() : null; emit('aiThinking', { on: true });
    void (async () => {
      try {
        await sleep(view.reduced ? Math.min(60, cfg.thinkMs ?? 300) : cfg.thinkMs ?? 300); if (my !== epoch || destroyed) return;
        const res = await ai.request<AiMoveResult>({ op: 'move', startFen: game.startFen, moves: game.encoded(), cfg: cfg.cfg, level: cfg.level, gameSeed: cfg.gameSeed, budget: cfg.budget ?? { maxMs: 1800, maxDepth: 6 }, exclude: cfg.exclude?.(game as GameImpl<unknown, unknown>) });
        if (my !== epoch || destroyed) return;
        if (res.resign) { resignInternal(kidSide, true); return; }
        const m = res.move ? rules.decode(game.state(), res.move) : null; if (m === null) return;
        await commitMove(m, true);
      } catch (e) { if (!isCancelled(e)) { console.warn('[session] AI 请求失败', e); emit('aiError', { error: e }); setPhase({ t: 'aiCancel' }); } }
      finally { if (my === epoch) { unlockAi(); emit('aiThinking', { on: false }); } }
    })();
  }
  let inputRef: InputControllerImpl<M, S> | null = null;
  const lockAi = (): (() => void) => inputRef!.lock('ai'); const unlockAi = (): void => { aiRelease?.(); aiRelease = null; };
  function cancelAi(): void { epoch++; o.ai?.bump(); unlockAi(); setPhase({ t: 'aiCancel' }); }
  function resignInternal(winner: Side, byRobot: boolean): void { override = { over: true, winner, reason: 'resign' }; if (!byRobot) cancelAi(); else unlockAi(); setPhase({ t: 'end' }); emit('resign', { side: other(winner) }); emit('end', { outcome: override }); }

  const input = createInputController(view, rules, {
    state: () => game.state(), seatToMove: () => game.turn(), canAct: (seat) => acceptsInput(phase) && !outcome().over && (o.seat === 'f2f' || !robot || seat === kidSide),
    commit: (m) => commitMove(m, false), onIllegal: (reason, from, to) => emit('illegal', { reason, from, to }), onSelect: (sq, legal) => emit('select', { sq, legal }), promotion: o.promotion,
  }, o.input); inputRef = input;
  view.setState(game.state()); refreshCheck(); if (lasts.length) view.setLastMove(lasts[lasts.length - 1][0], lasts[lasts.length - 1][1]);

  const session: Session<M, S> = {
    get game() { return game; }, view, input, get phase() { return phase; }, get kidSide() { return kidSide; }, get robot() { return robot; },
    get state(): SessionState { return phase === 'play' ? input.mode : phase; },
    outcome, play: (m, opt) => commitMove(m, !!opt?.robot),
    async undo() {
      if (destroyed || !game.moves.length || phase === 'animating') return false;
      cancelAi(); view.finishAnimations(); input.select(null); const release = input.lock('anim');
      try {
        let n = robotSide() !== null && game.turn() === kidSide ? 2 : 1; n = Math.min(n, game.moves.length); override = null;
        while (n-- > 0 && game.moves.length) { const after = game.state(); const m = game.undo() as M; lasts.pop(); await view.animateUndo(m, after, game.state()); emit('undo', { m }); }
        view.setState(game.state()); const l = lasts[lasts.length - 1]; if (l) view.setLastMove(l[0], l[1]); else view.setLastMove(null); refreshCheck(); setPhase({ t: 'reset' });
      } finally { release(); }
      session.poke(); return true;
    },
    restart(fen) {
      cancelAi(); view.finishAnimations(); input.select(null); override = null; game = createGame(rules, fen ?? game.startFen); lasts = []; view.setState(game.state()); view.setLastMove(null); refreshCheck(); setPhase({ t: 'reset' }); emit('restart', {} as Record<string, never>); session.poke();
    },
    resign(side) { if (destroyed || outcome().over) return; resignInternal(other(side), false); },
    setRobot(r, side) { cancelAi(); robot = r; if (side !== undefined) kidSide = side; session.poke(); },
    poke() { if (!destroyed && phase === 'play' && isRobotTurn() && o.ai && robot) { setPhase({ t: 'aiStart' }); startAi(); } },
    on(ev, cb) { let set = subs.get(ev); if (!set) subs.set(ev, (set = new Set())); set.add(cb as (e: never) => void); return { dispose: () => set!.delete(cb as (e: never) => void) }; },
    destroy() { destroyed = true; cancelAi(); for (const m of checkMarks) m.dispose(); checkMarks = []; input.destroy(); subs.clear(); },
  };
  session.poke();
  return session;
}
/** 由存档恢复：逐着 decode + 校验，遇非法着法截断 */
export function restoreGame<M, S>(rules: GameRules<M, S>, startFen: string, moves: readonly string[], cfg?: unknown): { game: GameImpl<M, S>; truncated: boolean } { const r = replayMoves(rules, startFen, moves, { cfg }); return { game: r.game, truncated: r.truncated }; }
