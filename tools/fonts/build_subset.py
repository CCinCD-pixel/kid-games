#!/usr/bin/env python3
"""Rebuild the 星港 CJK webfont subsets (public/fonts/*.woff2) with extra characters added.

Used by tools/fonts/patch-subset.mjs (`--write`); run it directly only if you know what you are doing:

  ~/kid-games-work/design-system/.venv-ds/bin/python tools/fonts/build_subset.py \
      --src ~/kid-games-work/design-system/_src/fonts-src --out public/fonts --add added-chars.txt [--dry]

How it stays safe
  * base charset = the code points the CURRENT subset already maps (read back from the woff2), so a rebuild can only
    ever ADD glyphs: nothing the games rely on today can disappear;
  * the same fontTools options as assets-src/design-system/_src/build_fonts.py (no hinting, desubroutinize, keep the
    name table with the OFL / Reserved Font Name records, layout features kept);
  * `--verify` (default on) re-opens the old and the new font and checks that every glyph that was already there still
    has an identical outline and advance width;
  * characters a source font has no glyph for are reported (not an error) and left out;
  * prints one JSON report on stdout (code point counts, bytes, added / unavailable characters, source sha256).

Sources (SIL OFL 1.1; see public/fonts/licenses/ and assets-src/LICENSES.md):
  LXGWWenKaiGB-Medium.ttf  霞鹜文楷 GB v1.522 Medium  → wenkai-gb-medium-3500.woff2  ("XG WenKai", reading font)
  ZCOOLKuaiLe-Regular.ttf  站酷快乐体                  → zcool-kuaile-3500.woff2      ("XG KuaiLe", display font)
Baloo 2 (Latin digits) is not touched.
"""
import argparse, hashlib, json, os, sys, tempfile
from fontTools import subset
from fontTools.pens.recordingPen import DecomposingRecordingPen
from fontTools.ttLib import TTFont

JOBS = [
    ('LXGWWenKaiGB-Medium.ttf', 'wenkai-gb-medium-3500.woff2'),
    ('ZCOOLKuaiLe-Regular.ttf', 'zcool-kuaile-3500.woff2'),
]


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def build(src, out, codepoints):
    opts = subset.Options()
    opts.flavor = 'woff2'
    opts.layout_features = ['*']
    opts.name_IDs = ['*']
    opts.name_languages = ['*']
    opts.notdef_outline = True
    opts.glyph_names = False
    opts.hinting = False
    opts.desubroutinize = True
    opts.drop_tables += ['DSIG']
    font = subset.load_font(src, opts)
    s = subset.Subsetter(opts)
    s.populate(unicodes=sorted(codepoints))
    s.subset(font)
    subset.save_font(font, out, opts)


def outline(font, cp):
    gname = font.getBestCmap().get(cp)
    gs = font.getGlyphSet()
    pen = DecomposingRecordingPen(gs)
    gs[gname].draw(pen)
    norm = lambda pt: None if pt is None else tuple(round(v, 1) for v in pt)
    return (round(font['hmtx'][gname][0]), tuple((op, tuple(norm(pt) for pt in args)) for op, args in pen.value))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', required=True)
    ap.add_argument('--out', required=True, help='directory holding the current subsets (public/fonts)')
    ap.add_argument('--add', required=True, help='text file with the characters to add (any other text is ignored)')
    ap.add_argument('--dry', action='store_true', help='build to a temp dir, verify, report; do not touch --out')
    ap.add_argument('--no-verify', action='store_true')
    a = ap.parse_args()
    added_text = open(a.add, encoding='utf-8').read()
    add_cps = {ord(c) for c in added_text if not c.isspace()}
    report = {}
    tmpdir = tempfile.mkdtemp(prefix='kg-fonts-')
    for src_name, out_name in JOBS:
        src = os.path.join(a.src, src_name)
        cur = os.path.join(a.out, out_name)
        old = TTFont(cur)
        old_cps = set(old.getBestCmap().keys())
        src_font = TTFont(src, lazy=True)
        src_cps = set(src_font.getBestCmap().keys())
        want = old_cps | add_cps
        unavailable = sorted(c for c in want if c not in src_cps and c > 0x7F)
        cps = {c for c in want if c in src_cps or c <= 0x7F}
        tmp = os.path.join(tmpdir, out_name)
        build(src, tmp, cps)
        new = TTFont(tmp)
        new_cps = set(new.getBestCmap().keys())
        if not a.no_verify:
            bad = [chr(c) for c in sorted(old_cps) if c in new_cps and outline(old, c) != outline(new, c)]
            lost = [chr(c) for c in sorted(old_cps) if c not in new_cps]
            if bad or lost:
                sys.exit(f'{out_name}: verification failed; changed glyphs {bad[:20]} lost {lost[:20]}')
        report[out_name] = {
            'source': src_name, 'source_sha256': sha256(src),
            'codepoints_before': len(old_cps), 'codepoints_after': len(new_cps),
            'bytes_before': os.path.getsize(cur), 'bytes_after': os.path.getsize(tmp),
            'added': ''.join(chr(c) for c in sorted(new_cps - old_cps)),
            'unavailable_in_source': ''.join(chr(c) for c in unavailable),
        }
        if not a.dry:
            os.replace(tmp, cur)
    print(json.dumps(report, ensure_ascii=False, indent=1))


if __name__ == '__main__':
    main()
