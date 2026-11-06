import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pinyin } from 'pinyin-pro';
import { it, expect } from 'vitest';
import { bank } from './content';
import { parseSyllable } from './pinyin';
const root = fileURLToPath(new URL('../../../../', import.meta.url));
const manifest = JSON.parse(
  fs.readFileSync(path.join(root, 'public/audio/pinyin-station/audio-manifest.json'), 'utf8'),
);
const SCHOOL = '学校拼音练习';
/** pinyin-pro writes these with a full tone; the school book (and standard reading) has a neutral-tone last syllable. */
const NEUTRAL_BOOK: Record<string, string[]> = {
  caboli: ['ca1', 'bo1', 'li0'],
  wenzi: ['wen2', 'zi0'],
  qunzi: ['qun2', 'zi0'],
  pipa2: ['pi2', 'pa0'],
  hulu: ['hu1', 'lu0'],
  shushu: ['shu3', 'shu4'], // 数数 (count them): the book reading, not shuò shuò
};
// The word recordings of the neutral-tone school words (no recording of a neutral syllable exists, so the whole word is voiced).
// A neutral-tone school word without its own word clip is never asked: the generator holds it until the clip is imported.
it('AUDIO-STAGE: every neutral-tone school word has its own word clip, or is on hold until it has', () => {
  const neutral = bank.words.filter((w) => w.source === SCHOOL && w.syllables.some((id) => id.endsWith('0')));
  expect(neutral.length).toBeGreaterThan(10);
  for (const w of neutral) if (!manifest[`py.word.${w.id}`]) expect(w.hold, `${w.id} has no word clip, so it must be on hold`).toBeTruthy();
});
it('checks lexical pinyin, actual audio files and the selected lesson coverage', () => {
  for (const w of bank.words) {
    const lexical = pinyin(w.hanzi, { toneType: 'num', type: 'array' }).map((x) =>
      (/\d$/.test(x) ? x : x + '0').replaceAll('ü', 'v'),
    );
    // The dictionary does not know every neutral tone: the textbook (and the standard reading) wins for these.
    if (w.kind !== 'cloze') expect(w.syllables, w.hanzi).toEqual(w.id === 'lifa' ? ['li3', 'fa4'] : (NEUTRAL_BOOK[w.id] ?? lexical));
    // (Neutral-tone school words are checked separately below: their word clips come with the voice step.)
    if (w.source !== SCHOOL && w.syllables.length > 1 && w.syllables.some((id) => id.endsWith('0')))
      expect(manifest[`py.word.${w.id}`], w.id).toBeDefined();
  }
  const audible = new Set([
    ...bank.letters.filter((l) => l.lesson <= 4).map((l) => l.callSound),
    ...bank.syllables.filter((s) => s.lesson <= 4 && s.tone > 0 && !s.wordOnly).map((s) => s.id),
  ]);
  for (const id of audible) {
    expect(parseSyllable(id)).not.toBeNull();
    expect(manifest[`py.syl.${id}`], id).toBeDefined();
  }
  for (const [id, c] of Object.entries(manifest) as [string, { src: string; durationMs: number }][]) {
    expect(fs.existsSync(path.join(root, 'public', c.src)), id).toBe(true);
    expect(fs.statSync(path.join(root, 'public', c.src)).size, id).toBeGreaterThan(500);
    expect(c.durationMs, id).toBeGreaterThan(100);
  }
});
