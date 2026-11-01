import { describe, expect, it } from 'vitest';
import { ItemTimer } from '../src/app/engagement';

describe('item active time', () => {
  it('excludes hidden pages and demonstrations', () => {
    const timer = new ItemTimer(0);
    timer.tick(10_000);
    timer.setDemo(true, 10_000);
    timer.tick(30_000);
    timer.setDemo(false, 30_000);
    timer.setVisible(false, 35_000);
    timer.tick(95_000);
    timer.setVisible(true, 95_000);
    expect(timer.elapsed(100_000)).toBe(20_000);
  });
  it('caps each idle gap and an entire item', () => {
    const timer = new ItemTimer(100);
    expect(timer.elapsed(100_100)).toBe(45_000);
    timer.tick(145_100); timer.tick(190_100); timer.tick(235_100);
    expect(timer.elapsed(250_100)).toBe(120_000);
    expect(timer.elapsed(200_000)).toBe(120_000);
  });
});
