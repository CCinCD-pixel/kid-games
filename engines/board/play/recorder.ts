// play/recorder.ts — 对局记录（复盘 / 存档用）：只存着法与时间，不存局面；恢复 = 逐着 decode + 校验。
import { replayMoves } from '../core/game';
import type { Disposable, GameRules, Outcome, Side } from '../core/types';
import type { Session } from './session';

export interface GameRecord { v: 1; gameId: string; startFen: string; moves: string[]; times: number[]; startedAt: number; result?: { winner: Side | null; reason: string }; kidSide?: Side; level?: string; seed?: number; cfg?: unknown }
export interface Recorder { attach<M, S>(s: Session<M, S>): Disposable; reset(startFen: string): void; record(): GameRecord; setMeta(m: Partial<Pick<GameRecord, 'kidSide' | 'level' | 'seed' | 'cfg'>>): void }
export function createRecorder(gameId: string, startFen: string, meta: Partial<Pick<GameRecord, 'kidSide' | 'level' | 'seed' | 'cfg'>> = {}, now: () => number = Date.now): Recorder {
  let rec: GameRecord = { v: 1, gameId, startFen, moves: [], times: [], startedAt: now(), ...meta };
  return {
    attach(s) {
      const subs = [
        s.on('move', (e) => { rec.moves.push(e.encoded); rec.times.push(now() - rec.startedAt); }), s.on('undo', () => { rec.moves.pop(); rec.times.pop(); delete rec.result; }),
        s.on('end', (e) => { rec.result = { winner: (e.outcome as Extract<Outcome, { over: true }>).winner, reason: (e.outcome as Extract<Outcome, { over: true }>).reason }; }),
        s.on('restart', () => { rec = { ...rec, startFen: s.game.startFen, moves: [], times: [], startedAt: now(), result: undefined }; delete rec.result; }),
      ]; return { dispose: () => subs.forEach((d) => d.dispose()) };
    },
    reset(fen) { rec = { v: 1, gameId, startFen: fen, moves: [], times: [], startedAt: now(), ...meta }; },
    record: () => ({ ...rec, moves: [...rec.moves], times: [...rec.times] }),
    setMeta(m) { rec = { ...rec, ...m }; },
  };
}
export function isGameRecord(x: unknown): x is GameRecord {
  if (!x || typeof x !== 'object') return false; const r = x as Partial<GameRecord>;
  return r.v === 1 && typeof r.gameId === 'string' && typeof r.startFen === 'string' && Array.isArray(r.moves) && r.moves.every((m) => typeof m === 'string') && Array.isArray(r.times) && r.times.length === r.moves.length && r.times.every((t) => Number.isFinite(t));
}
/** 解析并校验：着法逐个 decode，遇非法着法截断（moves / times 同步截断） */
export function parseRecord<M, S>(rules: GameRules<M, S>, raw: unknown): { record: GameRecord; truncated: boolean } | null {
  if (!isGameRecord(raw)) return null; try { const r = replayMoves(rules, raw.startFen, raw.moves, { cfg: raw.cfg }); if (!r.truncated) return { record: raw, truncated: false }; return { record: { ...raw, moves: raw.moves.slice(0, r.applied), times: raw.times.slice(0, r.applied), result: undefined }, truncated: true }; } catch { return null; }
}
