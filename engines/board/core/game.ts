// core/game.ts — 通用对局：历史、撤销、重复/长将窗口、限着、吃子列表。参考实现 = board-contract/src/game.mjs（1:1 移植，加类型）。
// 不变量：keys.length === moves.length + 1 且末项 = hash(state())；状态栈保存不可变状态（不做 clone）。
import { hashEq } from './types';
import type { Game, GameOptions, GameRules, HashKey, Outcome, Piece, PlyFlags, RepWindow, Side } from './types';

/** Game 的实现类型：在契约之上多暴露 window(n)（长将窗口，测试与诊断用） */
export interface GameImpl<M, S> extends Game<M, S> { window(n: number): RepWindow | null }

export function createGame<M, S>(rules: GameRules<M, S>, startFen?: string, _opts: GameOptions = {}): GameImpl<M, S> {
  const s0 = startFen ? rules.fromFen(startFen) : rules.initial();
  const states: S[] = [s0];
  const moves: M[] = [];
  const keys: HashKey[] = [rules.hash(s0)];
  const flags: PlyFlags[] = [];
  const noProg: number[] = [rules.clock ? rules.clock(s0) : 0];
  const capLog: (Piece | null)[] = [];
  const startF = startFen || rules.toFen(s0);
  const top = (): S => states[states.length - 1];

  const g: GameImpl<M, S> = {
    rules, startFen: startF, moves, keys, flags,
    state: top,
    turn: () => rules.turn(top()),
    ply: () => moves.length,
    noProgress: () => noProg[noProg.length - 1],
    fen: () => rules.toFen(top()),
    legalMoves: () => rules.legalMoves(top()),
    play(m: M): void {
      const s = top();
      const info = rules.moveInfo(s, m);
      const ns = rules.apply(s, m);
      const ck = rules.check(ns);
      states.push(ns); moves.push(m); keys.push(rules.hash(ns));
      flags.push({ check: ck !== null, capture: !!info.capture, capValue: info.capture ? rules.value(s, info.capture.sq) : 0 });
      noProg.push(info.resetsClock ? 0 : noProg[noProg.length - 1] + 1);
      capLog.push(info.capture ? info.capture.piece : null);
    },
    undo(): M | null {
      if (!moves.length) return null;
      states.pop(); keys.pop(); flags.pop(); noProg.pop(); capLog.pop();
      return moves.pop() as M;
    },
    encoded(): string[] { return moves.map((m) => rules.encode(m)); },
    repCount(): number {
      const k = keys[keys.length - 1];
      let n = 0;
      for (const x of keys) if (hashEq(x, k)) n++;
      return n;
    },
    /** 当前局面最近 n 次出现在 keys 里的下标（升序）；不足 n 次 → null */
    occurrences(n: number): number[] | null {
      const k = keys[keys.length - 1];
      const idx: number[] = [];
      for (let i = keys.length - 1; i >= 0 && idx.length < n; i--) if (hashEq(keys[i], k)) idx.unshift(i);
      return idx.length === n ? idx : null;
    },
    window(n: number): RepWindow | null {
      const occ = g.occurrences(n);
      if (!occ) return null;
      const start = occ[0];
      const first = g.turn();
      const plies: { side: Side; check: boolean; capture: boolean }[] = [];
      for (let i = start; i < keys.length - 1; i++) plies.push({ side: ((i - start) % 2 === 0 ? first : 1 - first) as Side, check: flags[i].check, capture: flags[i].capture });
      return { mover: first, plies };
    },
    /** 顺序：rules.status(局面) → 重复(第 repeatN 次) → 限着；局面终局优先 = 第 100 个半回合恰好将死 → 将死 */
    status(): Outcome {
      const t = rules.status(top());
      if (t.over) return t;
      if (g.repCount() >= rules.meta.repeatN) {
        const w = g.window(rules.meta.repeatN);
        const v = w && rules.repetitionVerdict ? rules.repetitionVerdict(w) : null;
        return v || { over: true, winner: null, reason: 'repetition' };
      }
      if (rules.meta.clockPlies !== null && g.noProgress() >= rules.meta.clockPlies) return { over: true, winner: null, reason: rules.meta.clockReason };
      return { over: false };
    },
    /** 再循环一次就会被判长将的预警：当前局面已是第 2 次出现，且按窗口₂ 判走子方负 */
    warn(): { warn: boolean; side?: Side } {
      if (!rules.repetitionVerdict || g.repCount() < 2) return { warn: false };
      const w = g.window(2);
      const v = w && rules.repetitionVerdict(w);
      return v && v.over && v.winner !== null && 1 - v.winner === g.turn() ? { warn: true, side: g.turn() } : { warn: false };
    },
    /** 走 m 之后 status() 是对走子方的判负（长将）；机器人根过滤与孩子提交前提醒共用 */
    wouldEndBadly(m: M): boolean {
      const me = g.turn();
      g.play(m);
      const st = g.status();
      g.undo();
      return st.over && st.winner === 1 - me;
    },
    captured(side: Side): readonly Piece[] { return capLog.filter((p): p is Piece => !!p && p.side === side); },
    materialDiff(side: Side): number {
      let d = 0;
      for (let i = 0; i < flags.length; i++) {
        const p = capLog[i];
        if (!p) continue;
        d += p.side === side ? -flags[i].capValue : flags[i].capValue;
      }
      return d;
    },
  };
  return g;
}

/** 逐着 decode 重放；遇非法着法截断并置 truncated（存档恢复用） */
export function replayMoves<M, S>(rules: GameRules<M, S>, startFen: string, texts: readonly string[], opts?: GameOptions): { game: GameImpl<M, S>; applied: number; truncated: boolean } {
  const game = createGame(rules, startFen || undefined, opts);
  let applied = 0;
  for (const t of texts) {
    const m = rules.decode(game.state(), t);
    if (m === null) break;
    game.play(m);
    applied++;
  }
  return { game, applied, truncated: applied < texts.length };
}

/** 长度 / 局势小工具：局面是否已终局（含重复与限着） */
export const isOver = (g: Game<unknown, unknown>): boolean => g.status().over;
