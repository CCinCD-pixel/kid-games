import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const kit = vi.hoisted(() => ({ context: null as any, release: vi.fn() }));
vi.mock('@kit/audio', () => ({
  getAudioContext: () => kit.context,
  getBus: () => ({}),
  claimRecordingSession: () => kit.release,
}));
import { Capture, CaptureError } from './capture';
import { gaussian, rng, synthVoice } from './test-support';

/** A scripted microphone: tracks that remember whether they were stopped, and a worklet node the test can feed. */
function rig(sampleRate = 48000) {
  const tracks = [{ readyState: 'live', stop: vi.fn(function (this: any) { this.readyState = 'ended'; }), listeners: {} as Record<string, () => void>, addEventListener(type: string, fn: () => void) { this.listeners[type] = fn; } }];
  let port: { onmessage: ((e: { data: Float32Array }) => void) | null } = { onmessage: null };
  const nodes: any[] = [];
  const listeners: Record<string, () => void> = {};
  const context: any = {
    sampleRate,
    state: 'running',
    destination: {},
    resume: async () => {},
    audioWorklet: { addModule: async () => {} },
    createMediaStreamSource: () => mk('source'),
    createGain: () => Object.assign(mk('gain'), { gain: { value: 1 } }),
    addEventListener: (type: string, fn: () => void) => (listeners[type] = fn),
    removeEventListener: (type: string) => delete listeners[type],
  };
  function mk(name: string) {
    const n = { name, connect: vi.fn(), disconnect: vi.fn() };
    nodes.push(n);
    return n;
  }
  class FakeWorklet {
    port = port;
    connect = vi.fn();
    disconnect = vi.fn();
    constructor() {
      nodes.push(this);
    }
  }
  kit.context = context;
  vi.stubGlobal('AudioWorkletNode', FakeWorklet);
  const getUserMedia = vi.fn(async () => ({ getTracks: () => tracks }));
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
  const docListeners: Record<string, () => void> = {};
  vi.stubGlobal('document', { visibilityState: 'visible', addEventListener: (t: string, f: () => void) => (docListeners[t] = f), removeEventListener: (t: string) => delete docListeners[t] });
  vi.stubGlobal('addEventListener', () => {});
  vi.stubGlobal('removeEventListener', () => {});
  /** Feed audio at the context rate in 1024-sample blocks, like the worklet does. */
  const feed = async (seconds: number, f0 = 300, amp = 0.5, noise = 0.0008) => {
    const random = rng(4);
    const pcm = synthVoice({ sampleRate, seconds, f0: () => f0, amp: () => amp });
    for (let i = 0; i < pcm.length; i++) pcm[i] += noise * gaussian(random);
    for (let at = 0; at + 1024 <= pcm.length; at += 1024) {
      port.onmessage?.({ data: pcm.slice(at, at + 1024) });
      if (at % (1024 * 20) === 0) await Promise.resolve();
    }
  };
  const silence = (seconds: number, noise = 0.0008) => {
    const random = rng(8);
    for (let k = 0; k < (seconds * sampleRate) / 1024; k++) port.onmessage?.({ data: Float32Array.from({ length: 1024 }, () => noise * gaussian(random)) });
  };
  return { tracks, context, nodes, feed, silence, getUserMedia, listeners, docListeners, port: () => port };
}
const tick = () => new Promise((r) => setTimeout(r, 5));

beforeEach(() => kit.release.mockClear());
afterEach(() => {
  vi.unstubAllGlobals();
  kit.context = null;
});

