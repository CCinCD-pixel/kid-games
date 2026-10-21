// 星图站 art: the four instruments (sector nodes), the skyline whose four buildings grow with the card count, the aurora and the 星墙.
import { createRng } from '@kit/rng';
import { lineArt } from '../core/constellations';
import { CARDS } from '../core/cards';
import { starSprite, sparklePath } from './sprites';

/** instrument for one sector: `rings` = star-gates opened (0..3), shown as glowing rings around the dial */
export function instrumentSvg(sector: string, rings: number, locked = false): string {
  const ring = (i: number) => `<circle cx="50" cy="50" r="${43 + i * 3.6}" fill="none" stroke="${i < rings ? '#6fd3ea' : '#2a3a7a'}" stroke-width="${i < rings ? 2.4 : 1.6}" ${i < rings ? 'filter="url(#ig)"' : ''} opacity="${i < rings ? 1 : 0.7}"/>`;
  const sp = (x: number, y: number, R: number, f = '#ffd863') => `<path transform="translate(${x} ${y})" d="M0 ${-R}Q${R * 0.2} ${-R * 0.2} ${R} 0Q${R * 0.2} ${R * 0.2} 0 ${R}Q${-R * 0.2} ${R * 0.2} ${-R} 0Q${-R * 0.2} ${-R * 0.2} 0 ${-R}Z" fill="${f}"/>`;
  const icon: Record<string, string> = {
    s1: `<g fill="#4f63b4"><circle cx="38" cy="40" r="2.6"/><circle cx="62" cy="40" r="2.6"/><circle cx="38" cy="62" r="2.6"/></g>${sp(62, 62, 12)}${sp(34, 30, 5, '#a9d8ff')}`,
    s2: `<path d="M26 66L58 38" stroke="url(#ms)" stroke-width="5" stroke-linecap="round"/><path d="M22 74L46 54" stroke="#8fa6e8" stroke-opacity=".5" stroke-width="2.4" stroke-linecap="round"/>${sp(62, 34, 11)}<circle cx="34" cy="34" r="2" fill="#a9d8ff"/><circle cx="70" cy="62" r="2.4" fill="#4f63b4"/>`,
    s3: `<path d="M30 64V52Q30 36 50 36Q70 36 70 52V64Z" fill="#1f9fbd" stroke="#6fd3ea" stroke-width="2.4"/><path d="M44 64V55A6 6 0 0 1 56 55V64Z" fill="#0c1230"/><circle cx="50" cy="33" r="3.4" fill="#ffd863"/><ellipse cx="50" cy="68" rx="26" ry="4" fill="#17214f"/>`,
    s4: `<rect x="46" y="26" width="8" height="48" rx="3" fill="url(#mr)"/>${sp(30, 50, 10)}${sp(70, 50, 10, '#a9d8ff')}<path d="M40 50H60" stroke="#8fa6e8" stroke-width="1.6" stroke-dasharray="3 3"/>`,
  };
  return `<svg viewBox="-6 -6 112 112" aria-hidden="true">${[0, 1, 2].map(ring).join('')}<circle cx="50" cy="50" r="37" fill="url(#dial)" stroke="#4d63b8" stroke-width="2.4"/>${locked ? '<g opacity=".55"><rect x="38" y="46" width="24" height="18" rx="4" fill="#4f63b4"/><path d="M42 46V40A8 8 0 0 1 58 40V46" fill="none" stroke="#4f63b4" stroke-width="4"/></g>' : icon[sector]}</svg>`;
}

/** gradients / filter shared by the four instruments: one hidden <svg> instead of four copies (DOM budget, spec §10.1) */
export const INSTRUMENT_DEFS = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs><filter id="ig" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="1.4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter><linearGradient id="ms" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#ffe9a6" stop-opacity="0"/><stop offset="1" stop-color="#fff8dc"/></linearGradient><linearGradient id="mr" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8fa6e8"/><stop offset=".4" stop-color="#f0f5ff"/><stop offset="1" stop-color="#9fb2dd"/></linearGradient><radialGradient id="dial" cx=".4" cy=".3" r=".9"><stop offset="0" stop-color="#26347e"/><stop offset="1" stop-color="#0c1230"/></radialGradient></defs></svg>`;

