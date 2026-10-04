import { describe, expect, it } from 'vitest';
import { consumeLaunchSource, LOG_KEY, readSessions, recordLaunch, recoverOpenSessions, startSession, summarize } from '@kit/log';
import { MemoryStorage } from '../helpers/memory-storage';

function clock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

describe('session log', () => {
  it('records a session with marks and active time', () => {
    const storage = new MemoryStorage();
    const session = new MemoryStorage();
    const c = clock();
    const s = startSession('mars-base', {}, { storage, session, now: c.now, doc: undefined, win: undefined });
    expect(s.record.source).toBe('direct');
    c.advance(5000);
    s.mark('level-complete', { level: 1 });
    c.advance(10_000);
    s.end('leave');
    const [r] = readSessions(storage);
    expect(r.game).toBe('mars-base');
    expect(r.activeMs).toBe(15_000);
    expect(r.endReason).toBe('leave');
    expect(r.events).toEqual([{ t: 5000, name: 'level-complete', data: { level: 1 } }]);
  });

  it('closes sessions a killed app left open', () => {
    const storage = new MemoryStorage();
    storage.setItem(LOG_KEY, JSON.stringify([{ id: 'x', game: 'chess', source: 'hub', start: 1, lastBeat: 500, activeMs: 499, events: [] }]));
    expect(recoverOpenSessions(storage)).toBe(1);
    expect(readSessions(storage)[0]).toMatchObject({ end: 500, endReason: 'recovered' });
    expect(recoverOpenSessions(storage)).toBe(0);
  });

  it('launch source is consumed once and must be fresh and for this game', () => {
    const session = new MemoryStorage();
    const c = clock();
    recordLaunch('chess', 'suggested', { session, now: c.now });
    expect(consumeLaunchSource('sokoban', { session, now: c.now })).toBe('direct');
    recordLaunch('chess', 'hub', { session, now: c.now });
    expect(consumeLaunchSource('chess', { session, now: c.now })).toBe('hub');
    expect(consumeLaunchSource('chess', { session, now: c.now })).toBe('direct');
    recordLaunch('chess', 'hub', { session, now: c.now });
    c.advance(120_000);
    expect(consumeLaunchSource('chess', { session, now: c.now })).toBe('direct');
  });

  it('summarizes minutes per game over a window', () => {
    const storage = new MemoryStorage();
    const day = 86_400_000;
    const now = 100 * day;
    storage.setItem(LOG_KEY, JSON.stringify([
      { id: 'a', game: 'chess', source: 'hub', start: now - day, lastBeat: 0, activeMs: 6 * 60_000, events: [] },
      { id: 'b', game: 'chess', source: 'hub', start: now - 2 * day, lastBeat: 0, activeMs: 3 * 60_000, events: [] },
      { id: 'c', game: 'sokoban', source: 'hub', start: now - 40 * day, lastBeat: 0, activeMs: 60_000, events: [] },
    ]));
    expect(summarize(30, storage, now)).toEqual({ chess: { sessions: 2, minutes: 9 } });
  });
});
