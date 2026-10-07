// Adaptive quality decision (spec §8.6): thresholds, one decision after exactly 120 frames, median not mean.
import { describe, expect, it } from 'vitest';
import { degradeFor, FrameProbe, PROBE_FRAMES, Ring } from './perf';

describe('adaptive degrade', () => {
  it('maps the median to the three levels', () => {
    expect([5, 14, 14.1, 18, 18.5, 22, 22.1, 40].map(degradeFor)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
  });
  it('decides once, after 120 frames, on the median (a few hitches do not degrade)', () => {
    const p = new FrameProbe(); let got: number | null = null; let calls = 0;
    for (let i = 0; i < PROBE_FRAMES + 30; i++) { const d = p.push(i % 20 === 0 ? 60 : 6); if (d != null) { got = d; calls++; } }
    expect(calls).toBe(1); expect(got).toBe(0); expect(p.median).toBe(6); expect(p.done).toBe(true);
    const q = new FrameProbe(); let d2: number | null = null; for (let i = 0; i < PROBE_FRAMES; i++) d2 = q.push(19) ?? d2;
    expect(d2).toBe(2);
  });
  it('a screen that cannot hold 60 fps degrades even when our JS is cheap (rAF interval median > 22 / 30 ms)', () => {
    const run = (gap: number): number | null => { const p = new FrameProbe(); let d: number | null = null; for (let i = 0; i < PROBE_FRAMES; i++) d = p.push(3, gap) ?? d; return d; };
    expect(run(16.7)).toBe(0); expect(run(25)).toBe(2); expect(run(33.4)).toBe(3);
  });
  it('ring keeps the last N values', () => {
    const r = new Ring(4); for (const v of [1, 2, 3, 4, 5, 6]) r.push(v);
    expect(r.n).toBe(4); expect(r.max()).toBe(6); expect(r.mean()).toBe(4.5); expect(r.q(0.5)).toBe(5);
    r.reset(); expect(r.n).toBe(0); expect(r.mean()).toBe(0);
  });
});
