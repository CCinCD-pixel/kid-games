/**
 * Meta progress (spec §5.3–§5.5, §4.4, §8.10 progress.test): stars, unlocks (incl. 全部打开), the
 * rank ladder in order with clean wins, knowledge-card conditions, handicap / undo win counting,
 * mastery, the camp's "today" suggestion.
 */
import { describe, expect, test } from 'vitest';
import { defaultSave, type SaveV1 } from '../src/ctrl/save';
import { CARDS, ENDGAMES, LESSONS } from '../src/content';
import {
  awardCards, boardStars, cardStars, deployStars, endgameTierUnlocked, ladderModeUnlocked, ladderOpen, lessonUnlocked, mastered, nextItem, promote, rankEarned, recordItem, recordLadder, steadyWin,
} from '../src/core/progress';

const lesson = (id: string) => LESSONS.find((l) => l.id === id)!;
function passLesson(s: SaveV1, id: string, stars: 1 | 2 | 3 = 1, all = true): void {
  const items = lesson(id).items;
  for (const it of all ? items : items.slice(0, -1)) recordItem(s, it.id, stars, { hintMax: 0, moves: 1 });
}

describe('stars (§5.3)', () => {
  test('board / endgame stars', () => {
    expect(boardStars(2, 2, false, false)).toBe(3);
    expect(boardStars(4, 2, false, false)).toBe(2);
    expect(boardStars(5, 2, false, false)).toBe(1);
    expect(boardStars(4, 2, true, false)).toBe(2); // H3 used, still ≤ par + 2
    expect(boardStars(2, 2, false, true)).toBe(2); // the twin within par
    expect(boardStars(3, 2, false, true)).toBe(1);
  });
  test('cards, scenes, deploy items', () => {
    expect(cardStars(0)).toBe(3);
    expect(cardStars(2)).toBe(2);
    expect(cardStars(3)).toBe(1);
    expect(cardStars(0, true)).toBe(2);
    expect(deployStars(0)).toBe(3);
    expect(deployStars(2)).toBe(2);
    expect(deployStars(5)).toBe(1);
    expect(deployStars(0, true)).toBe(1 + 1);
  });
  test('the record keeps the best stars; the latest attempt is kept for mastery', () => {
    const s = defaultSave();
    expect(recordItem(s, 'L1-3', 2, { hintMax: 1, moves: 3 })).toBe(true);
    expect(recordItem(s, 'L1-3', 1, { hintMax: 3, moves: 6 })).toBe(false);
    expect(s.items['L1-3'].stars).toBe(2);
    expect(s.items['L1-3'].last).toBe(1);
    expect(s.items['L1-3'].tries).toBe(2);
  });
});

describe('unlocks', () => {
  test('a lesson opens when the previous one has ≥ (items − 1) items with ≥ 1★; 全部打开 opens everything', () => {
    const s = defaultSave();
    expect(lessonUnlocked(s, 0)).toBe(true);
    expect(lessonUnlocked(s, 1)).toBe(false);
    passLesson(s, 'L1', 1, false);
    expect(lessonUnlocked(s, 1)).toBe(true);
    const t = defaultSave();
    t.settings.unlockAll = true;
    expect(LESSONS.every((_, i) => lessonUnlocked(t, i))).toBe(true);
    expect(ladderOpen(t, 'an')).toBe(4);
  });
  test('ladder modes open with F / L7 / L8; endgame tiers with L5, then 6 tier-1 endgames and L6', () => {
    const s = defaultSave();
    expect(ladderModeUnlocked(s, 'fan')).toBe(false);
    passLesson(s, 'F');
    expect(ladderModeUnlocked(s, 'fan')).toBe(true);
    expect(ladderModeUnlocked(s, 'ming')).toBe(false);
    expect(endgameTierUnlocked(s, 1)).toBe(false);
    passLesson(s, 'L5');
    expect(endgameTierUnlocked(s, 1)).toBe(true);
    for (const e of ENDGAMES.filter((x) => x.tier === 1).slice(0, 6)) recordItem(s, e.id, 1, { hintMax: 0 });
    expect(endgameTierUnlocked(s, 2)).toBe(false);
    passLesson(s, 'L6');
    expect(endgameTierUnlocked(s, 2)).toBe(true);
  });
  test('two wins open the next robot; handicap and undo wins count; a handicap is offered after 3 losses in a row', () => {
    const s = defaultSave();
    expect(ladderOpen(s, 'fan')).toBe(1);
    recordLadder(s, { mode: 'fan', level: 1, outcome: 'win', handicap: false, undo: false });
    const r = recordLadder(s, { mode: 'fan', level: 1, outcome: 'win', handicap: true, undo: false });
    expect(r.unlocked).toBe(2);
    expect(s.ladder.fan.handicapWins[0]).toBe(1);
    expect(s.ladder.fan.cleanWins[0]).toBe(1);
    for (let i = 0; i < 2; i++) expect(recordLadder(s, { mode: 'fan', level: 2, outcome: 'loss', handicap: false, undo: false }).offer).toBe(0);
    expect(recordLadder(s, { mode: 'fan', level: 2, outcome: 'loss', handicap: false, undo: false }).offer).toBe(1);
    for (let i = 0; i < 2; i++) recordLadder(s, { mode: 'fan', level: 2, outcome: 'loss', handicap: false, undo: false });
    expect(recordLadder(s, { mode: 'fan', level: 2, outcome: 'loss', handicap: false, undo: false }).offer).toBe(2);
    recordLadder(s, { mode: 'fan', level: 2, outcome: 'win', handicap: false, undo: true });
    expect(s.ladder.fan.undoWins[1]).toBe(1);
    expect(s.ladder.fan.streakLoss[1]).toBe(0);
  });
  test('稳定战胜 counts the last 5 clean games only', () => {
    const s = defaultSave();
    for (let i = 0; i < 5; i++) recordLadder(s, { mode: 'ming', level: 1, outcome: i < 3 ? 'win' : 'loss', handicap: false, undo: false });
    expect(steadyWin(s, 'ming', 1)).toBe(true);
    for (let i = 0; i < 3; i++) recordLadder(s, { mode: 'ming', level: 1, outcome: 'win', handicap: true, undo: false });
    expect(s.ladder.ming.recent[0].length).toBe(5); // handicap wins are not clean
  });
});

