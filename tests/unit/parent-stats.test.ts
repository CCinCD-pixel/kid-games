import { describe, expect, it } from 'vitest';
import type { SessionRecord } from '@kit/log';
import { dailyBars, dayStart, domainMinutes, fmtAgo, fmtMinutes, launchShares, perGame, totals } from '../../site/parent/src/stats';

const NOW = new Date('2026-10-05T20:00:00+08:00').getTime();
const DAY = 86_400_000;
const s = (game: string, daysAgo: number, minutes: number, source: SessionRecord['source'] = 'hub'): SessionRecord => {
  const start = NOW - daysAgo * DAY - 3_600_000;
  return { id: `${game}-${daysAgo}-${minutes}`, game, source, start, lastBeat: start + minutes * 60_000, activeMs: minutes * 60_000, events: [] };
};
const place = (g: string) => (({ 'mars-base': 'base', 'snake-battle': 'playground', sokoban: 'classic' }) as const)[g as 'sokoban'];
const log = [s('mars-base', 0, 12), s('snake-battle', 0, 6, 'resume'), s('sokoban', 2, 10, 'suggested'), s('hub', 0, 3), s('mars-base', 9, 20), s('mars-base', 40, 30)];

describe('parent page statistics', () => {
  it('totals only real play inside the window (hub browsing excluded)', () => {
    const t7 = totals(log, place, 7, NOW);
    expect(t7.minutes).toBeCloseTo(28);
    expect(t7.sessions).toBe(3);
    expect(t7.activeDays).toBe(2);
    expect(t7.byPlace).toEqual({ base: 12, playground: 6, classic: 10 });
    expect(totals(log, place, 30, NOW).minutes).toBeCloseTo(48);
  });

  it('builds 14 local-day bars, today last', () => {
    const bars = dailyBars(log, place, 14, NOW);
    expect(bars).toHaveLength(14);
    expect(bars[13].start).toBe(dayStart(NOW));
    expect(bars[13].minutes).toEqual({ base: 12, playground: 6, classic: 0 });
    expect(bars[11].minutes.classic).toBe(10);
    expect(bars[4].minutes.base).toBe(20);
  });

  it('per-game, launch sources and domains', () => {
    const g = perGame(log, 30, NOW);
    expect(g.map((x) => x.game)).toEqual(['mars-base', 'sokoban', 'snake-battle']);
    expect(g[0]).toMatchObject({ minutes: 32, sessions: 2 });
    expect(launchShares(log, 30, NOW)).toMatchObject({ hub: 2, resume: 1, suggested: 1, total: 4 });
    expect(domainMinutes(g, (id) => ({ 'mars-base': ['number', 'measurement'], sokoban: ['planning'] })[id as 'sokoban'])).toEqual([['number', 16], ['measurement', 16], ['planning', 10]]);
  });

  it('formats for parents', () => {
    expect(fmtMinutes(0)).toBe('0 分钟');
    expect(fmtMinutes(0.4)).toBe('不到 1 分钟');
    expect(fmtMinutes(42.4)).toBe('42 分钟');
    expect(fmtMinutes(150)).toBe('2 小时 30 分');
    expect(fmtAgo(null, NOW)).toBe('还没玩过');
    expect(fmtAgo(NOW - 3_600_000, NOW)).toBe('今天');
    expect(fmtAgo(NOW - DAY, NOW)).toBe('昨天');
  });
});
