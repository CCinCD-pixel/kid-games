/**
 * Main-thread side of the scorer: a Scorer that forwards to the Web Worker and falls back to running the same code
 * inline when Workers are unavailable (never required for the app to work, just slower to respond).
 */
import type { Contour } from './contour';
import { buildContour } from './contour';
import { trackPitch } from './pitch';
import { resampleTo16k } from './resample';
import { registerScorer, registeredScorers, scoreWithRegistry, unsureResult } from './scorer';
import { ToneShapeScorer } from './tone-shape';
import type { ScoreInput, ScoreResult, Scorer } from './types';

type Pending = { resolve: (value: any) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> };
export class LocalScorer implements Scorer {
  readonly id = 'local';
  private worker: Worker | null = null;
  private failed = false;
  private serial = 0;
  private pending = new Map<number, Pending>();
  constructor(private timeoutMs = 8000) {}
  private start(): Worker | null {
    if (this.worker || this.failed) return this.worker;
    try {
      const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (event: MessageEvent) => {
        const { id, ok, error, ...rest } = event.data;
        const waiting = this.pending.get(id);
        if (!waiting) return;
        this.pending.delete(id);
        clearTimeout(waiting.timer);
        if (ok) waiting.resolve(rest);
        else waiting.reject(new Error(error));
      };
      worker.onerror = () => this.fail('worker_error');
      this.worker = worker;
    } catch {
      this.failed = true;
    }
    return this.worker;
  }
  private fail(reason: string) {
    this.failed = true;
    this.worker?.terminate();
    this.worker = null;
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(new Error(reason));
    }
    this.pending.clear();
  }
  private ask<T>(message: Record<string, unknown>, transfer: Transferable[] = []): Promise<T> {
    const worker = this.start();
    if (!worker) return Promise.reject(new Error('no_worker'));
    const id = ++this.serial;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('timeout'));
      }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      worker.postMessage({ id, ...message }, transfer);
    });
  }
  /** Copy first: the caller keeps its PCM (it is also the recording the child can replay). */
  async score(input: ScoreInput): Promise<ScoreResult> {
    try {
      const copy = input.pcm.slice();
      const { result } = await this.ask<{ result: ScoreResult }>({ op: 'score', input: { ...input, pcm: copy } }, [copy.buffer]);
      return result;
    } catch (error) {
      if ((error as Error).message === 'timeout') return unsureResult('scorer_error', ['tone-shape']);
      return this.inline(input);
    }
  }
  private async inline(input: ScoreInput): Promise<ScoreResult> {
    if (!registeredScorers().includes('tone-shape')) registerScorer(new ToneShapeScorer());
    return scoreWithRegistry(input);
  }
  async contour(pcm: Float32Array, sampleRate: number): Promise<Contour | null> {
    try {
      const copy = pcm.slice();
      const { contour } = await this.ask<{ contour: Contour | null }>({ op: 'contour', pcm: copy, sampleRate }, [copy.buffer]);
      return contour;
    } catch {
      return buildContour(trackPitch(resampleTo16k(pcm, sampleRate), 16000));
    }
  }
  dispose() {
    this.fail('disposed');
    this.failed = false;
  }
}
