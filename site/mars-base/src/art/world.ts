/**
 * The world behind the mission screen (QA fix-mars-r1 P6): a static paper-cut backdrop per zone in the screen margins, a zone emblem + progress pill in the header strip, and a
 * zone-tinted stage mat. NOTHING here moves and nothing is drawn inside the operating area's controls (spec Fisher rule: no decorative animation where the child works).
 */
import { buildingSvg, type SiteId } from './buildings';

export type WorldZone = 'orbit' | 'cert' | 'vault' | 'factory' | 'balance' | 'puzzle' | 'challenge';
const PAL: Record<WorldZone, [string, string, string]> = {
  orbit: ['#1d1636', '#5c3a68', '#e3865a'], cert: ['#20304f', '#3d5c86', '#9fc3e0'], vault: ['#2a1a2f', '#5a3358', '#c9708a'],
  factory: ['#2d2418', '#6b4a26', '#e9a24a'], balance: ['#1f2b3a', '#3b5a6c', '#8ec7c0'], puzzle: ['#261f45', '#52408c', '#b3a0f2'], challenge: ['#171c3d', '#41307a', '#f0a15e'],
};
export const ZONE_SITE: Record<WorldZone, SiteId> = { orbit: 'orbit', cert: 'cert', vault: 'vault', factory: 'factory', balance: 'balance', puzzle: 'puzzle', challenge: 'race' };
export const ZONE_LABEL: Record<WorldZone, string> = { orbit: '轨道站', cert: '徽章站', vault: '千晶大仓', factory: '生产线', balance: '称重台', puzzle: '谜题舱', challenge: '挑战订单' };

