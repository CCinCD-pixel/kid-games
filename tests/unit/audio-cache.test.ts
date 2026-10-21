import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  __resetAudioForTests, clipCacheStats, decodeClip, decodedBytes, prefetchClip, prefetchUrls, releaseClips, setClipCacheLimit,
} from '@kit/audio';
import { Narrator, type NarrationManifest } from '@kit/narration';

/** bytes per fake clip url: /a/<n>.m4a decodes to n bytes of PCM (mono, 4 bytes per sample) */
const sizeOf = (url: string) => Number(/\/(\d+)\.m4a$/.exec(url)?.[1] ?? 0);

function stubAudio() {
  class FakeAudioContext {
    state = 'running';
    sampleRate = 44100;
    currentTime = 0;
    destination = {};
    createGain() { return { gain: { value: 1, setTargetAtTime() {} }, connect() {} }; }
    createBuffer() { return {}; }
    createBufferSource() { return { connect() {}, start() {}, disconnect() {} }; }
    addEventListener() {}
    resume() { return Promise.resolve(); }
    decodeAudioData(data: ArrayBuffer) { return Promise.resolve({ length: data.byteLength / 4, numberOfChannels: 1 }); }
  }
  const fetched: string[] = [];
  vi.stubGlobal('AudioContext', FakeAudioContext);
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    fetched.push(url);
    if (url.includes('missing')) return { ok: false, status: 404 };
    return { ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(sizeOf(url) || 400), json: async () => ({}) };
  }));
  return fetched;
}

afterEach(() => {
  __resetAudioForTests();
  vi.unstubAllGlobals();
});

describe('decoded clip cache', () => {
  it('is unlimited by default and counts decoded bytes', async () => {
    stubAudio();
    await Promise.all(['/a/4000.m4a', '/a/8000.m4a'].map(decodeClip));
    expect(decodedBytes()).toBe(12000);
    expect(clipCacheStats()).toEqual({ clips: 2, bytes: 12000, limit: Infinity });
  });

  it('evicts least-recently-used clips beyond the limit, never the one just decoded', async () => {
    const fetched = stubAudio();
    setClipCacheLimit(10000);
    await decodeClip('/a/4000.m4a');
    await decodeClip('/a/4000.m4a'); // cache hit: no second fetch
    await decodeClip('/a/3000.m4a');
    await decodeClip('/a/4000.m4a'); // touch: 4000 is now the most recent, 3000 older
    expect(fetched).toEqual(['/a/4000.m4a', '/a/3000.m4a']);
    await decodeClip('/a/5000.m4a'); // 4000 + 3000 + 5000 = 12000 > 10000 → drop the oldest (3000)
    expect(decodedBytes()).toBe(9000);
    await decodeClip('/a/3000.m4a'); // was evicted → decoded again
    expect(fetched.filter((u) => u === '/a/3000.m4a')).toHaveLength(2);
    // a clip bigger than the whole budget still plays (it is the newest), everything else goes
    await decodeClip('/a/20000.m4a');
    expect(decodedBytes()).toBe(20000);
    setClipCacheLimit(Infinity);
  });

  it('setClipCacheLimit evicts at once; releaseClips drops by url or all', async () => {
    stubAudio();
    await Promise.all(['/a/1000.m4a', '/a/2000.m4a', '/a/3000.m4a'].map(decodeClip));
    setClipCacheLimit(4000);
    expect(decodedBytes()).toBe(3000); // the two oldest (1000, 2000) went, 3000 ≤ 4000 stays
    releaseClips(['/a/3000.m4a']);
    expect(decodedBytes()).toBe(0);
    await decodeClip('/a/1000.m4a');
    releaseClips();
    expect(clipCacheStats().clips).toBe(0);
  });

  it('failed decodes are not cached and can retry', async () => {
    const fetched = stubAudio();
    expect(await decodeClip('/a/missing.m4a')).toBeNull();
    expect(await decodeClip('/a/missing.m4a')).toBeNull();
    expect(fetched.filter((u) => u.includes('missing'))).toHaveLength(2);
    expect(decodedBytes()).toBe(0);
  });
});

