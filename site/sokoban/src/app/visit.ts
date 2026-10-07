/**
 * One visit (spec §5.5 收尾卡, §5.2): what happened since the child opened the game — active play
 * time, levels passed, rockets per route, the recent hint use. A visit lives in sessionStorage
 * (survives a reload) and ends after 30 minutes away. Pure helpers + a tiny store; no timers.
 *  - 收尾卡 S10: after ≥ 12 minutes of active play or ≥ 6 passed levels, once per visit, when the next
 *    result card closes. Never a lock: 再玩一关 just goes on.
 *  - 同一章连续两关用了 H3 → the next level opens with sok.tip.slow and a 20 s H0 threshold.
 *  - 随机新仓库: the same tier needed H3 three times in a row → suggest a smaller order once.
 */
import type { Dest } from '../data';

export const VISIT_KEY = 'kg:sok:visit';
export const VISIT_GAP_MS = 30 * 60_000;
export const WRAP_MS = 12 * 60_000;
export const WRAP_LEVELS = 6;

export interface Visit {
  start: number;
  last: number;
  activeMs: number;
  levels: number;
  launches: Record<Dest, number>;
  shown: boolean;
  /** recently finished levels (newest last): chapter and whether H3 was used */
  recent: { id: string; ch: number | string; h3: boolean }[];
  /** consecutive random orders per tier that needed H3 */
  rndH3: [number, number, number];
  smallerSaid: boolean;
}

export function newVisit(now: number): Visit {
  return { start: now, last: now, activeMs: 0, levels: 0, launches: { tiangong: 0, moon: 0, mars: 0 }, shown: false, recent: [], rndH3: [0, 0, 0], smallerSaid: false };
}

export function loadVisit(now = Date.now(), storage?: Storage): Visit {
  try {
    const st = storage ?? globalThis.sessionStorage;
    const raw = st?.getItem(VISIT_KEY);
    if (raw) {
      const v = JSON.parse(raw) as Visit;
      if (v && typeof v.last === 'number' && now - v.last < VISIT_GAP_MS) return { ...newVisit(now), ...v };
    }
  } catch {
    /* private mode */
  }
  return newVisit(now);
}

export function storeVisit(v: Visit, storage?: Storage): void {
  try {
    (storage ?? globalThis.sessionStorage)?.setItem(VISIT_KEY, JSON.stringify(v));
  } catch {
    /* private mode */
  }
}

/** Record a finished level (stars > 0). */
export function noteLevel(v: Visit, o: { id: string; ch: number | string; h3: boolean; activeMs: number; dest?: Dest; launched: boolean; now?: number }): void {
  v.levels += 1;
  v.activeMs += Math.max(0, o.activeMs);
  v.last = o.now ?? Date.now();
  if (o.launched && o.dest) v.launches[o.dest] += 1;
  v.recent = [...v.recent, { id: o.id, ch: o.ch, h3: o.h3 }].slice(-6);
}

export function noteActive(v: Visit, ms: number, now = Date.now()): void {
  v.activeMs += Math.max(0, ms);
  v.last = now;
}

/**
 * The visit's wall clock between route changes / pauses (each gap ≤ 60 s, so an idle open page
 * does not count). Time on a level screen is NOT booked here: PlayScreen / QuizScreen book their own
 * active time (noteLevel on a pass, noteActive when left unfinished) — QA r3: booking both counted
 * every level twice and brought the 12-minute wrap-up card at ~8 real minutes.
 */
export function visitClock(v: Visit, start = Date.now()): { tick(ownedByLevel: boolean, now?: number): void; reset(now?: number): void } {
  let last = start;
  return {
    tick(ownedByLevel, now = Date.now()) {
      if (!ownedByLevel) noteActive(v, Math.min(60_000, now - last), now);
      last = now;
    },
    reset(now = Date.now()) {
      last = now;
    },
  };
}

export function wrapDue(v: Visit): boolean {
  return !v.shown && (v.activeMs >= WRAP_MS || v.levels >= WRAP_LEVELS);
}

/** The last two finished levels of chapter `ch` both used H3 → slow down the next one. */
export function slowDue(v: Visit, ch: number | string): boolean {
  const same = v.recent.filter((r) => r.ch === ch);
  if (same.length < 2) return false;
  const last2 = v.recent.slice(-2);
  return last2.length === 2 && last2.every((r) => r.ch === ch && r.h3);
}

/** Track H3 streaks per random tier; true once when a tier reaches three in a row. */
export function noteRandomH3(v: Visit, tier: 1 | 2 | 3, h3: boolean): boolean {
  v.rndH3[tier - 1] = h3 ? v.rndH3[tier - 1] + 1 : 0;
  if (tier > 1 && v.rndH3[tier - 1] >= 3 && !v.smallerSaid) {
    v.smallerSaid = true;
    return true;
  }
  return false;
}
