/// <reference lib="webworker" />
/**
 * Web Worker entry: all DSP runs here so pitch tracking never janks the main thread (iPad A13, 3 GB). Messages:
 *   {id, op:'score', input}   -> {id, ok:true, result: ScoreResult}
 *   {id, op:'contour', pcm, sampleRate} -> {id, ok:true, contour}   (model recordings, for the comparison card)
 *   {id, op:'ping'}           -> {id, ok:true}
 */
import { buildContour } from './contour';
import { trackPitch } from './pitch';
import { resampleTo16k } from './resample';
import { registerScorer, scoreWithRegistry } from './scorer';
import { ToneShapeScorer } from './tone-shape';
import type { ScoreInput } from './types';

registerScorer(new ToneShapeScorer());

type Request =
  | { id: number; op: 'score'; input: ScoreInput }
  | { id: number; op: 'contour'; pcm: Float32Array; sampleRate: number }
  | { id: number; op: 'ping' };
const scope = self as unknown as {
  postMessage(message: unknown): void;
  onmessage: ((event: MessageEvent<Request>) => void) | null;
};
scope.onmessage = async (event) => {
  const request = event.data;
  try {
    if (request.op === 'score') scope.postMessage({ id: request.id, ok: true, result: await scoreWithRegistry(request.input) });
    else if (request.op === 'contour') {
      const track = trackPitch(resampleTo16k(request.pcm, request.sampleRate), 16000);
      scope.postMessage({ id: request.id, ok: true, contour: buildContour(track) });
    } else scope.postMessage({ id: request.id, ok: true });
  } catch (error) {
    scope.postMessage({ id: request.id, ok: false, error: String(error) });
  }
};
