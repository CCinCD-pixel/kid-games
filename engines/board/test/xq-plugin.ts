// test/xq-plugin.ts — 用参考适配器拼一个象棋 AiPlugin（慢但正确；校准冒烟、AI 宿主测试夹具）。真正的机器人在 games/xiangqi/ai-plugin.ts。
import { createCoachPolicy } from '../core/coach';
import { createErrorModel } from '../core/errormodel';
import { stateSearchAdapter } from '../core/stateadapter';
import type { AiPluginExt } from '../ai/protocol';
import { xqRules } from './reference/xq-adapter.mjs';

export function xqTestPlugin(): AiPluginExt<unknown, unknown> {
  const rules = xqRules(); const adapter = stateSearchAdapter(rules);
  return { createRules: () => xqRules(), adapter, errorModel: createErrorModel(), stalemateLoss: true, coach: createCoachPolicy({ valueAt: adapter.valueAt, encode: (m: unknown) => rules.encode(m), stalemate: true }), highlights: { detect: () => [] } } as AiPluginExt<unknown, unknown>;
}
