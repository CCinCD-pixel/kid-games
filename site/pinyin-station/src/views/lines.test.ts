import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { bank } from '../domain/content';
import { ALL_LINES, INSTRUCTION, PRAISE, STEP } from './lines';

const yaml = JSON.parse(
  fs.readFileSync(new URL('../../../../content/narration/pinyin-station.yaml', import.meta.url), 'utf8'),
) as { lines: { id: string; text: string; role: string }[] };
const spoken = new Map(yaml.lines.map((l) => [l.id, l.text]));

describe('what the child reads is what the child hears', () => {
  it.each(ALL_LINES.map((l) => [l.id, l.text]))('%s: the screen line is the narration line', (id, text) => {
    expect(spoken.get(id), id).toBe(text);
  });
  it('has a narration line (same text) for every praise the game can show', () => {
    bank.praise.forEach((text, i) => expect(spoken.get(`py.praise.${i}`), `py.praise.${i}`).toBe(text));
  });
  it('never has a line that tells the child to read letters aloud to the voice model', () => {
    // A latin letter in a spoken line is read as an English letter name (audit-pinyin-audio D3).
    for (const l of [...Object.values(INSTRUCTION), ...Object.values(STEP)]) expect(l.text, l.id).not.toMatch(/[A-Za-z]/);
  });
});

describe('praise only says what the child did', () => {
  const claim = /说给|拼音听|读给|送到|收到|声音已经|你说|你读|你念/;
  it('uses no “you said / read it” praise for taps', () => {
    const ids = [PRAISE.retry, ...Object.values(PRAISE).flatMap((x) => (typeof x === 'number' ? [x] : [...x]))];
    for (const id of new Set(ids)) expect(bank.praise[id], `praise ${id}`).not.toMatch(claim);
  });
  it('keeps the old false line out of every kind', () => {
    for (const [kind, ids] of Object.entries(PRAISE)) if (typeof ids !== 'number') expect(ids, kind).not.toContain(16);
  });
  it('praises a spelling step by what was found at that step', () => {
    expect(bank.praise[PRAISE.Finitial[0]]).toContain('开头');
    expect(bank.praise[PRAISE.Ffinal[0]]).toContain('后面');
    expect(bank.praise[PRAISE.Ftone[0]]).toContain('声调');
  });
});

describe('one word for one picture in the narration too', () => {
  it('says 牧笛 everywhere (word bank, picture word, narration)', () => {
    const word = bank.words.find((w) => w.id === 'mudi')!;
    expect(word.hanzi).toBe('牧笛');
    expect(spoken.get('py.word.mudi')).toBe('牧笛');
    expect(JSON.stringify(bank)).not.toContain('木笛');
  });
});
