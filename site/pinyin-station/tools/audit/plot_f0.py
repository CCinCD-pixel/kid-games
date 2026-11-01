"""F0 contour PNGs (PIL only, no audio): one image per file that is wrong / low-confidence in tone.json, plus the doubtful list.
usage: plot_f0.py OUT_DIR [extra,names...]"""
import json, math, sys
from pathlib import Path
from PIL import Image, ImageDraw
out = Path(sys.argv[1]); extra = set(sys.argv[2].split(",")) if len(sys.argv) > 2 else set()
tone = json.loads((out / "tone.json").read_text()); s = tone["summary"]
pick = set(s["wrong"]) | set(s["lowConfidence"]) | extra
(out / "f0").mkdir(exist_ok=True)
W, H, L, B = 560, 300, 50, 40
n = 0
for r in tone["clips"]:
    if r["name"] not in pick or not r["track"]: continue
    med = r["medianHz"] or 1
    pts = [(t, 12 * math.log2(f / med)) for t, f in r["track"] if f > 0]
    img = Image.new("RGB", (W, H), "white"); d = ImageDraw.Draw(img)
    t0, t1 = pts[0][0], pts[-1][0] or 1
    lo, hi = -10, 10
    x = lambda t: L + (t - t0) / max(t1 - t0, 1e-3) * (W - L - 15)
    y = lambda v: 20 + (hi - max(lo, min(hi, v))) / (hi - lo) * (H - 20 - B)
    for v in range(-8, 9, 4): d.line([(L, y(v)), (W - 10, y(v))], fill=(225, 225, 225)); d.text((8, y(v) - 5), "%+d" % v, fill=(110, 110, 110))
    d.line([(L, y(0)), (W - 10, y(0))], fill=(160, 160, 160))
    for a, b in zip(pts, pts[1:]):
        if b[0] - a[0] < 0.03: d.line([(x(a[0]), y(a[1])), (x(b[0]), y(b[1]))], fill=(200, 90, 0), width=2)
    for t, v in pts: d.ellipse([x(t) - 2, y(v) - 2, x(t) + 2, y(v) + 2], fill=(200, 90, 0))
    if r["curve"]:
        cx = [t0 + i / (len(r["curve"]) - 1) * (t1 - t0) for i in range(len(r["curve"]))]
        d.line([(x(t), y(v)) for t, v in zip(cx, r["curve"])], fill=(20, 80, 200), width=2)
    d.text((8, 4), "%s  expected tone %s  tracker %s (%s, conf %.2f)  median %d Hz  range %.1f st" % (r["name"], r["expectedTone"], r["predictedTone"], r["shape"], r["confidence"], r["medianHz"], r["rangeSt"]), fill=(0, 0, 0))
    d.text((8, H - 30), "orange = tracked F0 relative to median (semitones), blue = 24-point contour; x = %.2f s" % (t1 - t0), fill=(90, 90, 90))
    img.save(out / "f0" / ("%s.png" % r["name"])); n += 1
print(n, "plots in", out / "f0")
