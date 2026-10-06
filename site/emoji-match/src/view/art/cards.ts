/**
 * Knowledge-card illustrations (spec §4.7, §6.13): code-drawn paper-cut scenes, 600×300, one per v1
 * stop — 文昌发射场 by the sea, the lunar mare with 嫦娥四号, the red Martian ground with 祝融号, and
 * the asteroid belt between the orbits of Mars and Jupiter.
 */
let n = 0;
const sh = (id: string) => `<filter id="${id}" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy="4" stdDeviation="3" flood-color="#02040f" flood-opacity=".45"/></filter>`;
function starsField(seed: number, count: number, w = 600, h = 200): string {
  let s = seed, out = '';
  const r = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  for (let k = 0; k < count; k += 1) out += `<circle cx="${(r() * w).toFixed(1)}" cy="${(r() * h).toFixed(1)}" r="${(0.6 + r() * 1.3).toFixed(2)}" fill="#fff6da" opacity="${(0.3 + r() * 0.6).toFixed(2)}"/>`;
  return out;
}

function starport(p: string): string {
  return `<defs><linearGradient id="${p}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0a1030"/><stop offset="1" stop-color="#2a3a7a"/></linearGradient>
      <linearGradient id="${p}w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1d5d8f"/><stop offset="1" stop-color="#0d2c55"/></linearGradient>${sh(`${p}f`)}</defs>
    <rect width="600" height="300" fill="url(#${p}s)"/>${starsField(11, 60)}
    <circle cx="520" cy="58" r="22" fill="#fff4d6"/><circle cx="512" cy="52" r="22" fill="#2a3a7a" opacity=".0"/>
    <rect y="214" width="600" height="86" fill="url(#${p}w)"/>
    <path d="M0 222q30 -6 60 0t60 0t60 0t60 0t60 0t60 0t60 0t60 0t60 0t60 0" stroke="#7fc4ff" stroke-width="3" fill="none" opacity=".5"/>
    <path d="M30 252q30 -5 60 0t60 0M300 262q30 -5 60 0t60 0M480 246q20 -4 40 0" stroke="#7fc4ff" stroke-width="2.5" fill="none" opacity=".35"/>
    <path d="M150 214L170 196H460L480 214Z" fill="#3b466e" filter="url(#${p}f)"/>
    <g filter="url(#${p}f)">
      <path d="M262 196V60M300 196V60M262 70H300M262 96H300M262 122H300M262 148H300M262 174H300M262 70L300 96M300 96L262 122M262 122L300 148M300 148L262 174" stroke="#c9d0e2" stroke-width="4" fill="none"/>
      <path d="M300 84H330M300 128H330" stroke="#c9d0e2" stroke-width="4"/>
      <rect x="332" y="66" width="30" height="130" rx="10" fill="#f4f1ea"/><path d="M332 76Q347 34 362 76Z" fill="#f4f1ea"/>
      <rect x="318" y="120" width="14" height="76" rx="6" fill="#e9e4d8"/><rect x="362" y="120" width="14" height="76" rx="6" fill="#e9e4d8"/>
      <path d="M318 126Q325 104 332 126ZM362 126Q369 104 376 126Z" fill="#e9e4d8"/>
      <rect x="332" y="104" width="30" height="7" fill="#c8459d"/><rect x="341" y="82" width="12" height="12" rx="6" fill="#5fe3f0"/>
    </g>
    <g fill="#071026"><path d="M70 214q-2 -50 8 -70q-24 8 -36 4q20 -16 38 -10q-14 -18 -36 -18q24 -10 40 8q2 -20 -10 -32q22 8 18 34q14 -14 36 -10q-22 6 -30 20q20 0 32 14q-20 -6 -34 -2q-8 24 -4 62z"/>
      <path d="M520 214q-2 -38 6 -54q-18 6 -28 3q16 -12 30 -8q-10 -14 -28 -14q18 -8 30 6q2 -16 -8 -24q18 6 14 26q10 -10 28 -8q-16 4 -22 14q16 0 24 10q-16 -4 -26 -1q-6 18 -2 50z"/></g>`;
}
function moon(p: string): string {
  return `<defs><radialGradient id="${p}e" cx=".35" cy=".35" r=".8"><stop offset="0" stop-color="#7fc4ff"/><stop offset=".6" stop-color="#2f74c9"/><stop offset="1" stop-color="#123a7a"/></radialGradient>
      <linearGradient id="${p}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9aa1b5"/><stop offset="1" stop-color="#5d6478"/></linearGradient>${sh(`${p}f`)}</defs>
    <rect width="600" height="300" fill="#05070f"/>${starsField(23, 70, 600, 170)}
    <circle cx="470" cy="76" r="42" fill="url(#${p}e)"/><path d="M448 60c12 -10 30 -6 32 6s-12 16 -24 12s-14 -12 -8 -18zM478 92c10 -6 20 -2 20 6s-12 10 -18 6z" fill="#3eb97d" opacity=".9"/>
    <path d="M0 196Q150 168 300 186T600 180V300H0Z" fill="url(#${p}g)"/>
    <ellipse cx="300" cy="240" rx="220" ry="34" fill="#4a5064" opacity=".55"/>
    <ellipse cx="96" cy="222" rx="38" ry="9" fill="#4a5064" opacity=".7"/><ellipse cx="96" cy="219" rx="38" ry="9" fill="none" stroke="#c9cfdf" stroke-width="2" opacity=".6"/>
    <ellipse cx="520" cy="262" rx="50" ry="11" fill="#4a5064" opacity=".7"/><ellipse cx="520" cy="259" rx="50" ry="11" fill="none" stroke="#c9cfdf" stroke-width="2" opacity=".6"/>
    <g filter="url(#${p}f)">
      <path d="M226 230L236 214M290 230L280 214" stroke="#c9d0e2" stroke-width="4"/><rect x="230" y="186" width="56" height="30" rx="5" fill="#e8c35a" stroke="#a8862a" stroke-width="2"/>
      <path d="M236 192h44M236 200h44M236 208h44" stroke="#c9a242" stroke-width="1.5"/>
      <rect x="200" y="176" width="34" height="12" fill="#2f5aa8" stroke="#8fb4ff" stroke-width="1.5"/><rect x="282" y="176" width="34" height="12" fill="#2f5aa8" stroke="#8fb4ff" stroke-width="1.5"/>
      <path d="M258 186V168" stroke="#c9d0e2" stroke-width="3"/><circle cx="258" cy="164" r="6" fill="#f4f1ea"/>
      <rect x="350" y="214" width="34" height="16" rx="4" fill="#f4f1ea" stroke="#9aa6c4" stroke-width="1.5"/><rect x="342" y="206" width="50" height="6" fill="#2f5aa8"/>
      <circle cx="354" cy="232" r="4" fill="#3b4a8a"/><circle cx="367" cy="232" r="4" fill="#3b4a8a"/><circle cx="380" cy="232" r="4" fill="#3b4a8a"/>
    </g>
    <path d="M394 234q30 4 60 -2t70 4" stroke="#3a4054" stroke-width="3" stroke-dasharray="3 5" fill="none"/>`;
}
function mars(p: string): string {
  return `<defs><linearGradient id="${p}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5a2a1c"/><stop offset="1" stop-color="#c46a3a"/></linearGradient>${sh(`${p}f`)}</defs>
    <rect width="600" height="300" fill="url(#${p}s)"/>${starsField(37, 20, 600, 90)}
    <circle cx="96" cy="64" r="16" fill="#ffe2b8" opacity=".85"/>
    <path d="M0 150L70 120L140 146L220 110L300 142L380 104L470 140L540 116L600 132V300H0Z" fill="#8a3a20"/>
    <path d="M0 186L90 160L180 182L290 156L400 184L500 160L600 178V300H0Z" fill="#a8482a"/>
    <path d="M0 226Q150 206 300 222T600 214V300H0Z" fill="#c45e34"/>
    <g fill="#7a3018" opacity=".55"><ellipse cx="120" cy="250" rx="12" ry="5"/><ellipse cx="470" cy="262" rx="16" ry="6"/><ellipse cx="300" cy="276" rx="10" ry="4"/></g>
    <g filter="url(#${p}f)">
      <path d="M262 214l-40 -26l-6 10l34 24zM318 214l40 -26l6 10l-34 24z" fill="#2f5aa8" stroke="#8fb4ff" stroke-width="2"/>
      <path d="M226 194l26 17M354 194l-26 17" stroke="#8fb4ff" stroke-width="1.5"/>
      <rect x="258" y="206" width="64" height="24" rx="6" fill="#f4f1ea" stroke="#9aa6c4" stroke-width="2"/>
      <path d="M302 206V182" stroke="#c9d0e2" stroke-width="4"/><rect x="294" y="172" width="20" height="12" rx="3" fill="#3b4a8a"/><circle cx="309" cy="178" r="3" fill="#5fe3f0"/>
      ${[266, 290, 314].map((x) => `<circle cx="${x}" cy="236" r="8" fill="#2b2d5c" stroke="#9aa6c4" stroke-width="2"/>`).join('')}
    </g>
    <path d="M330 244q40 6 80 0t90 4" stroke="#8a3a20" stroke-width="3" stroke-dasharray="4 5" fill="none"/>`;
}
function asteroids(p: string): string {
  let rocks = '';
  let s = 91;
  const r = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  for (let k = 0; k < 34; k += 1) {
    const a = -0.95 + (k / 33) * 1.9 + (r() - 0.5) * 0.08, R = 300 + (r() - 0.5) * 40;
    const cx = 40 + Math.cos(a) * R, cy = 150 + Math.sin(a) * R * 0.62, z = 3 + r() * 7;
    const pts = Array.from({ length: 7 }, (_, j) => { const t = (j / 7) * Math.PI * 2, rr = z * (0.7 + r() * 0.5); return `${(cx + Math.cos(t) * rr).toFixed(1)},${(cy + Math.sin(t) * rr).toFixed(1)}`; }).join(' ');
    rocks += `<polygon points="${pts}" fill="${r() > 0.5 ? '#8a7a6a' : '#a8968a'}" stroke="#d8c7b4" stroke-width="1" opacity=".95"/>`;
  }
  return `<defs><radialGradient id="${p}sun" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff4c4"/><stop offset=".5" stop-color="#ffc84a"/><stop offset="1" stop-color="#ff9a3c" stop-opacity="0"/></radialGradient>
      <radialGradient id="${p}j" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#ffe2b8"/><stop offset=".6" stop-color="#d9a46b"/><stop offset="1" stop-color="#7a4a25"/></radialGradient></defs>
    <rect width="600" height="300" fill="#120a24"/>${starsField(53, 80, 600, 300)}
    <circle cx="40" cy="150" r="70" fill="url(#${p}sun)"/><circle cx="40" cy="150" r="26" fill="#ffd76a"/>
    <ellipse cx="40" cy="150" rx="210" ry="130" fill="none" stroke="#e0743f" stroke-width="2" stroke-dasharray="4 8" opacity=".7"/>
    <ellipse cx="40" cy="150" rx="420" ry="260" fill="none" stroke="#d9a46b" stroke-width="2" stroke-dasharray="4 8" opacity=".7"/>
    <circle cx="${40 + Math.cos(-0.5) * 210}" cy="${150 + Math.sin(-0.5) * 130}" r="10" fill="#e0743f"/>
    ${rocks}
    <circle cx="${40 + Math.cos(0.25) * 420}" cy="${150 + Math.sin(0.25) * 260}" r="30" fill="url(#${p}j)"/>
    <path d="M${40 + Math.cos(0.25) * 420 - 28} ${150 + Math.sin(0.25) * 260 - 6}h56M${40 + Math.cos(0.25) * 420 - 26} ${150 + Math.sin(0.25) * 260 + 8}h52" stroke="#7a4a25" stroke-width="4" opacity=".45"/>`;
}

export type CardKey = 'starport' | 'moon' | 'mars' | 'asteroids';
export function cardArt(key: string): string {
  const p = `kc${(n += 1)}`;
  const body = key === 'moon' ? moon(p) : key === 'mars' ? mars(p) : key === 'asteroids' ? asteroids(p) : starport(p);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 300" class="em-cardart">${body}</svg>`;
}
