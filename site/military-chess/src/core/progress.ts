/**
 * Meta progress (spec §5.3–§5.5, §4.4): stars, unlocks, the child's rank (9 levels, deterministic,
 * never down), knowledge cards, mastery and ladder bookkeeping. Pure functions over the save — the
 * screens call them and persist the result.
 */
import type { SaveV1, LadderTrack } from '../ctrl/save';
import { ENDGAMES, LESSONS, CARDS, type Lesson, type LessonItem } from '../content';

export type LadderMode = 'fan' | 'ming' | 'an';
export type Stars = 0 | 1 | 2 | 3;

// ------------------------------------------------------------------ stars (§5.3)
/** board puzzles / endgames: ≤ par and no H3 → 3★; ≤ par + 2 (or the H3 twin within par) → 2★; else 1★ */
export function boardStars(moves: number, par: number, usedH3: boolean, twin: boolean): Stars {
  if (twin) return moves <= par ? 2 : 1;
  if (usedH3) return moves <= par + 2 ? 2 : 1;
  if (moves <= par) return 3;
  if (moves <= par + 2) return 2;
  return 1;
}
/** cards / scenes: all first-try right → 3★; ≤ 2 corrections → 2★; else 1★ (H3 twin: max 2★) */
export function cardStars(corrections: number, twin = false): Stars {
  const s: Stars = corrections === 0 ? 3 : corrections <= 2 ? 2 : 1;
  return twin ? (Math.min(2, s) as Stars) : s;
}
/** deploy items: every placement accepted → 3★; ≤ 2 refused → 2★; else 1★ */
export const deployStars = (refused: number, usedH3 = false): Stars => (usedH3 ? (refused <= 2 ? 2 : 1) : refused === 0 ? 3 : refused <= 2 ? 2 : 1);

export interface ItemRecord {
  stars: Stars;
  best: number;
  tries: number;
  hintMax: 0 | 1 | 2 | 3;
  at: number;
  /** the latest attempt (mastery uses the latest, not the best) */
  last?: Stars;
  lastHint?: 0 | 1 | 2 | 3;
}

/** record a finished attempt; the record keeps the best stars; returns whether the stars went up */
export function recordItem(save: SaveV1, id: string, stars: Stars, o: { moves?: number; hintMax: 0 | 1 | 2 | 3; now?: number }): boolean {
  const cur = save.items[id] as ItemRecord | undefined;
  const now = o.now ?? Date.now();
  const rec: ItemRecord = cur ? { ...cur } : { stars: 0, best: 0, tries: 0, hintMax: 0, at: now };
  rec.tries++;
  rec.last = stars;
  rec.lastHint = o.hintMax;
  const up = stars > rec.stars;
  if (up) {
    rec.stars = stars;
    rec.best = o.moves ?? rec.best;
    rec.hintMax = o.hintMax;
    rec.at = now;
  } else if (stars === rec.stars && o.moves !== undefined && (rec.best === 0 || o.moves < rec.best)) rec.best = o.moves;
  save.items[id] = rec;
  return up;
}

export const starsOf = (save: SaveV1, id: string): Stars => ((save.items[id]?.stars ?? 0) as Stars);

// ------------------------------------------------------------------ 学堂 unlocks (§4.1)
const doneCount = (save: SaveV1, l: Lesson): number => l.items.filter((i) => starsOf(save, i.id) >= 1).length;
/** ≥ (items − 1) items with ≥ 1★ — opens the next lesson (and the ladder / endgame unlocks) */
export const lessonPassed = (save: SaveV1, l: Lesson): boolean => doneCount(save, l) >= l.items.length - 1;
/** every item ≥ 1★ (rank promotions, lesson cards) */
export const lessonComplete = (save: SaveV1, l: Lesson): boolean => doneCount(save, l) === l.items.length;
export const lessonById = (id: string): Lesson => LESSONS.find((l) => l.id === id)!;

export function lessonUnlocked(save: SaveV1, idx: number): boolean {
  if (idx === 0 || save.settings.unlockAll) return true;
  return lessonPassed(save, LESSONS[idx - 1]);
}
/** the lesson + item the child should do next (today's suggestion) */
export function nextItem(save: SaveV1): { lesson: Lesson; item: LessonItem } | null {
  for (let i = 0; i < LESSONS.length; i++) {
    if (!lessonUnlocked(save, i)) return null;
    const l = LESSONS[i];
    const it = l.items.find((x) => starsOf(save, x.id) === 0);
    if (it) return { lesson: l, item: it };
  }
  return null;
}
export const academyDone = (save: SaveV1): number => LESSONS.reduce((a, l) => a + doneCount(save, l), 0);

