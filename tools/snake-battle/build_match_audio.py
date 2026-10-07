#!/usr/bin/env python3
"""贪吃蛇大作战 match audio (spec §7.1 / §7.3): the match beds, the lift layer and the game's 18 SFX,
all original offline synthesis owned by the project (no third-party samples).

  ~/kid-games-work/design-system/.venv-ds/bin/python tools/snake-battle/build_match_audio.py
  → site/snake-battle/assets/music/{pad-calm,pad-deep,perc-lift}.m4a   (AAC mono 40 kbps, 40 s loops)
  → site/snake-battle/assets/sfx/snake-*.m4a                         (AAC mono 64 kbps, 18 files)
  → ~/kid-games-work/snake-battle/audio/match-audio.json             (analysis: durations, peaks, seam checks)

Loops are composed on a CIRCULAR timeline (every note / reverb tail past the period wraps to the start, the
reverb is a circular FFT convolution), so sample P is exactly sample 0. Each loop file holds the period plus a
LOOP_PAD lead-in and tail of the same periodic signal; the runtime loops the window [LOOP_PAD, LOOP_PAD + P],
which stays seamless whether or not the decoder trims the AAC priming samples.

  pad-calm  — beat-less five-note pentatonic chords, one every 8 s, soft bells now and then (moon / mars / saturn)
  pad-deep  — the same an octave lower + a faint shimmer layer (jupiter / black hole)
  perc-lift — light percussion (shaker 8ths, wood block, soft low drum), 90 bpm = 60 beats per 40 s
  snake-boost-loop — band-passed noise sweeping once per second + a 110 Hz hum, 1.0 s period

SILENCE RULE: this script only writes files; it never plays anything.
"""
import json
import subprocess
import sys
from pathlib import Path

import numpy as np

SR = 44100
ROOT = Path(__file__).resolve().parents[2]
MUSIC = ROOT / 'site/snake-battle/assets/music'
SFX = ROOT / 'site/snake-battle/assets/sfx'
WORK = Path.home() / 'kid-games-work/snake-battle/audio'
LOOP_PAD = 0.25
P_MUSIC = 40.0
rng = np.random.default_rng(4040)


def hz(m): return 440.0 * 2 ** ((m - 69) / 12)
def T(d): return np.arange(int(round(d * SR))) / SR


# --------------------------------------------------------------------------- circular helpers
def cadd(buf, x, start, gain=1.0):
    """add x into the circular buffer at start seconds (wrapping)"""
    n = len(buf); s = int(round(start * SR)) % n
    k = len(x); i = 0
    while i < k:
        m = min(k - i, n - s)
        buf[s:s + m] += x[i:i + m] * gain
        i += m; s = 0


def cverb(x, seconds=3.0, wet=0.3, seed=7, damp=5000.0):
    """circular convolution reverb (exponentially decaying filtered noise IR)"""
    r = np.random.default_rng(seed); n = int(seconds * SR); t = np.arange(n) / SR
    ir = r.standard_normal(n) * np.exp(-t / (seconds / 6.5))
    F = np.fft.rfft(ir); f = np.fft.rfftfreq(n, 1 / SR); F *= 1 / (1 + (f / damp) ** 2); ir = np.fft.irfft(F, n)
    ir /= np.sqrt(np.sum(ir ** 2)) + 1e-9
    N = len(x)
    if n > N: ir = ir[:N]
    y = np.fft.irfft(np.fft.rfft(x) * np.fft.rfft(ir, N), N)
    return x * (1 - wet) + y * wet * 0.9


def clowpass(x, fc):
    F = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR)
    return np.fft.irfft(F / np.sqrt(1 + (f / fc) ** 4), len(x))


def cband_noise(n, lo, hi, seed):
    r = np.random.default_rng(seed); F = np.fft.rfft(r.standard_normal(n)); f = np.fft.rfftfreq(n, 1 / SR)
    F[(f < lo) | (f > hi)] = 0
    y = np.fft.irfft(F, n); return y / (np.max(np.abs(y)) + 1e-9)


def band_noise(d, lo, hi, seed=1): return cband_noise(int(round(d * SR)), lo, hi, seed)


# --------------------------------------------------------------------------- voices
def env(n, a, d, sustain=0.0, rel=None):
    t = np.arange(n) / SR
    e = np.minimum(1.0, t / max(a, 1e-4))
    e = e * (sustain + (1 - sustain) * np.exp(-np.maximum(0, t - a) / max(d, 1e-4)))
    if rel:
        k = min(int(rel * SR), n)
        if k > 0: e[-k:] *= np.linspace(1, 0, k) ** 2
    return e


