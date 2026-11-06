#!/usr/bin/env node
/**
 * normalize-syllables.mjs - re-encode the licensed real-person syllable recordings of 拼音电台
 * (public/audio/pinyin-station/human.*) so they sit at the same loudness as the rest of the game.
 *
 *   node site/pinyin-station/tools/normalize-syllables.mjs              apply (originals -> public/audio/pinyin-station)
 *   node site/pinyin-station/tools/normalize-syllables.mjs --check      verify files + manifest, write nothing (exit 1 on problems)
 *   node site/pinyin-station/tools/normalize-syllables.mjs --check --json     same, machine-readable (used by normalize-syllables.test.ts)
 *   node site/pinyin-station/tools/normalize-syllables.mjs --selftest   synthetic DSP checks (short-clip fallback, hum notch)
 *   node site/pinyin-station/tools/normalize-syllables.mjs --regain-synthetic   gain-only fix for TTS call-sounds that missed -16 +- 0.5 LUFS
 *   node site/pinyin-station/tools/normalize-syllables.mjs --regain-ids id1,id2   the same gain-only fix for any listed manifest ids (TTS lines the AAC encoder left off -16 +- 0.5)
 *   options: --originals DIR   backup of the untouched downloads (default ~/kid-games-work/pinyin-audit/originals/human)
 *            --dir DIR         audio dir (default public/audio/pinyin-station)   --only a1,ba1   --report FILE (apply)
 *
 * Why: the upstream recordings were never loudness-normalised (median -27.9 LUFS, 2nd/3rd tone -34/-35 LUFS) while every
 * TTS line of the game is at -16 LUFS; they also carry a 50 Hz mains hum riding on a DC offset, start with a DC-step click
 * (digital zero, then the DC level), and are cut tight with no lead/tail room.
 *
 * Chain per clip (all zero-phase, nothing is invented - only removed, faded, padded or scaled):
 *   1. ffmpeg decode -> mono float 44.1 kHz; drop the decoder's exact-zero head/tail
 *   2. zero-phase high-pass 60 Hz (2nd-order Butterworth, forward+backward = 4th-order magnitude, odd-extension edges so the
 *      DC step never rings) + zero-phase notch on the measured mains hum (47-53 Hz peak, Q 10) when it stands >= 9 dB out
 *   3. 5 ms raised-cosine fade-in, 25 ms fade-out (27 clips ended hard-cut), 50 ms lead / 200 ms tail silence (docs/VOICE.md)
 *   4. loudness: ITU-R BS.1770 integrated (ffmpeg ebur128) -> static gain to -16 LUFS; true peak kept <= -2.5 dBTP on PCM
 *      (<= -1.5 dBTP after AAC) with ffmpeg alimiter (attack 1 ms, release 40 ms; same settings as tools/voice post.py) only for
 *      the clips whose peaks would exceed it; the gain is pushed up again (<= +6 dB) when the limiter ate loudness.
 *      FALLBACK for clips whose speech is shorter than 0.4 s (BS.1770 needs a 400 ms block): plain RMS of the speech samples,
 *      target RMS_FALLBACK_DBFS (= -16 LUFS minus the median LUFS-RMS gap measured on the 210 real recordings, -0.9 dB).
 *   5. AAC-LC mono 44.1 kHz 40 kbps .m4a (+faststart), name human.<name>.<sha256 8>.m4a (content addressed, like the TTS clips)
 * Licences: davinfifield/mp3-chinese-pinyin-sound = Unlicense, Lingua Libre "O" = CC0 -> modification is explicitly allowed.
 * The untouched downloads are kept in --originals; re-running the script always starts from them (idempotent).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
export const SR = 44100;
export const TARGET_LUFS = -16;
export const LUFS_TOLERANCE = 1; // acceptance: -16 +- 1 LUFS (the script itself lands within +-0.3)
export const TP_MAX_DBTP = -1.5; // acceptance after AAC
export const TP_PCM_DBTP = -2.5; // limiter ceiling on the PCM (1 dB margin for the AAC encoder)
export const LEAD_MS = 50;
export const TAIL_MS = 200;
export const FADE_IN_MS = 5;
export const FADE_OUT_MS = 25;
export const HP_HZ = 60;
export const NOTCH_Q = 10;
export const HUM_MIN_PROMINENCE_DB = 9;
export const MIN_BS1770_SECONDS = 0.4;
export const MAX_LIMITER_DB = Number(process.env.NORMALIZE_MAX_LIMITER_DB ?? 3.3); // peak reduction we are happy with; beyond it the clip stays up to 0.9 dB under -16 LUFS instead
export const MAX_LIMITER_HARD_DB = Math.max(5, MAX_LIMITER_DB); // never limit harder than this
export const RMS_FALLBACK_DBFS = -16.9; // = TARGET_LUFS - 0.9 (median LUFS-RMS gap of the real recordings)
export const DURATION_RANGE_S = [0.3, 25];
export const PROCESSING_TAG = 'normalize-syllables@1';

// ------------------------------------------------------------------------------------------------ ffmpeg helpers
// Audio goes through small temp files, never through stdin: ffmpeg fed by a node spawnSync pipe stalled now and then
// (state S, 0 CPU) on this machine, so every call also has a timeout and is retried.
let workDir = null;
let counter = 0;
const work = () => (workDir ??= fs.mkdtempSync(path.join(process.env.NORMALIZE_WORK ?? path.join(os.homedir(), 'kid-games-work', 'tmp'), 'ns-')));
process.on('exit', () => workDir && fs.rmSync(workDir, { recursive: true, force: true }));
function ff(args, { text = false } = {}) {
  for (let attempt = 1; ; attempt++) {
    const r = spawnSync('ffmpeg', ['-hide_banner', '-nostdin', '-nostats', ...args], { maxBuffer: 1 << 29, encoding: text ? 'utf8' : undefined, timeout: 60000, stdio: ['ignore', 'pipe', 'pipe'] });
    if (r.status === 0) return r;
    if (attempt >= 4) throw new Error(`ffmpeg ${args.join(' ')} failed ${attempt}x: ${String(r.stderr).slice(-600)}`);
  }
}
const f32 = (x) => Buffer.from(new Float32Array(x).buffer);
const fromF32 = (buf) => new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const rawFile = (x) => {
  const f = path.join(work(), `s${counter++}.f32`);
  fs.writeFileSync(f, f32(x));
  return f;
};
const RAW_IN = (f) => ['-f', 'f32le', '-ar', String(SR), '-ac', '1', '-i', f];

export function decodeFile(file) {
  const r = ff(['-v', 'error', '-i', file, '-f', 'f32le', '-ac', '1', '-ar', String(SR), '-']);
  return Float64Array.from(fromF32(r.stdout));
}

/** BS.1770-4 integrated loudness + true peak of a float signal (ffmpeg ebur128). I is null when the gate finds nothing. */
export function measure(x) {
  const raw = rawFile(x);
  const r = ff(['-v', 'info', ...RAW_IN(raw), '-af', 'ebur128=peak=true', '-f', 'null', '-'], { text: true });
  fs.rmSync(raw, { force: true });
  const err = String(r.stderr);
  const summary = err.slice(err.lastIndexOf('Summary:'));
  const i = /I:\s+(-?[\d.]+|-inf)\s+LUFS/.exec(summary)?.[1];
  const tp = /Peak:\s+(-?[\d.]+|-inf)\s+dBFS/.exec(summary)?.[1];
  const num = (v) => (v === undefined || v === '-inf' ? null : Number(v));
  return { I: num(i), TP: num(tp) };
}