/** the skyline: 4 buildings fade in as the card count passes 7 / 14 / 21 / 28 (1.8 s CSS transition, `data-on`) */
export function skylineSvg(built: number): string {
  const b = (i: number, body: string) => `<g class="mm-bld" data-on="${built > i ? 1 : 0}">${body}</g>`;
  return `<svg class="mm-skyline" viewBox="0 0 400 120" preserveAspectRatio="xMidYMax slice" aria-hidden="true"><defs><linearGradient id="hill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1c2a6e"/><stop offset="1" stop-color="#0a0f2b"/></linearGradient><linearGradient id="beam" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffe9a6" stop-opacity=".55"/><stop offset="1" stop-color="#ffe9a6" stop-opacity="0"/></linearGradient></defs>
  <path d="M0 120V92Q60 78 130 86T260 82T400 90V120Z" fill="url(#hill)"/><path d="M0 92Q60 78 130 86T260 82T400 90" fill="none" stroke="#3d4f9a" stroke-width="2"/>
  ${b(0, '<rect x="40" y="70" width="52" height="22" rx="3" fill="#25347a"/><path d="M44 70A22 22 0 0 1 88 70Z" fill="#3b56c9" stroke="#6d86ee" stroke-width="2"/><rect x="63" y="48" width="5" height="22" fill="#0c1230" opacity=".75"/><circle cx="66" cy="44" r="3" fill="#ffd863"/><rect x="50" y="78" width="8" height="8" rx="2" fill="#ffd863" opacity=".8"/>')}
  ${b(1, '<rect x="146" y="46" width="4" height="46" fill="#5870c6"/><ellipse cx="148" cy="46" rx="26" ry="9" fill="#9fb2dd" stroke="#e4e9ff" stroke-width="2" transform="rotate(-28 148 46)"/><circle cx="170" cy="34" r="3" fill="#ff6a3d"/><rect x="182" y="64" width="3" height="28" fill="#5870c6"/><ellipse cx="183" cy="64" rx="13" ry="5" fill="#9fb2dd" transform="rotate(-18 183 64)"/>')}
  ${b(2, '<path d="M262 92L268 46H282L288 92Z" fill="#e4e9ff" stroke="#8fa6e8" stroke-width="2"/><path d="M264 78H286L284 64H266ZM268 54H282L281 46H269Z" fill="#e0533d"/><rect x="266" y="36" width="16" height="10" rx="2" fill="#ffd863"/><path d="M274 41L400 8V74Z" fill="url(#beam)"/><path d="M262 36L274 26L286 36Z" fill="#3b56c9"/>')}
  </svg>`;
}
export function auroraSvg(on: boolean): string {
  return `<svg class="mm-aurora" data-on="${on ? 1 : 0}" viewBox="0 0 400 120" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="au1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5eead4" stop-opacity="0"/><stop offset=".5" stop-color="#5eead4" stop-opacity=".5"/><stop offset="1" stop-color="#8a73ee" stop-opacity="0"/></linearGradient></defs><path d="M0 70Q60 20 120 60T240 50T400 40V100Q300 80 220 96T0 100Z" fill="url(#au1)"/><path d="M0 90Q80 40 150 80T300 60T400 70V110Q310 90 230 104T0 110Z" fill="url(#au1)" opacity=".6"/></svg>`;
}

export interface Keep { x: number; y: number; w: number; h: number }
/** 28 wall slots for this viewport: deterministic (seeded by the size), spread by best-candidate sampling, never under a node, the title or the footer */
export function wallPositions(w: number, h: number, keeps: Keep[]): [number, number][] {
  const rng = createRng(`mm:wall:${Math.round(w)}x${Math.round(h)}`), pts: [number, number][] = [], pad = 18;
  const free = (x: number, y: number) => !keeps.some((k) => x > k.x - pad && x < k.x + k.w + pad && y > k.y - pad && y < k.y + k.h + pad);
  for (let i = 0; i < 28; i += 1) {
    let best: [number, number] | null = null, bd = -1;
    for (let c = 0; c < 80; c += 1) {
      const x = rng.float(22, w - 22), y = rng.float(22, h - 22); if (!free(x, y)) continue;
      const d = pts.length ? Math.min(...pts.map((q) => Math.hypot(q[0] - x, q[1] - y))) : 1e9; if (d > bd) { bd = d; best = [x, y]; }
    }
    pts.push(best ?? [rng.float(22, w - 22), 22 + (i % 7) * 4]);
  }
  return pts;
}
/** 星墙: 28 star slots; one lights per card; a constellation card also draws its line-work faintly beside its star */
export function drawWall(canvas: HTMLCanvasElement, w: number, h: number, earned: Set<string>, keeps: Keep[], t = 0): void {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
  const c = canvas.getContext('2d') as CanvasRenderingContext2D; c.scale(dpr, dpr); c.clearRect(0, 0, w, h);
  const order = CARDS.filter((x: { id: string }) => x.id !== 'vet') as { id: string; art: { fn: string; id?: string } }[];
  const wall = wallPositions(w, h, keeps), R = Math.max(7, Math.min(w, h) * 0.022);
  const star = starSprite(R, dpr, 'gold');
  order.forEach((card, i) => {
    const [x, y] = wall[i], on = earned.has(card.id);
    if (on) {
      if (card.art.fn === 'constellation' && card.art.id) {
        const la = lineArt(card.art.id), s = Math.min(w, h) * 0.12;
        c.save(); c.globalAlpha = 0.28; c.strokeStyle = '#fde6ad'; c.lineWidth = 1;
        for (const [a, b] of la.lines) { c.beginPath(); c.moveTo(x + (la.stars[a][0] - 0.5) * s, y + (la.stars[a][1] - 0.5) * s); c.lineTo(x + (la.stars[b][0] - 0.5) * s, y + (la.stars[b][1] - 0.5) * s); c.stroke(); }
        c.restore();
      }
      const s = (star.width / dpr) * (1 + 0.05 * Math.sin(t / 700 + i)); c.drawImage(star, x - s / 2, y - s / 2, s, s);
    } else { c.save(); c.translate(x, y); c.globalAlpha = 0.7; c.fillStyle = '#4f63b4'; sparklePath(c, R * 0.42, 0.3); c.fill(); c.restore(); }
  });
}
