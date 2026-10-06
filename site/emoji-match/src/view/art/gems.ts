/**
 * The six code-drawn gems (spec §6.3): cut-glass faces with a light rim (white 45 %) + faint outer glow
 * (no dark ink line, review B5), facets light/dark, a 6 % glaze band, soft floor shadow. Each returns a
 * standalone SVG whose 100-unit gem box fills 86 % of the sprite (viewBox padded to 116.3).
 */
import { GEMS, mix } from './palette';

export const SPRITE_VIEWBOX = '-8.15 -8.15 116.3 116.3';
let uid = 0;
const nid = (p: string) => `${p}${(uid += 1)}`;

function wrap(body: string, defs = ''): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${SPRITE_VIEWBOX}" width="116" height="116"><defs>${defs}</defs>${body}</svg>`;
}
const shadow = (id: string) => `<filter id="${id}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.2"/></filter>`;
const floor = (sid: string, rx = 32) => `<ellipse cx="50" cy="95" rx="${rx}" ry="4" fill="#050818" opacity=".45" filter="url(#${sid})"/>`;

/** outline path (used for rim, glow, glaze clip, V12 silhouette) per colour index */
export function gemOutline(c: number): string {
  switch (c) {
    case 0: return 'M28 10H72A18 18 0 0 1 90 28V72A18 18 0 0 1 72 90H28A18 18 0 0 1 10 72V28A18 18 0 0 1 28 10Z';
    case 1: return 'M50 22A28 28 0 1 1 49.99 22Z';
    case 2: { // sun: disc + 8 rays
      let d = 'M76 50A26 26 0 1 1 75.99 49.9Z';
      for (let k = 0; k < 8; k += 1) d += ray(k);
      return d;
    }
    case 3: return hexPath(42);
    case 4: return 'M50 6L88 50L50 94L12 50Z';
    default: return 'M84.95 30.53A40 40 0 1 0 51.9 89.95A34 34 0 1 1 84.95 30.53Z';
  }
}
function pt(r: number, deg: number): string { const a = (deg * Math.PI) / 180; return `${(50 + r * Math.cos(a)).toFixed(2)} ${(50 + r * Math.sin(a)).toFixed(2)}`; }
function ray(k: number): string { const t = -90 + k * 45; return `M${pt(23, t - 13)}L${pt(46, t)}L${pt(23, t + 13)}Z`; }
function hexPath(r: number): string { return `M${[0, 1, 2, 3, 4, 5].map((k) => pt(r, -90 + k * 60)).join('L')}Z`; }

