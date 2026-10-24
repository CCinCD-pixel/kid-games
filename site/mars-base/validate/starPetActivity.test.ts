import { describe, expect, it, vi } from 'vitest';
import { MemoryStorage } from '../../../tests/helpers/memory-storage';
import { activitySummary, readStarActivity, StarPetActivity } from '../src/app/starPetActivity';

const day = 86_400_000;

describe('star pet activity observation', () => {
  it('counts only visible time in the active screen and records replays', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-10-23T10:00:00Z'));
      const storage = new MemoryStorage();
      const activity = new StarPetActivity(storage);
      activity.begin();
      activity.setMode('pet');
      vi.advanceTimersByTime(20_000);
      activity.setVisible(false);
      vi.advanceTimersByTime(120_000);
      activity.setVisible(true);
      activity.setMode('mission');
      activity.mission(true);
      vi.advanceTimersByTime(10_000);
      activity.setMode('idle');
      const visit = readStarActivity(storage).visits[0]!;
      expect(visit.petMs).toBe(20_000);
      expect(visit.missionMs).toBe(10_000);
      expect(visit.missions).toBe(1);
      expect(visit.replays).toBe(1);
    } finally { vi.useRealTimers(); }
  });

  it('folds the coin entry only after two weeks with repeated pet-only visits', () => {
    const now = Date.now();
    const visit = (at: number, sawMission: boolean) => ({ id: String(at), at, petMs: 120_000, missionMs: sawMission ? 60_000 : 0, sawPet: true, sawMission, missions: sawMission ? 1 : 0, replays: 0 });
    const first = [12, 11, 10].map((n) => visit(now - n * day, n === 10));
    const second = [5, 4, 3].map((n) => visit(now - n * day, n === 3));
    expect(activitySummary({ v: 1, visits: first, collapsed: false }, now).collapse).toBe(false);
    const summary = activitySummary({ v: 1, visits: [...first, ...second], collapsed: false }, now);
    expect(summary.collapse).toBe(true);
    expect(summary.petOnly).toBe(4);
    expect(summary.visits).toBe(6);
    expect(activitySummary({ v: 1, visits: [], collapsed: true }, now).collapse).toBe(true);
  });
});
