/**
 * 小推的本领 (spec §2.1 S9, §3.2): swipe walking (自动 / 开 / 关) and auto-route (arrows).
 *  - footprints (no auto-route): chapters 0–1 (replays too), the cert, and classic/random before the
 *    chapter-2 upgrade; arrows from chapter 2 on once the upgrade happened; the hangar switch can
 *    turn auto-route off (back to footprints).
 *  - swipe 'auto': off in chapters 0–1 and the cert, on from chapter 2 (classic/random: after the upgrade).
 */
import { paramsFor, type LevelDef } from '../data';
import type { SaveV1 } from './save';
import { ch4Open } from './unlock';

export type InputMode = 'footprints' | 'arrows';

export function inputModeFor(save: SaveV1, level: Pick<LevelDef, 'track' | 'ch'>): InputMode {
  const p = paramsFor(level);
  if (!save.settings.autoRoute) return 'footprints';
  if (save.arrows === 'locked') return 'footprints';
  if (p.inputMode === 'arrows' || p.inputMode === 'auto') return 'arrows';
  return 'footprints';
}

export function swipeEnabled(save: SaveV1, level: Pick<LevelDef, 'track' | 'ch'>): boolean {
  if (save.settings.swipe === 'on') return true;
  if (save.settings.swipe === 'off') return false;
  const p = paramsFor(level);
  if (p.swipeDefault === 'auto') return save.arrows !== 'locked';
  return !!p.swipeDefault;
}

export function deadMarkerFor(save: SaveV1, level: Pick<LevelDef, 'track' | 'ch'>): 'instant' | 'delayed' {
  const p = paramsFor(level);
  if (p.deadMarker === 'afterCh4Open') return ch4Open(save) ? 'delayed' : 'instant';
  return p.deadMarker;
}

export function stuckDelayFor(level: Pick<LevelDef, 'track' | 'ch'>): { pushes: number; ms: number } {
  return paramsFor(level).stuckDelay;
}
