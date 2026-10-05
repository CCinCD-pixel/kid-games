import { afterEach, describe, expect, it, vi } from 'vitest';
import { Narrator, type Cue, type NarrationBackend, type NarrationClip, type NarrationManifest } from '@kit/narration';

const manifest: NarrationManifest = {
  'a.1': { src: '/audio/a/a.1.m4a', text: '第一句', durationMs: 1000 },
  'a.2': { src: '/audio/a/a.2.m4a', text: '第二句', durationMs: 1000 },
  'a.n': { src: '/audio/a/a.n.m4a', text: '一共有 {n} 块', durationMs: 1000 },
  'a.missing': { src: '/audio/a/gone.m4a', text: '没有录音', durationMs: 1000 },
};

/** A backend whose lines finish when the test says so. */
class FakeBackend implements NarrationBackend {
  played: string[] = [];
  pending: (() => void)[] = [];
  constructor(readonly name: string, private readonly accepts: (cue: Cue, clip?: NarrationClip) => boolean) {}
  canPlay(cue: Cue, clip?: NarrationClip) {
    return this.accepts(cue, clip);
  }
  play(cue: Cue, _clip: NarrationClip | undefined, signal: AbortSignal) {
    this.played.push(cue.text);
    return new Promise<void>((resolve) => {
      this.pending.push(resolve);
      signal.addEventListener('abort', () => {
        this.pending = this.pending.filter((r) => r !== resolve);
        resolve();
      }, { once: true });
    });
  }
  finish() {
    this.pending.shift()?.();
  }
}

const flush = () => new Promise((r) => setTimeout(r, 0));

function setup() {
  const clip = new FakeBackend('clip', (_c, clip) => !!clip && clip.src !== '/audio/a/gone.m4a');
  const speech = new FakeBackend('speech', () => true);
  const cues: (Cue | null)[] = [];
  const n = new Narrator({ manifest, backends: [clip, speech], unlocked: () => Promise.resolve(), onCue: (c) => cues.push(c), duckMusic: false });
  return { n, clip, speech, cues };
}

afterEach(() => vi.useRealTimers());

describe('Narrator', () => {
  it('plays queued lines in order', async () => {
    const { n, clip, cues } = setup();
    const r1 = n.say('a.1');
    const r2 = n.say('a.2');
    await flush();
    expect(clip.played).toEqual(['第一句']);
    clip.finish();
    expect(await r1).toBe('done');
    await flush();
    expect(clip.played).toEqual(['第一句', '第二句']);
    clip.finish();
    expect(await r2).toBe('done');
    await flush();
    expect(cues.at(-1)).toBeNull(); // queue drained → subtitles may clear
    expect(cues.filter(Boolean).map((c) => c!.source)).toEqual(['clip', 'clip']);
  });

  it('interrupt cuts the current line and drops the queue', async () => {
    const { n, clip } = setup();
    const r1 = n.say('a.1');
    const r2 = n.say('a.2');
    await flush();
    const r3 = n.say('a.n', { interrupt: true, vars: { n: 5 } });
    expect(await r1).toBe('interrupted');
    expect(await r2).toBe('interrupted');
    await flush();
    expect(clip.played).toEqual(['第一句', '一共有 5 块']);
    clip.finish();
    expect(await r3).toBe('done');
  });

  it('falls back to speech only when the clip is missing', async () => {
    const { n, clip, speech, cues } = setup();
    const r = n.say('a.missing');
    await flush();
    expect(clip.played).toEqual([]);
    expect(speech.played).toEqual(['没有录音']);
    expect(cues[0]?.source).toBe('speech');
    speech.finish();
    expect(await r).toBe('done');
  });

  it('unknown ids are skipped, literal Chinese text is spoken by the fallback', async () => {
    const { n, speech } = setup();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await n.say('a.nope')).toBe('skipped');
    warn.mockRestore();
    const r = n.say('你好呀');
    await flush();
    expect(speech.played).toEqual(['你好呀']);
    speech.finish();
    expect(await r).toBe('done');
  });

  it('replay (再听一遍) says the last line again', async () => {
    const { n, clip } = setup();
    const r = n.say('a.2');
    await flush();
    clip.finish();
    await r;
    const again = n.replay();
    await flush();
    expect(clip.played).toEqual(['第二句', '第二句']);
    clip.finish();
    expect(await again).toBe('done');
  });

  it('waits for the audio unlock before speaking', async () => {
    let unlock!: () => void;
    const gate = new Promise<void>((r) => (unlock = r));
    const clip = new FakeBackend('clip', () => true);
    const n = new Narrator({ manifest, backends: [clip], unlocked: () => gate, duckMusic: false });
    void n.say('a.1');
    await flush();
    expect(clip.played).toEqual([]);
    unlock();
    await flush();
    await flush();
    expect(clip.played).toEqual(['第一句']);
  });

  it('shows text for a reading-speed moment when nothing can voice it', async () => {
    vi.useFakeTimers();
    const cues: (Cue | null)[] = [];
    const n = new Narrator({ manifest, backends: [], unlocked: () => Promise.resolve(), onCue: (c) => cues.push(c), duckMusic: false });
    let result: string | undefined;
    void n.say('a.1').then((r) => (result = r));
    await vi.advanceTimersByTimeAsync(0);
    expect(cues[0]).toMatchObject({ text: '第一句', source: 'text' });
    await vi.advanceTimersByTimeAsync(600 + 3 * 220 + 10);
    expect(result).toBe('done');
  });

  it('has / text expose the manifest', () => {
    const { n } = setup();
    expect(n.has('a.1')).toBe(true);
    expect(n.text('a.2')).toBe('第二句');
    expect(n.text('zzz')).toBeUndefined();
  });
});

describe('Narrator: parent 旁白 switch', () => {
  it('shows subtitles without voice when narration is off; replay still speaks', async () => {
    const clip = new FakeBackend('clip', () => true);
    const cues: (Cue | null)[] = [];
    vi.useFakeTimers();
    const n = new Narrator({ manifest, backends: [clip], unlocked: () => Promise.resolve(), onCue: (c) => cues.push(c), duckMusic: false, voiced: () => false });
    const r = n.say('a.1');
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await r).toBe('done');
    expect(clip.played).toEqual([]);
    expect(cues.find(Boolean)).toMatchObject({ id: 'a.1', source: 'text' });
    const again = n.replay();
    await vi.advanceTimersByTimeAsync(0);
    expect(clip.played).toEqual(['第一句']);
    clip.finish();
    expect(await again).toBe('done');
  });
});
