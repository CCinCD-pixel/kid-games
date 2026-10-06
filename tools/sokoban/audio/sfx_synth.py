"""Copied verbatim (below this header) from the 星港 design system: ~/kid-games-work/design-system/_src/sfx_synth.py
(original synthesis, CC0-1.0 — project-owned). 星港搬运工 uses its instruments for the 6 game sounds
(tools/sokoban/audio/build_sfx.py) and the menu music 星港夜班 (build_music.py). Do not edit here; re-copy.
"""
"""星港 SFX synthesizer — original (non-Kenney) musical sounds.

Everything here is generated from math, so it is owned by the project (CC0 dedication
in LICENSES.md). Design rules:
  * pentatonic only (C D E G A) so any sequence of feedback sounds is consonant;
  * warm "mallet + bell" timbre (marimba body, glockenspiel shimmer) — never harsh;
  * failure is a soft wooden 咚, never a buzzer.
"""
import numpy as np

SR = 44100
A4 = 440.0
PENT = [0, 2, 4, 7, 9]  # C D E G A


def hz(midi):
    return A4 * 2 ** ((midi - 69) / 12)


def pent_midi(step, base=72):
    """step 0 = C5 (base). Walks the major pentatonic scale."""
    octv, idx = divmod(step, 5)
    return base + 12 * octv + PENT[idx]


def t_(dur):
    return np.arange(int(SR * dur)) / SR


def env_ad(n, a=0.002, d=0.4, curve=6.0):
    t = np.arange(n) / SR
    e = np.minimum(1.0, t / max(a, 1e-4)) * np.exp(-curve * np.maximum(0, t - a) / max(d, 1e-3))
    return e


def marimba(f, dur=0.6, bright=0.35, decay=0.35):
    t = t_(dur)
    n = len(t)
    # marimba-like partials: 1, 3.93 (tuned bar), 9.2
    parts = [(1.0, 1.0, decay), (3.93, 0.35 * bright, decay * 0.35), (9.2, 0.12 * bright, decay * 0.12)]
    y = np.zeros(n)
    for r, amp, d in parts:
        if f * r > SR / 2.2:
            continue
        y += amp * np.sin(2 * np.pi * f * r * t) * env_ad(n, 0.0015, d)
    # soft mallet thump
    thump = np.sin(2 * np.pi * f * 0.5 * t) * env_ad(n, 0.001, 0.03) * 0.25
    return y + thump


def bell(f, dur=1.2, bright=0.5, decay=0.6):
    t = t_(dur)
    n = len(t)
    # glockenspiel / celesta partials
    parts = [(1.0, 1.0, decay), (2.76, 0.45 * bright, decay * 0.5), (5.40, 0.25 * bright, decay * 0.3), (8.93, 0.12 * bright, decay * 0.15)]
    y = np.zeros(n)
    for r, amp, d in parts:
        if f * r > SR / 2.2:
            continue
        y += amp * np.sin(2 * np.pi * f * r * t + r) * env_ad(n, 0.001, d)
    return y


def kalimba(f, dur=0.8, decay=0.45):
    t = t_(dur)
    n = len(t)
    y = np.sin(2 * np.pi * f * t) * env_ad(n, 0.001, decay)
    y += 0.22 * np.sin(2 * np.pi * f * 5.95 * t) * env_ad(n, 0.0008, decay * 0.08)
    y += 0.12 * np.sin(2 * np.pi * f * 2.0 * t) * env_ad(n, 0.001, decay * 0.5)
    return y


def soft_tri(f, dur, a=0.004, d=0.12):
    t = t_(dur)
    ph = (f * t) % 1.0
    tri = 2 * np.abs(2 * ph - 1) - 1
    return tri * env_ad(len(t), a, d)


def noise(dur, seed=1):
    rng = np.random.default_rng(seed)
    return rng.standard_normal(int(SR * dur))


def bandpass_sweep(x, f0, f1, q=2.0):
    """time-varying 2-pole resonant bandpass (state variable filter)."""
    n = len(x)
    fc = np.geomspace(f0, f1, n)
    y = np.zeros(n)
    low = band = 0.0
    damp = 1.0 / q
    for i in range(n):
        f = 2 * np.sin(np.pi * fc[i] / SR)
        high = x[i] - low - damp * band
        band += f * high
        low += f * band
        y[i] = band
    return y


def lowpass(x, fc):
    a = np.exp(-2 * np.pi * fc / SR)
    y = np.zeros_like(x)
    acc = 0.0
    for i in range(len(x)):
        acc = (1 - a) * x[i] + a * acc
        y[i] = acc
    return y


