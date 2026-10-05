"""星港 paper textures — pre-rasterised, seamlessly tileable WebP (no runtime feTurbulence).

All noise is built in the frequency domain from white noise, so it is periodic by
construction (tiles with no seam). Fibres are drawn with wrap-around. Rendered at
512 px and displayed at 256 CSS px (= 2x on the iPad's DPR-2 screen).

  textures/paper-light.webp    opaque warm paper (cards, panels, modals)
  textures/paper-night.webp    opaque deep-navy paper (hub panels, night HUD)
  textures/grain-overlay.webp  near-white, use with mix-blend-mode:multiply over any flat colour
  textures/speckle-overlay.webp transparent pale fibres/specks for dark surfaces (normal blend)
  textures/kraft.webp          opaque warm kraft board (星港搬运工 floor/crates, story box)

Run:  .venv-ds/bin/python _src/build_textures.py   (< 2 s, < 200 MB)
"""
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'textures')
N = 512


def band_noise(rng, lo, hi, n=N):
    """periodic noise with energy between spatial frequencies lo..hi (cycles per tile)."""
    w = rng.standard_normal((n, n))
    F = np.fft.fft2(w)
    fy = np.fft.fftfreq(n) * n
    fx = np.fft.fftfreq(n) * n
    r = np.sqrt(fy[:, None] ** 2 + fx[None, :] ** 2)
    mask = np.exp(-((np.log(np.maximum(r, 1e-3)) - np.log(np.sqrt(lo * hi))) ** 2) / (2 * (np.log(hi / lo) / 2.5) ** 2))
    mask[0, 0] = 0
    y = np.real(np.fft.ifft2(F * mask))
    return (y - y.mean()) / (y.std() + 1e-9)


def aniso_noise(rng, lo, hi, stretch=6.0, angle=0.35, n=N):
    """directional (fibrous) periodic noise — long along `angle`."""
    w = rng.standard_normal((n, n))
    F = np.fft.fft2(w)
    fy = np.fft.fftfreq(n)[:, None] * n
    fx = np.fft.fftfreq(n)[None, :] * n
    c, s = np.cos(angle), np.sin(angle)
    u = fx * c + fy * s
    v = -fx * s + fy * c
    r = np.sqrt((u / stretch) ** 2 + v ** 2)
    mask = ((r > lo) & (r < hi)).astype(float)
    mask[0, 0] = 0
    y = np.real(np.fft.ifft2(F * mask))
    return (y - y.mean()) / (y.std() + 1e-9)


def fibres(rng, count, length, width, alpha, color=(0, 0, 0), ss=2, n=N):
    """wrap-around curved fibres drawn supersampled → RGBA layer."""
    S = n * ss
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    for _ in range(count):
        x, y = rng.uniform(0, S), rng.uniform(0, S)
        a = rng.uniform(0, np.pi)
        L = rng.uniform(.4, 1) * length * ss
        bend = rng.uniform(-.6, .6)
        pts = []
        for k in range(9):
            t = k / 8
            ang = a + bend * (t - .5)
            pts.append((x + np.cos(ang) * L * (t - .5), y + np.sin(ang) * L * (t - .5)))
        op = int(255 * alpha * rng.uniform(.35, 1))
        wd = max(1, int(round(width * ss * rng.uniform(.6, 1.3))))
        for ox in (-S, 0, S):
            for oy in (-S, 0, S):
                d.line([(px + ox, py + oy) for px, py in pts], fill=color + (op,), width=wd, joint='curve')
    return wrap_resize(img, n)


def wrap_resize(img, n):
    """downsample with wrap-around (tile 3x3, resize, crop centre) so edges stay seamless."""
    S = img.size[0]
    big = Image.new('RGBA', (S * 3, S * 3))
    for i in range(3):
        for j in range(3):
            big.paste(img, (i * S, j * S))
    big = big.resize((n * 3, n * 3), Image.LANCZOS)
    return big.crop((n, n, 2 * n, 2 * n))


def specks(rng, count, rmin, rmax, alpha, color, ss=2, n=N):
    S = n * ss
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    for _ in range(count):
        x, y = rng.uniform(0, S), rng.uniform(0, S)
        r = rng.uniform(rmin, rmax) * ss
        op = int(255 * alpha * rng.uniform(.3, 1))
        for ox in (-S, 0, S):
            for oy in (-S, 0, S):
                d.ellipse([x + ox - r, y + oy - r * .8, x + ox + r, y + oy + r], fill=color + (op,))
    return wrap_resize(img, n)


def tint(base_rgb, lum, warm=(0, 0, 0)):
    """lum: HxW array around 0 (±). returns uint8 RGB with warm bias on darker areas."""
    b = np.array(base_rgb, float)[None, None, :]
    w = np.array(warm, float)[None, None, :]
    img = b * (1 + lum[..., None]) + w * np.clip(-lum[..., None], 0, None) * 4
    return np.clip(img, 0, 255).astype(np.uint8)


