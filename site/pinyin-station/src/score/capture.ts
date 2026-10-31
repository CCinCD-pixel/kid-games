/**
 * Microphone capture for local scoring: 16 kHz mono Float32, energy-VAD endpointing, clipping / too-quiet / noisy-room
 * grading. Independent of the Tencent path (speech/mic.ts is untouched) but follows its guard patterns:
 *  - start() must be called inside a user gesture (iOS standalone PWA); permission has a 15 s deadline;
 *  - a serial number invalidates a permission result that arrives after cancel/dispose, and that late stream is stopped;
 *  - every exit path (finish, error, abort, dispose) stops all tracks, disconnects the graph and releases the
 *    kit's recording-session claim, exactly once;
 *  - a phone call, Siri, locking the screen, switching apps, unplugging the device: clean abort with a reason.
 * AudioWorklet is used when present; ScriptProcessor is the fallback for engines without it.
 */
import { claimRecordingSession, getAudioContext, getBus } from '@kit/audio';
import { wav } from '../speech/pcm';
import { StreamResampler, toInt16 } from './resample';
import { DEFAULT_VAD, Endpointer, RATE, type ClipAnalysis, type VadConfig } from './vad';
import workletUrl from './score-worklet.js?url&no-inline';

export type CaptureErrorCode = 'denied' | 'unavailable' | 'busy' | 'cancelled' | 'timeout' | 'interrupted' | 'device_ended';
export class CaptureError extends Error {
  constructor(readonly code: CaptureErrorCode) {
    super(code);
    this.name = 'CaptureError';
  }
}
export interface CaptureResult extends ClipAnalysis {
  sampleRate: 16000;
  source: 'worklet' | 'script-processor';
  wavBlob(): Blob;
}
export interface CaptureOptions {
  onLevel?: (level: number) => void;
  vad?: Partial<VadConfig>;
}

async function deadline<T>(task: Promise<T>, ms: number, code: CaptureErrorCode): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([task, new Promise<never>((_, reject) => (timer = setTimeout(() => reject(new CaptureError(code)), ms)))]);
  } finally {
    clearTimeout(timer);
  }
}
function classify(error: unknown): CaptureError {
  if (error instanceof CaptureError) return error;
  const name = (error as { name?: string })?.name ?? '';
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') return new CaptureError('denied');
  if (name === 'AbortError') return new CaptureError('cancelled');
  return new CaptureError('unavailable');
}
export function wavBlobOf(pcm: Float32Array): Blob {
  return new Blob([wav(toInt16(pcm))], { type: 'audio/wav' });
}

export class Capture {
  private active = false;
  private serial = 0;
  private disposed = false;
  private abortNow: ((error: CaptureError) => void) | null = null;
  private finishNow: (() => void) | null = null;
  /** Tracks of the stream currently held; empty when idle. Exposed for tests and diagnostics. */
  liveTracks(): MediaStreamTrack[] {
    return this.stream?.getTracks().filter((t) => t.readyState !== 'ended') ?? [];
  }
  private stream: MediaStream | null = null;

