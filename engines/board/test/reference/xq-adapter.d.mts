import type { GameRules } from '../../core/types';
import type { ConformanceFixtures } from '../conformance';
/** 象棋原型适配器（仅测试用参考夹具；真正的规则在 games/xiangqi/）。M = 整数着法，S = Position。 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function xqRules(cfg?: { stalemate?: 'loss' | 'draw'; perpetual?: 'loss' | 'draw'; limit?: number | null }): GameRules<any, any>;
export const xqFixtures: ConformanceFixtures;
