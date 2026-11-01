// input/snap.ts — 点选 4 级规则（纯函数，无 DOM；可蒙特卡洛测试）。取代旧"0.75 格内最近合法点优先"（手机上 16–39 % 把"想看原因/想改选"劫持成走子）：
//   ① 最近交点是己方子 → 改选（无论远近）；② 最近交点是合法点 → 走；③ 最近交点非法 → 报原因，仅当点击距该交点 ≥ guard 且 targetRadius 内恰有一个合法点才吸附；④ 其余取消（不报错）。
// 手机（c<44）另有"选子辅助"：selectRadius 内唯一可动己方子则选它（优先级低于吸附）。参数单位 = 格（c）。
import type { SnapConfig, Sq } from '../core/types';

export interface SnapTuning extends SnapConfig { readonly guard: number }
/** iPad（c≈81）：σ=0.10 格 → 目标命中 100 %，劫持 0 % */
export const SNAP_IPAD: SnapTuning = { selectRadius: 0, targetRadius: 0.5, guard: 0.35 };
/** 手机（c<44）：σ=0.31 格 → 命中 81–82 %，劫持 5–11 %；残余误差靠触点预览 + 悔棋兜底 */
export const SNAP_PHONE: SnapTuning = { selectRadius: 0.6, targetRadius: 0.6, guard: 0.5 };
export const PHONE_CELL_PX = 44;
export const tuningForCell = (cellPx: number): SnapTuning => (cellPx < PHONE_CELL_PX ? SNAP_PHONE : SNAP_IPAD);

export interface TapContext {
  /** 最近交点 / 所在格；null = 棋盘外 */
  nearest: Sq | null;
  /** 点击点到最近交点中心的距离（格） */
  dist: number;
  selected: Sq | null;
  legal: ReadonlySet<Sq>;
  /** nearest 上是走子方的子 */
  ownAtNearest: boolean;
  /** 合法目标格 + 点击点到其中心的距离（格），调用方只需给 ≤ max(targetRadius) 的 */
  near: readonly { sq: Sq; dist: number }[];
  /** 选子辅助：selectRadius 内的"可动己方子"（不含已选中的） */
  ownNear: readonly { sq: Sq; dist: number }[];
}
export type TapResult =
  | { kind: 'select'; sq: Sq } | { kind: 'toggle'; sq: Sq }
  | { kind: 'move'; sq: Sq; snapped: boolean } | { kind: 'illegal'; sq: Sq } | { kind: 'cancel' };

export function resolveTap(c: TapContext, t: SnapTuning): TapResult {
  if (c.nearest === null) return { kind: 'cancel' };
  if (c.ownAtNearest) return c.nearest === c.selected ? { kind: 'toggle', sq: c.nearest } : { kind: 'select', sq: c.nearest };       // ①
  if (c.selected !== null && c.legal.has(c.nearest)) return { kind: 'move', sq: c.nearest, snapped: false };                          // ②
  if (c.selected !== null && c.dist >= t.guard) {                                                                                      // ③ 吸附
    const cand = c.near.filter((x) => x.dist <= t.targetRadius);
    if (cand.length === 1) return { kind: 'move', sq: cand[0].sq, snapped: true };
  }
  if (t.selectRadius > 0) {                                                                                                            // 手机：选子辅助
    const o = c.ownNear.filter((x) => x.dist <= t.selectRadius);
    if (o.length === 1) return { kind: 'select', sq: o[0].sq };
  }
  if (c.selected !== null) return { kind: 'illegal', sq: c.nearest };                                                                  // ③ 报原因
  return { kind: 'cancel' };                                                                                                           // ④
}