/** Decode an encoded file and measure it exactly like the player hears it. */
export function measureFile(file) {
  return measure(decodeFile(file));
}

export function probeDuration(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' });
  return Number(r.stdout.trim());
}
export function probeStream(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name,sample_rate,channels,bit_rate', '-of', 'json', file], { encoding: 'utf8' });
  return JSON.parse(r.stdout).streams?.[0] ?? {};
}

// ------------------------------------------------------------------------------------------------ DSP
function biquadCoef(type, fc, q) {
  const w = (2 * Math.PI * fc) / SR;
  const c = Math.cos(w);
  const a = Math.sin(w) / (2 * q);
  let b0, b1, b2;
  if (type === 'hp') [b0, b1, b2] = [(1 + c) / 2, -(1 + c), (1 + c) / 2];
  else [b0, b1, b2] = [1, -2 * c, 1]; // notch
  const a0 = 1 + a;
  return [b0 / a0, b1 / a0, b2 / a0, (-2 * c) / a0, (1 - a) / a0];
}
function biquad(x, [b0, b1, b2, a1, a2]) {
  const y = new Float64Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let n = 0; n < x.length; n++) {
    const v = b0 * x[n] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x[n]; y2 = y1; y1 = v; y[n] = v;
  }
  return y;
}
/** Zero-phase (forward + backward) cascade on an odd-extended signal, so an initial DC step does not ring. */
export function zeroPhase(x, cascade) {
  const pad = Math.min(x.length - 1, Math.round(0.3 * SR));
  const p = new Float64Array(x.length + 2 * pad);
  for (let k = 1; k <= pad; k++) {
    p[pad - k] = 2 * x[0] - x[k];
    p[pad + x.length - 1 + k] = 2 * x[x.length - 1] - x[x.length - 1 - k];
  }
  p.set(x, pad);
  let y = p;
  for (const c of cascade) y = biquad(y, c);
  y = y.reverse();
  for (const c of cascade) y = biquad(y, c);
  y = y.reverse();
  return y.slice(pad, pad + x.length);
}

