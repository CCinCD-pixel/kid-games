#!/usr/bin/env python3
"""贪吃蛇大作战 menu music (spec §7.3): an original synthesized loop, owned by the project.

  ~/kid-games-work/design-system/.venv-ds/bin/python tools/snake-battle/build_music.py
  → site/snake-battle/assets/music/menu.m4a   (AAC-LC stereo 56 kbps, ≈0.9 MB, 126.7 s)
  → ~/kid-games-work/snake-battle/audio/menu.wav + .json (analysis only — never played here)

Design (review D20: a 48 s loop wears out over 6 weeks): 72 BPM, 4/4, 38 bars in A–B–A′ form —
A (16 bars, C major pentatonic theme on I–vi–IV–V, kalimba lead + marimba arpeggios + soft pad),
B (12 bars, G major pentatonic second theme with celesta doubling), A′ (10 bars, the theme thinned
out and settling). Bar 1 rises from near silence and the last bar is a held, fading chord, so the
<audio loop> seam is inaudible; the mix is rendered twice and pass 2 kept (reverb tail wraps into
the start) with a 40 ms crossfade; −20 LUFS integrated, true peak ≤ −1.5 dBTP.
Pipeline shared with tools/emoji-match/build_music.py. SILENCE RULE: only writes files, never plays.
"""
import json
import os
import subprocess
import sys
from pathlib import Path

import numpy as np
from scipy.signal import fftconvolve, butter, sosfilt

SR = 44100
BPM = 72
BEAT = 60.0 / BPM
BAR = 4 * BEAT
E8 = BEAT / 2
ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'site/snake-battle/assets/music/menu.m4a'
WORK = Path.home() / 'kid-games-work/snake-battle/audio'

def hz(m): return 440.0 * 2 ** ((m - 69) / 12)

# --------------------------------------------------------------------------- score
CHORD_NOTES = {'C': [48, 55, 64, 67], 'Am': [45, 52, 60, 64], 'F': [41, 48, 57, 60], 'G': [43, 50, 59, 62],
               'Em': [40, 47, 55, 59], 'D': [38, 45, 54, 57]}
C5, D5, E5, G5, A5, C6, D6, E6 = 72, 74, 76, 79, 81, 84, 86, 88
G4, A4, B4, B5 = 67, 69, 71, 83
P1 = [[(2, G5, 2, .6), (4, A5, 1, .66), (5, G5, 1, .6), (6, E5, 2, .68)],
      [(0, C6, 3, .76), (3, A5, 1, .6), (4, G5, 4, .7)],
      [(0, A5, 2, .72), (2, G5, 1, .62), (3, E5, 1, .6), (4, D5, 2, .66), (6, E5, 2, .68)],
      [(0, G5, 6, .7)]]
P1b = [[(0, E5, 2, .66), (2, G5, 2, .68), (4, A5, 1, .7), (5, G5, 1, .62), (6, E5, 2, .68)]] + P1[1:3] + [[(0, G5, 4, .7), (4, A5, 1, .55), (5, G5, 1, .52), (6, D5, 2, .6)]]
P2 = [[(0, E5, 1, .66), (1, G5, 1, .68), (2, C6, 2, .78), (4, D6, 2, .76), (6, C6, 2, .7)],
      [(0, A5, 3, .74), (3, G5, 1, .6), (4, E5, 4, .7)],
      [(0, D5, 2, .66), (2, E5, 2, .68), (4, G5, 2, .72), (6, A5, 2, .74)],
      [(0, G5, 4, .72), (4, D5, 4, .64)]]
P2end = P2[:3] + [[(0, C5, 8, .66)]]
B1 = [[(0, B4, 2, .62), (2, D5, 2, .66), (4, E5, 2, .7), (6, D5, 2, .64)],
      [(0, G5, 4, .74), (4, E5, 4, .66)],
      [(0, E5, 2, .66), (2, G5, 1, .68), (3, A5, 1, .7), (4, G5, 2, .7), (6, E5, 2, .64)],
      [(0, D5, 6, .66)]]
B2 = [[(0, D5, 1, .64), (1, E5, 1, .66), (2, G5, 2, .74), (4, B5, 2, .78), (6, A5, 2, .72)],
      [(0, G5, 3, .72), (3, E5, 1, .6), (4, D5, 4, .66)],
      [(0, E5, 2, .66), (2, D5, 2, .64), (4, B4, 2, .62), (6, A4, 2, .6)],
      [(0, A4, 4, .62), (4, D5, 4, .66)]]
B3 = B1[:3] + [[(0, D5, 2, .64), (2, E5, 2, .66), (4, A5, 4, .7)]]
Ap = [[(2, G5, 2, .56), (6, E5, 2, .6)], [(0, C6, 4, .66), (4, G5, 4, .6)], [(0, A5, 4, .62), (4, D5, 4, .58)], [(0, G5, 8, .6)],
      [(0, E5, 2, .58), (2, G5, 2, .6), (4, C6, 4, .66)], [(0, A5, 4, .6), (4, E5, 4, .56)], [(0, D5, 4, .54), (4, G5, 4, .52)], [(0, E5, 8, .5)],
      [(0, A5, 4, .44), (4, G5, 4, .4)], [(0, E5, 8, .3)]]
MEL = P1 + P2 + P1b + P2end + B1 + B2 + B3 + Ap
CHORDS = ['C', 'Am', 'F', 'G'] * 4 + ['G', 'Em', 'C', 'D'] * 3 + ['C', 'Am', 'F', 'G'] * 2 + ['F', 'C']
SECTION = ['A'] * 16 + ['B'] * 12 + ['Ap'] * 10
BARS = len(MEL)
assert BARS == len(CHORDS) == len(SECTION) == 38
L = int(round(BARS * BAR * SR))

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


