#!/usr/bin/env python3
"""星晶消消乐 route-map music (spec §7.3): an original synthesized loop, owned by the project.

  ~/kid-games-work/design-system/.venv-ds/bin/python tools/emoji-match/build_music.py
  → site/emoji-match/assets/music/route-loop.m4a   (AAC-LC stereo 80 kbps, ≈0.63 MB)
  → ~/kid-games-work/emoji-match/audio/route-loop.wav + .json (analysis only — never played here)

Design: 92 BPM, 4/4, 24 bars (≈62.6 s), C major pentatonic melody over C–Am–F–G (two bars each,
three cycles: theme → lifted variation → calm, sparse ending), FM "xylophone" pluck lead, two-voice
detuned sine pad, soft sine bass, off-beat shaker, a few high "star" bells. The last bar is a long
fading chord and beat 1 rises from near silence, so the WebKit <audio loop> seam is inaudible
(review D21); the mix is rendered twice and the second pass kept, so the reverb tail wraps into the
start; 40 ms crossfade at the seam; −20 LUFS integrated, true peak ≤ −1.5 dBTP (ffmpeg loudnorm,
linear two-pass). Deterministic: no randomness except a seeded RNG for the star bells.
SILENCE RULE: this script only writes files; it never plays audio.
"""
import json
import os
import subprocess
import sys
from pathlib import Path

import numpy as np
from scipy.signal import fftconvolve, butter, sosfilt

SR = 44100
BPM = 92
BEAT = 60.0 / BPM
BAR = 4 * BEAT
E8 = BEAT / 2           # one eighth note
BARS = 24
L = int(round(BARS * BAR * SR))
ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'site/emoji-match/assets/music/route-loop.m4a'
WORK = Path.home() / 'kid-games-work/emoji-match/audio'

def hz(m): return 440.0 * 2 ** ((m - 69) / 12)

# --------------------------------------------------------------------------- score
CHORDS = ['C', 'C', 'Am', 'Am', 'F', 'F', 'G', 'G'] * 3
CHORD_NOTES = {'C': [48, 55, 64, 67], 'Am': [45, 52, 60, 64], 'F': [41, 48, 57, 60], 'G': [43, 50, 59, 62]}
# melody: per bar, (start in eighths, midi, length in eighths, velocity)
C5, D5, E5, G5, A5, C6, D6, E6, G4 = 72, 74, 76, 79, 81, 84, 86, 88, 67
MEL = [
    # cycle A — the theme
    [(2, E5, 1, .58), (3, G5, 1, .66), (4, A5, 2, .76), (6, G5, 2, .72)],   # beat 1 rests: the seam rises from near silence
    [(0, D5, 2, .7), (2, E5, 2, .72), (4, G5, 4, .8)],
    [(0, A5, 2, .8), (2, C6, 2, .78), (4, A5, 1, .66), (5, G5, 1, .62), (6, E5, 2, .72)],
    [(0, G5, 3, .74), (3, E5, 1, .6), (4, D5, 4, .72)],
    [(0, C5, 2, .7), (2, D5, 2, .7), (4, E5, 2, .74), (6, G5, 2, .76)],
    [(0, A5, 3, .8), (3, G5, 1, .62), (4, E5, 4, .74)],
    [(0, D5, 2, .7), (2, E5, 1, .64), (3, G5, 1, .66), (4, A5, 2, .76), (6, G5, 2, .7)],
    [(0, E5, 2, .72), (2, D5, 2, .66)],
    # cycle B — lifted variation
    [(0, G5, 1, .7), (1, A5, 1, .7), (2, C6, 2, .82), (4, A5, 2, .72), (6, G5, 2, .7)],
    [(0, E5, 3, .74), (3, G5, 1, .64), (4, C6, 4, .82)],
    [(0, E6, 2, .78), (2, D6, 2, .74), (4, C6, 2, .72), (6, A5, 2, .7)],
    [(0, C6, 3, .76), (3, A5, 1, .62), (4, G5, 4, .74)],
    [(0, A5, 2, .74), (2, C6, 2, .76), (4, D6, 2, .8), (6, C6, 2, .72)],
    [(0, A5, 3, .74), (3, G5, 1, .6), (4, A5, 4, .74)],
    [(0, G5, 2, .72), (2, A5, 1, .64), (3, G5, 1, .62), (4, E5, 2, .7), (6, D5, 2, .68)],
    [(0, D5, 2, .68), (2, E5, 2, .7), (4, G5, 4, .76)],
    # cycle C — calm, sparse, fading towards the seam
    [(0, E5, 4, .62), (4, G5, 4, .6)],
    [(0, C6, 8, .62)],
    [(0, A5, 4, .58), (4, E5, 4, .56)],
    [(0, G5, 8, .56)],
    [(0, A5, 4, .52), (4, C6, 4, .5)],
    [(0, G5, 8, .48)],
    [(0, D5, 4, .42), (4, E5, 4, .38)],
    [(0, G4, 8, .26)],
]
assert len(MEL) == BARS and len(CHORDS) == BARS

