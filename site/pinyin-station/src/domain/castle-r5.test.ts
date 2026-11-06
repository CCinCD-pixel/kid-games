import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { bank } from './content';
import { currentLabel, stationOf } from './book';
import { eligibleWords, heardLetters, initialSave, recordAttempt, schedule } from './learning';
import { pageProgress, skillLabel, skillStation, stationBlends, stationColumns, stationWords, weakItems } from './progress';
import { drillTables } from './drill';
import { repairResume, repairSave, validQuestion } from './saveguard';
import { distinctSeries, readsAsOne, soundKey } from './sound';
import { validateBank } from './pinyin';
import { buildWeeklyQuiz, buildWorksheet } from './worksheet';
import { bookPages } from '../views/readbook';
import type { Question, Save } from './types';

/** Fix round (castle stage 5): same-recording options, whole syllables, 3-3 words, page mapping, damaged saves, wording. */
const root = fileURLToPath(new URL('../../../../', import.meta.url));
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public/audio/pinyin-station/audio-manifest.json'), 'utf8')) as Record<string, { src: string; text: string }>;
const yaml = JSON.parse(fs.readFileSync(path.join(root, 'content/narration/pinyin-station.yaml'), 'utf8')) as { lines: { id: string; text: string }[] };
const rerecord = JSON.parse(fs.readFileSync(path.join(root, 'content/narration/pinyin-station.rerecord.json'), 'utf8')) as { pending: string[] };
const oldEnvelope = JSON.parse(fs.readFileSync(path.join(root, 'site/pinyin-station/tests/fixtures/save-old.json'), 'utf8')) as { v: number; data: Save };
const NOW = Date.parse('2026-11-08T10:00:00+08:00');
const MODES = ['today', 'listen', 'read', 'spell', 'scene', 'repair', 'review', 'week'];
const at = (lesson: number): Save => {
  const s = initialSave();
  s.settings.lesson = lesson;
  return s;
};
let n = 0;
const miss = (s: Save, skill: string, session = 3) => recordAttempt(s, { id: `m${++n}`, skill, kind: 'B', correct: false, judge: 'deterministic', session, at: NOW - 3600_000 });

