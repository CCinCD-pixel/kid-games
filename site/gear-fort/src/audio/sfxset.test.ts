// spec §8.6: synthesized audio buffers ≤ 6 MB at any time — the common sound set + one level's own sounds + the music
// instruments, for every level of the v1 campaign and every 锦囊 drill deck (QA r3 tech minor: it was 7.9 MB).
import { describe, expect, it } from 'vitest';
import { RECIPES, renderSfx, renderInst, type Inst } from './synth';
import { commonSfx, levelSfx, halfRate, HALF, ONLY, SFX_BUDGET } from './sfxset';
import { LEVELS, ORDER } from '../content';

const bytes = (id: string): number => { const d = renderSfx(id); return (HALF.has(id) && !RECIPES[id].loop ? halfRate(d).length : d.length) * 4; };
const inst = (['qin', 'qinHi', 'xun', 'bell', 'drum'] as Inst[]).reduce((a, k) => a + renderInst(k).length * 4, 0);
const ids = Object.keys(RECIPES);
const size = new Map(ids.map((id) => [id, bytes(id)]));
describe('audio buffer budget', () => {
  it('every gated id is a real recipe', () => { for (const id of Object.values(ONLY).flat()) expect(RECIPES[id], id).toBeTruthy(); });
  it('common + level + instruments ≤ 6 MB for every level', () => {
    const common = commonSfx(ids).reduce((a, id) => a + size.get(id)!, 0);
    let worst = 0, at = '';
    for (const id of ORDER) {
      const L = LEVELS[id]; const lv = levelSfx(L as never, L.pool ?? L.loadout).filter((x) => !commonSfx(ids).includes(x));
      const tot = common + lv.reduce((a, x) => a + size.get(x)!, 0) + inst;
      if (tot > worst) { worst = tot; at = id; }
    }
    console.log(`audio budget: worst ${(worst / 1048576).toFixed(2)} MB at ${at} (common ${(common / 1048576).toFixed(2)}, instruments ${(inst / 1048576).toFixed(2)})`);
    expect(worst).toBeLessThanOrEqual(SFX_BUDGET);
  });
  it('half-rate copies keep the level (peak within 1.5 dB)', () => {
    for (const id of HALF) { const d = renderSfx(id); const h = halfRate(d); const pk = (x: Float32Array): number => x.reduce((m, v) => Math.max(m, Math.abs(v)), 0); expect(Math.abs(20 * Math.log10(pk(h) / pk(d))), id).toBeLessThan(1.5); }
  });
});
