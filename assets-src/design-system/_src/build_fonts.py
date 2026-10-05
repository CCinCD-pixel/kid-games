"""Build the 星港 webfont subsets (woff2) with fontTools.

  sources (_src/fonts-src/, downloaded; see ../LICENSES.md):
    LXGWWenKaiGB-Medium.ttf   v1.522  OFL-1.1 (+ LXGW additional permission for web subsets)
    ZCOOLKuaiLe-Regular.ttf   google/fonts  OFL-1.1
    Baloo2-wght.ttf           google/fonts  OFL-1.1 (variable, wght 400–800)
    level-1.txt               《通用规范汉字表》一级字 3500 (shengdoushi/common-standard-chinese-characters-table)

  charset (CJK fonts) = 3500 一级字 ∪ extra-chars.txt (myth/space names, 二级字 we know we use)
                        ∪ every CJK char found in the design-system sources ∪ ASCII ∪ CJK punctuation
                        ∪ pinyin tone letters (WenKai only, for <ruby> annotations).
  Baloo 2 keeps its wght axis; numerals, Latin, maths operators only.

Run:  .venv-ds/bin/python _src/build_fonts.py      (≈30 s, < 600 MB RAM)
The repo pipeline can re-run the same script with --extra <file> containing all
displayed text so every glyph a game shows is guaranteed to be present.
"""
import argparse, glob, json, os, re
from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, '_src', 'fonts-src')
OUT = os.path.join(ROOT, 'fonts')

ASCII = ''.join(chr(c) for c in range(0x20, 0x7F))
PUNCT = '，。、；：？！“”‘’（）《》〈〉【】「」『』—…·～￥｜＋－×÷＝＜＞％＃＆＊＠　〇々・﹏'
PINYIN = 'āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜüÜĀÁǍÀĒÉĚÈĪÍǏÌŌÓǑÒŪÚǓÙńňǹḿ'
MATH = '+−×÷=<>≤≥≠±·%°′″→←↑↓'
CJK = re.compile(r'[㐀-鿿豈-﫿]')


def scan_sources():
    found = set()
    pats = ['styleguide/*.html', 'ui/*.ts', 'companion/*.ts', 'README.md', '_src/*.mjs']
    for p in pats:
        for f in glob.glob(os.path.join(ROOT, p)):
            found.update(CJK.findall(open(f, encoding='utf-8').read()))
    return found


def build(src, out, text, keep_axes=True, features='*'):
    opts = subset.Options()
    opts.flavor = 'woff2'
    opts.layout_features = [features] if features == '*' else features
    opts.name_IDs = ['*']           # keep copyright/licence/RFN records
    opts.name_languages = ['*']
    opts.notdef_outline = True
    opts.glyph_names = False
    opts.hinting = False             # iPad renders unhinted; saves ~20 %
    opts.desubroutinize = True
    opts.drop_tables += ['DSIG']
    font = subset.load_font(src, opts)
    s = subset.Subsetter(opts)
    s.populate(text=text)
    s.subset(font)
    subset.save_font(font, out, opts)
    t = TTFont(out)
    return len(t.getBestCmap()), os.path.getsize(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--extra', action='append', default=[], help='file(s) with extra text to include')
    a = ap.parse_args()
    os.makedirs(OUT, exist_ok=True)
    level1 = ''.join(l.strip() for l in open(os.path.join(SRC, 'level-1.txt'), encoding='utf-8'))
    extra = open(os.path.join(SRC, 'extra-chars.txt'), encoding='utf-8').read()
    for f in a.extra:
        extra += open(f, encoding='utf-8').read()
    scanned = scan_sources()
    cjk = set(level1) | set(CJK.findall(extra)) | scanned
    added = sorted(cjk - set(level1))
    base = ASCII + PUNCT
    jobs = [
        ('LXGWWenKaiGB-Medium.ttf', 'wenkai-gb-medium-3500.woff2', ''.join(sorted(cjk)) + base + PINYIN + MATH, '*'),
        ('ZCOOLKuaiLe-Regular.ttf', 'zcool-kuaile-3500.woff2', ''.join(sorted(cjk)) + base, '*'),
        ('Baloo2-wght.ttf', 'baloo2-vf-latin.woff2', ASCII + MATH + '×÷−–—‘’“”…•', ['kern', 'liga', 'tnum', 'lnum', 'pnum', 'case', 'mark', 'mkmk']),
    ]
    report = {}
    for src, out, text, feats in jobs:
        n, size = build(os.path.join(SRC, src), os.path.join(OUT, out), text, features=feats)
        report[out] = {'source': src, 'codepoints': n, 'bytes': size}
        print(f'{out:34s} {n:5d} cps  {size / 1024:7.0f} KB')
    report['_charset'] = {'level1': len(level1), 'extra_cjk_beyond_level1': len(added), 'extra_chars': ''.join(added)}
    json.dump(report, open(os.path.join(OUT, 'fonts.json'), 'w'), ensure_ascii=False, indent=1)
    print('extra CJK beyond 一级字:', len(added), ''.join(added))


if __name__ == '__main__':
    main()
