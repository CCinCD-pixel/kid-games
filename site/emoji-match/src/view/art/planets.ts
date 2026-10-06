/** Route planet medallions (spec §2.4 S1, §6.7): 112 px paper-cut discs, code-drawn. */
export type PlanetKey = 'dock' | 'moon' | 'mars' | 'belt' | 'jupiter' | 'saturn' | 'neptune' | 'pluto' | 'earth';
let n = 0;
export function planetSvg(key: PlanetKey, locked = false): string {
  const p = `pl${(n += 1)}`;
  const C: Record<PlanetKey, [string, string, string]> = {
    dock: ['#c8459d', '#7a1d5d', '#f7a8d8'], moon: ['#c9cfdf', '#6f778f', '#ffffff'], mars: ['#e0743f', '#8a2f16', '#ffc29a'],
    belt: ['#8a7a6a', '#4a3d33', '#d8c7b4'], jupiter: ['#d9a46b', '#7a4a25', '#ffe2b8'], saturn: ['#e8c87a', '#8a6a2a', '#fff0c4'],
    neptune: ['#3f7be6', '#1a2f80', '#a8c8ff'], pluto: ['#c8b2a0', '#6d5848', '#f4e6da'], earth: ['#2f74c9', '#123a7a', '#9fd8ff'],
  };
  const [base, dark, hi] = C[key];
  let deco = '';
  switch (key) {
    case 'dock': deco = `<path d="M30 70h40M36 70V44l14-14 14 14v26" stroke="#fff" stroke-width="5" fill="none" stroke-linejoin="round" opacity=".9"/><circle cx="50" cy="52" r="6" fill="#ffe08a"/>`; break;
    case 'moon': deco = `<circle cx="38" cy="40" r="9" fill="${dark}" opacity=".35"/><circle cx="62" cy="60" r="12" fill="${dark}" opacity=".3"/><circle cx="58" cy="33" r="5" fill="${dark}" opacity=".3"/>`; break;
    case 'mars': deco = `<path d="M22 46c20 -6 36 8 56 0" stroke="${dark}" stroke-width="6" fill="none" opacity=".45"/><path d="M26 64c16 4 30 -6 48 2" stroke="${dark}" stroke-width="4" fill="none" opacity=".35"/>`; break;
    case 'belt': deco = `<path d="M30 42l10 -8 12 4 4 12 -10 8 -14 -4z" fill="${dark}" opacity=".5"/><path d="M58 58l8 -5 9 4 1 9 -9 5 -8 -4z" fill="${dark}" opacity=".45"/>`; break;
    case 'jupiter': deco = [34, 44, 56, 66].map((y, k) => `<rect x="14" y="${y}" width="72" height="${k % 2 ? 5 : 8}" fill="${dark}" opacity=".35"/>`).join('') + `<ellipse cx="62" cy="60" rx="8" ry="5" fill="#c0503a" opacity=".7"/>`; break;
    case 'saturn': deco = `<ellipse cx="50" cy="52" rx="46" ry="12" fill="none" stroke="#fff0c4" stroke-width="5" transform="rotate(-18 50 52)"/>`; break;
    case 'neptune': deco = `<path d="M20 44c22 -6 38 6 60 -2M22 60c20 4 34 -4 56 2" stroke="${hi}" stroke-width="4" fill="none" opacity=".5"/>`; break;
    case 'pluto': deco = `<path d="M44 52c6 -12 22 -10 24 2c2 12 -14 18 -24 10z" fill="#f4e6da" opacity=".75"/>`; break;
    case 'earth': deco = `<path d="M30 40c10 -8 24 -4 26 6s-10 14 -20 10s-12 -10 -6 -16zM58 60c8 -6 18 -2 18 6s-10 10 -16 6z" fill="#3eb97d"/>`; break;
    default: break;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" class="em-planet${locked ? ' is-locked' : ''}">
    <defs><radialGradient id="${p}" cx=".35" cy=".3" r=".85"><stop offset="0" stop-color="${hi}"/><stop offset=".45" stop-color="${base}"/><stop offset="1" stop-color="${dark}"/></radialGradient>
    <clipPath id="${p}c"><circle cx="50" cy="50" r="38"/></clipPath></defs>
    <circle cx="50" cy="54" r="40" fill="#02040f" opacity=".35"/>
    <circle cx="50" cy="50" r="40" fill="#fff" opacity=".9"/>
    <circle cx="50" cy="50" r="38" fill="url(#${p})"/>
    <g clip-path="url(#${p}c)">${key === 'saturn' ? '' : deco}</g>${key === 'saturn' ? deco : ''}
    <path d="M24 34a30 30 0 0 1 22 -16" stroke="#fff" stroke-width="4" stroke-linecap="round" fill="none" opacity=".55"/></svg>`;
}
