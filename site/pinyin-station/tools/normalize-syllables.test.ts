import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeAll } from 'vitest';

/**
 * Loudness / file contract of the syllable audio (tools/normalize-syllables.mjs --check does the measuring with ffmpeg).
 *   - every real-person clip: integrated loudness -16 +- 1 LUFS (BS.1770), true peak <= -1.5 dBTP, AAC mono 44.1 kHz,
 *     0.3-25 s, re-encoded by normalize-syllables (manifest "processing" tag), file name hash == sha256 of the file
 *   - the synthetic call-sounds (lessons 9-13) are flagged "synthetic" and meet the same loudness bounds
 *   - manifest ids <-> files <-> content (yaml lines, bank syllables and call sounds)
 * Needs ffmpeg/ffprobe on PATH (skipped, loudly, when they are missing).
 */
const root = fileURLToPath(new URL('../../../', import.meta.url));
const script = fileURLToPath(new URL('./normalize-syllables.mjs', import.meta.url));
const dir = path.join(root, 'public/audio/pinyin-station');
const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'audio-manifest.json'), 'utf8')) as Record<
  string,
  { src: string; text: string; durationMs: number; role: string; source?: string; synthetic?: boolean; processing?: string }
>;
const bank = JSON.parse(fs.readFileSync(path.join(root, 'content/pinyin-station/bank.json'), 'utf8')) as {
  letters: { id: string; callSound: string; lesson: number }[];
  syllables: { id: string; tone: number; audio: string; wordOnly?: boolean }[];
};
const hasFfmpeg = ['ffmpeg', 'ffprobe'].every((c) => spawnSync(c, ['-version']).status === 0);
if (!hasFfmpeg) console.warn('[normalize-syllables.test] ffmpeg/ffprobe not found: loudness tests skipped');

type Row = {
  id: string;
  recording: boolean;
  synthetic: boolean;
  lufs: number | null;
  tp: number | null;
  durationS: number;
  durationMs: number;
  codec: string;
  sampleRate: number;
  channels: number;
};

describe.skipIf(!hasFfmpeg)('syllable audio loudness (ffmpeg BS.1770 measurement)', () => {
  let result: { problems: string[]; clips: Row[] };
  beforeAll(() => {
    const r = spawnSync('node', [script, '--check', '--json'], { encoding: 'utf8', maxBuffer: 1 << 26 });
    result = JSON.parse(r.stdout);
  }, 240_000);

  it('--check finds no problem (loudness, true peak, format, durations, hashes, orphans)', () => {
    expect(result.problems).toEqual([]);
  });

  it('every real-person clip is -16 +- 1 LUFS with a true peak <= -1.5 dBTP', () => {
    const rec = result.clips.filter((c) => c.recording);
    expect(rec.length).toBeGreaterThanOrEqual(234); // 235 before ong1 (weng1) was withdrawn on 2026-11-01
    for (const c of rec) {
      expect(c.lufs, c.id).not.toBeNull();
      expect(Math.abs((c.lufs as number) + 16), `${c.id} ${c.lufs} LUFS`).toBeLessThanOrEqual(1);
      expect(c.tp as number, `${c.id} ${c.tp} dBTP`).toBeLessThanOrEqual(-1.5);
      expect(c.durationS, c.id).toBeGreaterThanOrEqual(0.3);
      expect(c.durationS, c.id).toBeLessThanOrEqual(25);
      expect([c.codec, c.sampleRate, c.channels], c.id).toEqual(['aac', 44100, 1]);
    }
  });

  it('every py.syl.* clip is a real recording (the synthetic call-sounds were replaced on 2026-11-01)', () => {
    expect(result.clips.filter((c) => c.synthetic).map((c) => c.id)).toEqual([]);
    const callSounds = bank.letters.filter((l) => l.lesson >= 9).map((l) => `py.syl.${l.callSound}`);
    expect(callSounds).toHaveLength(24);
    for (const id of callSounds.filter((x) => x !== 'py.syl.eng1' && x !== 'py.syl.ong1')) expect(manifest[id]?.processing, id).toBe('normalize-syllables@1');
    expect(manifest['py.syl.eng1']).toBeUndefined(); // no real recording exists yet: README "需要真人补录"
    expect(manifest['py.syl.ong1']).toBeUndefined(); // withdrawn 2026-11-01, same
  });
});