def reverb(x, tail=0.9, mix=0.18, seed=7, damp_hz=5000):
    """cheap convolution reverb with an exponentially decaying filtered-noise IR."""
    n = int(SR * tail)
    rng = np.random.default_rng(seed)
    ir = rng.standard_normal(n) * np.exp(-np.arange(n) / SR * (6.9 / tail))
    ir = lowpass(ir, damp_hz)
    ir[: int(SR * 0.012)] = 0  # pre-delay
    ir /= np.sqrt(np.sum(ir ** 2)) + 1e-9
    wet = np.convolve(x, ir)
    dry = np.concatenate([x, np.zeros(n)])
    wet = np.concatenate([wet, np.zeros(max(0, len(dry) - len(wet)))])[: len(dry)]
    return dry * (1 - mix) + wet * mix * 3.0


def place(dst, src, at):
    i = int(at * SR)
    end = min(len(dst), i + len(src))
    dst[i:end] += src[: end - i]
    return dst


def canvas(dur):
    return np.zeros(int(SR * dur))


def fade_tail(y, ms=30):
    n = int(SR * ms / 1000)
    if n and len(y) > n:
        y[-n:] *= np.linspace(1, 0, n)
    return y


# ---------------------------------------------------------------- sounds

def s_chime():
    """single pentatonic note C6; pitch it at runtime with playbackRate = 2^(semitones/12)."""
    y = kalimba(hz(84), 0.9, 0.42) + 0.35 * bell(hz(84), 0.9, 0.35, 0.35)
    return reverb(y, 0.7, 0.16)


def s_correct():
    y = canvas(1.1)
    for k, st in enumerate([0, 2, 4]):  # C5 E5 G5 — do mi sol
        m = pent_midi([0, 2, 3][k], 72)
        place(y, marimba(hz(m), 0.7, 0.5, 0.3) * (0.8 + 0.1 * k), 0.065 * k)
        place(y, bell(hz(m + 12), 0.7, 0.3, 0.25) * 0.18, 0.065 * k)
    return reverb(y, 0.8, 0.18)


def s_correct_big():
    y = canvas(1.6)
    steps = [0, 1, 2, 3, 4, 5]  # C D E G A C'
    for k, st in enumerate(steps):
        m = pent_midi(st, 72)
        place(y, marimba(hz(m), 0.7, 0.5, 0.28) * 0.75, 0.055 * k)
    # sparkle on the top note
    place(y, bell(hz(pent_midi(5, 84)), 1.0, 0.6, 0.45) * 0.35, 0.055 * 5)
    place(y, bell(hz(pent_midi(7, 84)), 0.8, 0.6, 0.35) * 0.18, 0.055 * 5 + 0.04)
    return reverb(y, 1.0, 0.2)


def s_try_again():
    """柔和的“咚” — soft low wooden knock + gentle falling second. never a buzzer."""
    y = canvas(0.7)
    m1 = marimba(hz(55), 0.55, 0.15, 0.22)  # G3
    m2 = marimba(hz(52), 0.6, 0.12, 0.25)  # E3 (minor third down = "hmm", not "wrong")
    place(y, m1 * 0.9, 0.0)
    place(y, m2 * 0.7, 0.11)
    y = lowpass(y, 1800)
    return reverb(y, 0.5, 0.1)


def s_star(i):
    notes = [(76, 88), (79, 91), (84, 96)]  # E5 G5 C6 with octave shimmer
    base, hi = notes[i]
    y = canvas(1.6)
    place(y, bell(hz(hi), 1.3, 0.55, 0.5) * 0.55, 0.0)
    place(y, kalimba(hz(base), 1.0, 0.45) * 0.6, 0.0)
    # tiny sparkle ticks
    rng = np.random.default_rng(10 + i)
    for k in range(3 + 2 * i):
        f = hz(pent_midi(int(rng.integers(8, 13)), 72))
        place(y, bell(f, 0.3, 0.2, 0.08) * 0.08, 0.05 + 0.035 * k)
    if i == 2:
        place(y, marimba(hz(60), 0.8, 0.3, 0.4) * 0.4, 0.0)  # warm low C4 under the 3rd star
    return reverb(y, 1.1, 0.22)


