// Shared app context (spec §8.1): save, voice, layout, the atlas cache and small UI helpers.
import type { Shell, LayoutInfo } from '@kit/shell';
import type { SaveV1 } from './save';
import type { Voice } from './voice';
import { Atlas } from './render/atlas';

export interface AppCtx {
  shell: Shell;
  save: SaveV1;
  persist(): void;
  voice: Voice;
  layout: LayoutInfo;
  dpr: number;
  test: boolean;
  /** atlas for a tile width (CSS px); cached per (w, dpr) */
  atlas(w: number): Atlas;
  /** kit UI sound by name (ui-tap, coin, …) */
  ui(name: string, gain?: number): void;
  mark(name: string, data: Record<string, unknown>): void;
}

const cache = new Map<string, Atlas>();
export function atlasFor(w: number, dpr: number): Atlas {
  const key = w + '@' + dpr; let a = cache.get(key);
  if (!a) { a = new Atlas((w / 100) * dpr, w / 100); if (cache.size > 2) cache.clear(); cache.set(key, a); }
  return a;
}
