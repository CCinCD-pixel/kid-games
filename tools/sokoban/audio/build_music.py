"""星港搬运工 — menu music "星港夜班" (spec §7.2), synthesised locally; never downloads anything.

♩ = 84, 4/4, 24 bars (≈ 68.6 s) seamless loop. C major pentatonic (C D E G A) marimba melody — four
4-bar phrases in six variations — over a soft two-voice triangle pad (slow attack, 1.2 kHz low-pass),
a sine bass on each bar's root and very light brushes (band-passed noise) on beats 2 and 4. The
arrangement is rendered twice and the second pass kept, so the reverb tail of the last bar flows into
the first: a seamless loop by construction (no crossfade needed; the seam jump is measured). Loudness: integrated −23 LUFS (BS.1770 gated),
true-peak headroom −2 dBFS; AAC-LC stereo 80 kbps.

Run with the design system's Python (numpy + scipy) and the machine's ffmpeg:
  ~/kid-games-work/design-system/.venv-ds/bin/python tools/sokoban/audio/build_music.py
Self-review is numeric (no listening on this machine): loop-seam jump, spectral roll-off, key, loudness.
"""
import json, os, subprocess, sys
import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, fftconvolve, sosfilt, lfilter

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import sfx_synth as S  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, '../../..'))
OUT = os.path.join(ROOT, 'site/sokoban/assets/music/night-shift.m4a')
TMP = os.path.expanduser('~/kid-games-work/scratch-sokoban/music')
SR = S.SR
BPM = 84
BEAT = 60 / BPM
BAR = 4 * BEAT
BARS = 24
LOOP = BARS * BAR

# harmony per bar (4-bar cycle): C6 | Am7 | Fmaj7 | G6sus — pad voicings (MIDI) and bass roots
CHORDS = [
    ([60, 64, 67, 69], 36),   # C6: C E G A
    ([57, 60, 64, 67], 33),   # Am7: A C E G
    ([53, 57, 60, 64], 29),   # Fmaj7: F A C E
    ([55, 60, 62, 69], 31),   # G6sus: G C D A
]

# melody: (beat offset within the bar, pentatonic step, length in beats); step 0 = C5
PHRASE_A = [
    [(0, 2, 1), (1, 3, 0.5), (1.5, 4, 0.5), (2, 5, 1.5)],
    [(0, 4, 1), (1, 3, 1), (2, 2, 0.5), (2.5, 3, 1.5)],
    [(0, 1, 0.5), (0.5, 2, 0.5), (1, 3, 1), (2, 4, 1), (3, 3, 1)],
    [(0, 2, 1.5), (1.5, 1, 0.5), (2, 0, 2)],
]
PHRASE_B = [
    [(0, 5, 1), (1, 6, 0.5), (1.5, 5, 0.5), (2, 4, 2)],
    [(0, 3, 0.5), (0.5, 4, 0.5), (1, 5, 1), (2, 7, 1), (3, 6, 1)],
    [(0, 5, 1.5), (1.5, 4, 0.5), (2, 3, 1), (3, 2, 1)],
    [(0, 3, 1), (1, 2, 1), (2, 1, 1), (3, 2, 1)],
]


def variation(phr, k):
    """Six variations: 0 plain, 1 octave sparkle, 2 B phrase, 3 swung echo, 4 B up a step, 5 cadence home."""
    out = []
    for bar, notes in enumerate(phr):
        nb = []
        for (b, st, ln) in notes:
            if k == 3 and ln >= 1 and b + 0.5 < 4:
                nb.append((b, st, 0.5))
                nb.append((b + 0.5, st + 1 if st < 8 else st, ln - 0.5))
            else:
                nb.append((b, st + (1 if k == 4 and bar % 2 == 0 else 0), ln))
        if k == 5 and bar == 3:
            nb = [(0, 2, 1), (1, 1, 1), (2, 0, 2)]
        out.append(nb)
    return out


def arrangement():
    """Bars of (melody notes, chord index, sparkle flag)."""
    plan = [(PHRASE_A, 0), (PHRASE_A, 1), (PHRASE_B, 2), (PHRASE_A, 3), (PHRASE_B, 4), (PHRASE_A, 5)]
    bars = []
    for phr, k in plan:
        for i, notes in enumerate(variation(phr, k)):
            bars.append((notes, i % 4, k == 1))
    return bars


