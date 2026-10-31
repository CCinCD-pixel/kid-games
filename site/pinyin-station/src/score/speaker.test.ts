import { afterEach, describe, expect, it, vi } from 'vitest';
import { addRecording, emptySpeaker, loadSpeaker, saveSpeaker, speakerReady, summarize, REFERENCE_RANGE_ST, SPEAKER_MIN, SPEAKER_WINDOW } from './speaker';

afterEach(() => vi.unstubAllGlobals());
describe('speaker profile', () => {
  it('is ready only after SPEAKER_MIN usable recordings and keeps a rolling window', () => {
    let p = emptySpeaker();
    for (let i = 0; i < SPEAKER_MIN - 1; i++) p = addRecording(p, { hz: 300, range: 8 });
    expect(speakerReady(p)).toBe(false);
    p = addRecording(p, { hz: 300, range: 8 });
    expect(speakerReady(p)).toBe(true);
    for (let i = 0; i < 50; i++) p = addRecording(p, { hz: 310 + i, range: 8 });
    expect(p.recent).toHaveLength(SPEAKER_WINDOW);
    expect(summarize(p).medianHz).toBeGreaterThan(330);
  });
  it('ignores nonsense samples (octave-error pitch, absurd range)', () => {
    const p = addRecording(addRecording(addRecording(emptySpeaker(), { hz: 20, range: 5 }), { hz: 300, range: 99 }), { hz: NaN, range: 5 });
    expect(p.recent).toHaveLength(0);
  });
  it('scale brings a narrow-range speaker to the reference range and clamps extremes', () => {
    let narrow = emptySpeaker();
    for (let i = 0; i < 10; i++) narrow = addRecording(narrow, { hz: 300, range: REFERENCE_RANGE_ST * 0.6 });
    expect(summarize(narrow).scale).toBeCloseTo(1 / 0.6, 1);
    let tiny = emptySpeaker();
    for (let i = 0; i < 10; i++) tiny = addRecording(tiny, { hz: 300, range: 1 });
    expect(summarize(tiny).scale).toBe(1.8);
  });
  it('persists locally and survives unavailable storage', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) });
    saveSpeaker(addRecording(emptySpeaker(), { hz: 300, range: 8 }));
    expect(loadSpeaker().recent).toHaveLength(1);
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    });
    expect(loadSpeaker().recent).toHaveLength(0);
    expect(() => saveSpeaker(emptySpeaker())).not.toThrow();
  });
});
