/**
 * What a result card leads into (spec §2.1, §3.5, §5.5), shared by the level and the quiz screens:
 * chapter rewards (once per chapter), milestone items, the v1 finale (once), the 收尾卡 (once per
 * visit), then the child's choice — next level, again, the 镜子仓库 twin, another random order, the
 * 跳级考试 invitation, or the map (the newly opened chapter glows; after 4-8 the map goes to
 * 新货单在路上).
 */
import type { AppCtx } from '../app/context';
import type { Outcome } from '../app/collection';
import type { NextStep } from '../app/unlock';
import { storeVisit, wrapDue } from '../app/visit';
import { CHAPTERS, COSMETICS, levelById, type LevelDef } from '../data';
import { showFinale } from './finale';
import { showCertOffer, showChapterDone, showNewItem, showWrapUp } from './overlays';
import { deliverOrder } from './random';

/** Map tab of a level (twins → their original's; random → the chapter that opened its tier). */
export function tabOf(def: LevelDef): number | 'classic' {
  const base = def.twinOf ? levelById(def.twinOf) ?? def : def;
  if (base.track === 'classic') return 'classic';
  if (typeof base.ch === 'number') return base.ch;
  if (base.track === 'random' && base.random) return [2, 3, 4][Math.min(3, base.random.tier) - 1];
  return 1;
}

/** Rewards and ceremonies after the card. Resolves 'hub' when the child chose 回大厅 on the 收尾卡. */
export async function ceremonies(ctx: AppCtx, def: LevelDef, o: Outcome, alive: () => boolean): Promise<'hub' | 'stay'> {
  for (const ch of o.completedChapters) {
    await showChapterDone(ctx, ch, o.newItems, o.newCards);
    if (!alive()) return 'stay';
  }
  const chapterItems = new Set(COSMETICS.filter((c) => c.unlock.type === 'chapter').map((c) => c.id));
  for (const id of o.newItems.filter((x) => !chapterItems.has(x))) await showNewItem(ctx, id);
  if (o.finale) await showFinale(ctx);
  if (!alive()) return 'stay';
  if (wrapDue(ctx.visit)) {
    const ch = typeof def.ch === 'number' ? def.ch : CHAPTERS[CHAPTERS.length - 1].ch;
    const w = await showWrapUp(ctx, ch);
    storeVisit(ctx.visit);
    if (w === 'hub') {
      ctx.shell.leave();
      return 'hub';
    }
  }
  return 'stay';
}

/** Follow the result card's choice. */
export async function follow(ctx: AppCtx, def: LevelDef, choice: string, next: NextStep, o: Outcome, before?: () => Promise<unknown>): Promise<void> {
  if (choice === 'again') {
    ctx.go({ name: 'play', id: def.id, fresh: true, def: def.track === 'random' ? def : undefined });
    return;
  }
  if (choice === 'twin') {
    ctx.go({ name: 'play', id: `${def.id}~twin`, fresh: true });
    return;
  }
  if (choice === 'again-random' && def.random) {
    await before?.();
    await deliverOrder(ctx, Math.min(3, def.random.tier) as 1 | 2 | 3);
    return;
  }
  if (choice === 'next' && next.kind === 'cert-offer') {
    const pick = await showCertOffer(ctx);
    if (pick === 'go') {
      ctx.certRun = { levels: [] };
      ctx.go({ name: 'play', id: 'cert-1', fresh: true });
    } else ctx.go({ name: 'play', id: '1-1', fresh: true, newChapter: 1 });
    return;
  }
  if (choice === 'next' && next.kind === 'level' && next.id) {
    ctx.go({ name: 'play', id: next.id, fresh: true, newChapter: next.newChapter });
    return;
  }
  ctx.go({ name: 'map', tab: tabOf(def), opened: o.openedChapters[0], focus: def.id === '4-8' ? 'coming' : undefined });
}