def bell(f, dur, vel):
    t = T(dur); y = np.zeros(len(t))
    for r, a, d in [(1, 1, .9), (2.76, .4, .4), (5.4, .18, .22)]:
        if f * r < SR / 2.3: y += a * np.sin(2 * np.pi * f * r * t + r) * np.exp(-t / d)
    return y * np.minimum(1, t / 0.002) * vel


def kalimba(f, dur, vel):
    t = T(dur)
    y = np.sin(2 * np.pi * f * t) * np.exp(-t / 0.9) + 0.22 * np.sin(2 * np.pi * f * 5.95 * t) * np.exp(-t / 0.07) + 0.1 * np.sin(2 * np.pi * f * 2.0 * t) * np.exp(-t / 0.3)
    return y * np.minimum(1, t / 0.003) * vel


def padvoice(m, dur, vel, a=2.6, rel=3.2, seed=0):
    """warm detuned sine pair + soft 2nd/3rd partials, slow swell and long release"""
    t = T(dur); f = hz(m); ph = seed * 1.37
    y = np.zeros(len(t))
    for det in (-5, 5):
        ff = f * 2 ** (det / 1200)
        y += np.sin(2 * np.pi * ff * t + ph) + 0.16 * np.sin(2 * np.pi * 2 * ff * t + ph) + 0.05 * np.sin(2 * np.pi * 3 * ff * t)
    y *= 1 + 0.06 * np.sin(2 * np.pi * (0.11 + 0.03 * (seed % 3)) * t + seed)
    n = len(t); e = np.minimum(1, t / a) ** 1.5; k = int(rel * SR); e[-k:] *= np.linspace(1, 0, k) ** 2
    return y * e * vel


def sweep(f0, f1, dur, kind='sine'):
    t = T(dur); f = f0 * (f1 / f0) ** (t / dur); ph = 2 * np.pi * np.cumsum(f) / SR
    if kind == 'tri': return 2 / np.pi * np.arcsin(np.sin(ph))
    if kind == 'saw': return 2 * ((ph / (2 * np.pi)) % 1) - 1
    return np.sin(ph)


def adsr(n, a, d):
    t = np.arange(n) / SR; return np.minimum(1, t / max(a, 1e-4)) * np.exp(-np.maximum(0, t - a) / d)


def place(total, parts):
    """linear (non-circular) mix for SFX: parts = [(signal, start_s, gain)]"""
    y = np.zeros(int(round(total * SR)))
    for x, s, g in parts:
        i = int(round(s * SR)); k = min(len(x), len(y) - i)
        if k > 0: y[i:i + k] += x[:k] * g
    return y


# --------------------------------------------------------------------------- music beds
CHORDS = [  # five-note pentatonic voicings (C D E G A only): C6/9, Am(add11), G6sus, C/E, D9sus
    [48, 55, 62, 64, 69], [45, 52, 57, 60, 62], [43, 50, 55, 57, 62], [40, 52, 55, 60, 64], [38, 45, 50, 55, 60],
]
BELLS = [84, 86, 88, 91, 93, 96]


def bed(deep: bool):
    n = int(P_MUSIC * SR); buf = np.zeros(n)
    for i, ch in enumerate(CHORDS):
        t0 = i * 8.0
        for j, m in enumerate(ch):
            mm = m - (12 if deep else 0)
            v = (0.11 if j == 0 else 0.075) * (1.15 if deep and j == 0 else 1)
            cadd(buf, padvoice(mm, 11.5, v, a=2.4 + 0.3 * j, rel=3.5, seed=i * 5 + j), t0 - 0.6 + 0.12 * j)
        # sub root an octave down, very soft
        cadd(buf, padvoice(ch[0] - 12 - (12 if deep else 0), 10.5, 0.05, a=3.0, rel=3.5, seed=99 + i), t0)
    # occasional bells: 1–2 per chord, seeded, pentatonic
    br = np.random.default_rng(17 if deep else 11)
    for i in range(len(CHORDS)):
        for _ in range(int(br.integers(1, 3))):
            m = int(br.choice(BELLS)) - (12 if deep else 0)
            cadd(buf, bell(hz(m), 3.0, 0.05 if not deep else 0.04), i * 8.0 + float(br.uniform(1.5, 6.5)))
    if deep:   # shimmer: very high soft partials with slow independent tremolo
        t = np.arange(n) / SR
        for k, m in enumerate([88, 91, 93, 96]):
            rate = (k + 2) / P_MUSIC   # whole cycles per period → periodic
            buf += 0.008 * np.sin(2 * np.pi * hz(m) * t + k) * (0.5 + 0.5 * np.sin(2 * np.pi * rate * t + k * 1.7)) ** 2
    buf = clowpass(buf, 2400 if deep else 3200)
    return cverb(buf, seconds=3.6, wet=0.42, seed=3 if deep else 5)