// ------------------------------------------------------------------ 残局 unlocks (§4.2)
export function endgameTierUnlocked(save: SaveV1, tier: 1 | 2): boolean {
  if (save.settings.unlockAll) return true;
  if (tier === 1) return lessonPassed(save, lessonById('L5'));
  const t1 = ENDGAMES.filter((e) => e.tier === 1).filter((e) => starsOf(save, e.id) >= 1).length;
  return t1 >= 6 && lessonPassed(save, lessonById('L6'));
}
export const endgamesDone = (save: SaveV1, tier: 1 | 2): number => ENDGAMES.filter((e) => e.tier === tier && starsOf(save, e.id) >= 1).length;

// ------------------------------------------------------------------ 天梯 (§4.4)
export const MODE_LESSON: Record<LadderMode, string> = { fan: 'F', ming: 'L7', an: 'L8' };
/**
 * The modes 对战 and 和爸爸下 offer (Dad, 2026-10-08: the family only plays 翻翻棋). 明棋 / 暗棋 and the
 * 实体棋裁判 stay in the code (engine, AI, saves, tests) — add them back here to show them again.
 */
export const PLAY_MODES: readonly LadderMode[] = ['fan'];
export const modeShown = (m: LadderMode): boolean => PLAY_MODES.includes(m);
export function ladderModeUnlocked(save: SaveV1, mode: LadderMode): boolean {
  return save.settings.unlockAll || lessonPassed(save, lessonById(MODE_LESSON[mode]));
}
/** highest opponent level open in a mode: 1 + every level with ≥ 2 wins (handicap / undo wins count) */
export function ladderOpen(save: SaveV1, mode: LadderMode): number {
  if (save.settings.unlockAll) return 4;
  const t = save.ladder[mode];
  let open = 1;
  for (let l = 1; l <= 3; l++) if (t.wins[l - 1] >= 2) open = l + 1;
  return Math.max(open, t.unlocked);
}
export type GameOutcome = 'win' | 'loss' | 'draw';
export interface LadderResult {
  mode: LadderMode;
  level: 1 | 2 | 3 | 4;
  outcome: GameOutcome;
  handicap: boolean;
  undo: boolean;
}
/** book a ladder game; returns what changed (new opponent unlocked, handicap offer) */
export function recordLadder(save: SaveV1, r: LadderResult): { unlocked: number | null; offer: 0 | 1 | 2 } {
  const t: LadderTrack = save.ladder[r.mode];
  const i = r.level - 1;
  const before = ladderOpen(save, r.mode);
  const clean = !r.handicap && !r.undo;
  if (r.outcome === 'win') {
    t.wins[i]++;
    if (clean) t.cleanWins[i]++;
    if (r.handicap) t.handicapWins[i]++;
    if (r.undo) t.undoWins[i]++;
    t.streakLoss[i] = 0;
    t.handicapOffer = 0;
  } else if (r.outcome === 'loss') {
    t.losses[i]++;
    t.streakLoss[i]++;
  } else {
    t.draws[i]++;
  }
  if (clean) {
    t.recent[i] = [...(t.recent[i] ?? []), r.outcome === 'win' ? 1 : r.outcome === 'draw' ? 0.5 : 0].slice(-5);
  }
  // handicap offer (§4.4): 3 losses in a row → 军长; 3 more → 军长 + 师长
  let offer: 0 | 1 | 2 = 0;
  if (r.outcome === 'loss' && t.streakLoss[i] > 0 && t.streakLoss[i] % 3 === 0) offer = t.streakLoss[i] >= 6 ? 2 : 1;
  if (offer) t.handicapOffer = offer;
  const after = ladderOpen(save, r.mode);
  t.unlocked = Math.max(t.unlocked, after);
  return { unlocked: after > before ? after : null, offer };
}
/** 稳定战胜 (parent panel): last 5 clean games scored ≥ 0.6 */
export function steadyWin(save: SaveV1, mode: LadderMode, level: number): boolean {
  const rec = save.ladder[mode].recent[level - 1] ?? [];
  return rec.length >= 5 && rec.reduce((a, b) => a + b, 0) / rec.length >= 0.6;
}
/** highest level beaten at least once in a mode (parent metric 2) */
export function bestBeaten(save: SaveV1, mode: LadderMode): number {
  const t = save.ladder[mode];
  let best = 0;
  for (let l = 1; l <= 4; l++) if (t.wins[l - 1] > 0) best = l;
  return best;
}