def compose(rgb, *layers):
    im = Image.fromarray(rgb, 'RGB').convert('RGBA')
    for L in layers:
        im = Image.alpha_composite(im, L)
    return im


def save(im, name, q=84, lossless=False):
    os.makedirs(OUT, exist_ok=True)
    p = os.path.join(OUT, name)
    im.save(p, 'WEBP', quality=q, method=6, lossless=lossless)
    print(f'{name:22s} {im.mode} {im.size} {os.path.getsize(p) / 1024:5.1f} KB')


def main():
    rng = np.random.default_rng(20261005)

    # ---- paper-light: cold-press watercolour feel, very low contrast (kids' text sits on it)
    cloud = band_noise(rng, 2, 6) * .003 + band_noise(rng, 8, 30) * .004
    tooth = band_noise(rng, 60, 160) * .009
    fib = aniso_noise(rng, 20, 90, stretch=7, angle=.5) * .008
    lum = cloud + tooth + fib
    rgb = tint((255, 251, 242), lum, warm=(-1, -2, -4))
    light = compose(rgb,
                    fibres(rng, 260, 46, .7, .07, (150, 112, 70)),
                    fibres(rng, 60, 70, 1.0, .05, (255, 255, 255)),
                    specks(rng, 90, .4, .9, .045, (140, 100, 60)))
    save(light.convert('RGB'), 'paper-light.webp', q=86)

    # ---- paper-night: dyed navy mulberry paper
    cloud = band_noise(rng, 2, 6) * .012 + band_noise(rng, 8, 30) * .016
    tooth = band_noise(rng, 60, 160) * .03
    fib = aniso_noise(rng, 18, 80, stretch=8, angle=-.4) * .04
    rgb = tint((22, 30, 72), cloud + tooth + fib, warm=(0, 0, 0))
    night = compose(rgb,
                    fibres(rng, 320, 50, .7, .10, (170, 185, 240)),
                    fibres(rng, 80, 70, 1.0, .10, (5, 8, 30)),
                    specks(rng, 160, .5, 1.2, .14, (200, 210, 255)))
    save(night.convert('RGB'), 'paper-night.webp', q=86)

    # ---- grain-overlay: multiply layer (white = no change). Mean ≈ 0.975 so colours barely darken
    tooth = band_noise(rng, 50, 170) * .022 + band_noise(rng, 8, 30) * .006
    fib = aniso_noise(rng, 20, 90, stretch=7, angle=.6) * .012
    g = np.clip(244 + (tooth + fib) * 255, 0, 255).astype(np.uint8)
    grain = compose(np.stack([g, g, np.clip(g.astype(int) + 3, 0, 255).astype(np.uint8)], -1),
                    fibres(rng, 220, 48, .7, .10, (120, 100, 90)),
                    fibres(rng, 70, 60, 1.0, .12, (255, 255, 255)),
                    specks(rng, 140, .4, 1.1, .12, (110, 90, 80)))
    save(grain.convert('RGB'), 'grain-overlay.webp', q=86)

    # ---- speckle-overlay: transparent pale fibres + dust for night surfaces
    sp = Image.new('RGBA', (N, N), (0, 0, 0, 0))
    sp = Image.alpha_composite(sp, fibres(rng, 240, 52, .7, .14, (210, 220, 255)))
    sp = Image.alpha_composite(sp, specks(rng, 220, .45, 1.1, .22, (230, 236, 255)))
    save(sp, 'speckle-overlay.webp', q=90)

    # ---- kraft: warm cardboard (crates, story box, porter floor)
    cloud = band_noise(rng, 2, 6) * .012 + band_noise(rng, 8, 30) * .018
    fib = aniso_noise(rng, 14, 70, stretch=10, angle=.15) * .06 + band_noise(rng, 60, 160) * .035
    rgb = tint((206, 160, 104), cloud + fib, warm=(-2, -3, -6))
    kraft = compose(rgb,
                    fibres(rng, 320, 44, .8, .16, (120, 80, 40)),
                    fibres(rng, 120, 50, .8, .10, (250, 220, 170)),
                    specks(rng, 140, .5, 1.4, .25, (90, 60, 30)))
    save(kraft.convert('RGB'), 'kraft.webp', q=84)

    # seam self-check: wrap-around difference must look like interior difference
    for name in ['paper-light.webp', 'paper-night.webp', 'grain-overlay.webp', 'kraft.webp']:
        a = np.asarray(Image.open(os.path.join(OUT, name)).convert('L'), float)
        edge = np.abs(a[0] - a[-1]).mean() + np.abs(a[:, 0] - a[:, -1]).mean()
        inner = np.abs(a[255] - a[256]).mean() + np.abs(a[:, 255] - a[:, 256]).mean()
        print(f'  seam {name:20s} edge Δ {edge:5.2f}  interior Δ {inner:5.2f}')


if __name__ == '__main__':
    main()
