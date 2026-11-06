import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { bank } from './content';
import { compareTime, defaultTable, drillTables } from './drill';
import { initialSave, schedule } from './learning';
import { displayPinyin, parseSyllable, validateBank } from './pinyin';
import { RULES } from '../views/lines';
// @ts-expect-error plain .mjs module shared with the CLI
import { spokenText, violations } from '../../tools/spoken-text.mjs';

/** 课本对齐 stage 3: 练读表, whole syllables, 小规则, minimal-pair confusions, 字形对对碰, the station 1-8 gaps, cue words. */
const root = fileURLToPath(new URL('../../../../', import.meta.url));
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public/audio/pinyin-station/audio-manifest.json'), 'utf8')) as Record<string, { synthetic?: boolean }>;
const yaml = JSON.parse(fs.readFileSync(path.join(root, 'content/narration/pinyin-station.yaml'), 'utf8')) as { lines: { id: string; role: string; text: string; norm?: string }[] };
const has = (id: string) => !!manifest[`py.syl.${id}`];
const syllable = (id: string) => bank.syllables.find((s) => s.id === id)!;

describe('练读表 generator (exhaustive over every station)', () => {
  const stations = Array.from({ length: 13 }, (_, i) => i + 1);
  it('only holds syllables that have a tone mark and a real recording, no repeats, 8 to 36 cells, a stable order', () => {
    let tables = 0;
    for (const st of stations) {
      const list = drillTables(bank, st);
      expect(list.map((t) => t.id), `station ${st} ids`).toEqual([...new Set(list.map((t) => t.id))]);
      for (const t of list) {
        tables++;
        expect(t.cells.length, t.id).toBeGreaterThanOrEqual(8);
        expect(t.cells.length, t.id).toBeLessThanOrEqual(36);
        expect(new Set(t.cells).size, `${t.id} repeats`).toBe(t.cells.length);
        for (const id of t.cells) {
          const s = syllable(id);
          expect(s, id).toBeDefined();
          expect(s.tone, `${t.id}: ${id} is a neutral tone`).toBeGreaterThan(0);
          expect(s.wordOnly, `${t.id}: ${id} has no recording`).toBeFalsy();
          expect(has(id), `${t.id}: ${id} clip`).toBe(true);
          expect(parseSyllable(id), id).not.toBeNull();
          expect(displayPinyin(id)).toMatch(/[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]|^[a-z]+$/); // never a bare string with a stray digit
          expect(displayPinyin(id)).not.toMatch(/\d/);
        }
        expect(drillTables(bank, st).find((x) => x.id === t.id)!.cells, 'stable').toEqual(t.cells);
      }
    }
    expect(tables).toBeGreaterThan(20);
  });
  it('has a vowel table at every station, a whole-syllable table from station 7 on, a blend table once there are first sounds', () => {
    for (const st of stations) expect(drillTables(bank, st).some((t) => t.kind === 'final'), `final at ${st}`).toBe(true);
    for (const st of [8, 9, 12, 13]) {
      const whole = drillTables(bank, st).find((t) => t.kind === 'whole');
      expect(whole, `whole at ${st}`).toBeDefined();
      for (const id of whole!.cells) expect(bank.tone4!.some((x) => x.kind === 'whole' && x.ids.includes(id)), id).toBe(true);
    }
    for (const st of [5, 8, 9, 12]) expect(drillTables(bank, st).some((t) => t.kind === 'blend'), `blend at ${st}`).toBe(true);
  });
  it('mixes the four tones in a vowel or blend table, none missing and none dominating', () => {
    for (const st of [3, 5, 8, 9, 12]) {
      for (const t of drillTables(bank, st).filter((x) => x.kind !== 'whole')) {
        const count = [1, 2, 3, 4].map((n) => t.cells.filter((id) => syllable(id).tone === n).length);
        expect(Math.min(...count), `${t.id} tone counts ${count}`).toBeGreaterThan(0);
        expect(Math.max(...count) - Math.min(...count), `${t.id} tone counts ${count}`).toBeLessThanOrEqual(Math.ceil(t.cells.length / 2));
      }
    }
  });
  it('points the child at the table of the current lesson', () => {
    expect(defaultTable(drillTables(bank, 12), 12)!.kind).toBe('final');
    expect(defaultTable(drillTables(bank, 5), 5)!.kind).toBe('blend');
    expect(defaultTable([], 5)).toBeUndefined();
  });
  it('shows time only kindly: faster by 3 seconds or more, about the same, nothing when slower', () => {
    expect(compareTime(undefined, 50)).toBe('第一次读完，记下啦');
    expect(compareTime(60, 50)).toBe('比上次快 10 秒');
    expect(compareTime(52, 50)).toBe('和上次差不多');
    expect(compareTime(50, 53)).toBeNull();
    expect(compareTime(50, 80)).toBeNull();
  });
});

