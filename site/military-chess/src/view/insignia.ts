/**
 * 小步步's shoulder boards (spec §6.6): 9 abstract ranks — olive board, gold edge; 工兵 = shovel,
 * 排/连/营 = 1/2/3 gold bars, 团/旅/师/军 = 1/2/3/4 gold stars, 司令 = wreath around a big star.
 * Abstract design; copies no real insignia.
 */
import { iconPaths } from './icons';

export const RANK_NAMES = ['工兵', '排长', '连长', '营长', '团长', '旅长', '师长', '军长', '司令'];

const STAR = 'M0 -9l2.6 5.6 6.1.8-4.5 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6-4.5-4.2 6.1-.8z';

export function insignia(rank: number, w = 96): string {
  const h = Math.round(w * 0.62);
  const r = Math.max(0, Math.min(8, rank));
  let marks = '';
  if (r === 0) marks = `<g transform="translate(36 13) scale(1.05)" color="#f6c548">${iconPaths('shovel')}</g>`;
  else if (r <= 3) {
    for (let k = 0; k < r; k++) marks += `<rect x="${30 + k * 13}" y="15" width="8" height="30" rx="2" fill="url(#mc-ins-gold)" stroke="#8a5a00" stroke-width=".8"/>`;
  } else if (r <= 7) {
    const n = r - 3;
    const xs = n === 1 ? [52] : n === 2 ? [42, 62] : n === 3 ? [34, 52, 70] : [30, 45, 60, 75];
    for (const x of xs) marks += `<path d="${STAR}" transform="translate(${x} 30) scale(${n === 4 ? 0.95 : 1.1})" fill="url(#mc-ins-gold)" stroke="#8a5a00" stroke-width=".7"/>`;
  } else {
    marks = `<path d="${STAR}" transform="translate(52 30) scale(1.65)" fill="url(#mc-ins-gold)" stroke="#8a5a00" stroke-width=".6"/>`;
    for (let k = 0; k < 7; k++) {
      const a = Math.PI * (0.62 + k * 0.13);
      const b = Math.PI * (0.38 - k * 0.13);
      marks += `<ellipse cx="${52 + Math.cos(a) * 22}" cy="${31 + Math.sin(a) * 15}" rx="4.2" ry="2" transform="rotate(${(a * 180) / Math.PI + 90} ${52 + Math.cos(a) * 22} ${31 + Math.sin(a) * 15})" fill="#f6c548"/>`;
      marks += `<ellipse cx="${52 + Math.cos(b) * 22}" cy="${31 + Math.sin(b) * 15}" rx="4.2" ry="2" transform="rotate(${(b * 180) / Math.PI + 90} ${52 + Math.cos(b) * 22} ${31 + Math.sin(b) * 15})" fill="#f6c548"/>`;
    }
  }
  return `<svg class="mc-insignia" viewBox="0 0 100 62" width="${w}" height="${h}" aria-hidden="true">
    <defs><linearGradient id="mc-ins-gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe7a3"/><stop offset="1" stop-color="#d9a21f"/></linearGradient>
    <linearGradient id="mc-ins-olive" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8d9a4a"/><stop offset="1" stop-color="#5f6b2a"/></linearGradient></defs>
    <path d="M6 10 H82 L96 31 L82 52 H6 Q2 52 2 48 V14 Q2 10 6 10Z" transform="translate(0 2)" fill="#2d2a14" opacity=".35"/>
    <path d="M6 8 H82 L96 29 L82 50 H6 Q2 50 2 46 V12 Q2 8 6 8Z" fill="url(#mc-ins-olive)" stroke="#f6c548" stroke-width="2.4"/>
    <path d="M8 12 H80 L92 29" fill="none" stroke="#fff" stroke-opacity=".25" stroke-width="1.5"/>
    <circle cx="86" cy="29" r="4.6" fill="url(#mc-ins-gold)" stroke="#8a5a00" stroke-width=".8"/>
    ${marks}
  </svg>`;
}
