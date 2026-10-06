"""星港搬运工 — the six game sounds (spec §7.1), built locally; never downloads anything.

  sok-land       a crate settling into place: Kenney Impact Sounds impactWood_medium_002, first 120 ms, low-passed
  sok-lockchime  glass overtone with the lock-in: sine 2 kHz + 3 kHz, 400 ms decay (pitched at runtime)
  sok-unlatch    the pad's clasps letting go: the lock-in source (Kenney Interface switch_003) reversed + high-passed
  sok-rewind     undo = rewind: the design system's whoosh-down synth reversed, pitched up, a tape flutter
  sok-ignite     ignition: low rumble + crackle, noise through a falling low-pass sweep (600 ms)
  sok-conveyor   the conveyor belt: low roller pulses + gear clicks, 1.2 s, loopable

Pipeline (same as the design system's build_sfx.py): mono 44.1 kHz → trim silence → short-term loudness
(BS.1770 K-weighting, 100 ms) to the game target (−18 LUFS) → peak ≤ −1 dBFS → AAC (AudioToolbox) .m4a.
Output: site/sokoban/assets/sfx/<name>.m4a + tools/sokoban/audio/sfx-manifest.json (durations, loudness, sources, licences).

Run with the design system's Python (numpy + scipy) and the machine's ffmpeg:
  ~/kid-games-work/design-system/.venv-ds/bin/python tools/sokoban/audio/build_sfx.py
Check by inspecting files (ffprobe, the manifest numbers) — never by playing them on this machine.
"""
import json, os, subprocess, sys
import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, lfilter, sosfilt

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import sfx_synth as S  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, '../../..'))
OUT = os.path.join(ROOT, 'site/sokoban/assets/sfx')
KENNEY = os.path.expanduser('~/kid-games-work/design-system/_src/sfx')
TMP = os.path.expanduser('~/kid-games-work/scratch-sokoban/sfx-wav')
SR = 44100
TARGET = -18.0  # game category (design system TARGET['game'])


