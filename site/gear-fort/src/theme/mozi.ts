// 主题包「墨子·九攻九距」: the only place where kernel ids meet names, colours and line ids (spec §8.2).
// Re-skinning the game = replacing this file + src/art/* + lines.json; the kernel, levels and bots stay.
import { LINES } from '../content';
import type { Cause } from '../lane/failcause';
import type { CoachLine } from '../lane/coach';

/** sand-table palette (spec §6.1) */
export const PAL = {
  sandHi: '#E8D3A6', sandLo: '#D9BC85', fieldA: '#C9D88B', fieldB: '#B9CB76',
  woodHi: '#E2B77A', woodMid: '#C08A52', woodLo: '#8A5A35', ink: '#2B2622',
  teal: '#3E8E7E', lacRed: '#C8372D', lacBlack: '#231815', gold: '#C9A23A',
  bronze: '#B0803A', verdigris: '#4F8A7B', fire1: '#FFB347', fire2: '#FF6A2B', smoke: '#8E8A86',
  outline: '#2A1B12', table: '#5B3A22', tableHi: '#7A4F2E',
} as const;

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
/** 败因 → { cause line, tip line } (fort.fail.<id>[.<lane 1-5>|.<kind>], fort.tip.<tip>) */
export function causeLines(c: Cause): { cause: string | null; tip: string | null } {
  const lane = (c.lane ?? 0) + 1;
  const cause = first(`fort.fail.${c.id}.${lane}`, `fort.fail.${c.id}.${c.kind}`, `fort.fail.${c.id}.${c.card}`, `fort.fail.${c.id}`, 'fort.fail.generic');
  const tip = c.tip ? first(`fort.tip.${c.tip}`) : null;
  return { cause, tip };
}
export const lineText = (id: string | null, vars: Record<string, string | number> = {}): string =>
  id && LINES[id] ? LINES[id].text.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? '')) : '';