def s_unlock():
    y = canvas(1.4)
    for k in range(8):
        m = pent_midi(k + 2, 72)
        place(y, bell(hz(m), 0.5, 0.35, 0.15) * (0.25 + 0.04 * k), 0.035 * k)
    place(y, kalimba(hz(96), 1.0, 0.5) * 0.45, 0.3)
    place(y, bell(hz(96), 1.0, 0.5, 0.5) * 0.3, 0.3)
    return reverb(y, 1.0, 0.22)


def s_coin():
    y = canvas(0.6)
    place(y, soft_tri(hz(83), 0.09, 0.002, 0.05) * 0.6, 0.0)  # B5
    place(y, soft_tri(hz(88), 0.45, 0.002, 0.16) * 0.6, 0.07)  # E6
    place(y, bell(hz(88), 0.5, 0.3, 0.2) * 0.35, 0.07)
    return reverb(y, 0.5, 0.12)


def s_level_complete():
    y = canvas(2.4)
    seq = [(0, 0.0), (2, 0.12), (3, 0.24), (5, 0.40)]  # C5 E5 G5 C6
    for st, at in seq:
        m = pent_midi(st, 72)
        place(y, marimba(hz(m), 0.9, 0.5, 0.35) * 0.7, at)
        place(y, bell(hz(m + 12), 0.9, 0.3, 0.3) * 0.15, at)
    # sustained chord pad (C E G) under the last note
    for m in (60, 64, 67, 72):
        t = t_(1.6)
        pad = np.sin(2 * np.pi * hz(m) * t) * np.minimum(1, t / 0.08) * np.exp(-t * 2.2)
        place(y, pad * 0.12, 0.40)
    place(y, bell(hz(96), 1.4, 0.6, 0.6) * 0.25, 0.42)
    return reverb(y, 1.2, 0.22)


def s_chapter_complete():
    y = canvas(3.6)
    # motif: C E G | A G E | G C'  (major pentatonic, rising resolution)
    motif = [(0, 0.00), (2, 0.14), (3, 0.28), (4, 0.50), (3, 0.64), (2, 0.78), (3, 1.00), (5, 1.18)]
    for st, at in motif:
        m = pent_midi(st, 72)
        place(y, marimba(hz(m), 0.9, 0.55, 0.35) * 0.62, at)
    for m in (48, 60, 64, 67):  # C3 C4 E4 G4 bass/pad on the resolution
        t = t_(2.2)
        pad = (np.sin(2 * np.pi * hz(m) * t) + 0.2 * np.sin(4 * np.pi * hz(m) * t)) * np.minimum(1, t / 0.06) * np.exp(-t * 1.5)
        place(y, pad * 0.11, 1.18)
    rng = np.random.default_rng(3)
    for k in range(10):
        f = hz(pent_midi(int(rng.integers(9, 15)), 72))
        place(y, bell(f, 0.5, 0.3, 0.15) * 0.07, 1.22 + 0.06 * k)
    place(y, bell(hz(96), 1.8, 0.6, 0.8) * 0.22, 1.18)
    return reverb(y, 1.4, 0.24)


def s_whoosh(up=True):
    dur = 0.38
    x = noise(dur, 5)
    y = bandpass_sweep(x, 500 if up else 3500, 3500 if up else 500, 1.6)
    t = t_(dur)
    e = np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 1.6
    return y * e * 0.5


def s_launch():
    dur = 2.0
    t = t_(dur)
    rumble = lowpass(noise(dur, 11), 180) * 6.0
    hiss = bandpass_sweep(noise(dur, 12), 300, 4200, 1.2) * 0.6
    tone = np.sin(2 * np.pi * np.cumsum(np.geomspace(70, 260, len(t))) / SR) * 0.25
    e = np.minimum(1, t / 0.5) * np.exp(-np.maximum(0, t - 1.1) * 3.0)
    y = (rumble + hiss + tone) * e
    return reverb(y, 0.8, 0.15, damp_hz=3000)


def s_hint():
    y = canvas(0.9)
    place(y, bell(hz(91), 0.6, 0.35, 0.22) * 0.5, 0.0)   # G6
    place(y, bell(hz(93), 0.7, 0.35, 0.28) * 0.5, 0.09)  # A6
    place(y, kalimba(hz(81), 0.6, 0.3) * 0.35, 0.0)
    return reverb(y, 0.9, 0.22)


def s_shoot():
    """soft 'pew' for lane-defense projectiles (a seed pod / light bolt), not a gun."""
    dur = 0.16
    t = t_(dur)
    f = np.geomspace(1500, 620, len(t))
    y = np.sin(2 * np.pi * np.cumsum(f) / SR) * env_ad(len(t), 0.002, 0.06)
    y += 0.3 * bandpass_sweep(noise(dur, 21), 3000, 1200, 2.0) * env_ad(len(t), 0.001, 0.02)
    return y


