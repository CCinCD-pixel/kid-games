// V2 (spec §3.21) presentation-level cases: 16b slow-mo vs pause, 20 speed choice during the 1.5× fallback, plus §3.15.
import { describe, it, expect } from 'vitest';
import { effSpeed, held, SLOWMO_TICKS, PHASE_TICKS, slowmoStart, slowmoGone, type SpeedHold } from './timing';

const S = (tick: number, flags: number[] = [1400]) => ({ tick, flags });
describe('§3.15 speed rules', () => {
  it('1.5× is held at 1× from 5 s before a 战鼓 to 25 s after it, then comes back by itself', () => {
    const h = { slowUntil: 0, phaseUntil: 0 };
    expect(effSpeed(1.5, S(1299), h)).toBe(1.5); expect(effSpeed(1.5, S(1300), h)).toBe(1); expect(effSpeed(1.5, S(1899), h)).toBe(1); expect(effSpeed(1.5, S(1900), h)).toBe(1.5);
    expect(effSpeed(0.75, S(1400), h)).toBe(0.75); expect(effSpeed(1, S(1400), h)).toBe(1);
  });
  it('a Boss phase change holds 1.5× for 3 s', () => {
    const h = { slowUntil: 0, phaseUntil: 100 + PHASE_TICKS };
    expect(effSpeed(1.5, S(100, []), h)).toBe(1); expect(effSpeed(1.5, S(100 + PHASE_TICKS, []), h)).toBe(1.5);
  });
  it('16b slow-mo is counted in game ticks: a pause (no ticks) does not use it up; slow-mo wins over any speed', () => {
    const h = { slowUntil: 500 + SLOWMO_TICKS, phaseUntil: 0 };
    for (let wall = 0; wall < 100; wall++) expect(effSpeed(1, S(500, []), h)).toBe(0.6); // paused: tick stays at 500
    expect(effSpeed(1.5, S(500 + SLOWMO_TICKS - 1, []), h)).toBe(0.6); expect(effSpeed(1.5, S(500 + SLOWMO_TICKS, []), h)).toBe(1.5);
  });
  it('debut slow-mo lasts until that machine is dismantled, at most 12 s of wall time (§2.4, §8.4)', () => {
    expect(SLOWMO_TICKS / 20 / 0.6).toBeCloseTo(12, 5);
    const h: SpeedHold = { slowUntil: 0, phaseUntil: 0 }; slowmoStart(h, 300, 7);
    expect(effSpeed(1, S(400, []), h)).toBe(0.6);         // still alive after 100 ticks (> the old 48)
    slowmoGone(h, 410, 3); expect(effSpeed(1, S(411, []), h)).toBe(0.6); // another machine: no change
    slowmoGone(h, 420, 7); expect(effSpeed(1, S(420, []), h)).toBe(1); expect(effSpeed(1.5, S(421, []), h)).toBe(1.5);
    const h2: SpeedHold = { slowUntil: 0, phaseUntil: 0 }; slowmoStart(h2, 0, 1);
    expect(effSpeed(1, S(SLOWMO_TICKS - 1, []), h2)).toBe(0.6); expect(effSpeed(1, S(SLOWMO_TICKS, []), h2)).toBe(1); // 12 s cap
  });
  it('20 a new choice during the fallback is remembered and used when the fallback ends', () => {
    const h = { slowUntil: 0, phaseUntil: 0 }; let sel = 1.5;
    expect(held(S(1400), h)).toBe(true); expect(effSpeed(sel, S(1400), h)).toBe(1);
    sel = 0.75; expect(effSpeed(sel, S(1401), h)).toBe(0.75);
    sel = 1.5; expect(effSpeed(sel, S(1500), h)).toBe(1); expect(effSpeed(sel, S(1900), h)).toBe(1.5);
  });
});
