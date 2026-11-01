/**
 * Adaptive difficulty (spec §3.4–§3.5): per-TAG ladders (L1…L6) driven only by first-try results, mastery from a 10-item window
 * (never speed), spaced review, mission outcome (transition / stars / 直达). Pure functions over the save; no clocks, no DOM.
 * The ladder changes representation (C → P → A) and the number-line tolerance — never the node's number range (its `band`).
 */
import type { ItemResult, NodeDef, Rep } from './types';
import { MarsSaveV5, TagState, nodeState, pushRecent, readRecent, hash8 } from '../save/schema';
import {
  DIRECT_FIRST_TRY, DIRECT_LEVEL, DIRECT_TWICE, MASTERY_FRAC, MASTERY_MIN, MASTERY_WINDOW, MAX_LEVEL, MAX_NODE_PLAYS, MIN_LEVEL, REP_DOWN_ITEMS,
  REP_DOWN_MISSES, REVIEW_OFFSETS, START_LEVEL_FRESH, START_LEVEL_MASTERED, STREAK_UP, TRANSITION_BELOW, WEAK_RECENT_BELOW, WEAK_RECENT_FROM, WEAK_RECENT_N,
} from './tuning';
import { META, TAG_PREREQ } from '../families';
import { NODE_BY_ID, zoneOfNode } from './content';

/** Recent first-try rate over the last main items (weak learners start new tags at L1). */
export function recentRate(save: MarsSaveV5): number | null {
  const main = readRecent(save).filter((r) => r.slot === 'main' && !r.assisted);
  const w = main.slice(-WEAK_RECENT_FROM);
  if (main.length < WEAK_RECENT_N) return null;
  return w.reduce((a, r) => a + (r.firstTry ? 1 : 0), 0) / w.length;
}
export const isWeakRecent = (save: MarsSaveV5): boolean => { const r = recentRate(save); return r !== null && r < WEAK_RECENT_BELOW; };

const prereqOk = (save: MarsSaveV5, tag: string): boolean => (TAG_PREREQ[tag] ?? []).every((p) => !save.tags[p] || save.tags[p].mastered);
export function tagState(save: MarsSaveV5, tag: string): TagState {
  return (save.tags[tag] ??= {
    level: isWeakRecent(save) ? MIN_LEVEL : prereqOk(save, tag) ? START_LEVEL_MASTERED : START_LEVEL_FRESH,
    streak: 0, window: '', tailNoHint: 0, mastered: false, reviews: [], repDown: 0, wrongRun: 0,
  });
}
/** Ladder level for the next item of a tag. A replayed node (transition rule) is capped. */
export function levelFor(save: MarsSaveV5, tag: string | null, opts: { cap?: number } = {}): number {
  if (!tag) return START_LEVEL_MASTERED;
  const lv = tagState(save, tag).level;
  return opts.cap ? Math.min(opts.cap, lv) : lv;
}
export function repFor(level: number, ts?: TagState | null): Rep {
  let rep: Rep = level <= 1 ? 'C' : level <= 3 ? 'P' : 'A';
  if (ts && ts.repDown > 0) rep = rep === 'A' ? 'P' : 'C';
  return rep;
}

export function isMastered(ts: TagState): boolean {
  const w = ts.window.slice(-MASTERY_WINDOW);
  return w.length >= MASTERY_MIN && [...w].filter((c) => c === '1').length / w.length >= MASTERY_FRAC && ts.tailNoHint >= 3;
}
const pushWindow = (ts: TagState, ok: boolean) => { ts.window = (ts.window + (ok ? '1' : '0')).slice(-MASTERY_WINDOW); };
const calendarDay = (at: number): number => Math.floor(at / 86_400_000);

