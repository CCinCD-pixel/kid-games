import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { bank } from './content';
import { BOOK_LAST, bookLabel, bookOfStation, bookOptions, currentBook, stationOfBook } from './book';
import { blendRivals, initialSave, schedule } from './learning';
import { displayPinyin, medialSplit, parseSyllable, validateBank } from './pinyin';

/** 课本对齐 stage 1 (A0 labels, A1 weighting, A2 syllable tables, A3 四声排排队, A12 three-part blends). */
const root = fileURLToPath(new URL('../../../../', import.meta.url));
const textbook = JSON.parse(fs.readFileSync(path.join(root, 'content/pinyin-station/textbook.json'), 'utf8')) as {
  stations: Record<string, { blends: { id: string; three: boolean }[]; series: { id: string; kind: string; ids: string[]; skip?: number[] }[] }>;
};
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public/audio/pinyin-station/audio-manifest.json'), 'utf8')) as Record<string, unknown>;

describe('A0 book lessons', () => {
  it('maps book lessons to stations (9 = y w = station 8, 10-13 = stations 9-12, 14 = station 13)', () => {
    expect(Array.from({ length: BOOK_LAST }, (_, i) => stationOfBook(i + 1))).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 8, 9, 10, 11, 12, 13]);
    expect([9, 10, 11, 12].map((st) => bookOfStation(bank, st))).toEqual([10, 11, 12, 13]);
    expect(bookOfStation(bank, 2)).toBe(2);
  });
  it('labels a station with its book lesson and pages', () => {
    expect(bookLabel(bank, 12)).toBe('课本第 13 课 · 第 16 页');
    expect(bookLabel(bank, 9)).toBe('课本第 10 课 · 第 12 页');
    expect(bookLabel(bank, 11)).toBe('课本第 12 课 · 第 14、15 页');
    expect(bookLabel(bank, 2)).toBe('课本第 2、9 课 · 第 2、10 页');
    expect(bookLabel(bank, 8)).toBe('课本第 8 课 · 第 8、9 页');
  });
  it('offers book lessons 1-13 and greys out 14 with 等第 14 课', () => {
    const options = bookOptions(bank);
    expect(options).toHaveLength(14);
    expect(options.filter((o) => o.disabled).map((o) => o.book)).toEqual([14]);
    expect(options[13].label).toContain('等第 14 课');
    expect(options[12].label).toBe('课本第 13 课 · an en in un ün');
    expect(options[8].label).toContain('y w');
  });
  it('remembers which book lesson was picked when two share a station', () => {
    const s = initialSave();
    s.settings.lesson = 8;
    s.settings.book = 9;
    expect(currentBook(s, bank)).toBe(9);
    s.settings.lesson = 5; // the station moved on its own: the stale pick no longer applies
    expect(currentBook(s, bank)).toBe(5);
  });
});

