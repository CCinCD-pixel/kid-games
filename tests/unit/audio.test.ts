import { describe, expect, it } from 'vitest';
import { enforceVoiceLimit, getAudioContext, isAudioUnlocked, playTone, sfx, unlockAudio, whenAudioUnlocked } from '@kit/audio';

describe('audio (no Web Audio available, e.g. very old browsers or Node)', () => {
  it('degrades to silent no-ops and still releases narration waiters', async () => {
    expect(getAudioContext()).toBeNull();
    expect(isAudioUnlocked()).toBe(false);
    const waiting = whenAudioUnlocked();
    unlockAudio();
    await waiting;
    expect(isAudioUnlocked()).toBe(true);
    expect(() => playTone(440, 0.1)).not.toThrow();
    expect(sfx.play('unknown')).toBeNull();
  });
});

describe('sfx voice pooling', () => {
  it('cuts the oldest voice when a sound is at capacity', () => {
    const stopped: number[] = [];
    const mk = (id: number) => ({ id, stop: () => stopped.push(id) });
    const active = [mk(1), mk(2), mk(3)];
    const removed = enforceVoiceLimit(active, 3);
    expect(removed.map((v) => v.id)).toEqual([1]);
    expect(stopped).toEqual([1]);
    expect(active.map((v) => v.id)).toEqual([2, 3]);
    expect(enforceVoiceLimit(active, 4)).toEqual([]);
  });
});
