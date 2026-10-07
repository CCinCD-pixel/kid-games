// V16 (spec §9.1): every sound-effect buffer = recipe length, peak −3 dBFS ±0.5, no NaN/Inf, tails don't click, loops
// are seamless, all synthesis in Node ≤60 ms, same seed → identical samples; hit.wood vs hit.metal spectral centroid
// ratio ≥1.5 ("梆" vs "叮"); the map theme rendered with the page's own samples/envelopes sits at −24 ±2 LUFS.
import { describe, expect, it } from 'vitest';
import { RECIPES, renderSfx, renderInst, renderNotes, ms2n, SR, type Inst } from './synth';
import { lufs, centroid, peakDb, rmsDb } from './analysis';
import { MAP_THEME, STORY_THEME, STINGERS, scoreOf, stingerScore, inMode } from './themes';
import { MUSIC_GAIN } from './music';

const IDS = Object.keys(RECIPES);
describe('V16 sound effects', () => {
  const bufs = new Map(IDS.map((id) => [id, renderSfx(id)]));
  it('covers the volume-1 events of the §7.1 table', () => {
    for (const id of ['place', 'place.spikes', 'place.pit', 'refund', 'shovel', 'shoot.crossbow', 'shoot.lobber', 'shoot.burner', 'fire.burst', 'beam.hum',
      'strike.whistle', 'strike.land', 'log.roll', 'yield.farm', 'yield.bank', 'collect', 'parts.fly', 'token.ready', 'token.use', 'hit.wood', 'hit.metal',
      'shield.crack', 'shield.break', 'machine.break', 'capture', 'unit.hurt', 'unit.break', 'ram.roll', 'ram.hit', 'ram.jam', 'ant.chitter', 'gate.knock',
      'flag.drum', 'boss.gong', 'boss.phase', 'rhino.stomp', 'rhino.crack', 'boss.fold', 'seal.stamp', 'newcomer', 'repair.knock']) expect(RECIPES[id], id).toBeTruthy();
  });
  it('length = recipe, peak −3 dBFS ±0.5, finite, no DC', () => {
    for (const [id, b] of bufs) {
      expect(b.length, id).toBe(ms2n(RECIPES[id].ms));
      expect(b.every(Number.isFinite), id).toBe(true);
      expect(Math.abs(peakDb(b) + 3), id).toBeLessThanOrEqual(0.5);
      let m = 0; for (const v of b) m += v; expect(Math.abs(m / b.length), id).toBeLessThan(0.02);
    }
  });
  it('one-shots end in silence (no click); loops wrap seamlessly', () => {
    for (const [id, b] of bufs) {
      if (RECIPES[id].loop) { const jump = Math.abs(b[0] - b[b.length - 1]); const step = Math.max(...Array.from({ length: 400 }, (_, i) => Math.abs(b[i + 1] - b[i]))); expect(jump, id).toBeLessThanOrEqual(step * 1.5 + 0.02); }
      else { expect(Math.abs(b[b.length - 1]), id).toBeLessThan(1e-3); expect(rmsDb(b, b.length - ms2n(3)), id).toBeLessThan(-30); }
    }
  });
  it('impacts speak at once (peak inside the first 40 ms)', () => {
    for (const id of ['place', 'hit.wood', 'hit.wood.heavy', 'hit.metal', 'unit.hurt', 'ram.hit', 'capture', 'log.crush', 'seal.stamp']) {
      const b = bufs.get(id)!; let at = 0; for (let i = 0; i < b.length; i++) if (Math.abs(b[i]) > Math.abs(b[at])) at = i;
      expect((at / SR) * 1000, id).toBeLessThan(40);
    }
  });
  it('deterministic: same recipe → identical samples', () => { for (const id of IDS) expect(renderSfx(id)).toEqual(bufs.get(id)); });
  it('material first: centroid(hit.metal) / centroid(hit.wood) ≥ 1.5', () => {
    const w = centroid(bufs.get('hit.wood')!), m = centroid(bufs.get('hit.metal')!);
    expect(m / w).toBeGreaterThanOrEqual(1.5);
    expect(centroid(bufs.get('hit.metal')!) / centroid(bufs.get('hit.wood.heavy')!)).toBeGreaterThanOrEqual(1.5);
  });
  it('synthesis budget: all effects + instruments in Node ≤60 ms (spec: ≤150 ms on A13)', () => {
    const run = (): number => { const t = performance.now(); for (const id of IDS) renderSfx(id); for (const k of ['qin', 'qinHi', 'xun', 'bell', 'drum'] as Inst[]) renderInst(k); return performance.now() - t; };
    run(); const best = Math.min(run(), run(), run());
    expect(best).toBeLessThanOrEqual(60);
  });
});

describe('V16 music', () => {
  it('every scored pitch is pentatonic and every note fits its theme', () => {
    for (const th of [MAP_THEME, STORY_THEME]) for (const seed of [1, 2, 3]) { const sc = scoreOf(th, seed); expect(sc.evs.every((e) => inMode(e.m)), th.id).toBe(true); expect(Math.max(...sc.evs.map((e) => e.t))).toBeLessThan(sc.len); }
    for (const id of Object.keys(STINGERS)) expect(stingerScore(id).evs.length, id).toBeGreaterThan(0);
  });
  it('map theme at the page gain = −24 ±2 LUFS; story theme within ±3; renders are finite and repeatable', () => {
    const inst: Partial<Record<Inst, Float32Array<ArrayBuffer>>> = {};
    const map = scoreOf(MAP_THEME, 1); const a = renderNotes(map.evs, map.len + 2.5, MUSIC_GAIN, inst);
    const L = lufs(a); expect(Math.abs(L + 24), `map ${L.toFixed(2)} LUFS`).toBeLessThanOrEqual(2);
    expect(a.every(Number.isFinite)).toBe(true); expect(peakDb(a)).toBeLessThan(-1);
    const st = scoreOf(STORY_THEME, 1); const b = renderNotes(st.evs, st.len + 2.5, MUSIC_GAIN, inst); const Ls = lufs(b);
    expect(Math.abs(Ls + 24), `story ${Ls.toFixed(2)} LUFS`).toBeLessThanOrEqual(3);
    expect(renderNotes(map.evs.slice(0, 40), 8, MUSIC_GAIN, inst)).toEqual(renderNotes(map.evs.slice(0, 40), 8, MUSIC_GAIN, inst));
  });
});