/** full-screen backdrop (preserveAspectRatio slice): sky/cave gradient, far silhouettes, a ground band; zone motifs sit low and to the sides */
export function worldSvg(zone: WorldZone, w: number, h: number): string {
  const [c0, c1, c2] = PAL[zone]; const g = h * 0.78;
  let motif = '';
  const ridge = (y: number, amp: number, k: number, fill: string, op: number) => { let d = `M0 ${h} L0 ${y}`; for (let i = 0; i <= 10; i++) d += ` L${(w * i) / 10} ${y - amp * (0.5 + 0.5 * Math.sin(k + i * 1.9))}`; return `<path d="${d} L${w} ${h}Z" fill="${fill}" opacity="${op}"/>`; };
  switch (zone) {
    case 'orbit': {
      let stars = ''; for (let i = 0; i < 34; i++) stars += `<circle cx="${((i * 97.3 + 21) % w).toFixed(0)}" cy="${((i * 41.7) % (g * 0.8)).toFixed(0)}" r="${(0.8 + (i % 3) * 0.6).toFixed(1)}" fill="#fff6e3" opacity="${(0.35 + (i % 4) * 0.15).toFixed(2)}"/>`;
      motif = `${stars}<circle cx="${w * 0.84}" cy="${h * 0.16}" r="${Math.min(w, h) * 0.07}" fill="#ffd9a0" opacity=".85"/><ellipse cx="${w * 0.5}" cy="${h * 0.5}" rx="${w * 0.62}" ry="${h * 0.3}" fill="none" stroke="#fff6e3" stroke-opacity=".12" stroke-width="3" stroke-dasharray="6 14"/>${ridge(g, h * 0.06, 0.8, '#6a3a4c', 0.9)}${ridge(g + h * 0.05, h * 0.04, 2.4, '#8a4a40', 0.95)}`;
      break;
    }
    case 'vault': {
      let gems = ''; for (let i = 0; i < 9; i++) { const x = (i + 0.5) * (w / 9), s = h * (0.05 + (i % 3) * 0.02); gems += `<path d="M${x} ${g - s * 2} l${s * 0.7} ${s * 2} l-${s * 1.4} 0z" fill="#ff8aa6" opacity="${i % 2 ? 0.35 : 0.5}"/>`; }
      motif = `${ridge(h * 0.34, h * 0.08, 1.1, '#3d2340', 0.9)}${gems}${ridge(g + h * 0.03, h * 0.05, 3.1, '#6a3a52', 0.95)}<path d="M${w * 0.08} 0 V${h * 0.2} M${w * 0.92} 0 V${h * 0.2}" stroke="#c9a7b8" stroke-opacity=".3" stroke-width="6"/>`;
      break;
    }
    case 'factory': {
      const gear = (cx: number, cy: number, r: number) => { let d = ''; for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; d += `<rect x="${cx - 4}" y="${cy - r - 9}" width="8" height="14" rx="2" transform="rotate(${(a * 180) / Math.PI} ${cx} ${cy})" fill="#e9a24a" opacity=".28"/>`; } return `${d}<circle cx="${cx}" cy="${cy}" r="${r}" fill="#e9a24a" opacity=".22"/><circle cx="${cx}" cy="${cy}" r="${r * 0.4}" fill="#2d2418" opacity=".5"/>`; };
      motif = `${gear(w * 0.1, h * 0.22, Math.min(w, h) * 0.06)}${gear(w * 0.92, h * 0.3, Math.min(w, h) * 0.05)}<rect x="0" y="${g}" width="${w}" height="${h * 0.05}" fill="#3a2a18" opacity=".8"/><path d="M0 ${g + h * 0.025} H${w}" stroke="#e9a24a" stroke-opacity=".5" stroke-width="5" stroke-dasharray="18 14"/>${ridge(g + h * 0.06, h * 0.03, 0.4, '#5a4020', 0.95)}`;
      break;
    }
    case 'cert': {
      motif = `<path d="M${w * 0.04} ${g} V${h * 0.3} Q${w * 0.04} ${h * 0.12} ${w * 0.18} ${h * 0.12} Q${w * 0.32} ${h * 0.12} ${w * 0.32} ${h * 0.3} V${g}" fill="none" stroke="#cfe6f6" stroke-opacity=".22" stroke-width="8"/><path d="M${w * 0.68} ${g} V${h * 0.3} Q${w * 0.68} ${h * 0.12} ${w * 0.82} ${h * 0.12} Q${w * 0.96} ${h * 0.12} ${w * 0.96} ${h * 0.3} V${g}" fill="none" stroke="#cfe6f6" stroke-opacity=".22" stroke-width="8"/><circle cx="${w * 0.5}" cy="${h * 0.12}" r="${Math.min(w, h) * 0.06}" fill="#f6b934" opacity=".6"/>${ridge(g + h * 0.04, h * 0.04, 1.7, '#2c4468', 0.95)}`;
      break;
    }
    case 'challenge': {
      let st = ''; const pts: [number, number][] = [[0.12, 0.2], [0.25, 0.12], [0.4, 0.22], [0.58, 0.1], [0.75, 0.2], [0.9, 0.12]];
      pts.forEach(([x, y], i) => { st += `<circle cx="${w * x}" cy="${h * y}" r="6" fill="#ffd36a" opacity=".7"/>`; if (i) st += `<path d="M${w * pts[i - 1][0]} ${h * pts[i - 1][1]} L${w * x} ${h * y}" stroke="#ffd36a" stroke-opacity=".3" stroke-width="2"/>`; });
      motif = `${st}${ridge(g, h * 0.07, 0.3, '#3a2a68', 0.9)}${ridge(g + h * 0.05, h * 0.04, 2.2, '#5a3f88', 0.95)}`;
      break;
    }
    default: motif = ridge(g, h * 0.06, 0.5, '#2a3d52', 0.9);
  }
  return `<svg class="mb-world" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><defs><linearGradient id="mbW" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c0}"/><stop offset=".62" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#mbW)"/>${motif}</svg>`;
}
/** the little header emblem: the zone's building at its first tier */
export const zoneEmblem = (zone: WorldZone): string => buildingSvg(ZONE_SITE[zone], 1);
