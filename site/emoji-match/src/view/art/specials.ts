/**
 * Colourless specials (spec §6.4) and blockers (§6.5) as SVG sprites (same padded viewBox as gems).
 * Idle frames: rocket highlight sweep (5), drone rotors (4), bomb spark (3). The orb is drawn on a
 * canvas with a conic gradient (orbFrame) — SVG has no conic gradient (review B24).
 */
import { SPRITE_VIEWBOX } from './gems';
import { GEMS, mix } from './palette';

let n = 0;
const id = (p: string) => `${p}x${(n += 1)}`;
const wrap = (body: string, defs = '') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${SPRITE_VIEWBOX}" width="116" height="116"><defs>${defs}</defs>${body}</svg>`;
const blur = (fid: string, sd = 2.2) => `<filter id="${fid}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${sd}"/></filter>`;

/** double-headed rocket, horizontal; `sweep` 0..4 = highlight band position (idle), -1 = none */
export function rocketSvg(vertical: boolean, sweep = -1): string {
  const s = id('s'), body = id('b'), cone = id('c'), clip = id('k'), glow = id('g');
  const band = sweep >= 0 ? `<g clip-path="url(#${clip})"><rect x="${4 + sweep * 20}" y="20" width="12" height="60" fill="#fff" opacity=".55" transform="skewX(-20)"/></g>` : '';
  const art = `
    <ellipse cx="50" cy="${vertical ? 95 : 72}" rx="${vertical ? 18 : 36}" ry="4" fill="#050818" opacity=".45" filter="url(#${s})"/>
    <g transform="${vertical ? 'rotate(90 50 50)' : ''}">
      <path d="M12 50L24 30H76L88 50L76 70H24Z" fill="none" stroke="#FFFFFF" stroke-opacity=".45" stroke-width="8" filter="url(#${glow})"/>
      <path d="M30 36L22 24L36 32ZM70 36L78 24L64 32ZM30 64L22 76L36 68ZM70 64L78 76L64 68Z" fill="#E8473F" stroke="#9E2A27" stroke-width="1.5" stroke-linejoin="round"/>
      <rect x="22" y="35" width="56" height="30" rx="13" fill="url(#${body})" stroke="#C9C2B4" stroke-width="2"/>
      <path d="M22 36Q12 50 22 64L10 56Q6 50 10 44Z" fill="url(#${cone})"/>
      <path d="M78 36Q88 50 78 64L90 56Q94 50 90 44Z" fill="url(#${cone})" transform="rotate(180 84 50) translate(0 0)"/>
      <path d="M8 50L22 35V65Z" fill="url(#${cone})" stroke="#9E2A27" stroke-width="1.6" stroke-linejoin="round"/>
      <path d="M92 50L78 35V65Z" fill="url(#${cone})" stroke="#9E2A27" stroke-width="1.6" stroke-linejoin="round"/>
      <rect x="31" y="35" width="3" height="30" fill="#E8473F" opacity=".9"/><rect x="66" y="35" width="3" height="30" fill="#E8473F" opacity=".9"/>
      <circle cx="50" cy="50" r="9.5" fill="#1D4F6A" stroke="#E9E4D8" stroke-width="3"/>
      <circle cx="50" cy="50" r="6.5" fill="#5FE3F0"/>
      <ellipse cx="47.5" cy="47" rx="3" ry="2" fill="#fff" opacity=".85"/>
      <rect x="26" y="38" width="48" height="5" rx="2.5" fill="#fff" opacity=".7"/>
      ${band}
    </g>`;
  const defs = `${blur(s)}${blur(glow, 2.5)}
    <linearGradient id="${body}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".55" stop-color="#F4F1EA"/><stop offset="1" stop-color="#C9C0AE"/></linearGradient>
    <linearGradient id="${cone}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FF7E6E"/><stop offset=".5" stop-color="#E8473F"/><stop offset="1" stop-color="#A82E2A"/></linearGradient>
    <clipPath id="${clip}"><rect x="22" y="35" width="56" height="30" rx="13"/></clipPath>`;
  return wrap(art, defs);
}

