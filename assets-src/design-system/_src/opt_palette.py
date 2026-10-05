"""Search per-game accent colours (OKLCH, hue kept near the theme) that stay apart under
protan/deutan/tritan simulation. Deterministic (seeded). Prints proposed hex values."""
import math, itertools, random, sys
import numpy as np
sys.path.insert(0, '_src')
from check_palette import hex2lin, lin2lab, de2000, M, contrast
def oklch2lin(L, C, h):
    a, b = C * math.cos(math.radians(h)), C * math.sin(math.radians(h))
    l_ = L + .3963377774 * a + .2158037573 * b; m_ = L - .1055613458 * a - .0638541728 * b; s_ = L - .0894841775 * a - 1.2914855480 * b
    l, m, s = l_ ** 3, m_ ** 3, s_ ** 3
    return np.array([4.0767416621 * l - 3.3077115913 * m + .2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - .3413193965 * s, -.0041960863 * l - .7034186147 * m + 1.7076147010 * s])
def lin2hex(c):
    c = np.clip(c, 0, 1); s = np.where(c <= .0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - .055)
    return '#' + ''.join(f'{int(round(v * 255)):02x}' for v in s)
# theme hue anchors (OKLCH h), start L, C
G = {'mars': (42, .68, .17), 'moon': (295, .62, .16), 'rabbit': (172, .66, .12), 'story': (10, .62, .17), 'lab': (238, .66, .13),
     'porter': (72, .79, .16), 'chess': (268, .55, .17), 'army': (118, .58, .11), 'snake': (128, .80, .17), 'match': (330, .60, .19), 'defense': (148, .66, .14)}
names = list(G)
def labs(p):
    out = {m: [] for m in ['normal', 'protan', 'deutan', 'tritan']}
    for k in names:
        lin = oklch2lin(*p[k])
        for m in out: out[m].append(lin2lab(lin if m == 'normal' else np.array(M[m]) @ np.clip(lin, 0, 1)))
    return out
def ingamut(L, C, h):
    c = oklch2lin(L, C, h); return bool(np.all(c >= -1e-4) and np.all(c <= 1 + 1e-4))
def score(p):
    lb = labs(p); worst = 1e9
    for m, arr in lb.items():
        w = .8 if m == 'tritan' else 1.0   # tritanopia is very rare (~0.01 %)
        for i, j in itertools.combinations(range(len(names)), 2):
            worst = min(worst, de2000(arr[i], arr[j]) / w)
    dev = sum(abs(p[k][0] - G[k][1]) * 20 + abs(p[k][1] - G[k][2]) * 30 for k in names)
    return worst - .15 * dev
rnd = random.Random(7)
p = {k: (v[1], v[2], v[0]) for k, v in G.items()}
best = score(p)
for it in range(5000):
    k = rnd.choice(names); L, C, h = p[k]
    cand = (min(.88, max(.42, L + rnd.uniform(-.06, .06))), min(.22, max(.07, C + rnd.uniform(-.03, .03))), G[k][0] + max(-14, min(14, (h - G[k][0]) + rnd.uniform(-5, 5))))
    if not ingamut(*cand): continue
    q = dict(p); q[k] = cand; s = score(q)
    if s > best: best, p = s, q
lb = labs(p)
for m, arr in lb.items():
    pairs = sorted((de2000(arr[i], arr[j]), names[i], names[j]) for i, j in itertools.combinations(range(len(names)), 2))
    print(f'{m:7s}', ', '.join(f'{a}/{b} {d:.1f}' for d, a, b in pairs[:4]))
for k in names:
    L, C, h = p[k]; base = lin2hex(oklch2lin(L, C, h))
    deep = lin2hex(oklch2lin(max(.3, L - .2), min(C * 1.0, .2), h)); soft = lin2hex(oklch2lin(.94, .035, h))
    print(f'{k:8s} L{L:.2f} C{C:.3f} h{h:5.1f}  base {base} deep {deep} soft {soft}  white-on-base {contrast(base, "#ffffff"):.2f} white-on-deep {contrast(deep, "#ffffff"):.2f}')
