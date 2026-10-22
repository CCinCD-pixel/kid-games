import { it, expect } from 'vitest';
import { bank } from './content';
import { eligibleWords, initialSave } from './learning';
it('preserves corrected exam readings and limits whole-sentence practice to known pinyin', () => {
  expect(bank.words.find((w) => w.id === 'lifa')?.syllables).toEqual(['li3', 'fa4']);
  expect(bank.words.find((w) => w.id === 'lu')?.syllables).toEqual(['lu4']);
  expect(bank.words.find((w) => w.id === 'dabo-papati')?.chunks).toEqual(['da4 bo2', 'pa2', 'pa2 ti1']);
  expect(bank.words.some((w) => w.id === 'baba-pati')).toBe(false);
  expect(eligibleWords(initialSave(), bank).some((w) => w.beyond && !w.custom)).toBe(false);
  expect(bank.words.find((w) => w.id === 'laba')?.lesson).toBe(4);
  expect(bank.confusions.find((c) => c.pair.join('|') === 'l|n')?.minimalPairs).toEqual([
    ['lu4', 'nu4'],
    ['lv3', 'nv3'],
    ['li2', 'ni2'],
  ]);
  expect(bank.confusions.some((c) => c.pair.join('|') === 'p|f')).toBe(true);
  expect(bank.syllables.some((s) => s.id === 'nv2')).toBe(false);
});
