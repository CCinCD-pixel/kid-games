/**
 * The four robot opponents (spec §6.6): the design-system robot head with its own shell colour plus a
 * hat drawn by this game as an overlay in the head's own viewBox (28 0 184 151) — kit has no
 * accessory mount yet (kit request #4). Abstract hats only: no real insignia.
 */
import { mount, type Companion } from '@kit/companion';

export interface Opponent {
  level: 1 | 2 | 3 | 4;
  name: string;
  title: string;
  shell: string;
  led: string;
  line: string;
}
export const OPPONENTS: Opponent[] = [
  { level: 1, name: '豆豆', title: '新兵', shell: '#9bb36a', led: '#d8ff9e', line: 'mc.opp.1' },
  { level: 2, name: '铁蛋', title: '排长', shell: '#8ea4bd', led: '#9fe3ff', line: 'mc.opp.2' },
  { level: 3, name: '雷达', title: '团长', shell: '#6f7b47', led: '#ffe28a', line: 'mc.opp.3' },
  { level: 4, name: '老将', title: '司令', shell: '#5f6673', led: '#ffd36b', line: 'mc.opp.4' },
];

const HATS: Record<1 | 2 | 3 | 4, string> = {
  // 小钢盔: a round dome with a rim and a soft highlight
  1: `<path d="M60 64C60 30 88 16 120 16s60 14 60 48z" fill="#5f7038" stroke="#3c4a20" stroke-width="2"/>
      <path d="M52 64h136c3 0 5 3 4 6l-1 2H49l-1-2c-1-3 1-6 4-6z" fill="#4c5b2b" stroke="#3c4a20" stroke-width="1.6"/>
      <path d="M78 46c6-14 20-22 38-24" stroke="#fff" stroke-opacity=".45" stroke-width="5" stroke-linecap="round" fill="none"/>
      <circle cx="120" cy="40" r="5" fill="#c9b46a"/>`,
  // 斜戴贝雷帽: a soft tilted blob, a little stalk and a round badge
  2: `<path d="M58 60c-6-22 18-42 58-44 40-2 70 12 70 30 0 10-10 16-24 18-30 4-74 4-104-4z" fill="#b8473c" stroke="#7c2a22" stroke-width="2"/>
      <path d="M60 58c34 8 74 8 106 2" stroke="#7c2a22" stroke-width="5" stroke-linecap="round" fill="none"/>
      <path d="M112 16c2-6 8-8 12-6" stroke="#7c2a22" stroke-width="4" stroke-linecap="round" fill="none"/>
      <path d="M82 36c10-10 26-14 44-14" stroke="#fff" stroke-opacity=".35" stroke-width="4" stroke-linecap="round" fill="none"/>
      <circle cx="84" cy="46" r="7" fill="#f2c94c" stroke="#a8730f" stroke-width="1.5"/>`,
  // 大檐帽 + a tiny radar dish on top
  3: `<path d="M64 52c0-18 26-28 56-28s56 10 56 28v6H64z" fill="#4d5a2c" stroke="#2f3a17" stroke-width="2"/>
      <path d="M46 60c20-6 128-6 148 0-4 8-24 12-74 12S50 68 46 60z" fill="#2f3a17"/>
      <rect x="64" y="50" width="112" height="8" fill="#c9a84a"/>
      <path d="M120 24v-8" stroke="#2f3a17" stroke-width="3"/>
      <path d="M104 14c8-10 24-10 32 0-8 6-24 6-32 0z" fill="#d8dde6" stroke="#7d8696" stroke-width="1.6"/>
      <circle cx="120" cy="12" r="2.6" fill="#f6b934"/>`,
  // 大檐帽 with gold trim and two abstract wheat ears
  4: `<path d="M62 52c0-20 26-30 58-30s58 10 58 30v6H62z" fill="#3d434e" stroke="#22262e" stroke-width="2"/>
      <path d="M44 60c22-7 130-7 152 0-4 9-26 13-76 13S48 69 44 60z" fill="#22262e"/>
      <rect x="62" y="49" width="116" height="9" fill="#e8b93c"/>
      <path d="M96 44c6-8 14-12 24-12M144 44c-6-8-14-12-24-12" stroke="#e8b93c" stroke-width="3" stroke-linecap="round" fill="none"/>
      <g fill="#e8b93c"><ellipse cx="100" cy="38" rx="3.4" ry="2" transform="rotate(-35 100 38)"/><ellipse cx="106" cy="34" rx="3.4" ry="2" transform="rotate(-25 106 34)"/><ellipse cx="140" cy="38" rx="3.4" ry="2" transform="rotate(35 140 38)"/><ellipse cx="134" cy="34" rx="3.4" ry="2" transform="rotate(25 134 34)"/></g>
      <path d="M120 26l3 6 6 1-4.5 4 1 6-5.5-3-5.5 3 1-6-4.5-4 6-1z" fill="#ffd96b" stroke="#a8730f" stroke-width="1"/>`,
};

/** mount an opponent's head (robot + hat) into `host`; size = rendered width in px */
export function mountOpponent(host: HTMLElement, level: 1 | 2 | 3 | 4, size: number, mood: 'idle' | 'happy' | 'thinking' = 'idle'): Companion {
  const o = OPPONENTS[level - 1];
  host.classList.add('mc-opp');
  host.style.position = host.style.position || 'relative';
  const bot = mount(host, { size, variant: 'head', shell: o.shell, led: o.led, antenna: 'orb', mood, name: o.name });
  const hat = document.createElement('div');
  hat.className = 'mc-hat';
  hat.innerHTML = `<svg viewBox="28 0 184 151" width="${size}" height="${(size * 151) / 184}" aria-hidden="true">${HATS[level]}</svg>`;
  host.appendChild(hat);
  const destroy = bot.destroy.bind(bot);
  bot.destroy = () => {
    destroy();
    hat.remove();
  };
  return bot;
}

/** static avatar markup (no animation) for small places (turn bar, result page) */
export function opponentBadge(level: 1 | 2 | 3 | 4, size = 40): string {
  const o = OPPONENTS[level - 1];
  return `<svg viewBox="28 0 184 151" width="${size}" height="${Math.round((size * 151) / 184)}" aria-hidden="true">
    <rect x="56" y="36" width="128" height="114" rx="50" fill="${o.shell}" stroke="rgba(0,0,0,.35)" stroke-width="2"/>
    <rect x="70" y="58" width="100" height="76" rx="30" fill="#121a3d"/>
    <g fill="${o.led}"><circle cx="100" cy="92" r="7"/><circle cx="140" cy="92" r="7"/><rect x="104" y="112" width="32" height="6" rx="3"/></g>
    ${HATS[level]}</svg>`;
}
