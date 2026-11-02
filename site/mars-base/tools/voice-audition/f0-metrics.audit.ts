/**
 * Pitch metrics of every audition clip, with the game's own F0 tracker (pinyin-station src/score/pitch.ts, imported read-only).
 * PROXIES ONLY: mean F0, range (semitones P10-P90 of the voiced frames), final movement (semitones, last 20% of the voiced span
 * against the first 20% / against the lowest point / against the median), speech rate (characters per second), aperiodicity.
 * Higher pitch, a wide range, a clearly rising end and a breathy (aperiodic) voice are rough stand-ins for "撒娇 / 嗲" - they are
 * NOT a measurement of it; dad's ear decides. Writes $AUDITION_WORK/f0.json.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { it } from 'vitest';
import { trackPitch } from '../../../pinyin-station/src/score/pitch';

const WORK = process.env.AUDITION_WORK ?? path.join(os.homedir(), 'kid-games-work/pinyin-audit/voice-audition');
const st = (hz: number, ref: number) => 12 * Math.log2(hz / ref);
const med = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : NaN; };
const pct = (a: number[], p: number) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };

it('writes f0.json', () => {
  const rows: Record<string, unknown>[] = [];
  for (const eng of ['qwen3', 'kokoro', 'alt']) {
    const dir = path.join(WORK, `out-${eng}/public/audio/voice-audition${eng === 'alt' ? '-alt' : ''}`);
    const man = JSON.parse(fs.readFileSync(path.join(dir, 'audio-manifest.json'), 'utf8')) as Record<string, { src: string; text: string }>;
    for (const [id, c] of Object.entries(man)) {
      const buf = execFileSync('ffmpeg', ['-v', 'error', '-i', path.join(dir, c.src.split('/').pop()!), '-f', 'f32le', '-ac', '1', '-ar', '16000', '-'], { maxBuffer: 1 << 27 });
      const pcm = new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
      const tr = trackPitch(pcm);
      const idx = tr.t.map((_, i) => i).filter((i) => tr.voiced[i] && tr.f0[i] > 0);
      const f0 = idx.map((i) => tr.f0[i]);
      const rmsMax = Math.max(...tr.rms), speech = tr.t.filter((_, i) => tr.rms[i] > rmsMax * 0.02);
      const speechSec = speech.length ? speech[speech.length - 1] - speech[0] + tr.hopSeconds : 0;
      const chars = c.text.replace(/[，。？！、]/g, '').length;
      const row: Record<string, unknown> = { id, text: c.text, chars, speechSec: +speechSec.toFixed(3), charsPerSec: speechSec ? +(chars / speechSec).toFixed(2) : null, voicedFrames: f0.length };
      if (f0.length >= 5) {
        const m = med(f0), n = f0.length, k = Math.max(2, Math.round(n * 0.2));
        const first = med(f0.slice(0, k)), last = med(f0.slice(-k)), lowest = Math.min(...f0.map((_, i, a) => med(a.slice(Math.max(0, i - 1), i + 2))));
        Object.assign(row, {
          medianHz: Math.round(m), rangeSt: +st(pct(f0, 0.9), pct(f0, 0.1)).toFixed(1),
          endVsStartSt: +st(last, first).toFixed(1), endVsLowestSt: +st(last, lowest).toFixed(1), endVsMedianSt: +st(last, m).toFixed(1),
          aperiodicity: +(idx.reduce((s, i) => s + tr.aperiodicity[i], 0) / n).toFixed(3),
        });
      }
      rows.push(row);
    }
  }
  fs.writeFileSync(path.join(WORK, 'f0.json'), JSON.stringify(rows));
  console.log('F0 METRICS', rows.length);
});
