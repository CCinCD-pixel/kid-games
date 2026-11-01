import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { bank } from './content';
import { callLabel } from './pinyin';

/**
 * Round 3 (dad, 2026-11-01): the robot only says ordinary sentences; every sound to imitate is a real recording.
 * The words on the card / in the hint are the words that are said, and what is shown never promises a sound that is not there.
 */
const root = fileURLToPath(new URL('../../../../', import.meta.url));
const yaml = JSON.parse(fs.readFileSync(path.join(root, 'content/narration/pinyin-station.yaml'), 'utf8')) as {
  lines: { id: string; text: string; role: string }[];
};
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public/audio/pinyin-station/audio-manifest.json'), 'utf8')) as Record<
  string,
  { src: string; text: string; synthetic?: boolean }
>;
const said = new Map(yaml.lines.map((l) => [l.id, l.text]));

describe('what a card or a tip shows is what is said', () => {
  it('every mnemonic on a card is the narration text of its line, and has no letters in it', () => {
    let n = 0;
    for (const l of bank.letters) {
      const text = said.get(`py.mnemonic.${l.id}`);
      if (text === undefined) continue; // lessons 9-13 have no mnemonic recording yet (README)
      n++;
      expect(l.mnemonic, `card ${l.id}`).toBe(text);
      expect(l.mnemonic, `card ${l.id}`).not.toMatch(/[A-Za-zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü]/);
    }
    expect(n).toBeGreaterThanOrEqual(29);
  });
  it('every tip is the narration text of its line, with no letters in it', () => {
    for (const c of bank.confusions) {
      const id = `py.tip.${c.pair.join('-')}`;
      expect(c.tip, id).toBe(said.get(id));
      expect(c.tip, id).not.toMatch(/[A-Za-zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü]/);
    }
  });
  it('a tip about two letters points at them (左边/右边/这个) and both have a real call-sound recording', () => {
    let letterTips = 0;
    for (const c of bank.confusions) {
      const letters = c.pair.map((id) => bank.letters.find((l) => l.id === id));
      if (letters.some((l) => !l)) continue; // tone pairs: no letters on the screen
      letterTips++;
      expect(c.focus, c.pair.join('-')).toBeDefined();
      for (const l of letters) {
        const clip = manifest[`py.syl.${l!.callSound}`];
        expect(clip, `${l!.id} call sound`).toBeDefined();
        expect(clip.synthetic, `${l!.id} call sound is a real recording`).toBeFalsy();
      }
    }
    expect(letterTips).toBe(11);
    for (const id of ['b-p', 'd-t', 'b-d', 'l-n', 'p-f', 'g-k', 'j-q', 'z-c', 'zh-ch'])
      expect(bank.confusions.find((c) => c.pair.join('-') === id)!.tip, id).toMatch(/左边|右边/);
  });
});

describe('call-sound labels match the real recording', () => {
  const toneOf = (text: string) => {
    const marks: Record<string, number> = {};
    'āēīōūǖ'.split('').forEach((c) => (marks[c] = 1));
    'áéíóúǘ'.split('').forEach((c) => (marks[c] = 2));
    'ǎěǐǒǔǚ'.split('').forEach((c) => (marks[c] = 3));
    'àèìòùǜ'.split('').forEach((c) => (marks[c] = 4));
    for (const ch of text) if (marks[ch]) return marks[ch];
    return 0;
  };
  it('the label (and the subtitle) never says one tone while the file plays another', () => {
    let checked = 0;
    for (const l of bank.letters) {
      const clip = manifest[`py.syl.${l.callSound}`];
      if (!clip) continue; // eng, ong: registered missing (README)
      const file = /human\.[a-z]+([0-4])\./.exec(clip.src)?.[1];
      expect(file, `${l.id} file ${clip.src}`).toBeDefined();
      expect(toneOf(callLabel(l)), `${l.id} card label ${callLabel(l)} vs ${clip.src}`).toBe(Number(file));
      expect(toneOf(clip.text), `${l.id} subtitle ${clip.text} vs ${clip.src}`).toBe(Number(file));
      checked++;
    }
    expect(checked).toBe(bank.letters.length - 2);
  });
  it('er is written ér, because the recording is er2', () => {
    const er = bank.letters.find((l) => l.id === 'er')!;
    expect(callLabel(er)).toBe('ér');
    expect(manifest['py.syl.er1'].src).toMatch(/human\.er2\./);
  });
  it('a card whose call sound has no recording (eng, ong) is registered, and promises no sound', () => {
    const missing = bank.letters.filter((l) => !manifest[`py.syl.${l.callSound}`]).map((l) => l.id);
    expect(missing).toEqual(['eng', 'ong']);
  });
});