describe('P1-1 same recording, same key', () => {
  it('the key table agrees with the audio manifest: one file = one key, two files never share a key', () => {
    const byFile = new Map<string, string[]>();
    for (const [id, clip] of Object.entries(manifest)) if (id.startsWith('py.syl.')) byFile.set(clip.src, [...(byFile.get(clip.src) ?? []), id.slice(7)]);
    const keyOwner = new Map<string, string>();
    let aliasGroups = 0;
    for (const [src, ids] of byFile) {
      expect(new Set(ids.map(soundKey)).size, `${src}: ${ids.join(' ')}`).toBe(1);
      if (ids.length > 1) aliasGroups++;
      const key = soundKey(ids[0]);
      expect(keyOwner.get(key), `${key} is on two files`).toBeUndefined();
      keyOwner.set(key, src);
    }
    expect(aliasGroups).toBeGreaterThan(10);
    for (const [a, b] of [['ie2', 'ye2'], ['ve1', 'yue1'], ['in3', 'yin3'], ['vn4', 'yun4'], ['i1', 'yi1'], ['u1', 'wu1'], ['ui2', 'wei2'], ['iu3', 'you3']]) expect(soundKey(a), `${a} ${b}`).toBe(soundKey(b));
  });
  it('no question of any kind offers two options that play one recording (stations 1-12, every mode, 480 programmes each)', { timeout: 120_000 }, () => {
    let a = 0, b = 0, c = 0, h = 0;
    for (let L = 1; L <= 12; L++) {
      const s = at(L);
      for (let session = 1; session <= 60; session++) {
        s.sessions = session;
        for (const mode of MODES)
          for (const q of schedule(s, bank, mode)) {
            if (q.kind === 'A') {
              a++;
              const keys = q.choices.map((id) => soundKey(bank.letters.find((l) => l.id === id)!.callSound));
              expect(new Set(keys).size, `${q.id} at ${L}: ${q.choices}`).toBe(keys.length);
            }
            if (q.kind === 'B' || q.kind === 'C' || q.kind === 'H') {
              const keys = q.choices.map(soundKey);
              expect(new Set(keys).size, `${q.id} at ${L}: ${q.choices}`).toBe(keys.length);
              if (q.kind === 'B') b++;
              if (q.kind === 'C') c++;
              if (q.kind === 'H') h++;
            }
          }
      }
    }
    expect(a).toBeGreaterThan(2000);
    expect(b).toBeGreaterThan(1000);
    expect(c).toBeGreaterThan(1000);
    expect(h).toBeGreaterThan(300);
  });
  it('the letter heard inside a zero-initial call sound is excluded too (wēi is not "w", yōu is not "y")', () => {
    expect([...heardLetters('ui1')].sort()).toEqual(['ei', 'ui', 'w']);
    expect(heardLetters('vn1').has('y')).toBe(true);
    expect(heardLetters('vn1').has('vn')).toBe(true);
    expect(heardLetters('iu1').has('y')).toBe(true);
    const s = at(12);
    for (let session = 1; session <= 120; session++) {
      s.sessions = session;
      for (const q of schedule(s, bank, 'listen').filter((x) => x.kind === 'A')) {
        const heard = heardLetters(bank.letters.find((l) => l.id === q.target)!.callSound);
        for (const c of q.choices.filter((x) => x !== q.target)) expect(heard.has(c), `${q.id}: ${c} is inside the sound`).toBe(false);
      }
    }
  });
  it('a tone series that plays another series\' recordings is listed once (ie = ye, ve = yue, in = yin, vn = yun)', () => {
    const names = distinctSeries(bank.tone4!).map((t) => t.series);
    // (the final keeps its place; i / yi and u / wu are the same sound too)
    for (const gone of ['ye', 'yue', 'yin', 'yun', 'yi', 'wu']) expect(names, gone).not.toContain(gone);
    for (const kept of ['ie', 've', 'in', 'vn', 'yuan', 'zhi', 'ai', 'i', 'u', 'yu']) expect(names, kept).toContain(kept);
    expect(names.length).toBe(bank.tone4!.length - 6);
    const s = at(12);
    for (let session = 1; session <= 80; session++) {
      s.sessions = session;
      for (const q of schedule(s, bank, 'listen').filter((x) => x.kind === 'H')) expect(['ye', 'yue', 'yin', 'yun']).not.toContain(bank.tone4!.find((t) => t.ids.includes(q.target))!.series);
    }
  });
});

describe('P1-2 whole-recognition syllables are not spelled out', () => {
  it('z c s zh ch sh r + i never appear in C, the 拼读 drill, the print sheet, the weekly paper or the report', () => {
    expect(readsAsOne({ initial: 'zh', final: 'i' })).toBe(true);
    expect(readsAsOne({ initial: 'zh', final: 'a' })).toBe(false);
    expect(readsAsOne({ initial: 'j', final: 'i' })).toBe(false); // jī is a real blend in the book
    const whole = (initial: string, finalDisplay: string) => readsAsOne({ initial, final: finalDisplay.normalize('NFD').replace(/[̀-ͯ]/g, '') });
    for (let L = 2; L <= 12; L++) {
      const s = at(L);
      for (let session = 1; session <= 40; session++) {
        s.sessions = session;
        for (const mode of ['today', 'review', 'week', 'read'])
          for (const q of schedule(s, bank, mode).filter((x) => x.kind === 'C'))
            for (const id of [q.target, ...q.choices]) expect(readsAsOne(bank.syllables.find((x) => x.id === id)!), `${q.id}: ${id}`).toBe(false);
      }
      for (const t of drillTables(bank, L).filter((x) => x.kind === 'blend'))
        for (const id of t.cells) expect(readsAsOne(bank.syllables.find((x) => x.id === id)!), `${t.id}: ${id}`).toBe(false);
      const sheet = buildWorksheet(at(L), bank, L, NOW);
      for (const g of sheet.groups) for (const x of g.blends) expect(whole(x.initial, x.final), `${L}: ${x.initial}+${x.final}`).toBe(false);
      for (const q of buildWeeklyQuiz(at(L), bank, NOW).quiz) if (q.type === 'blend') expect(whole(q.initial, q.final), `week ${L}: ${q.initial}+${q.final}`).toBe(false);
      for (const x of stationBlends(bank, L)) expect(readsAsOne(x), x.id).toBe(false);
    }
    // ... but they are still asked as letters and in their tone series
    expect(bank.letters.some((l) => l.id === 'zhi')).toBe(true);
    expect(bank.tone4!.some((t) => t.series === 'zhi')).toBe(true);
  });
});

