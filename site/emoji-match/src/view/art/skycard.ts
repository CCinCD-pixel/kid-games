/**
 * Star-map cards (spec §4.7, §6.13): content/emoji-match/constellations.json → a 3:2 night card. Star
 * positions are the gnomonic projection stored in `xy` (north up, 0.1–0.9 box); a star is a four-point
 * sparkle sized by magnitude (−1.5 → 14 px … 4 → 4 px at the 480-unit card); figure lines are drawn
 * in order (CSS stroke-dash animation, 1.2 s); `pointer` guides are dashed (北斗 → 北极星 ×5,
 * 猎户腰带 → 天狼星); 牛郎织女 gets a procedural Milky Way band between the two stars.
 */
import { CONSTELLATIONS, type Constellation } from '../../content';
export { CONSTELLATIONS, type Constellation };

const VW = 480, VH = 320;
const radius = (mag: number) => Math.max(4, Math.min(14, 14 - ((mag + 1.5) * 10) / 5.5));
let n = 0;

export function constellationSvg(c: Constellation, o: { lit?: boolean; animate?: boolean } = {}): string {
  const id = `sc${(n += 1)}`;
  const lit = o.lit !== false;
  const P = (k: string) => { const [x, y] = c.xy[k]; return [20 + x * (VW - 40), 14 + y * (VH - 28)] as const; };
  let bg = '';
  // distant field stars (deterministic per card)
  let sd = c.id.split('').reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7) >>> 0;
  const rnd = () => { sd = (sd * 1664525 + 1013904223) >>> 0; return sd / 4294967296; };
  for (let k = 0; k < 46; k += 1) bg += `<circle cx="${(rnd() * VW).toFixed(1)}" cy="${(rnd() * VH).toFixed(1)}" r="${(0.5 + rnd() * 1.1).toFixed(2)}" fill="#cfd8ff" opacity="${(0.2 + rnd() * 0.45).toFixed(2)}"/>`;
  if (c.milkyWay) {
    const keys = Array.isArray(c.milkyWay) ? c.milkyWay : c.stars.map((s) => s.key);
    const xs = keys.map((k) => P(k)[0]);
    const mid = (Math.min(...xs) + Math.max(...xs)) / 2;
    let band = '';
    for (let k = 0; k < 90; k += 1) { const y = rnd() * VH, x = mid + (rnd() - 0.5) * 90 + Math.sin(y / 40) * 18; band += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(0.6 + rnd() * 1.6).toFixed(2)}" fill="#e8ecff" opacity="${(0.15 + rnd() * 0.4).toFixed(2)}"/>`; }
    bg += `<g filter="url(#${id}mw)"><path d="M${mid - 40} 0C${mid + 30} ${VH * 0.3} ${mid - 50} ${VH * 0.65} ${mid + 30} ${VH}L${mid + 80} ${VH}C${mid} ${VH * 0.65} ${mid + 80} ${VH * 0.3} ${mid + 10} 0Z" fill="#9aa8f0" opacity=".28"/></g>${band}`;
  }
  const total = c.lines.length;
  const lines = c.lines.map(([a, b], k) => {
    const [x1, y1] = P(a), [x2, y2] = P(b);
    const len = Math.hypot(x2 - x1, y2 - y1);
    const anim = o.animate ? ` style="stroke-dasharray:${len.toFixed(1)};stroke-dashoffset:${len.toFixed(1)};animation:em-draw ${(1.2 / total).toFixed(2)}s ${((k * 1.2) / total).toFixed(2)}s linear forwards"` : '';
    return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#d9e3ff" stroke-width="2" stroke-linecap="round" opacity="${lit ? 0.85 : 0.25}"${anim}/>`;
  }).join('');
  const pointers = (c.pointer ?? []).map(([a, b, t]) => {
    const [x1, y1] = P(a), [x2, y2] = P(b), [x3, y3] = P(t);
    return `<path d="M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}L${x3.toFixed(1)} ${y3.toFixed(1)}" fill="none" stroke="#ffe08a" stroke-width="2" stroke-dasharray="5 7" opacity="${lit ? 0.75 : 0.2}"${o.animate ? ' style="opacity:0;animation:em-fadein .6s 1.3s forwards"' : ''}/>`;
  }).join('');
  const hl = new Set(c.highlight ?? []);
  const stars = c.stars.map((s) => {
    const [x, y] = P(s.key), r = radius(s.mag) * (hl.has(s.key) ? 1.25 : 1);
    const q = r * 0.28;
    const spark = `<path d="M${x} ${y - r}L${x + q} ${y - q}L${x + r} ${y}L${x + q} ${y + q}L${x} ${y + r}L${x - q} ${y + q}L${x - r} ${y}L${x - q} ${y - q}Z" fill="${hl.has(s.key) ? '#ffe9a8' : '#ffffff'}"/>`;
    return `<g opacity="${lit ? 1 : 0.35}">${hl.has(s.key) || s.mag < 1 ? `<circle cx="${x}" cy="${y}" r="${(r * 1.6).toFixed(1)}" fill="${hl.has(s.key) ? '#ffd76a' : '#bcd0ff'}" opacity=".35" filter="url(#${id}g)"/>` : ''}${spark}</g>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VW} ${VH}" class="em-skycard"><defs>
      <radialGradient id="${id}bg" cx=".5" cy=".35" r=".9"><stop offset="0" stop-color="#1e2a66"/><stop offset="1" stop-color="#070b1f"/></radialGradient>
      <filter id="${id}g" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="4"/></filter>
      <filter id="${id}mw" x="-50%" y="-10%" width="200%" height="120%"><feGaussianBlur stdDeviation="14"/></filter></defs>
    <rect width="${VW}" height="${VH}" rx="22" fill="url(#${id}bg)"/>${bg}${pointers}${lines}${stars}</svg>`;
}

/** constellations lit by a star total (spec §4.7: deterministic, gates 15/30/45/60/75) */
export const litBy = (stars: number): Constellation[] => CONSTELLATIONS.filter((c) => stars >= c.gate);
