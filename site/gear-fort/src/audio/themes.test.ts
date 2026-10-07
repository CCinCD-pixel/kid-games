// V16 (data half): written themes stay pentatonic, bar counts per spec §7.2, stingers 1–3 s, arrangement is pure.
// The render half (buffers, LUFS, centroids) is synth.test.ts; WAVs for dad: tools/render-audio.test.ts (GF_AUDIO=1).

import { describe, expect, it } from 'vitest';
import { MOTIF, MAP_THEME, STORY_THEME, STINGERS, beatsOf, inMode, arrangement, degUp } from './themes';

describe('composed themes', () => {
  it('motif = 4 bars, 宫–商–角–徵–宫, ends on a 编钟', () => {
    expect(beatsOf(MOTIF)).toBe(16);
    expect(MOTIF.map((n) => n[0] % 12).filter((v, i, a) => i === 0 || v !== a[i - 1]).slice(0, 4)).toEqual([0, 2, 4, 7]);
    expect(MOTIF[MOTIF.length - 1][3]).toBe(1);
  });
  it('map theme 32 bars, story theme 16 bars, one harmonic root per bar', () => {
    expect(beatsOf(MAP_THEME.melody)).toBe(32 * 4); expect(MAP_THEME.roots).toHaveLength(32);
    expect(beatsOf(STORY_THEME.melody)).toBe(16 * 4); expect(STORY_THEME.roots).toHaveLength(16);
  });
  it('every pitch (melody, roots, arpeggios, stingers) is in the pentatonic', () => {
    const all = [...MAP_THEME.melody, ...STORY_THEME.melody, ...Object.values(STINGERS).flatMap((s) => s.notes)].map((n) => n[0]);
    expect(all.filter((m) => !inMode(m))).toEqual([]);
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) { const a = arrangement(seed); for (const r of [...MAP_THEME.roots, ...STORY_THEME.roots]) for (const d of [...a.pattern, 5]) expect(inMode(degUp(r, d))).toBe(true); }
  });
  it('stingers last 1–3 s', () => {
    for (const [id, s] of Object.entries(STINGERS)) { const sec = (beatsOf(s.notes) * 60) / s.bpm; expect(sec, id).toBeGreaterThanOrEqual(0.9); expect(sec, id).toBeLessThanOrEqual(3); }
  });
  it('arrangement is a pure function of the seed', () => { expect(arrangement(42)).toEqual(arrangement(42)); });
});