describe('P1-3 3-3 words (水饺 祖母 打鼓 马匹)', () => {
  it('are flagged exactly when they are two third tones, and are never asked where the child spells what they hear', () => {
    const third = bank.words.filter((w) => w.syllables.length === 2 && w.syllables.every((id) => id.endsWith('3')));
    expect(third.map((w) => w.hanzi).sort()).toEqual(['为什么'].filter(() => false).concat(['打鼓', '水饺', '祖母', '马匹']).sort());
    expect(bank.words.filter((w) => w.sandhi).map((w) => w.id).sort()).toEqual(third.map((w) => w.id).sort());
    const flagged = new Set(bank.words.filter((w) => w.sandhi).map((w) => w.id));
    let asked = 0;
    for (let L = 3; L <= 12; L++) {
      const s = at(L);
      for (let session = 1; session <= 50; session++) {
        s.sessions = session;
        for (const mode of ['today', 'spell', 'scene', 'repair'])
          for (const q of schedule(s, bank, mode)) {
            if (q.kind === 'F') expect(flagged.has(q.target), `${mode} ${q.id} at ${L}`).toBe(false);
            if (q.kind !== 'F' && flagged.has(q.target)) asked++;
          }
      }
    }
    expect(asked, 'the words are still taught with pictures, cards and reading').toBeGreaterThan(0);
  });
  it('are written up for the dad\'s ear check', () => {
    const todo = fs.readFileSync(path.join(root, 'docs/TODO.md'), 'utf8');
    for (const w of ['水饺', '祖母', '打鼓', '马匹']) expect(todo).toContain(w);
  });
});

describe('P1-4 page mapping', () => {
  it('a tone pair belongs to the child\'s station, not to station 1, and reads in plain Chinese', () => {
    expect(skillStation(bank, 'pair:2|3')).toBe(1);
    expect(skillStation(bank, 'pair:2|3', 7)).toBe(7);
    expect(skillLabel(bank, 'pair:2|3')).toBe('声调 二声和三声');
    expect(skillLabel(bank, 'pair:b|p')).toBe('区分 b 和 p');
    const s = at(7);
    s.sessions = 4;
    miss(s, 'pair:2|3:hear');
    miss(s, 'pair:2|3:hear');
    const w = weakItems(s, bank).find((x) => x.root === 'pair:2|3')!;
    expect(w.station).toBe(7);
    expect(w.pages).toEqual([7]);
    const sheet = buildWorksheet(s, bank, 'weak', NOW);
    expect(sheet.groups.map((g) => g.station)).not.toContain(1);
  });
  it('zhi3 is station 8 like its series, and every series syllable carries its series\' station', () => {
    expect(bank.syllables.find((x) => x.id === 'zhi3')!.lesson).toBe(8);
    expect(validateBank(bank)).toEqual([]);
    const bad = structuredClone(bank);
    bad.syllables.find((x) => x.id === 'zhi3')!.lesson = 10;
    expect(validateBank(bad).join()).toContain('series lesson: zhi3');
    // no H question reaches a station early any more
    for (let L = 8; L <= 9; L++) {
      const s = at(L);
      for (let session = 1; session <= 40; session++) {
        s.sessions = session;
        for (const q of schedule(s, bank, 'listen').filter((x) => x.kind === 'H'))
          for (const id of [q.target, ...q.choices]) expect(bank.syllables.find((x) => x.id === id)!.lesson, `${q.id} at ${L}`).toBeLessThanOrEqual(L);
      }
    }
  });
  it('"steady" means the whole group of four tones, and the words of a page can be finished', () => {
    const s = at(12);
    const blend = stationColumns(bank, 12).find((c) => c.col === 'blend')!;
    const group = blend.groups.find((g) => g.length > 1) ?? blend.groups[0];
    const steady = (root: string) => (s.atoms[`${root}:blend`] = { box: 3, due: 9, successes: [1, 2, 3], kinds: ['C'], needsReview: false });
    const count = () => pageProgress(s, bank).find((r) => r.station === 12)!.columns.find((c) => c.col === 'blend')!.done;
    expect(count()).toBe(0);
    group.slice(0, Math.max(1, group.length - 1)).forEach(steady);
    expect(count()).toBe(group.length > 1 ? 0 : 1); // one tone of a group is not the group
    group.forEach(steady);
    expect(count()).toBe(1);
    // words that became a later word's picture twin (wu, tu, gua) leave the page they cannot be asked on
    const eligible = new Set(eligibleWords(s, bank).map((w) => w.id));
    for (let st = 1; st <= 12; st++) for (const w of stationWords(bank, st, 12)) expect(eligible.has(w.id), `${w.id} on page of station ${st}`).toBe(true);
    for (const id of ['wu', 'tu', 'gua']) expect(stationWords(bank, bank.words.find((w) => w.id === id)!.lesson, 12).some((w) => w.id === id), id).toBe(false);
  });
  it('the home label follows the parent\'s book pick and 朗读册 puts page 10 in book lesson 9', () => {
    const s = at(8);
    expect(currentLabel(s, bank)).toBe('课本第 8 课 · 第 8、9 页');
    s.settings.book = 9;
    expect(currentLabel(s, bank)).toBe('课本第 9 课 · 第 10 页');
    s.settings.book = 8;
    expect(currentLabel(s, bank)).toBe('课本第 8 课 · 第 8、9 页');
    expect(bookPages(bank).find((p) => p.page === 10)!.lesson).toBe(9);
    expect(bookPages(bank).find((p) => p.page === 2)!.lesson).toBe(2);
  });
});

