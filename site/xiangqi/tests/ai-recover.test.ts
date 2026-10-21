// 机器人请求失败的恢复阶梯：重试一次 → 主线程兜底 → 道歉并还回合；任何一步成功后计数清零；状态变了（悔棋 / 结束）就不再动。
import { describe, expect, it, vi } from 'vitest';
import { createAiRecovery, type RecoverDeps } from '../src/app/ai-recover';

const mk = (o: Partial<RecoverDeps> = {}): { d: RecoverDeps; log: string[] } => {
  const log: string[] = [];
  const d: RecoverDeps = { stalled: () => true, retry: () => log.push('retry'), fallbackMove: async () => { log.push('fb'); return 'h3e3'; }, playRobot: async (e) => { log.push(`play:${e}`); }, giveBack: async () => { log.push('giveBack'); return 'undo'; }, say: (k) => log.push(`say:${k}`), sleep: async () => undefined, ...o };
  return { d, log };
};
describe('createAiRecovery', () => {
  it('第一次失败：重试同一请求，不说话', async () => { const { d, log } = mk(); await createAiRecovery(d).onError(); expect(log).toEqual(['retry']); });
  it('第二次失败：主线程兜底走一手', async () => { const { d, log } = mk(); const r = createAiRecovery(d); await r.onError(); await r.onError(); expect(log).toEqual(['retry', 'say:slow', 'fb', 'play:h3e3']); });
  it('兜底也失败：道歉并把回合还给孩子（可存档）', async () => { const { d, log } = mk({ fallbackMove: async () => { throw new Error('x'); } }); const r = createAiRecovery(d); await r.onError(); await r.onError(); expect(log).toEqual(['retry', 'say:slow', 'say:sorry', 'giveBack']); });
  it('兜底没给出着法（null）同样还回合', async () => { const { d, log } = mk({ fallbackMove: async () => null }); const r = createAiRecovery(d); await r.onError(); await r.onError(); expect(log.slice(-2)).toEqual(['say:sorry', 'giveBack']); });
  it('机器人走成一步后计数清零：再失败又从"重试"开始', async () => { const { d, log } = mk(); const r = createAiRecovery(d); await r.onError(); r.onRobotMove(); await r.onError(); expect(log).toEqual(['retry', 'retry']); expect(r.failures).toBe(1); });
  it('状态已变（孩子悔棋 / 对局结束）→ 不重试也不兜底', async () => { const { d, log } = mk({ stalled: () => false }); const r = createAiRecovery(d); await r.onError(); await r.onError(); expect(log).toEqual([]); });
  it('并发的两次 onError 只处理一次', async () => { const slow = vi.fn(async () => new Promise<void>((res) => setTimeout(res, 10))); const { d, log } = mk({ sleep: slow }); const r = createAiRecovery(d); await Promise.all([r.onError(), r.onError()]); expect(log).toEqual(['retry']); });
});
