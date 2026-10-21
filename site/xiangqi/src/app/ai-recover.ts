// site/xiangqi/src/app/ai-recover.ts — 机器人请求失败后的恢复（"想想…" 永远不卡死）。
// 引擎 host 已经做了：Worker 报错重建有限次 → 主线程兜底；Worker 回 ok:false → 主线程兜底一次。能走到这里说明兜底也失败了（或超时耗尽）。
// 阶梯：① 同一请求再试一次 → ② 主线程兜底搜索（弱一点的着法）→ ③ 机器人给不出着法：道歉并把回合还给孩子（退掉孩子刚走的那步；开局就轮到机器人则替它走一步最安全的合法着），存档仍然有效。
export interface RecoverDeps {
  /** 现在是不是还停在"轮到机器人但没人在算"的状态（孩子悔棋 / 重开 / 已结束 / 页面已销毁 → false） */
  stalled(): boolean;
  retry(): void;
  /** 主线程搜一手（encode 串）；失败抛错 */
  fallbackMove(): Promise<string | null>;
  playRobot(enc: string): Promise<void>;
  /** 把回合还给孩子：返回 'undo'（退了孩子的上一步）| 'move'（替机器人走了一步合法着）| 'none' */
  giveBack(): Promise<'undo' | 'move' | 'none'>;
  say(kind: 'slow' | 'sorry'): void;
  sleep(ms: number): Promise<void>;
}
export interface AiRecovery { onError(): Promise<void>; onRobotMove(): void; readonly failures: number }
export function createAiRecovery(d: RecoverDeps): AiRecovery {
  let fails = 0; let busy = false;
  return {
    get failures() { return fails; },
    onRobotMove() { fails = 0; },
    async onError() {
      if (busy) return; busy = true;
      try {
        fails++; await d.sleep(250); if (!d.stalled()) return;
        if (fails === 1) { d.retry(); return; }                                                        // ① 再试一次（Worker 可能刚被重建）
        d.say('slow');
        try { const enc = await d.fallbackMove(); if (enc && d.stalled()) { await d.playRobot(enc); return; } } catch { /* ② 失败 → ③ */ }
        if (!d.stalled()) return; d.say('sorry'); await d.giveBack();
      } finally { busy = false; }
    },
  };
}