def lift():
    n = int(P_MUSIC * SR); buf = np.zeros(n); beat = 60 / 90; e8 = beat / 2
    shaker = band_noise(0.09, 5000, 11000, 21) * adsr(int(round(0.09 * SR)), 0.006, 0.03)
    def wood(f): t = T(0.12); return (np.sin(2 * np.pi * f * t) + 0.4 * np.sin(2 * np.pi * f * 2.7 * t)) * adsr(len(t), 0.001, 0.025)
    def drum(): t = T(0.5); return sweep(95, 48, 0.5) * adsr(len(t), 0.003, 0.16)
    for b in range(60):
        t0 = b * beat; bar_pos = b % 4
        for k in range(2):
            acc = 1.0 if k == 0 else 0.6
            cadd(buf, shaker, t0 + k * e8 + (0.012 if k else 0), 0.16 * acc)
        if bar_pos in (0, 2): cadd(buf, drum(), t0, 0.5 if bar_pos == 0 else 0.36)
        if bar_pos == 1: cadd(buf, wood(820), t0 + e8, 0.17)
        if bar_pos == 3: cadd(buf, wood(1100), t0, 0.15); cadd(buf, wood(820), t0 + e8, 0.12)
        if b % 8 == 7: cadd(buf, wood(1240), t0 + e8 * 1.5, 0.1)
    return cverb(buf, seconds=1.2, wet=0.18, seed=9)


# --------------------------------------------------------------------------- SFX
PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21]


def boost_loop():
    n = SR   # 1.0 s period
    t = np.arange(n) / SR
    lo, hi = cband_noise(n, 600, 1300, 31), cband_noise(n, 1500, 3200, 32)
    w = 0.5 - 0.5 * np.cos(2 * np.pi * t)               # one sweep per period
    air = (lo * (1 - w) + hi * w) * 0.5
    hum = np.sin(2 * np.pi * 110 * t) * 0.32 + np.sin(2 * np.pi * 220 * t) * 0.1 + np.sin(2 * np.pi * 330 * t) * 0.04
    return air + hum


