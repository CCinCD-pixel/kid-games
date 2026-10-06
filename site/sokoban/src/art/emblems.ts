/**
 * Chapter emblems (spec §6.4): 96-grid badges in the design system's emblem style — a rounded paper
 * tile in the route colour, a cream rim, stacked kraft crates (one per crate the chapter adds) and
 * the chapter number on a gold coin. ch0–4 + 经典仓库, plus the 跳级考试 (考) and 随机新仓库 (新) plates.
 */
const CRATE = (x: number, y: number, s: number, fill = '#A27038') =>
  `<g transform="translate(${x} ${y}) scale(${s})"><rect x="-14" y="-12" width="28" height="24" rx="4" fill="#74491E"/><rect x="-14" y="-16" width="28" height="22" rx="4" fill="${fill}"/><rect x="-2" y="-16" width="4" height="28" fill="#F9A726"/><path d="M-14 6H14" stroke="#4A2D12" stroke-width="1.5" opacity=".6"/><rect x="-14" y="-16" width="28" height="28" rx="4" fill="none" stroke="#4A2D12" stroke-width="2"/></g>`;

interface EmblemSpec {
  bg: [string, string];
  crates: number;
  label: string;
  retro?: boolean;
}

const SPECS: Record<string, EmblemSpec> = {
  ch0: { bg: ['#35468C', '#26346E'], crates: 1, label: '0' },
  ch1: { bg: ['#35468C', '#26346E'], crates: 1, label: '1' },
  ch2: { bg: ['#2C5C85', '#1F4A6E'], crates: 2, label: '2' },
  ch3: { bg: ['#2C5C85', '#1F4A6E'], crates: 2, label: '3' },
  ch4: { bg: ['#4E3A66', '#3B2A4F'], crates: 3, label: '4' },
  classic: { bg: ['#5E5070', '#4B3F58'], crates: 2, label: '旧', retro: true },
  cert: { bg: ['#35468C', '#26346E'], crates: 1, label: '考' },
  random: { bg: ['#0F7466', '#0A4F45'], crates: 2, label: '新' },
};

let uid = 0;

export function chapterEmblem(key: string, size = 96): string {
  const sp = SPECS[key] ?? SPECS.ch0;
  const id = `sokem${++uid}`;
  const crates =
    sp.crates === 1 ? CRATE(48, 58, 1.25)
    : sp.crates === 2 ? CRATE(36, 62, 1.05, sp.retro ? '#8C6A48' : undefined) + CRATE(60, 62, 1.05, sp.retro ? '#9C7752' : undefined)
    : CRATE(34, 66, 0.95) + CRATE(62, 66, 0.95) + CRATE(48, 42, 0.95);
  const tool = key === 'ch3'
    ? `<g transform="translate(70 36)"><circle r="9" fill="none" stroke="#FFF6E3" stroke-width="3.4"/><path d="M6 6l7 7" stroke="#FFF6E3" stroke-width="4" stroke-linecap="round"/></g>`
    : key === 'cert'
      ? `<g transform="translate(72 30)"><path d="M-5 6L-9 18L-2 14L1 20L2 8Z M5 6L9 18L2 14L-1 20L-2 8Z" fill="#E4513D"/><circle r="9" fill="#F6B934" stroke="#FFF6E3" stroke-width="2"/></g>`
      : key === 'random'
        ? `<g transform="translate(72 28)"><circle r="10" fill="#FFF6E3"/><path d="M0 -6V6M-6 0H6" stroke="#0F7466" stroke-width="3.4" stroke-linecap="round"/></g>`
        : '';
  return `<svg class="sok-emblem" viewBox="0 0 96 96" width="${size}" height="${size}" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sp.bg[0]}"/><stop offset="1" stop-color="${sp.bg[1]}"/></linearGradient></defs>
  <rect x="3" y="5" width="90" height="90" rx="24" fill="#070B1F" opacity=".35"/>
  <rect x="3" y="2" width="90" height="90" rx="24" fill="url(#${id})"/>
  <rect x="5" y="4" width="86" height="86" rx="22" fill="none" stroke="#E8D5B1" stroke-width="2" opacity=".75"/>
  <circle cx="22" cy="20" r="1.4" fill="#FFF6E3" opacity=".8"/><circle cx="76" cy="16" r="1" fill="#FFF6E3" opacity=".7"/>
  <path d="M6 76Q48 66 90 76V80Q90 88 82 88H14Q6 88 6 80Z" fill="#131B42" opacity=".55"/>
  ${crates}${tool}
  <g transform="translate(22 72)"><circle r="12" fill="#DF9A1C"/><circle r="10.5" fill="#F6B934"/><text y="5.5" text-anchor="middle" font-family="Baloo 2, system-ui, sans-serif" font-weight="800" font-size="${sp.label.length > 1 || /[^\d]/.test(sp.label) ? 12 : 16}" fill="#5A3600">${sp.label}</text></g>
  </svg>`;
}
