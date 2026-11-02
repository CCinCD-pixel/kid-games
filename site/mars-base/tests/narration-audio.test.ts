import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * 算术站 2.0 narration: what the 火星搭档 SAYS (norm ?? text) is plain spoken Chinese, the manifests and files match the yaml, and
 * every one of the 60 sentences is recorded in the companion voice (voice A, the pinyin-station robot) at -16 LUFS. (Pinyin-station has its own, stricter test.)
 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const yaml = fs.readFileSync(path.join(ROOT, 'content/narration/mars-arithmetic.yaml'), 'utf8');
const lines = [...yaml.matchAll(/^\s*- \{id: ([^,]+), role: (\w+), text: ([^}]+?)(?:, norm: ([^}]+))?\}$/gm)].map((m) => ({ id: m[1], text: m[3].trim(), norm: m[4]?.trim() }));
const dir = path.join(ROOT, 'public/audio/mars-arithmetic');
const read = (f: string) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as Record<string, { src: string; text: string; durationMs: number }>;
const v1 = read('audio-manifest.json'), v2 = read('audio-manifest-v2.json');
const spoken = (l: { text: string; norm?: string }) => l.norm ?? l.text;
const hasFfmpeg = ['ffmpeg', 'ffprobe'].every((c) => spawnSync(c, ['-version']).status === 0);

/** Only these lines may be read differently from the subtitle; the difference is the adverb 地 read as 的 (the model reads 地 as dì). */
const NORM_ALLOWED = ['ma.warm', 'ma.hint.add.big', 'ma.hint.sub.big', 'ma.hint.chain'];

describe('mars-arithmetic spoken text', () => {
  it('has every id once, 60 sentences, all in the companion voice', () => {
    expect(new Set(lines.map((l) => l.id)).size).toBe(lines.length);
    expect(lines.length).toBe(60);
    expect(yaml.match(/role: (\w+)/g)!.every((r) => r === 'role: companion')).toBe(true);
  });
  it('what is read aloud is plain Chinese: no Latin letters, pinyin, digits or math symbols (□ ＞ ＜ × ÷ ＝ + -)', () => {
    for (const l of lines) expect(spoken(l), l.id).toMatch(/^[一-鿿，。？！、：；]+$/);
  });
  it('only the registered lines differ from their subtitle, and only by 地 -> 的', () => {
    expect(lines.filter((l) => l.norm !== undefined).map((l) => l.id).sort()).toEqual([...NORM_ALLOWED].sort());
    for (const l of lines.filter((x) => x.norm !== undefined)) expect(l.norm, l.id).toBe(l.text.replaceAll('地', '的'));
  });
  it('only whole sentences are voiced: at least 6 characters each, no bare words or numbers', () => {
    for (const l of lines) expect(spoken(l).length, l.id).toBeGreaterThanOrEqual(6); // the same counting as lines.test.ts (end mark included)
  });
});

describe('mars-arithmetic recordings', () => {
  it('both manifests are identical, list exactly the yaml ids in order (every sentence has a recording) and carry the yaml (subtitle) text', () => {
    expect(JSON.stringify(v1)).toBe(JSON.stringify(v2));
    expect(Object.keys(v2)).toEqual(lines.map((l) => l.id));
    for (const l of lines) expect(v2[l.id].text, l.id).toBe(l.text);
  });
  it('the spliced-number clips of the old design are gone (the equation is never read aloud)', () => {
    expect(fs.existsSync(path.join(ROOT, 'public/audio/mars-arithmetic-numbers'))).toBe(false);
    expect(fs.existsSync(path.join(ROOT, 'content/narration/mars-arithmetic-numbers.yaml'))).toBe(false);
  });
  it('every clip file exists and lasts 0.3-25 s; no orphan m4a', () => {
    for (const [id, c] of Object.entries(v2)) { expect(fs.existsSync(path.join(ROOT, 'public', c.src)), id).toBe(true); expect(c.durationMs, id).toBeGreaterThanOrEqual(300); expect(c.durationMs, id).toBeLessThanOrEqual(25000); }
    const used = new Set(Object.values(v2).map((c) => c.src.split('/').pop()));
    expect(fs.readdirSync(dir).filter((f) => f.endsWith('.m4a') && !used.has(f))).toEqual([]);
  });
  it.skipIf(!hasFfmpeg)('all 60 sentences are -16 +- 0.5 LUFS with a true peak <= -1.5 dBTP', () => {
    for (const l of lines) {
      const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', path.join(ROOT, 'public', v2[l.id].src), '-af', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf8' });
      const s = r.stderr.slice(r.stderr.lastIndexOf('Summary:'));
      const lufs = Number(/I:\s+(-?[\d.]+) LUFS/.exec(s)?.[1]), tp = Number(/Peak:\s+(-?[\d.]+) dBFS/.exec(s)?.[1]);
      expect(Math.abs(lufs + 16), `${l.id} ${lufs} LUFS`).toBeLessThanOrEqual(0.5);
      expect(tp, `${l.id} ${tp} dBTP`).toBeLessThanOrEqual(-1.5);
    }
  }, 120000);
  it('the small numbers list covers 100-1000 only, with files', () => {
    const small = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/audio/mars-base/numbers-100-1000.json'), 'utf8')) as Record<string, { src: string; text: string }>;
    expect(Object.keys(small)).toEqual(Array.from({ length: 901 }, (_, i) => `mars.num.${100 + i}`));
    for (const [id, c] of Object.entries(small)) expect(fs.existsSync(path.join(ROOT, 'public', c.src)), id).toBe(true);
  });
});