def s_match():
    y = canvas(0.8)
    place(y, s_pop(1.0) * 0.8, 0.0)
    for k, st in enumerate([5, 7, 9]):
        place(y, bell(hz(pent_midi(st, 72)), 0.4, 0.4, 0.12) * 0.25, 0.03 + 0.03 * k)
    return reverb(y, 0.6, 0.15)


def s_pop(scale=1.0):
    dur = 0.12
    t = t_(dur)
    f = np.geomspace(380 * scale, 1100 * scale, len(t))
    y = np.sin(2 * np.pi * np.cumsum(f) / SR) * env_ad(len(t), 0.001, 0.035)
    return y


def s_blip(kind):
    """companion robot voice blips: FM chirps with a friendly contour."""
    contours = {
        'happy': ([660, 990, 1320], [0.07, 0.07, 0.12]),
        'question': ([700, 760, 1050], [0.07, 0.06, 0.14]),
        'think': ([520, 560, 520, 600], [0.06, 0.06, 0.06, 0.08]),
        'surprised': ([500, 1400], [0.04, 0.16]),
        'sleepy': ([620, 470, 360], [0.12, 0.12, 0.2]),
        'talk': ([820, 700], [0.05, 0.06]),
    }
    fs, ds = contours[kind]
    segs = []
    for i, (f, d) in enumerate(zip(fs, ds)):
        f2 = fs[i + 1] if i + 1 < len(fs) else f
        n = int(SR * d)
        fr = np.linspace(f, f2 * 0.6 + f * 0.4, n)
        segs.append(fr)
    fr = np.concatenate(segs)
    t = np.arange(len(fr)) / SR
    ph = 2 * np.pi * np.cumsum(fr) / SR
    mod = np.sin(ph * 2.0) * 0.8  # gentle FM = "electronic" but soft
    y = np.sin(ph + mod)
    e = np.minimum(1, t / 0.006) * np.minimum(1, (t[-1] - t) / 0.03 + 0.001)
    # little syllable amplitude wobble
    e *= 0.75 + 0.25 * np.sin(2 * np.pi * 22 * t)
    y = lowpass(y * e, 4500)
    return reverb(y, 0.4, 0.1)


def s_eat():
    """snake / collect: juicy 'bloop' (fast up-sweep, rounded) + a tiny marimba tick on top.
    Short (<0.25 s) because it fires many times per minute; pitch-laddered at runtime."""
    y = canvas(0.3)
    dur = 0.09
    t = t_(dur)
    f = np.geomspace(300, 900, len(t))
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * env_ad(len(t), 0.002, 0.05, 4.0)
    body = lowpass(body, 3000)
    place(y, body * 0.9, 0.0)
    place(y, marimba(hz(84), 0.2, 0.25, 0.08) * 0.35, 0.03)
    return reverb(y, 0.25, 0.08)


def s_pick():
    """drag start: soft lift — low rounded pop, no click transient."""
    dur = 0.11
    t = t_(dur)
    f = np.geomspace(260, 520, len(t))
    y = np.sin(2 * np.pi * np.cumsum(f) / SR) * env_ad(len(t), 0.006, 0.05, 4.0)
    return lowpass(y, 2200)


SYNTH = {
    'eat': s_eat,
    'pick': s_pick,
    'chime': s_chime,
    'correct': s_correct,
    'correct-big': s_correct_big,
    'try-again': s_try_again,
    'star-1': lambda: s_star(0),
    'star-2': lambda: s_star(1),
    'star-3': lambda: s_star(2),
    'unlock': s_unlock,
    'coin': s_coin,
    'level-complete': s_level_complete,
    'chapter-complete': s_chapter_complete,
    'whoosh-up': lambda: s_whoosh(True),
    'whoosh-down': lambda: s_whoosh(False),
    'launch': s_launch,
    'hint': s_hint,
    'shoot-soft': s_shoot,
    'match-clear': s_match,
    'blip-happy': lambda: s_blip('happy'),
    'blip-question': lambda: s_blip('question'),
    'blip-think': lambda: s_blip('think'),
    'blip-surprised': lambda: s_blip('surprised'),
    'blip-sleepy': lambda: s_blip('sleepy'),
    'blip-talk': lambda: s_blip('talk'),
}
