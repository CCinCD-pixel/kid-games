/**
 * Meta progress (spec §5.5): level records, launches per route, chapter completion, the auto-route
 * upgrade, 机库 rewards (装扮 and 知识卡 at deterministic milestones — no randomness, no currency),
 * the 跳级考试 pass, 随机新仓库 tallies, the v1 finale trigger and the hub card line. Pure functions over
 * the save (the caller persists).
 */
import { CARDS, CHAPTERS, CLASSIC_LEVELS, COSMETICS, chapterLevels, chapterOf, levelById, type CosmeticDef, type Dest, type Hall, type LevelDef } from '../data';
import type { LevelRec, SaveV1, Stars } from './save';
import { LESSON_LEVEL, V1_MAIN_TOTAL, arrowsAvailable, chapterInfo, frontierChapter, levelPassed, mainPassedCount, randomTierOpen } from './unlock';

type Tier = 1 | 2 | 3;

const TIER_DEST: Record<Tier, Dest> = { 1: 'tiangong', 2: 'moon', 3: 'mars' };
const TIER_HALL: Record<Tier, Hall> = { 1: 'tiangong', 2: 'moon', 3: 'mars' };

/** The original of a 镜子仓库 twin (or the level itself). */
function baseOf(level: Pick<LevelDef, 'track' | 'ch' | 'twinOf'>): Pick<LevelDef, 'track' | 'ch'> {
  if (level.track === 'twin' && level.twinOf) return levelById(level.twinOf) ?? level;
  return level;
}

export function destFor(level: Pick<LevelDef, 'track' | 'ch' | 'twinOf' | 'random'>): Dest {
  if (level.track === 'random' && level.random) return TIER_DEST[Math.min(3, level.random.tier) as Tier];
  const b = baseOf(level);
  if (b.track === 'main') return chapterOf(Number(b.ch))?.dest ?? 'tiangong';
  return 'tiangong';
}

export function hallFor(level: Pick<LevelDef, 'track' | 'ch' | 'twinOf' | 'random'>): Hall {
  if (level.track === 'random' && level.random) return TIER_HALL[Math.min(3, level.random.tier) as Tier];
  const b = baseOf(level);
  if (b.track === 'classic') return 'classic';
  if (b.track === 'main') return chapterOf(Number(b.ch))?.hall ?? 'tiangong';
  return 'tiangong';
}

export interface LevelResult {
  pushes: number;
  stars: 1 | 2 | 3;
  hintMax: 0 | 1 | 2 | 3;
  clean: boolean;
}

export interface Outcome {
  firstPass: boolean;
  launchCounted: boolean;
  /** first launch on this route ever (the long, unskippable launch) */
  firstOnRoute: boolean;
  newBest: boolean;
  openedChapters: number[];
  completedChapters: number[];
  arrowsUnlocked: boolean;
  /** cosmetics / cards earned by this result (already owned + auto-equipped) */
  newItems: string[];
  newCards: string[];
  /** random tiers that just opened */
  openedTiers: Tier[];
  /** the v1 finale (一级调度员) is due after this result card */
  finale: boolean;
}

interface Before {
  open: boolean[];
  complete: boolean[];
  tiers: boolean[];
}

function snapshot(save: SaveV1): Before {
  return {
    open: CHAPTERS.map((c) => chapterInfo(save, c.ch).open),
    complete: CHAPTERS.map((c) => chapterInfo(save, c.ch).complete),
    tiers: ([1, 2, 3] as Tier[]).map((t) => randomTierOpen(save, t)),
  };
}

function itemEarned(save: SaveV1, it: CosmeticDef): boolean {
  const u = it.unlock;
  if (u.type === 'chapter') return chapterLevels(u.ch).length > 0 && chapterInfo(save, u.ch).complete;
  if (u.type === 'classicAll') return CLASSIC_LEVELS.every((l) => levelPassed(save, l.id));
  if (u.type === 'random') return save.launched.random >= u.n;
  return false;
}

/** Hand out every milestone reached (idempotent); new items are put on at once. */
export function grantRewards(save: SaveV1): { newItems: string[]; newCards: string[] } {
  const newItems: string[] = [];
  const newCards: string[] = [];
  for (const it of COSMETICS) {
    if (save.cosmetics.owned.includes(it.id) || !itemEarned(save, it)) continue;
    save.cosmetics.owned.push(it.id);
    save.cosmetics.equipped[it.slot] = it.id;
    newItems.push(it.id);
  }
  for (const c of CARDS) {
    if (save.cards.includes(c.id) || typeof c.ch !== 'number') continue;
    if (!(chapterLevels(c.ch).length && chapterInfo(save, c.ch).complete)) continue;
    save.cards.push(c.id);
    newCards.push(c.id);
  }
  return { newItems, newCards };
}

