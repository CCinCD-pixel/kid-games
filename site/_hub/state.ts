/**
 * Pure hub logic (unit-tested in tests/unit/hub-state.test.ts): which card gets 继续 / 推荐 / NEW,
 * what each card's progress line says, which greeting the companion uses, which tab opens first.
 * No DOM, no storage access — main.ts passes the data in.
 *
 * Plan §4.1 rules: at most two marked cards (one 继续 = the game played last, one 推荐 rotating
 * through the live 基地 cards); no rewards attached, nothing locked; NEW only for real new content
 * (a game's `newContent` id the child has not opened since it appeared).
 */
import type { HubEntry } from 'virtual:kg-registry';
import type { SessionRecord } from '@kit/log';
import type { HubProgress, LegacyLadders, LegacySokoban } from '@kit/progress';

export type Place = HubEntry['place'];
export const PLACES: Place[] = ['base', 'playground', 'classic'];

export interface CardProgress {
  label: string;
  /** 0..1 progress bar, omitted = no bar */
  value?: number;
}

export interface LegacySaves {
  sokoban?: LegacySokoban | null;
  'memory-matrix'?: LegacyLadders | null;
  'emoji-match'?: LegacyLadders | null;
}

/** Sessions that are real play (not the hub or platform pages). */
const PLATFORM = new Set(['hub', 'parent', 'credits', 'dev-kit']);

/** The game played most recently among the cards that can be entered. */
export function pickContinue(sessions: SessionRecord[], enterable: Set<string>): string | null {
  let best: SessionRecord | null = null;
  for (const s of sessions) {
    if (PLATFORM.has(s.game) || !enterable.has(s.game)) continue;
    if (s.activeMs < 5_000) continue; // opened and left at once: not "where we were"
    if (!best || s.lastBeat > best.lastBeat) best = s;
  }
  return best?.game ?? null;
}

/** One rotating suggestion among live 基地 games (never a rest-area game), excluding 继续. */
export function pickSuggestion(entries: HubEntry[], visible: Set<string>, continueId: string | null, day: number): string | null {
  const pool = entries.filter((e) => e.place === 'base' && e.status === 'live' && visible.has(e.id) && e.id !== continueId);
  if (!pool.length) return null;
  return pool[((day % pool.length) + pool.length) % pool.length].id;
}

export const seenKey = (e: Pick<HubEntry, 'id' | 'newContent'>) => (e.newContent ? `${e.id}:${e.newContent.id}` : '');

export function isNew(e: HubEntry, seen: Set<string>): boolean {
  return e.status === 'live' && !!e.newContent && !seen.has(seenKey(e));
}

const ladderSolved = (l: LegacyLadders | null | undefined) =>
  l ? Object.values(l.ladders).reduce((n, lp) => n + Object.keys(lp.solved).length, 0) : 0;

/** The progress line under a card. Games report their own via setHubProgress; old games are read from their saves. */
export function cardProgress(e: HubEntry, hub: Record<string, HubProgress>, legacy: LegacySaves, plays: number): CardProgress | null {
  if (e.status === 'wip') return null;
  const own = hub[e.id];
  if (own) return { label: own.label, ...(typeof own.value === 'number' ? { value: own.value } : {}) };
  if (e.id === 'sokoban' && legacy.sokoban) {
    const done = Object.keys(legacy.sokoban.best).length;
    if (done) return { label: `已过 ${done}/10 关`, value: done / 10 };
  }
  if (e.id === 'memory-matrix') {
    const n = ladderSolved(legacy['memory-matrix']);
    if (n) return { label: `点亮 ${n} 关` };
  }
  if (e.id === 'emoji-match') {
    const n = ladderSolved(legacy['emoji-match']);
    if (n) return { label: `已过 ${n} 关` };
  }
  if (plays > 0) return { label: `玩过 ${plays} 次` };
  return { label: '等你出发' };
}

export function playCounts(sessions: SessionRecord[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of sessions) if (s.activeMs >= 5_000) out[s.game] = (out[s.game] ?? 0) + 1;
  return out;
}

export type GreetingSlot = 'morning' | 'afternoon' | 'evening';
export function greetingSlot(hour: number): GreetingSlot {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  return 'evening';
}

/** Narration id for the greeting: name-free variant when the parent set another display name. */
export function greetingId(hour: number, returning: boolean, usesDefaultName: boolean): string {
  if (returning) return 'hub.back';
  return `hub.hello.${greetingSlot(hour)}${usesDefaultName ? '' : '.plain'}`;
}

/** First tab: the place of the 继续 card, else the first place that has a card you can enter. */
export function initialPlace(entries: HubEntry[], visible: Set<string>, continueId: string | null, remembered?: string | null): Place {
  if (remembered && (PLACES as string[]).includes(remembered)) return remembered as Place;
  const cont = continueId ? entries.find((e) => e.id === continueId) : undefined;
  if (cont) return cont.place;
  for (const p of PLACES) if (entries.some((e) => e.place === p && e.status === 'live' && visible.has(e.id))) return p;
  return 'base';
}

/** Days since the epoch in local time (the 推荐 rotation key). */
export const localDay = (d = new Date()) => Math.floor((d.getTime() - d.getTimezoneOffset() * 60_000) / 86_400_000);