describe('Capture', () => {
  it('records, trims, meters the level, and leaves no track live', async () => {
    const r = rig();
    const levels: number[] = [];
    const capture = new Capture();
    const run = capture.start({ onLevel: (l) => levels.push(l) });
    await tick();
    r.silence(0.4);
    await r.feed(0.6);
    r.silence(0.8);
    const result = await run;
    expect(result.heard).toBe(true);
    expect(result.reason).toBe('silence');
    expect(result.sampleRate).toBe(16000);
    expect(result.pcm.length / 16000).toBeGreaterThan(0.55);
    expect(result.pcm.length / 16000).toBeLessThan(1.0);
    expect(Math.max(...levels)).toBeGreaterThan(0.4);
    expect(result.quality.unreliable).toBe(false);
    expect(result.wavBlob().size).toBe(44 + result.pcm.length * 2);
    expect(r.tracks[0].stop).toHaveBeenCalledTimes(1);
    expect(capture.liveTracks()).toHaveLength(0);
    expect(kit.release).toHaveBeenCalledTimes(1);
    expect(r.nodes.every((n) => n.disconnect.mock.calls.length >= 1)).toBe(true);
    expect(r.port().onmessage).toBeNull();
  });
  it('"done" before any speech returns an unheard clip and still releases the microphone', async () => {
    const r = rig();
    const capture = new Capture();
    const run = capture.start();
    await tick();
    r.silence(0.5);
    capture.stop();
    const result = await run;
    expect(result.heard).toBe(false);
    expect(r.tracks[0].stop).toHaveBeenCalledTimes(1);
    expect(kit.release).toHaveBeenCalledTimes(1);
  });
  it('permission denied -> CaptureError(denied), nothing left open', async () => {
    const r = rig();
    r.getUserMedia.mockRejectedValueOnce(Object.assign(new Error('x'), { name: 'NotAllowedError' }));
    await expect(new Capture().start()).rejects.toMatchObject({ code: 'denied' });
    expect(kit.release).toHaveBeenCalledTimes(1);
  });
  it('no microphone / no mediaDevices -> unavailable', async () => {
    const r = rig();
    r.getUserMedia.mockRejectedValueOnce(Object.assign(new Error('x'), { name: 'NotFoundError' }));
    await expect(new Capture().start()).rejects.toMatchObject({ code: 'unavailable' });
    vi.stubGlobal('navigator', {});
    await expect(new Capture().start()).rejects.toBeInstanceOf(CaptureError);
  });
  it('dispose while the permission prompt is open stops the late stream and rejects cancelled', async () => {
    const r = rig();
    let grant!: (s: unknown) => void;
    r.getUserMedia.mockImplementationOnce(() => new Promise((res) => (grant = res)) as never);
    const capture = new Capture();
    const run = capture.start();
    capture.dispose();
    grant({ getTracks: () => r.tracks });
    await expect(run).rejects.toMatchObject({ code: 'cancelled' });
    await tick();
    expect(r.tracks[0].stop).toHaveBeenCalled();
    expect(kit.release).toHaveBeenCalledTimes(1);
    await expect(capture.start()).rejects.toMatchObject({ code: 'cancelled' });
  });
  it('a second start while recording is refused (busy) without disturbing the first', async () => {
    const r = rig();
    const capture = new Capture();
    const run = capture.start();
    await tick();
    await expect(capture.start()).rejects.toMatchObject({ code: 'busy' });
    r.silence(0.3);
    capture.stop();
    await run;
    expect(r.tracks[0].stop).toHaveBeenCalledTimes(1);
  });
  it('a phone call (AudioContext interrupted) aborts cleanly', async () => {
    const r = rig();
    const capture = new Capture();
    const run = capture.start();
    await tick();
    await r.feed(0.3);
    r.context.state = 'interrupted';
    r.listeners.statechange();
    await expect(run).rejects.toMatchObject({ code: 'interrupted' });
    expect(r.tracks[0].stop).toHaveBeenCalledTimes(1);
    expect(kit.release).toHaveBeenCalledTimes(1);
    expect(capture.busy).toBe(false);
  });
  it('switching away (page hidden) and an unplugged device both abort cleanly', async () => {
    const r = rig();
    const hidden = new Capture();
    const run = hidden.start();
    await tick();
    (document as any).visibilityState = 'hidden';
    r.docListeners.visibilitychange();
    await expect(run).rejects.toMatchObject({ code: 'interrupted' });
    (document as any).visibilityState = 'visible';
    r.tracks[0].readyState = 'live'; // the same scripted microphone is re-opened for the second capture
    const run2 = new Capture().start();
    await tick();
    r.tracks[0].listeners.ended();
    await expect(run2).rejects.toMatchObject({ code: 'device_ended' });
  });
  it('falls back to a ScriptProcessor when AudioWorklet is missing', async () => {
    const r = rig();
    r.context.audioWorklet = undefined;
    let process!: (e: unknown) => void;
    r.context.createScriptProcessor = () => ({
      connect: vi.fn(),
      disconnect: vi.fn(),
      set onaudioprocess(fn: (e: unknown) => void) { if (fn) process = fn; },
    });
    const capture = new Capture();
    const run = capture.start();
    await tick();
    const feedBlock = (v: Float32Array) => process({ inputBuffer: { getChannelData: () => v }, outputBuffer: { getChannelData: () => new Float32Array(v.length) } });
    const random = rng(2);
    for (let k = 0; k < 20; k++) feedBlock(Float32Array.from({ length: 2048 }, () => 0.0008 * gaussian(random)));
    const voice = synthVoice({ sampleRate: 48000, seconds: 0.5, f0: () => 300, amp: () => 0.5 });
    for (let at = 0; at + 2048 <= voice.length; at += 2048) feedBlock(voice.slice(at, at + 2048));
    for (let k = 0; k < 40; k++) feedBlock(Float32Array.from({ length: 2048 }, () => 0.0008 * gaussian(random)));
    const result = await run;
    expect(result.source).toBe('script-processor');
    expect(result.heard).toBe(true);
    expect(r.tracks[0].stop).toHaveBeenCalledTimes(1);
  });
});