/** drone with the companion's cyan LED eyes; frame 0..3 = rotor phase; bob = px offset (viewBox units) */
export function propSvg(frame = 0, bob = 0): string {
  const s = id('s'), body = id('b'), glow = id('g');
  const rotor = (cx: number, cy: number) => {
    const a = frame * 22.5;
    return `<g transform="translate(${cx} ${cy})"><circle r="13" fill="#8C97AE" opacity=".35"/><circle r="13" fill="none" stroke="#C7D0E2" stroke-width="1.5" opacity=".7"/>
      <g transform="rotate(${a})"><rect x="-12" y="-2" width="24" height="4" rx="2" fill="#E9EEF7" opacity=".9"/><rect x="-2" y="-12" width="4" height="24" rx="2" fill="#E9EEF7" opacity=".55"/></g>
      <circle r="3.4" fill="#5B6680" stroke="#fff" stroke-width="1"/></g>`;
  };
  const eye = (x: number) => [0, 1].map((r) => [0, 1].map((c) => `<rect x="${x + c * 5.5}" y="${44 + r * 5.5}" width="4.4" height="4.4" rx="1.2" fill="#5FE3F0"/>`).join('')).join('');
  return wrap(`
    <ellipse cx="50" cy="95" rx="26" ry="4" fill="#050818" opacity=".45" filter="url(#${s})"/>
    <g transform="translate(0 ${bob})">
    <path d="M24 24L76 76M76 24L24 76" stroke="#7D879E" stroke-width="6" stroke-linecap="round"/>
    <rect x="28" y="30" width="44" height="40" rx="12" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width="7" filter="url(#${glow})"/>
    ${rotor(22, 22)}${rotor(78, 22)}${rotor(22, 78)}${rotor(78, 78)}
    <rect x="28" y="30" width="44" height="40" rx="12" fill="url(#${body})" stroke="#BFC6D4" stroke-width="2"/>
    <rect x="33" y="38" width="34" height="22" rx="7" fill="#0E1838"/>
    <g filter="url(#${glow})" opacity=".8">${eye(36.5)}${eye(52.5)}</g>${eye(36.5)}${eye(52.5)}
    <rect x="32" y="32" width="36" height="4" rx="2" fill="#fff" opacity=".8"/>
    <rect x="44" y="64" width="12" height="3" rx="1.5" fill="#5FE3F0" opacity=".8"/></g>`,
  `${blur(s)}${blur(glow, 1.6)}<linearGradient id="${body}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#D3D9E6"/></linearGradient>`);
}

/** star-burst bomb; spark frame 0..2 */
export function bombSvg(frame = 0): string {
  const s = id('s'), ball = id('b'), glow = id('g');
  const sparks = [[[84, 14], [92, 8], [88, 20]], [[86, 10], [94, 16], [80, 8]], [[90, 12], [82, 6], [94, 20]]][frame % 3];
  const star = 'M50 30L55 45L70 50L55 55L50 70L45 55L30 50L45 45Z';
  return wrap(`
    <ellipse cx="50" cy="95" rx="30" ry="4" fill="#050818" opacity=".45" filter="url(#${s})"/>
    <circle cx="50" cy="56" r="36" fill="none" stroke="#9AA3FF" stroke-opacity=".4" stroke-width="6" filter="url(#${glow})"/>
    <path d="M66 28Q74 16 84 14" fill="none" stroke="#6B4A2A" stroke-width="5" stroke-linecap="round"/>
    <path d="M66 28Q74 16 84 14" fill="none" stroke="#C99A5B" stroke-width="2" stroke-linecap="round"/>
    <rect x="58" y="24" width="14" height="10" rx="3" fill="#4B4F86" transform="rotate(-35 65 29)"/>
    <circle cx="50" cy="56" r="34" fill="url(#${ball})" stroke="#8F95D6" stroke-width="2.5"/>
    <g transform="translate(0 6)"><path d="${star}" fill="#F6B934" stroke="#FFE08A" stroke-width="2" stroke-linejoin="round"/><path d="M50 36L53 47L50 50Z" fill="#fff" opacity=".6"/></g>
    <ellipse cx="38" cy="38" rx="9" ry="5" fill="#fff" opacity=".45" transform="rotate(-35 38 38)"/>
    <g filter="url(#${glow})"><circle cx="${sparks[0][0]}" cy="${sparks[0][1]}" r="5" fill="#FFD36B"/></g>
    ${sparks.map(([x, y], k) => `<circle cx="${x}" cy="${y}" r="${[3.4, 2.2, 1.6][k]}" fill="${['#FFF3B0', '#FFB347', '#FF7A3C'][k]}"/>`).join('')}`,
  `${blur(s)}${blur(glow, 2.4)}<radialGradient id="${ball}" cx=".35" cy=".3" r=".85"><stop offset="0" stop-color="#5A5EA8"/><stop offset=".6" stop-color="#2B2D5C"/><stop offset="1" stop-color="#15163A"/></radialGradient>`);
}

