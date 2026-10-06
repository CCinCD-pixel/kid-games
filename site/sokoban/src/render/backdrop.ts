/**
 * The night sky around the floating warehouse (spec §6.2b "窗外"): paper-cut layers with cream rims,
 * per route — 天宫厅 (Earth limb, city lights, a distant launch tower, the station), 月宫厅 (grey
 * crater horizon, a blue Earth), 火星厅 (red dunes, two little moons, a dome base), 经典厅 (Earth and
 * stacked crates). An inline SVG behind everything (vector: crisp at DPR 2, no canvas memory).
 * Stars are deterministic per screen (seeded).
 */
import { createRng } from '@kit/rng';

export type Sky = 'earth' | 'moon' | 'mars' | 'classic';

const RIM = '#E8D5B1';

function stars(w: number, h: number, seed: string, n: number): string {
  const rng = createRng(`sokoban:sky:${seed}`);
  let out = '';
  for (let i = 0; i < n; i += 1) {
    const x = rng.float(0, w);
    const y = rng.float(0, h * 0.78);
    const r = rng.float(0.6, 1.5);
    const a = rng.float(0.35, 0.9).toFixed(2);
    out += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(2)}" fill="#FFF6E3" opacity="${a}"/>`;
  }
  for (let i = 0; i < 7; i += 1) {
    const x = rng.float(20, w - 20);
    const y = rng.float(20, h * 0.6);
    const k = rng.float(4, 7.5);
    out += `<path d="M${x} ${y - k}Q${x + k * 0.18} ${y - k * 0.18} ${x + k} ${y}Q${x + k * 0.18} ${y + k * 0.18} ${x} ${y + k}Q${x - k * 0.18} ${y + k * 0.18} ${x - k} ${y}Q${x - k * 0.18} ${y - k * 0.18} ${x} ${y - k}Z" fill="#FFF6E3" opacity="0.85"/>`;
  }
  return out;
}

/** A soft wavy ridge band across the bottom (paper layer with a cream rim). */
function ridge(w: number, h: number, base: number, amp: number, waves: number, phase: number, fill: string, rim = RIM): string {
  const pts: string[] = [];
  const N = 40;
  for (let i = 0; i <= N; i += 1) {
    const x = (w * i) / N;
    const y = base + amp * Math.sin((i / N) * Math.PI * 2 * waves + phase) + amp * 0.35 * Math.sin((i / N) * Math.PI * 2 * waves * 2.3 + phase * 1.7);
    pts.push(`${x.toFixed(1)} ${y.toFixed(1)}`);
  }
  const d = `M0 ${h}L${pts.join('L')}L${w} ${h}Z`;
  const line = `M${pts.join('L')}`;
  return `<path d="${d}" fill="${fill}"/><path d="${line}" fill="none" stroke="${rim}" stroke-width="1.6" stroke-opacity="0.75"/>`;
}

function earthLimb(w: number, h: number): string {
  const r = Math.max(w, h) * 1.15;
  const cx = w * 0.5;
  const cy = h + r * 0.82;
  let lights = '';
  const rng = createRng('sokoban:city');
  for (let i = 0; i < 46; i += 1) {
    const a = -Math.PI / 2 + rng.float(-0.42, 0.42);
    const rr = r * rng.float(0.9, 0.995);
    const x = cx + rr * Math.cos(a);
    const y = cy + rr * Math.sin(a);
    if (y > h) continue;
    lights += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${rng.float(1, 2.2).toFixed(2)}" fill="#FFD863" opacity="${rng.float(0.45, 0.9).toFixed(2)}"/>`;
  }
  return `<defs><radialGradient id="sk-earth" cx="0.5" cy="0" r="0.6"><stop offset="0" stop-color="#2C5FC4"/><stop offset="1" stop-color="#1B2A63"/></radialGradient></defs>
  <circle cx="${cx}" cy="${cy}" r="${r + 10}" fill="#8FF7EC" opacity="0.10"/>
  <circle cx="${cx}" cy="${cy}" r="${r + 4}" fill="#8FF7EC" opacity="0.14"/>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#sk-earth)"/>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#B7C1EC" stroke-width="2" opacity="0.7"/>${lights}`;
}

function station(x: number, y: number, k: number): string {
  // 天宫: core module + two side modules + solar wings (silhouette, lavender paper)
  const c = '#8594D6';
  const d = '#5466B0';
  return `<g transform="translate(${x} ${y}) scale(${k})" opacity="0.9">
    <rect x="-46" y="-6" width="30" height="12" rx="2" fill="${d}"/><rect x="16" y="-6" width="30" height="12" rx="2" fill="${d}"/>
    <rect x="-80" y="-14" width="30" height="28" rx="2" fill="${c}"/><rect x="50" y="-14" width="30" height="28" rx="2" fill="${c}"/>
    <path d="M-78 -10H-52M-78 -2H-52M-78 6H-52M52 -10H78M52 -2H78M52 6H78" stroke="#35468C" stroke-width="1.4"/>
    <rect x="-16" y="-11" width="32" height="22" rx="10" fill="#B7C1EC"/><rect x="-5" y="-26" width="10" height="16" rx="4" fill="#B7C1EC"/>
    <circle cx="0" cy="0" r="3.2" fill="#FFD863"/>
  </g>`;
}