describe('whole syllables in the A questions', () => {
  it('are asked at their own station, never with two options that sound the same', () => {
    const wholes = new Set(bank.letters.filter((l) => l.kind === 'whole').map((l) => l.id));
    const targets = new Set<string>();
    const save = initialSave();
    for (const L of [2, 4, 6, 7, 8, 12]) {
      save.settings.lesson = L;
      for (let session = 1; session <= 40; session++) {
        save.sessions = session;
        for (const mode of ['today', 'listen']) {
          for (const q of schedule(save, bank, mode).filter((x) => x.kind === 'A')) {
            const group = (id: string) => {
              const s = bank.letters.find((l) => l.id === id)!.callSound;
              return ({ i1: 'yi1', u1: 'wu1' })[s as 'i1' | 'u1'] ?? s;
            };
            // exactly one option sounds like the target (i / y / yi, u / w / wu, ü / yu, zh / zhi … are never offered against each other)
            expect(q.choices.filter((id) => group(id) === group(q.target)), `${q.id}: another option sounds like the target`).toEqual([q.target]);
            for (const c of q.choices) expect(bank.letters.find((l) => l.id === c)!.lesson, q.id).toBeLessThanOrEqual(L);
            if (wholes.has(q.target)) targets.add(q.target);
          }
        }
      }
    }
    expect(targets.size, [...targets].join(' ')).toBeGreaterThanOrEqual(3);
  });
  it('are asked for their tones too (四声排排队 over zi / yi / wu / yu), only with three or more real tones', () => {
    const wholeSeries = bank.tone4!.filter((t) => t.kind === 'whole' && t.lesson < 9);
    expect(wholeSeries.map((t) => t.series).sort()).toEqual(['chi', 'ci', 'shi', 'si', 'wu', 'yi', 'yu', 'zhi', 'zi']);
    const playable = (t: (typeof wholeSeries)[number]) => t.ids.filter((id, n) => !(t.skip ?? []).includes(n + 1) && has(id));
    for (const t of wholeSeries) expect(t.ids.map((id) => id.slice(0, -1)), t.series).toEqual(Array(4).fill(t.series));
    expect(playable(wholeSeries.find((t) => t.series === 'yi')!).length).toBe(4);
    expect(playable(wholeSeries.find((t) => t.series === 'zi')!).length).toBeGreaterThanOrEqual(3);
  });
});

describe('字形对对碰 (b d p q)', () => {
  it('has exactly one identical key, only from station 6, once in a programme at most, never in review', () => {
    const save = initialSave();
    let seen = 0;
    const targets = new Set<string>();
    for (const L of [1, 3, 5, 6, 8, 12]) {
      save.settings.lesson = L;
      for (let session = 1; session <= 40; session++) {
        save.sessions = session;
        for (const mode of ['today', 'listen', 'read', 'spell', 'scene', 'repair', 'review']) {
          const qs = schedule(save, bank, mode).filter((x) => x.kind === 'I');
          if (L < 6 || mode !== 'today') expect(qs.length, `${mode} at ${L}`).toBe(0);
          expect(qs.length).toBeLessThanOrEqual(1);
          for (const q of qs) {
            seen++;
            targets.add(q.target);
            expect([...q.choices].sort()).toEqual(['b', 'd', 'p', 'q']);
            expect(q.choices.filter((c) => c === q.target)).toHaveLength(1);
            expect(q.skill).toBe(`glyph:${q.target}:see`);
            expect(q.lesson).toBe(L);
          }
        }
      }
    }
    expect(seen).toBeGreaterThan(20);
    expect([...targets].sort()).toEqual(['b', 'd', 'p', 'q']);
  });
});