/** orb icon as SVG (DOM icons, style board): 12 blurred wedges approximate the conic gradient */
export function orbSvg(): string {
  const s = id('s'), b = id('b'), core = id('c'), clip = id('k');
  const cols = [0, 1, 2, 3, 4, 5].map((c) => GEMS[c].base);
  let wedges = '';
  for (let k = 0; k < 12; k += 1) {
    const a0 = (k * 30 - 90) * Math.PI / 180, a1 = ((k + 1) * 30 - 90) * Math.PI / 180;
    wedges += `<path d="M50 50L${50 + 60 * Math.cos(a0)} ${50 + 60 * Math.sin(a0)}L${50 + 60 * Math.cos(a1)} ${50 + 60 * Math.sin(a1)}Z" fill="${cols[Math.floor(k / 2)]}"/>`;
  }
  return wrap(`<ellipse cx="50" cy="95" rx="30" ry="4" fill="#050818" opacity=".45" filter="url(#${s})"/>
    <circle cx="50" cy="50" r="40" fill="#fff" opacity=".35" filter="url(#${s})"/>
    <g clip-path="url(#${clip})"><g filter="url(#${b})">${wedges}</g><circle cx="50" cy="50" r="36" fill="url(#${core})"/></g>
    <circle cx="50" cy="50" r="36" fill="none" stroke="#fff" stroke-width="2.5" opacity=".8"/>
    <ellipse cx="38" cy="34" rx="10" ry="5.5" fill="#fff" opacity=".7" transform="rotate(-35 38 34)"/>`,
  `${blur(s, 3)}${blur(b, 4)}<clipPath id="${clip}"><circle cx="50" cy="50" r="36"/></clipPath>
    <radialGradient id="${core}"><stop offset="0" stop-color="#fff"/><stop offset=".32" stop-color="#fff" stop-opacity=".85"/><stop offset=".7" stop-color="#fff" stop-opacity="0"/></radialGradient>`);
}

/** orb frame on a canvas (atlas): conic gradient through the 6 gem colours, rotating by frame/8 */
export function drawOrb(ctx: CanvasRenderingContext2D, size: number, frame = 0): void {
  const u = size / 116.3, cx = (8.15 + 50) * u, cy = cx, r = 36 * u;
  ctx.save();
  ctx.fillStyle = 'rgba(5,8,24,.45)'; ctx.filter = `blur(${2.2 * u}px)`;
  ctx.beginPath(); ctx.ellipse(cx, (8.15 + 95) * u, 30 * u, 4 * u, 0, 0, Math.PI * 2); ctx.fill();
  ctx.filter = `blur(${4 * u}px)`; ctx.fillStyle = 'rgba(255,255,255,.35)';
  ctx.beginPath(); ctx.arc(cx, cy, r + 4 * u, 0, Math.PI * 2); ctx.fill();
  ctx.filter = 'none';
  const ext = ctx as CanvasRenderingContext2D & { createConicGradient?: (a: number, x: number, y: number) => CanvasGradient };
  let fill: CanvasGradient | string;
  if (ext.createConicGradient) {
    const g = ext.createConicGradient((frame / 8) * Math.PI * 2, cx, cy);
    const cols = [0, 2, 3, 4, 5, 1, 0].map((c) => GEMS[c].base);
    cols.forEach((c, k) => g.addColorStop(k / (cols.length - 1), c));
    fill = g;
  } else fill = GEMS[4].base;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill();
  const core = ctx.createRadialGradient(cx - 4 * u, cy - 4 * u, 0, cx, cy, r);
  core.addColorStop(0, 'rgba(255,255,255,1)'); core.addColorStop(0.3, 'rgba(255,255,255,.85)'); core.addColorStop(0.72, 'rgba(255,255,255,0)');
  ctx.fillStyle = core; ctx.fill();
  ctx.lineWidth = 2.5 * u; ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.7)';
  ctx.beginPath(); ctx.ellipse(cx - 12 * u, cy - 16 * u, 10 * u, 5.5 * u, -0.6, 0, Math.PI * 2); ctx.fill();
  // one twinkle
  const tw = [[0.35, -0.2], [-0.2, 0.3], [0.1, 0.42], [-0.38, -0.05]][frame % 4];
  const tx = cx + tw[0] * r, ty = cy + tw[1] * r;
  ctx.fillStyle = '#fff'; ctx.beginPath();
  ctx.moveTo(tx, ty - 5 * u); ctx.lineTo(tx + 1.2 * u, ty - 1.2 * u); ctx.lineTo(tx + 5 * u, ty); ctx.lineTo(tx + 1.2 * u, ty + 1.2 * u);
  ctx.lineTo(tx, ty + 5 * u); ctx.lineTo(tx - 1.2 * u, ty + 1.2 * u); ctx.lineTo(tx - 5 * u, ty); ctx.lineTo(tx - 1.2 * u, ty - 1.2 * u); ctx.fill();
  ctx.restore();
}

