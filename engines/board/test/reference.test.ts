// 两个参考适配器（象棋 / 国象原型，仅测试夹具）跑 16 项一致性——同时证明 conformance 套件本身能放行正确实现。
import { chessFixtures, chessRules } from './reference/chess-adapter.mjs';
import { xqFixtures, xqRules } from './reference/xq-adapter.mjs';
import { runConformance } from './run-conformance';

runConformance(xqRules(), xqFixtures, { title: 'xiangqi 参考适配器' });
runConformance(chessRules(), chessFixtures, { title: 'chess 参考适配器' });