def sfx_bank():
    out = {}
    out['snake-boost-start'] = place(0.32, [(band_noise(0.3, 900, 4000, 2) * adsr(int(round(.3 * SR)), 0.03, 0.12), 0, 0.6), (sweep(220, 560, 0.24, 'tri') * adsr(int(round(.24 * SR)), 0.01, 0.12), 0, 0.5)])
    out['snake-kill'] = place(0.55, [(sweep(170, 55, 0.16) * adsr(int(round(.16 * SR)), 0.002, 0.07), 0, 0.9), (band_noise(0.06, 1500, 6000, 3) * adsr(int(round(.06 * SR)), 0.001, 0.015), 0, 0.5),
                                     (kalimba(hz(72), 0.4, 0.5), 0.05, 1), (kalimba(hz(76), 0.4, 0.5), 0.1, 1), (kalimba(hz(79), 0.45, 0.6), 0.15, 1), (bell(hz(91), 0.4, 0.15), 0.15, 1)])
    out['snake-out'] = place(0.8, [(sweep(392, 147, 0.6) * adsr(int(round(.6 * SR)), 0.01, 0.3) * (1 + 0.2 * np.sin(2 * np.pi * 9 * T(0.6))), 0, 0.6), (band_noise(0.3, 200, 900, 4) * adsr(int(round(.3 * SR)), 0.01, 0.1), 0, 0.3), (kalimba(hz(60), 0.6, 0.3), 0.32, 1)])
    out['snake-shield-up'] = place(0.7, [(sweep(523, 1046, 0.3, 'tri') * adsr(int(round(.3 * SR)), 0.01, 0.15), 0, 0.35), (bell(hz(84), 0.6, 0.35), 0.08, 1), (bell(hz(91), 0.55, 0.25), 0.18, 1)])
    out['snake-shield-break'] = place(0.7, [(band_noise(0.4, 3000, 12000, 5) * adsr(int(round(.4 * SR)), 0.001, 0.08), 0, 0.5)] + [(bell(hz(m), 0.5, 0.18), 0.01 * k, 1) for k, m in enumerate([93, 98, 101, 106])])
    out['snake-magnet-on'] = place(0.5, [(sweep(300, 620, 0.16, 'tri') * adsr(int(round(.16 * SR)), 0.005, 0.08), 0, 0.5), (sweep(450, 930, 0.16, 'tri') * adsr(int(round(.16 * SR)), 0.005, 0.08), 0.15, 0.5), (bell(hz(88), 0.3, 0.12), 0.28, 1)])
    out['snake-speed-on'] = place(0.6, [(kalimba(hz(72 + s), 0.3, 0.45), 0.055 * k, 1) for k, s in enumerate([0, 4, 7, 12])] + [(band_noise(0.35, 1500, 6000, 6) * adsr(int(round(.35 * SR)), 0.12, 0.08), 0.05, 0.25)])
    out['snake-meteor'] = place(0.8, [(bell(hz(84 + s), 0.5, 0.25), 0.05 * k, 1) for k, s in enumerate([0, 4, 7, 12, 16])] + [(band_noise(0.5, 6000, 12000, 7) * adsr(int(round(.5 * SR)), 0.05, 0.15), 0, 0.15)])
    t12 = T(1.2)
    out['snake-king'] = place(1.4, [(bell(hz(43), 1.3, 0.8), 0, 1), (np.sin(2 * np.pi * hz(31) * t12) * adsr(len(t12), 0.08, 0.6), 0, 0.6), (sweep(80, 60, 1.2) * adsr(len(t12), 0.02, 0.4), 0, 0.3)])
    t8 = T(0.8)
    out['snake-king-windup'] = place(0.9, [(sweep(60, 180, 0.8, 'saw') * np.minimum(1, t8 / 0.6) * np.exp(-np.maximum(0, t8 - 0.7) / 0.05), 0, 0.18), (np.sin(2 * np.pi * 45 * t8) * np.minimum(1, t8 / 0.3), 0, 0.35),
                                           (np.sin(2 * np.pi * 1400 * t8 + 3 * np.sin(2 * np.pi * 23 * t8)) * np.minimum(1, t8 / 0.8) * 0.5 * (1 + np.sin(2 * np.pi * 14 * t8)), 0, 0.06)])
    t6 = T(0.6)
    out['snake-king-charge'] = place(0.9, [(band_noise(0.6, 400, 2500, 8) * np.minimum(1, t6 / 0.05) * np.exp(-t6 / 0.3), 0, 0.6), (sweep(130, 45, 0.3) * adsr(int(round(.3 * SR)), 0.002, 0.12), 0.45, 0.9)])
    out['snake-gem-break'] = place(0.9, [(band_noise(0.3, 3500, 12000, 9) * adsr(int(round(.3 * SR)), 0.001, 0.06), 0, 0.45)] + [(bell(hz(m), 0.4, 0.15), 0.008 * k, 1) for k, m in enumerate([96, 101, 104])] + [(kalimba(hz(76 + s), 0.45, 0.5), 0.1 + 0.08 * k, 1) for k, s in enumerate([0, 3, 7])])
    def pop(f): t = T(0.07); return sweep(f * 1.6, f, 0.07) * adsr(len(t), 0.002, 0.02)
    out['snake-drop-burst'] = place(0.3, [(pop(hz(76 + PENTA[k * 2])), 0.055 * k, 0.7) for k in range(3)])
    for nn in (2, 3, 4, 5):
        out[f'snake-sting-{nn}'] = place(0.4 + 0.07 * nn + 0.5, [(kalimba(hz(72 + PENTA[k]), 0.6, 0.55 + 0.04 * k), 0.07 * k, 1) for k in range(nn)] + [(bell(hz(84 + PENTA[nn - 1]), 0.5, 0.12), 0.07 * (nn - 1), 1)])
    return out


# --------------------------------------------------------------------------- encode + check
def run(cmd): return subprocess.run(cmd, capture_output=True, text=True)
ENC = 'aac_at' if 'aac_at' in run(['ffmpeg', '-hide_banner', '-encoders']).stdout else 'aac'


def write_wav(path, y):
    import wave
    y16 = np.clip(y, -1, 1); y16 = (y16 * 32767).astype('<i2')
    with wave.open(str(path), 'wb') as w: w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(y16.tobytes())