def kalimba(f, dur, vel):
    """tine: fundamental + a fast-decaying inharmonic overtone and a soft thumb click"""
    n = int(dur * SR); t = np.arange(n) / SR
    y = np.sin(2 * np.pi * f * t) * np.exp(-t / 0.9) + 0.22 * np.sin(2 * np.pi * f * 5.95 * t) * np.exp(-t / 0.07) + 0.1 * np.sin(2 * np.pi * f * 2.0 * t) * np.exp(-t / 0.3)
    return y * np.minimum(1, t / 0.003) * vel

def marimba(f, dur, vel):
    n = int(dur * SR); t = np.arange(n) / SR
    y = np.sin(2 * np.pi * f * t) * np.exp(-t / 0.42) + 0.28 * np.sin(2 * np.pi * f * 4.0 * t) * np.exp(-t / 0.05)
    return y * np.minimum(1, t / 0.004) * vel

def celesta(f, dur, vel):
    n = int(dur * SR); t = np.arange(n) / SR
    y = np.zeros(n)
    for r, a, d in [(1, 1, 1.1), (3.0, .35, .35), (4.6, .15, .18)]:
        if f * r < SR / 2.3: y += a * np.sin(2 * np.pi * f * r * t) * np.exp(-t / d)
    return y * np.minimum(1, t / 0.002) * vel

rng = np.random.default_rng(72)
def add(buf, x, start, gain=1.0):
    s = int(round(start * SR))
    if s >= buf.shape[1]: return
    k = min(len(x) if x.ndim == 1 else x.shape[-1], buf.shape[1] - s)
    if x.ndim == 1:
        buf[0, s:s + k] += x[:k] * gain; buf[1, s:s + k] += x[:k] * gain
    else:
        buf[:, s:s + k] += x[:, :k] * gain

def pan(x, p):
    a = (p + 1) * np.pi / 4
    return np.vstack([x * np.cos(a), x * np.sin(a)])

dry = np.zeros((2, L))
for b in range(BARS):
    t0 = b * BAR; ch = CHORDS[b]; sec = SECTION[b]; last = b == BARS - 1
    # pad: one swell per bar (the last bar holds and fades into the seam; bar 1 rises from silence)
    pl, pr = pad(CHORD_NOTES[ch], BAR + (0.0 if last else 0.5), 0.06 if sec != 'Ap' else 0.05, a=1.6 if b == 0 else 0.6, rel=BAR if last else 0.6)
    add(dry, np.vstack([pl, pr]), t0)
    # bass: beat 1 (+ soft beat 3 in A/B); none in the first beat (seam) or the fading bar
    if 0 < b < BARS - 1:
        add(dry, pan(bass(CHORD_NOTES[ch][0] - 12 + 12, BEAT * 1.8, 0.17), 0), t0)
        if sec != 'Ap': add(dry, pan(bass(CHORD_NOTES[ch][0] + 7 - 12 + 12, BEAT * 1.4, 0.1), 0), t0 + 2 * BEAT)
    # marimba arpeggio on chord tones (right); thinner in A′, absent in the last two bars
    if b < BARS - 2:
        tones = [CHORD_NOTES[ch][1] + 12, CHORD_NOTES[ch][2] + 12, CHORD_NOTES[ch][3] + 12, CHORD_NOTES[ch][2] + 12]
        steps = (0, 2, 4, 6) if sec != 'Ap' else (0, 4)
        for k, e in enumerate(steps):
            if b == 0 and e < 2: continue
            add(dry, pan(marimba(hz(tones[k % 4]), 1.2, 0.2 if sec == 'B' else 0.17), 0.45), t0 + e * E8)
    # kalimba lead (left of centre)
    for (st, m, ln, v) in MEL[b]:
        add(dry, pan(kalimba(hz(m), ln * E8 + 1.0, v * 0.5), -0.18), t0 + st * E8)
        if sec == 'B' and st == 0: add(dry, pan(celesta(hz(m + 12), 2.4, v * 0.09), 0.3), t0 + st * E8)
    # a few high star bells in A, seeded
    if sec == 'A' and b % 4 == 3 and rng.random() < 0.8:
        add(dry, pan(bell(hz(int(rng.choice([96, 100, 103]))), 2.2, 0.045), float(rng.uniform(-0.6, 0.6))), t0 + int(rng.integers(3, 7)) * E8)

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
wav = WORK / 'menu.wav'
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
run(['ffmpeg', '-y', '-hide_banner', '-i', str(wav), '-af', af, '-c:a', enc, '-b:a', '56k', '-ac', '2', '-movflags', '+faststart', str(OUT)])
check = run(['ffmpeg', '-hide_banner', '-nostats', '-i', str(OUT), '-af', 'ebur128=peak=true', '-f', 'null', '-'])
tail = check.stderr[check.stderr.rindex('Summary:'):]
info = {
    'file': str(OUT.relative_to(ROOT)), 'bytes': OUT.stat().st_size, 'seconds': round(L / SR, 3), 'bars': BARS, 'bpm': BPM,
    'encoder': enc, 'measured_before': {k: j[k] for k in ('input_i', 'input_tp', 'input_lra')},
    'seam_rms_db': round(float(20 * np.log10(np.sqrt(np.mean(loop[:, -int(0.25 * SR):] ** 2)) + 1e-9)), 1),
    'body_rms_db': round(float(20 * np.log10(np.sqrt(np.mean(loop ** 2)) + 1e-9)), 1),
    'ebur128': ' '.join(tail.split()),
}
(WORK / 'menu.json').write_text(json.dumps(info, ensure_ascii=False, indent=1))
print(json.dumps(info, ensure_ascii=False, indent=1))