/** Power of the signal at one frequency (Hann-windowed single-bin DFT) in dB. */
function binDb(x, hz) {
  let re = 0, im = 0;
  const w = (2 * Math.PI * hz) / SR;
  const n = x.length;
  for (let i = 0; i < n; i++) {
    const win = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
    re += x[i] * win * Math.cos(w * i);
    im -= x[i] * win * Math.sin(w * i);
  }
  return 10 * Math.log10((re * re + im * im) / n / n + 1e-30);
}
/** Mains hum: strongest bin in 47-53 Hz and how far it stands above the 62-100 Hz floor (dB). */
export function detectHum(x) {
  let best = { hz: 50, db: -Infinity };
  for (let hz = 47; hz <= 53.001; hz += 0.1) {
    const db = binDb(x, hz);
    if (db > best.db) best = { hz, db };
  }
  const floor = [];
  for (let hz = 62; hz <= 100; hz += 4) floor.push(binDb(x, hz));
  floor.sort((a, b) => a - b);
  return { hz: Math.round(best.hz * 10) / 10, prominenceDb: best.db - floor[floor.length >> 1] };
}

function trimDigitalZero(x) {
  let a = 0, b = x.length - 1;
  while (a < b && Math.abs(x[a]) < 1e-5) a++;
  while (b > a && Math.abs(x[b]) < 1e-5) b--;
  return x.slice(a, b + 1);
}

/** Clean + fade + pad. Returns {y, hum, speechSeconds}. */
export function shape(x0) {
  const x = trimDigitalZero(x0);
  const hum = detectHum(x);
  const cascade = [biquadCoef('hp', HP_HZ, Math.SQRT1_2)];
  if (hum.prominenceDb >= HUM_MIN_PROMINENCE_DB) cascade.push(biquadCoef('notch', hum.hz, NOTCH_Q));
  const y = zeroPhase(x, cascade);
  const fi = Math.round((FADE_IN_MS / 1000) * SR);
  const fo = Math.round((FADE_OUT_MS / 1000) * SR);
  for (let i = 0; i < fi && i < y.length; i++) y[i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / fi);
  for (let i = 0; i < fo && i < y.length; i++) y[y.length - 1 - i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / fo);
  const lead = Math.round((LEAD_MS / 1000) * SR);
  const tail = Math.round((TAIL_MS / 1000) * SR);
  const out = new Float64Array(lead + y.length + tail);
  out.set(y, lead);
  return { y: out, hum, speechSeconds: y.length / SR };
}

const rmsDb = (x) => {
  let s = 0;
  for (const v of x) s += v * v;
  return 10 * Math.log10(s / x.length + 1e-30);
};

/**
 * Static gain towards -16 LUFS (+ limiter when the peaks need it). `ceiling` = true-peak ceiling of the PCM in dBTP.
 * Returns the processed float signal + the numbers.
 */
