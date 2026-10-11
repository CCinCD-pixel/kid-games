import { afterEach, describe, expect, it, vi } from 'vitest';
import { __resetAudioForTests, enforceVoiceLimit, getAudioContext, installAudioAutoUnlock, isAudioUnlocked, playTone, sfx, unlockAudio, whenAudioUnlocked } from '@kit/audio';

afterEach(() => {
  __resetAudioForTests();
  vi.unstubAllGlobals();
});

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

describe('audio recovery', () => {
  it('stays running when a hidden page becomes visible before suspension completes', async () => {
    const listeners = new Map<string, () => void>();
    let visibilityState = 'visible';
    const pendingSuspends: Array<() => void> = [];
    class FakeAudioContext {
      state = 'suspended';
      sampleRate = 44100;
      currentTime = 0;
      destination = {};
      createGain() { return { gain: { value: 1 }, connect() {} }; }
      createBuffer() { return {}; }
      createBufferSource() { return { connect() {}, start() {}, disconnect() {}, onended: null }; }
      addEventListener() {}
      resume() { this.state = 'running'; return Promise.resolve(); }
      suspend() {
        return new Promise<void>((resolve) => pendingSuspends.push(() => {
          this.state = 'suspended';
          resolve();
        }));
      }
    }
    vi.stubGlobal('AudioContext', FakeAudioContext);
    vi.stubGlobal('document', {
      addEventListener: (type: string, fn: () => void) => listeners.set(type, fn),
      get visibilityState() { return visibilityState; },
    });
    vi.stubGlobal('window', { addEventListener: () => {} });

    installAudioAutoUnlock();
    unlockAudio();
    const audio = getAudioContext()!;
    await Promise.resolve();
    expect(audio.state).toBe('running');

    visibilityState = 'hidden';
    listeners.get('visibilitychange')!();
    visibilityState = 'visible';
    listeners.get('visibilitychange')!();
    await Promise.resolve();
    pendingSuspends.forEach((complete) => complete());
    await Promise.resolve();

    expect(audio.state).toBe('running');
  });
});
