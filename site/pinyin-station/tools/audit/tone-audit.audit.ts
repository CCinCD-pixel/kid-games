/**
 * Tone audit of every real-person syllable: our own pitch tracker (src/score/pitch.ts + contour.ts, the same code the game's
 * ToneShapeScorer uses) extracts the F0 contour of each file, the descriptor names a tone shape, and that is compared with the
 * tone in the SOURCE file name (human.<syllable><tone>.<hash>.m4a - e.g. py.syl.er1 plays er2). Never plays audio.
 * Writes $AUDIT_OUT/tone.json (default ~/kid-games-work/pinyin-audit/out-r3). Run through run-audit.sh.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { it } from 'vitest';
import { trackPitch } from '../../src/score/pitch';
import { buildContour, describeShape, SHAPE_TONE } from '../../src/score/contour';

const ROOT = path.resolve(__dirname, '../../../..');
const OUT = process.env.AUDIT_OUT ?? path.join(os.homedir(), 'kid-games-work/pinyin-audit/out-r3');
const DIR = path.join(ROOT, 'public/audio/pinyin-station');
const LOW_CONFIDENCE = 0.7;

function decode16k(file: string): Float32Array {
  const buf = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'f32le', '-ac', '1', '-ar', '16000', '-'], { maxBuffer: 1 << 28 });
  return new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
}

it('writes the tone audit of all real-person syllables', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(DIR, 'audio-manifest.json'), 'utf8')) as Record<string, { src: string; text: string; synthetic?: boolean; source?: string }>;
  const byFile = new Map<string, { name: string; ids: string[]; text: string; synthetic: boolean }>();
  for (const [id, c] of Object.entries(manifest)) {
    if (!id.startsWith('py.syl.')) continue;
    const file = c.src.split('/').pop()!;
    const name = /^human\.(.+?)\.[0-9a-f]{8}\./.exec(file)?.[1] ?? file;
    if (!byFile.has(file)) byFile.set(file, { name, ids: [], text: c.text, synthetic: !!c.synthetic });
    byFile.get(file)!.ids.push(id);
  }
  const rows: Record<string, unknown>[] = [];
  for (const [file, info] of [...byFile].sort((a, b) => a[1].name.localeCompare(b[1].name))) {
    const expectedTone = Number(/([1-4])$/.exec(info.name)?.[1] ?? 0);
    const track = trackPitch(decode16k(path.join(DIR, file)));
    const contour = buildContour(track);
    const d = contour ? describeShape(contour) : null;
    const medianHz = contour?.medianHz ?? 0;
    rows.push({
      file, name: info.name, ids: info.ids, text: info.text, synthetic: info.synthetic, expectedTone,
      predictedTone: d ? SHAPE_TONE[d.shape] : null, shape: d?.shape ?? null, confidence: d ? +d.confidence.toFixed(3) : 0,
      scores: d ? Object.fromEntries(Object.entries(d.scores).map(([k, v]) => [k, +v.toFixed(3)])) : null,
      medianHz: Math.round(medianHz), rangeSt: contour ? +contour.rangeSt.toFixed(2) : 0, continuity: contour ? +contour.continuity.toFixed(2) : 0,
      voicedSeconds: contour ? +contour.voicedSeconds.toFixed(2) : 0, points: contour?.points.map((v) => +v.toFixed(2)) ?? null, curve: contour?.curve.map((v) => +v.toFixed(2)) ?? null,
      track: track.t.map((t, i) => (track.voiced[i] && track.f0[i] > 0 ? [+t.toFixed(3), Math.round(track.f0[i] * 10) / 10] : null)).filter(Boolean),
    });
  }
  const tones = rows.filter((r) => (r.expectedTone as number) > 0 && !r.synthetic);
  const matrix: number[][] = Array.from({ length: 5 }, () => Array(5).fill(0)); // [expected 1-4][predicted 1-4, 0 = none]
  for (const r of tones) matrix[r.expectedTone as number][(r.predictedTone as number | null) ?? 0]++;
  const wrong = tones.filter((r) => r.predictedTone !== r.expectedTone).map((r) => r.name as string);
  const low = tones.filter((r) => r.predictedTone === r.expectedTone && (r.confidence as number) < LOW_CONFIDENCE).map((r) => r.name as string);
  fs.mkdirSync(OUT, { recursive: true });
  const summary = { generated: new Date().toISOString(), tracker: 'src/score/pitch.ts + contour.ts', lowConfidenceBelow: LOW_CONFIDENCE, files: tones.length, correct: tones.length - wrong.length, accuracy: +((tones.length - wrong.length) / tones.length).toFixed(4), confusion: { rows: 'expected tone 1-4', cols: 'predicted tone 0(none),1,2,3,4', matrix: matrix.slice(1) }, wrong, lowConfidence: low };
  fs.writeFileSync(path.join(OUT, 'tone.json'), JSON.stringify({ summary, clips: rows }));
  console.log('TONE AUDIT', JSON.stringify(summary));
});
