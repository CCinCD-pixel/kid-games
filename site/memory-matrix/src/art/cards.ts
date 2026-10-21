// 星图册 card art: eight parametric functions cover all 29 cards (spec §8). Everything is generated from numbers (constellation art from the projected star
// catalogue coordinates, planets from a palette + feature flags) - nothing is hand-drawn, so a wrong star position cannot hide inside a picture.
import { CONSTELLATIONS, lineArt } from '../core/constellations';
import { createRng } from '@kit/rng';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Art = { fn: string; [k: string]: any };
const mix = (hex: string, to: number, k: number): string => { const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).map((c) => Math.round(c + (to - c) * k)); return `#${v.map((c) => c.toString(16).padStart(2, '0')).join('')}`; };
const sparkle = (x: number, y: number, R: number, rot = 0, fill = '#ffd863'): string => {
  const w = R * 0.2, d = `M0 ${-R}Q${w} ${-w} ${R} 0Q${w} ${w} 0 ${R}Q${-w} ${w} ${-R} 0Q${-w} ${-w} 0 ${-R}Z`;
  return `<g transform="translate(${x} ${y}) rotate(${rot})"><path d="${d}" fill="${fill}"/><circle r="${R * 0.14}" fill="#fff"/></g>`;
};
const glow = (x: number, y: number, r: number, c = '255,214,99', a = 0.55): string => `<circle cx="${x}" cy="${y}" r="${r}" fill="url(#gl${c.replace(/,/g, '')})" opacity="${a}"/>`;
const GLOWS = ['255,214,99', '140,200,255', '255,170,70'].map((c) => `<radialGradient id="gl${c.replace(/,/g, '')}"><stop offset="0" stop-color="rgb(${c})" stop-opacity=".9"/><stop offset="1" stop-color="rgb(${c})" stop-opacity="0"/></radialGradient>`).join('');