export function loudnessNormalize(shaped, speechSeconds, ceiling = TP_PCM_DBTP, target = TARGET_LUFS) {
  const m0 = measure(shaped);
  const useBs1770 = speechSeconds >= MIN_BS1770_SECONDS && m0.I !== null;
  const body = shaped.subarray(Math.round((LEAD_MS / 1000) * SR), shaped.length - Math.round((TAIL_MS / 1000) * SR));
  const baseGain = useBs1770 ? target - m0.I : RMS_FALLBACK_DBFS + (target - TARGET_LUFS) - rmsDb(body);
  const lim = 10 ** ((ceiling - 0.5) / 20); // 0.5 dB inter-sample headroom
  const rawShaped = rawFile(shaped);
  let gain = baseGain, best = null;
  for (let attempt = 0; attempt < 6; attempt++) {
    const limited = m0.TP + gain > ceiling;
    const chain = `volume=${gain.toFixed(3)}dB:precision=float` + (limited ? `,alimiter=limit=${lim.toFixed(4)}:attack=1:release=40:level=0` : '');
    const out = Float64Array.from(fromF32(ff(['-v', 'error', ...RAW_IN(rawShaped), '-af', chain, '-f', 'f32le', '-']).stdout));
    const m = measure(out);
    const reduction = limited ? Math.max(0, m0.TP + gain - m.TP) : 0;
    const errBest = best ? target - best.m.I : Infinity;
    if (best && reduction > MAX_LIMITER_DB && (errBest <= 0.9 || reduction > MAX_LIMITER_HARD_DB)) break; // more limiting is not worth it: keep the previous, slightly quieter take
    best = { out, gain, limited, m, reduction };
    const err = useBs1770 ? target - m.I : 0;
    if (!limited || !useBs1770 || err <= 0.15) break; // the limiter ate loudness: push the gain again
    gain += err;
  }
  fs.rmSync(rawShaped, { force: true });
  const { out, limited, m } = best;
  gain = best.gain;
  return {
    out, gainDb: gain, baseGainDb: baseGain, limited, measuredPcm: m, method: useBs1770 ? 'BS.1770' : 'RMS-fallback',
    peakReductionDb: best.reduction,
  };
}

function encodeM4a(signal, outFile) {
  const encoder = /\saac_at\s/.test(String(ff(['-encoders'], { text: true }).stdout)) ? 'aac_at' : 'aac';
  // 16-bit PCM file first, like tools/voice post.py
  const raw = rawFile(signal);
  const wav = outFile + '.pcm.wav';
  const tmp = outFile + '.part.m4a';
  ff(['-v', 'error', '-y', ...RAW_IN(raw), '-c:a', 'pcm_s16le', wav]);
  ff(['-v', 'error', '-y', '-i', wav, '-c:a', encoder, '-b:a', '40k', '-ac', '1', '-ar', String(SR), '-movflags', '+faststart', tmp]);
  fs.rmSync(raw, { force: true });
  fs.rmSync(wav, { force: true });
  fs.renameSync(tmp, outFile);
  return encoder;
}

/** Full chain for one original file. Re-runs with a lower PCM ceiling if the AAC decode overshoots -1.5 dBTP, and nudges the target when AAC cost loudness. */
export function processClip(originalFile, workDir) {
  const x = decodeFile(originalFile);
  const before = measure(x);
  const { y: shaped, hum, speechSeconds } = shape(x);
  return finishClip(shaped, speechSeconds, before, hum, workDir, path.basename(originalFile));
}

