// core/stateadapter.ts — 由任意 GameRules 派生 SearchAdapter（make = apply、unmake = 弹栈）：通用、正确、较慢（约为手写 make/unmake 的 1/10）。
// 用途：①一致性 / 搜索 / 教练 / SEE 的单测夹具；②游戏没有快速棋盘时的兜底（课、谜题唯一性复核、主线程 fallback）；③AiPlugin 的缺省 adapter。
// 游戏想要速度时自己实现 SearchAdapter（xiangqi：位置类 make/unmake）。
import type { GameRules, Piece, SearchAdapter, SearchPos, Side, Sq } from './types';
import type { ValueAt } from './see';

export interface StateSearchPos<M, S> extends SearchPos<M> { state(): S; readonly rules: GameRules<M, S> }
export interface StateAdapterOptions<M, S> {
  /** 走子方视角的静态评估（厘兵：1 子 = 100）。缺省：子力（rules.value ×100）差 */
  evaluate?(rules: GameRules<M, S>, s: S, side: Side): number;
}
const materialEval = <M, S>(rules: GameRules<M, S>, s: S, side: Side): number => {
  let sc = 0;
  for (let q = 0; q < rules.geometry.squares; q++) { const p = rules.pieceAt(s, q); if (p) sc += (p.side === side ? 1 : -1) * rules.value(s, q) * 100; }
  return sc;
};

export function stateSearchAdapter<M, S>(rules: GameRules<M, S>, opts: StateAdapterOptions<M, S> = {}): SearchAdapter<M, S> & { valueAt: ValueAt<M> } {
  const evalFn = opts.evaluate ?? materialEval;
  const valueAt: ValueAt<M> = (pos, sq) => { const p = pos as StateSearchPos<M, S>; return p.rules.value(p.state(), sq); };
  return {
    valueAt,
    create(s0: S): StateSearchPos<M, S> {
      const stack: S[] = [s0];
      const hashes: [number, number][] = [];
      const infos = new Map<M, ReturnType<GameRules<M, S>['moveInfo']>>();
      let legalCache: { s: S; moves: M[] } | null = null;
      const cacheStack: ({ s: S; moves: M[] } | null)[] = [];       // 回到父节点后着法对象的引用保持不变（根 exclude 按引用匹配）
      const top = (): S => stack[stack.length - 1];
      const hashOf = (): [number, number] => { const h = rules.hash(top()); return [h[0], h[1]]; };
      let hcur = hashOf();
      const info = (m: M) => { let i = infos.get(m); if (!i) { i = rules.moveInfo(top(), m); infos.set(m, i); } return i; };
      const pos: StateSearchPos<M, S> = {
        rules, state: top,
        get hashLo() { return hcur[0]; }, get hashHi() { return hcur[1]; },
        make(m) { const s = top(); infos.clear(); cacheStack.push(legalCache); stack.push(rules.apply(s, m)); hashes.push(hcur); hcur = hashOf(); legalCache = null; },
        unmake() { stack.pop(); hcur = hashes.pop() as [number, number]; infos.clear(); legalCache = cacheStack.pop() ?? null; },
        legal(capsOnly) {
          if (!legalCache || legalCache.s !== top()) legalCache = { s: top(), moves: rules.legalMoves(top()) };
          return capsOnly ? legalCache.moves.filter((m) => info(m).capture !== null) : legalCache.moves.slice();
        },
        inCheck: () => rules.check(top()) !== null,
        side: () => rules.turn(top()),
        pieceAt: (sq: Sq): Piece | null => rules.pieceAt(top(), sq),
        from: (m) => info(m).from, to: (m) => info(m).to, isCapture: (m) => info(m).capture !== null,
        capturedBy: (m) => { const c = info(m).capture; return c ? rules.value(top(), c.sq) : 0; },
        evaluate: () => evalFn(rules, top(), rules.turn(top())),
      };
      return pos;
    },
    mvvLva(pos, m) { const p = pos as StateSearchPos<M, S>; const i = p.rules.moveInfo(p.state(), m); return i.capture ? 10 * p.rules.value(p.state(), i.capture.sq) + 50 - Math.floor(p.rules.value(p.state(), i.from) / 20) : 0; },
  };
}
