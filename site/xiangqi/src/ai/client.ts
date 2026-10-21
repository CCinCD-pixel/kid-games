// site/xiangqi/src/ai/client.ts — 主线程的 AI 宿主：真 Worker（失误模型 + 迭代加深）+ 主线程兜底（≤R3 强度）。
import { createAiHost, fromWorker, type AiHostImpl } from '@engines/board/ai/host';
import type { AiRequest } from '@engines/board/core/types';

let fb: Promise<{ handle(req: AiRequest): unknown }> | null = null;
const fallbackHandler = (): Promise<{ handle(req: AiRequest): unknown }> => (fb ??= Promise.all([import('@engines/board/ai/handler'), import('../rules/plugin')]).then(([h, p]) => h.createAiHandler(p.xqPlugin(), { fallback: true })));
let host: AiHostImpl | null = null;
/** 主线程搜一手（弱一点的兜底强度）；机器人请求失败后的恢复用。返回 encode 串或 null。 */
export async function fallbackMove(req: AiRequest): Promise<string | null> { const r = (await (await fallbackHandler()).handle(req)) as { move?: string | null }; return r?.move ?? null; }
export const isAutomated = (): boolean => typeof navigator !== 'undefined' && !!navigator.webdriver;
/** 单例；测试模式（webdriver）搜索只受节点预算约束（确定性） */
export function getAi(): AiHostImpl {
  if (host) return host;
  host = createAiHost({
    createWorker: () => fromWorker(new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })),
    timeoutMs: isAutomated() ? 30000 : 3000, retries: 1, warmup: true,
    fallback: async (req) => (await fallbackHandler()).handle(req),
  });
  return host;
}
export const searchBudget = (): { maxMs: number; maxDepth: number } => ({ maxMs: isAutomated() ? Infinity : 1800, maxDepth: 8 });
export function disposeAi(): void { host?.terminate(); host = null; }