export function gemSvg(c: number): string {
  const g = GEMS[c];
  const sid = nid('s'), gid = nid('g'), clip = nid('c'), grad = nid('r');
  const out = gemOutline(c);
  const defs = `${shadow(sid)}<filter id="${gid}" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2"/></filter>
    <clipPath id="${clip}"><path d="${out}"/></clipPath>`;
  // rim + faint outer glow under every face
  const rim = `<path d="${out}" fill="none" stroke="${g.rim}" stroke-opacity=".35" stroke-width="7" filter="url(#${gid})"/>
    <path d="${out}" fill="${g.rim}" stroke="${g.rim}" stroke-width="5" stroke-linejoin="round"/>`;
  const glaze = `<g clip-path="url(#${clip})"><rect x="0" y="0" width="100" height="16" fill="#fff" opacity=".16"/></g>`;
  let faces = '';
  const darker = mix(g.dark, '#000000', 0.16);
  const mid = mix(g.base, g.light, 0.45);
  switch (c) {
    case 0: {
      faces = `<g clip-path="url(#${clip})">
        <path d="M0 0H100L72 28H28Z" fill="${g.light}"/>
        <path d="M0 0L28 28V72L0 100Z" fill="${mid}"/>
        <path d="M100 0V100L72 72V28Z" fill="${g.dark}"/>
        <path d="M0 100L28 72H72L100 100Z" fill="${darker}"/></g>
        <radialGradient id="${grad}" cx=".38" cy=".32" r=".8"><stop offset="0" stop-color="${mix(g.light, '#ffffff', 0.25)}"/><stop offset=".55" stop-color="${g.base}"/><stop offset="1" stop-color="${mix(g.base, g.dark, 0.6)}"/></radialGradient>
        <rect x="28" y="28" width="44" height="44" rx="8" fill="url(#${grad})"/>
        <path d="M28 28L72 72M72 28L28 72" stroke="#fff" stroke-opacity=".1" stroke-width="1.2"/>
        <ellipse cx="34" cy="30" rx="9" ry="5" fill="#fff" opacity=".7" transform="rotate(-20 34 30)"/>
        <circle cx="64" cy="64" r="2.4" fill="#fff" opacity=".45"/>`;
      break;
    }
    case 1: {
      const back = nid('k'), front = nid('f');
      faces = `<clipPath id="${back}"><rect x="-10" y="-10" width="120" height="58"/></clipPath><clipPath id="${front}"><rect x="-10" y="50" width="120" height="60"/></clipPath>
        <g transform="rotate(-20 50 50)"><ellipse cx="50" cy="50" rx="46" ry="13" fill="none" stroke="${mix(g.dark, '#000', 0.1)}" stroke-width="9" clip-path="url(#${back})"/>
        <ellipse cx="50" cy="50" rx="46" ry="13" fill="none" stroke="#FFE4A8" stroke-width="6" clip-path="url(#${back})" opacity=".8"/></g>
        <radialGradient id="${grad}" cx=".36" cy=".3" r=".85"><stop offset="0" stop-color="${mix(g.light, '#fff', 0.35)}"/><stop offset=".5" stop-color="${g.base}"/><stop offset="1" stop-color="${g.dark}"/></radialGradient>
        <circle cx="50" cy="50" r="28" fill="url(#${grad})"/>
        <g transform="rotate(-20 50 50)"><ellipse cx="50" cy="50" rx="46" ry="13" fill="none" stroke="${g.rim}" stroke-width="10" clip-path="url(#${front})"/>
        <ellipse cx="50" cy="50" rx="46" ry="13" fill="none" stroke="#FFE4A8" stroke-width="7" clip-path="url(#${front})"/>
        <ellipse cx="50" cy="50" rx="46" ry="13" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="1.6" clip-path="url(#${front})" transform="translate(0 -2)"/></g>
        <ellipse cx="40" cy="36" rx="8" ry="4.5" fill="#fff" opacity=".7" transform="rotate(-25 40 36)"/>`;
      break;
    }
    case 2: {
      let rays = '';
      for (let k = 0; k < 8; k += 1) {
        const t = -90 + k * 45;
        const lit = k % 2 === 0;
        rays += `<path d="M${pt(23, t - 13)}L${pt(46, t)}L${pt(23, t + 13)}Z" fill="${lit ? g.light : g.dark}" stroke="${lit ? g.light : g.dark}" stroke-width="3" stroke-linejoin="round"/>
          <path d="M${pt(24, t)}L${pt(44, t)}" stroke="#fff" stroke-opacity="${lit ? 0.55 : 0.2}" stroke-width="1.4" stroke-linecap="round"/>`;
      }
      faces = `${rays}<radialGradient id="${grad}" cx=".42" cy=".38" r=".7"><stop offset="0" stop-color="#FFFBD6"/><stop offset=".45" stop-color="${g.light}"/><stop offset="1" stop-color="${mix(g.base, g.dark, 0.5)}"/></radialGradient>
        <circle cx="50" cy="50" r="26" fill="url(#${grad})"/>
        <circle cx="50" cy="50" r="18" fill="none" stroke="#fff" stroke-opacity=".4" stroke-width="1.8"/>
        <ellipse cx="42" cy="40" rx="7" ry="4" fill="#fff" opacity=".75" transform="rotate(-30 42 40)"/>`;
      break;
    }
    case 3: {
      const tri = (k: number) => `M50 50L${pt(42, -90 + k * 60)}L${pt(42, -30 + k * 60)}Z`;
      const shade = [g.light, mid, g.dark, darker, mix(g.dark, g.base, 0.4), mix(g.light, g.base, 0.3)];
      faces = [0, 1, 2, 3, 4, 5].map((k) => `<path d="${tri(k)}" fill="${shade[k]}"/>`).join('') +
        `<radialGradient id="${grad}" cx=".4" cy=".35" r=".8"><stop offset="0" stop-color="${mix(g.light, '#fff', 0.45)}"/><stop offset="1" stop-color="${g.base}"/></radialGradient>
        <path d="${hexPath(16)}" fill="url(#${grad})"/>
        ${[0, 1, 2, 3, 4, 5].map((k) => `<path d="M${pt(16, -90 + k * 60)}L${pt(42, -90 + k * 60)}" stroke="#fff" stroke-opacity=".22" stroke-width="1.2"/>`).join('')}
        <ellipse cx="40" cy="30" rx="7" ry="3.6" fill="#fff" opacity=".7" transform="rotate(-30 40 30)"/>`;
      break;
    }
    case 4: {
      faces = `<path d="M50 6L12 50H50Z" fill="${g.light}"/><path d="M50 6L88 50H50Z" fill="${mid}"/>
        <path d="M12 50L50 94V50Z" fill="${g.base}"/><path d="M88 50L50 94V50Z" fill="${g.dark}"/>
        <path d="M50 14L63 32L50 42L37 32Z" fill="${mix(g.light, '#fff', 0.4)}" opacity=".9"/>
        <path d="M50 6L37 32L12 50M50 6L63 32L88 50M37 32L50 50L63 32M12 50H88M50 50L31 72M50 50L69 72" fill="none" stroke="#fff" stroke-opacity=".3" stroke-width="1.2"/>
        <ellipse cx="38" cy="30" rx="5" ry="3" fill="#fff" opacity=".8" transform="rotate(-50 38 30)"/>`;
      break;
    }
    default: {
      faces = `<radialGradient id="${grad}" cx=".3" cy=".35" r=".9"><stop offset="0" stop-color="${mix(g.light, '#fff', 0.35)}"/><stop offset=".55" stop-color="${g.base}"/><stop offset="1" stop-color="${g.dark}"/></radialGradient>
        <path d="${out}" fill="url(#${grad})"/>
        <path d="M51.9 89.95A34 34 0 1 1 84.95 30.53" fill="none" stroke="${g.dark}" stroke-width="3" opacity=".5"/>
        <path d="M22 34A32 32 0 0 1 40 15" fill="none" stroke="#fff" stroke-opacity=".75" stroke-width="3.2" stroke-linecap="round"/>
        <circle cx="30" cy="60" r="5" fill="${mix(g.base, g.dark, 0.35)}" stroke="${g.dark}" stroke-width="1.4"/>
        <circle cx="29" cy="59" r="2" fill="#fff" opacity=".35"/>
        <circle cx="45" cy="77" r="3" fill="${mix(g.base, g.dark, 0.35)}" stroke="${g.dark}" stroke-width="1.2"/>`;
      break;
    }
  }
  return wrap(`${floor(sid)}${rim}${faces}${glaze}`, defs);
}