/** crates (§6.5): hp 1 paper, 2 metal, 3 titanium; `dented` = metal after its first hit */
export function crateSvg(hp: number, dented = false): string {
  const s = id('s'), g = id('g');
  const base = hp === 1 ? '#D9A45B' : hp === 2 ? '#8C9DB5' : '#586174';
  const hi = mix(base, '#ffffff', 0.35), lo = mix(base, '#000000', 0.3);
  let deco = '';
  if (hp === 1) {
    deco = `<rect x="44" y="9" width="12" height="82" fill="#EBD39A"/><rect x="9" y="44" width="82" height="12" fill="#EBD39A"/>
      <rect x="44" y="9" width="12" height="82" fill="none" stroke="#C9A866" stroke-width="1"/>
      <path d="M22 66l8-14 8 14-8-3z" fill="${lo}" opacity=".55"/><path d="M68 26l8-6v12z" fill="${lo}" opacity=".35"/>
      <path d="M14 14L30 30M86 14L70 30M14 86L30 70M86 86L70 70" stroke="${lo}" stroke-width="1.5" opacity=".5"/>`;
  } else if (hp === 2) {
    deco = [25, 50, 75].map((y) => `<rect x="12" y="${y - 3}" width="76" height="6" rx="3" fill="${lo}" opacity=".55"/><rect x="12" y="${y - 3}" width="76" height="2" rx="1" fill="${hi}" opacity=".8"/>`).join('') +
      [[18, 18], [82, 18], [18, 82], [82, 82]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="4.2" fill="${hi}" stroke="${lo}" stroke-width="1.5"/>`).join('') +
      (dented ? `<path d="M56 30l6 10-5 6 7 11-4 8" fill="none" stroke="#2A3346" stroke-width="2.4" stroke-linecap="round"/><ellipse cx="38" cy="62" rx="9" ry="6" fill="${lo}" opacity=".5"/>` : '');
  } else {
    deco = `<clipPath id="${g}k"><rect x="9" y="38" width="82" height="24"/></clipPath><rect x="9" y="38" width="82" height="24" fill="#F2C230"/>
      <g clip-path="url(#${g}k)">${[0, 1, 2, 3, 4, 5, 6].map((k) => `<path d="M${k * 16} 62L${k * 16 + 10} 38H${k * 16 + 18}L${k * 16 + 8} 62Z" fill="#20232C"/>`).join('')}</g>
      ${[[18, 18], [82, 18], [18, 82], [82, 82]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="4" fill="${hi}" stroke="${lo}" stroke-width="1.5"/>`).join('')}`;
  }
  return wrap(`<ellipse cx="50" cy="96" rx="38" ry="4" fill="#050818" opacity=".45" filter="url(#${s})"/>
    <rect x="7" y="7" width="86" height="86" rx="12" fill="${lo}"/>
    <rect x="9" y="9" width="82" height="80" rx="11" fill="url(#${g})"/>
    ${deco}
    <rect x="9" y="9" width="82" height="6" rx="3" fill="#fff" opacity=".35"/>
    <rect x="7" y="7" width="86" height="86" rx="12" fill="none" stroke="${hi}" stroke-width="2" opacity=".7"/>`,
  `${blur(s)}<linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${hi}"/><stop offset=".45" stop-color="${base}"/><stop offset="1" stop-color="${mix(base, '#000', 0.12)}"/></linearGradient>`);
}

/** ice shell over a gem: 1 or 2 layers. A frosted FRAME with a nearly clear centre, so the gem keeps its
 *  own hue under the ice (station 4: "match the same colour to the ice"; QA r1). The centre is a neutral
 *  white veil (alpha ≤ .12), never a blue tint; thickness, rim, cracks and frost dots carry the layer count. */
export function iceSvg(layers: number): string {
  const g = id('g'), two = layers > 1;
  const inset = two ? 15 : 11, r = two ? 8 : 10;
  const outer = 'M19 3H81Q97 3 97 19V81Q97 97 81 97H19Q3 97 3 81V19Q3 3 19 3Z';
  const i0 = inset, i1 = 100 - inset;
  const inner = `M${i0 + r} ${i0}H${i1 - r}Q${i1} ${i0} ${i1} ${i0 + r}V${i1 - r}Q${i1} ${i1} ${i1 - r} ${i1}H${i0 + r}Q${i0} ${i1} ${i0} ${i1 - r}V${i0 + r}Q${i0} ${i0} ${i0 + r} ${i0}Z`;
  const frost = two ? [[9, 30], [9, 62], [30, 91], [68, 91], [91, 40], [91, 72], [44, 8], [76, 8], [8, 8], [92, 92]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="${1.8 + ((x + y) % 3) * 0.6}" fill="#fff" opacity=".9"/>`).join('') : '';
  return wrap(`<path d="${outer}${inner}" fill-rule="evenodd" fill="url(#${g})"/>
    <path d="${inner}" fill="#fff" fill-opacity="${two ? 0.12 : 0.07}"/>
    <path d="${outer}" fill="none" stroke="#F2FDFF" stroke-width="${two ? 4 : 3}" stroke-opacity=".95"/>
    <path d="${inner}" fill="none" stroke="#fff" stroke-width="${two ? 2.2 : 1.6}" stroke-opacity=".75"/>
    <path d="M7 26L26 7M7 40L40 7" stroke="#fff" stroke-width="${two ? 3 : 2.4}" stroke-linecap="round" opacity=".8"/>
    <path d="M${i0 + 3} ${i0 + 16}L${i0 + 16} ${i0 + 3}" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".55"/>
    <path d="M93 64L84 70L88 78M64 93L70 85L78 89" fill="none" stroke="#fff" stroke-width="${two ? 2 : 1.6}" stroke-linecap="round" stroke-linejoin="round" opacity=".7"/>
    ${two ? `<path d="M7 74L15 68M26 93L32 86M93 26L86 33" stroke="#fff" stroke-width="1.8" stroke-linecap="round" opacity=".7"/>` : ''}${frost}`,
  `<linearGradient id="${g}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="rgb(226,250,255)" stop-opacity="${two ? 0.88 : 0.74}"/><stop offset="1" stop-color="rgb(150,214,244)" stop-opacity="${two ? 0.8 : 0.64}"/></linearGradient>`);
}

/** dark-matter goo (v2) */
export function gooSvg(frame = 0): string {
  const s = id('s'), g = id('g');
  const w = [0, 2, -1.5, 1][frame % 4];
  return wrap(`<ellipse cx="50" cy="95" rx="34" ry="4" fill="#050818" opacity=".45" filter="url(#${s})"/>
    <path d="M18 ${55 + w}C14 30 34 14 52 16C74 ${12 - w} 92 34 86 56C82 80 64 90 48 88C28 ${88 + w} 20 74 18 ${55 + w}Z" fill="url(#${g})" stroke="#6A3D9A" stroke-width="3"/>
    <circle cx="38" cy="38" r="4" fill="#fff" opacity=".7"/><circle cx="48" cy="33" r="2" fill="#fff" opacity=".5"/>`,
  `${blur(s)}<radialGradient id="${g}" cx=".4" cy=".35" r=".8"><stop offset="0" stop-color="#4A2A6A"/><stop offset="1" stop-color="#2B1740"/></radialGradient>`);
}

/** rescue pod (v2) */
export function podSvg(): string {
  const s = id('s'), g = id('g');
  return wrap(`<ellipse cx="50" cy="95" rx="28" ry="4" fill="#050818" opacity=".45" filter="url(#${s})"/>
    <path d="M50 8C70 8 82 32 82 56C82 78 68 92 50 92C32 92 18 78 18 56C18 32 30 8 50 8Z" fill="url(#${g})" stroke="#C9CED8" stroke-width="2"/>
    <rect x="18" y="60" width="64" height="9" fill="#F28A2E"/>
    <circle cx="50" cy="42" r="15" fill="#1C2A55" stroke="#E2E6EE" stroke-width="3.5"/>
    <path d="M40 44C42 34 58 34 60 44C58 50 42 50 40 44Z" fill="#3B5BA8"/><ellipse cx="46" cy="38" rx="4" ry="2.4" fill="#fff" opacity=".8"/>
    <rect x="42" y="2" width="16" height="9" rx="4" fill="#E8473F"/>`,
  `${blur(s)}<linearGradient id="${g}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#C9D0DE"/></linearGradient>`);
}
