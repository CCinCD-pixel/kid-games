/**
 * Game icons (spec §6.5): 32-grid, currentColor, drawn in code. `mcIcon(name)` returns an <svg>
 * string; `iconPaths(name)` the inner markup (for embedding in tiles/badges).
 */
export type McIcon =
  | 'bomb' | 'mine' | 'flag' | 'shovel' | 'train' | 'tent' | 'roof' | 'mountain' | 'swords' | 'shield' | 'smoke'
  | 'lock' | 'eye' | 'feet' | 'whistle' | 'hands' | 'dice' | 'swap' | 'flipcard' | 'scale' | 'dots' | 'star' | 'crown';

const P: Record<McIcon, string> = {
  bomb: `<circle cx="14" cy="19" r="9.5" fill="currentColor"/><circle cx="10.5" cy="15.5" r="2.6" fill="#fff" opacity=".35"/><path d="M20 11.5l3-3" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M23.5 8.2c1-2.6 3.4-2.8 4.6-1.4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M27.5 3.5l.6 2.2 2.2.6-2.2.6-.6 2.2-.6-2.2-2.2-.6 2.2-.6z" fill="#f6b934"/>`,
  mine: `<ellipse cx="16" cy="19" rx="12" ry="6.5" fill="currentColor"/><ellipse cx="16" cy="16.5" rx="8" ry="3.6" fill="#fff" opacity=".28"/><path d="M5 13.5l-2-2.5M10 11l-1-3M16 10V6.5M22 11l1-3M27 13.5l2-2.5M3.5 19H1M28.5 19H31" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>`,
  flag: `<path d="M8 4.5v24" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M9.5 5.5c4.5-2 8 2.2 13.5.3l3.5-.8v12c-5.6 2.2-9.4-2-15 .5l-2 .8z" fill="currentColor"/><circle cx="8" cy="4" r="2.2" fill="currentColor"/>`,
  shovel: `<path d="M21.5 4.5l6 6-2.4 2.4-2.1-2.1-7.6 7.6 1.6 1.6c1.3 1.3 1.3 3.4 0 4.7l-3.4 3.4c-1.3 1.3-3.4 1.3-4.7 0l-4.1-4.1c-1.3-1.3-1.3-3.4 0-4.7l3.4-3.4c1.3-1.3 3.4-1.3 4.7 0l1.6 1.6 7.6-7.6-2.1-2.1z" fill="currentColor"/>`,
  train: `<rect x="6" y="5" width="20" height="18" rx="5" fill="currentColor"/><rect x="9.5" y="8.5" width="13" height="6" rx="2" fill="#fff" opacity=".45"/><circle cx="11" cy="19" r="1.8" fill="#fff" opacity=".6"/><circle cx="21" cy="19" r="1.8" fill="#fff" opacity=".6"/><path d="M9 23l-3 5M23 23l3 5M7.5 27h17" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>`,
  tent: `<path d="M16 5L3.5 26h25z" fill="currentColor"/><path d="M16 12l-5 14h10z" fill="#fff" opacity=".4"/><path d="M16 5V2.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>`,
  roof: `<path d="M3 15L16 5l13 10" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/><rect x="7.5" y="15" width="17" height="12" rx="2" fill="currentColor"/><rect x="13.5" y="19" width="5" height="8" fill="#fff" opacity=".45"/>`,
  mountain: `<path d="M2 27l9-15 5 7 4-6 10 14z" fill="currentColor"/><path d="M11 12l-2 4 2-1 1.5 2M20 13l-1.5 3 2-.5" fill="none" stroke="#fff" stroke-width="1.5" opacity=".6"/>`,
  // one sword striking (+ a spark), not crossed swords: crossed blades read as a big ✕ = "no" (QA r2)
  swords: `<path d="M8.5 23.5L23 9" stroke="currentColor" stroke-width="4.2" stroke-linecap="round"/><path d="M20.2 6.6l7.6-2.4-2.4 7.6z" fill="currentColor"/><path d="M5.6 19.6l6.8 6.8" stroke="currentColor" stroke-width="3.6" stroke-linecap="round"/><path d="M3.6 28.4l4.2-4.2" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><path d="M27.2 15l1.3 2.6 2.6 1.3-2.6 1.3-1.3 2.6-1.3-2.6-2.6-1.3 2.6-1.3z" fill="#f6b934"/><path d="M13.8 4.2l.9 1.9 1.9.9-1.9.9-.9 1.9-.9-1.9-1.9-.9 1.9-.9z" fill="#f6b934"/>`,
  shield: `<path d="M16 3.5l11 4v8c0 7-5 11.5-11 13.5C10 27 5 22.5 5 15.5v-8z" fill="currentColor"/><path d="M16 7.5l7 2.6v5.6c0 4.6-3 7.8-7 9.4z" fill="#fff" opacity=".3"/>`,
  smoke: `<circle cx="11" cy="18" r="6" fill="currentColor"/><circle cx="19" cy="14" r="7" fill="currentColor"/><circle cx="22" cy="21" r="5" fill="currentColor"/><circle cx="14" cy="23" r="4.5" fill="currentColor"/><circle cx="17" cy="12" r="2.5" fill="#fff" opacity=".35"/>`,
  lock: `<rect x="6" y="13.5" width="20" height="14" rx="4" fill="currentColor"/><path d="M10.5 13.5V10a5.5 5.5 0 0 1 11 0v3.5" fill="none" stroke="currentColor" stroke-width="3.4"/><circle cx="16" cy="20.5" r="2.2" fill="#fff" opacity=".5"/>`,
  eye: `<path d="M2.5 16C6 9.5 10.5 7 16 7s10 2.5 13.5 9C26 22.5 21.5 25 16 25S6 22.5 2.5 16z" fill="currentColor"/><circle cx="16" cy="16" r="5.5" fill="#fff" opacity=".9"/><circle cx="16" cy="16" r="2.8" fill="currentColor"/>`,
  feet: `<ellipse cx="10" cy="11" rx="4" ry="6" fill="currentColor"/><ellipse cx="21.5" cy="18" rx="4" ry="6" fill="currentColor"/><circle cx="10" cy="20.5" r="2.4" fill="currentColor"/><circle cx="21.5" cy="27.5" r="2.4" fill="currentColor"/>`,
  whistle: `<path d="M4 13h13l11-5v6l-6 3a8 8 0 1 1-18 1z" fill="currentColor"/><circle cx="12" cy="19" r="2.6" fill="#fff" opacity=".5"/><path d="M24.5 5.5v-3" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>`,
  hands: `<path d="M2 17l6-6 6 3 4-2 6 1 6 5-3 3-5-3-6 6c-1.4 1.4-3.6 1.4-5 0z" fill="currentColor"/><path d="M14 14l-4 4M18 16l-4 4M21 18l-3 3" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".6"/>`,
  dice: `<rect x="4.5" y="4.5" width="23" height="23" rx="6" fill="currentColor"/><g fill="#fff"><circle cx="11" cy="11" r="2.3"/><circle cx="21" cy="11" r="2.3"/><circle cx="16" cy="16" r="2.3"/><circle cx="11" cy="21" r="2.3"/><circle cx="21" cy="21" r="2.3"/></g>`,
  swap: `<path d="M6 11h18M19 5.5l5.5 5.5L19 16.5M26 21H8M13 15.5L7.5 21l5.5 5.5" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>`,
  flipcard: `<rect x="3.5" y="7" width="14" height="19" rx="3" fill="currentColor"/><rect x="14.5" y="6" width="14" height="19" rx="3" fill="currentColor" opacity=".55" transform="rotate(12 21.5 15.5)"/><path d="M8 4c4-3 9-2 11 2" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M19.5 3l.3 3.6-3.4-.6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`,
  scale: `<path d="M16 4v22M9 27h14M5 9h22" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M5 9l-3.5 8h7zM27 9l-3.5 8h7z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M1.5 17a3.5 2 0 0 0 7 0zM23.5 17a3.5 2 0 0 0 7 0z" fill="currentColor"/>`,
  dots: `<g fill="currentColor"><circle cx="5" cy="16" r="3"/><circle cx="16" cy="16" r="3"/><circle cx="27" cy="16" r="3"/></g>`,
  star: `<path d="M16 3.5l3.8 7.8 8.6 1.2-6.2 6 1.5 8.5-7.7-4-7.7 4 1.5-8.5-6.2-6 8.6-1.2z" fill="currentColor"/>`,
  crown: `<path d="M4 24l-1-14 7 6 6-10 6 10 7-6-1 14z" fill="currentColor"/><rect x="4" y="24.5" width="24" height="4" rx="2" fill="currentColor"/>`,
};

export function iconPaths(name: McIcon): string {
  return P[name];
}
export function mcIcon(name: McIcon, cls = ''): string {
  return `<svg class="mc-icon ${cls}" viewBox="0 0 32 32" aria-hidden="true">${P[name]}</svg>`;
}
