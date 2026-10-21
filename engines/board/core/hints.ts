// core/hints.ts — 提示阶梯 H0–H3（xiangqi.md §5.1，棋手学院同口径）。提示永远不卡进度；用过 H2/H3 的题不计"首次做对率"。
//  H0：≥30 秒无触摸（计算 / 拖动中不计）→ 灯泡呼吸；H1 方向；H2 部分示范；H3 完整示范（幽灵手 + 孪生）。
//  走错：连续 2 / 3 / 4 次自动触发 H1 / H2 / H3；灯泡每点一次手动升一级。
import type { HintLadder } from './types';

export type HintTier = 0 | 1 | 2 | 3;
export interface HintLadderImpl extends HintLadder {
  /** 点灯泡：该步骤手动升一级（≤3），返回新档位 */
  bulb(stepId: string): HintTier;
  /** 该步骤目前用到的最高档位（自动 + 手动） */
  tierOf(stepId: string, failures?: number): HintTier;
  /** 用过 H2/H3 → 不计首次做对 */
  spoiled(stepId: string): boolean;
  reset(stepId?: string): void;
}
export const AUTO_TIER_AT = [Infinity, 2, 3, 4] as const;   // 连续失败次数 → 档位
export const autoTier = (failures: number): HintTier => (failures >= 4 ? 3 : failures >= 3 ? 2 : failures >= 2 ? 1 : 0);

export function createHintLadder(): HintLadderImpl {
  const manual = new Map<string, HintTier>(); const used = new Map<string, HintTier>();
  const bump = (id: string, t: HintTier) => { if ((used.get(id) ?? 0) < t) used.set(id, t); };
  const self: HintLadderImpl = {
    next({ stepId, failures }) {
      const t = Math.max(autoTier(failures), manual.get(stepId) ?? 0) as HintTier; bump(stepId, t); return { tier: t };
    },
    bulb(stepId) { const t = Math.min(3, (manual.get(stepId) ?? 0) + 1) as HintTier; manual.set(stepId, t); bump(stepId, t); return t; },
    tierOf(stepId, failures = 0) { return Math.max(used.get(stepId) ?? 0, autoTier(failures), manual.get(stepId) ?? 0) as HintTier; },
    spoiled(stepId) { return (used.get(stepId) ?? 0) >= 2; },
    reset(stepId) { if (stepId) { manual.delete(stepId); used.delete(stepId); } else { manual.clear(); used.clear(); } },
  };
  return self;
}

/** H0 闲置计时：isBusy()（计算 / 拖动 / 动画）期间不计；任何触摸 touch() 重置。纯计时，可注入 setTimeout 供单测。 */
export interface IdleTimer { touch(): void; stop(): void; readonly fired: boolean }
export function createIdleTimer(o: { ms?: number; onIdle(): void; isBusy?(): boolean; setTimer?: (f: () => void, ms: number) => unknown; clearTimer?: (h: unknown) => void }): IdleTimer {
  const ms = o.ms ?? 30000; const set = o.setTimer ?? ((f, t) => setTimeout(f, t)); const clr = o.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  let h: unknown = null; let fired = false; let stopped = false;
  const arm = (): void => {
    if (stopped) return; if (h !== null) clr(h);
    h = set(() => { h = null; if (o.isBusy?.()) { arm(); return; } fired = true; o.onIdle(); }, ms);
  };
  arm();
  return { touch() { fired = false; arm(); }, stop() { stopped = true; if (h !== null) clr(h); h = null; }, get fired() { return fired; } };
}