describe('A2 textbook syllables (stations 9-12)', () => {
  const ids = (st: string) => [...textbook.stations[st].blends.map((b) => b.id), ...textbook.stations[st].series.flatMap((s) => s.ids.filter((_, i) => !(s.skip ?? []).includes(i + 1)))];
  it('keeps the bank valid and puts every table syllable in it, tagged with its station', () => {
    expect(validateBank(bank)).toEqual([]);
    for (const st of ['9', '10', '11', '12'])
      for (const id of ids(st)) {
        const syl = bank.syllables.find((x) => x.id === id);
        expect(syl, id).toBeDefined();
        expect(parseSyllable(id), id).not.toBeNull();
        expect(syl!.display).toBe(displayPinyin(id));
      }
    expect([9, 10, 11, 12].map((st) => bank.syllables.filter((x) => x.lesson === st).length).every((n) => n >= 20)).toBe(true);
  });
  it('has 14 vowel series and 5 whole-syllable series, four tones each (o and er-1 are not playable yet)', () => {
    const book = bank.tone4!.filter((t) => t.lesson >= 9);
    expect(book).toHaveLength(19);
    expect(book.filter((t) => t.kind === 'final')).toHaveLength(14);
    expect(book.filter((t) => t.kind === 'whole').map((t) => t.series).sort()).toEqual(['ye', 'yin', 'yuan', 'yue', 'yun']);
    // stage 3 adds the series of stations 1-8 (single vowels and the whole-syllable readings), 32 in all
    expect(bank.tone4).toHaveLength(32);
    expect(bank.tone4!.filter((t) => t.lesson < 9).map((t) => t.series).sort()).toEqual(['a', 'chi', 'ci', 'e', 'i', 'shi', 'si', 'u', 'wu', 'yi', 'yu', 'zhi', 'zi']);
    expect(bank.tone4!.some((t) => t.series === 'o' || t.series === 'v')).toBe(false);
    expect(bank.tone4!.find((t) => t.series === 'er')!.skip).toEqual([1]);
    for (const t of bank.tone4!) expect(t.ids.map((id) => id.slice(0, -1) === t.series && Number(id.at(-1)))).toEqual([1, 2, 3, 4]);
  });
  it('writes tones the way the book does (ü as v in ids, ü / dotless u in the display)', () => {
    expect(['ui2', 'iu3', 'ie4', 've1', 'vn2', 'er3', 'yue3', 'yuan4', 'lve4', 'jue2', 'jun1', 'guai1'].map(displayPinyin)).toEqual(['uí', 'iǔ', 'iè', 'üē', 'ǘn', 'ěr', 'yuě', 'yuàn', 'lüè', 'jué', 'jūn', 'guāi']);
  });
  // The recordings are imported by the audio stage; until then these are red (reported, not weakened).
  it('AUDIO-STAGE: every playable syllable of stations 9-12 has a real clip in the manifest', () => {
    // ao4 is withheld on purpose: the library's ào is a flat line, so it waits for a real fourth tone (README, importer WITHHELD)
    const missing = ['9', '10', '11', '12'].flatMap(ids).filter((id) => id !== 'ao4' && !manifest[`py.syl.${id}`]);
    expect(missing).toEqual([]);
  });
});

describe('A1 new-lesson weighting', () => {
  const share = (qs: { lesson: number }[], L: number) => qs.filter((q) => q.lesson >= L - 1).length / qs.length;
  it.each([3, 4, 5, 6, 7, 8, 9, 10, 11, 12])('station %i: at least 60% of every programme is the current or the previous station', (L) => {
    const save = initialSave();
    save.settings.lesson = L;
    let worst = 1;
    for (let session = 1; session <= 40; session++) {
      save.sessions = session;
      const qs = schedule(save, bank, 'today');
      expect(qs).toHaveLength(15);
      worst = Math.min(worst, share(qs, L));
    }
    expect(worst).toBeGreaterThanOrEqual(0.6);
  });
  it('still opens with three warm-up questions and keeps two 读一读 slots that look back', () => {
    const save = initialSave();
    save.settings.lesson = 12;
    const qs = schedule(save, bank, 'today');
    expect(qs.slice(0, 3).every((q) => q.phase === 'warmup')).toBe(true);
    expect(qs.filter((q) => q.kind === 'D')).toHaveLength(2);
    expect(qs.filter((q) => q.kind === 'H').length).toBeGreaterThanOrEqual(1);
  });
  it('a listening programme at station 12 is mostly new sounds and includes 四声排排队', () => {
    const save = initialSave();
    save.settings.lesson = 12;
    const qs = schedule(save, bank, 'listen');
    expect(share(qs, 12)).toBeGreaterThanOrEqual(0.6);
    expect(qs.filter((q) => q.kind === 'H').length).toBeGreaterThanOrEqual(3);
  });
});

