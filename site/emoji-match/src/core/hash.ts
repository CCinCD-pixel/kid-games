/** contentHash (spec §8.3): FNV-1a over the canonical JSON of the fields that change play. */
import { hashString } from '@kit/rng';
import type { LevelDef } from './types';
export { ENGINE_VERSION } from './types';

const FIELDS = ['grid', 'dust', 'ice', 'colors', 'objectives', 'moves', 'stars', 'exits', 'pods', 'lesson', 'fixedBoard'] as const;
function canon(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon((v as Record<string, unknown>)[k])}`).join(',')}}`;
  return JSON.stringify(v ?? null);
}
export function contentHash(def: LevelDef): string {
  const pick: Record<string, unknown> = {};
  for (const f of FIELDS) if (def[f] !== undefined) pick[f] = def[f];
  return hashString(canon(pick)).toString(16).padStart(8, '0');
}
