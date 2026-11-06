import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pinyin } from 'pinyin-pro';
import { describe, expect, it } from 'vitest';
import { bank } from './content';
import { eligibleWords, initialSave, schedule } from './learning';
import { displayPinyin, parseSyllable, validateBank } from './pinyin';
// @ts-expect-error plain .mjs module shared with the CLI
import { spokenText, violations } from '../../tools/spoken-text.mjs';

/** 课本对齐 stage 2a: the 36 school words (stations 9-12 + the review page), their neutral tones, text cards and mnemonics. */
const root = fileURLToPath(new URL('../../../../', import.meta.url));
const yaml = JSON.parse(fs.readFileSync(path.join(root, 'content/narration/pinyin-station.yaml'), 'utf8')) as { lines: { id: string; role: string; text: string; norm?: string }[] };
const school = bank.words.filter((w) => w.source === '学校拼音练习');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public/audio/pinyin-station/audio-manifest.json'), 'utf8')) as Record<string, unknown>;

describe('77 school words (36 from stations 9-12 and the review page, 41 from stations 3-8)', () => {
  it('are in the bank as plain entries: word, pinyin, station, kind (no page, no layout)', () => {
    expect(school).toHaveLength(77); // (哭了 is left out: the content check refuses it, see castle-data.mjs LEFT_OUT)
    expect(new Set(school.map((w) => w.id)).size).toBe(77);
    expect(Object.fromEntries([3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((l) => [l, school.filter((w) => w.lesson === l).length]))).toEqual({ 3: 5, 4: 3, 5: 10, 6: 6, 7: 8, 8: 13, 9: 8, 10: 8, 11: 8, 12: 8 });
    for (const w of school) {
      expect(w.display, w.id).toBe(w.syllables.map(displayPinyin).join(' '));
      expect(['noun', 'action', 'phrase']).toContain(w.kind);
      // (an id that collides with an older word of the same spelling, 琵琶 / 枇杷, gets a trailing 2)
      expect(w.id.replace(/2$/, ''), w.hanzi).toBe(w.syllables.map((s) => s.replace(/[0-4]$/, '')).join('').replace(/2$/, ''));
      expect(JSON.stringify(w)).not.toMatch(/第\s*\d+\s*页|页码/);
      for (const sid of w.syllables) {
        expect(parseSyllable(sid), sid).not.toBeNull();
        expect(bank.syllables.some((x) => x.id === sid), `${w.id}: ${sid} is in the syllable table`).toBe(true);
      }
    }
    expect(validateBank(bank)).toEqual([]);
  });
  it('agree with pinyin-pro, except the neutral tones and readings the dictionary does not know', () => {
    const exceptions = new Set(['caboli', 'wenzi', 'qunzi', 'pipa2', 'hulu']);
    for (const w of school) {
      const lexical = pinyin(w.hanzi, { toneType: 'num', type: 'array' }).map((x) => (/\d$/.test(x) ? x : x + '0').replaceAll('ü', 'v'));
      if (w.id === 'shushu') expect(w.syllables).toEqual(['shu3', 'shu4']); // 数数 (count them): the book reading, not shuò shuò
      else if (w.id === 'dage') expect(w.syllables).toEqual(['da3', 'ge2']); // 打嗝: the standard reading
      else if (exceptions.has(w.id)) expect(w.syllables.slice(0, -1), w.id).toEqual(lexical.slice(0, -1));
      else expect(w.syllables, w.hanzi).toEqual(lexical);
    }
  });
  it('write the neutral tone without a mark (bà ba), keep the book tones of 水饺, and use the standard reading', () => {
    const by = (id: string) => bank.words.find((w) => w.id === id)!;
    expect(['zuiba', 'erduo', 'wenzi', 'qunzi', 'maizi', 'yeye', 'caboli'].map((id) => by(id).display)).toEqual(['zuǐ ba', 'ěr duo', 'wén zi', 'qún zi', 'mài zi', 'yé ye', 'cā bō li']);
    expect(by('shuijiao').display).toBe('shuǐ jiǎo'); // third + third stays as printed, not the spoken sandhi
    expect(school.filter((w) => w.syllables.some((s) => s.endsWith('0'))).map((w) => w.id).sort()).toEqual(['caboli', 'erduo', 'huli', 'hulu', 'luobo', 'maizi', 'pipa2', 'qunzi', 'wenzi', 'yeye', 'zhishi', 'zuiba']);
    for (const w of school) for (const s of w.syllables) if (s.endsWith('0')) expect(displayPinyin(s), `${w.id} ${s}`).not.toMatch(/[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/);
  });
  it('are text cards (no new drawing)', () => {
    for (const w of school) expect(w.picture, w.id).toBe(`text:${w.hanzi}`);
  });
  it('are asked only when the word has its own voice and every non-neutral syllable has a recording (the generator decides)', () => {
    for (const w of school) {
      const ready = !!manifest[`py.word.${w.id}`] && w.syllables.every((id) => id.endsWith('0') || !!manifest[`py.syl.${id}`]);
      expect(!!w.hold, `${w.id} ${ready ? 'is ready' : 'is missing a recording'}`).toBe(!ready);
    }
    for (let lesson = 1; lesson <= 13; lesson++) {
      const save = initialSave();
      save.settings.lesson = lesson;
      // nothing without a word voice is ever asked
      for (const w of eligibleWords(save, bank).filter((x) => x.source === '学校拼音练习')) expect(manifest[`py.word.${w.id}`], w.id).toBeDefined();
    }
  });
});

describe('neutral-tone and recording-less syllables are never played on their own', () => {
  it('never appear as the target or a choice of any question, in any mode, at any station', () => {
    const silent = new Set(bank.syllables.filter((s) => s.tone === 0 || s.wordOnly).map((s) => s.id));
    expect(silent.size).toBeGreaterThan(10);
    const save = initialSave();
    let checked = 0;
    for (const L of [4, 8, 9, 10, 11, 12, 13]) {
      save.settings.lesson = L;
      for (let session = 1; session <= 25; session++) {
        save.sessions = session;
        for (const mode of ['today', 'listen', 'read', 'spell', 'scene', 'repair'])
          for (const q of schedule(save, bank, mode)) {
            if (!['B', 'C', 'H'].includes(q.kind)) continue;
            checked++;
            for (const id of [q.target, ...q.choices]) expect(silent.has(id), `${q.id} ${id}`).toBe(false);
          }
      }
    }
    expect(checked).toBeGreaterThan(1000);
  });
  it('flag exactly the syllables without a recording as word-only (re-run the generator once the clips arrive)', () => {
    for (const s of bank.syllables.filter((x) => x.tone > 0 && x.lesson >= 8 && school.some((w) => w.syllables.includes(x.id))))
      expect(!!s.wordOnly, `${s.id} ${manifest[`py.syl.${s.id}`] ? 'has a clip' : 'has no clip'}`).toBe(!manifest[`py.syl.${s.id}`]);
  });
});

describe('narration for the new words and the 14 mnemonics', () => {
  it('has one py.word line per school word (the characters) and spoken text with no letters or pinyin', () => {
    for (const w of school) {
      const line = yaml.lines.find((l) => l.id === `py.word.${w.id}`);
      expect(line, w.id).toBeDefined();
      expect(['word', 'companion']).toContain(line!.role); // the voice step moves word voices to the companion voice
      expect(line!.text).toBe(w.hanzi);
      expect(violations(spokenText(line!)), w.id).toEqual([]);
    }
  });
  it('gives every card of stations 9-12 a plain-sentence mnemonic with its own line (no letters)', () => {
    const ids = ['ai', 'ei', 'ui', 'ao', 'ou', 'iu', 'ie', 've', 'er', 'an', 'en', 'in', 'un', 'vn'];
    for (const id of ids) {
      const letter = bank.letters.find((l) => l.id === id)!;
      const line = yaml.lines.find((l) => l.id === `py.mnemonic.${id}`);
      expect(line, id).toBeDefined();
      expect(line!.text).toBe(letter.mnemonic);
      expect(letter.mnemonic, id).toMatch(/^[一-鿿]+$/);
      expect(letter.mnemonic).not.toContain('看一看');
      expect(violations(spokenText(line!)), id).toEqual([]);
    }
  });
});
