// Worker 入口：象棋 AI（失误模型 + 迭代加深）、教练判定表、提示。只 import 引擎 core/ai 与规则插件（无 DOM、无 kit）。
import { registerAiWorker } from '@engines/board/ai/worker-entry';
import { xqPlugin } from '../rules/plugin';

registerAiWorker(self as unknown as Parameters<typeof registerAiWorker>[0], xqPlugin());