/** gain + limiter + AAC + closed-loop loudness search for an already shaped (cleaned, faded, padded) signal */
function finishClip(shaped, speechSeconds, before, hum, workDir, label) {
  let ceiling = TP_PCM_DBTP, offset = 0, best = null;
  const tried = [];
  const bestFile = path.join(workDir, 'clip.best.m4a');
  for (let pass = 0; pass < 5; pass++) {
    const norm = loudnessNormalize(shaped, speechSeconds, ceiling, TARGET_LUFS + offset);
    const tmp = path.join(workDir, 'clip.m4a');
    const encoder = encodeM4a(norm.out, tmp);
    const after = measureFile(tmp);
    if (process.env.NORMALIZE_DEBUG) console.error(`  pass ${pass} ${label} offset ${offset.toFixed(2)} ceiling ${ceiling.toFixed(2)} gain ${norm.gainDb.toFixed(2)} limited ${norm.limited} red ${norm.peakReductionDb.toFixed(2)} pcm ${norm.measuredPcm.I} / ${norm.measuredPcm.TP} -> aac ${after.I} / ${after.TP}`);
    if (after.TP === null || after.TP > TP_MAX_DBTP - 0.05) { // the AAC decode overshoots: lower the PCM ceiling
      ceiling -= Math.max(0.3, (after.TP ?? 0) - TP_MAX_DBTP + 0.3);
      continue;
    }
    const err = after.I === null ? 0 : TARGET_LUFS - after.I; // > 0: too quiet
    tried.push({ offset, err });
    if (!best || Math.abs(err) < Math.abs(best.err)) {
      fs.copyFileSync(tmp, bestFile);
      best = { norm, encoder, after, before, hum, speechSeconds, err };
    }
    // the 40 kbps AAC encoder moves the K-weighted loudness of bright consonants by up to +-0.8 dB, not monotonically in the gain:
    // search the target offset (bracket + bisect) for the file that really lands on -16 LUFS
    if (Math.abs(err) <= 0.5 || norm.method !== 'BS.1770') break;
    if (err > 0 && err <= 0.9 && norm.limited && norm.peakReductionDb >= MAX_LIMITER_DB - 0.05) break; // louder would mean limiting harder
    const quiet = tried.filter((t) => t.err > 0).map((t) => t.offset);
    const loud = tried.filter((t) => t.err < 0).map((t) => t.offset);
    offset = quiet.length && loud.length ? (Math.max(...quiet) + Math.min(...loud)) / 2 : offset + err;
  }
  return { ...best, tmp: bestFile };
}

// ------------------------------------------------------------------------------------------------ manifest + files
export function loadManifest(dir) {
  return JSON.parse(fs.readFileSync(path.join(dir, 'audio-manifest.json'), 'utf8'));
}
/** A real-person recording (not synthetic): upstream-library or Lingua Libre source. */
export const isRecording = (id, clip) => id.startsWith('py.syl.') && /^(davinfifield|Lingua ?Libre)/i.test(String(clip.source ?? ''));
const nameOf = (src) => /(?:^|\/)human\.(.+?)\.[0-9a-f]{8}\.(?:mp3|m4a)$/.exec(src)?.[1] ?? null;
const toneOf = (id) => /(\d)$/.exec(id)?.[1] ?? '?';

function recordings(manifest) {
  const byName = new Map();
  for (const [id, clip] of Object.entries(manifest)) {
    if (!isRecording(id, clip)) continue;
    const name = nameOf(clip.src);
    if (!name) throw new Error(`${id}: cannot read the clip name from ${clip.src}`);
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push(id);
  }
  return byName;
}
const sha8 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').slice(0, 8);

function findOriginal(originalsDir, name, audioDir) {
  const re = new RegExp(`^human\\.${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.[0-9a-f]{8}\\.(mp3|m4a)$`);
  const hit = fs.existsSync(originalsDir) ? fs.readdirSync(originalsDir).find((f) => re.test(f)) : undefined;
  if (hit) return path.join(originalsDir, hit);
  // a freshly imported download (import-human-audio.mjs) still sits in the audio dir as human.<name>.<sha8>.mp3: keep it as the original
  const fresh = fs.readdirSync(audioDir).find((f) => re.test(f) && f.endsWith('.mp3'));
  if (!fresh) throw new Error(`no original for ${name} in ${originalsDir}`);
  fs.mkdirSync(originalsDir, { recursive: true });
  fs.copyFileSync(path.join(audioDir, fresh), path.join(originalsDir, fresh));
  return path.join(originalsDir, fresh);
}

