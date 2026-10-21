// site/xiangqi/src/rules/plugin.ts — 象棋 AiPlugin（Worker 与主线程兜底共用）：快速搜索适配器 + 失误模型 + 教练判定表。
import { createCoachPolicy } from '@engines/board/core/coach';
import { createErrorModel } from '@engines/board/core/errormodel';
import type { AiPluginExt } from '@engines/board/ai/protocol';
import type { ErrorModel } from '@engines/board/core/types';
import { createRules, xqSearchAdapter } from './rules';
import { moveStr, type Position } from './position';

/** 强机关人（有 `look.glanceGuard`：R5 浑天、R6 璇玑）的"瞥一眼"：规格 §4.3 的瞥一眼是 1 层、无静态搜索，会白送子；审计（tests/xiangqi/blunder.test.ts）显示 R6 约 4–8 % 的着法让子力差 ≥3 个兵、
 *  最坏白送一车，成年人 3 步策略能把「最强的机关人」打到 +16，像在送子。所以这两位的瞥一眼多一道"护栏"：照常 1 层挑，但候选先用 2 层 + 静态搜索（看对方一手回吃）过滤——比最佳着差超过 glanceGuard（厘兵）的着法剔掉。
 *  结果：仍会走得不够好、偶尔丢个兵，但不会把车 / 炮 / 马白送给一手回吃。R1–R4 没有这个字段，保持规格口径（会白送——孩子靠这个赢）。 */
export function xqErrorModel(): ErrorModel<number> {
  const base = createErrorModel<number>();
  return {
    choose(ctx, rng) {
      const guard = (ctx.level.look as { glanceGuard?: number } | undefined)?.glanceGuard; if (guard === undefined) return base.choose(ctx, rng);
      return base.choose({ ...ctx, search: (o) => {
        const r = ctx.search(o); if (!(o.depth === 1 && !o.qs) || r.root.length < 2) return r;
        const deep = ctx.search({ depth: 2, nodes: 40000, margin: 1_000_000, qs: true, ...(o.exclude ? { exclude: o.exclude } : {}) }); const sc = new Map(deep.root.map((x) => [x.m, x.score])); const top = Math.max(...deep.root.map((x) => x.score));
        const ok = r.root.filter((x) => sc.has(x.m) && (sc.get(x.m) as number) >= top - guard); return ok.length ? { best: ok[0].m, root: ok } : { best: deep.best, root: deep.root.filter((x) => x.score >= top - o.margin) };
      } }, rng);
    },
  };
}

export function xqPlugin(): AiPluginExt<number, Position> {
  const adapter = xqSearchAdapter();
  return {
    createRules: (cfg) => createRules((cfg ?? {}) as Parameters<typeof createRules>[0]),
    adapter, errorModel: xqErrorModel(), stalemateLoss: true,
    coach: createCoachPolicy<number>({ valueAt: adapter.valueAt, encode: moveStr, stalemate: true }),
    highlights: { detect: () => [] },
    hint: { depth: 3, nodes: 15000 },
  };
}