def decode(path):
    raw = subprocess.run(['ffmpeg', '-v', 'quiet', '-i', path, '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).astype(np.float64)


def k_weight(x, sr):
    import math
    G, Q, fc = 3.999843853973347, 0.7071752369554196, 1681.974450955533
    A = 10 ** (G / 40); w0 = 2 * math.pi * fc / sr; alpha = math.sin(w0) / (2 * Q)
    b0 = A * ((A + 1) + (A - 1) * math.cos(w0) + 2 * math.sqrt(A) * alpha)
    b1 = -2 * A * ((A - 1) + (A + 1) * math.cos(w0))
    b2 = A * ((A + 1) + (A - 1) * math.cos(w0) - 2 * math.sqrt(A) * alpha)
    a0 = (A + 1) - (A - 1) * math.cos(w0) + 2 * math.sqrt(A) * alpha
    a1 = 2 * ((A - 1) - (A + 1) * math.cos(w0))
    a2 = (A + 1) - (A - 1) * math.cos(w0) - 2 * math.sqrt(A) * alpha
    y = lfilter([b0 / a0, b1 / a0, b2 / a0], [1, a1 / a0, a2 / a0], x)
    fc, Q = 38.13547087602444, 0.5003270373238773
    w0 = 2 * math.pi * fc / sr; alpha = math.sin(w0) / (2 * Q)
    a0 = 1 + alpha
    return lfilter([1 / a0, -2 / a0, 1 / a0], [1, -2 * math.cos(w0) / a0, (1 - alpha) / a0], y)


def short_term_lufs(x, sr=SR, win=0.1):
    y = k_weight(x, sr)
    n = int(sr * win)
    if len(y) < n:
        y = np.concatenate([y, np.zeros(n - len(y))])
    p = np.convolve(y ** 2, np.ones(n) / n, 'valid')
    return -0.691 + 10 * np.log10(p.max() + 1e-12)


def trim(x, lead_db=-48, tail_db=-60):
    a = np.abs(x); pk = a.max() + 1e-12
    on = np.where(a > pk * 10 ** (lead_db / 20))[0]
    s = max(0, on[0] - int(SR * 0.002))
    off = np.where(a > pk * 10 ** (tail_db / 20))[0][-1]
    y = x[s: off + 1].copy()
    f = min(len(y) // 4, int(SR * 0.02))
    if f > 0:
        y[-f:] *= np.linspace(1, 0, f)
    return y


def lp(x, fc, order=4):
    return sosfilt(butter(order, fc, 'low', fs=SR, output='sos'), x)


def hp(x, fc, order=2):
    return sosfilt(butter(order, fc, 'high', fs=SR, output='sos'), x)


def fade(x, a_ms=2, r_ms=20):
    a = int(SR * a_ms / 1000); r = int(SR * r_ms / 1000)
    y = x.copy()
    if a:
        y[:a] *= np.linspace(0, 1, a)
    if r:
        y[-r:] *= np.linspace(1, 0, r)
    return y


# ---------------------------------------------------------------- the six sounds

def sok_land():
    x = decode(os.path.join(KENNEY, 'kenney_impact-sounds/Audio/impactWood_medium_002.ogg'))
    x = trim(x)[: int(SR * 0.12)]
    return fade(lp(x, 1400), 1, 30)


def sok_lockchime():
    t = S.t_(0.45)
    e = np.exp(-t / 0.4 * 5.0) * np.minimum(1, t / 0.002)
    y = (np.sin(2 * np.pi * 2000 * t) + 0.55 * np.sin(2 * np.pi * 3000 * t + 0.6) + 0.12 * np.sin(2 * np.pi * 5000 * t)) * e
    return S.reverb(y, 0.5, 0.18)


def sok_unlatch():
    x = decode(os.path.join(KENNEY, 'kenney_interface-sounds/Audio/switch_003.ogg'))
    x = trim(x)[::-1].copy()
    return fade(hp(x, 900), 3, 25)


def sok_rewind():
    w = S.s_whoosh(up=False)[::-1].copy()
    # pitch up ×1.35 (resample) + a light tape flutter
    idx = np.arange(0, len(w) - 1, 1.35)
    y = np.interp(idx, np.arange(len(w)), w)
    t = np.arange(len(y)) / SR
    y *= 1 + 0.25 * np.sin(2 * np.pi * 22 * t)
    tick = S.soft_tri(S.hz(91), 0.05, 0.001, 0.02) * 0.12
    y[: len(tick)] += tick
    return fade(y, 2, 30)


def sok_ignite():
    dur = 0.9
    t = S.t_(dur)
    n = S.noise(dur, 21)
    # falling low-pass sweep 2.4 kHz → 160 Hz over 600 ms (block-wise)
    out = np.zeros_like(n)
    blocks = 30
    edges = np.linspace(0, len(n), blocks + 1).astype(int)
    for k in range(blocks):
        fc = float(np.geomspace(2400, 160, blocks)[k])
        seg = n[max(0, edges[k] - 512): edges[k + 1]]
        f = lp(seg, fc, 2)[-(edges[k + 1] - edges[k]):]
        out[edges[k]: edges[k + 1]] = f
    rumble = lp(S.noise(dur, 22), 90, 2) * 4.0
    crackle = np.zeros_like(t)
    rng = np.random.default_rng(5)
    for at in rng.uniform(0.02, 0.55, 26):
        i = int(at * SR)
        L = int(SR * 0.004)
        if i + L < len(crackle):
            crackle[i: i + L] += rng.uniform(-1, 1) * np.hanning(L) * 1.6
    e = np.minimum(1, t / 0.03) * np.exp(-np.maximum(0, t - 0.25) * 3.2)
    y = (out * 1.4 + rumble + hp(crackle, 1500)) * e
    return S.reverb(y, 0.6, 0.14, damp_hz=2500)


def sok_conveyor():
    dur = 1.2
    t = S.t_(dur)
    y = np.zeros_like(t)
    # roller pulses: 8 per loop (a 150 ms grid) — soft low thumps
    for k in range(8):
        at = k * 0.15
        th = np.sin(2 * np.pi * 70 * S.t_(0.12)) * S.env_ad(int(SR * 0.12), 0.004, 0.05)
        S.place(y, th * 0.8, at)
    # gear clicks: off-beat ticks, slightly varied
    rng = np.random.default_rng(9)
    for k in range(8):
        at = k * 0.15 + 0.075
        click = hp(S.noise(0.012, 30 + k), 2500) * S.env_ad(int(SR * 0.012), 0.0005, 0.004) * (0.35 + 0.1 * rng.random())
        S.place(y, click, at)
    # belt hum
    y += lp(S.noise(dur, 40), 220, 2) * 0.35
    # loop seam: circular crossfade 30 ms
    n = int(SR * 0.03)
    head = y[:n].copy()
    y[:n] = head * np.linspace(0, 1, n) + y[-n:] * np.linspace(1, 0, n)
    return y[: len(y) - n]


SOUNDS = [
    ('sok-land', sok_land, 'Kenney Impact Sounds — impactWood_medium_002.ogg (first 120 ms, low-pass 1.4 kHz)', 'CC0-1.0 (kenney.nl)'),
    ('sok-lockchime', sok_lockchime, 'original synth: sine 2 kHz + 3 kHz partials, 400 ms decay, light reverb (tools/sokoban/audio/build_sfx.py)', 'CC0-1.0 (project-owned)'),
    ('sok-unlatch', sok_unlatch, 'Kenney Interface Sounds — switch_003.ogg (the lock-in source) reversed, high-pass 900 Hz', 'CC0-1.0 (kenney.nl)'),
    ('sok-rewind', sok_rewind, 'original synth: design-system whoosh-down (sfx_synth.py) reversed, ×1.35 pitch, 22 Hz flutter', 'CC0-1.0 (project-owned)'),
    ('sok-ignite', sok_ignite, 'original synth: noise through a falling low-pass sweep + rumble + crackle', 'CC0-1.0 (project-owned)'),
    ('sok-conveyor', sok_conveyor, 'original synth: roller pulses + gear clicks + belt hum, 1.2 s seamless loop', 'CC0-1.0 (project-owned)'),
]


def main():
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(TMP, exist_ok=True)
    manifest = {'version': 1, 'format': 'm4a (AAC-LC, mono, 44.1 kHz, 64 kbps)', 'loudness': f'short-term (100 ms, K-weighted) max = {TARGET} LUFS; peak <= -1 dBFS', 'sounds': {}}
    for name, fn, src, lic in SOUNDS:
        x = np.asarray(fn(), dtype=np.float64)
        if name != 'sok-conveyor':
            x = trim(x)
        lu = short_term_lufs(x)
        y = x * 10 ** ((TARGET - lu) / 20)
        pk = np.abs(y).max()
        lim = 10 ** (-1 / 20)
        if pk > lim:
            y *= lim / pk
        wav = os.path.join(TMP, name + '.wav')
        wavfile.write(wav, SR, (y * 32767).clip(-32768, 32767).astype(np.int16))
        out = os.path.join(OUT, name + '.m4a')
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', wav, '-c:a', 'aac_at', '-b:a', '64k', '-ac', '1', '-ar', str(SR), '-movflags', '+faststart', out], check=True)
        manifest['sounds'][name] = {
            'file': f'{name}.m4a', 'duration': round(len(y) / SR, 3), 'loudness': round(short_term_lufs(y), 1),
            'peak_db': round(20 * np.log10(np.abs(y).max() + 1e-12), 1), 'bytes': os.path.getsize(out), 'source': src, 'license': lic,
        }
        print(f"{name:14s} {len(y)/SR:5.2f}s {manifest['sounds'][name]['loudness']:6.1f} LUFS-st pk {manifest['sounds'][name]['peak_db']:5.1f} {os.path.getsize(out)//1024:3d} KB")
    json.dump(manifest, open(os.path.join(HERE, 'sfx-manifest.json'), 'w'), ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main()
