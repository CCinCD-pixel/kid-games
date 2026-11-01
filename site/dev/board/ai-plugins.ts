// site/dev/board/ai-plugins.ts — 游乐场的 AI 插件（参考适配器 + 通用搜索骨架）：演示 createAiHost + 真 Worker。真正的机器人在 games/<id>/ai-plugin.ts。
import { createCoachPolicy } from '@engines/board/core/coach';
import { createErrorModel } from '@engines/board/core/errormodel';
import { stateSearchAdapter } from '@engines/board/core/stateadapter';
import type { AiPluginExt } from '@engines/board/ai/protocol';
import { chessRules } from '@engines/board/test/reference/chess-adapter.mjs';
import { xqRules } from '@engines/board/test/reference/xq-adapter.mjs';

function plugin(make: () => ReturnType<typeof xqRules>, stalemateLoss: boolean): AiPluginExt<unknown, unknown> {
  const rules = make(); const adapter = stateSearchAdapter(rules);
  return { createRules: () => make(), adapter, errorModel: createErrorModel(), stalemateLoss, coach: createCoachPolicy({ valueAt: adapter.valueAt, encode: (m: unknown) => rules.encode(m), stalemate: stalemateLoss }), highlights: { detect: () => [] } } as AiPluginExt<unknown, unknown>;
}
export const xqPlugin = (): AiPluginExt<unknown, unknown> => plugin(() => xqRules(), true);
export const chessPlugin = (): AiPluginExt<unknown, unknown> => plugin(() => chessRules(), false);
