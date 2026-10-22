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
it('checks lexical pinyin, actual audio files and the selected lesson coverage', () => {
  for (const w of bank.words) {
    const lexical = pinyin(w.hanzi, { toneType: 'num', type: 'array' }).map((x) =>
      (/\d$/.test(x) ? x : x + '0').replaceAll('ü', 'v'),
    );
    if (w.kind !== 'cloze') expect(w.syllables, w.hanzi).toEqual(w.id === 'lifa' ? ['li3', 'fa4'] : lexical);
    if (w.syllables.length > 1 && w.syllables.some((id) => id.endsWith('0')))
      expect(manifest[`py.word.${w.id}`], w.id).toBeDefined();
  }
  const audible = new Set([
    ...bank.letters.filter((l) => l.lesson <= 4).map((l) => l.callSound),
    ...bank.syllables.filter((s) => s.lesson <= 4 && s.tone > 0).map((s) => s.id),
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
