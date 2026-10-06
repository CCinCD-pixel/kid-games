/**
 * Narration flag (spec §7.3, §9.4 #13 — the clips:false branch; the browser suite covers the shipped
 * clips:true state): without clips no /audio/sokoban/ request is ever made and the text manifest
 * still answers every line; with clips the generated manifest is requested.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createVoice, sayChain } from './src/audio/voice';
import { LINES } from './src/data';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function recordFetch(): string[] {
  const calls: string[] = [];
  globalThis.fetch = (async (u: RequestInfo | URL) => {
    calls.push(String(u));
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return calls;
}

const tick = () => new Promise((r) => setTimeout(r, 10));

describe('voice clips flag', () => {
  it('clips:false → no request to /audio/sokoban/, every line still has its subtitle text', async () => {
    const calls = recordFetch();
    const v = createVoice({ test: true, clips: false });
    await tick();
    expect(calls.filter((c) => c.includes('/audio/sokoban/'))).toEqual([]);
    for (const l of LINES) expect(v.narrator.text(l.id), l.id).toBe(l.text);
  });
  it('clips:true → the generated audio manifest is requested (once)', async () => {
    const calls = recordFetch();
    createVoice({ test: true, clips: true });
    await tick();
    expect(calls.filter((c) => c.includes('/audio/sokoban/'))).toEqual(['/audio/sokoban/audio-manifest.json']);
  });
});

describe('voice chains (QA r2: a closed card must not keep talking)', () => {
  /** A fake narrator: lines are queued; stop() resolves the current + queued ones 'interrupted'. */
  function fakeVoice() {
    const log: string[] = [];
    let pending: ((r: 'done' | 'interrupted') => void)[] = [];
    return {
      log,
      say(id: string, o: { interrupt?: boolean } = {}) {
        if (o.interrupt) this.stop();
        log.push(id);
        return new Promise<'done' | 'interrupted' | 'skipped'>((r) => pending.push(r));
      },
      finishOne() {
        pending.shift()?.('done');
      },
      stop() {
        const p = pending;
        pending = [];
        for (const r of p) r('interrupted');
      },
    };
  }
  const tick = () => new Promise((r) => setTimeout(r, 0));

  it('stops after the line that was cut — the next card owns the voice', async () => {
    const v = fakeVoice();
    void sayChain(v, ['sok.ch.done', 'sok.item.plate', 'sok.card.c1']);
    await tick();
    v.stop(); // the child taps 好
    await tick();
    void sayChain(v, ['sok.cert.ask', 'sok.cert.go']);
    await tick();
    v.finishOne();
    await tick();
    expect(v.log).toEqual(['sok.ch.done', 'sok.cert.ask', 'sok.cert.go']);
  });

  it('plays every line in order when nothing interrupts; alive() ends it', async () => {
    const v = fakeVoice();
    let open = true;
    void sayChain(v, ['a', null, 'b', 'c'], () => open);
    await tick();
    v.finishOne();
    await tick();
    open = false;
    v.finishOne();
    await tick();
    expect(v.log).toEqual(['a', 'b']);
  });
});
