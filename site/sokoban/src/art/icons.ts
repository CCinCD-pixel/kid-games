/**
 * Game icons on the design system's 32-grid solid spec (currentColor): crate (push counter,
 * chapter tabs), crate-plus (随机新仓库), hangar (机库). Kit icons cover undo/redo/restart/map/….
 * Platform request §8.12 #9 (add `crate`, `hangar` to the kit).
 */
export const GAME_ICONS = {
  crate: '<path d="M6.5 8.2 16 4.4l9.5 3.8v13.6L16 26.4 6.5 21.8Z" fill="currentColor"/><path d="M6.5 8.2 16 12l9.5-3.8M16 12v14.4" fill="none" stroke="var(--xg-icon-cut, rgba(0,0,0,.22))" stroke-width="1.8" stroke-linejoin="round"/><path d="M11 6.4l9.5 3.9v4.3" fill="none" stroke="var(--xg-icon-cut, rgba(0,0,0,.22))" stroke-width="1.6"/>',
  'crate-plus': '<path d="M5 9.2 14 5.6l9 3.6v12.9L14 26.4 5 22.1Z" fill="currentColor"/><path d="M5 9.2 14 12.8l9-3.6M14 12.8v13.6" fill="none" stroke="var(--xg-icon-cut, rgba(0,0,0,.22))" stroke-width="1.7"/><circle cx="24.5" cy="23.5" r="6" fill="currentColor"/><path d="M24.5 20.5v6M21.5 23.5h6" stroke="var(--xg-icon-on, #fff)" stroke-width="2.2" stroke-linecap="round"/>',
  hangar: '<path d="M4 27V14.5L16 6l12 8.5V27Z" fill="currentColor"/><rect x="10" y="16.5" width="12" height="10.5" rx="2" fill="var(--xg-icon-cut, rgba(0,0,0,.22))"/><rect x="12.5" y="18.5" width="7" height="5" rx="2" fill="currentColor"/><circle cx="14.5" cy="21" r="1" fill="var(--xg-icon-on, #fff)"/><circle cx="17.5" cy="21" r="1" fill="var(--xg-icon-on, #fff)"/>',
} as const;

export type GameIconName = keyof typeof GAME_ICONS;

export function gameIcon(name: GameIconName, cls = ''): string {
  return `<span class="xg-icon ${cls}" aria-hidden="true"><svg viewBox="0 0 32 32">${GAME_ICONS[name]}</svg></span>`;
}