// ------------------------------------------------------------------------------------------------ modes
function apply({ dir, originalsDir, only, reportFile }) {
  const manifestPath = path.join(dir, 'audio-manifest.json');
  const manifest = loadManifest(dir);
  const names = recordings(manifest);
  const rows = [];
  {
    for (const [name, ids] of names) {
      if (only && !ids.some((i) => only.includes(i.replace('py.syl.', '')))) continue;
      const original = findOriginal(originalsDir, name, dir);
      const r = processClip(original, work());
      const hash = sha8(r.tmp);
      const outName = `human.${name}.${hash}.m4a`;
      fs.copyFileSync(r.tmp, path.join(dir, outName));
      const durationMs = Math.round(probeDuration(path.join(dir, outName)) * 1000);
      for (const id of ids) {
        const old = manifest[id].src.split('/').pop();
        manifest[id] = { ...manifest[id], src: `/audio/pinyin-station/${outName}`, durationMs, processing: PROCESSING_TAG };
        if (old !== outName && /^human\./.test(old) && fs.existsSync(path.join(dir, old)) && !Object.values(manifest).some((c) => c.src.endsWith('/' + old))) fs.unlinkSync(path.join(dir, old));
      }
      rows.push({
        name, ids, tone: toneOf(ids[0]), file: outName, original: path.basename(original),
        beforeLufs: r.before.I, beforeTp: r.before.TP, afterLufs: r.after.I, afterTp: r.after.TP, pcmLufs: r.norm.measuredPcm.I,
        gainDb: +r.norm.gainDb.toFixed(2), baseGainDb: +r.norm.baseGainDb.toFixed(2), limited: r.norm.limited, peakReductionDb: +r.norm.peakReductionDb.toFixed(2), method: r.norm.method,
        humHz: r.hum.hz, humProminenceDb: +r.hum.prominenceDb.toFixed(1), humNotched: r.hum.prominenceDb >= HUM_MIN_PROMINENCE_DB,
        speechSeconds: +r.speechSeconds.toFixed(3), durationMs, encoder: r.encoder,
      });
      process.stdout.write(`${name.padEnd(8)} ${String(r.before.I?.toFixed(1)).padStart(6)} -> ${String(r.after.I?.toFixed(2)).padStart(6)} LUFS  tp ${r.after.TP?.toFixed(2)}${r.norm.limited ? '  limiter' : ''}\n`);
    }
  }
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  if (reportFile) fs.writeFileSync(reportFile, JSON.stringify(rows, null, 1));
  console.log(`normalised ${rows.length} files (${rows.reduce((n, r) => n + r.ids.length, 0)} manifest ids)`);
  return rows;
}

/**
 * Synthetic call-sounds come out of tools/voice, whose BS.1770 pre-measurement is unreliable for 0.3-0.4 s of speech: the decoded
 * m4a can land 0.2-0.5 dB outside -16 +- 0.5. Re-gain just those (decode -> same gain/limiter/AAC search -> new content-addressed name).
 */
export function regainSynthetic({ dir, tolerance = 0.5, ids = null }) {
  const manifestPath = path.join(dir, 'audio-manifest.json');
  const manifest = loadManifest(dir);
  const done = [];
  for (const [id, clip] of Object.entries(manifest)) {
    if (ids ? !ids.includes(id) : !id.startsWith('py.syl.') || !clip.synthetic) continue;
    const file = path.join(dir, clip.src.split('/').pop());
    const m = measureFile(file);
    if (m.I !== null && Math.abs(m.I - TARGET_LUFS) <= tolerance && m.TP <= TP_MAX_DBTP) continue;
    const x = decodeFile(file);
    const r = finishClip(x, 1, m, { hz: 0, prominenceDb: 0 }, work(), id);
    const hash = sha8(r.tmp);
    const outName = `${id}.${hash}.m4a`;
    fs.copyFileSync(r.tmp, path.join(dir, outName));
    const old = path.basename(file);
    manifest[id] = { ...clip, src: `/audio/pinyin-station/${outName}`, durationMs: Math.round(probeDuration(path.join(dir, outName)) * 1000), regain: PROCESSING_TAG };
    if (old !== outName && !Object.entries(manifest).some(([k, c]) => k !== id && c.src.endsWith('/' + old))) fs.rmSync(path.join(dir, old), { force: true });
    done.push({ id, before: m.I, after: r.after.I, tp: r.after.TP });
    console.log(`${id} ${m.I} -> ${r.after.I} LUFS, tp ${r.after.TP}`);
  }
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`re-gained ${done.length} synthetic clip(s)`);
  return done;
}

