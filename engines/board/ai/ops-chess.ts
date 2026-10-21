// ai/ops-chess.ts — 国际象棋的 custom ops 扩展点（棋手学院填：defender / endgameHint / battleSolve / battleMove / pawnwar / bench）。
// 约定：每个 op = (payload, { rules, adapter }) => 可结构化克隆的结果；在 games/chess/ai-plugin.ts 里并入 AiPlugin.ops。引擎本身不依赖它。
import type { AiPlugin } from '../core/types';

export type ChessOps = NonNullable<AiPlugin<unknown, unknown>['ops']>;
export const chessOps: ChessOps = {};
