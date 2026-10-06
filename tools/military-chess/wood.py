#!/usr/bin/env python3
"""Procedural, seamless 512x512 wood-grain texture for the 陆战棋 board frame (spec §6.7).

Own work (程序生成), no third-party assets. Rings = sin(radius-ish coordinate * freq + fBm warp);
every noise term uses integer frequencies over the tile, so the texture tiles seamlessly.
Colours map to --mc-wood-hi / --mc-wood / --mc-wood-deep.

    python3 tools/military-chess/wood.py   ->  site/military-chess/assets/wood-512.webp (WebP q80)
"""
import os
import numpy as np
from PIL import Image

N = 512
rng = np.random.default_rng(20261006)
y, x = np.mgrid[0:N, 0:N].astype(np.float64) / N  # 0..1, periodic

def periodic_fbm(octaves=6, base=2):
    acc = np.zeros((N, N))
    amp = 1.0
    norm = 0.0
    for o in range(octaves):
        f = base * (2 ** o)
        layer = np.zeros((N, N))
        for _ in range(4):
            kx, ky = rng.integers(-f, f + 1, size=2)
            if kx == 0 and ky == 0:
                kx = f
            ph = rng.uniform(0, 2 * np.pi)
            layer += np.sin(2 * np.pi * (kx * x + ky * y) + ph)
        acc += amp * layer / 4
        norm += amp
        amp *= 0.55
    return acc / norm

warp = periodic_fbm(6, 1)
fine = periodic_fbm(5, 16)
# long grain running horizontally: ring phase mostly follows y, gently undulating with x;
# ring spacing varies through a y-only periodic term; latewood lines are sharp (power shaping)
phase = 22 * y + 0.9 * warp + 0.6 * np.sin(2 * np.pi * (3 * y)) + 0.25 * np.sin(2 * np.pi * (x + 2 * y))
ring = phase - np.floor(phase)
late = ring ** 6                     # thin dark latewood band at the end of each ring
t = 0.62 - 0.38 * late + 0.10 * fine + 0.08 * np.sin(2 * np.pi * (5 * y + 0.7 * warp))
# fine straight fibres
fibres = np.sin(2 * np.pi * (230 * y + 6 * warp + 2 * fine))
t += 0.035 * fibres
t = np.clip((t - t.min()) / (t.max() - t.min()), 0, 1)
hi = np.array([0xC0, 0x8A, 0x52], float)
mid = np.array([0x8F, 0x5D, 0x30], float)
deep = np.array([0x5E, 0x3A, 0x1C], float)
t3 = t[..., None]
col = np.where(t3 < 0.5, deep + (mid - deep) * (t3 / 0.5), mid + (hi - mid) * ((t3 - 0.5) / 0.5))
img = Image.fromarray(np.clip(col, 0, 255).astype(np.uint8), 'RGB')
out = os.path.join(os.path.dirname(__file__), '..', '..', 'site', 'military-chess', 'assets', 'wood-512.webp')
out = os.path.normpath(out)
img.save(out, 'WEBP', quality=80, method=6)
print(out, os.path.getsize(out), 'bytes')