describe('minimal-pair confusions of stage 3', () => {
  const NEW = ['d|p', 'f|t', 'm|n', 'ai|ei', 'ao|ou', 'ui|iu', 'ie|ve', 'an|en', 'in|un'];
  const confusions = NEW.map((key) => bank.confusions.find((c) => c.pair.join('|') === key)!);
  it('exist with four to six real syllable pairs that differ only in the two contrasting sounds', () => {
    expect(confusions.every(Boolean)).toBe(true);
    for (const c of confusions) {
      expect(c.minimalPairs.length, c.pair.join('-')).toBeGreaterThanOrEqual(4);
      expect(c.minimalPairs.length, c.pair.join('-')).toBeLessThanOrEqual(6);
      for (const [x, y] of c.minimalPairs) {
        const a = parseSyllable(x)!,
          b = parseSyllable(y)!;
        expect(a && b, `${x} ${y}`).toBeTruthy();
        expect(a.tone, `${x} ${y}`).toBe(b.tone);
        const [p, q] = c.pair.map((l) => l.replace('v', 'v'));
        const initialPair = a.initial === p && b.initial === q && a.final === b.final;
        const finalPair = a.final === p && b.final === q && a.initial === b.initial;
        // whole readings (ye / yue, yin / wen, wei / you) stand for their finals
        const whole = c.pair.join('|') === 'ie|ve' || c.pair.join('|') === 'in|un' || c.pair.join('|') === 'ui|iu';
        expect(initialPair || finalPair || whole, `${x} / ${y} for ${c.pair.join('-')}`).toBe(true);
        for (const id of [x, y]) expect(bank.syllables.some((s) => s.id === id), `${id} in bank`).toBe(true);
      }
    }
  });
  it('switch on by themselves: a pair is only asked when both of its syllables have a real clip', () => {
    const save = initialSave();
    let active = 0;
    for (const L of [6, 9, 12]) {
      save.settings.lesson = L;
      for (let session = 1; session <= 40; session++) {
        save.sessions = session;
        for (const q of schedule(save, bank, 'listen').filter((x) => x.kind === 'B')) {
          for (const id of q.choices) expect(has(id), `${q.id}: ${id}`).toBe(true);
          active++;
        }
      }
    }
    expect(active).toBeGreaterThan(30);
    for (const c of confusions) for (const id of c.minimalPairs.flat()) expect(has(id) === !syllable(id).wordOnly, `${id} flag matches the manifest`).toBe(true);
  });
  it('carry a tip that only points (左边这个 / 右边这个) and says no letters, with the same text in the narration', () => {
    for (const c of confusions) {
      expect(c.focus, c.pair.join('-')).toBe('both');
      expect(c.tip).toMatch(/左边这个/);
      expect(c.tip).toMatch(/右边这个/);
      const line = yaml.lines.find((l) => l.id === `py.tip.${c.pair.join('-')}`);
      expect(line?.text, c.pair.join('-')).toBe(c.tip);
      expect(violations(spokenText(line!)), c.tip).toEqual([]);
      expect(c.tip).not.toMatch(/[A-Za-zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/);
    }
  });
});

describe('stations 1-8 gaps: words held until their audio exists', () => {
  const school = bank.words.filter((w) => w.source === '学校拼音练习' && w.lesson <= 8);
  it('are plain text cards with a lesson no lower than their syllables, no page number', () => {
    expect(school).toHaveLength(45); // 41 new words (哭了 is left out for the content check) and the 4 station-8 words of the review page
    for (const w of school) {
      expect(w.picture).toBe(`text:${w.hanzi}`);
      expect(JSON.stringify(w)).not.toMatch(/第\s*\d+\s*页|页码/);
      for (const id of w.syllables) expect(syllable(id).lesson, `${w.id}: ${id}`).toBeLessThanOrEqual(w.lesson);
    }
    expect(validateBank(bank)).toEqual([]);
  });
  it('are on hold exactly while the word voice or a non-neutral syllable clip is missing (the generator decides)', () => {
    for (const w of school) {
      const ready = !!manifest[`py.word.${w.id}`] && w.syllables.every((id) => id.endsWith('0') || has(id));
      expect(!!w.hold, `${w.id} ${ready ? 'is ready' : 'is missing a recording'}`).toBe(!ready);
    }
  });
  it('are never scheduled while they are on hold', () => {
    const held = new Set(school.filter((w) => w.hold).map((w) => w.id));
    // once every recording exists the set is empty and the loop below only proves nothing is wrongly held back
    expect(school.length).toBeGreaterThan(0);
    const save = initialSave();
    for (const L of [3, 4, 5, 6, 7, 8]) {
      save.settings.lesson = L;
      for (let session = 1; session <= 20; session++) {
        save.sessions = session;
        for (const mode of ['today', 'read', 'spell', 'repair', 'scene'])
          for (const q of schedule(save, bank, mode)) for (const id of [q.target, ...q.choices]) expect(held.has(id), `${mode} ${q.id}`).toBe(false);
      }
    }
  });
});

describe('小规则 cards and 练读表 lines', () => {
  it('are five cards whose spoken line says no letters, no sounds, no tone marks', () => {
    expect(RULES.map((r) => r.id)).toEqual(['tones', 'i', 'v', 'nl', 'mark']);
    for (const r of RULES) {
      const line = yaml.lines.find((l) => l.id === r.line.id);
      expect(line, r.id).toBeDefined();
      expect(line!.text).toBe(r.line.text);
      expect(line!.role).toBe('companion');
      expect(violations(spokenText(line!)), r.id).toEqual([]);
      expect(r.line.text).not.toMatch(/[A-Za-zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/);
    }
    expect(RULES.find((r) => r.id === 'i')!.line.text).toBe('有礼貌的小点点，标上声调就摘帽。');
    expect(RULES.find((r) => r.id === 'v')!.line.text).toBe('两个小点点见到这几个字母，就擦掉眼泪笑嘻嘻。');
  });
  it('the mark-position card is told through mouth shapes, not letters', () => {
    const text = RULES.find((r) => r.id === 'mark')!.line.text;
    expect(text).toMatch(/大嘴巴/);
    expect(text).toMatch(/圆圆嘴巴/);
    expect(text).toMatch(/扁扁嘴巴/);
  });
  it('the drill lines are plain Chinese too', () => {
    for (const id of ['py.drill', 'py.drill.done']) {
      const line = yaml.lines.find((l) => l.id === id)!;
      expect(line.role).toBe('companion');
      expect(violations(spokenText(line))).toEqual([]);
    }
  });
});

describe('cue-word mnemonics of stations 1-8 (A9)', () => {
  it('have a plain Chinese cue for every one of the 29 cards, the same text in the bank and the narration', () => {
    const early = bank.letters.filter((l) => l.lesson <= 8 && l.kind !== 'whole');
    expect(early).toHaveLength(29);
    const cues = new Set<string>();
    for (const l of early) {
      expect(l.mnemonic.length, l.id).toBeGreaterThan(3);
      expect(l.mnemonic, l.id).not.toMatch(/[A-Za-zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/);
      const line = yaml.lines.find((x) => x.id === `py.mnemonic.${l.id}`);
      expect(line?.text, l.id).toBe(l.mnemonic);
      expect(violations(spokenText(line!)), l.id).toEqual([]);
      cues.add(l.mnemonic);
    }
    expect(cues.size).toBe(29);
    const by = (id: string) => bank.letters.find((l) => l.id === id)!.mnemonic;
    expect(by('i')).toMatch(/一件衣服/);
    expect(by('u')).toMatch(/乌鸦/);
    expect(by('v')).toMatch(/小鱼/);
    expect(by('d')).toMatch(/左下半圆/);
    expect(by('t')).toMatch(/伞柄朝下/);
  });
});