/** Verify without writing. `clips` = one row per py.syl.* manifest id (recordings AND synthetic call-sounds). */
export function check({ dir }) {
  const manifest = loadManifest(dir);
  const problems = [];
  const clips = [];
  const referenced = new Set();
  const cache = new Map();
  for (const [id, clip] of Object.entries(manifest)) {
    const file = path.join(dir, clip.src.split('/').pop());
    referenced.add(path.basename(file));
    if (!fs.existsSync(file)) { problems.push(`${id}: ${clip.src} is missing`); continue; }
    if (!id.startsWith('py.syl.')) continue;
    if (!cache.has(file)) {
      const dur = probeDuration(file);
      const st = probeStream(file);
      const m = measureFile(file);
      cache.set(file, { dur, st, m });
    }
    const { dur, st, m } = cache.get(file);
    const rec = isRecording(id, clip);
    const row = { id, file: path.basename(file), recording: rec, synthetic: !rec, lufs: m.I, tp: m.TP, durationS: dur, durationMs: clip.durationMs, codec: st.codec_name, sampleRate: Number(st.sample_rate), channels: st.channels };
    clips.push(row);
    if (m.I === null || Math.abs(m.I - TARGET_LUFS) > LUFS_TOLERANCE) problems.push(`${id}: ${m.I?.toFixed(2)} LUFS is not ${TARGET_LUFS} +- ${LUFS_TOLERANCE}`);
    if (m.TP === null || m.TP > TP_MAX_DBTP) problems.push(`${id}: true peak ${m.TP?.toFixed(2)} dBTP > ${TP_MAX_DBTP}`);
    if (!(dur >= DURATION_RANGE_S[0] && dur <= DURATION_RANGE_S[1])) problems.push(`${id}: duration ${dur.toFixed(2)} s outside ${DURATION_RANGE_S.join('-')} s`);
    if (Math.abs(dur * 1000 - clip.durationMs) > 60) problems.push(`${id}: manifest durationMs ${clip.durationMs} != ffprobe ${Math.round(dur * 1000)}`);
    if (rec) {
      if (!/\.m4a$/.test(file)) problems.push(`${id}: recording is not re-encoded (${path.basename(file)})`);
      if (clip.processing !== PROCESSING_TAG) problems.push(`${id}: manifest "processing" is not ${PROCESSING_TAG}`);
    } else if (!clip.synthetic) {
      problems.push(`${id}: synthetic clip must carry "synthetic": true in the manifest`);
    }
    if (st.codec_name !== 'aac' || Number(st.sample_rate) !== SR || st.channels !== 1) problems.push(`${id}: ${st.codec_name}/${st.sample_rate}/${st.channels}ch is not AAC mono ${SR}`);
    const hash = /\.([0-9a-f]{8})\.m4a$/.exec(path.basename(file))?.[1];
    if (rec && hash !== sha8(file)) problems.push(`${id}: file name hash ${hash} != sha256 ${sha8(file)}`);
  }
  for (const f of fs.readdirSync(dir)) {
    if (f === 'audio-manifest.json') continue;
    if (!referenced.has(f)) problems.push(`orphan file ${f} (not in the manifest)`);
    if (/^human\..*\.mp3$/.test(f)) problems.push(`${f}: un-normalised original left in the audio dir`);
  }
  return { problems, clips };
}

