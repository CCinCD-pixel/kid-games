import { describe, it, expect } from 'vitest';
import { Resampler, Vad, wav } from './pcm';
import { normalize } from './normalize';
describe('conservative pronunciation feedback', () => {
  it('does not fabricate tone accuracy when detection is invalid', () => {
    const raw = {
      Words: [
        {
          PhoneInfos: [{ ReferenceLetter: 'b', PronAccuracy: 95, MatchTag: 0 }],
          Tone: { Valid: false, RefTone: -1, HypothesisTone: -1 },
        },
      ],
    };
    const v = normalize(raw, 350);
    expect(v.status).toBe('unsure');
    expect(v.dims.tone).toBeUndefined();
    expect(v.dims.initial?.ok).toBe(true);
  });
  it('keeps missing/extra words and empty audio unjudged', () => {
    expect(normalize({ code: 0, result: {} }, 1).status).toBe('unsure');
    expect(
      normalize(
        {
          Words: [
            {
              MatchTag: 2,
              PhoneInfos: [{ ReferenceLetter: 'b', PronAccuracy: 99, MatchTag: 0 }],
              Tone: { Valid: true, RefTone: 1, HypothesisTone: 1 },
            },
          ],
        },
        1,
      ),
    ).toMatchObject({ status: 'unsure', dims: {} });
  });
  it('only suggests tone practice when the engine returns valid detection', () => {
    const v = normalize({ Words: [{ Tone: { Valid: true, RefTone: 2, HypothesisTone: 3 } }] }, 1);
    expect(v.level).toBe(1);
    expect(v.dims.tone?.ok).toBe(false);
  });
});
describe('quiet microphone processing', () => {
  it('resamples across chunk boundaries without dropping a sample every frame', () => {
    const input = Float32Array.from({ length: 48000 }, (_, i) => Math.sin(i / 21) * 0.2),
      whole = new Resampler(48000).push(input),
      streaming = new Resampler(48000);
    const pieces: number[] = [];
    for (let i = 0; i < input.length; i += 128) pieces.push(...streaming.push(input.slice(i, i + 128)));
    expect(pieces.length).toBe(16000);
    expect(pieces.every((v, i) => v === whole[i])).toBe(true);
  });
  it('stops after speech plus 700ms silence but does not call silence a successful utterance', () => {
    const vad = new Vad(4);
    vad.push(new Int16Array(3200).fill(6000));
    expect(vad.push(new Int16Array(11200)).done).toBe(true);
    expect(vad.heard).toBe(true);
    const silent = new Vad(4);
    expect(silent.push(new Int16Array(64000)).done).toBe(true);
    expect(silent.heard).toBe(false);
  });
  it('writes a 16k mono PCM WAV that can be replayed locally', () => {
    const view = new DataView(wav(Int16Array.of(-32000, 0, 32000)));
    expect(view.getUint32(24, true)).toBe(16000);
    expect(view.getInt16(44, true)).toBe(-32000);
    expect(view.byteLength).toBe(50);
  });
});
