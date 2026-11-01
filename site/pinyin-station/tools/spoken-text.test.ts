import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
// @ts-expect-error plain .mjs module shared with the CLI
import { spokenText, violations } from './spoken-text.mjs';

/**
 * Dad, 2026-11-01: the robot only says ordinary Chinese sentences; every sound a child must listen to and imitate is a REAL
 * recording (py.syl.*), never TTS. See spoken-text.mjs for the rules (R1 no Latin / tone-marked pinyin, R2 no bare sounds).
 * This file also keeps the manifest honest about the call sounds: no synthetic py.syl.*, every card resolves to a file.
 */
const root = fileURLToPath(new URL('../../../', import.meta.url));
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');
const yaml = JSON.parse(read('content/narration/pinyin-station.yaml')) as { lines: { id: string; text: string; norm?: string }[] };
const manifest = JSON.parse(read('public/audio/pinyin-station/audio-manifest.json')) as Record<string, { src: string; synthetic?: boolean }>;
const bank = JSON.parse(read('content/pinyin-station/bank.json')) as { letters: { id: string; callSound: string }[] };
const readme = read('site/pinyin-station/README.md');

/**
 * The 17 lines the UI agent still has to rewrite (8 mnemonics + 9 tips that make the robot read letter sounds).
 * PENDING may only SHRINK: delete an id here when its line has been rewritten (the test then demands that it passes the rules).
 * BASELINE is the frozen starting list - never add to it.
 */
const BASELINE = [
  'py.mnemonic.a', 'py.mnemonic.o', 'py.mnemonic.e', 'py.mnemonic.i', 'py.mnemonic.u', 'py.mnemonic.v', 'py.mnemonic.y', 'py.mnemonic.w',
  'py.tip.b-p', 'py.tip.d-t', 'py.tip.b-d', 'py.tip.l-n', 'py.tip.p-f', 'py.tip.g-k', 'py.tip.j-q', 'py.tip.z-c', 'py.tip.zh-ch',
];
// Round 3 (UI half): all 17 are rewritten as plain sentences, so nothing is pending any more.
const PENDING: string[] = [];

describe('robot spoken text (norm ?? text)', () => {
  it('the 17 old lines are all rewritten: nothing is pending and every one passes the rules', () => {
    expect(PENDING).toEqual([]);
    for (const id of BASELINE) {
      const line = yaml.lines.find((l) => l.id === id)!;
      expect(violations(spokenText(line)), `${id}: ${spokenText(line)}`).toEqual([]);
    }
  });
  it('the pending list only shrinks and names real lines', () => {
    expect(BASELINE).toHaveLength(17);
    for (const id of PENDING) {
      expect(BASELINE, `${id} is not in the frozen baseline: the pending list may not grow`).toContain(id);
      expect(yaml.lines.some((l) => l.id === id), `${id} is not a yaml line`).toBe(true);
    }
  });
  it('every pending line still breaks a rule (rewritten? remove it from PENDING)', () => {
    for (const id of PENDING) {
      const line = yaml.lines.find((l) => l.id === id)!;
      expect(violations(spokenText(line)).length, `${id} now passes - delete it from PENDING`).toBeGreaterThan(0);
    }
  });
  it('no other line breaks a rule', () => {
    const bad = yaml.lines.filter((l) => !PENDING.includes(l.id)).map((l) => ({ id: l.id, broken: violations(spokenText(l)), spoken: spokenText(l) })).filter((r) => r.broken.length);
    expect(bad).toEqual([]);
  });
  it('the rules themselves catch what dad heard', () => {
    for (const bad of ['认一认 w 的样子', 'p', '张大嘴巴，啊，啊，啊。', '扁扁嘴巴，鹅鹅鹅。', '读坡，让它飘起来。', '读 ch 时多送一口气', '波，在右下；德，在左下。', 'ā ō'])
      expect(violations(bad).length, bad).toBeGreaterThan(0);
    for (const good of ['听一听，找到这个字母。', '听，再看：你的声音上扬了吗？', '你找到了开头的声音', '一共有 {n} 块晶体。'])
      expect(violations(spokenText({ text: good })), good).toEqual([]);
  });
});

describe('call sounds are real recordings', () => {
  /** Synthetic py.syl.* clips are not allowed unless listed here AND registered in site/pinyin-station/README.md. */
  const SYNTHETIC_EXCEPTIONS: string[] = [];
  /** Cards whose call sound has no real recording yet (README: 需要真人补录). The game plays nothing for them. */
  const REGISTERED_MISSING = ['py.syl.eng1'];

  it('no py.syl.* clip is synthetic, except registered exceptions', () => {
    const synth = Object.entries(manifest).filter(([id, c]) => id.startsWith('py.syl.') && c.synthetic).map(([id]) => id);
    expect(synth.filter((id) => !SYNTHETIC_EXCEPTIONS.includes(id))).toEqual([]);
    for (const id of SYNTHETIC_EXCEPTIONS) expect(readme, `${id} must be registered in README`).toContain(id);
  });
  it('every card call sound resolves to a file; the only gaps are the registered ones', () => {
    for (const l of bank.letters) {
      const id = `py.syl.${l.callSound}`;
      if (REGISTERED_MISSING.includes(id)) {
        expect(manifest[id], `${id} has a clip now - remove it from REGISTERED_MISSING and the README`).toBeUndefined();
        expect(readme, `${id} must be registered in README as 需要真人补录`).toMatch(new RegExp(`${id}[^\\n]*需要真人补录|需要真人补录[^\\n]*${id}`));
        continue;
      }
      expect(manifest[id], `${id} (card ${l.id}) has no clip`).toBeDefined();
      expect(fs.existsSync(path.join(root, 'public', manifest[id].src)), `${id} file`).toBe(true);
    }
  });
  it('a card without a clip stays silent: syllable() has a has() guard and never falls back to the device voice', () => {
    const main = read('site/pinyin-station/src/main.ts');
    const body = /async function syllable\([\s\S]*?\n}\n/.exec(main)?.[0] ?? '';
    expect(body).toContain('narrator.has(`py.syl.${id}`)');
    expect(body).toContain("return 'skipped'");
    expect(body).not.toMatch(/familyNarrator|speechSynthesis/);
  });
});
