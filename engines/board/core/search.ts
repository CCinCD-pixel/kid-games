// core/search.ts — 迭代加深 alpha-beta（置换表 2^18 · 杀手 · MVV-LVA · 静态搜索 ≤6 · 节点预算 · 根 exclude · 墙钟预算）。
// 与游戏无关：只依赖 SearchPos 契约。原型 = xiangqi-tools/search.mjs。所有随机性在 ErrorModel，不在这里。
import type { SearchAdapter, SearchPos } from './types';

export const MATE = 30000;
export const INF = 32000;
const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export interface SearchOptions<M> {
  depth?: number; nodes?: number; margin?: number; qs?: boolean;
  /** 根着法黑名单（如会让自己长将判负的着法）；全被排除时忽略 */
  exclude?: ReadonlySet<M> | null;
  /** 墙钟上限（毫秒）；Infinity / 缺省 = 只受节点预算约束（测试模式） */
  maxMs?: number;
}
export interface SearchResult<M> {
  /** 根无合法着法时为 undefined（root 为空） */
  best: M; score: number; depth: number; nodes: number; aborted: boolean;
  root: { m: M; score: number }[];
}

export class Searcher<M> {
  private readonly size: number;
  private readonly ttKey: Int32Array; private readonly ttChk: Int32Array; private readonly ttScore: Int16Array;
  private readonly ttDepth: Int8Array; private readonly ttFlag: Uint8Array; private readonly ttMove: Int32Array;
  private readonly killers: [number, number][] = [];
  nodes = 0; private limit = 0; aborted = false; private deadline = Infinity; private qsOn = true;
  private path: number[] = [];

  constructor(private readonly adapter: Pick<SearchAdapter<M, unknown>, 'mvvLva'>, ttBits = 18) {
    this.size = 1 << ttBits;
    this.ttKey = new Int32Array(this.size); this.ttChk = new Int32Array(this.size); this.ttScore = new Int16Array(this.size);
    this.ttDepth = new Int8Array(this.size).fill(-1); this.ttFlag = new Uint8Array(this.size); this.ttMove = new Int32Array(this.size);
  }
  /** 每个 move 请求开头必须调用：结果因此是 (局面, gameSeed, level) 的纯函数 */
  clearTT(): void { this.ttDepth.fill(-1); this.killers.length = 0; }

  private mkey(pos: SearchPos<M>, m: M): number { return (pos.from(m) << 10) | pos.to(m); }
  private order(pos: SearchPos<M>, moves: M[], ttm: number, ply: number): M[] {
    const k = this.killers[ply] || (this.killers[ply] = [0, 0]);
    const sc = moves.map((m) => { const mk = this.mkey(pos, m); return mk === ttm && ttm !== 0 ? 1e9 : this.adapter.mvvLva(pos, m) * 10 + (mk === k[0] ? 5 : mk === k[1] ? 3 : 0); });
    return moves.map((_, i) => i).sort((a, b) => sc[b] - sc[a] || a - b).map((i) => moves[i]);
  }

  /** 返回 { best, score, depth, nodes, root }：root = 分数在 best−margin 内的候选（ErrorModel 在其中 softmax） */
  search(pos: SearchPos<M>, o: SearchOptions<M> = {}): SearchResult<M> {
    const depth = o.depth ?? 3, margin = o.margin ?? 0;
    this.nodes = 0; this.limit = o.nodes ?? 20000; this.aborted = false; this.qsOn = o.qs ?? true; this.path = [pos.hashLo];
    this.deadline = o.maxMs !== undefined && Number.isFinite(o.maxMs) ? now() + o.maxMs : Infinity;
    let rootMoves = pos.legal();
    if (o.exclude && o.exclude.size) { const f = rootMoves.filter((m) => !o.exclude!.has(m)); if (f.length) rootMoves = f; }
    if (rootMoves.length === 0) return { best: undefined as unknown as M, score: -MATE, depth: 0, nodes: 0, aborted: false, root: [] };
    if (rootMoves.length === 1) return { best: rootMoves[0], score: 0, depth: 0, nodes: 0, aborted: false, root: [{ m: rootMoves[0], score: 0 }] };
    let ordered: { m: M; score: number }[] = rootMoves.map((m) => ({ m, score: 0 }));
    ordered.sort((x, y) => this.adapter.mvvLva(pos, y.m) - this.adapter.mvvLva(pos, x.m));
    let result: SearchResult<M> | null = null;
    for (let d = 1; d <= depth; d++) {
      let best = -INF; const scored: { m: M; score: number }[] = [];
      for (const o2 of ordered) {
        pos.make(o2.m); this.path.push(pos.hashLo);
        const sc = -this.ab(pos, d - 1, -INF, -(best - margin - 1), 1);
        this.path.pop(); pos.unmake();
        if (this.aborted) break;
        scored.push({ m: o2.m, score: sc }); if (sc > best) best = sc;
      }
      if (this.aborted) { if (!result) result = { best: ordered[0].m, score: 0, depth: 0, nodes: this.nodes, aborted: true, root: [{ m: ordered[0].m, score: 0 }] }; break; }
      scored.sort((x, y) => y.score - x.score);
      const top = scored[0].score;
      result = { best: scored[0].m, score: top, depth: d, nodes: this.nodes, aborted: false, root: scored.filter((x) => x.score >= top - margin) };
      ordered = scored.concat(ordered.filter((q) => !scored.some((s) => s.m === q.m)));   // 下一层先试好的
      if (Math.abs(top) > MATE - 100) break;                                              // 已看到杀棋
      if (this.nodes > this.limit * 0.6) break;                                           // 下一层大概率做不完
    }
    const r = result as SearchResult<M>; r.nodes = this.nodes; r.aborted = this.aborted; return r;
  }

