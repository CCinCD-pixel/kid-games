// Typed access to content/gear-fort/*.json (the frozen canonical data shared with the validators; spec §8.3).
// dscripts / parity / synthetic are validator-only and are never imported here; ghosts load on demand.
import type { Level } from './lane/types';
import UNITS_RAW from '../../../content/gear-fort/units.json';
import ENEMIES_RAW from '../../../content/gear-fort/enemies.json';
import BOSSES_RAW from '../../../content/gear-fort/bosses.json';
import CAMPAIGN_RAW from '../../../content/gear-fort/campaign.json';
import LINES_RAW from '../../../content/gear-fort/lines.json';
import VOICE_RAW from '../../../content/gear-fort/voice.json';
import RULES_RAW from '../../../content/gear-fort/rules.json';

const levelFiles = import.meta.glob('../../../content/gear-fort/levels/*.json', { eager: true, import: 'default' }) as Record<string, Level>;
export const LEVELS: Record<string, Level> = Object.fromEntries(Object.values(levelFiles).map((l) => [l.id, l]));

export interface Campaign {
  volumes: { id: number; name: string; levels: string[]; open: string[]; end: string[] }[];
  inns: Record<string, number>; repairArt: Record<string, string>; dock: string[];
  crossAsk: Record<string, string>; unlocks: Record<string, string>; levelJinnang: Record<string, string | null>;
}
export const CAMPAIGN = CAMPAIGN_RAW as unknown as Campaign;
/** every v1 level id in play order */
export const ORDER: string[] = CAMPAIGN.volumes.flatMap((v) => v.levels);
/** levels this build ships playable (stage 1 = volume 1; volume 2 lands in build stage 2) */
export const PLAYABLE_VOLUMES = [1];

export interface UnitInfo { name: string; unlock: string; cost: number; cd: number; v1?: boolean; stamp?: string; ult?: { name: string; text: string } }
export interface EnemyInfo { name: string; intro?: string; v1?: boolean; fears?: string[]; mat: string; wt: string; layer: string; traits: string[] }
export const UNIT_INFO = UNITS_RAW as unknown as Record<string, UnitInfo>;
export const ENEMY_INFO = ENEMIES_RAW as unknown as Record<string, EnemyInfo>;
export const BOSS_INFO = BOSSES_RAW as unknown as Record<string, { name?: string }>;

export interface LineRec { role: string; kind?: string; text: string; norm?: string }
export const LINES = LINES_RAW as unknown as Record<string, LineRec>;
export const VOICE = VOICE_RAW as { clips: boolean };

export const levelIndex = (id: string): number => ORDER.indexOf(id);
export const nextLevel = (id: string): string | null => ORDER[levelIndex(id) + 1] ?? null;
export const volOf = (id: string): number => +id.split('-')[0];
/** the kinds 鲁班 shows on his table (boss first), in first-appearance order */
export function previewKinds(lv: Level): string[] {
  const out: string[] = [];
  for (const s of lv.spawns) { const k = s[2].startsWith('boss:') ? s[2].slice(5) : s[2] === 'swarm' ? 'ant' : s[2]; if (!out.includes(k)) out.push(k); }
  return out.sort((a, b) => (BOSS_INFO[b] ? 1 : 0) - (BOSS_INFO[a] ? 1 : 0));
}
export const nameOf = (k: string): string => UNIT_INFO[k]?.name ?? ENEMY_INFO[k]?.name ?? BOSS_INFO[k]?.name ?? k;

/** kernel build number: bump when src/lane/** changes behaviour (old snapshots are then discarded, spec §3.14) */
export const KERNEL_BUILD = 'lane-k1-revd';
const fnv = (s: string): string => { let x = 0x811c9dc5; for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 0x01000193) >>> 0; } return x.toString(16).padStart(8, '0'); };
/** FNV of rules/units/enemies/bosses JSON + the kernel build (stored in the save and with every snapshot) */
export const KERNEL_VERSION = fnv(JSON.stringify([RULES_RAW, UNITS_RAW, ENEMIES_RAW, BOSSES_RAW]) + KERNEL_BUILD);
/** ghost windows load on demand (one small JSON per level) */
const ghostFiles = import.meta.glob('../../../content/gear-fort/ghost/*.json', { import: 'default' });
export async function loadGhost(id: string): Promise<{ actions: [number, import('./lane/types').Action[]][]; w0: number; w1: number; seed: number; loadout: string[] } | null> {
  const f = ghostFiles[`../../../content/gear-fort/ghost/${id}.json`]; return f ? ((await f()) as never) : null;
}
