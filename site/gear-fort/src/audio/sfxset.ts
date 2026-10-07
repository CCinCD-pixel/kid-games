// Which sound effects a screen keeps in memory (spec §8.6: 音频缓冲 ≤ 6 MB, "只合成用到的音效"). Pure (no audio API),
// so the budget is checked in Node (sfxset.test.ts). The common set (UI, placing, hits, breaks, drums, tokens, 檑木 …)
// is warmed once; the card / machine / Boss / night sounds only for a level that has them. Anything else is still
// synthesized on first use (a story beat), so a gap here costs one small synth, never a missing sound.
import type { Level } from '../lane/types';

/** recipe ids that only some levels need, by card id, machine id, `boss:<type>` or `night` */
export const ONLY: Record<string, string[]> = {
  spikes: ['place.spikes'], pit: ['place.pit'], lobber: ['shoot.lobber'], burner: ['shoot.burner', 'fire.burst', 'hit.fizz'],
  beam: ['beam.hum', 'hit.fizz'], radial: ['radial.shoot'], strike: ['strike.whistle', 'strike.land'], farm: ['yield.farm'], bank: ['yield.bank'],
  gust: ['gust.blow'], hook: ['hook.swing'],
  ram: ['ram.roll', 'ram.hit', 'ram.jam'], ant: ['ant.chitter'], flyer: ['flyer.flap', 'flyer.peck', 'flyer.down'], flyer_m: ['flyer.flap', 'flyer.peck', 'flyer.down'],
  ladder: ['ladder.raise', 'ladder.down'], shielder: ['shield.crack', 'shield.break'], shielder_m: ['shield.crack', 'shield.break'], drummer: ['drum.beat'], smoker: ['smoke.puff'],
  'boss:rhino': ['rhino.stomp', 'rhino.crack', 'boss.gong', 'boss.phase', 'boss.fold', 'ram.roll', 'ram.hit', 'shield.crack', 'shield.break'],
  'boss:owl': ['owl.flap', 'owl.screech', 'boss.gong', 'boss.phase', 'boss.fold', 'flyer.flap', 'flyer.down', 'smoke.puff'],
  night: ['dawn'],
  // outside battles (repair scene, story beats): synthesized when first played, dropped again at the next battle
  scene: ['repair.knock', 'newcomer'],
};
/** low, dark sounds (spectral centroid < 600 Hz): kept at half the sample rate — nothing audible above 11 kHz is lost */
export const HALF = new Set(['boss.gong', 'boss.phase', 'flag.drum', 'rhino.stomp', 'log.roll', 'ladder.down', 'hit.wood.heavy', 'seal.stamp', 'drum.beat', 'gate.knock', 'capture', 'log.crush', 'strike.whistle']);
const GATED = new Set(Object.values(ONLY).flat());

/** the always-kept set: every recipe no group claims */
export function commonSfx(all: string[]): string[] { return all.filter((id) => !GATED.has(id)); }
/** the level's own sounds: its cards (fixed loadout, pool or belt), its machines and Boss, and the dawn of a night level */
export function levelSfx(L: Pick<Level, 'loadout' | 'pool' | 'belt' | 'spawns' | 'env'> & { boss?: { type: string } | null }, cards?: string[]): string[] {
  const tags = new Set<string>([...(cards ?? []), ...(L.loadout ?? []), ...(L.pool ?? []), ...(L.belt?.seq ?? [])]);
  for (const s of (L.spawns ?? []) as unknown[][]) if (typeof s[2] === 'string') tags.add(s[2] as string);
  if (L.boss?.type) tags.add('boss:' + L.boss.type);
  if (L.env?.night) tags.add('night');
  return [...new Set([...tags].flatMap((t) => ONLY[t] ?? []))];
}
/** 2:1 decimation behind a [¼ ½ ¼] low-pass (enough for sounds with nothing above a few kHz) */
export function halfRate(d: Float32Array): Float32Array<ArrayBuffer> {
  const n = d.length >> 1; const o = new Float32Array(n);
  for (let i = 0; i < n; i++) { const j = 2 * i; o[i] = 0.25 * (j > 0 ? d[j - 1] : d[j]) + 0.5 * d[j] + 0.25 * (j + 1 < d.length ? d[j + 1] : d[j]); }
  return o;
}
export const SFX_BUDGET = 6 * 1024 * 1024;
