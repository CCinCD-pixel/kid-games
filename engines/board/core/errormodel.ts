// core/errormodel.ts — 机器人失误模型（xiangqi-tools/bots.mjs robotMove 的通用移植）。
// 每步：① 只剩一步 → 走它；② mateSight 概率下有一步杀就走；③ pcap（R1 吃子胃口）；④ slip 概率"瞥一眼"（1 层、无静态搜索、容差 glanceMargin、softmax glanceTemp）；
//        ⑤ 否则认真搜（depth + 静态搜索，节点上限 nodes，在 margin 内 softmax temp）。随机数抽取顺序固定（校准过）：mateSight → [一步杀选择] → pcap → slip → softmax。
import type { ErrorModel, RobotLevel, Rng } from './types';

const pick = <T,>(r: Rng, xs: readonly T[]): T => xs[Math.floor(r.next() * xs.length)];
export function softmaxPick<M>(r: Rng, items: readonly { m: M; score: number }[], temp: number): M {
  if (items.length === 1 || temp <= 0) return items[0].m;
  const top = Math.max(...items.map((x) => x.score));
  const w = items.map((x) => Math.exp((x.score - top) / temp));
  const sum = w.reduce((a, b) => a + b, 0);
  let x = r.next() * sum;
  for (let i = 0; i < items.length; i++) { x -= w[i]; if (x <= 0) return items[i].m; }
  return items[items.length - 1].m;
}
/** 「轻松」档（赛前可选；公开、非隐藏降级）：slip +0.15、节点 ×0.7、一步杀视力 −0.2、R1 吃子胃口减半 */
export function easyOf(cfg: RobotLevel): RobotLevel {
  return { ...cfg, id: cfg.id + 'e', slip: Math.min(1, cfg.slip + 0.15), nodes: Math.round(cfg.nodes * 0.7), mateSight: Math.max(0, (cfg.mateSight || 0) - 0.2), ...(cfg.pcap !== undefined ? { pcap: cfg.pcap / 2 } : {}) };
}
/** 认输判据：cfg.resign 存在、总步数 ≥ afterPly、己方子力落后 ≥ behind 分（孩子口径）、且己方不在将军中。material = 己方 − 对方 */
export function shouldResign(cfg: RobotLevel, plies: number, material: number, inCheck: boolean): boolean {
  const r = cfg.resign;
  return !!r && plies >= r.afterPly && material <= -r.behind && !inCheck;
}

export function createErrorModel<M>(): ErrorModel<M> {
  return {
    choose(ctx, rng): M {
      const { pos, level: cfg, search, exclude } = ctx;
      let legal = ctx.legal;
      if (exclude.size) { const f = legal.filter((m) => !exclude.has(m)); if (f.length) legal = f; }
      if (legal.length === 1) return legal[0];
      if (cfg.mateSight > 0 && rng.next() < cfg.mateSight) { const mm = ctx.mateIn1().filter((m) => legal.includes(m)); if (mm.length) return pick(rng, mm); }
      if (cfg.pcap !== undefined) {
        const caps = legal.filter((m) => pos.isCapture(m));
        if (caps.length && rng.next() < cfg.pcap) return pick(rng, caps);
        const quiet = legal.filter((m) => !pos.isCapture(m));
        return pick(rng, quiet.length ? quiet : legal);
      }
      if (rng.next() < cfg.slip) { const r = search({ depth: 1, nodes: 2000, margin: cfg.glanceMargin ?? 400, qs: false, exclude }); return softmaxPick(rng, r.root, cfg.glanceTemp); }
      const r = search({ depth: cfg.depth, nodes: cfg.nodes, margin: cfg.margin, qs: true, exclude });
      return softmaxPick(rng, r.root, cfg.temp);
    },
  };
}
