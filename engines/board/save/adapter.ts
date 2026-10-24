// save/adapter.ts — 存档适配器：包 kit createStore。引擎不放游戏进度字段，只放"形状校验 + 版本迁移的统一语义 + 对局存档"。
// migrate(old, fromVersion) 的语义 = 一次调用、直接返回当前形状（kit 在 env.v < version 时只调一次）；加载后再过游戏的 isValid，不合格 → defaults()。
import { createStore, type Store, type StoreOptions } from '@kit/progress';
import { replayMoves } from '../core/game';
import type { GameRules, Side } from '../core/types';

export interface BoardStoreDef<T> extends Omit<StoreOptions<T>, 'defaults'> { defaults(): T; /** 形状校验：不合格（旧 bug / 手改 / 半截数据）→ 回到 defaults() */ isValid(x: unknown): x is T }
export function createBoardStore<T>(gameId: string, def: BoardStoreDef<T>): Store<T> {
  const inner = createStore<T>(gameId, def);
  return {
    key: inner.key,
    load() { const v = inner.load(); if (def.isValid(v)) return v; console.warn(`[board-save] ${inner.key} 形状不合格，已回到默认值`); return def.defaults(); },
    save: (d) => inner.save(d), reset: () => inner.reset(), envelope: () => inner.envelope(), subscribe: (listener) => inner.subscribe(listener),
    update(fn) { const cur = this.load(); const r = fn(cur); const next = (r === undefined ? cur : r) as T; inner.save(next); return next; },
  };
}

/** 对局存档（只存着法，不存局面）：恢复时逐着 decode + 校验，遇非法着法截断 */
export interface SavedGame { v: 1; startFen: string; moves: string[]; kidSide?: Side; level?: string; seed?: number; cfg?: unknown; updatedAt?: number }
export function isSavedGame(x: unknown): x is SavedGame {
  if (!x || typeof x !== 'object') return false; const g = x as Partial<SavedGame>;
  return g.v === 1 && typeof g.startFen === 'string' && g.startFen.length > 0 && Array.isArray(g.moves) && g.moves.every((m) => typeof m === 'string') && (g.kidSide === undefined || g.kidSide === 0 || g.kidSide === 1) && (g.seed === undefined || Number.isFinite(g.seed));
}
export const toSavedGame = (game: { startFen: string; encoded(): string[] }, extra: Partial<Omit<SavedGame, 'v' | 'startFen' | 'moves'>> = {}): SavedGame => ({ v: 1, startFen: game.startFen, moves: game.encoded(), ...extra });
export function restoreSavedGame<M, S>(rules: GameRules<M, S>, saved: unknown): { game: ReturnType<typeof replayMoves<M, S>>['game']; applied: number; truncated: boolean } | null {
  if (!isSavedGame(saved)) return null; try { return replayMoves(rules, saved.startFen, saved.moves, { cfg: saved.cfg }); } catch { return null; }
}