describe('rank (§5.4): deterministic, in order, never down', () => {
  test('the nine ranks in order; clean wins only for 军长 / 司令', () => {
    const s = defaultSave();
    expect(rankEarned(s)).toBe(-1);
    s.firstRun.ft = true;
    expect(promote(s)).toEqual([0]);
    passLesson(s, 'L1');
    passLesson(s, 'L2');
    expect(promote(s)).toEqual([1]);
    passLesson(s, 'F');
    passLesson(s, 'L3');
    passLesson(s, 'L4');
    passLesson(s, 'L5');
    expect(promote(s)).toEqual([2, 3]); // conditions met early promote straight on
    for (const l of ['L6', 'L7', 'L8']) passLesson(s, l);
    expect(promote(s)).toEqual([4]);
    recordLadder(s, { mode: 'an', level: 2, outcome: 'win', handicap: true, undo: false });
    expect(promote(s)).toEqual([5]);
    recordLadder(s, { mode: 'an', level: 3, outcome: 'win', handicap: false, undo: true });
    expect(promote(s)).toEqual([6]); // any win over 雷达
    for (const e of ENDGAMES.filter((x) => x.tier === 2).slice(0, 6)) recordItem(s, e.id, 1, { hintMax: 0 });
    expect(promote(s)).toEqual([]); // 军长 needs a CLEAN win over 雷达
    recordLadder(s, { mode: 'fan', level: 3, outcome: 'win', handicap: false, undo: false });
    expect(promote(s)).toEqual([7]);
    recordLadder(s, { mode: 'fan', level: 4, outcome: 'win', handicap: true, undo: false });
    expect(promote(s)).toEqual([]); // 司令 needs a clean win over 老将
    recordLadder(s, { mode: 'ming', level: 4, outcome: 'win', handicap: false, undo: false });
    expect(promote(s)).toEqual([8]);
    expect(s.rank).toBe(8);
  });
});

describe('knowledge cards (§5.5)', () => {
  test('lesson cards with their lessons, event cards with their events, never twice', () => {
    const s = defaultSave();
    passLesson(s, 'L2');
    expect(awardCards(s)).toEqual(['mine']);
    expect(awardCards(s)).toEqual([]);
    expect(awardCards(s, ['bomb-trade', 'family'])).toEqual(['bomb', 'family']);
    expect(CARDS.length).toBe(12);
  });
});

describe('mastery and today', () => {
  test('a concept is mastered when its items were last done with ≥ 2★ and without H2/H3', () => {
    const s = defaultSave();
    const items = LESSONS.flatMap((l) => l.items).filter((i) => i.concept === 'rank' || (i.also ?? []).includes('rank'));
    for (const it of items) recordItem(s, it.id, 2, { hintMax: 1 });
    expect(mastered(s, 'rank')).toBe(true);
    recordItem(s, items[0].id, 3, { hintMax: 2 });
    expect(mastered(s, 'rank')).toBe(false);
  });
  test('the next item follows the lessons in order', () => {
    const s = defaultSave();
    expect(nextItem(s)?.item.id).toBe('L1-1');
    passLesson(s, 'L1');
    expect(nextItem(s)?.item.id).toBe('L2-1');
  });
});
