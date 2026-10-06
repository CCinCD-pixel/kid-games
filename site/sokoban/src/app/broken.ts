/**
 * Broken level data (spec §3.10 row 关卡数据坏): a level whose map does not parse shows a 维修中
 * node on the map, never opens, and is skipped for unlocking (the next level opens as if it were
 * passed). The validators keep this from ever shipping; this is the runtime safety net.
 *  - `levelBroken(l)` parses each map once (cached) and logs console.error the first time.
 *  - `markBroken(id)` records a level that failed later, when its screen was built (boot.ts).
 */
import { parseLevel } from '@engines/puzzle/src/level';
import type { LevelDef } from '../data';

const cache = new Map<string, boolean>();

export function levelBroken(l: Pick<LevelDef, 'id' | 'map' | 'kind'>): boolean {
  const hit = cache.get(l.id);
  if (hit !== undefined) return hit;
  let broken = false;
  if (l.kind !== 'quiz') {
    try {
      if (!Array.isArray(l.map) || !l.map.length) throw new Error('no map');
      parseLevel(l.map);
    } catch (err) {
      broken = true;
      console.error(`[sokoban] level ${l.id} data is broken — shown as 维修中`, err);
    }
  }
  cache.set(l.id, broken);
  return broken;
}

export function markBroken(id: string): void {
  cache.set(id, true);
}

/** Tests only. */
export function resetBroken(): void {
  cache.clear();
}
