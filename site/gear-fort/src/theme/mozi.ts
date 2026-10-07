// 主题包「墨子·九攻九距」: the only place where kernel ids meet names, colours and line ids (spec §8.2).
// Re-skinning the game = replacing this file + src/art/* + lines.json; the kernel, levels and bots stay.
import { LINES } from '../content';
import type { Cause } from '../lane/failcause';
import type { CoachLine } from '../lane/coach';
import type { SimState } from '../lane/types';
import { TPS } from '../lane/rules';

/** sand-table palette (spec §6.1) */
export const PAL = {
  sandHi: '#E8D3A6', sandLo: '#D9BC85', fieldA: '#C9D88B', fieldB: '#B9CB76',
  woodHi: '#E2B77A', woodMid: '#C08A52', woodLo: '#8A5A35', ink: '#2B2622',
  teal: '#3E8E7E', lacRed: '#C8372D', lacBlack: '#231815', gold: '#C9A23A',
  bronze: '#B0803A', verdigris: '#4F8A7B', fire1: '#FFB347', fire2: '#FF6A2B', smoke: '#8E8A86',
  outline: '#2A1B12', table: '#5B3A22', tableHi: '#7A4F2E',
} as const;
/** feedback colours (V15: ΔE2000 ≥ 15 from the sand/fields, ≥ 12 from wood/bronze, ≥ 8 under deuteranopia) */
export const FB = { grain: '#FFDD00', ok: '#2EC4B6', mark: '#E0115F' } as const;
export const rgba = (hex: string, a: number): string => `rgba(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(',')},${a})`;

const has = (id: string): boolean => !!LINES[id];
const first = (...ids: string[]): string | null => ids.find(has) ?? null;

/** coach line → spoken line id (the kernel gives type / card / kind only) */
export function coachLineId(l: CoachLine): string | null {
  switch (l.type) {
    case 'lane': return first(`fort.coach.lane.${l.card}`, 'fort.coach.lane.shooter');
    case 'counter': return first(`fort.coach.counter.${l.kind}`);
    case 'flag': return 'fort.coach.flag';
    case 'econ': return 'fort.coach.econ';
    case 'night': return first('fort.coach.night');
    case 'boss': {
      const k = l.key.split(':')[1];
      const m: Record<string, string> = { shell: l.swap ? 'fort.coach.boss.swap' : 'fort.coach.boss.shell', charge: 'fort.coach.boss.charge', owl: 'fort.coach.boss.owlhigh', owldown: 'fort.coach.boss.owldown', swoop: 'fort.coach.boss.owlswoop' };
      return first(m[k] ?? '');
    }
    default: return null;
  }
}
/** 败因 → { cause line, tip line } (fort.fail.<id>[.<lane 1-5>|.<kind>], fort.tip.<tip>); `repeat` = how many times this
 *  same cause was already told on this level: the tip then changes (fort.tip.<tip>.2, fort.tip.alt.<kind>) so a third
 *  loss does not hear the same two sentences again */
export function causeLines(c: Cause, repeat = 0): { cause: string | null; tip: string | null } {
  const lane = (c.lane ?? 0) + 1;
  const cause = first(`fort.fail.${c.id}.${lane}`, `fort.fail.${c.id}.${c.kind}`, `fort.fail.${c.id}.${c.card}`, `fort.fail.${c.id}`, 'fort.fail.generic');
  const base = c.tip ? first(`fort.tip.${c.tip}`) : null;
  const alts = [c.tip ? `fort.tip.${c.tip}.2` : '', c.kind ? `fort.tip.alt.${c.kind}` : ''].filter(has);
  const tip = repeat > 0 && alts.length ? alts[(repeat - 1) % alts.length] : base ?? (alts[0] || null);
  return { cause, tip };
}
const DAMAGE = new Set(['shooter', 'lobber', 'burner', 'beam', 'radial', 'strike']);
/** 复盘 ③ 做得好的一件事 (spec §5.3): process praise with its counterfactual. Every line that holds for this run is a
 *  candidate, best first (econ > the strongest counter > any counter; waves held / 檑木 only when none holds); the n-th loss in a row on the
 *  level takes the n-th candidate, so three losses never hear the same generic line three times (QA r2) */
export function goodLines(S: SimState, held: number, nth = 0): { id: string; vars: Record<string, number> }[] {
  const evs = S.ev || []; const f1 = S.flags?.[0] ?? S.tick; const night = !!S.L.env?.night;
  const out: { id: string; vars: Record<string, number> }[][] = [];
  const farms = evs.filter((e) => e.type === 'place' && e.card === 'farm' && (e.tick ?? 0) <= f1);
  if (farms.length >= 1 && (farms[0].tick ?? 0) <= 30 * TPS) { // planted early: what 20 s later would have cost by the first 大波
    const rate = (night ? 10 : 20) / 18; const g = Math.round(farms.reduce((a, e) => a + Math.min(20, Math.max(0, f1 - (e.tick ?? 0)) / TPS) * rate, 0) / 5) * 5;
    if (g >= 10) out.push([{ id: 'fort.good.econ', vars: { t: Math.max(1, Math.round((farms[0].tick ?? 0) / TPS)), n: farms.length } }, { id: 'fort.good.econ.2', vars: { g } }]);
  }
  const by: Record<string, Set<number>> = {};
  for (const e of evs) if (e.type === 'counter' && e.card && e.id != null && (!DAMAGE.has(e.card) || e.kill)) (by[e.card] ||= new Set()).add(e.id);
  const ranked = Object.entries(by).filter(([c]) => has(`fort.good.counter.${c}`)).sort((a, b) => b[1].size - a[1].size);
  const strong = ranked.filter(([c, s]) => s.size >= (DAMAGE.has(c) ? 2 : 1));
  for (const [c, s0] of [...strong, ...ranked.filter((x) => !strong.includes(x))].slice(0, 2)) out.push([{ id: `fort.good.counter.${c}`, vars: { n: s0.size } }]);
  // the generic praise (waves held / 檑木) only when nothing concrete was done well, and never for an empty board (QA r3)
  if (!out.length && evs.some((e) => e.type === 'place')) {
    if (held > 0) out.push([{ id: 'fort.good.hold', vars: { k: held } }]);
    if ((S.stats.logsUsed || 0) > 0) out.push([{ id: 'fort.good.log', vars: {} }]);
  }
  return out.length ? out[Math.max(0, nth) % out.length] : [];
}
export const lineText = (id: string | null, vars: Record<string, string | number> = {}): string =>
  id && LINES[id] ? LINES[id].text.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? '')) : '';
