/**
 * 星港 paper-cut Mars-base art (code-drawn SVG, flat layered paper with a soft cut shadow; no bitmaps, no filters, no emoji).
 * Building sites share one paper-cut scale. Palette variables are defined in styles.css under [data-xg-game="mars"].
 */
export type SiteId = 'orbit' | 'cert' | 'vault' | 'factory' | 'balance' | 'puzzle' | 'race' | 'archive' | 'pets';
export const SITE_NAME: Record<SiteId, string> = { orbit: '轨道站', cert: '徽章站', vault: '千晶大仓', factory: '生产线', balance: '称重台', puzzle: '谜题舱', race: '火箭赛道', archive: '档案馆', pets: '宠物舱' };
const S = 'stroke="var(--mb-cut)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"';
const sh = (d: string) => `<path d="${d}" transform="translate(4 6)" fill="var(--mb-shadow)"/>`;

/** Each building is drawn in a 120×120 box; `tier` 1–3 adds parts (never removes: the base never goes backwards). */
export function buildingSvg(id: SiteId, tier: number, lit = false): string {
  const t = Math.max(1, Math.min(3, tier)); const glow = lit ? '<circle cx="60" cy="60" r="56" fill="var(--mb-glow)" opacity=".35"/>' : '';
  let g = '';
  switch (id) {
    case 'orbit':
      g = `${sh('M30 112 L60 36 L90 112Z')}<path d="M30 112 L60 36 L90 112Z" fill="var(--mb-steel)" ${S}/><path d="M42 84h36M48 66h24" stroke="var(--mb-cut)" stroke-width="3" fill="none"/>`
        + `<g transform="rotate(-24 60 34)"><path d="M34 34 Q60 6 86 34 Z" fill="var(--mb-paper)" ${S}/><circle cx="60" cy="30" r="4" fill="var(--mb-mars)"/></g>`
        + (t >= 2 ? `<path d="M92 20 q12 10 0 22M100 12 q20 18 0 38" fill="none" stroke="var(--mb-glow)" stroke-width="3" stroke-linecap="round"/>` : '')
        + (t >= 3 ? `<rect x="22" y="96" width="22" height="16" rx="3" fill="var(--mb-paper)" ${S}/><circle cx="33" cy="104" r="3" fill="var(--mb-led)"/>` : '');
      break;
    case 'cert':
      g = `${sh('M18 112 Q18 50 60 44 Q102 50 102 112Z')}<path d="M18 112 Q18 50 60 44 Q102 50 102 112Z" fill="var(--mb-paper)" ${S}/><path d="M60 44 v-16" ${S}/><circle cx="60" cy="26" r="5" fill="var(--mb-led)" ${S}/>`
        + `<path d="M46 112 V98 Q46 84 60 84 Q74 84 74 98 V112Z" fill="var(--mb-dark)" ${S}/><circle cx="60" cy="72" r="13" fill="var(--mb-gold)" ${S}/><path d="M54 72 l5 5 9-10" fill="none" stroke="var(--mb-cut)" stroke-width="3.5"/>`
        + (t >= 2 ? '<path d="M30 92h14M76 92h14" stroke="var(--mb-cut)" stroke-width="3"/>' : '') + (t >= 3 ? '<circle cx="60" cy="72" r="19" fill="none" stroke="var(--mb-gold)" stroke-width="3" stroke-dasharray="4 5"/>' : '');
      break;
    case 'vault':
      g = `${sh('M20 112 V52 Q60 34 100 52 V112Z')}<path d="M20 112 V52 Q60 34 100 52 V112Z" fill="var(--mb-steel)" ${S}/><path d="M20 70 Q60 52 100 70M20 90 Q60 72 100 90" fill="none" stroke="var(--mb-cut)" stroke-width="2.5"/>`
        + `<rect x="44" y="88" width="32" height="24" rx="4" fill="var(--mb-dark)" ${S}/><path d="M50 84 l6-14 6 14z M66 84 l5-10 5 10z" fill="var(--mb-gem)" ${S}/>`
        + (t >= 2 ? `<rect x="24" y="96" width="14" height="16" rx="2" fill="var(--mb-jade)" ${S}/><rect x="82" y="96" width="14" height="16" rx="2" fill="var(--mb-jade)" ${S}/>` : '') + (t >= 3 ? `<path d="M60 36 l-8-14 16 0z" fill="var(--mb-gem)" ${S}/>` : '');
      break;
    case 'factory':
      g = `${sh('M14 112 V62 L38 44 V62 L62 44 V62 L86 44 V112Z')}<path d="M14 112 V62 L38 44 V62 L62 44 V62 L86 44 V112Z" fill="var(--mb-paper)" ${S}/><rect x="84" y="22" width="14" height="42" rx="3" fill="var(--mb-mars)" ${S}/>`
        + `<rect x="26" y="78" width="14" height="14" rx="2" fill="var(--mb-glow)" ${S}/><rect x="50" y="78" width="14" height="14" rx="2" fill="var(--mb-glow)" ${S}/><path d="M10 112h100" stroke="var(--mb-cut)" stroke-width="4"/>`
        + (t >= 2 ? '<path d="M70 106h40" stroke="var(--mb-gold)" stroke-width="6" stroke-dasharray="8 6"/>' : '') + (t >= 3 ? '<circle cx="92" cy="14" r="6" fill="var(--mb-dust)" opacity=".7"/><circle cx="102" cy="6" r="4" fill="var(--mb-dust)" opacity=".5"/>' : '');
      break;
    case 'balance':
      g = `${sh('M54 112 V44 H66 V112Z')}<rect x="52" y="44" width="16" height="68" rx="4" fill="var(--mb-steel)" ${S}/><path d="M16 50 L104 40" stroke="var(--mb-cut)" stroke-width="6" stroke-linecap="round"/><path d="M16 50 v26 M104 40 v26" stroke="var(--mb-cut)" stroke-width="2"/>`
        + `<path d="M4 76 h28 a14 14 0 0 1 -28 0z M92 66 h28 a14 14 0 0 1 -28 0z" fill="var(--mb-paper)" ${S}/><circle cx="60" cy="40" r="8" fill="var(--mb-gold)" ${S}/>`
        + (t >= 2 ? '<rect x="42" y="100" width="36" height="12" rx="3" fill="var(--mb-dark)" stroke="var(--mb-cut)" stroke-width="2"/>' : '');
      break;
    case 'puzzle':
      g = `${sh('M60 30 L100 52 V96 L60 118 L20 96 V52Z')}<path d="M60 30 L100 52 V96 L60 118 L20 96 V52Z" fill="var(--mb-violet)" ${S}/><path d="M60 30 V74 M20 52 L60 74 L100 52" fill="none" stroke="var(--mb-cut)" stroke-width="2.5"/>`
        + `<path d="M60 74 v44" stroke="var(--mb-cut)" stroke-width="2.5"/><circle cx="60" cy="74" r="9" fill="var(--mb-gold)" ${S}/>` + (t >= 2 ? '<path d="M60 22 v-10" stroke="var(--mb-cut)" stroke-width="3"/><circle cx="60" cy="10" r="4" fill="var(--mb-led)"/>' : '');
      break;
    case 'race':
      g = `${sh('M44 112 V30 H52 V112Z M84 112 V50 H92 V112Z')}<path d="M44 112 V30 H52 V112Z M84 112 V50 H92 V112Z" fill="var(--mb-steel)" ${S}/><path d="M52 44 h32 M52 70 h32" stroke="var(--mb-cut)" stroke-width="3"/>`
        + `<path d="M68 24 Q76 40 76 70 H60 Q60 40 68 24Z" fill="var(--mb-paper)" ${S}/><path d="M60 70 l-8 14 8-4z M76 70 l8 14-8-4z" fill="var(--mb-mars)" ${S}/><circle cx="68" cy="46" r="5" fill="var(--mb-glow)" ${S}/>`
        + (t >= 2 ? '<path d="M24 112h80" stroke="var(--mb-cut)" stroke-width="4"/>' : '') + (t >= 3 ? '<path d="M68 90 q-6 14 0 24 q6-10 0-24z" fill="var(--mb-gold)"/>' : '');
      break;
    case 'archive':
      g = `${sh('M22 112 V64 H98 V112Z')}<rect x="22" y="64" width="76" height="48" rx="6" fill="var(--mb-paper)" ${S}/><circle cx="60" cy="60" r="28" fill="var(--mb-dark)" ${S}/><circle cx="60" cy="60" r="18" fill="none" stroke="var(--mb-glow)" stroke-width="2.5" stroke-dasharray="3 4"/>`
        + `<circle cx="60" cy="60" r="4" fill="var(--mb-gold)"/><rect x="48" y="90" width="24" height="22" rx="3" fill="var(--mb-dark)" ${S}/>` + (t >= 2 ? '<path d="M104 52 l8-14 8 14z" fill="var(--mb-gold)" stroke="var(--mb-cut)" stroke-width="2"/>' : '');
      break;
    case 'pets':
      g = `${sh('M18 112 V58 Q18 20 60 20 Q102 20 102 58 V112Z')}<path d="M18 112 V58 Q18 20 60 20 Q102 20 102 58 V112Z" fill="var(--mb-paper)" ${S}/>`
        + `<path d="M30 70 Q30 36 60 36 Q90 36 90 70Z" fill="var(--mb-jade)" ${S}/><circle cx="60" cy="58" r="18" fill="var(--mb-dark)" ${S}/><circle cx="54" cy="56" r="3" fill="var(--mb-glow)"/><circle cx="66" cy="56" r="3" fill="var(--mb-glow)"/><path d="M54 66 Q60 72 66 66" fill="none" stroke="var(--mb-glow)" stroke-width="2"/>`
        + `<path d="M44 112 V90 Q60 80 76 90 V112Z" fill="var(--mb-mars)" ${S}/>`
        + (t >= 2 ? '<path d="M28 36 l-8-14 M92 36 l8-14" stroke="var(--mb-cut)" stroke-width="3"/>' : '')
        + (t >= 3 ? '<path d="M36 14 l8-6 6 8 M70 16 l6-8 8 6" fill="var(--mb-glow)" stroke="var(--mb-cut)" stroke-width="2"/>' : '');
      break;
  }
  return `<svg class="bld" viewBox="-6 -6 132 132" aria-hidden="true">${glow}${g}</svg>`;
}
/** An unbuilt site: the ghost of the future building inside a scaffold with a crane and a sign (v1 does not build 称重台 / 谜题舱 / 火箭赛道 yet) — reads as "being built", not as an empty lot. */
export const plotSvg = (id: SiteId = 'balance'): string => {
  const ghost = buildingSvg(id, 1).replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
  const poles = `<path d="M14 112 V40 M106 112 V40 M14 70 H106 M14 40 H106 M14 70 L60 40 L106 70 M14 112 L60 70 L106 112" fill="none" stroke="var(--mb-dust)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
  const crane = `<path d="M96 40 V6 H44 M96 6 L112 6" fill="none" stroke="var(--mb-gold)" stroke-width="4" stroke-linecap="round"/><path d="M52 6 V22" stroke="var(--mb-cut)" stroke-width="2"/><path d="M46 22 h12 l-3 8 h-6z" fill="var(--mb-gold)" stroke="var(--mb-cut)" stroke-width="2" stroke-linejoin="round"/>`;
  const sign = `<g class="bld-sign"><rect x="34" y="92" width="52" height="20" rx="4" fill="var(--mb-gold)" stroke="var(--mb-cut)" stroke-width="2"/><path d="M40 112 l8-20 M54 112 l8-20 M68 112 l8-20" stroke="var(--mb-cut)" stroke-width="3"/></g>`;
  return `<svg class="bld bld--plot" viewBox="-6 -6 132 132" aria-hidden="true"><g opacity=".34">${ghost}</g>${poles}${crane}${sign}</svg>`;
};
/** The lander on its pad (opening scene, S0a): paper-cut legs, hull and a window lamp. */
export const landerSvg = (): string => `<svg class="bld bld--lander" viewBox="0 0 120 120" aria-hidden="true"><path d="M30 112 L42 84 M90 112 L78 84" stroke="var(--mb-cut)" stroke-width="5" stroke-linecap="round"/><path d="M22 114 h22 M76 114 h22" stroke="var(--mb-cut)" stroke-width="5" stroke-linecap="round"/><path d="M36 84 Q36 36 60 24 Q84 36 84 84Z" fill="var(--mb-paper)" stroke="var(--mb-cut)" stroke-width="2.5" stroke-linejoin="round"/><circle cx="60" cy="56" r="12" fill="var(--mb-dark)" stroke="var(--mb-cut)" stroke-width="2.5"/><circle cx="60" cy="56" r="7" fill="var(--mb-glow)"/><path d="M36 76 h48" stroke="var(--mb-cut)" stroke-width="2.5"/><path d="M60 24 V10" stroke="var(--mb-cut)" stroke-width="3" stroke-linecap="round"/><circle cx="60" cy="8" r="4" fill="var(--mb-led)" stroke="var(--mb-cut)" stroke-width="2"/></svg>`;
/** Background landscape: dusk sky, stars, far ranges, ground layers, the lander on the pad. */
export function sceneSvg(w: number, h: number): string {
  const gy = h * 0.62;
  const range = (y: number, amp: number, seed: number, fill: string) => { let d = `M0 ${h} L0 ${y}`; for (let i = 0; i <= 12; i++) d += ` L${(w * i) / 12} ${y - amp * (0.5 + 0.5 * Math.sin(seed + i * 1.7)) - (i % 2) * amp * 0.25}`; return `<path d="${d} L${w} ${h}Z" fill="${fill}"/>`; };
  let stars = ''; for (let i = 0; i < 26; i++) { const x = (i * 97.3 + 31) % w, y = ((i * 53.7) % (gy * 0.7)) + 8; stars += `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${(i % 3) * 0.5 + 0.9}" fill="var(--xg-moon-100)" opacity="${(0.4 + (i % 4) * 0.15).toFixed(2)}"/>`; }
  return `<svg class="scene" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><defs><linearGradient id="mbSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--mb-sky-0)"/><stop offset=".62" stop-color="var(--mb-sky-1)"/><stop offset="1" stop-color="var(--mb-sky-2)"/></linearGradient></defs>`
    + `<rect width="${w}" height="${h}" fill="url(#mbSky)"/>${stars}<circle cx="${w * 0.82}" cy="${gy * 0.34}" r="${Math.min(w, h) * 0.05}" fill="var(--mb-sun)" opacity=".9"/>`
    + range(gy - 6, h * 0.1, 0.4, 'var(--mb-far)') + range(gy + 14, h * 0.07, 2.1, 'var(--mb-mid)') + range(gy + h * 0.1, h * 0.04, 4.2, 'var(--mb-near)')
    + `<path d="M0 ${h * 0.82} Q${w * 0.5} ${h * 0.74} ${w} ${h * 0.84} V${h} H0Z" fill="var(--mb-ground)"/><ellipse cx="${w * 0.5}" cy="${h * 0.9}" rx="${w * 0.2}" ry="${h * 0.035}" fill="var(--mb-pad)"/></svg>`;
}
