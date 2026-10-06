/**
 * Collection badges (spec §6.13): paper-cut medallions (rim = the match accent) with a little scene
 * per star-map puzzle, plus the 老玩家 (veteran) badge — the old game's smiley re-cut as a gem (no
 * emoji glyph). A puzzle solved with the H3 walkthrough gets a small bulb mark (never a penalty).
 */
import { gemSvg } from './gems';
import { crateSvg, iceSvg, propSvg, rocketSvg } from './specials';

let n = 0;
const uid = (p: string) => `${p}b${(n += 1)}`;
/** place a 116-unit sprite SVG inside the badge at (x, y) with edge `size` */
const nest = (svg: string, x: number, y: number, size: number, extra = '') =>
  svg.replace(/^<svg /, `<svg x="${x}" y="${y}" ${extra}`).replace(/width="116" height="116"/, `width="${size}" height="${size}"`);

export type BadgeId = 'p1' | 'p2' | 'p3' | 'p4' | 'veteran';
export const BADGES: { id: BadgeId; name: string; how: string }[] = [
  { id: 'p1', name: '想想谁会掉下来', how: '解开第 1 站的星图谜题' },
  { id: 'p2', name: '横火箭擦一排', how: '解开第 2 站的星图谜题' },
  { id: 'p3', name: '无人机开铁箱', how: '解开第 3 站的星图谜题' },
  { id: 'p4', name: '让同色的来找冰壳', how: '解开第 4 站的星图谜题' },
  { id: 'veteran', name: '老玩家', how: '玩过旧版的消消乐' },
];

function scene(id: string): string {
  switch (id) {
    case 'p1': return `${nest(gemSvg(2), 40, 18, 40)}
      <path d="M60 60v14" stroke="#FFE9A8" stroke-width="3.5" stroke-linecap="round" stroke-dasharray="1 7"/><path d="M53 72l7 8 7-8" fill="none" stroke="#FFE9A8" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="44" cy="90" r="5" fill="#ECE00D"/><circle cx="60" cy="90" r="5" fill="#ECE00D"/><circle cx="76" cy="90" r="5" fill="#ECE00D"/>`;
    case 'p2': return `<rect x="20" y="70" width="80" height="18" rx="7" fill="#A99BC4"/><rect x="20" y="70" width="80" height="18" rx="7" fill="none" stroke="#fff" stroke-opacity=".4" stroke-width="2"/>
      <circle cx="32" cy="77" r="1.8" fill="#fff"/><circle cx="51" cy="82" r="1.5" fill="#fff"/><circle cx="69" cy="76" r="1.8" fill="#fff"/><circle cx="88" cy="81" r="1.5" fill="#fff"/>
      <path d="M18 52h18M14 60h14" stroke="#FFE9A8" stroke-width="3" stroke-linecap="round" opacity=".8"/>
      ${nest(rocketSvg(false), 34, 30, 54)}`;
    case 'p3': return `<path d="M30 30Q44 44 62 70" fill="none" stroke="#5FE3F0" stroke-width="3" stroke-dasharray="2 6" stroke-linecap="round"/>
      ${nest(crateSvg(2, true), 56, 56, 44)}${nest(propSvg(1), 14, 12, 40)}`;
    case 'p4': return `${nest(gemSvg(5), 12, 44, 36)}${nest(iceSvg(1), 12, 44, 36)}${nest(gemSvg(5), 72, 44, 36)}${nest(iceSvg(1), 72, 44, 36)}${nest(gemSvg(5), 42, 30, 36)}
      <path d="M30 52l4 8-3 6M90 54l-4 7 3 7" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`;
    default: { // veteran: a faceted golden "smile" gem
      const g = uid('vg');
      return `<defs><radialGradient id="${g}" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#FFF4B0"/><stop offset=".55" stop-color="#F6C934"/><stop offset="1" stop-color="#C98512"/></radialGradient></defs>
        <path d="M60 22L86 34L96 60L86 86L60 98L34 86L24 60L34 34Z" fill="url(#${g})" stroke="#FFE9A8" stroke-width="2.5" stroke-linejoin="round"/>
        <path d="M60 22L60 40M86 34L74 44M96 60L80 60M86 86L74 76M60 98L60 80M34 86L46 76M24 60L40 60M34 34L46 44" stroke="#B8780E" stroke-width="1.6" opacity=".55"/>
        <path d="M48 48l6 6-6 6-6-6zM72 48l6 6-6 6-6-6z" fill="#7A4A00"/>
        <path d="M44 68Q60 84 76 68" fill="none" stroke="#7A4A00" stroke-width="5" stroke-linecap="round"/>
        <path d="M42 36l10-4" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".8"/>`;
    }
  }
}

/** a 120-unit medallion; `locked` = dashed silhouette, `helped` = the H3 bulb mark */
export function badgeSvg(id: string, o: { locked?: boolean; helped?: boolean } = {}): string {
  const face = uid('bf'), sh = uid('bs');
  if (o.locked) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><circle cx="60" cy="60" r="52" fill="rgba(255,255,255,.04)" stroke="rgba(207,216,255,.45)" stroke-width="3" stroke-dasharray="6 7"/>
      <path d="M50 58v-6a10 10 0 0 1 20 0v6" fill="none" stroke="rgba(207,216,255,.55)" stroke-width="5" stroke-linecap="round"/><rect x="44" y="56" width="32" height="24" rx="6" fill="rgba(207,216,255,.45)"/></svg>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><defs>
      <radialGradient id="${face}" cx=".4" cy=".3" r=".85"><stop offset="0" stop-color="#34418c"/><stop offset="1" stop-color="#141b4a"/></radialGradient>
      <filter id="${sh}" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2.4"/></filter></defs>
    <circle cx="61" cy="64" r="56" fill="#050818" opacity=".5" filter="url(#${sh})"/>
    <circle cx="60" cy="60" r="56" fill="#c8459d"/><circle cx="60" cy="60" r="56" fill="none" stroke="#e57ac0" stroke-width="2.5"/>
    <circle cx="60" cy="60" r="47" fill="url(#${face})"/><circle cx="60" cy="60" r="47" fill="none" stroke="#F6B934" stroke-width="2"/>
    <path d="M22 40A44 44 0 0 1 98 40" fill="none" stroke="#fff" stroke-opacity=".18" stroke-width="5" stroke-linecap="round"/>
    <g>${scene(id)}</g>
    ${o.helped ? '<circle cx="98" cy="98" r="15" fill="#F6B934" stroke="#fff" stroke-width="2.5"/><path d="M98 88a7 7 0 0 0-4 12.6V104h8v-3.4A7 7 0 0 0 98 88z" fill="#fff"/><rect x="94.5" y="105" width="7" height="3" rx="1.5" fill="#fff"/>' : ''}
  </svg>`;
}
