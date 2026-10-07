/**
 * Save (spec §8.7 + §10.1 #10), unlocking (§5.5), meta progress (§5.5), input settings (§3.2) and the
 * narration text manifest (§7.3 lines.test / voice-flag.test).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MemoryStorage } from '../../tests/helpers/memory-storage';
import { applyCertPass, applyLevelResult, applyQuizResult, applyRandomResult, grantRewards, hubLine } from './src/app/collection';
import { LEGACY_SNAPSHOT_KEY, SAVE_KEY, defaults, openSave, type SaveV1 } from './src/app/save';
import { deadMarkerFor, inputModeFor, swipeEnabled } from './src/app/settings';
import { levelBroken, resetBroken } from './src/app/broken';
import { arrowsAvailable, canName, certOpen, chapterInfo, currentLevel, isLevelOpen, nextAfter, openLevels, randomTierOpen } from './src/app/unlock';
import { loadVisit, newVisit, noteActive, noteLevel, noteRandomH3, slowDue, storeVisit, visitClock, wrapDue } from './src/app/visit';
import { CARDS, CHAPTERS, CLASSIC_LEVELS, COSMETICS, LINES, VOICE, allPushLevels, chapterLevels, levelById } from './src/data';
// @ts-expect-error -- plain ESM tool with JSDoc types
import { parseNarrationYaml } from '../../tools/sokoban/narration-json.mjs';
// @ts-expect-error -- plain ESM tool with JSDoc types
import { lintTone } from '../../tools/check-content.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const pass = (save: SaveV1, id: string, pushes?: number) => applyLevelResult(save, levelById(id)!, { pushes: pushes ?? levelById(id)!.opt.pushes, stars: 3, hintMax: 0, clean: true });

describe('save', () => {
  it('imports the old sokoban_save into 经典仓库 (旧记录, frontier, veteran) and never deletes it', () => {
    const st = new MemoryStorage();
    const old = JSON.stringify({ best: { 0: 12, 3: 40 }, unlocked: 4 });
    st.setItem('sokoban_save', old);
    const h = openSave(st);
    expect(h.readOnly).toBe(false);
    expect(h.data.levels.C1).toMatchObject({ stars: 1, legacy: true, best: null });
    expect(h.data.levels.C4).toMatchObject({ stars: 1, legacy: true });
    expect(h.data.veteran).toBe(false);
    const open = [...openLevels(h.data, 'classic')];
    expect(open).toEqual(['C1', 'C2', 'C3', 'C4', 'C5', 'C6']);
    expect(st.getItem('sokoban_save')).toBe(old);
  });

  it('prefers the hub snapshot envelope and flags veterans (old 1–7 all passed)', () => {
    const st = new MemoryStorage();
    st.setItem(LEGACY_SNAPSHOT_KEY, JSON.stringify({ v: 1, updatedAt: 1, data: { best: { 0: 1, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1 }, unlocked: 7 } }));
    st.setItem('sokoban_save', JSON.stringify({ best: { 0: 1 }, unlocked: 1 }));
    const h = openSave(st);
    expect(h.data.veteran).toBe(true);
    expect(Object.keys(h.data.levels).sort()).toEqual(['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7']);
  });

  it('read-only when the save is newer: playing and leaving never changes the raw string', () => {
    const st = new MemoryStorage();
    const raw = JSON.stringify({ v: 2, updatedAt: 5, data: { future: true } });
    st.setItem(SAVE_KEY, raw);
    const h = openSave(st);
    expect(h.readOnly).toBe(true);
    h.update((s) => {
      s.inProgress = { id: '2-1', hist: '0u', at: 1 };
    });
    h.saveSoon();
    h.save();
    h.flush();
    expect(st.getItem(SAVE_KEY)).toBe(raw);
  });

  it('round-trips through storage', () => {
    const st = new MemoryStorage();
    const h = openSave(st);
    h.update((s) => {
      s.tutorialDone = true;
      s.inProgress = { id: '2-5', hist: '0r**1d', at: 7 };
    });
    const again = openSave(st);
    expect(again.data.tutorialDone).toBe(true);
    expect(again.data.inProgress).toEqual({ id: '2-5', hist: '0r**1d', at: 7 });
  });
});

describe('unlock', () => {
  it('a level whose data does not parse is 维修中: never opens and is skipped (spec §3.10)', () => {
    const l = levelById('0-2')!;
    const keep = l.map;
    const err = console.error;
    const logged: unknown[] = [];
    console.error = (...a: unknown[]) => void logged.push(a);
    try {
      l.map = ['###', '#@#'];
      resetBroken();
      expect(levelBroken(l)).toBe(true);
      expect(logged.length).toBe(1);
      const s = defaults();
      pass(s, '0-1');
      // strict chapter 0: 0-2 is skipped, 0-3 opens; 0-2 itself never opens; the marker skips it
      expect(openLevels(s, 0).has('0-3')).toBe(true);
      expect(isLevelOpen(s, l)).toBe(false);
      expect(currentLevel(s, 0)).toBe('0-3');
    } finally {
      l.map = keep;
      resetBroken();
      console.error = err;
    }
    expect(levelBroken(l)).toBe(false);
  });

  it('chapter 0 is strictly in order', () => {
    const s = defaults();
    expect([...openLevels(s, 0)]).toEqual(['0-1']);
    pass(s, '0-1');
    expect([...openLevels(s, 0)]).toEqual(['0-1', '0-2']);
    expect(currentLevel(s, 0)).toBe('0-2');
  });

  it('chapters keep two unpassed levels open; 70 % or the boss opens the next chapter', () => {
    const s = defaults();
    for (const id of ['0-1', '0-2', '0-3']) pass(s, id);
    expect(chapterInfo(s, 1).open).toBe(true); // ceil(0.7 × 4) = 3
    expect([...openLevels(s, 1)]).toEqual(['1-1', '1-2']);
    pass(s, '1-1');
    expect([...openLevels(s, 1)]).toEqual(['1-1', '1-2', '1-3']);
    expect(chapterInfo(s, 2).open).toBe(false);
    const o = pass(s, '1-6'); // the boss
    expect(chapterInfo(s, 2).open).toBe(true);
    expect(o.openedChapters).toContain(2);
    expect(o.arrowsUnlocked).toBe(true);
    expect(s.arrows).toBe('celebrate');
    expect(arrowsAvailable(s)).toBe(true);
  });

  it('the cert counts as all of chapter 1', () => {
    const s = defaults();
    s.cert.passed = true;
    for (const id of ['0-1', '0-2', '0-3', '0-4']) pass(s, id);
    expect(chapterInfo(s, 1).complete).toBe(true);
    expect(openLevels(s, 1).size).toBe(6);
    expect(chapterInfo(s, 2).open).toBe(true);
  });

  it('next level: same track, then the next chapter, else the map', () => {
    const s = defaults();
    pass(s, '0-1');
    expect(nextAfter(s, '0-1', true)).toEqual({ kind: 'level', id: '0-2' });
    for (const id of ['0-2', '0-3', '0-4']) pass(s, id);
    // the first pass of 0-4 opens the 跳级考试 offer (once)
    expect(nextAfter(s, '0-4', true)).toEqual({ kind: 'cert-offer' });
    s.cert.offered = true;
    expect(nextAfter(s, '0-4', false)).toEqual({ kind: 'level', id: '1-1', newChapter: 1 });
    expect(nextAfter(s, 'cert-1', true)).toEqual({ kind: 'level', id: 'cert-2' });
    expect(nextAfter(s, 'cert-2', true)).toEqual({ kind: 'map' });
    // a twin continues where its original would
    expect(nextAfter(s, '0-1~twin', true)).toEqual(nextAfter(s, '0-1', false));
    pass(s, 'C1');
    expect(nextAfter(s, 'C1', true)).toEqual({ kind: 'level', id: 'C2' });
  });

  it('naming follows the lessons (corner = 0-3, wall = 3-2, pair = 3-4, square = 4-2)', () => {
    const s = defaults();
    expect(canName(s, 'corner', '0-3')).toBe(true);
    expect(canName(s, 'corner', '1-1')).toBe(false);
    pass(s, '0-1');
    pass(s, '0-2');
    pass(s, '0-3');
    expect(canName(s, 'corner', '1-1')).toBe(true);
    expect(s.taught).toContain('corner');
    expect(canName(s, 'pair', '2-6')).toBe(false);
  });
});

describe('collection', () => {
  it('first passes launch once per level; replays do not count; hub line', () => {
    const s = defaults();
    const a = pass(s, '0-1');
    expect(a.firstPass && a.launchCounted && a.firstOnRoute).toBe(true);
    const b = pass(s, '0-1', 5);
    expect(b.firstPass || b.launchCounted).toBe(false);
    expect(s.levels['0-1']).toMatchObject({ best: 1, stars: 3, plays: 2 });
    expect(s.launched).toMatchObject({ total: 1, byDest: { tiangong: 1, moon: 0, mars: 0 } });
    expect(hubLine(s).label).toBe('第0章 · 发射1枚');
  });
  it('a legacy classic record is re-scored and launched on its first new pass', () => {
    const s = defaults();
    s.levels.C1 = { best: null, stars: 1, clean: false, firstClean: false, plays: 0, hintMax: 0, legacy: true };
    const o = pass(s, 'C1');
    expect(o.launchCounted).toBe(true);
    expect(s.levels.C1.legacy).toBeUndefined();
    expect(s.levels.C1.stars).toBe(3);
  });
});

describe('stage 2: cert, quizzes, random tiers, rewards, finale', () => {
  it('the cert node opens after 0-4; passing it opens chapter 2, the upgrade and the hat', () => {
    const s = defaults();
    expect(certOpen(s)).toBe(false);
    for (const id of ['0-1', '0-2', '0-3', '0-4']) pass(s, id);
    expect(certOpen(s)).toBe(true);
    expect(isLevelOpen(s, levelById('cert-1')!)).toBe(true);
    expect(chapterInfo(s, 2).open).toBe(false);
    const o = applyCertPass(s, 123);
    expect(s.cert).toMatchObject({ passed: true, offered: true, at: 123 });
    expect(chapterInfo(s, 1).complete).toBe(true);
    expect(o.openedChapters).toContain(2);
    expect(o.completedChapters).toContain(1);
    expect(o.arrowsUnlocked).toBe(true);
    expect(o.newItems).toEqual(['hat']);
    expect(o.newCards).toEqual(['cz7']);
    expect(s.cosmetics.equipped.hat).toBe('hat');
    // chapter 0 complete already gave the name plate + the 天舟 card
    expect(s.cosmetics.owned).toEqual(['plate', 'hat']);
    expect(s.cards).toEqual(['tianzhou', 'cz7']);
  });

  it('quizzes count as chapter levels; no rocket for a quiz', () => {
    const s = defaults();
    s.cert.passed = true;
    for (const c of [0, 1, 2]) for (const l of chapterLevels(c)) pass(s, l.id);
    for (const id of ['3-1', '3-2']) pass(s, id);
    expect([...openLevels(s, 3)]).toEqual(['3-1', '3-2', '3-3', '3-4']);
    const before = s.launched.total;
    const o = applyQuizResult(s, levelById('3-3')!, 2, 2);
    expect(o.firstPass).toBe(true);
    expect(o.launchCounted).toBe(false);
    expect(s.launched.total).toBe(before);
    expect(s.quiz['3-3']).toEqual({ stars: 2, firstTry: 2 });
    expect([...openLevels(s, 3)]).toContain('3-5');
  });

  it('random tiers open at 70 % of chapters 2 / 3 / 4; every delivery counts on the tier route', () => {
    const s = defaults();
    s.cert.passed = true;
    for (const c of [0, 1]) for (const l of chapterLevels(c)) pass(s, l.id);
    expect(randomTierOpen(s, 1)).toBe(false);
    for (const id of ['2-1', '2-2', '2-3', '2-4', '2-5']) pass(s, id);
    expect(randomTierOpen(s, 1)).toBe(false); // 5 < ceil(0.7 × 8) = 6
    const o = pass(s, '2-6');
    expect(randomTierOpen(s, 1)).toBe(true);
    expect(o.openedTiers).toEqual([1]);
    expect(randomTierOpen(s, 2)).toBe(false);
    const r = applyRandomResult(s, 2, 77);
    expect(s.launched.random).toBe(1);
    expect(s.random.byTier).toEqual([0, 1, 0, 0]);
    expect(s.random.recent).toEqual([77]);
    expect(r.firstOnRoute).toBe(s.launched.byDest.moon === 1);
    for (let i = 0; i < 9; i += 1) applyRandomResult(s, 1, 100 + i);
    expect(s.cosmetics.owned).toContain('random');
    expect(s.random.recent.length).toBe(10);
  });

  it('twins: own stars, never a launch, a hint-free pass counts as mastery of the original', () => {
    const s = defaults();
    pass(s, '0-1');
    s.levels['0-1'].clean = false;
    const t = levelById('0-1~twin')!;
    expect(t.track).toBe('twin');
    expect(isLevelOpen(s, t)).toBe(true);
    const o = applyLevelResult(s, t, { pushes: 1, stars: 3, hintMax: 1, clean: true });
    expect(o.launchCounted).toBe(false);
    expect(s.levels['0-1']).toMatchObject({ twinStars: 3, clean: true, stars: 3 });
    expect(s.launched.total).toBe(1);
  });

  it('the v1 finale is due once, on the first pass of 4-7; classic all → retro paint', () => {
    const s = defaults();
    s.cert.passed = true;
    for (const c of [0, 1, 2, 3]) for (const l of chapterLevels(c)) (l.kind === 'quiz' ? applyQuizResult(s, l, 3, 3) : pass(s, l.id));
    const o = pass(s, '4-7');
    expect(o.finale).toBe(true);
    s.finale.v1At = 1;
    expect(pass(s, '4-7').finale).toBe(false);
    for (const l of CLASSIC_LEVELS) pass(s, l.id);
    expect(s.cosmetics.owned).toContain('retro');
    expect(s.cosmetics.equipped.paint).toBe('retro');
    expect(grantRewards(s)).toEqual({ newItems: [], newCards: [] });
  });

  it('content: 5 cards and 7 cosmetics in v1, every line exists', () => {
    expect(CARDS.map((c) => c.id)).toEqual(['tianzhou', 'cz7', 'wenchang', 'strap', 'order']);
    expect(COSMETICS.map((c) => c.id)).toEqual(['plate', 'hat', 'lamp', 'magnifier', 'stripes', 'retro', 'random']);
    const ids = new Set(LINES.map((l) => l.id));
    for (const c of CARDS) {
      expect(ids.has(c.line), c.line).toBe(true);
      expect(LINES.find((l) => l.id === c.line)!.text).toBe(c.text);
      expect([...c.text].length).toBeLessThanOrEqual(15);
    }
    for (const c of COSMETICS) expect(ids.has(c.line), c.line).toBe(true);
    for (const c of CHAPTERS) for (const n of c.talk) expect(ids.has(`sok.talk.${n}`), `talk ${n}`).toBe(true);
  });

  it('visit: wrap-up after 12 min or 6 levels (once); H3 twice in a chapter slows the next; random smaller once', () => {
    const v = newVisit(0);
    for (let i = 0; i < 5; i += 1) noteLevel(v, { id: `x${i}`, ch: 2, h3: false, activeMs: 60_000, launched: true, dest: 'moon', now: i });
    expect(wrapDue(v)).toBe(false);
    noteLevel(v, { id: 'x5', ch: 2, h3: true, activeMs: 1000, launched: false, now: 6 });
    expect(wrapDue(v)).toBe(true);
    expect(v.launches.moon).toBe(5);
    expect(slowDue(v, 2)).toBe(false);
    noteLevel(v, { id: 'x6', ch: 2, h3: true, activeMs: 1000, launched: false, now: 7 });
    expect(slowDue(v, 2)).toBe(true);
    const w = newVisit(0);
    noteLevel(w, { id: 'a', ch: 1, h3: false, activeMs: 13 * 60_000, launched: false });
    expect(wrapDue(w)).toBe(true);
    expect([noteRandomH3(w, 2, true), noteRandomH3(w, 2, true), noteRandomH3(w, 2, true), noteRandomH3(w, 2, true)]).toEqual([false, false, true, false]);
    const st = new MemoryStorage();
    storeVisit(v, st);
    expect(loadVisit(10, st).levels).toBe(7);
    expect(loadVisit(10 + 31 * 60_000, st).levels).toBe(0);
  });

  it('visit clock books a level once (QA r3: route clock + level time counted it twice)', () => {
    const v = newVisit(0);
    const clock = visitClock(v, 0);
    clock.tick(false, 5_000); // 5 s on the map, then go(play)
    // a 15 s level that the play screen books itself on the pass
    noteLevel(v, { id: '2-8', ch: 2, h3: false, activeMs: 15_000, launched: false, now: 20_000 });
    clock.tick(true, 20_500); // go(map): the level owned the clock, nothing more booked
    expect(v.activeMs).toBe(20_000);
    clock.tick(false, 30_500); // 10 s on the map
    expect(v.activeMs).toBe(30_000);
    // a level left unfinished books its own active time (noteActive from destroy), still once
    noteActive(v, 8_000, 40_000);
    clock.tick(true, 40_500);
    expect(v.activeMs).toBe(38_000);
    // an idle gap off a level counts at most 60 s
    clock.tick(false, 40_500 + 10 * 60_000);
    expect(v.activeMs).toBe(98_000);
    // paused → resumed: the hidden time is not booked
    clock.reset(2_000_000);
    clock.tick(false, 2_001_000);
    expect(v.activeMs).toBe(99_000);
  });
});

describe('input settings', () => {
  it('footprints in chapters 0–1; arrows from chapter 2 after the upgrade; swipe auto', () => {
    const s = defaults();
    expect(inputModeFor(s, levelById('1-1')!)).toBe('footprints');
    expect(inputModeFor(s, levelById('2-1')!)).toBe('footprints');
    s.arrows = 'on';
    expect(inputModeFor(s, levelById('1-1')!)).toBe('footprints');
    expect(inputModeFor(s, levelById('2-1')!)).toBe('arrows');
    expect(inputModeFor(s, levelById('C3')!)).toBe('arrows');
    s.settings.autoRoute = false;
    expect(inputModeFor(s, levelById('2-1')!)).toBe('footprints');
    expect(swipeEnabled(s, levelById('1-1')!)).toBe(false);
    expect(swipeEnabled(s, levelById('2-1')!)).toBe(true);
    s.settings.swipe = 'off';
    expect(swipeEnabled(s, levelById('2-1')!)).toBe(false);
    expect(deadMarkerFor(s, levelById('C3')!)).toBe('instant');
    expect(deadMarkerFor(s, levelById('2-2')!)).toBe('instant');
  });
});

describe('narration lines', () => {
  const yaml = parseNarrationYaml(fs.readFileSync(path.join(ROOT, 'content/sokoban/narration.yaml'), 'utf8'));
  it('lines.json is the yaml (in sync)', () => {
    expect(LINES).toEqual(yaml.lines);
    expect(yaml.game).toBe('sokoban');
  });
  it('167 v1 lines (166 of the spec + the quiz instruction bar), ids unique, subtitles ≤ 15 characters, tone rules pass, a .plain twin for every name line', () => {
    expect(LINES.length).toBe(167);
    expect(new Set(LINES.map((l) => l.id)).size).toBe(LINES.length);
    for (const l of LINES) {
      expect([...l.text].length, l.id).toBeLessThanOrEqual(15);
      expect(lintTone(l.text), l.id).toEqual([]);
      expect(['companion', 'narrator']).toContain(l.role);
      if (l.text.includes('小步步')) expect(LINES.some((x) => x.id === `${l.id}.plain`)).toBe(true);
    }
  });
  it('every line id the code and the levels use exists', () => {
    const ids = new Set(LINES.map((l) => l.id));
    for (const L of allPushLevels()) expect(ids.has(L.say), L.say).toBe(true);
    const src = path.join(ROOT, 'site/sokoban/src');
    const files: string[] = [];
    const walk = (d: string) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.ts') && files.push(path.join(d, e.name))));
    walk(src);
    const used = new Set<string>();
    for (const f of files) for (const m of fs.readFileSync(f, 'utf8').matchAll(/['"`](sok\.[a-z0-9.-]+?)['"`]/g)) if (!m[1].endsWith('.')) used.add(m[1]);
    for (const id of used) expect(ids.has(id), `${id} used in code`).toBe(true);
  });
  it('voice flag: clips:true ⇔ the audio manifest exists', () => {
    const exists = fs.existsSync(path.join(ROOT, 'public/audio/sokoban/audio-manifest.json'));
    expect(VOICE.clips).toBe(exists);
  });
  it('classic levels keep their old names', () => {
    expect(CLASSIC_LEVELS.map((l) => l.name).slice(0, 3)).toEqual(['初来乍到', '小试牛刀', '双箱挑战']);
  });
});