describe('decode-less prefetch', () => {
  it('fetches once, holds no PCM, bounds concurrency, reports failures', async () => {
    const fetched = stubAudio();
    let live = 0;
    let peak = 0;
    const mockFetch = fetch as unknown as ReturnType<typeof vi.fn>;
    const base = mockFetch.getMockImplementation() as (url: string) => Promise<unknown>;
    mockFetch.mockImplementation(async (url: string) => {
      live += 1;
      peak = Math.max(peak, live);
      await new Promise((r) => setTimeout(r, 5));
      live -= 1;
      return base(url);
    });
    const progress: number[] = [];
    const urls = ['/a/100.m4a', '/a/200.m4a', '/a/300.m4a', '/a/400.m4a', '/a/500.m4a', '/a/missing.m4a', '/a/100.m4a'];
    const res = await prefetchUrls(urls, { concurrency: 2, onProgress: (d) => progress.push(d) });
    expect(res).toEqual({ ok: 5, failed: ['/a/missing.m4a'] });
    expect(peak).toBeLessThanOrEqual(2);
    expect(progress.at(-1)).toBe(6); // duplicates are collapsed
    expect(decodedBytes()).toBe(0);
    expect(clipCacheStats().clips).toBe(0);
    const before = fetched.length;
    expect(await prefetchClip('/a/100.m4a')).toBe(true); // already warm
    expect(fetched.length).toBe(before);
    const dec = await prefetchUrls(['/a/700.m4a'], { decode: true });
    expect(dec.ok).toBe(1);
    expect(decodedBytes()).toBe(700);
  });

  it('Narrator.prefetch({decode:false}) only warms; the default decodes', async () => {
    stubAudio();
    const manifest: NarrationManifest = {
      'x.1': { src: '/a/1200.m4a', text: '一', durationMs: 1 },
      'x.2': { src: '/a/2400.m4a', text: '二', durationMs: 1 },
    };
    const n = new Narrator({ manifest, unlocked: () => Promise.resolve() });
    expect(await n.prefetch(['x.1', 'x.2', 'nope'], { decode: false })).toEqual({ ok: 2, failed: [] });
    expect(decodedBytes()).toBe(0);
    expect((await n.prefetch(['x.1'])).ok).toBe(1);
    expect(decodedBytes()).toBe(1200);
    n.releaseLines(['x.1']);
    expect(decodedBytes()).toBe(0);
    expect(n.clipUrls(['x.2', 'zzz'])).toEqual(['/a/2400.m4a']);
  });
});

describe('Narrator manifest shards', () => {
  function shardFetch(delays: Record<string, number>, data: Record<string, NarrationManifest>) {
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      calls.push(url);
      await new Promise((r) => setTimeout(r, delays[url] ?? 0));
      if (!data[url]) return { ok: false, status: 404 };
      return { ok: true, status: 200, json: async () => data[url] };
    }));
    return calls;
  }
  const core: NarrationManifest = { 'c.1': { src: '/a/c1.m4a', text: '核心一', durationMs: 1 } };
  const zone: NarrationManifest = { 'z.1': { src: '/a/z1.m4a', text: '分区一', durationMs: 1 } };

  it('ready() waits for the constructor manifest only; addManifest dedupes in-flight loads', async () => {
    const calls = shardFetch({ '/core.json': 0, '/zone.json': 60 }, { '/core.json': core, '/zone.json': zone });
    const n = new Narrator({ manifestUrl: '/core.json', backends: [], unlocked: () => Promise.resolve(), duckMusic: false });
    const a = n.addManifest('/zone.json');
    void n.addManifest('/zone.json');
    await n.ready();
    expect(n.has('c.1')).toBe(true);
    expect(n.has('z.1')).toBe(false);
    expect(n.loadingShards).toBe(true);
    await a;
    expect(n.has('z.1')).toBe(true);
    expect(n.isManifestLoaded('/zone.json')).toBe(true);
    await n.addManifest('/zone.json');
    expect(calls.filter((c) => c === '/zone.json')).toHaveLength(1);
  });

  it('a failed shard can be retried; objects merge directly', async () => {
    const calls = shardFetch({}, {});
    const n = new Narrator({ backends: [], unlocked: () => Promise.resolve(), duckMusic: false });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await n.addManifest('/gone.json');
    expect(n.isManifestLoaded('/gone.json')).toBe(false);
    await n.addManifest('/gone.json');
    expect(calls).toHaveLength(2);
    await n.addManifest(zone);
    expect(n.text('z.1')).toBe('分区一');
  });

  it('a say() for a line in a still-loading shard waits for it, and order is kept', async () => {
    shardFetch({ '/core.json': 0, '/zone.json': 40 }, { '/core.json': core, '/zone.json': zone });
    const order: string[] = [];
    const n = new Narrator({ manifestUrl: '/core.json', backends: [], unlocked: () => Promise.resolve(), duckMusic: false, voiced: () => false, onCue: (c) => { if (c) order.push(c.text); } });
    await n.ready();
    void n.addManifest('/zone.json');
    const first = n.say('z.1'); // not known yet → waits for the shard
    const second = n.say('c.1'); // known, but must not overtake z.1
    await Promise.all([first, second]);
    expect(order).toEqual(['分区一', '核心一']);
  });

  it('stop() cancels says that are still waiting for a shard', async () => {
    shardFetch({ '/zone.json': 50 }, { '/zone.json': zone });
    const n = new Narrator({ backends: [], unlocked: () => Promise.resolve(), duckMusic: false, voiced: () => false });
    void n.addManifest('/zone.json');
    const r = n.say('z.1');
    n.stop();
    expect(await r).toBe('interrupted');
  });
});
