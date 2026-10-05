import { describe, expect, it } from 'vitest';
import { litPath, moonPhase, phaseKey } from '../../site/_hub/moon';

describe('hub moon phase (offline, Meeus ch. 48)', () => {
  it('matches known 2026 lunations', () => {
    // total solar eclipse = new moon, 2026-08-12 ~17:46 UTC
    const nm = moonPhase(new Date('2026-08-12T17:46:00Z'));
    expect(nm.illumination).toBeLessThan(0.01);
    expect(nm.key).toBe('new');
    // total lunar eclipse = full moon, 2026-03-03 ~11:38 UTC
    const fm = moonPhase(new Date('2026-03-03T11:38:00Z'));
    expect(fm.illumination).toBeGreaterThan(0.99);
    expect(fm.key).toBe('full');
    // partial lunar eclipse 2026-08-28 ~04:13 UTC
    expect(moonPhase(new Date('2026-08-28T04:13:00Z')).key).toBe('full');
  });

  it('knows waxing from waning and names the quarters', () => {
    const firstQ = moonPhase(new Date('2026-08-20T03:00:00Z')); // first quarter ≈ 2026-08-20
    expect(firstQ.waxing).toBe(true);
    expect(firstQ.key).toBe('first-quarter');
    expect(firstQ.illumination).toBeGreaterThan(0.4);
    expect(firstQ.illumination).toBeLessThan(0.6);
    const lastQ = moonPhase(new Date('2026-09-04T07:00:00Z')); // last quarter ≈ 2026-09-04
    expect(lastQ.waxing).toBe(false);
    expect(lastQ.key).toBe('last-quarter');
  });

  it('buckets elongation into eight phases', () => {
    expect([0, 45, 90, 135, 180, 225, 270, 315, 350].map(phaseKey)).toEqual([
      'new', 'waxing-crescent', 'first-quarter', 'waxing-gibbous', 'full', 'waning-gibbous', 'last-quarter', 'waning-crescent', 'new',
    ]);
  });

  it('draws the lit limb on the right while waxing, left while waning', () => {
    expect(litPath({ phaseAngle: 120, waxing: true }, 100, 100, 50)).toMatch(/^M100 50A50 50 0 0 1 100 150/);
    expect(litPath({ phaseAngle: 120, waxing: false }, 100, 100, 50)).toMatch(/^M100 50A50 50 0 0 0 100 150/);
  });
});
