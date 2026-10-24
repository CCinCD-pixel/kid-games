import { MAIN_ORDER } from '../app/content';
import type { MarsSaveV5 } from '../save/schema';
import { decor } from '@kit/economy';

export type DecorItem = (typeof decor)[number];

export function decorUnlocked(item: DecorItem, save: Pick<MarsSaveV5, 'nodes' | 'baseLevel'>): boolean {
  if (item.theme === 'home') return true;
  const ids = MAIN_ORDER[item.theme as keyof typeof MAIN_ORDER] ?? [];
  const done = ids.filter((id) => save.nodes[id]?.st === 'done').length;
  if (!done) return false;
  if (item.kind === 'wall' || item.kind === 'floor') return true;
  if (item.kind === 'ceil') return done / ids.length >= 1 / 3;
  if (item.kind === 'feature') return done / ids.length >= 2 / 3;
  if (item.kind === 'back') return done === ids.length;
  return save.baseLevel >= ({ orbit: 4, vault: 5, factory: 6 } as Record<string, number>)[item.theme];
}