// ------------------------------------------------------------------ rank (§5.4)
const anyMode = (save: SaveV1, f: (t: LadderTrack) => boolean): boolean => (['fan', 'ming', 'an'] as LadderMode[]).some((m) => f(save.ladder[m]));
const RANK_RULES: Array<(save: SaveV1) => boolean> = [
  (s) => s.firstRun.ft,
  (s) => lessonComplete(s, lessonById('L1')) && lessonComplete(s, lessonById('L2')),
  (s) => lessonComplete(s, lessonById('F')) && lessonComplete(s, lessonById('L3')),
  (s) => lessonComplete(s, lessonById('L4')) && lessonComplete(s, lessonById('L5')),
  (s) => ['L6', 'L7', 'L8'].every((id) => lessonComplete(s, lessonById(id))),
  (s) => anyMode(s, (t) => t.wins[1] > 0),
  (s) => endgamesDone(s, 1) >= 8 || anyMode(s, (t) => t.wins[2] > 0),
  (s) => endgamesDone(s, 2) >= 6 && anyMode(s, (t) => t.cleanWins[2] > 0),
  (s) => anyMode(s, (t) => t.cleanWins[3] > 0),
];
/** the rank the save qualifies for (in order; an early-met condition promotes straight on) */
export function rankEarned(save: SaveV1): number {
  let r = -1;
  for (let i = 0; i < RANK_RULES.length; i++) {
    if (!RANK_RULES[i](save)) break;
    r = i;
  }
  return r;
}
/** promote (never down); returns the new ranks reached (for the ceremony), possibly several */
export function promote(save: SaveV1): number[] {
  const earned = rankEarned(save);
  const cur = save.rank;
  const out: number[] = [];
  for (let r = cur + 1; r <= earned; r++) out.push(r);
  if (earned > cur) save.rank = earned;
  return out;
}

// ------------------------------------------------------------------ cards (§5.5)
/** 'ladder-fan' = the first finished ladder 翻翻棋 (守规矩: 输赢都握握手) — it used to wait for a 实体棋裁判 game */
export type CardEvent = 'bomb-trade' | 'camp-save' | 'flag-capture' | 'ladder-an' | 'ladder-fan' | 'family' | 'physical-game';
/** award lesson cards (L2–L7 complete) and event cards; returns the new card ids */
export function awardCards(save: SaveV1, events: CardEvent[] = []): string[] {
  const out: string[] = [];
  for (const c of CARDS) {
    if (save.cards.includes(c.id)) continue;
    const ok = c.unlock.kind === 'lesson' ? lessonPassed(save, lessonById(c.unlock.id)) : events.includes(c.unlock.id as CardEvent);
    if (ok) {
      save.cards.push(c.id);
      out.push(c.id);
    }
  }
  return out;
}

// ------------------------------------------------------------------ mastery (parent panel, §5.3)
/** a concept is mastered when every item that teaches it was last done with ≥ 2★ and without H2/H3 */
export function mastered(save: SaveV1, concept: string): boolean {
  const items = LESSONS.flatMap((l) => l.items).filter((i) => i.concept === concept || (i.also ?? []).includes(concept));
  return items.length > 0 && items.every((i) => {
    const r = save.items[i.id] as ItemRecord | undefined;
    return !!r && (r.last ?? r.stars) >= 2 && (r.lastHint ?? r.hintMax) < 2;
  });
}
export const CONCEPT_NAMES: Record<string, string> = {
  rank: '军衔大小', combat: '大吃小、一样大一起下场', bomb: '炸弹碰谁都一起下场', mine: '地雷只怕工兵和炸弹', flag: '谁都能扛旗、扛到立刻获胜',
  fanflip: '翻开定颜色、暗子不能打', fanlock: '翻翻棋：挖光地雷才能扛旗', road: '公路一次一步、三个路口过山界', camp: '行营：斜线进出、里面打不到',
  hq: '大本营：进去就不能动', rail: '铁路直行、不限格', railblock: '铁路不能越子、先碰到谁', railturn: '非工兵不能拐弯', engturn: '工兵在铁路上能拐弯',
  engdig: '工兵挖雷开路', defend: '守住自己的军旗', nomoves: '对方没棋可走也算赢', deploy: '布阵规矩', infer: '从裁判结果推理', reveal: '司令下场亮军旗',
};