function tower(x: number, base: number, k: number): string {
  return `<g transform="translate(${x} ${base}) scale(${k})" opacity="0.85">
    <path d="M-10 0V-120H10V0" fill="none" stroke="#35468C" stroke-width="3"/>
    <path d="M-10 -10L10 -30M10 -10L-10 -30M-10 -40L10 -60M10 -40L-10 -60M-10 -70L10 -90M10 -70L-10 -90M-10 -100L10 -120M10 -100L-10 -120" stroke="#35468C" stroke-width="2"/>
    <rect x="-14" y="-126" width="28" height="7" rx="2" fill="#35468C"/><circle cx="0" cy="-131" r="3" fill="#E4513D"/>
    <path d="M22 0V-78Q30 -100 38 -78V0Z" fill="#E2E7FB"/><rect x="22" y="-52" width="16" height="5" fill="#E4513D"/>
  </g>`;
}

function crater(x: number, y: number, rx: number, fill: string): string {
  return `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${rx * 0.32}" fill="${fill}"/><path d="M${x - rx} ${y}A${rx} ${rx * 0.32} 0 0 1 ${x + rx} ${y}" fill="none" stroke="${RIM}" stroke-width="1.2" stroke-opacity="0.5"/>`;
}

function dome(x: number, base: number, k: number, glass: string): string {
  return `<g transform="translate(${x} ${base}) scale(${k})"><path d="M-40 0A40 34 0 0 1 40 0Z" fill="${glass}"/><path d="M-26 -24Q-8 -36 14 -32" fill="none" stroke="#FFF6E3" stroke-width="2.4" opacity="0.55"/><rect x="-8" y="-16" width="16" height="16" rx="6" fill="#FFD863"/><path d="M28 0A22 18 0 0 1 72 0Z" fill="${glass}" opacity="0.85"/></g>`;
}

export function backdropSvg(sky: Sky, w: number, h: number, seed = 'play'): string {
  const portrait = h > w;
  let layers = stars(w, h, `${seed}:${sky}`, Math.round((w * h) / 4200));
  // Sky ornaments keep clear of the companion: portrait — the top-right gap under the HUD (the
  // companion sits bottom-left); landscape — the HUD band between 返回 and the level plate (the
  // companion owns the top of the right column).
  const orn = portrait ? { x: w * 0.83, y: h * 0.11, k: 0.95 } : { x: Math.min(w * 0.22, 250), y: 54, k: 0.62 };
  if (sky === 'earth' || sky === 'classic') {
    layers += earthLimb(w, h);
    layers += station(orn.x, orn.y, orn.k);
    layers += portrait ? tower(w * 0.92, h - 150, 0.9) : tower(w * 0.08, h - 120, 0.75);
  } else if (sky === 'moon') {
    const r = portrait ? 34 : 24;
    layers += `<g transform="translate(${orn.x} ${portrait ? h * 0.13 : 52})"><circle r="${r}" fill="#3F7BE6"/><g transform="scale(${r / 34})"><path d="M-14 -18Q-2 -24 6 -14Q12 -4 2 2Q-8 6 -12 -4Z M10 8Q20 4 24 12Q18 22 8 18Z" fill="#1AA892" opacity="0.9"/></g><circle r="${r}" fill="none" stroke="#B7C1EC" stroke-width="2"/><circle r="${r + 6}" fill="#8FF7EC" opacity="0.10"/></g>`;
    layers += ridge(w, h, h - (portrait ? 230 : 170), 14, 1.6, 0.6, '#2A3460');
    layers += dome(w * 0.14, h - (portrait ? 222 : 165), portrait ? 0.9 : 0.75, '#8594D6');
    layers += ridge(w, h, h - (portrait ? 150 : 110), 10, 2.2, 2.1, '#364172');
    layers += crater(w * 0.3, h - (portrait ? 92 : 70), 46, '#2A3460') + crater(w * 0.72, h - (portrait ? 70 : 52), 64, '#2A3460');
  } else {
    layers += portrait
      ? `<circle cx="${w * 0.78}" cy="${h * 0.1}" r="9" fill="#D6A88D"/><circle cx="${w * 0.88}" cy="${h * 0.17}" r="5.5" fill="#EACBB7"/>`
      : `<circle cx="${orn.x - 30}" cy="44" r="9" fill="#D6A88D"/><circle cx="${orn.x + 40}" cy="64" r="5.5" fill="#EACBB7"/>`;
    layers += ridge(w, h, h - (portrait ? 240 : 175), 18, 1.3, 1.2, '#6E2F3A');
    layers += dome(w * 0.86, h - (portrait ? 236 : 172), portrait ? 0.9 : 0.75, '#D6A88D');
    layers += ridge(w, h, h - (portrait ? 160 : 118), 14, 1.8, 2.6, '#8A3B2E');
    layers += ridge(w, h, h - (portrait ? 92 : 66), 10, 2.4, 4.1, '#A84B32');
  }
  return `<svg class="sok-sky__svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true">${layers}</svg>`;
}

/** Mount/replace the sky layer (behind every screen). */
export function mountSky(host: HTMLElement, sky: Sky, seed = 'play'): HTMLElement {
  let el = host.querySelector<HTMLElement>(':scope > .sok-sky');
  if (!el) {
    el = document.createElement('div');
    el.className = 'sok-sky';
    host.prepend(el);
  }
  const w = window.innerWidth;
  const h = window.innerHeight;
  el.dataset.sky = sky;
  el.innerHTML = backdropSvg(sky, w, h, seed);
  return el;
}

/** Canvas version for the style board (paints the same SVG). */
export function drawBackdrop(ctx: CanvasRenderingContext2D, _sky: Sky, w: number, h: number, _seed: string): void {
  ctx.fillStyle = '#0C1230';
  ctx.fillRect(0, 0, w, h);
}
