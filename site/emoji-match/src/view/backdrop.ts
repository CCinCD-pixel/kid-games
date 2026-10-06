/**
 * Scene backdrops (spec §6.7, §8.9). The five paper-cut scenes are drawn in code (view/art/sky.ts) and
 * pre-rendered by tools/emoji-match/build-scenes.mjs to assets/bg/<scene>-{p,l}.webp (1620×2160 /
 * 2160×1620, each ≤ 90 KB). The page shows them as a plain <img>: only the current scene in the current
 * orientation is fetched (the glob below holds URLs only), and a static bitmap is far cheaper for WebKit
 * to repaint under the animated board than inline SVG with drop-shadow filters.
 */
import type { SceneKey } from './art/sky';

const URLS = import.meta.glob('../../assets/bg/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

export function bgUrl(key: SceneKey, landscape: boolean): string {
  return URLS[`../../assets/bg/${key}-${landscape ? 'l' : 'p'}.webp`] ?? '';
}

/** the markup inside an `.em-bg` host */
export function backdrop(key: SceneKey, landscape: boolean): string {
  return `<img class="em-bg__img" src="${bgUrl(key, landscape)}" alt="" decoding="async" draggable="false">`;
}