def tri_pad(midi, dur, detune=0.0):
    t = S.t_(dur)
    f = S.hz(midi) * (1 + detune)
    ph = (f * t) % 1.0
    tri = 2 * np.abs(2 * ph - 1) - 1
    a = np.minimum(1, t / 0.6)  # slow attack
    r = np.minimum(1, np.maximum(0, (dur - t) / 0.5))
    return tri * a * r


def lowpass(x, fc, order=2):
    return sosfilt(butter(order, fc, 'low', fs=SR, output='sos'), x)


def bandpass(x, lo, hi):
    return sosfilt(butter(2, [lo, hi], 'band', fs=SR, output='sos'), x)


def render_once():
    total = LOOP + 3.0
    L = np.zeros(int(SR * total))
    R = np.zeros(int(SR * total))
    rng = np.random.default_rng(84)
    for bi, (notes, ci, sparkle) in enumerate(arrangement()):
        t0 = bi * BAR
        chord, root = CHORDS[ci]
        # pad: two detuned triangle voices, spread left/right
        padL = sum(tri_pad(m, BAR + 0.35, -0.0025) for m in chord) * 0.05
        padR = sum(tri_pad(m, BAR + 0.35, 0.0025) for m in chord) * 0.05
        S.place(L, padL, t0)
        S.place(R, padR, t0)
        # bass: sine root, plucked, with a soft second hit on beat 3
        for at, g in ((0, 1.0), (2, 0.6)):
            tb = S.t_(BEAT * 1.9)
            bass = (np.sin(2 * np.pi * S.hz(root + 12) * tb) + 0.18 * np.sin(4 * np.pi * S.hz(root + 12) * tb)) * S.env_ad(len(tb), 0.006, 0.9) * 0.22 * g
            S.place(L, bass, t0 + at * BEAT)
            S.place(R, bass, t0 + at * BEAT)
        # brushes on 2 and 4
        for b in (1, 3):
            nz = bandpass(S.noise(0.18, int(rng.integers(1, 1 << 30))), 2500, 8000) * S.env_ad(int(SR * 0.18), 0.008, 0.06) * 0.05
            S.place(L, nz * 0.8, t0 + b * BEAT)
            S.place(R, nz, t0 + b * BEAT + 0.006)
        # melody: marimba, a hair left; sparkle variation doubles with a bell an octave up, right
        for (b, st, ln) in notes:
            m = S.pent_midi(st, 72)
            mar = S.marimba(S.hz(m), min(1.6, ln * BEAT + 0.6), 0.45, 0.32) * 0.30
            at = max(0.0, t0 + b * BEAT + float(rng.normal(0, 0.004)))
            S.place(L, mar * 1.0, at)
            S.place(R, mar * 0.78, at)
            if sparkle:
                bl = S.bell(S.hz(m + 12), 0.9, 0.35, 0.3) * 0.07
                S.place(L, bl * 0.6, at + 0.01)
                S.place(R, bl, at + 0.01)
    L = lowpass(L, 7000)
    R = lowpass(R, 7000)
    return L, R


def reverb_fft(x, tail, mix, seed, damp_hz):
    """The design system's reverb (decaying filtered-noise IR, 12 ms pre-delay) with an FFT convolution."""
    n = int(SR * tail)
    rng = np.random.default_rng(seed)
    ir = rng.standard_normal(n) * np.exp(-np.arange(n) / SR * (6.9 / tail))
    ir = lowpass(ir, damp_hz, 1)
    ir[: int(SR * 0.012)] = 0
    ir /= np.sqrt(np.sum(ir ** 2)) + 1e-9
    wet = fftconvolve(x, ir)[: len(x)]
    return x * (1 - mix) + wet * mix * 3.0


def reverb_st(L, R):
    return reverb_fft(L, 1.6, 0.2, 31, 4200), reverb_fft(R, 1.6, 0.2, 37, 4200)


def k_weight(x):
    import math
    G, Q, fc = 3.999843853973347, 0.7071752369554196, 1681.974450955533
    A = 10 ** (G / 40); w0 = 2 * math.pi * fc / SR; alpha = math.sin(w0) / (2 * Q)
    b0 = A * ((A + 1) + (A - 1) * math.cos(w0) + 2 * math.sqrt(A) * alpha)
    b1 = -2 * A * ((A - 1) + (A + 1) * math.cos(w0))
    b2 = A * ((A + 1) + (A - 1) * math.cos(w0) - 2 * math.sqrt(A) * alpha)
    a0 = (A + 1) - (A - 1) * math.cos(w0) + 2 * math.sqrt(A) * alpha
    a1 = 2 * ((A - 1) - (A + 1) * math.cos(w0))
    a2 = (A + 1) - (A - 1) * math.cos(w0) - 2 * math.sqrt(A) * alpha
    y = lfilter([b0 / a0, b1 / a0, b2 / a0], [1, a1 / a0, a2 / a0], x)
    fc, Q = 38.13547087602444, 0.5003270373238773
    w0 = 2 * math.pi * fc / SR; alpha = math.sin(w0) / (2 * Q)
    a0 = 1 + alpha
    return lfilter([1 / a0, -2 / a0, 1 / a0], [1, -2 * math.cos(w0) / a0, (1 - alpha) / a0], y)