function selftest() {
  const out = [];
  const tone = (secs, db, hz = 300) => Float64Array.from({ length: Math.round(secs * SR) }, (_, i) => 10 ** (db / 20) * Math.sin((2 * Math.PI * hz * i) / SR));
  // 1. short clip (< 0.4 s) takes the RMS fallback and lands on its target
  const short = shape(Float64Array.from(tone(0.3, -30), (v) => v * 1)); // 0.3 s speech-ish
  const n1 = loudnessNormalize(short.y, short.speechSeconds);
  const act = n1.out.subarray(Math.round(0.05 * SR), n1.out.length - Math.round(0.2 * SR));
  out.push({ test: 'short-clip RMS fallback', method: n1.method, rmsDbfs: +rmsDb(act).toFixed(2), target: RMS_FALLBACK_DBFS, ok: n1.method === 'RMS-fallback' && Math.abs(rmsDb(act) - RMS_FALLBACK_DBFS) < 1.2 });
  // 2. a long quiet clip with a 50 Hz hum and a DC offset: hum bin drops >= 25 dB, DC gone, loudness -16
  const base = tone(0.8, -34);
  const humd = Float64Array.from(base, (v, i) => v + 0.02 + 0.006 * Math.sin((2 * Math.PI * 49.96 * i) / SR));
  const s2 = shape(humd);
  const n2 = loudnessNormalize(s2.y, s2.speechSeconds);
  const body = (sig) => sig.subarray(Math.round(0.06 * SR), sig.length - Math.round(0.21 * SR));
  const dropDb = binDb(humd, 49.96) - (binDb(body(s2.y), 49.96) + 0); // before / after (shape stage, same gain)
  const dc = body(s2.y).reduce((a, v) => a + v, 0) / body(s2.y).length;
  out.push({ test: 'hum + DC removal, -16 LUFS', humDropDb: +dropDb.toFixed(1), dcAfter: +dc.toExponential(1), lufs: n2.measuredPcm.I, ok: dropDb > 25 && Math.abs(dc) < 1e-4 && Math.abs(n2.measuredPcm.I - TARGET_LUFS) < 0.5 });
  // 3. peaky clip: the limiter holds the true peak under the PCM ceiling
  const peaky = tone(0.8, -40);
  for (let i = 0; i < 220; i++) peaky[Math.round(0.4 * SR) + i] += 0.9 * Math.sin((2 * Math.PI * 1500 * i) / SR) * Math.sin((Math.PI * i) / 220);
  const s3 = shape(peaky);
  const n3 = loudnessNormalize(s3.y, s3.speechSeconds);
  out.push({ test: 'limiter keeps TP', limited: n3.limited, tp: n3.measuredPcm.TP, lufs: n3.measuredPcm.I, ok: n3.limited && n3.measuredPcm.TP <= TP_PCM_DBTP + 0.05 });
  return out;
}

// ------------------------------------------------------------------------------------------------ CLI
function parseArgs(argv) {
  const a = { dir: path.join(ROOT, 'public/audio/pinyin-station'), originalsDir: path.join(os.homedir(), 'kid-games-work', 'pinyin-audit', 'originals', 'human') };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--check') a.check = true;
    else if (k === '--json') a.json = true;
    else if (k === '--selftest') a.selftest = true;
    else if (k === '--regain-synthetic') a.regain = true;
    else if (k === '--regain-ids') { a.regain = true; a.ids = argv[++i].split(','); }
    else if (k === '--dir') a.dir = path.resolve(argv[++i]);
    else if (k === '--originals') a.originalsDir = path.resolve(argv[++i]);
    else if (k === '--only') a.only = argv[++i].split(',');
    else if (k === '--report') a.reportFile = path.resolve(argv[++i]);
    else throw new Error(`unknown option ${k}`);
  }
  return a;
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = parseArgs(process.argv.slice(2));
  if (a.selftest) {
    const r = selftest();
    console.log(JSON.stringify(r, null, 1));
    process.exitCode = r.every((x) => x.ok) ? 0 : 1;
  } else if (a.regain) {
    regainSynthetic(a);
  } else if (a.check) {
    const { problems, clips } = check(a);
    if (a.json) console.log(JSON.stringify({ problems, clips }));
    else {
      const rec = clips.filter((c) => c.recording);
      console.log(`${clips.length} py.syl.* ids checked (${rec.length} real-person, ${clips.length - rec.length} synthetic)`);
      for (const p of problems) console.log('PROBLEM', p);
      console.log(problems.length ? `${problems.length} problem(s)` : 'ok');
    }
    process.exitCode = problems.length ? 1 : 0;
  } else {
    fs.mkdirSync(path.join(os.homedir(), 'kid-games-work', 'tmp'), { recursive: true });
    apply(a);
  }
}
