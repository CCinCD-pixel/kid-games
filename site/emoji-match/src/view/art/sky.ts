/**
 * Paper-cut night scenes (spec §6.7), code-drawn SVG: route + episodes 1–4. Layered flat paper shapes
 * with soft drop shadows and moonlight edges. This is the SOURCE: tools/emoji-match/build-scenes.mjs
 * rasterises it to assets/bg/<scene>-{p,l}.webp, and the page shows those bitmaps (view/backdrop.ts);
 * after editing a scene, re-run the tool. The page imports only the SceneKey type from here.
 */
let sid = 0;
function rng(seed: number) { let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

function stars(w: number, h: number, n: number, seed: number, maxY = 1): string {
  const r = rng(seed); let out = '';
  for (let k = 0; k < n; k += 1) {
    const x = r() * w, y = r() * h * maxY, s = r();
    if (s > 0.93) out += `<path d="M${x} ${y - 5}L${x + 1.2} ${y - 1.2}L${x + 5} ${y}L${x + 1.2} ${y + 1.2}L${x} ${y + 5}L${x - 1.2} ${y + 1.2}L${x - 5} ${y}L${x - 1.2} ${y - 1.2}Z" fill="#FFF6DA" opacity="${0.6 + r() * 0.4}"/>`;
    else out += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(0.6 + s * 1.6).toFixed(2)}" fill="${s > 0.7 ? '#FFF1D0' : '#CFD8FF'}" opacity="${(0.35 + r() * 0.6).toFixed(2)}"/>`;
  }
  return out;
}
const paper = (id: string, dy = 6, blur = 5, op = 0.45) => `<filter id="${id}" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy="${dy}" stdDeviation="${blur}" flood-color="#02040f" flood-opacity="${op}"/></filter>`;

export type SceneKey = 'route' | 'ep1' | 'ep2' | 'ep3' | 'ep4';

