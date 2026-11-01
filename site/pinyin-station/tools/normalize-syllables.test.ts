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
  syllables: { id: string; tone: number; audio: string }[];
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
    expect(rec.length).toBeGreaterThanOrEqual(212);
    for (const c of rec) {
      expect(c.lufs, c.id).not.toBeNull();
      expect(Math.abs((c.lufs as number) + 16), `${c.id} ${c.lufs} LUFS`).toBeLessThanOrEqual(1);
      expect(c.tp as number, `${c.id} ${c.tp} dBTP`).toBeLessThanOrEqual(-1.5);
      expect(c.durationS, c.id).toBeGreaterThanOrEqual(0.3);
      expect(c.durationS, c.id).toBeLessThanOrEqual(25);
      expect([c.codec, c.sampleRate, c.channels], c.id).toEqual(['aac', 44100, 1]);
    }
  });

  it('the synthetic call-sounds of lessons 9-13 are flagged and loudness-matched', () => {
    const synth = result.clips.filter((c) => c.synthetic).map((c) => c.id);
    const callSounds = bank.letters.filter((l) => l.lesson >= 9).map((l) => `py.syl.${l.callSound}`);
    expect(callSounds).toHaveLength(24);
    expect(synth.sort()).toEqual([...callSounds].sort());
    for (const c of result.clips.filter((x) => x.synthetic)) {
      expect(Math.abs((c.lufs as number) + 16), `${c.id} ${c.lufs} LUFS`).toBeLessThanOrEqual(1);
      expect(c.tp as number, `${c.id} ${c.tp} dBTP`).toBeLessThanOrEqual(-1.5);
      expect(manifest[c.id].synthetic, c.id).toBe(true);
      expect(manifest[c.id].source, c.id).toMatch(/^synthetic/);
    }
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
    const ids = new Set([...bank.letters.map((l) => `py.syl.${l.callSound}`), ...bank.syllables.filter((s) => s.tone > 0).map((s) => s.audio)]);
    for (const id of ids) expect(manifest[id], id).toBeDefined();
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
