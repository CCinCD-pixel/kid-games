/** worker_threads entry: simulate the levels the parent sends (one id per message, null = exit). */
import { parentPort, workerData } from 'node:worker_threads';
import { LEVELS } from '../../../site/emoji-match/src/content';
import { simulateLevel, type SimOptions } from './simulate';

const opts = (workerData ?? {}) as SimOptions;
const byId = new Map(LEVELS.map((d) => [d.id, d]));
parentPort!.on('message', (id: string | null) => {
  if (id == null) { process.exit(0); }
  const def = byId.get(id);
  if (!def) { parentPort!.postMessage({ id, error: 'unknown level' }); return; }
  parentPort!.postMessage(simulateLevel(def, opts)); // structured clone keeps Infinity (= never won)
});