/** A main-topic item delivered: ladder + window + mastery + log. `assisted` items (H3) never move the ladder or mastery. */
export function recordMain(save: MarsSaveV5, r: ItemResult, visit: number): void {
  pushRecent(save, r, visit);
  if (!r.tag || r.assisted) return;
  const ts = tagState(save, r.tag);
  ts.lastAt = r.at;
  const ok = r.firstTry;
  pushWindow(ts, ok);
  ts.tailNoHint = r.hint > 0 ? 0 : Math.min(3, ts.tailNoHint + 1);
  if (ok) {
    ts.streak++; ts.wrongRun = 0;
    if (ts.streak >= STREAK_UP) { ts.level = Math.min(MAX_LEVEL, ts.level + 1); ts.streak = 0; }
  } else {
    ts.streak = 0; ts.wrongRun++; ts.level = Math.max(MIN_LEVEL, ts.level - 1);
    if (ts.wrongRun >= REP_DOWN_MISSES) ts.repDown = REP_DOWN_ITEMS;
  }
  if (ts.repDown > 0 && ok) ts.repDown--;
  ts.fam = r.fam; ts.node = r.node;
  if (!ts.mastered && isMastered(ts)) { ts.mastered = true; ts.reviews = REVIEW_OFFSETS.map((o) => visit + o); ts.reviewAt = REVIEW_OFFSETS.map((o) => calendarDay(r.at) + o); }
}

/** A warm-up delivered (review / prerequisite / other-zone): window + review table; the ladder level never moves. */
export function recordWarm(save: MarsSaveV5, r: ItemResult, visit: number): void {
  pushRecent(save, r, visit);
  if (!r.tag || r.assisted) return;
  const ts = tagState(save, r.tag);
  ts.lastAt = r.at;
  pushWindow(ts, r.firstTry);
  ts.tailNoHint = r.hint > 0 ? 0 : Math.min(3, ts.tailNoHint + 1);
  if (!r.firstTry) { ts.shaky = true; ts.shakyOk = 0; ts.reviews = [visit + 1, visit + 3]; ts.reviewAt = [calendarDay(r.at) + 1, calendarDay(r.at) + 3]; }
  else {
    if (ts.mastered && ts.reviews.length && ts.reviews[0] <= visit) ts.reviews.shift();
    if (ts.mastered && ts.reviewAt?.length && ts.reviewAt[0] <= calendarDay(r.at)) ts.reviewAt.shift();
    if (ts.shaky) { ts.shakyOk = (ts.shakyOk ?? 0) + 1; if (ts.shakyOk >= 2) { ts.shaky = false; ts.shakyOk = 0; } }
  }
}
/** Tags with a review due this visit (mastered tags only; shaky ones are due at their rescheduled visit). */
export function dueTags(save: MarsSaveV5, visit: number): string[] {
  const day = calendarDay(save.session.lastActiveAt);
  return Object.entries(save.tags).filter(([, t]) => (t.mastered || t.shaky) && (save.session.lastActiveAt >= 1_000_000_000_000 && t.reviewAt?.length ? t.reviewAt[0] <= day : t.reviews.length > 0 && t.reviews[0] <= visit)).map(([k]) => k);
}
export const tagOfFam = (fam: string): string | null => META[fam]?.tag ?? null;

