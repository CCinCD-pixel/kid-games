// 外星人: 6 silhouettes x 6 colours, parametric SVG. Identity is NEVER colour alone: every colour also carries its own belly pattern (stripes, dots, zigzag,
// ring, cross) and every silhouette its own eye count / ears / horns (spec §9.1; palette.mjs checks the colours under colour-blind simulation).
export const ALIEN_COLORS = ['#ff6a3d', '#f6b934', '#26c6b0', '#4aa3ff', '#e86bd0', '#e4e9ff'] as const;
export const ALIEN_NAMES = ['红', '黄', '青', '蓝', '粉', '银'] as const;
export const SHAPE_NAMES = ['圆球', '三角', '方块', '水滴', '长角', '六边'] as const;

const mix = (hex: string, to: number, k: number): string => {
  const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).map((c) => Math.round(c + (to - c) * k));
  return `#${v.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
};
const eye = (x: number, y: number, r = 7.5) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff"/><circle cx="${x + 1.2}" cy="${y + 1.2}" r="${r * 0.52}" fill="#1b2147"/><circle cx="${x + 2.6}" cy="${y - 0.6}" r="${r * 0.18}" fill="#fff"/>`;
const BODY: ((ac: string, ad: string) => string)[] = [
  (ac, ad) => `<circle cx="22" cy="36" r="10" fill="${ac}" stroke="${ad}" stroke-width="3"/><circle cx="78" cy="36" r="10" fill="${ac}" stroke="${ad}" stroke-width="3"/><ellipse cx="50" cy="58" rx="33" ry="31" fill="${ac}" stroke="${ad}" stroke-width="3.5"/>${eye(38, 50)}${eye(62, 50)}`,
  (ac, ad) => `<path d="M50 12C58 12 62 18 70 40L84 74C89 85 80 91 70 91H30C20 91 11 85 16 74L30 40C38 18 42 12 50 12Z" fill="${ac}" stroke="${ad}" stroke-width="3.5" stroke-linejoin="round"/>${eye(50, 52, 11)}`,
  (ac, ad) => `<path d="M50 28V14" stroke="${ad}" stroke-width="4" stroke-linecap="round"/><circle cx="50" cy="12" r="6" fill="#ffd863" stroke="${ad}" stroke-width="2.5"/><circle cx="19" cy="60" r="6" fill="${ad}"/><circle cx="81" cy="60" r="6" fill="${ad}"/><rect x="20" y="28" width="60" height="62" rx="15" fill="${ac}" stroke="${ad}" stroke-width="3.5"/><rect x="29" y="40" width="17" height="17" rx="4" fill="#fff"/><rect x="54" y="40" width="17" height="17" rx="4" fill="#fff"/><rect x="34" y="45" width="8" height="8" rx="2" fill="#1b2147"/><rect x="59" y="45" width="8" height="8" rx="2" fill="#1b2147"/>`,
  (ac, ad) => `<path d="M50 9C50 9 19 43 19 64C19 80 32 91 50 91C68 91 81 80 81 64C81 43 50 9 50 9Z" fill="${ac}" stroke="${ad}" stroke-width="3.5" stroke-linejoin="round"/>${eye(40, 62, 7)}${eye(60, 62, 7)}<circle cx="31" cy="72" r="4.5" fill="#ff9aa8" opacity=".6"/><circle cx="69" cy="72" r="4.5" fill="#ff9aa8" opacity=".6"/>`,
  (ac, ad) => `<path d="M29 36L20 9L43 27Z" fill="${ad}" stroke="${ad}" stroke-width="3" stroke-linejoin="round"/><path d="M71 36L80 9L57 27Z" fill="${ad}" stroke="${ad}" stroke-width="3" stroke-linejoin="round"/><circle cx="50" cy="58" r="33" fill="${ac}" stroke="${ad}" stroke-width="3.5"/>${eye(34, 54, 6.5)}${eye(50, 46, 6.5)}${eye(66, 54, 6.5)}`,
  (ac, ad) => `<path d="M50 11L83 30V69L50 89L17 69V30Z" fill="${ac}" stroke="${ad}" stroke-width="3.5" stroke-linejoin="round"/>${eye(38, 47, 8)}${eye(62, 47, 8)}`,
];
const PATTERN: ((ad: string, strong: boolean) => string)[] = [
  () => '',
  (ad, s) => `<g stroke="${ad}" stroke-width="${s ? 4 : 3}" stroke-linecap="round" opacity=".8"><path d="M38 69H62M36 76H64M38 83H62"/></g>`,
  (ad, s) => `<g fill="${ad}" opacity=".8"><circle cx="40" cy="72" r="${s ? 4.4 : 3.4}"/><circle cx="60" cy="72" r="${s ? 4.4 : 3.4}"/><circle cx="50" cy="80" r="${s ? 4.4 : 3.4}"/></g>`,
  (ad, s) => `<path d="M34 78L42 69L50 78L58 69L66 78" fill="none" stroke="${ad}" stroke-width="${s ? 4 : 3}" stroke-linecap="round" stroke-linejoin="round" opacity=".85"/>`,
  (ad, s) => `<circle cx="50" cy="75" r="9" fill="none" stroke="${ad}" stroke-width="${s ? 4 : 3}" opacity=".85"/>`,
  (ad, s) => `<path d="M50 66V84M41 75H59" stroke="${ad}" stroke-width="${s ? 4.4 : 3.4}" stroke-linecap="round" opacity=".85"/>`,
];
/** `<symbol>` for one (shape, colour) pair; place with <use href="#al-sc"> (fill comes from the symbol, not from CSS) */
export function alienSymbol(s: number, c: number, strongPattern = false): string {
  const ac = ALIEN_COLORS[c], ad = mix(ac, 0, 0.45);
  return `<symbol id="al-${s}${c}" viewBox="0 0 100 100">${BODY[s](ac, ad)}<ellipse cx="50" cy="76" rx="${strongPattern ? 21 : 19}" ry="${strongPattern ? 14 : 11}" fill="${mix(ac, 255, 0.35)}" opacity=".5"/>${PATTERN[c](ad, strongPattern)}</symbol>`;
}
export const alienLabel = (s: number, c: number): string => `${ALIEN_NAMES[c]}色${SHAPE_NAMES[s]}外星人`;