describe('P2-7 a damaged save never stops the game', () => {
  const shapes: [string, unknown][] = [
    ['null', null], ['string', 'x'], ['array', []], ['empty', {}], ['settings null', { settings: null, history: [] }],
    ['no atoms', { settings: { lesson: 5 }, history: [], sessions: 3, atoms: null }],
    ['no dates/confusions/customWords', { settings: { lesson: 5 }, history: [], atoms: {}, sessions: 2 }],
    ['lesson 0', { settings: { lesson: 0 }, history: [], atoms: {} }], ['lesson abc', { settings: { lesson: 'abc' }, history: [], atoms: {} }],
    ['lesson 99', { settings: { lesson: 99 }, history: [], atoms: {} }], ['lesson 13', { settings: { lesson: 13 }, history: [], atoms: {} }],
    ['lesson -3', { settings: { lesson: -3 }, history: [], atoms: {} }], ['lesson 2.7', { settings: { lesson: 2.7 }, history: [], atoms: {} }],
    ['bad atoms', { settings: { lesson: 6 }, history: [{ junk: 1 }], atoms: { 'letter:a:hear': 5, 'letter:b:hear': { box: 'x' } } }],
    ['bad extras', { settings: { lesson: 6, book: 99, strictness: 7 }, history: [], atoms: {}, book: 5, drillBest: [], tutorial: 'x' }],
  ];
  it.each(shapes)('%s: repaired, the station is 1-12, every mode makes 15+ valid questions', (_name, raw) => {
    const s = repairSave(structuredClone(raw));
    expect(s.settings.lesson).toBeGreaterThanOrEqual(1);
    expect(s.settings.lesson).toBeLessThanOrEqual(12);
    expect(Array.isArray(s.history) && Array.isArray(s.dates) && Array.isArray(s.customWords)).toBe(true);
    expect(s.atoms && s.confusions && typeof s.atoms === 'object').toBeTruthy();
    for (const a of Object.values(s.atoms)) expect(typeof a.box).toBe('number');
    for (const mode of MODES) {
      const qs = schedule(s, bank, mode);
      expect(qs.length, mode).toBeGreaterThanOrEqual(15);
      for (const q of qs) expect(validQuestion(q, bank, s), `${mode} ${q.id}`).toBe(true);
    }
  });
  it('the scheduler clamps a station outside 1-12 by itself (a greyed station 13 asks nothing new)', () => {
    for (const L of [0, -1, 99, 13, 2.5, NaN]) {
      const s = initialSave();
      s.settings.lesson = L as number;
      expect(stationOf(s)).toBeGreaterThanOrEqual(1);
      for (const mode of MODES) expect(schedule(s, bank, mode).every((q) => q.lesson <= 12), `${L} ${mode}`).toBe(true);
      expect(eligibleWords(s, bank).length).toBeGreaterThan(0);
    }
  });
  it('the real save of the old build (origin/main) loads untouched: atoms, history, custom word, lesson', () => {
    const data = structuredClone(oldEnvelope.data);
    const before = { atoms: Object.keys(data.atoms).length, history: data.history.length, custom: data.customWords.length, lesson: data.settings.lesson, sessions: data.sessions };
    const s = repairSave(data);
    expect({ atoms: Object.keys(s.atoms).length, history: s.history.length, custom: s.customWords.length, lesson: s.settings.lesson, sessions: s.sessions }).toEqual(before);
    expect(s.atoms).toEqual(oldEnvelope.data.atoms);
    expect(s.history).toEqual(oldEnvelope.data.history);
    for (const mode of MODES) expect(schedule(s, bank, mode).length, mode).toBeGreaterThanOrEqual(15);
  });
  it('an unfinished programme loses only its bad questions: unknown word, held word, withheld tone, a station above the child\'s', () => {
    const s = at(10);
    const ok = schedule(s, bank, 'today').filter((q) => q.kind === 'E').slice(0, 2);
    expect(ok.length).toBe(2);
    const held = bank.words.find((w) => w.hold)!;
    const q = (o: Partial<Question>): Question => ({ id: 'x', kind: 'E', target: 'nitu', skill: 's', lesson: 1, phase: 'main', choices: ['nitu'], ...o });
    const bad = [
      q({ id: 'gone', target: 'no-such-word', choices: ['no-such-word', 'ditu'] }),
      q({ id: 'held', target: held.id, choices: [held.id, ok[0].target], lesson: Math.min(held.lesson, 10) }),
      { id: 'ao4', kind: 'H', target: 'ao4', skill: 'tone4:ao:hear', lesson: 10, phase: 'main', choices: ['ao1', 'ao2', 'ao3', 'ao4'] } as Question,
      q({ id: 'future', target: ok[0].target, choices: ok[0].choices, lesson: 12 }),
    ];
    const resume = { mode: 'today', queue: [ok[0], ...bad, ok[1]], index: 3, at: Date.now() };
    expect(validQuestion(ok[0], bank, s)).toBe(true);
    for (const b of bad) expect(validQuestion(b, bank, s), b.id).toBe(false);
    const fixed = repairResume(resume, bank, s)!;
    expect(fixed.queue.map((x) => x.id)).toEqual([ok[0].id, ok[1].id]);
    expect(fixed.index).toBe(1); // still just before the second good question
    expect(repairResume({ ...resume, queue: bad }, bank, s)).toBeUndefined();
    const clean = { mode: 'today', queue: [ok[0], ok[1]], index: 1, at: Date.now() };
    expect(repairResume(clean, bank, s)).toBe(clean);
    expect(repairResume({ mode: 'today', queue: 'x', index: 0 }, bank, s)).toBeUndefined();
  });
});