/** viewBox 1620×2160 (portrait) or 2160×1620 (landscape); `slice` fills any aspect */
export function skySvg(key: SceneKey, landscape: boolean): string {
  const W = landscape ? 2160 : 1620, H = landscape ? 1620 : 2160;
  const p = `k${(sid += 1)}`;
  const top = { route: '#070b1f', ep1: '#0a1030', ep2: '#05070f', ep3: '#3a1a12', ep4: '#120a24' }[key];
  const bot = { route: '#1b2656', ep1: '#26346e', ep2: '#1a1f3a', ep3: '#b4562c', ep4: '#2a1846' }[key];
  let body = `<rect width="${W}" height="${H}" fill="url(#${p}g)"/>`;
  // milky way band
  body += `<g opacity="${key === 'ep3' ? 0.12 : 0.35}" filter="url(#${p}b)"><ellipse cx="${W * 0.55}" cy="${H * 0.3}" rx="${W * 0.75}" ry="${H * 0.07}" fill="#8f9ce8" transform="rotate(-24 ${W * 0.55} ${H * 0.3})"/>
    <ellipse cx="${W * 0.5}" cy="${H * 0.32}" rx="${W * 0.5}" ry="${H * 0.03}" fill="#e5d8ff" transform="rotate(-24 ${W * 0.5} ${H * 0.32})"/></g>`;
  body += stars(W, H, key === 'ep3' ? 60 : 220, key.length * 977 + (landscape ? 7 : 3), key === 'route' ? 1 : 0.75);
  const g = H; // ground baseline
  switch (key) {
    case 'route':
      body += `<g filter="url(#${p}s)"><path d="M0 ${g}V${g - H * 0.07}C${W * 0.2} ${g - H * 0.1} ${W * 0.35} ${g - H * 0.06} ${W * 0.5} ${g - H * 0.08}S${W * 0.8} ${g - H * 0.11} ${W} ${g - H * 0.07}V${g}Z" fill="#141c45"/>
        <rect x="${W * 0.12}" y="${g - H * 0.17}" width="${W * 0.02}" height="${H * 0.1}" fill="#1b2656"/><rect x="${W * 0.105}" y="${g - H * 0.17}" width="${W * 0.05}" height="${H * 0.012}" fill="#1b2656"/>
        <circle cx="${W * 0.13}" cy="${g - H * 0.175}" r="7" fill="#ffd36b"/></g>`;
      break;
    case 'ep1': {
      // launch towers with lights, then the dock pier
      const tower = (x: number, h: number) => `<g filter="url(#${p}s)"><path d="M${x - 26} ${g}L${x - 12} ${g - h}H${x + 12}L${x + 26} ${g}Z" fill="#1b2656"/>
        ${[0.2, 0.4, 0.6, 0.8].map((f) => `<path d="M${x - 24 + f * 12} ${g - h * f}H${x + 24 - f * 12}" stroke="#2a3a7a" stroke-width="5"/>`).join('')}
        <rect x="${x - 4}" y="${g - h - 60}" width="8" height="60" fill="#1b2656"/><circle cx="${x}" cy="${g - h - 64}" r="9" fill="#ff7a8a"/><circle cx="${x}" cy="${g - h - 64}" r="20" fill="#ff7a8a" opacity=".25"/></g>`;
      body += `<g opacity=".9">${tower(W * 0.18, H * 0.3)}${tower(W * 0.82, H * 0.24)}</g>
        <g filter="url(#${p}s)"><path d="M0 ${g}V${g - H * 0.1}H${W * 0.3}L${W * 0.34} ${g - H * 0.12}H${W * 0.66}L${W * 0.7} ${g - H * 0.1}H${W}V${g}Z" fill="#131a40"/>
        ${Array.from({ length: 9 }, (_, k) => `<rect x="${W * (0.05 + k * 0.11)}" y="${g - H * 0.1}" width="14" height="${H * 0.1}" fill="#0d1230"/>`).join('')}
        <path d="M0 ${g - H * 0.1}H${W * 0.3}L${W * 0.34} ${g - H * 0.12}H${W * 0.66}L${W * 0.7} ${g - H * 0.1}H${W}" stroke="#c8459d" stroke-width="4" fill="none" opacity=".6"/>
        ${Array.from({ length: 12 }, (_, k) => `<circle cx="${W * (0.04 + k * 0.085)}" cy="${g - H * 0.115 + (k > 3 && k < 8 ? -H * 0.02 : 0)}" r="5" fill="#ffe08a"/>`).join('')}</g>`;
      break;
    }
    case 'ep2': {
      // Earth seen from the Sea of Tranquility: ocean sphere, continents, cloud swirls, polar cap,
      // night-side terminator, thin atmosphere halo (paper-cut, but it must read as Earth at a glance)
      const ex = W * 0.78, ey = H * 0.16, R = W * 0.1;
      const P = (dx: number, dy: number) => `${(ex + dx * R).toFixed(1)} ${(ey + dy * R).toFixed(1)}`;
      body += `<g class="em-sky-hero"><circle cx="${ex}" cy="${ey}" r="${R * 1.16}" fill="url(#${p}atm)"/>
        <g filter="url(#${p}s)"><circle cx="${ex}" cy="${ey}" r="${R}" fill="url(#${p}oc)"/></g>
        <g clip-path="url(#${p}ec)">
          <path d="M${P(-0.62, -0.5)}C${P(-0.4, -0.78)} ${P(-0.02, -0.7)} ${P(0.06, -0.46)}S${P(-0.06, -0.12)} ${P(0.1, 0.04)}S${P(0.12, 0.42)} ${P(-0.08, 0.5)}S${P(-0.36, 0.2)} ${P(-0.42, 0)}S${P(-0.8, -0.2)} ${P(-0.62, -0.5)}Z" fill="#4fb878"/>
          <path d="M${P(-0.62, -0.5)}C${P(-0.4, -0.78)} ${P(-0.02, -0.7)} ${P(0.06, -0.46)}" stroke="#9be0b3" stroke-width="5" fill="none" opacity=".7" stroke-linecap="round"/>
          <path d="M${P(0.3, -0.62)}C${P(0.52, -0.66)} ${P(0.78, -0.4)} ${P(0.7, -0.16)}S${P(0.42, -0.1)} ${P(0.34, -0.3)}S${P(0.16, -0.5)} ${P(0.3, -0.62)}Z" fill="#5cc286"/>
          <path d="M${P(0.28, 0.24)}C${P(0.48, 0.18)} ${P(0.62, 0.36)} ${P(0.52, 0.56)}S${P(0.24, 0.62)} ${P(0.22, 0.46)}Z" fill="#3fa86a"/>
          <ellipse cx="${ex - R * 0.05}" cy="${ey - R * 0.96}" rx="${R * 0.56}" ry="${R * 0.16}" fill="#f4fbff" opacity=".85"/>
          <g stroke="#f4fbff" stroke-linecap="round" fill="none" opacity=".82">
            <path d="M${P(-0.86, -0.12)}Q${P(-0.6, -0.28)} ${P(-0.28, -0.22)}" stroke-width="${R * 0.07}"/>
            <path d="M${P(-0.1, -0.3)}Q${P(0.2, -0.42)} ${P(0.5, -0.34)}" stroke-width="${R * 0.055}"/>
            <path d="M${P(-0.7, 0.34)}Q${P(-0.44, 0.24)} ${P(-0.2, 0.3)}Q${P(0, 0.36)} ${P(0.16, 0.26)}" stroke-width="${R * 0.065}"/>
            <path d="M${P(0.04, 0.72)}Q${P(0.3, 0.64)} ${P(0.56, 0.7)}" stroke-width="${R * 0.05}"/>
            <path d="M${P(0.5, 0.02)}Q${P(0.7, -0.04)} ${P(0.86, 0.06)}" stroke-width="${R * 0.045}"/>
          </g>
          <circle cx="${ex + R * 0.62}" cy="${ey + R * 0.5}" r="${R * 1.18}" fill="#06102a" opacity=".5"/>
          <circle cx="${ex}" cy="${ey}" r="${R}" fill="url(#${p}e)"/>
        </g>
        <circle cx="${ex}" cy="${ey}" r="${R - 1.5}" fill="none" stroke="#cfe9ff" stroke-width="3" opacity=".45"/></g>
        <g filter="url(#${p}s)"><path d="M0 ${g}V${g - H * 0.14}C${W * 0.3} ${g - H * 0.16} ${W * 0.6} ${g - H * 0.12} ${W} ${g - H * 0.15}V${g}Z" fill="#4a5070"/>
        <ellipse cx="${W * 0.3}" cy="${g - H * 0.09}" rx="${W * 0.08}" ry="${H * 0.012}" fill="#3a3f5c"/><ellipse cx="${W * 0.72}" cy="${g - H * 0.06}" rx="${W * 0.11}" ry="${H * 0.015}" fill="#3a3f5c"/></g>
        <g filter="url(#${p}s)"><path d="M0 ${g}V${g - H * 0.06}Q${W * 0.15} ${g - H * 0.1} ${W * 0.3} ${g - H * 0.06}T${W * 0.62} ${g - H * 0.05}Q${W * 0.85} ${g - H * 0.09} ${W} ${g - H * 0.05}V${g}Z" fill="#2c3150"/>
        <path d="M0 ${g - H * 0.06}Q${W * 0.15} ${g - H * 0.1} ${W * 0.3} ${g - H * 0.06}" stroke="#c9d2ff" stroke-width="3" fill="none" opacity=".5"/></g>`;
      break;
    }
    case 'ep3': {
      const layer = (y: number, col: string, amp: number, seed: number) => {
        const r = rng(seed); let d = `M0 ${g}V${g - y}`;
        for (let x = 0; x <= W; x += W / 8) d += `L${x} ${g - y - r() * amp}L${x + W / 16} ${g - y - amp * 0.4 - r() * amp * 0.5}`;
        return `<path d="${d}V${g}Z" fill="${col}" filter="url(#${p}s)"/>`;
      };
      // (QA r1: the Phobos disc read as a stray blob behind the boss node and in the play HUD; removed —
      // the ridges, dust haze and the rover carry the Mars scene)
      body += layer(H * 0.3, '#8a3a22', H * 0.06, 11) + layer(H * 0.2, '#a3472a', H * 0.05, 23) + layer(H * 0.1, '#6b2a18', H * 0.04, 37);
      body += `<g filter="url(#${p}s)" transform="translate(${W * 0.62} ${g - H * 0.1})"><rect x="0" y="-60" width="170" height="50" rx="10" fill="#3a160c"/>
        <circle cx="25" cy="0" r="22" fill="#2a1008"/><circle cx="85" cy="0" r="22" fill="#2a1008"/><circle cx="145" cy="0" r="22" fill="#2a1008"/>
        <rect x="120" y="-130" width="8" height="70" fill="#3a160c"/><rect x="100" y="-140" width="60" height="14" rx="5" fill="#3a160c"/></g>`;
      break;
    }
    case 'ep4': {
      const rock = (x: number, y: number, s: number, col: string, seed: number) => {
        const r = rng(seed); let d = '';
        for (let k = 0; k < 9; k += 1) { const a = (k / 9) * Math.PI * 2, rr = s * (0.7 + r() * 0.35); d += `${k ? 'L' : 'M'}${(x + Math.cos(a) * rr).toFixed(1)} ${(y + Math.sin(a) * rr * 0.8).toFixed(1)}`; }
        return `<path d="${d}Z" fill="${col}" filter="url(#${p}s)"/><circle cx="${x - s * 0.25}" cy="${y - s * 0.15}" r="${s * 0.14}" fill="#000" opacity=".18"/>`;
      };
      const r = rng(41);
      for (let k = 0; k < 14; k += 1) body += rock(r() * W, r() * H * 0.7, 18 + r() * 30, '#3c2f52', 100 + k);
      for (let k = 0; k < 8; k += 1) body += rock(r() * W, H * 0.25 + r() * H * 0.6, 40 + r() * 50, '#57476e', 200 + k);
      body += rock(W * 0.1, g - H * 0.05, 180, '#6b5a7a', 301) + rock(W * 0.9, g - H * 0.02, 220, '#5e4f70', 302);
      break;
    }
    default: break;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" width="100%" height="100%">
    <defs><linearGradient id="${p}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bot}"/></linearGradient>
    <filter id="${p}b" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="40"/></filter>${paper(`${p}s`)}
    <radialGradient id="${p}e" cx=".35" cy=".3" r=".8"><stop offset=".55" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".55"/></radialGradient>
    <radialGradient id="${p}oc" cx=".36" cy=".32" r=".75"><stop offset="0" stop-color="#5fb4f2"/><stop offset=".6" stop-color="#2f74c9"/><stop offset="1" stop-color="#1b4b96"/></radialGradient>
    <radialGradient id="${p}atm" cx=".5" cy=".5" r=".5"><stop offset=".82" stop-color="#7cc3ff" stop-opacity="0"/><stop offset=".88" stop-color="#7cc3ff" stop-opacity=".38"/><stop offset="1" stop-color="#7cc3ff" stop-opacity="0"/></radialGradient>
    <clipPath id="${p}ec"><circle cx="${W * 0.78}" cy="${H * 0.16}" r="${W * 0.1}"/></clipPath></defs>${body}</svg>`;
}
