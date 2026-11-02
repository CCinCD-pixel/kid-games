#!/usr/bin/env node
/**
 * Gain-only fix for narration clips that the voice pipeline left off -16 +- 0.5 LUFS (0.5 s one-word clips: its BS.1770 pre-measurement
 * is unreliable below ~0.7 s of speech) or above -1.5 dBTP. Decodes the m4a (lead/tail padding already in), sets the gain from the
 * decoded file's own BS.1770 measurement, limits only if the peaks need it, re-encodes AAC-LC mono 40 kbps, searches the target offset
 * until the DECODED result lands (the encoder moves loudness by up to +-0.8 dB), then renames to <id>.<sha8>.m4a and updates the manifests.
 * usage: node site/mars-base/tools/regain-clips.mjs --dir public/audio/mars-arithmetic --manifests audio-manifest.json,audio-manifest-v2.json --ids ma.rem,ma.unit.q
 * (the DSP helpers come from the pinyin tool site/pinyin-station/tools/normalize-syllables.mjs, imported unchanged)
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { decodeFile, measureFile, loudnessNormalize, probeDuration, SR, TARGET_LUFS, TP_MAX_DBTP, TP_PCM_DBTP } from '../../pinyin-station/tools/normalize-syllables.mjs';

const arg = (k) => { const i = process.argv.indexOf(k); return i < 0 ? null : process.argv[i + 1]; };
const dir = path.resolve(arg('--dir')), manifests = arg('--manifests').split(','), ids = arg('--ids').split(',');
const work = fs.mkdtempSync(path.join(os.homedir(), 'kid-games-work', 'tmp', 'rg-'));
const maps = Object.fromEntries(manifests.map((f) => [f, JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))]));
const run = (args) => { const r = spawnSync('ffmpeg', ['-hide_banner', '-nostdin', '-nostats', '-v', 'error', '-y', ...args], { timeout: 60000 }); if (r.status !== 0) throw new Error(String(r.stderr)); };
function encode(signal, out) {
  const raw = path.join(work, 'x.f32'), wav = path.join(work, 'x.wav');
  fs.writeFileSync(raw, Buffer.from(new Float32Array(signal).buffer));
  run(['-f', 'f32le', '-ar', String(SR), '-ac', '1', '-i', raw, '-c:a', 'pcm_s16le', wav]);
  run(['-i', wav, '-c:a', 'aac_at', '-b:a', '40k', '-ac', '1', '-ar', String(SR), '-movflags', '+faststart', out]);
}
try {
  for (const id of ids) {
    const first = maps[manifests[0]][id];
    const file = path.join(dir, first.src.split('/').pop());
    const x = decodeFile(file), before = measureFile(file);
    let ceiling = TP_PCM_DBTP, offset = 0, best = null;
    for (let pass = 0; pass < 6; pass++) {
      const norm = loudnessNormalize(x, 1, ceiling, TARGET_LUFS + offset);
      const tmp = path.join(work, 'c.m4a'); encode(norm.out, tmp);
      const after = measureFile(tmp);
      if (after.TP > TP_MAX_DBTP - 0.05) { ceiling -= 0.4; continue; }
      const err = TARGET_LUFS - after.I;
      if (!best || Math.abs(err) < Math.abs(best.err)) { fs.copyFileSync(tmp, path.join(work, 'best.m4a')); best = { err, after }; }
      if (Math.abs(err) <= 0.3) break;
      offset += err;
    }
    const hash = crypto.createHash('sha256').update(fs.readFileSync(path.join(work, 'best.m4a'))).digest('hex').slice(0, 8);
    const name = `${id}.${hash}.m4a`;
    fs.copyFileSync(path.join(work, 'best.m4a'), path.join(dir, name));
    const durationMs = Math.round(probeDuration(path.join(dir, name)) * 1000);
    for (const f of manifests) maps[f][id] = { ...maps[f][id], src: `/audio/${path.basename(dir)}/${name}`, durationMs };
    const old = path.basename(file);
    if (old !== name && !manifests.some((f) => Object.values(maps[f]).some((c) => c.src.endsWith('/' + old)))) fs.rmSync(file, { force: true });
    console.log(`${id}: ${before.I} / ${before.TP} -> ${best.after.I} / ${best.after.TP}`);
  }
  for (const f of manifests) fs.writeFileSync(path.join(dir, f), JSON.stringify(maps[f], null, f.includes('v2') ? 1 : 1) + '\n');
} finally { fs.rmSync(work, { recursive: true, force: true }); }
