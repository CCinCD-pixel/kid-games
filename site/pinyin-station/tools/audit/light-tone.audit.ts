/**
 * Evaluates the library's neutral-tone (轻声) candidates WITHOUT importing them: duration of the voiced part, level against the same
 * syllable's four full tones (RMS of the loud frames), F0 median and contour of the voiced part, with the game's tracker (read-only import).
 * usage: LIGHT_DIR=<dir with ma5.mp3 ...> npx vitest run -c site/pinyin-station/tools/audit/vitest.audit.config.ts light-tone
 * Writes $AUDIT_OUT/light-tone.json. A proxy: a real 轻声 is short, quiet and has no tone shape of its own - the ear decides.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { it } from 'vitest';
import { trackPitch } from '../../src/score/pitch';
import { buildContour, describeShape } from '../../src/score/contour';

const ROOT = path.resolve(__dirname, '../../../..');
const DIR = process.env.LIGHT_DIR ?? '';
const OUT = process.env.AUDIT_OUT ?? path.join(os.homedir(), 'kid-games-work/pinyin-audit/out-r3');
const decode = (f: string) => { const b = execFileSync('ffmpeg', ['-v', 'error', '-i', f, '-f', 'f32le', '-ac', '1', '-ar', '16000', '-'], { maxBuffer: 1 << 26 }); return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); };
function stats(file: string) {
  const pcm = decode(file), tr = trackPitch(pcm), rmsMax = Math.max(...tr.rms);
  const loud = tr.rms.map((r, i) => (r > rmsMax * 0.1 ? i : -1)).filter((i) => i >= 0);          // frames within -20 dB of the loudest
  const speech = tr.rms.map((r, i) => (r > rmsMax * 0.02 ? i : -1)).filter((i) => i >= 0);       // within -34 dB
  const c = buildContour(tr), d = c ? describeShape(c) : null;
  const rmsDb = 20 * Math.log10(Math.sqrt(loud.reduce((s, i) => s + tr.rms[i] ** 2, 0) / Math.max(1, loud.length)) + 1e-9);
  return { speechSec: speech.length ? +((speech[speech.length - 1] - speech[0] + 1) * tr.hopSeconds).toFixed(3) : 0, voicedSec: c ? +c.voicedSeconds.toFixed(3) : 0, loudRmsDbfs: +rmsDb.toFixed(1), peakDbfs: +(20 * Math.log10(Math.max(...pcm.map(Math.abs)))).toFixed(1), medianHz: c ? Math.round(c.medianHz) : null, rangeSt: c ? +c.rangeSt.toFixed(1) : null, shape: d?.shape ?? null, confidence: d ? +d.confidence.toFixed(2) : null };
}
it.skipIf(!DIR)('writes light-tone.json (only when LIGHT_DIR is set)', () => {
  const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/audio/pinyin-station/audio-manifest.json'), 'utf8')) as Record<string, { src: string }>;
  const rows: Record<string, unknown> = {};
  for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith('.mp3'))) {
    const name = f.replace('.mp3', ''), base = name.replace(/\d$/, '');
    const entry: Record<string, unknown> = { candidate: stats(path.join(DIR, f)), fullTones: {} };
    for (const t of [1, 2, 3, 4]) { const m = man[`py.syl.${base}${t}`]; if (m) (entry.fullTones as Record<string, unknown>)[`${base}${t}`] = stats(path.join(ROOT, 'public', m.src)); }
    rows[name] = entry;
  }
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'light-tone.json'), JSON.stringify(rows, null, 1));
});