# --------------------------------------------------------------------------- voices
def env(n, a, d, sustain=0.0, rel=None):
    t = np.arange(n) / SR
    e = np.minimum(1.0, t / max(a, 1e-4))
    e = e * (sustain + (1 - sustain) * np.exp(-np.maximum(0, t - a) / max(d, 1e-4)))
    if rel:
        k = min(int(rel * SR), n)
        if k > 0:
            e[-k:] *= np.linspace(1, 0, k) ** 2
    return e

def pluck(f, dur, vel):
    """FM xylophone: bright mallet attack (index decays fast), wooden body partial."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    idx = 2.4 * np.exp(-t / 0.045)
    car = np.sin(2 * np.pi * f * t + idx * np.sin(2 * np.pi * f * 3.5 * t))
    body = 0.32 * np.sin(2 * np.pi * f * 4.0 * t) * np.exp(-t / 0.05)
    y = (car * env(n, 0.002, 0.42) + body) * vel
    return y

def bell(f, dur, vel):
    n = int(dur * SR)
    t = np.arange(n) / SR
    y = np.zeros(n)
    for r, a, d in [(1, 1, .9), (2.76, .4, .4), (5.4, .18, .22)]:
        if f * r < SR / 2.3:
            y += a * np.sin(2 * np.pi * f * r * t + r) * np.exp(-t / d)
    return y * np.minimum(1, t / 0.002) * vel

def pad(notes, dur, vel, a=0.55, rel=0.7):
    n = int(dur * SR)
    t = np.arange(n) / SR
    L_, R_ = np.zeros(n), np.zeros(n)
    for m in notes[1:]:
        f = hz(m)
        for det, side in ((-4, 0), (4, 1)):   # two voices, ±4 cents, one per side
            ff = f * 2 ** (det / 1200)
            v = np.sin(2 * np.pi * ff * t) + 0.18 * np.sin(2 * np.pi * 2 * ff * t)
            v *= 1 + 0.05 * np.sin(2 * np.pi * 0.23 * t + side)
            (L_ if side == 0 else R_)[:] += v
    e = env(n, a, 9.0, sustain=0.85, rel=rel) * vel
    return L_ * e, R_ * e

def bass(m, dur, vel):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = hz(m)
    y = np.sin(2 * np.pi * f * t) + 0.25 * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t / 0.15)
    return y * env(n, 0.012, 0.55, sustain=0.25, rel=0.12) * vel

rng = np.random.default_rng(2026)
SHK = butter(4, [5500, 11000], btype='band', fs=SR, output='sos')
def shaker(vel):
    n = int(0.09 * SR)
    t = np.arange(n) / SR
    x = rng.standard_normal(n) * np.exp(-t / 0.022) * np.minimum(1, t / 0.003)
    return sosfilt(SHK, x) * vel

# --------------------------------------------------------------------------- mix one loop (dry)
def add(buf, x, start, gain=1.0):
    s = int(round(start * SR))
    if s >= buf.shape[1]:
        return
    k = min(len(x) if x.ndim == 1 else x.shape[-1], buf.shape[1] - s)
    if x.ndim == 1:
        buf[0, s:s + k] += x[:k] * gain
        buf[1, s:s + k] += x[:k] * gain
    else:
        buf[:, s:s + k] += x[:, :k] * gain

def pan(x, p):
    """equal-power pan, p ∈ [-1, 1]"""
    a = (p + 1) * np.pi / 4
    return np.vstack([x * np.cos(a), x * np.sin(a)])

dry = np.zeros((2, L))
for b in range(BARS):
    t0 = b * BAR
    ch = CHORDS[b]
    # pad: one swell per 2-bar chord; the last bar holds and fades into the seam
    if b % 2 == 0:
        last = b == BARS - 2
        dur = 2 * BAR + (0.0 if last else 0.6)
        pl, pr = pad(CHORD_NOTES[ch], dur, 0.075 if not last else 0.07, a=0.9 if b == 0 else 0.5, rel=2 * BAR if last else 0.7)
        add(dry, np.vstack([pl, pr]), t0)
    # bass: beats 1 and 3 (calm cycle: beat 1 only; silent in the fading bar)
    if b < BARS - 1:
        beats = [2] if b == 0 else [0] if b >= 16 else [0, 2]   # bar 1: no downbeat (the seam rises from silence)
        for bt in beats:
            add(dry, pan(bass(CHORD_NOTES[ch][0] - 12 + 12, BEAT * 1.6, 0.16 if b >= 16 else 0.2), 0), t0 + bt * BEAT)
    # melody
    for (st, m, ln, v) in MEL[b]:
        y = pluck(hz(m), ln * E8 + 0.9, v * 0.42)
        add(dry, pan(y, -0.12 + 0.08 * ((m % 5) - 2) / 2), t0 + st * E8)
    # shaker: off-beats, not in the first beat (seam fade-in) nor in the last two bars
    if 0 < b < BARS - 2:
        for k in (1, 3, 5, 7):
            add(dry, pan(shaker(0.05 if k % 4 == 3 else 0.035), 0.35), t0 + k * E8)
    # star bells: a few, seeded
    if b % 2 == 1 and b < BARS - 2 and rng.random() < 0.7:
        m = int(rng.choice([96, 100, 103, 105]))
        add(dry, pan(bell(hz(m), 2.2, 0.05), float(rng.uniform(-0.7, 0.7))), t0 + int(rng.integers(2, 7)) * E8)

# --------------------------------------------------------------------------- reverb (render twice, keep pass 2)
def ir(seconds=2.4, seed=7):
    r = np.random.default_rng(seed)
    n = int(seconds * SR)
    t = np.arange(n) / SR
    decay = np.exp(-t / (seconds / 6.9))
    lp = butter(2, 5200, btype='low', fs=SR, output='sos')
    out = []
    for c in range(2):
        x = r.standard_normal(n) * decay
        x = sosfilt(lp, x)
        x[: int(0.012 * SR)] *= np.linspace(0, 1, int(0.012 * SR))
        out.append(x / np.sqrt(np.sum(x ** 2)))
    return np.vstack(out)

IR = ir()
two = np.concatenate([dry, dry], axis=1)
wet = np.vstack([fftconvolve(two[c], IR[c])[: 2 * L] for c in range(2)])
mix = two * 0.82 + wet * 0.42
loop = mix[:, L:2 * L].copy()
# 40 ms crossfade at the seam: blend the loop's tail into pass-1's end so sample L-1 → 0 is continuous
xf = int(0.04 * SR)
w = np.linspace(0, 1, xf)
loop[:, -xf:] = loop[:, -xf:] * (1 - w) + mix[:, L - xf:L] * w   # pass-1's end flows into pass-2's start
# gentle bus glue: soft clip
loop = np.tanh(loop * 1.2) / 1.2

WORK.mkdir(parents=True, exist_ok=True)
wav = WORK / 'route-loop.wav'
pcm = np.clip(loop.T, -1, 1)
import wave
with wave.open(str(wav), 'wb') as f:
    f.setnchannels(2); f.setsampwidth(2); f.setframerate(SR)
    f.writeframes((pcm * 32767).astype('<i2').tobytes())

# --------------------------------------------------------------------------- loudness (-20 LUFS, TP -1.5) + AAC
def run(cmd):
    return subprocess.run(cmd, check=True, capture_output=True, text=True)

meas = run(['ffmpeg', '-hide_banner', '-nostats', '-i', str(wav), '-af', 'loudnorm=I=-20:TP=-1.5:LRA=11:print_format=json', '-f', 'null', '-'])
j = json.loads(meas.stderr[meas.stderr.rindex('{'):meas.stderr.rindex('}') + 1])
OUT.parent.mkdir(parents=True, exist_ok=True)
af = (f"loudnorm=I=-20:TP=-1.5:LRA=11:measured_I={j['input_i']}:measured_TP={j['input_tp']}:"
      f"measured_LRA={j['input_lra']}:measured_thresh={j['input_thresh']}:offset={j['target_offset']}:linear=true,aresample=44100")
enc = 'aac_at' if 'aac_at' in run(['ffmpeg', '-hide_banner', '-encoders']).stdout else 'aac'
run(['ffmpeg', '-y', '-hide_banner', '-i', str(wav), '-af', af, '-c:a', enc, '-b:a', '80k', '-ac', '2', '-movflags', '+faststart', str(OUT)])
check = run(['ffmpeg', '-hide_banner', '-nostats', '-i', str(OUT), '-af', 'ebur128=peak=true', '-f', 'null', '-'])
tail = check.stderr[check.stderr.rindex('Summary:'):]
info = {
    'file': str(OUT.relative_to(ROOT)), 'bytes': OUT.stat().st_size, 'seconds': round(L / SR, 3), 'bars': BARS, 'bpm': BPM,
    'encoder': enc, 'measured_before': {k: j[k] for k in ('input_i', 'input_tp', 'input_lra')},
    'seam_rms_db': round(float(20 * np.log10(np.sqrt(np.mean(loop[:, -int(0.25 * SR):] ** 2)) + 1e-9)), 1),
    'body_rms_db': round(float(20 * np.log10(np.sqrt(np.mean(loop ** 2)) + 1e-9)), 1),
    'ebur128': ' '.join(tail.split()),
}
(WORK / 'route-loop.json').write_text(json.dumps(info, ensure_ascii=False, indent=1))
print(json.dumps(info, ensure_ascii=False, indent=1))
