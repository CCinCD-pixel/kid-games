/**
 * Booster (工具) icons, code-drawn (spec §6.8): 激光钻 laser drill, 牵引臂 tractor claw, 离子炮 ion
 * cannon — chunky, lit from the top-left like the gems, readable at 56–80 px. Plus the ion cannon's
 * direction keys (横 / 竖) and the tool-aim crosshair.
 */
let n = 0;
const uid = (p: string) => `${p}t${(n += 1)}`;

export type ToolId = 'drill' | 'tractor' | 'ion';
export const TOOL_NAMES: Record<ToolId, string> = { drill: '激光钻', tractor: '牵引臂', ion: '离子炮' };

export function drillSvg(): string {
  const steel = uid('st'), white = uid('wh'), gold = uid('go'), glow = uid('gl');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs>
    <linearGradient id="${steel}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E7ECF6"/><stop offset=".5" stop-color="#AEB9CF"/><stop offset="1" stop-color="#7C88A3"/></linearGradient>
    <linearGradient id="${white}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".6" stop-color="#F1EEE6"/><stop offset="1" stop-color="#CFC6B5"/></linearGradient>
    <linearGradient id="${gold}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFE08A"/><stop offset=".55" stop-color="#F6B934"/><stop offset="1" stop-color="#C98512"/></linearGradient>
    <filter id="${glow}" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="2.6"/></filter></defs>
    <g transform="rotate(-32 50 52)">
      <rect x="-2" y="46" width="30" height="9" rx="4.5" fill="#5FE3F0" filter="url(#${glow})"/>
      <rect x="2" y="48.5" width="24" height="4" rx="2" fill="#E9FDFF"/>
      <path d="M19 50.5L37 39V62Z" fill="url(#${gold})" stroke="#8A5A00" stroke-width="1.6" stroke-linejoin="round"/>
      <path d="M25 47.6l7-4.4M26.5 53.4l9-5.6M29.5 58.2l6.5-4" stroke="#8A5A00" stroke-width="1.6" stroke-linecap="round"/>
      <rect x="35" y="38" width="28" height="25" rx="6" fill="url(#${steel})" stroke="#5E6A86" stroke-width="1.8"/>
      <rect x="42" y="38" width="5.5" height="25" fill="#E8473F"/>
      <rect x="37" y="40.5" width="24" height="4" rx="2" fill="#fff" opacity=".65"/>
      <path d="M66 61L59.5 86Q58.5 92 65 92H73Q79 92 80 86L83 61Z" fill="#2B3577" stroke="#141B4D" stroke-width="2" stroke-linejoin="round"/>
      <path d="M64 70h15M63 76h15M62 82h15" stroke="#4B5AA8" stroke-width="2.4" stroke-linecap="round"/>
      <rect x="59" y="33" width="33" height="33" rx="10" fill="url(#${white})" stroke="#A9B2C5" stroke-width="2"/>
      <circle cx="82" cy="44" r="5.2" fill="#0E1838"/><circle cx="82" cy="44" r="3.4" fill="#5FE3F0"/>
      <rect x="63" y="36.5" width="22" height="4" rx="2" fill="#fff" opacity=".85"/>
      <rect x="64" y="53" width="13" height="6" rx="3" fill="#E8473F"/>
    </g></svg>`;
}

export function tractorSvg(): string {
  const arm = uid('ar'), claw = uid('cl'), gem = uid('gm');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs>
    <linearGradient id="${arm}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFE08A"/><stop offset=".55" stop-color="#F6B934"/><stop offset="1" stop-color="#D08A12"/></linearGradient>
    <linearGradient id="${claw}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#EEF2FA"/><stop offset="1" stop-color="#97A3BD"/></linearGradient>
    <radialGradient id="${gem}" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#9FD0F5"/><stop offset=".6" stop-color="#0774CA"/><stop offset="1" stop-color="#065FA6"/></radialGradient></defs>
    <rect x="70" y="6" width="26" height="14" rx="5" fill="#2B3577" stroke="#141B4D" stroke-width="2"/>
    <path d="M80 18L66 42" stroke="#141B4D" stroke-width="15" stroke-linecap="round"/>
    <path d="M80 18L66 42" stroke="url(#${arm})" stroke-width="11" stroke-linecap="round"/>
    <path d="M66 42L44 50" stroke="#141B4D" stroke-width="14" stroke-linecap="round"/>
    <path d="M66 42L44 50" stroke="url(#${arm})" stroke-width="10" stroke-linecap="round"/>
    <circle cx="80" cy="18" r="7" fill="#2B3577" stroke="#141B4D" stroke-width="2"/><circle cx="80" cy="18" r="2.6" fill="#5FE3F0"/>
    <circle cx="66" cy="42" r="7.5" fill="#2B3577" stroke="#141B4D" stroke-width="2"/><circle cx="66" cy="42" r="2.8" fill="#5FE3F0"/>
    <path d="M78 15l-6 10" stroke="#fff" stroke-width="2.5" stroke-linecap="round" opacity=".7"/>
    <circle cx="42" cy="51" r="9" fill="url(#${claw})" stroke="#56627E" stroke-width="2"/>
    <path d="M35 56Q22 58 20 71Q19 78 25 81L29 77Q25 74 27 69Q30 63 38 62Z" fill="url(#${claw})" stroke="#56627E" stroke-width="2" stroke-linejoin="round"/>
    <path d="M47 59Q55 70 49 81Q46 86 40 85L41 80Q45 79 45 74Q46 67 41 62Z" fill="url(#${claw})" stroke="#56627E" stroke-width="2" stroke-linejoin="round"/>
    <path d="M36 66L44 72L36 80L28 72Z" fill="url(#${gem})" stroke="#77B3E2" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M36 66L40 72H32Z" fill="#fff" opacity=".45"/>
    <circle cx="39" cy="48" r="2.4" fill="#fff" opacity=".8"/></svg>`;
}