function after(save: SaveV1, b: Before, rest: Omit<Outcome, 'openedChapters' | 'completedChapters' | 'arrowsUnlocked' | 'newItems' | 'newCards' | 'openedTiers'>): Outcome {
  const openedChapters: number[] = [];
  const completedChapters: number[] = [];
  CHAPTERS.forEach((c, i) => {
    const now = chapterInfo(save, c.ch);
    if (!b.open[i] && now.open && chapterLevels(c.ch).length) openedChapters.push(c.ch);
    if (!b.complete[i] && now.complete) completedChapters.push(c.ch);
  });
  const openedTiers = ([1, 2, 3] as Tier[]).filter((t, i) => !b.tiers[i] && randomTierOpen(save, t));
  let arrowsUnlocked = false;
  if (save.arrows === 'locked' && arrowsAvailable(save)) {
    save.arrows = 'celebrate';
    arrowsUnlocked = true;
  }
  const { newItems, newCards } = grantRewards(save);
  return { ...rest, openedChapters, completedChapters, arrowsUnlocked, newItems, newCards, openedTiers };
}

const emptyRec = (): LevelRec => ({ best: null, stars: 0, clean: false, firstClean: false, plays: 0, hintMax: 0 });

/** A fixed push level (main, cert, classic) or a 镜子仓库 twin was solved. */
export function applyLevelResult(save: SaveV1, level: LevelDef, r: LevelResult): Outcome {
  const b = snapshot(save);
  const dest = destFor(level);
  if (level.track === 'twin' && level.twinOf) {
    // its own stars; it never changes the original's record — except that a pass without H2/H3
    // counts as mastery (clean) of the original (spec §5.1)
    const rec = save.levels[level.twinOf] ?? emptyRec();
    rec.twinStars = Math.max(rec.twinStars ?? 0, r.stars) as Stars;
    if (r.hintMax <= 1) rec.clean = true;
    save.levels[level.twinOf] = rec;
    return after(save, b, { firstPass: false, launchCounted: false, firstOnRoute: false, newBest: false, finale: false });
  }
  const prev = save.levels[level.id];
  const firstPass = !(prev && prev.stars > 0);
  const launchCounted = firstPass || !!prev?.legacy;
  const firstOnRoute = launchCounted && save.launched.byDest[dest] === 0;
  const rec: LevelRec = prev ? { ...prev } : emptyRec();
  const newBest = rec.best === null || r.pushes < rec.best;
  rec.plays += 1;
  rec.best = rec.best === null ? r.pushes : Math.min(rec.best, r.pushes);
  rec.stars = (rec.legacy ? r.stars : Math.max(rec.stars, r.stars)) as Stars;
  if (firstPass && r.clean) rec.firstClean = true;
  rec.clean = rec.clean || r.clean;
  rec.hintMax = Math.max(rec.hintMax, r.hintMax) as 0 | 1 | 2 | 3;
  delete rec.legacy;
  save.levels[level.id] = rec;
  if (launchCounted) {
    save.launched.total += 1;
    save.launched.byDest[dest] += 1;
  }
  for (const [type, id] of Object.entries(LESSON_LEVEL)) if (id === level.id && !save.taught.includes(type as never)) save.taught.push(type as never);
  const finale = level.id === '4-7' && firstPass && !save.finale.v1At;
  return after(save, b, { firstPass, launchCounted, firstOnRoute, newBest, finale });
}

/** A 侦探题 was finished (no rocket: the quiz is a lesson, not a cargo run). */
export function applyQuizResult(save: SaveV1, level: LevelDef, firstTry: number, stars: 1 | 2 | 3): Outcome {
  const b = snapshot(save);
  const prev = save.quiz[level.id];
  const firstPass = !(prev && prev.stars > 0);
  save.quiz[level.id] = { stars: Math.max(prev?.stars ?? 0, stars), firstTry: Math.max(prev?.firstTry ?? 0, firstTry) };
  return after(save, b, { firstPass, launchCounted: false, firstOnRoute: false, newBest: false, finale: false });
}

/** Both 跳级考试 levels in one go (spec §3.8): chapter 1 counts as passed, chapter 2 opens. */
export function applyCertPass(save: SaveV1, at = Date.now()): Outcome {
  const b = snapshot(save);
  const firstPass = !save.cert.passed;
  save.cert.passed = true;
  save.cert.at ??= at;
  save.cert.offered = true;
  return after(save, b, { firstPass, launchCounted: false, firstOnRoute: false, newBest: false, finale: false });
}

/** A 随机新仓库 order was delivered: its own tally, a launch on the tier's route. */
export function applyRandomResult(save: SaveV1, tier: Tier, hash: number): Outcome {
  const b = snapshot(save);
  const dest = TIER_DEST[tier];
  const firstOnRoute = save.launched.byDest[dest] === 0;
  save.launched.random += 1;
  save.launched.total += 1;
  save.launched.byDest[dest] += 1;
  save.random.byTier[tier - 1] += 1;
  save.random.recent = [...save.random.recent.filter((h) => h !== hash), hash].slice(-50);
  return after(save, b, { firstPass: true, launchCounted: true, firstOnRoute, newBest: false, finale: false });
}

/** The hub card line: a place in the story, never a score (≤ 12 chars). */
export function hubLine(save: SaveV1): { label: string; value: number } {
  const ch = frontierChapter(save);
  const n = save.launched.total;
  return { label: `第${ch}章 · 发射${n}枚`, value: Math.min(1, mainPassedCount(save) / V1_MAIN_TOTAL) };
}
