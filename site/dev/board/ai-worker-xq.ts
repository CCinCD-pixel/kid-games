import { registerAiWorker } from '@engines/board/ai/worker-entry';
import { xqPlugin } from './ai-plugins';
registerAiWorker(self as unknown as Parameters<typeof registerAiWorker>[0], xqPlugin());
