import { describe, expect, it } from 'vitest';
import { clamp, ease, lerp, progress } from '@kit/tween';

describe('tween helpers', () => {
  it('every easing maps 0→0 and 1→1', () => {
    for (const [name, fn] of Object.entries(ease)) {
      expect(fn(0), name).toBeCloseTo(0, 6);
      expect(fn(1), name).toBeCloseTo(1, 6);
    }
  });
  it('outBack overshoots, outQuad does not', () => {
    const peak = Math.max(...Array.from({ length: 101 }, (_, i) => ease.outBack(i / 100)));
    expect(peak).toBeGreaterThan(1);
    expect(Math.max(...Array.from({ length: 101 }, (_, i) => ease.outQuad(i / 100)))).toBeLessThanOrEqual(1);
  });
  it('clamp / lerp / progress', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
    expect(lerp(10, 20, 0.25)).toBe(12.5);
    expect(progress(10, 20, 15)).toBe(0.5);
    expect(progress(10, 20, 30)).toBe(1);
    expect(progress(4, 4, 4)).toBe(1);
  });
});
