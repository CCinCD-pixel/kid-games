import type { GameRules } from '../../core/types';
import type { ConformanceFixtures } from '../conformance';
/** 国际象棋原型适配器（仅测试用参考夹具；真正的规则在 games/chess/）。 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function chessRules(): GameRules<any, any>;
export const chessFixtures: ConformanceFixtures;