  private stop(): boolean {
    if (++this.nodes > this.limit) { this.aborted = true; return true; }
    if ((this.nodes & 1023) === 0 && this.deadline !== Infinity && now() > this.deadline) { this.aborted = true; return true; }
    return false;
  }
  private ab(pos: SearchPos<M>, depth: number, alpha: number, beta: number, ply: number): number {
    if (this.stop()) return 0;
    const key = pos.hashLo;
    for (let i = this.path.length - 3; i >= 0; i -= 2) if (this.path[i] === key) return 0;   // 树内重复 → 和棋 0 分（被校准过的行为）
    if (depth <= 0) return this.qsOn ? this.quiesce(pos, alpha, beta, 0) : pos.evaluate();
    const idx = key & (this.size - 1); let ttm = 0;
    if (this.ttDepth[idx] >= 0 && this.ttKey[idx] === key && this.ttChk[idx] === pos.hashHi) {
      ttm = this.ttMove[idx];
      if (this.ttDepth[idx] >= depth) { const s = this.ttScore[idx], f = this.ttFlag[idx]; if (f === 0) return s; if (f === 1 && s >= beta) return s; if (f === 2 && s <= alpha) return s; }
    }
    const moves = pos.legal();
    if (moves.length === 0) return -MATE + ply;                                              // 将死与困毙（判负的规则）都按输处理
    const ordered = this.order(pos, moves, ttm, ply);
    const k = this.killers[ply] || (this.killers[ply] = [0, 0]);
    let best = -INF, bestKey = 0, flag = 2;
    for (const m of ordered) {
      pos.make(m); this.path.push(pos.hashLo);
      const s = -this.ab(pos, depth - 1, -beta, -alpha, ply + 1);
      this.path.pop(); pos.unmake(); if (this.aborted) return 0;
      if (s > best) {
        best = s; bestKey = this.mkey(pos, m);
        if (s > alpha) { alpha = s; flag = 0; if (s >= beta) { flag = 1; if (!pos.isCapture(m)) { if (k[0] !== bestKey) { k[1] = k[0]; k[0] = bestKey; } } break; } }
      }
    }
    this.ttKey[idx] = key; this.ttChk[idx] = pos.hashHi; this.ttScore[idx] = Math.max(-INF, Math.min(INF, best));
    this.ttDepth[idx] = Math.min(depth, 100); this.ttFlag[idx] = flag; this.ttMove[idx] = bestKey;
    return best;
  }
  private quiesce(pos: SearchPos<M>, alpha: number, beta: number, qd: number): number {
    if (this.stop()) return 0;
    const stand = pos.evaluate();
    if (stand >= beta) return stand;
    if (stand > alpha) alpha = stand;
    if (qd >= 6) return alpha;
    const caps = pos.legal(true).sort((x, y) => this.adapter.mvvLva(pos, y) - this.adapter.mvvLva(pos, x));
    for (const m of caps) {
      pos.make(m); const s = -this.quiesce(pos, -beta, -alpha, qd + 1); pos.unmake();
      if (this.aborted) return 0;
      if (s >= beta) return s;
      if (s > alpha) alpha = s;
    }
    return alpha;
  }
}
