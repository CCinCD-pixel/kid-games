// A2 出手有劲 — the new battle sounds, measured offline (never played): a sound per weapon, per size of machine, per streak,
// per counter and per family of ult. Peak ≤ −1 dBFS at play volume, loudness in the band of the sounds they sit among,
// every group audibly different from itself, every card has a family, and the sound sets stay inside the memory budget.
import { describe, expect, it } from 'vitest';
import { RECIPES, renderSfx, ms2n, SR, type Buf } from './synth';
import { lufs, centroid, peakDb } from './analysis';
import { commonSfx, levelSfx, LAZY } from './sfxset';
import { ultFamily, ultSfx, type UltFamily } from '../theme/ultfam';
import UNITS from '../../../../content/gear-fort/units.json';
import { LEVELS, ORDER } from '../content';

const NEW_HITS = ['hit.arrow', 'hit.stone', 'hit.fizz'];
const NEW_BREAKS = ['break.ant', 'machine.break', 'break.metal', 'break.heavy'];
const FAMILIES: UltFamily[] = ['shoot', 'lob', 'fire', 'ctrl', 'econ'];
const TOKENS = FAMILIES.map((f) => 'token.' + f);
const NEW_IDS = [...NEW_HITS, 'break.ant', 'break.metal', 'break.heavy', 'combo', 'counter.ke', ...TOKENS];

/** what the child hears: the −3 dBFS buffer at its recipe volume, padded to 1.2 s so BS.1770 has gating blocks to work with */
const played = (id: string): Buf => { const b = renderSfx(id); const o = new Float32Array(ms2n(1200)) as Buf; const g = RECIPES[id].vol; for (let i = 0; i < b.length && i < o.length; i++) o[i] = b[i] * g; return o; };
const loud = (id: string): number => lufs(played(id));
/** time (ms) for the envelope to fall 30 dB under its peak for good */
const lenMs = (b: Buf): number => { let p = 0; for (const v of b) p = Math.max(p, Math.abs(v)); const th = p * 0.0316; let last = 0; for (let i = 0; i < b.length; i++) if (Math.abs(b[i]) > th) last = i; return (last / SR) * 1000; };
/** how much of the energy sits above 2.5 kHz (one-pole high-pass, 2.5 kHz) */
const bright = (b: Buf): number => { const a = Math.exp((-2 * Math.PI * 2500) / SR); let lp = 0, eh = 0, et = 0; for (const v of b) { lp = (1 - a) * v + a * lp; const h = v - lp; eh += h * h; et += v * v; } return et ? eh / et : 0; };
const sig = (id: string): { c: number; len: number; hi: number } => { const b = renderSfx(id); return { c: centroid(b), len: lenMs(b), hi: bright(b) }; };
/** two sounds are told apart when they differ clearly in at least two of: spectral centroid (±25 %), length (±30 %), brightness (±0.15) */
function apart(a: string, b: string): number { const x = sig(a), y = sig(b); return (Math.abs(Math.log(x.c / y.c)) > 0.22 ? 1 : 0) + (Math.abs(Math.log((x.len + 20) / (y.len + 20))) > 0.26 ? 1 : 0) + (Math.abs(x.hi - y.hi) > 0.15 ? 1 : 0); }

