import { describe, expect, it } from 'vitest';
import { CLOCK_KEY, DeviceClock } from '@kit/clock';
import { MemoryStorage } from '../helpers/memory-storage';

describe('device clock', () => {
  it('keeps one device id and increasing counters across tabs and reloads, despite wall clock rollback', () => {
    const storage = new MemoryStorage();
    const a = new DeviceClock({ storage, now: () => Date.UTC(2026, 9, 23), device: () => 'deviceA' });
    const b = new DeviceClock({ storage, now: () => 0, device: () => 'deviceB' });
    const first = a.next(); const second = b.next(); const third = a.next(second.lc);
    expect([first.dev, second.dev, third.dev]).toEqual(['deviceA', 'deviceA', 'deviceA']);
    expect(first.lc).toBeLessThan(second.lc); expect(second.lc).toBeLessThan(third.lc);
    const reloaded = new DeviceClock({ storage, now: () => 0, device: () => 'unused' });
    expect(reloaded.next().lc).toBe(third.lc + 1);
  });
  it('keeps advancing in memory when storage is full', () => {
    const storage = new MemoryStorage(); storage.failWrites = true;
    const c = new DeviceClock({ storage, now: () => 0, device: () => 'offline' });
    expect(c.next().lc).toBe(1); expect(c.next().lc).toBe(2);
    expect(storage.getItem(CLOCK_KEY)).toBeNull();
  });
});
