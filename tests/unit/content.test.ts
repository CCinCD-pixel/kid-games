import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error -- plain ESM helper with JSDoc types
import { lintTone, validateAudioManifest } from '../../tools/check-content.mjs';

const PUBLIC = path.resolve(__dirname, '../../public');

describe('narration manifest validation', () => {
  it('accepts the kit demo clips that exist and flags the deliberately missing one', () => {
    const m = JSON.parse(fs.readFileSync(path.join(PUBLIC, 'dev/kit/audio/audio-manifest.json'), 'utf8'));
    // the demo lives under /dev/kit/audio, so validate it as if it were a game folder there
    const rebased = Object.fromEntries(Object.entries(m).map(([id, c]) => [id, { ...(c as object), src: (c as { src: string }).src.replace('/dev/kit/audio/', '/audio/demo/') }]));
    const errs: string[] = validateAudioManifest(rebased, { game: 'demo', checkFiles: false });
    expect(errs).toEqual([]);
    const withFiles: string[] = validateAudioManifest(m, { game: 'demo', checkFiles: true });
    expect(withFiles.some((e) => e.includes('src must start with /audio/demo/'))).toBe(true);
  });

  it('catches structural problems', () => {
    const errs: string[] = validateAudioManifest(
      { 'bad id': { src: '/audio/x/a.wav', text: '', durationMs: 0, words: [{ ch: '你', t0: 5, t1: 1 }] } },
      { game: 'x', checkFiles: false },
    );
    const text = errs.join('\n');
    for (const needle of ['whitespace', 'text is required', 'durationMs', '.m4a', 'words[0]']) expect(text).toContain(needle);
  });
});

describe('tone lint (plan §3.0 / §4.4)', () => {
  it('flags banned phrasing', () => {
    expect(lintTone('宝宝真棒！')).toHaveLength(1);
    expect(lintTone('你答错了，再想想')).toHaveLength(1);
    expect(lintTone('你要走了吗？我好难过')).toHaveLength(1);
    expect(lintTone('这个游戏能提升智力')).toHaveLength(1);
    expect(lintTone('快点，来不及了')).toHaveLength(1);
  });
  it('allows process praise and explicit exceptions', () => {
    expect(lintTone('你先数了一排，再数一列，这个办法真好！')).toEqual([]);
    expect(lintTone('还不错！我们看看为什么。')).toEqual([]);
    expect(lintTone('精卫很难过 tone-ok')).toEqual([]);
  });
});