describe('A3 四声排排队 generator (exhaustive)', () => {
  it('asks only stations 9-12, one series at a time, four ordered tones, no o, no repeat in a row', () => {
    const save = initialSave();
    let seen = 0;
    const items = new Set<string>();
    for (const L of [9, 10, 11, 12, 13]) {
      save.settings.lesson = L;
      for (let session = 1; session <= 60; session++) {
        save.sessions = session;
        for (const mode of ['today', 'listen']) {
          const qs = schedule(save, bank, mode);
          const hs = qs.filter((q) => q.kind === 'H');
          hs.forEach((q, i) => {
            seen++;
            items.add(q.target);
            const series = bank.tone4!.find((t) => t.ids.includes(q.target))!;
            expect(series.lesson, q.id).toBeLessThanOrEqual(L);
            expect(q.skill).toBe(`tone4:${series.series}:hear`);
            expect(series.series).not.toBe('o');
            expect(q.choices, q.id).toContain(q.target);
            expect(q.choices.length).toBe(series.ids.length - (series.skip ?? []).length); // er has no first tone, ao no fourth (withheld)
            expect(q.choices.map((c) => Number(c.at(-1)))).toEqual([...q.choices.map((c) => Number(c.at(-1)))].sort());
            for (const c of q.choices) expect(parseSyllable(c), c).not.toBeNull();
            if (i) expect(q.target).not.toBe(hs[i - 1].target);
          });
        }
      }
    }
    expect(seen).toBeGreaterThan(400);
    expect(items.size).toBeGreaterThanOrEqual(60); // 14 finals + 5 wholes, four tones, minus er-1
  });
  it('is never asked before its own station, and only from series with three or more tones that have a real clip', () => {
    const save = initialSave();
    let early = 0;
    for (const L of [1, 2, 4, 7, 8]) {
      save.settings.lesson = L;
      for (let session = 1; session <= 30; session++) {
        save.sessions = session;
        for (const mode of ['today', 'listen', 'read', 'spell', 'scene', 'repair'])
          for (const q of schedule(save, bank, mode).filter((x) => x.kind === 'H')) {
            early++;
            const series = bank.tone4!.find((t) => t.ids.includes(q.target))!;
            expect(series.lesson, `${q.id} at ${L}`).toBeLessThanOrEqual(L);
            expect(q.choices.length, q.id).toBeGreaterThanOrEqual(3);
            for (const c of q.choices) expect(manifest[`py.syl.${c}`], `${q.id}: ${c} has a clip`).toBeDefined();
          }
      }
    }
    expect(early).toBeGreaterThan(0);
  });
});

describe('A12 three-part blends and the ü rule', () => {
  it('splits the glide of u/i + a o ai ao an ang, and nothing else', () => {
    expect(['ua', 'uo', 'ia', 'uai', 'iao', 'ian', 'uan', 'iang', 'uang'].map((f) => medialSplit(f)?.medial + '+' + medialSplit(f)?.rest)).toEqual(['u+a', 'u+o', 'i+a', 'u+ai', 'i+ao', 'i+an', 'u+an', 'i+ang', 'u+ang']);
    for (const f of ['ie', 'ui', 'iu', 'in', 'un', 've', 'vn', 'a', 'ai', 'ao', 'an', 'ang', 'ing', 'ong', 'i', 'u', 'v']) expect(medialSplit(f), f).toBeNull();
  });
  it('every textbook three-part blend splits and has same-glide rivals; rivals share initial, tone and glide', () => {
    const three = Object.values(textbook.stations).flatMap((st) => st.blends.filter((b) => b.three));
    expect(three.map((b) => b.id).sort()).toEqual(['guai1', 'huai4', 'kuai4', 'zhuai3']);
    for (const b of three) expect(medialSplit(parseSyllable(b.id)!.final)?.medial, b.id).toBe('u');
    let checked = 0;
    for (const sy of bank.syllables) {
      const glide = medialSplit(sy.final)?.medial;
      for (const r of blendRivals(sy, bank.syllables)) {
        checked++;
        expect([r.initial, r.tone, medialSplit(r.final)?.medial]).toEqual([sy.initial, sy.tone, glide]);
        expect(r.final).not.toBe(sy.final);
      }
    }
    expect(checked).toBeGreaterThan(200);
  });
  it('ü loses its dots after j q x y and keeps them after n l, in every table syllable', () => {
    for (const sy of bank.syllables) {
      const label = displayPinyin(sy.id);
      if (['j', 'q', 'x', 'y'].includes(sy.initial)) expect(label, sy.id).not.toMatch(/[ǖǘǚǜü]/);
      if (['n', 'l'].includes(sy.initial) && sy.final.startsWith('v')) expect(label, sy.id).toMatch(/[ǖǘǚǜü]/);
    }
    expect(displayPinyin('jue2')).toBe('jué');
    expect(displayPinyin('nv3')).toBe('nǚ');
    expect(displayPinyin('lve4')).toBe('lüè');
  });
});