export function ionSvg(): string {
  const body = uid('bd'), ring = uid('rg'), glow = uid('gl');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs>
    <linearGradient id="${body}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5967B8"/><stop offset=".55" stop-color="#2B3577"/><stop offset="1" stop-color="#18205A"/></linearGradient>
    <linearGradient id="${ring}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#3FB7D2"/><stop offset=".5" stop-color="#B8F6FF"/><stop offset="1" stop-color="#3FB7D2"/></linearGradient>
    <filter id="${glow}" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="3"/></filter></defs>
    <path d="M22 92L32 70H58L68 92Z" fill="#2B3577" stroke="#141B4D" stroke-width="2" stroke-linejoin="round"/>
    <rect x="18" y="88" width="54" height="8" rx="4" fill="#4B5AA8" stroke="#141B4D" stroke-width="2"/>
    <circle cx="45" cy="66" r="15" fill="url(#${body})" stroke="#141B4D" stroke-width="2"/>
    <g transform="rotate(-38 45 66)">
      <rect x="44" y="55" width="44" height="22" rx="7" fill="url(#${body})" stroke="#141B4D" stroke-width="2"/>
      <rect x="54" y="53" width="6" height="26" rx="3" fill="url(#${ring})" stroke="#1F6F86" stroke-width="1.2"/>
      <rect x="66" y="53" width="6" height="26" rx="3" fill="url(#${ring})" stroke="#1F6F86" stroke-width="1.2"/>
      <rect x="47" y="58" width="36" height="4" rx="2" fill="#fff" opacity=".35"/>
      <rect x="86" y="58" width="8" height="16" rx="3" fill="#18205A" stroke="#141B4D" stroke-width="1.5"/>
      <circle cx="98" cy="66" r="9" fill="#5FE3F0" filter="url(#${glow})"/>
      <circle cx="98" cy="66" r="4.5" fill="#E9FDFF"/>
    </g>
    <path d="M82 18l-4 9h6l-5 10" fill="none" stroke="#B8F6FF" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M90 30l-2 5h4l-3 6" fill="none" stroke="#B8F6FF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity=".8"/>
    <circle cx="40" cy="61" r="4" fill="#fff" opacity=".5"/></svg>`;
}

export const toolSvg = (t: ToolId): string => (t === 'drill' ? drillSvg() : t === 'tractor' ? tractorSvg() : ionSvg());

/** ion cannon direction keys: a row (横) or a column (竖) of cells with a beam through them */
export function dirSvg(dir: 'H' | 'V'): string {
  const cells = [0, 1, 2, 3].map((k) => (dir === 'H' ? `<rect x="${10 + k * 21}" y="39" width="17" height="17" rx="4" fill="#fff" opacity=".9"/>` : `<rect x="39" y="${10 + k * 21}" width="17" height="17" rx="4" fill="#fff" opacity=".9"/>`)).join('');
  const beam = dir === 'H' ? '<rect x="4" y="44.5" width="92" height="6" rx="3" fill="#5FE3F0"/>' : '<rect x="44.5" y="4" width="6" height="92" rx="3" fill="#5FE3F0"/>';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${cells}${beam}</svg>`;
}