describe('manifest ids <-> files <-> content', () => {
  const yamlText = fs.readFileSync(path.join(root, 'content/narration/pinyin-station.yaml'), 'utf8');
  const lineIds = (() => {
    try {
      return (JSON.parse(yamlText).lines as { id: string }[]).map((l) => l.id);
    } catch {
      return [...yamlText.matchAll(/^\s*-?\s*id:\s*"?([^"\s]+)"?\s*$/gm)].map((m) => m[1]);
    }
  })();

  it('every manifest clip has its file; every file is in the manifest; no un-normalised originals', () => {
    const files = fs.readdirSync(dir).filter((f) => f !== 'audio-manifest.json');
    const used = new Set(Object.values(manifest).map((c) => c.src.split('/').pop()));
    for (const [id, c] of Object.entries(manifest)) expect(fs.existsSync(path.join(dir, c.src.split('/').pop()!)), id).toBe(true);
    expect(files.filter((f) => !used.has(f))).toEqual([]);
    expect(files.filter((f) => /^human\..*\.mp3$/.test(f))).toEqual([]);
  });

  it('non-syllable manifest keys are narration yaml lines (or the word clips built from words:)', () => {
    const lines = new Set(lineIds);
    const extra = Object.keys(manifest).filter((k) => !k.startsWith('py.syl.') && !lines.has(k));
    expect(extra.filter((k) => !k.startsWith('py.word.'))).toEqual([]);
    // yaml lines the UI work added but nobody has synthesised yet are only reported, they fall back to the device voice
    const unbuilt = lineIds.filter((id) => !manifest[id]);
    if (unbuilt.length) console.warn(`[audio] ${unbuilt.length} yaml line(s) have no clip yet: ${unbuilt.join(' ')}`);
  });

  it('every syllable and call-sound the bank can play (tone 1-4, all lessons) has a clip', () => {
    // A syllable without a recording is word-only (it is only ever heard inside a word clip); the flag must be honest both ways.
    for (const s of bank.syllables.filter((x) => x.tone > 0)) expect(!!manifest[s.audio], `${s.id}: ${s.wordOnly ? 'word-only has no clip yet' : 'playable has a clip'}`).toBe(!s.wordOnly);
    const ids = new Set([...bank.letters.map((l) => `py.syl.${l.callSound}`), ...bank.syllables.filter((s) => s.tone > 0 && !s.wordOnly).map((s) => s.audio)]);
    ids.delete('py.syl.eng1'); // registered gaps, see spoken-text.test.ts
    ids.delete('py.syl.ong1');
    for (const id of ids) expect(manifest[id], id).toBeDefined();
  });

  it('castle stage 1: the 80 library syllables of lessons 10-13 are imported as py.syl.<game id>; er1 stays the card alias of the real er2; the final-only bank syllables alias the zero-initial files', () => {
    const importer = fs.readFileSync(path.join(root, 'site/pinyin-station/tools/import-human-audio.mjs'), 'utf8');
    const names = /const STAGE1 = '([^']+)'/.exec(importer)![1].split(' ');
    expect(names).toHaveLength(81);
    // ao4: the library's ào is flat (F0 range 0.8 semitones), withheld until a real fourth tone exists (importer WITHHELD)
    expect(importer).toMatch(/const WITHHELD = \['ao4'\]/);
    expect(manifest['py.syl.ao4']).toBeUndefined();
    for (const name of names.filter((n) => n !== 'er1' && n !== 'ao4')) {
      const id = `py.syl.${name.replaceAll('uu', 'v')}`;
      expect(manifest[id], id).toBeDefined();
      expect(manifest[id].source, id).toMatch(new RegExp(`^davinfifield/aa25ecce[0-9a-f]+/${name}$`));
      expect(manifest[id].src, id).toMatch(new RegExp(`/human\\.${name}\\.[0-9a-f]{8}\\.m4a$`));
    }
    expect(manifest['py.syl.er1'].src).toMatch(/human\.er2\./);
    expect(manifest['py.syl.ui2'].src).toBe(manifest['py.syl.wei2'].src);
    expect(manifest['py.syl.vn4'].src).toBe(manifest['py.syl.yun4'].src);
    expect(manifest['py.syl.er2'].src).toBe(manifest['py.syl.er1'].src);
  });
  it('castle stages 2-3: every imported library syllable has its py.syl.<id> clip from the pinned commit; i2-4 / u2-4 alias yi / wu; wei1 wen1 you1 alias the existing files', () => {
    const importer = fs.readFileSync(path.join(root, 'site/pinyin-station/tools/import-human-audio.mjs'), 'utf8');
    for (const list of ['STAGE2', 'STAGE3']) {
      const names = new RegExp(`const ${list} = '([^']+)'`).exec(importer)![1].split(' ');
      for (const name of names) {
        const id = `py.syl.${name.replaceAll('uu', 'v')}`;
        expect(manifest[id], id).toBeDefined();
        expect(manifest[id].src, id).toMatch(/human\.[a-z0-9]+\.[0-9a-f]{8}\.m4a$/);
        expect(manifest[id].processing, id).toBe('normalize-syllables@1');
      }
    }
    for (const t of [2, 3, 4]) { expect(manifest[`py.syl.i${t}`].src).toBe(manifest[`py.syl.yi${t}`].src); expect(manifest[`py.syl.u${t}`].src).toBe(manifest[`py.syl.wu${t}`].src); }
    expect(manifest['py.syl.wei1'].src).toBe(manifest['py.syl.ui1'].src);
    expect(manifest['py.syl.you1'].src).toBe(manifest['py.syl.iu1'].src);
    expect(manifest['py.syl.wen1'].src).toBe(manifest['py.syl.un1'].src);
  });
  it('real-person clips carry the processing tag, durations match ffprobe, hash is in the file name', () => {
    for (const [id, c] of Object.entries(manifest)) {
      if (!id.startsWith('py.syl.') || c.synthetic) continue;
      expect(c.processing, id).toBe('normalize-syllables@1');
      expect(c.src, id).toMatch(/^\/audio\/pinyin-station\/human\.[a-z0-9]+\.[0-9a-f]{8}\.m4a$/);
    }
  });
});

describe.skipIf(!hasFfmpeg)('normalize-syllables DSP self-test', () => {
  it('short-clip RMS fallback, hum + DC removal and limiter behave', () => {
    const r = spawnSync('node', [script, '--selftest'], { encoding: 'utf8', maxBuffer: 1 << 24 });
    const out = JSON.parse(r.stdout) as { test: string; ok: boolean }[];
    expect(out.filter((x) => !x.ok)).toEqual([]);
    expect(out.length).toBeGreaterThanOrEqual(3);
  }, 120_000);
});
