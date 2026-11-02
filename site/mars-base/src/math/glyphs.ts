import type { GlyphId } from './problems';

/** Small mission pictograms: 24-unit line drawings in currentColor. */
const PATHS: Record<GlyphId, string> = {
  lamp: '<path d="M9 17h6M10 20h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
  battery: '<rect x="2.5" y="7.5" width="16" height="9" rx="2"/><path d="M21 10.5v3M11.5 9.5l-2 3h3l-2 3"/>',
  tank: '<rect x="8" y="6" width="8" height="15" rx="4"/><path d="M10 6V4h4v2M8 12h8"/>',
  barrel: '<rect x="6" y="3.5" width="12" height="17" rx="3"/><path d="M6 8.5h12M6 15.5h12"/>',
  solar: '<path d="M4 8h16l-2 8H6zM9.3 8l-.8 8M14.7 8l.8 8M5 12h14M12 16v4M9 20h6"/>',
  plug: '<path d="M9 3v5M15 3v5M7 8h10v3a5 5 0 0 1-10 0zM12 16v5"/>',
  bolt: '<path d="M13 2L5 13h6l-1 9 8-11h-6z"/>',
  crate: '<rect x="3.5" y="6" width="17" height="14" rx="1.5"/><path d="M3.5 11h17M10 11v3h4v-3"/>',
  dock: '<circle cx="12" cy="12" r="5"/><path d="M12 3v4M12 17v4M3 12h4M17 12h4"/>',
  star: '<path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.5 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z"/>',
  ship: '<path d="M12 3l4 5v6l-4 3-4-3V8zM8 14l-3 4M16 14l3 4M9 21h6"/>',
  bell: '<path d="M6 17h12l-1.5-2V10a4.5 4.5 0 0 0-9 0v5zM10 20h4"/>',
  antenna: '<path d="M12 21V12M8 21h8M5.5 6.5a9 9 0 0 0 0 9M18.5 6.5a9 9 0 0 1 0 9M8.5 9a5 5 0 0 0 0 4M15.5 9a5 5 0 0 1 0 4"/><circle cx="12" cy="10.5" r="1.3"/>',
  gear: '<circle cx="12" cy="12" r="3.2"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/>',
  arm: '<path d="M5 21h7M8 21v-6l5-6 4-5M17 4l3 2M17 4l1 3.5"/><circle cx="8" cy="14" r="1.2"/><circle cx="13" cy="9" r="1.2"/>',
  drill: '<rect x="8" y="3" width="8" height="6" rx="1"/><path d="M12 9v3M9.5 12h5L12 21z"/>',
  planet: '<circle cx="12" cy="12" r="5.5"/><path d="M3 15c3 2 15-4 18-6"/>',
  dome: '<path d="M3 19h18M5 19c0-4.5 3-8 7-8s7 3.5 7 8M12 11V8M10 8h4"/>',
  rover: '<path d="M3.5 15h17M6 15v-4h8l3 4M14 11V7h3"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
  rocket: '<path d="M12 3c3 2.5 4.5 6 4.5 10l-2 3h-5l-2-3c0-4 1.5-7.5 4.5-10zM9.5 16l-2 4 3.5-1.5M14.5 16l2 4-3.5-1.5"/><circle cx="12" cy="10" r="1.6"/>',
  engine: '<path d="M7 3h10v5H7zM8 8l-2 9h12l-2-9M10 21h4"/>',
  truck: '<path d="M3 16V7h11v9M14 10h4l3 3v3h-3"/><circle cx="7" cy="17.5" r="2"/><circle cx="17" cy="17.5" r="2"/>',
  shelf: '<path d="M4 20V4M20 20V4M4 9h16M4 15h16"/><rect x="7" y="5" width="4" height="4"/><rect x="13" y="11" width="4" height="4"/>',
  key: '<circle cx="8" cy="12" r="3.5"/><path d="M11.5 12H21M17 12v3M20 12v2"/>',
  scale: '<path d="M12 4v16M7 20h10M5 8h14M5 8l-2.5 6h5zM19 8l-2.5 6h5z"/>',
  chain: '<path d="M9.5 14.5l5-5M8 11l-2 2a3 3 0 0 0 4.2 4.2l2-2M16 13l2-2a3 3 0 0 0-4.2-4.2l-2 2"/>',
  circuit: '<path d="M3 12h5l2-5 4 10 2-5h5"/><circle cx="3" cy="12" r="1"/><circle cx="21" cy="12" r="1"/>',
  hand: '<path d="M8 21v-5l-2-4M8 16l-1-8M11 16V5M14 16V6M17 16l1-7M8 21h9v-5"/>',
  cells: '<rect x="3.5" y="5" width="17" height="14" rx="1.5"/><path d="M12 5v14M3.5 12h17"/>',
};
export const glyph = (id: GlyphId, cls = 'ma-glyph'): string =>
  `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${PATHS[id]}</svg>`;