def encode(y, out, kbps, lufs=None):
    WORK.mkdir(parents=True, exist_ok=True); wav = WORK / (out.stem + '.wav')
    write_wav(wav, y)
    af = []
    if lufs is not None:
        j = run(['ffmpeg', '-hide_banner', '-nostats', '-i', str(wav), '-af', f'loudnorm=I={lufs}:TP=-2:LRA=11:print_format=json', '-f', 'null', '-']).stderr
        j = json.loads(j[j.rindex('{'):j.rindex('}') + 1])
        af = ['-af', f"loudnorm=I={lufs}:TP=-2:LRA=11:measured_I={j['input_i']}:measured_TP={j['input_tp']}:measured_LRA={j['input_lra']}:measured_thresh={j['input_thresh']}:linear=true"]
    out.parent.mkdir(parents=True, exist_ok=True)
    r = run(['ffmpeg', '-y', '-hide_banner', '-i', str(wav), *af, '-c:a', ENC, '-b:a', f'{kbps}k', '-ac', '1', '-ar', str(SR), '-movflags', '+faststart', str(out)])
    if r.returncode: print(r.stderr[-800:]); sys.exit(1)


def decode(path):
    r = subprocess.run(['ffmpeg', '-hide_banner', '-i', str(path), '-f', 's16le', '-ac', '1', '-ar', str(SR), '-'], capture_output=True)
    return np.frombuffer(r.stdout, dtype='<i2').astype(np.float64) / 32768


def loop_file(sig, period):
    """period signal → file = [tail LOOP_PAD | period | head LOOP_PAD] (all from the same periodic signal)"""
    k = int(round(LOOP_PAD * SR))
    return np.concatenate([sig[-k:], sig, sig[:k]])


def seam_check(path, period):
    """after encoding: compare the decoded window boundary (what the runtime loops) to ordinary sample steps"""
    y = decode(path); a = int(round(LOOP_PAD * SR)); b = a + int(round(period * SR))
    if len(y) < b + 2: return {'ok': False, 'why': 'short'}
    jump = abs(y[b] - y[a])            # the value the loop plays after y[b-1] is y[a]; compare y[a] with y[b]
    steps = np.abs(np.diff(y[a:b]))
    return {'seamJump': round(float(abs(y[a] - y[b])), 5), 'medianStep': round(float(np.median(steps)), 5), 'p99Step': round(float(np.percentile(steps, 99)), 5),
            'ok': bool(jump <= max(4 * float(np.percentile(steps, 99)), 0.02)), 'decodedSec': round(len(y) / SR, 3)}


def main():
    report = {'music': {}, 'sfx': {}}
    for name, sig, lufs in [('pad-calm', bed(False), -22), ('pad-deep', bed(True), -22), ('perc-lift', lift(), -24)]:
        sig = sig / (np.max(np.abs(sig)) + 1e-9) * 0.8
        out = MUSIC / f'{name}.m4a'; encode(loop_file(sig, P_MUSIC), out, 40, lufs)   # 40 kbps: music total ≤ 1.7 MB (§8.11, QA r3)
        report['music'][name] = {'bytes': out.stat().st_size, 'periodSec': P_MUSIC, 'loopWindow': [LOOP_PAD, LOOP_PAD + P_MUSIC], **seam_check(out, P_MUSIC)}
    bl = boost_loop(); bl = bl / np.max(np.abs(bl)) * 0.7
    out = SFX / 'snake-boost-loop.m4a'; encode(loop_file(bl, 1.0), out, 64, -20)
    report['sfx']['snake-boost-loop'] = {'bytes': out.stat().st_size, 'periodSec': 1.0, 'loopWindow': [LOOP_PAD, LOOP_PAD + 1.0], **seam_check(out, 1.0)}
    for name, y in sfx_bank().items():
        y = y / (np.max(np.abs(y)) + 1e-9) * 0.89   # −1 dBFS peak before the encoder
        fade = int(0.01 * SR); y[-fade:] *= np.linspace(1, 0, fade)
        out = SFX / f'{name}.m4a'; encode(y, out, 64, None)
        d = decode(out)
        report['sfx'][name] = {'bytes': out.stat().st_size, 'sec': round(len(y) / SR, 3), 'decodedPeak': round(float(np.max(np.abs(d))), 3), 'rms': round(float(np.sqrt(np.mean(d ** 2))), 4)}
    report['totals'] = {'musicBytes': sum(v['bytes'] for v in report['music'].values()), 'sfxBytes': sum(v['bytes'] for v in report['sfx'].values()), 'sfxCount': len(report['sfx']), 'encoder': ENC}
    WORK.mkdir(parents=True, exist_ok=True)
    (WORK / 'match-audio.json').write_text(json.dumps(report, indent=1, ensure_ascii=False))
    print(json.dumps(report['totals']))
    bad = [k for g in ('music', 'sfx') for k, v in report[g].items() if 'ok' in v and not v['ok']]
    print('seams', 'FAIL ' + ','.join(bad) if bad else 'ok')


if __name__ == '__main__':
    main()
