// ai/handler.ts — AI 请求处理（Worker 与主线程兜底共用）：重建 Game（startFen + moves + cfg）→ 按 op 分派。
// 确定性：seed = hash32(gameSeed, ply, fenHash)；每个 move 请求新建 Rng 并 clearTT()，结果是 (局面, gameSeed, level) 的纯函数。
// 本文件只 import core/，不 import DOM / kit。
import { replayMoves, type GameImpl } from '../core/game';
import { createRng, hash32, keyHash } from '../core/rng';
import { shouldResign } from '../core/errormodel';
import { mateIn1Moves } from '../core/see';
import { Searcher } from '../core/search';
import type { AiRequest, GameRules, RobotLevel, SearchPos } from '../core/types';
import type { AiHintResult, AiMoveResult, AiPluginExt } from './protocol';

export interface HandlerOptions {
  /** 主线程兜底：深度 ≤1、无静态搜索、节点 ≤800（≤R3 的强度） */
  fallback?: boolean;
}
export interface AiHandler { handle(req: AiRequest): unknown; warmup(): void }

export function createAiHandler<M, S>(plugin: AiPluginExt<M, S>, o: HandlerOptions = {}): AiHandler {
  const rulesCache = new Map<string, GameRules<M, S>>();
  const rulesFor = (cfg: unknown): GameRules<M, S> => { const k = JSON.stringify(cfg ?? null); let r = rulesCache.get(k); if (!r) { r = plugin.createRules(cfg); rulesCache.set(k, r); } return r; };
  const searcher = new Searcher<M>(plugin.adapter);
  const rebuild = (rules: GameRules<M, S>, startFen: string, moves: readonly string[], cfg: unknown): GameImpl<M, S> => {
    const { game, truncated } = replayMoves(rules, startFen, moves, { cfg }); if (truncated) throw new Error('bad-history'); return game;
  };
  const cap = (lv: RobotLevel): RobotLevel => (o.fallback ? { ...lv, depth: Math.min(lv.depth, 1), nodes: Math.min(lv.nodes, 800) } : lv);

  function move(req: Extract<AiRequest, { op: 'move' }>): AiMoveResult {
    const rules = rulesFor(req.cfg); const game = rebuild(rules, req.startFen, req.moves, req.cfg); const state = game.state(); const pos = plugin.adapter.create(state);
    const legal = pos.legal(); const ply = game.ply(); if (!legal.length) return { move: null, resign: false, ply };
    const rng = createRng(hash32(req.gameSeed, ply, keyHash(rules.hash(state)))); searcher.clearTT();
    // 根过滤：调用方给的 + 会让自己立刻被判负的（长将）；全被排除则不过滤
    const ex = new Set<string>(req.exclude ?? []); const exclude = new Set<M>();
    for (const m of legal) if (ex.has(rules.encode(m)) || game.wouldEndBadly(m)) exclude.add(m);
    if (exclude.size >= legal.length) exclude.clear();
    const level = cap(req.level); const maxMs = req.budget.maxMs;
    const chosen = plugin.errorModel.choose({
      pos, level, legal, exclude,
      search: (so) => searcher.search(pos, { ...so, qs: o.fallback ? false : so.qs, maxMs }),
      mateIn1: () => mateIn1Moves(pos, { stalemate: !!plugin.stalemateLoss }),
    }, rng);
    const resign = shouldResign(level, ply, game.materialDiff(game.turn()), pos.inCheck());
    return { move: rules.encode(chosen), resign, ply };
  }
  function hint(req: Extract<AiRequest, { op: 'hint' }>): AiHintResult {
    const rules = rulesFor(req.cfg); const game = rebuild(rules, req.startFen, req.moves, req.cfg); const pos = plugin.adapter.create(game.state()); const legal = pos.legal();
    if (!legal.length) return { move: null, from: -1, to: -1, score: 0, tier: req.tier };
    searcher.clearTT(); const exclude = new Set<M>(); for (const m of legal) if (game.wouldEndBadly(m)) exclude.add(m); if (exclude.size >= legal.length) exclude.clear();
    const h = plugin.hint ?? { depth: 3, nodes: 15000 }; const r = searcher.search(pos, { depth: o.fallback ? 1 : h.depth, nodes: o.fallback ? 800 : h.nodes, margin: 0, qs: !o.fallback, exclude });
    return { move: rules.encode(r.best), from: pos.from(r.best), to: pos.to(r.best), score: r.score, tier: req.tier };
  }
  function coach(req: Extract<AiRequest, { op: 'coach' }>): unknown {
    const rules = rulesFor(req.cfg); const game = rebuild(rules, req.startFen, req.moves, req.cfg); return plugin.coach.table(plugin.adapter.create(game.state()) as SearchPos<M>);
  }
  return {
    handle(req) {
      switch (req.op) {
        case 'move': return move(req);
        case 'hint': return hint(req);
        case 'coach': return coach(req);
        case 'highlights': { rulesFor(req.cfg); return plugin.highlights.detect(req.startFen, req.moves, req.kidSide, req.budgetMs); }
        case 'custom': { const f = plugin.ops?.[req.name]; if (!f) throw new Error(`unknown-op:${req.name}`); const rules = rulesFor((req.payload as { cfg?: unknown } | null)?.cfg); return f(req.payload, { rules, adapter: plugin.adapter }); }
      }
    },
    warmup() { try { const rules = rulesFor(undefined); const pos = plugin.adapter.create(rules.initial()); searcher.clearTT(); searcher.search(pos, { depth: 2, nodes: 600, margin: 0, qs: true }); } catch { /* 热身失败无所谓 */ } },
  };
}
