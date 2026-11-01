// ai/worker-entry.ts — Worker 内入口：registerAiWorker(self, plugin)。Worker 只能 import core/、games/*、ai/（禁止 barrel、DOM、kit）。
import type { AiEnvelope, AiPlugin, WorkerScopeLike } from '../core/types';
import { createAiHandler } from './handler';
import { isWarmup, type AiPluginExt, type AiReply } from './protocol';

export function registerAiWorker<M, S>(scope: WorkerScopeLike, plugin: AiPlugin<M, S>): void {
  const h = createAiHandler(plugin as AiPluginExt<M, S>);
  scope.onmessage = (e) => {
    const m = e.data;
    if (isWarmup(m)) { h.warmup(); return; }
    const env = m as AiEnvelope; let reply: AiReply;
    try { reply = { id: env.id, epoch: env.epoch, ok: true, result: h.handle(env) }; }
    catch (err) { reply = { id: env.id, epoch: env.epoch, ok: false, error: err instanceof Error ? err.message : String(err) }; }
    scope.postMessage(reply);
  };
}