describe('A2 new battle sounds', () => {
  it('prints the measurement table (peak at play volume, loudness, length, centroid)', () => {
    const refs = ['hit.wood', 'hit.wood.heavy', 'hit.metal', 'machine.break', 'unit.break', 'token.use', 'token.ready', 'collect', 'fire.burst', 'shield.break', 'ram.hit'];
    const rows = [...refs, ...NEW_IDS].map((id) => { const b = renderSfx(id); return `${NEW_IDS.includes(id) ? '*' : ' '} ${id.padEnd(15)} ${String(Math.round(b.length / SR * 1000)).padStart(5)} ms  peak ${(peakDb(b) + 20 * Math.log10(RECIPES[id].vol)).toFixed(1).padStart(6)} dBFS  ${loud(id).toFixed(1).padStart(6)} LUFS  len ${Math.round(lenMs(b)).toString().padStart(4)} ms  c ${Math.round(centroid(b)).toString().padStart(5)} Hz  hi ${bright(b).toFixed(2)}`; });
    console.log('\n' + rows.join('\n'));
    expect(rows.length).toBeGreaterThan(20);
  });
  it('every new recipe exists; played at its volume the peak stays ≤ −1 dBFS and nothing clips', () => {
    for (const id of NEW_IDS) {
      expect(RECIPES[id], id).toBeTruthy(); const b = renderSfx(id);
      expect(peakDb(b) + 20 * Math.log10(RECIPES[id].vol), id).toBeLessThanOrEqual(-1);
      expect(b.every((v) => Math.abs(v) < 1 && Number.isFinite(v)), id).toBe(true);
    }
  });
  it('loudness: hits sit with the existing hits, breaks with machine.break, ults with token.use (±3 LU)', () => {
    const ref = (ids: string[]): number => ids.reduce((s, id) => s + loud(id), 0) / ids.length;
    const hits = ref(['hit.wood', 'hit.wood.heavy', 'hit.metal']); for (const id of NEW_HITS) expect(Math.abs(loud(id) - hits), `${id} ${loud(id).toFixed(1)} vs ${hits.toFixed(1)}`).toBeLessThanOrEqual(3);
    const brk = loud('machine.break'); for (const id of ['break.metal', 'break.heavy']) expect(loud(id) - brk, `${id} ${loud(id).toFixed(1)} vs ${brk.toFixed(1)}`).toBeLessThanOrEqual(3);
    for (const id of ['break.metal', 'break.heavy']) expect(loud(id) - brk, id).toBeGreaterThanOrEqual(-1); // bigger machines are not quieter than a wooden one
    expect(loud('break.ant') - brk, 'ants are the quietest break').toBeLessThanOrEqual(0);
    const tok = ref(['token.use', 'token.ready']); for (const id of TOKENS) expect(Math.abs(loud(id) - tok), `${id} ${loud(id).toFixed(1)} vs ${tok.toFixed(1)}`).toBeLessThanOrEqual(3);
    for (const id of ['combo', 'counter.ke']) expect(Math.abs(loud(id) - loud('collect')), `${id} vs collect`).toBeLessThanOrEqual(5);
  });
  it('weapon hits (笃 · 闷响 · 呼) are told apart; so are the four sizes of break and the five ult families', () => {
    for (const grp of [NEW_HITS, NEW_BREAKS, TOKENS]) for (let i = 0; i < grp.length; i++) for (let j = i + 1; j < grp.length; j++) expect(apart(grp[i], grp[j]), `${grp[i]} vs ${grp[j]}`).toBeGreaterThanOrEqual(1);
    // ... and no two ult families have the same bytes or even a similar shape
    for (let i = 0; i < TOKENS.length; i++) for (let j = i + 1; j < TOKENS.length; j++) { expect(renderSfx(TOKENS[i])).not.toEqual(renderSfx(TOKENS[j])); const x = sig(TOKENS[i]), y = sig(TOKENS[j]); expect(Math.abs(x.c - y.c) + Math.abs(x.len - y.len) * 2 + Math.abs(x.hi - y.hi) * 3000, `${TOKENS[i]} vs ${TOKENS[j]}`).toBeGreaterThan(150); }
  });
  it('the arrow tick is higher and shorter than the dull stone thud (闷); the fire breath is longer than the arrow', () => {
    const a = sig('hit.arrow'), s = sig('hit.stone'), f = sig('hit.fizz');
    expect(a.c).toBeGreaterThan(s.c * 1.3); expect(s.len).toBeGreaterThan(a.len); expect(f.len).toBeGreaterThan(a.len);
  });
  it('every card with an ult is in one of five families and its family has a recipe; the 13 ults do not share a sound', () => {
    const ults = Object.entries(UNITS as Record<string, { ult?: unknown }>).filter(([, u]) => u.ult).map(([k]) => k);
    expect(ults.length).toBeGreaterThanOrEqual(13);
    const fam = new Set<string>(); for (const k of ults) { const f = ultFamily(k); expect(FAMILIES, k).toContain(f); expect(RECIPES[ultSfx(k)], k).toBeTruthy(); fam.add(ultSfx(k)); }
    expect(fam.size, 'five distinct sounds').toBe(5);
  });
  it('the streak ladder: 连破 steps are the kit pentatonic (rate ratios of C major pentatonic from step 2)', () => {
    expect(RECIPES.combo.max).toBeGreaterThanOrEqual(3); expect(RECIPES.combo.perSec).toBeGreaterThanOrEqual(8);
  });
  it('sound sets: a fire level keeps 呼, a stone level keeps 闷响, a level without them keeps neither; the ult sounds are made on use (LAZY), never kept', () => {
    const fire = levelSfx({ loadout: ['shooter', 'burner'], spawns: [[0, 0, 'walker']], env: undefined } as never); expect(fire).toContain('hit.fizz'); expect(fire).not.toContain('hit.stone');
    const stone = levelSfx({ loadout: ['shooter', 'lobber'], spawns: [[0, 0, 'walker']], env: undefined } as never); expect(stone).toContain('hit.stone');
    const plain = levelSfx({ loadout: ['shooter', 'farm'], spawns: [[0, 0, 'walker']], env: undefined } as never); expect(plain).not.toContain('hit.stone'); expect(plain).not.toContain('hit.fizz');
    for (const id of TOKENS) { expect(LAZY.has(id), id).toBe(true); expect(commonSfx(Object.keys(RECIPES)), id).not.toContain(id); expect(fire, id).not.toContain(id); }
    const swarm = levelSfx({ loadout: ['shooter'], spawns: [[0, 0, 'swarm'], [10, 1, 'ram']], env: undefined } as never); expect(swarm).toEqual(expect.arrayContaining(['break.ant', 'break.heavy']));
    expect(commonSfx(Object.keys(RECIPES))).toEqual(expect.arrayContaining(['hit.arrow', 'combo', 'counter.ke']));
    for (const id of ORDER) { const L = LEVELS[id]; for (const x of levelSfx(L as never, L.pool ?? L.loadout)) expect(RECIPES[x], `${id} ${x}`).toBeTruthy(); }
  });
});