// ---- mission outcome ---------------------------------------------------------------------------------------------------------
export interface MissionOutcome {
  n: number; firstTry: number; rate: number; maxLevel: number; stars: 0 | 1 | 2 | 3; advance: boolean; h3: number; replay: boolean; directOffer: boolean;
}
/** After the last item of a node mission: stars, the transition rule (<60 % → one more play, capped), the 直达 offer. */
export function finishMission(save: MarsSaveV5, node: NodeDef, results: ItemResult[]): MissionOutcome {
  const main = results.filter((r) => r.slot === 'main');
  const n = main.length; const ft = main.filter((r) => r.firstTry && !r.assisted).length;
  const rate = n ? ft / n : 1;
  const h3 = main.filter((r) => r.assisted).length;
  const ns = nodeState(save, node.id);
  ns.plays++; ns.ft.push(Math.round(rate * 100) / 100);
  let maxLevel = 1;
  for (const r of main) maxLevel = Math.max(maxLevel, r.level);
  const calib = node.kind === 'calib'; const breather = node.kind === 'breather';
  const replay = !calib && !breather && rate < TRANSITION_BELOW && ns.plays < MAX_NODE_PLAYS;
  let stars: 0 | 1 | 2 | 3 = 0;
  if (!calib) {
    stars = breather ? 3 : 1;
    if (!breather && h3 === 0) stars = (rate >= (node.kind === 'boss' ? 7 / 8 : 5 / 6) ? 3 : 2);
  }
  let advance = true;
  if (replay) { advance = false; ns.bridge = true; }
  else { ns.st = 'done'; ns.stars = Math.max(ns.stars, stars); ns.bridge = false; }
  const zone = zoneOfNode(node);
  let directOffer = false;
  if (advance && !calib && !breather) {
    const hist = (save.zoneHist[zone] ??= []); hist.push(rate); if (hist.length > 4) hist.shift();
    const fast = maxLevel >= DIRECT_LEVEL && rate >= DIRECT_FIRST_TRY;
    const twice = hist.length >= 2 && hist.at(-1)! >= DIRECT_TWICE && hist.at(-2)! >= DIRECT_TWICE;
    directOffer = (fast || twice) && !!nextSkippable(save, zone, node.id);
    if (directOffer) save.directOffer = { zone };
  }
  return { n, firstTry: ft, rate, maxLevel, stars, advance, h3, replay: !advance, directOffer };
}

/** The one non-boss, non-breather open node that 直达 would skip (the one right after the current node in its queue). */
export function nextSkippable(save: MarsSaveV5, zone: string, afterId: string): NodeDef | null {
  const order = queueOf(save, zone);
  const i = order.indexOf(afterId);
  for (const id of order.slice(i + 1)) {
    const n = NODE_BY_ID[id];
    const st = save.nodes[id]?.st ?? 'open';
    if (st !== 'open') continue;
    if (n.kind === 'boss' || n.kind === 'breather' || n.kind === 'calib') continue;
    return n;
  }
  return null;
}
import { MAIN_ORDER, REMEDIAL_ORDER, CARDS } from './content';
import type { CardId, ZoneId } from './types';
export function queueOf(save: MarsSaveV5, zone: string): string[] {
  if (zone === 'cert') { const c = CARDS.find((x) => save.cert[x].state === 'half') ?? CARDS[0]; return REMEDIAL_ORDER[c as CardId]; }
  if (CARDS.includes(zone as CardId)) return REMEDIAL_ORDER[zone as CardId];
  return MAIN_ORDER[zone as ZoneId] ?? [];
}
/** The child chose 直达: skip exactly one node (never a Boss), queue its tags as L3 warm-up probes. */
export function acceptDirect(save: MarsSaveV5, zone: string, afterId: string): string | null {
  const n = nextSkippable(save, zone, afterId);
  save.directOffer = null;
  if (!n) return null;
  const ns = nodeState(save, n.id); ns.st = 'skipped'; ns.why = 'direct';
  const tags = [...new Set(n.items.map((i) => META[i.fam]?.tag).filter((t): t is string => !!t))];
  save.direct.pending.push({ node: n.id, tags });
  return n.id;
}
export const declineDirect = (save: MarsSaveV5): void => { save.directOffer = null; };
/** A 直达 probe warm-up was missed → that node is recommended again. */
export function failDirectProbe(save: MarsSaveV5, tag: string): void {
  const hit = save.direct.pending.find((p) => p.tags.includes(tag));
  if (!hit) return;
  const ns = nodeState(save, hit.node); if (ns.st === 'skipped' && ns.why === 'direct') { ns.st = 'open'; ns.why = undefined; }
  save.direct.pending = save.direct.pending.filter((p) => p !== hit);
}
export function passDirectProbe(save: MarsSaveV5, tag: string): void {
  const hit = save.direct.pending.find((p) => p.tags.includes(tag));
  if (hit) { hit.tags = hit.tags.filter((t) => t !== tag); if (!hit.tags.length) save.direct.pending = save.direct.pending.filter((p) => p !== hit); }
}
export const keyHashOf = (key: string): string => hash8(key);