  get busy() {
    return this.active;
  }
  async start(options: CaptureOptions = {}): Promise<CaptureResult> {
    if (this.disposed) throw new CaptureError('cancelled');
    if (this.active) throw new CaptureError('busy');
    this.active = true;
    const serial = ++this.serial;
    const release = claimRecordingSession();
    let source: MediaStreamAudioSourceNode | null = null,
      node: AudioNode | null = null,
      sink: GainNode | null = null;
    let method: CaptureResult['source'] = 'worklet';
    const cleanups: (() => void)[] = [];
    const cancelled = new Promise<never>((_, reject) => {
      this.abortNow = (error) => reject(error);
    });
    cancelled.catch(() => {}); // an abort that arrives after we finished is not an unhandled rejection
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new CaptureError('unavailable');
      const pending = navigator.mediaDevices
        .getUserMedia({ audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
        .then((value) => {
          if (serial !== this.serial) {
            value.getTracks().forEach((t) => t.stop());
            throw new CaptureError('cancelled');
          }
          this.stream = value;
          return value;
        });
      pending.catch(() => {});
      const stream = await deadline(Promise.race([pending.catch((e) => Promise.reject(classify(e))), cancelled]), 15000, 'timeout');
      if (!stream.getTracks().length || !stream.getTracks().every((t) => t.readyState === 'live' || t.readyState === undefined)) throw new CaptureError('device_ended');
      const ctx = getAudioContext();
      if (!ctx) throw new CaptureError('unavailable');
      await deadline(Promise.race([ctx.resume(), cancelled]), 4000, 'timeout');
      if (serial !== this.serial) throw new CaptureError('cancelled');

      const resampler = new StreamResampler(ctx.sampleRate);
      const endpointer = new Endpointer({ ...DEFAULT_VAD, ...options.vad });
      let result: CaptureResult | null = null;
      let settle!: (r: CaptureResult) => void;
      const finished = new Promise<CaptureResult>((resolve) => (settle = resolve));
      const finish = () => {
        if (result) return;
        endpointer.stop();
        const analysis = endpointer.analysis();
        result = { ...analysis, sampleRate: 16000, source: method, wavBlob: () => wavBlobOf(analysis.pcm) };
        settle(result);
      };
      this.finishNow = finish;
      const onBlock = (block: Float32Array) => {
        if (result) return;
        const state = endpointer.push(resampler.push(block));
        options.onLevel?.(state.level);
        if (state.phase === 'done') finish();
      };

      source = ctx.createMediaStreamSource(stream);
      sink = ctx.createGain();
      sink.gain.value = 0;
      const bus = getBus('voice') ?? ctx.destination;
      let ready = false;
      if (ctx.audioWorklet && typeof AudioWorkletNode !== 'undefined') {
        try {
          await deadline(Promise.race([ctx.audioWorklet.addModule(workletUrl), cancelled]), 4000, 'timeout');
          if (serial !== this.serial) throw new CaptureError('cancelled');
          const worklet = new AudioWorkletNode(ctx, 'pinyin-score-capture');
          worklet.port.onmessage = (event) => onBlock(event.data as Float32Array);
          cleanups.push(() => (worklet.port.onmessage = null));
          node = worklet;
          ready = true;
        } catch (error) {
          if (error instanceof CaptureError && error.code !== 'timeout') throw error;
          if (serial !== this.serial) throw error;
          // Any other worklet failure: fall back to the main-thread processor below.
        }
      }
      if (!ready) {
        if (typeof ctx.createScriptProcessor !== 'function') throw new CaptureError('unavailable');
        method = 'script-processor';
        const processor = ctx.createScriptProcessor(2048, 1, 1);
        processor.onaudioprocess = (event) => {
          onBlock(event.inputBuffer.getChannelData(0).slice());
          event.outputBuffer.getChannelData(0).fill(0);
        };
        cleanups.push(() => (processor.onaudioprocess = null));
        node = processor;
      }
      source.connect(node!);
      node!.connect(sink);
      sink.connect(bus);

      // Interruptions: phone call / Siri / lock screen / app switch / unplugged microphone -> clean abort.
      const abort = (code: CaptureErrorCode) => () => this.abortNow?.(new CaptureError(code));
      const onState = () => {
        if ((ctx.state as string) === 'interrupted' || ctx.state === 'suspended' || ctx.state === 'closed') abort('interrupted')();
      };
      const onVisibility = () => document.visibilityState === 'hidden' && abort('interrupted')();
      ctx.addEventListener?.('statechange', onState);
      document.addEventListener('visibilitychange', onVisibility);
      const onHide = abort('interrupted');
      addEventListener('pagehide', onHide);
      for (const track of stream.getTracks()) {
        track.addEventListener?.('ended', abort('device_ended'));
        track.addEventListener?.('mute', abort('interrupted'));
      }
      cleanups.push(() => {
        ctx.removeEventListener?.('statechange', onState);
        document.removeEventListener('visibilitychange', onVisibility);
        removeEventListener('pagehide', onHide);
      });
      const safety = setTimeout(finish, (DEFAULT_VAD.noSpeechTimeoutSeconds + DEFAULT_VAD.maxSeconds + 1) * 1000);
      cleanups.push(() => clearTimeout(safety));
      return await Promise.race([finished, cancelled]);
    } catch (error) {
      throw classify(error);
    } finally {
      // Invalidate a late permission result (after timeout, cancel or dispose) and tear down in a fixed order.
      this.serial++;
      this.abortNow = null;
      this.finishNow = null;
      this.active = false;
      for (const cleanup of cleanups) cleanup();
      try {
        source?.disconnect();
        node?.disconnect();
        sink?.disconnect();
      } catch {
        /* Already disconnected. */
      }
      this.stream?.getTracks().forEach((t) => t.stop());
      this.stream = null;
      release();
    }
  }
  /** The child pressed "done": close with what was heard so far (or cancel if still waiting for permission). */
  stop() {
    if (this.finishNow) this.finishNow();
    else this.abortNow?.(new CaptureError('cancelled'));
  }
  /** Leaving the screen: abort anything in flight. Idempotent. A disposed Capture cannot start again. */
  dispose() {
    this.disposed = true;
    this.serial++;
    this.abortNow?.(new CaptureError('cancelled'));
  }
}

/** Recording rate the scorers expect. */
export const CAPTURE_RATE = RATE;