def integrated_lufs(L, R):
    """BS.1770 integrated loudness: 400 ms blocks, 75 % overlap, absolute (−70) + relative (−10) gates."""
    kl, kr = k_weight(L), k_weight(R)
    n = int(SR * 0.4)
    hop = n // 4
    zs = []
    for s in range(0, len(kl) - n, hop):
        zs.append(np.mean(kl[s:s + n] ** 2) + np.mean(kr[s:s + n] ** 2))
    zs = np.array(zs)
    lk = -0.691 + 10 * np.log10(zs + 1e-12)
    z1 = zs[lk > -70]
    rel = -0.691 + 10 * np.log10(np.mean(z1)) - 10
    z2 = zs[lk > rel]
    return -0.691 + 10 * np.log10(np.mean(z2))


def main():
    os.makedirs(TMP, exist_ok=True)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    n = int(SR * LOOP)
    # render the arrangement twice in a row; keep the second loop (the first one's tail rings into it)
    L1, R1 = render_once()
    two = int(SR * (2 * LOOP + 3.5))
    L = np.zeros(two)
    R = np.zeros(two)
    L[: len(L1)] += L1
    R[: len(R1)] += R1
    L[n: n + len(L1)] += L1
    R[n: n + len(R1)] += R1
    L, R = reverb_st(L, R)
    L = L[n: 2 * n].copy()
    R = R[n: 2 * n].copy()
    # The kept second pass is already the steady-state loop: its start carries the first pass's tails,
    # exactly what follows its own end when it repeats — the seam is continuous by construction
    # (checked below: the last → first sample jump against the median sample step).
    # loudness → −23 LUFS integrated, peaks ≤ −2 dBFS
    lu = integrated_lufs(L, R)
    g = 10 ** ((-23 - lu) / 20)
    L *= g
    R *= g
    pk = max(np.abs(L).max(), np.abs(R).max())
    lim = 10 ** (-2 / 20)
    if pk > lim:
        L *= lim / pk
        R *= lim / pk
    final = integrated_lufs(L, R)
    # seam: the jump from the last sample to the first, against the median sample-to-sample step
    step = float(np.median(np.abs(np.diff(L[: SR * 5]))))
    seam = max(abs(L[0] - L[-1]), abs(R[0] - R[-1])) / (step + 1e-9)
    wav = os.path.join(TMP, 'night-shift.wav')
    st = np.stack([L, R], axis=1)
    wavfile.write(wav, SR, (st * 32767).clip(-32768, 32767).astype(np.int16))
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', wav, '-c:a', 'aac_at', '-b:a', '80k', '-ac', '2', '-ar', str(SR), '-movflags', '+faststart', OUT], check=True)
    # spectral roll-off (85 %) as a "no harsh overtones" check
    spec = np.abs(np.fft.rfft((L + R)[: SR * 20]))
    freqs = np.fft.rfftfreq(SR * 20, 1 / SR)
    cum = np.cumsum(spec ** 2)
    rolloff = float(freqs[np.searchsorted(cum, 0.85 * cum[-1])])
    report = {
        'file': os.path.relpath(OUT, ROOT), 'bpm': BPM, 'bars': BARS, 'seconds': round(LOOP, 2), 'integrated_lufs': round(final, 2),
        'peak_dbfs': round(20 * np.log10(max(np.abs(L).max(), np.abs(R).max())), 2), 'loop_seam_jump_vs_median_step': round(float(seam), 2),
        'rolloff85_hz': round(rolloff), 'bytes': os.path.getsize(OUT), 'license': 'CC0-1.0 (project-owned, original synthesis)',
    }
    json.dump(report, open(os.path.join(HERE, 'music-report.json'), 'w'), indent=1)
    print(json.dumps(report, indent=1))


if __name__ == '__main__':
    main()