describe('P2-8 wording and the re-record list', () => {
  it('yaml text equals the manifest text, except the ids that wait for their re-record', () => {
    const mismatches = yaml.lines.filter((l) => manifest[l.id] && manifest[l.id].text !== l.text).map((l) => l.id);
    expect(mismatches.filter((id) => !rerecord.pending.includes(id)), 'changed text without a re-record entry').toEqual([]);
    for (const id of rerecord.pending) expect(yaml.lines.some((l) => l.id === id), `${id} is listed but not in the yaml`).toBe(true);
  });
  it('the five changed lines are plain Chinese, the er cue matches its card (ér), and no practice title is babyish', () => {
    const text = (id: string) => yaml.lines.find((l) => l.id === id)!.text;
    expect(text('py.rule.nl')).not.toContain('有两个字母后面');
    expect(text('py.rule.mark')).not.toContain('小个子');
    expect(text('py.tip.ai-ei')).not.toContain('放松');
    expect(bank.letters.find((l) => l.id === 'er')!.mnemonic).toBe('儿子儿子');
    expect(bank.praise[19]).toBe('你慢慢读完了');
    expect(text('py.praise.19')).toBe(bank.praise[19]);
    expect(bank.confusions.find((c) => c.pair.join('|') === 'ai|ei')!.tip).toBe(text('py.tip.ai-ei'));
    for (const id of rerecord.pending) expect(text(id)).not.toMatch(/[A-Za-z0-9]/);
  });
});
