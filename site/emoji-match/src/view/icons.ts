/** DOM icons for goal cards, the level card and the style board (same art as the board sprites). */
import { gemSvg } from './art/gems';
import { crateSvg, iceSvg, rocketSvg, bombSvg, orbSvg, propSvg } from './art/specials';
import type { Objective } from '../core/types';

export function dustSvg(layers = 1): string {
  let dots = '';
  let sd = 7 + layers;
  const r = () => { sd = (sd * 16807) % 2147483647; return sd / 2147483647; };
  for (let k = 0; k < (layers > 1 ? 16 : 9); k += 1) dots += `<circle cx="${18 + r() * 64}" cy="${18 + r() * 64}" r="${1.4 + r() * 2.2}" fill="#fff" opacity="${0.4 + r() * 0.5}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-8.15 -8.15 116.3 116.3"><rect x="8" y="8" width="84" height="84" rx="14" fill="${layers > 1 ? '#7E6FA3' : '#A99BC4'}" stroke="#fff" stroke-opacity=".35" stroke-width="2.5"/>${dots}
    <path d="M70 20l3 8 8 3-8 3-3 8-3-8-8-3 8-3z" fill="#fff"/></svg>`;
}
export function energySvg(frac = 0): string {
  const a = Math.max(0, Math.min(1, frac)) * Math.PI * 2;
  const x = 50 + 36 * Math.sin(a), y = 50 - 36 * Math.cos(a);
  const arc = frac >= 0.999 ? '<circle cx="50" cy="50" r="36" fill="none" stroke="#7FE38A" stroke-width="10"/>'
    : frac > 0 ? `<path d="M50 14A36 36 0 ${a > Math.PI ? 1 : 0} 1 ${x.toFixed(2)} ${y.toFixed(2)}" fill="none" stroke="#7FE38A" stroke-width="10" stroke-linecap="round"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="36" fill="none" stroke="rgba(255,255,255,.18)" stroke-width="10"/>${arc}
    <rect x="38" y="30" width="24" height="42" rx="5" fill="#f4f1ea"/><rect x="45" y="25" width="10" height="6" rx="2" fill="#f4f1ea"/>
    <path d="M52 36L42 54h8l-2 12 10-18h-8z" fill="#F6B934"/></svg>`;
}
export function objectiveIcon(o: Objective): string {
  switch (o.t) {
    case 'collect': return gemSvg(o.c);
    case 'dust': return dustSvg(1);
    case 'crate': return crateSvg(1);
    case 'ice': return `<span class="em-stack">${gemSvg(4)}${iceSvg(2)}</span>`;
    case 'energy': return energySvg(0);
    default: return gemSvg(0);
  }
}
export { gemSvg, crateSvg, iceSvg, rocketSvg, bombSvg, orbSvg, propSvg };

/** small special icons for the take-off assist row (spec §3.15: always visible, never hidden) */
export function miniIcon(kind: 'rh' | 'rv' | 'bomb' | 'orb'): string {
  const svg = kind === 'rh' ? rocketSvg(false) : kind === 'rv' ? rocketSvg(true) : kind === 'bomb' ? bombSvg(0) : orbSvg();
  return `<span class="em-mini">${svg}</span>`;
}
export function assistKinds(levelIndex: number, bombAt: number, orbAt: number, tier: number): ('rh' | 'rv' | 'bomb' | 'orb')[] {
  const knowsBomb = levelIndex >= bombAt, knowsOrb = levelIndex >= orbAt;
  return (['rh', knowsBomb ? 'bomb' : 'rv', knowsOrb ? 'orb' : knowsBomb ? 'bomb' : 'rh'] as const).slice(0, tier) as ('rh' | 'rv' | 'bomb' | 'orb')[];
}