const ART: Record<string, (a: Art, id: string) => string> = {
  constellation: (a) => {
    const k = (CONSTELLATIONS as any)[a.id] ? lineArt(a.id) : null; if (!k) return '';
    const P = (i: number) => [k.stars[i][0] * 120, k.stars[i][1] * 120];
    const lines = k.lines.map(([i, j]: number[]) => { const [x1, y1] = P(i), [x2, y2] = P(j); return `<path d="M${x1} ${y1}L${x2} ${y2}" stroke="#fde6ad" stroke-opacity=".6" stroke-width="1.4" stroke-linecap="round"/>`; }).join('');
    const stars = k.stars.map((_: unknown, i: number) => { const [x, y] = P(i); return glow(x, y, 9) + sparkle(x, y, i % 3 === 0 ? 5.6 : 4.2); }).join('');
    return lines + stars;
  },
  planet: (a, id) => {
    const col = a.color as string, dark = mix(col, 0, 0.45), light = mix(col, 255, 0.45), R = 30, tilt = a.tilt ?? 0;
    const bands = a.bands ? Array.from({ length: a.bands }, (_, i) => { const y = 60 - R + ((i + 0.8) * 2 * R) / (a.bands + 1); return `<rect x="${60 - R}" y="${y - 2.2}" width="${2 * R}" height="${a.bands > 3 ? 3.4 : 4.6}" fill="${dark}" opacity="${0.35 + (i % 2) * 0.15}"/>`; }).join('') : '';
    const clouds = a.clouds ? '<ellipse cx="50" cy="48" rx="13" ry="4" fill="#fff" opacity=".7"/><ellipse cx="68" cy="62" rx="12" ry="3.6" fill="#fff" opacity=".6"/><ellipse cx="54" cy="72" rx="9" ry="3" fill="#fff" opacity=".55"/>' : '';
    const caps = a.caps ? `<ellipse cx="60" cy="33" rx="11" ry="4" fill="#fff" opacity=".85"/><ellipse cx="60" cy="88" rx="9" ry="3.4" fill="#fff" opacity=".75"/>` : '';
    const craters = a.craters ? Array.from({ length: a.craters }, (_, i) => `<circle cx="${42 + ((i * 17) % 34)}" cy="${42 + ((i * 23) % 36)}" r="${3 + (i % 3) * 1.4}" fill="${dark}" opacity=".45"/>`).join('') : '';
    const spot = a.spot ? '<ellipse cx="68" cy="68" rx="8" ry="5" fill="#d8573a" opacity=".85"/>' : '';
    const ring = a.ring ? (back: boolean) => `<path d="M${60 - 52} 60A52 13 0 0 ${back ? 1 : 0} ${60 + 52} 60" fill="none" stroke="${light}" stroke-width="5" opacity="${back ? 0.55 : 0.95}" transform="rotate(${tilt || -18} 60 60)"/>` : () => '';
    const spin = a.spin ? `<path d="M${a.spin > 0 ? 94 : 26} 28A44 44 0 0 ${a.spin > 0 ? 1 : 0} ${a.spin > 0 ? 96 : 24} 74" fill="none" stroke="#fde6ad" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="3 5"/><path d="M${a.spin > 0 ? 96 : 24} 74l-5 -7M${a.spin > 0 ? 96 : 24} 74l7 -2" stroke="#fde6ad" stroke-width="2.4" stroke-linecap="round"/>` : '';
    return `<defs><radialGradient id="pg${id}" cx=".34" cy=".3" r=".9"><stop offset="0" stop-color="${light}"/><stop offset=".55" stop-color="${col}"/><stop offset="1" stop-color="${dark}"/></radialGradient><clipPath id="pc${id}"><circle cx="60" cy="60" r="${R}"/></clipPath></defs>${ring(true)}<circle cx="60" cy="60" r="${R}" fill="url(#pg${id})"/><g clip-path="url(#pc${id})">${bands}${clouds}${caps}${craters}${spot}<circle cx="60" cy="60" r="${R}" fill="url(#sh${id})"/></g>${ring(false)}${spin}`;
  },
  star: (a) => {
    const pts: number[][] = a.count === 1 ? [[60, 60, 24]] : a.count === 2 ? [[34, 74, 14], [88, 40, 17]] : [[44, 48, 8], [62, 40, 7], [78, 54, 8], [54, 64, 7], [70, 74, 7], [40, 76, 6], [88, 76, 5]];
    const band = a.band ? '<path d="M8 100Q60 40 112 20" stroke="#8fa6e8" stroke-opacity=".28" stroke-width="22" fill="none" stroke-linecap="round"/><path d="M8 100Q60 40 112 20" stroke="#fff" stroke-opacity=".15" stroke-width="8" fill="none"/>' : '';
    return band + pts.map(([x, y, r]) => glow(x, y, r * 2.3) + sparkle(x, y, r, 0) + (a.rays === 8 ? sparkle(x, y, r * 0.78, 45, '#fff2b8') : '')).join('');
  },
  meteor: (a) => {
    const rng = createRng(`meteor:${a.count}:${a.radiant?.[0] ?? 0}`), [rx, ry] = [(a.radiant?.[0] ?? 0.2) * 120, (a.radiant?.[1] ?? 0.2) * 120];
    return Array.from({ length: a.count }, (_, i) => {
      const ang = (a.count === 1 ? 0.7 : 0.35 + (i / Math.max(1, a.count - 1)) * 0.8), len = a.count === 1 ? 70 : 38 + rng.float(0, 36), sx = a.count === 1 ? 24 : rx + rng.float(-6, 6), sy = a.count === 1 ? 26 : ry + rng.float(-6, 6);
      const dx = Math.cos(ang) * len, dy = Math.sin(ang) * len;
      return `<defs><linearGradient id="mt${i}" x1="${sx}" y1="${sy}" x2="${sx + dx}" y2="${sy + dy}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#ffe9a6" stop-opacity="0"/><stop offset="1" stop-color="#fff8dc"/></linearGradient></defs><path d="M${sx} ${sy}L${sx + dx} ${sy + dy}" stroke="url(#mt${i})" stroke-width="${a.count === 1 ? 5 : 3}" stroke-linecap="round"/>${glow(sx + dx, sy + dy, a.count === 1 ? 14 : 8)}<circle cx="${sx + dx}" cy="${sy + dy}" r="${a.count === 1 ? 4.4 : 2.6}" fill="#fff"/>`;
    }).join('') + (a.radiant ? `<circle cx="${rx}" cy="${ry}" r="2" fill="#8fd3ff"/>` : '');
  },
  comet: (a) => {
    const L = 40 + (a.tail ?? 0.5) * 60;
    return `<defs><linearGradient id="ct" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#e8f6ff" stop-opacity=".95"/><stop offset="1" stop-color="#8fd3ff" stop-opacity="0"/></linearGradient></defs><path d="M40 80Q${40 + L * 0.5} ${80 - L * 0.7} ${40 + L} ${80 - L * 0.95}L${40 + L - 14} ${80 - L * 0.95 + 16}Q${40 + L * 0.4} ${80 - L * 0.4} 46 88Z" fill="url(#ct)"/>${glow(40, 82, 22, '140,200,255')}<circle cx="40" cy="82" r="9" fill="#f2faff"/><circle cx="37" cy="79" r="3.4" fill="#fff"/>`;
  },
  mirror: (a) => {
    const hex = (cx: number, cy: number, r: number) => `<path d="${Array.from({ length: 6 }, (_, i) => `${i ? 'L' : 'M'}${cx + r * Math.cos(Math.PI / 6 + (i * Math.PI) / 3)} ${cy + r * Math.sin(Math.PI / 6 + (i * Math.PI) / 3)}`).join('')}Z" fill="url(#gold)" stroke="#9a6a14" stroke-width="1.2"/>`;
    const r = 11.4, W = r * Math.sqrt(3), cells: string[] = [];
    const ring = (n: number) => { const out: [number, number][] = []; const dirs = [[1, 0], [0.5, 0.866], [-0.5, 0.866], [-1, 0], [-0.5, -0.866], [0.5, -0.866]]; let q = [dirs[4][0] * n, dirs[4][1] * n]; for (let d = 0; d < 6; d += 1) for (let s = 0; s < n; s += 1) { out.push([q[0], q[1]]); q = [q[0] + dirs[d][0], q[1] + dirs[d][1]]; } return out; };
    for (const n of [1, 2]) for (const [x, y] of ring(n)) cells.push(hex(60 + x * W, 60 + y * W * 1.0, r));
    void a;
    return `<defs><linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe9a6"/><stop offset=".6" stop-color="#f6b934"/><stop offset="1" stop-color="#c88714"/></linearGradient></defs>${cells.join('')}`;
  },
  galaxy: (a) => {
    const rng = createRng('galaxy'), arms = a.arms ?? 2; let s = '';
    for (let k = 0; k < arms; k += 1) for (let i = 0; i < 70; i += 1) {
      const t = i / 70, ang = (k * 2 * Math.PI) / arms + t * 4.2, r = 6 + t * 48, x = 60 + Math.cos(ang) * r + rng.float(-3, 3), y = 60 + Math.sin(ang) * r * 0.62 + rng.float(-2.4, 2.4);
      s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(0.7 + (1 - t) * 1.6).toFixed(2)}" fill="${t < 0.4 ? '#ffe9a6' : '#a9d8ff'}" opacity="${(0.4 + (1 - t) * 0.6).toFixed(2)}"/>`;
    }
    return `${glow(60, 60, 26)}${s}<circle cx="60" cy="60" r="5" fill="#fff8dc"/>`;
  },
  steps: (a) => {
    const g = a.g ?? 4, pitch = 84 / g, lit = new Set([5, 9, 10, 14]);
    let s = '';
    for (let i = 0; i < g * g; i += 1) { const x = 18 + (i % g) * pitch + pitch / 2, y = 18 + Math.floor(i / g) * pitch + pitch / 2; s += lit.has(i) ? glow(x, y, 12) + sparkle(x, y, 8) : `<circle cx="${x}" cy="${y}" r="3" fill="#4f63b4"/>`; }
    return s;
  },
};
export function cardSvg(card: { id: string; art: Art }): string {
  const id = card.id.replace(/\W/g, ''), body = (ART[card.art.fn] ?? (() => ''))(card.art, id);
  const shade = `<radialGradient id="sh${id}" cx=".72" cy=".7" r=".9"><stop offset=".45" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#040618" stop-opacity=".62"/></radialGradient>`;
  const rng = createRng(`card:${card.id}`), specks = Array.from({ length: 16 }, () => `<circle cx="${rng.float(6, 114).toFixed(1)}" cy="${rng.float(6, 114).toFixed(1)}" r="${rng.float(0.5, 1.1).toFixed(2)}" fill="#dfe8ff" opacity="${rng.float(0.2, 0.6).toFixed(2)}"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120"><defs>${GLOWS}${shade}<linearGradient id="bg${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#16206a"/><stop offset="1" stop-color="#0a0f2b"/></linearGradient></defs><rect width="120" height="120" rx="16" fill="url(#bg${id})"/>${specks}${body}<rect x=".75" y=".75" width="118.5" height="118.5" rx="15.5" fill="none" stroke="#3d4f9a" stroke-width="1.5"/></svg>`;
}
const URI = new Map<string, string>();
/** card faces are rendered once as data-URI images (28 inline SVGs would blow the 400-node budget, spec §10.1) */
export function cardImage(card: { id: string; art: Art }): string {
  let u = URI.get(card.id); if (!u) { u = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(cardSvg(card))}`; URI.set(card.id, u); } return u;
}
export const MYSTERY_CARD = `data:image/svg+xml;charset=utf-8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" rx="16" fill="#0e1538"/><rect x=".75" y=".75" width="118.5" height="118.5" rx="15.5" fill="none" stroke="#2a3a7a" stroke-width="1.5" stroke-dasharray="4 5"/><path d="M60 38Q60 26 60 26Q72 26 72 38Q72 48 60 54V62" fill="none" stroke="#4f63b4" stroke-width="5" stroke-linecap="round"/><circle cx="60" cy="76" r="3.4" fill="#4f63b4"/></svg>')}`;
