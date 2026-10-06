/**
 * The hub card's progress line (spec §8.8, review D25/B27): a place in the story — the station and the
 * level the child is at — never a score. Set on every open and after every win, so the hub stops
 * showing the pre-2026-10 game's "已过 n 关" as soon as 星晶消消乐 is opened once.
 */
import { setHubProgress } from '@kit/progress';
import { EPISODES, LEVELS } from './content';
import type { EmSaveV1 } from './save';

export function hubLine(s: EmSaveV1): { label: string; value: number } {
  const passed = LEVELS.filter((d) => (s.levels[d.id]?.stars ?? 0) > 0).length;
  const cur = LEVELS.find((d) => !(s.levels[d.id]?.stars));
  if (!cur) return { label: '小行星带 · 全部到站', value: 1 };
  const ep = EPISODES.find((e) => e.ep === cur.ep)!;
  return { label: `${ep.dest} ${cur.id}`, value: passed / LEVELS.length };
}

export function updateHub(s: EmSaveV1): void {
  try { setHubProgress('emoji-match', hubLine(s)); } catch { /* storage full / private mode */ }
}
