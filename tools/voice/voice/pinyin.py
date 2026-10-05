"""Pinyin utilities + polyphone override rendering for every engine.

Override input (content YAML):   pinyin: {还书: "huán shū", 长: "zhǎng"}   # word -> toned pinyin (marks or digits)
Global lexicon:                    content/narration/_lexicon.yaml  (same format, applied to every line)

An override is resolved to a list of (char_index, toned_syllable) and then rendered per engine
(Engine.pinyin_style):
  homophone  : 还书 -> 环书                 (engines without phoneme input: Qwen3-TTS, Kokoro, macOS say)
  azure/ssml : <phoneme alphabet="sapi" ph="huan 2">还</phoneme>书   (cloud engines with SSML)
  none       : text unchanged
The homophone is the most frequent MONOPHONIC character with exactly that toned syllable.
"""
from __future__ import annotations
import functools, os, re, unicodedata

TONE_MARKS = {"a": "āáǎà", "e": "ēéěè", "i": "īíǐì", "o": "ōóǒò", "u": "ūúǔù", "ü": "ǖǘǚǜ"}
_MARK2 = {m: (v, i + 1) for v, ms in TONE_MARKS.items() for i, m in enumerate(ms)}
INITIALS = ["zh", "ch", "sh", "b", "p", "m", "f", "d", "t", "n", "l", "g", "k", "h", "j", "q", "x", "r", "z", "c", "s", "y", "w"]


def to_tone3(s: str) -> str:
    """'huán' / 'huan2' / 'lü4' / 'le' -> 'huan2', 'lv4', 'le5'"""
    s = s.strip().lower().replace("u:", "ü").replace("v", "ü")
    if s and s[-1].isdigit():
        return s.replace("ü", "v")
    tone, out = 5, []
    for ch in s:
        if ch in _MARK2:
            base, tone = _MARK2[ch]
            out.append(base)
        else:
            out.append(ch)
    return ("".join(out) + str(tone)).replace("ü", "v")


def to_marked(s: str) -> str:
    """'huan2' -> 'huán' (standard placement rules)."""
    s3 = to_tone3(s)
    body, tone = s3[:-1].replace("v", "ü"), int(s3[-1])
    if tone == 5 or tone == 0:
        return body
    for v in ("a", "e"):
        if v in body:
            return body.replace(v, TONE_MARKS[v][tone - 1], 1)
    if "ou" in body:
        return body.replace("o", TONE_MARKS["o"][tone - 1], 1)
    for i in range(len(body) - 1, -1, -1):
        if body[i] in TONE_MARKS:
            return body[:i] + TONE_MARKS[body[i]][tone - 1] + body[i + 1:]
    return body


def split_initial(s: str):
    m = to_marked(s)
    for ini in INITIALS:
        if m.startswith(ini) and len(m) > len(ini):
            return ini, m[len(ini):]
    return "", m


def resolve(text: str, overrides: dict | None, lexicon: dict | None = None):
    """Return {char_index: tone3_syllable} for every override word found in text (all occurrences)."""
    out = {}
    for table in (lexicon or {}, overrides or {}):  # line overrides win
        for word, py in table.items():
            sylls = py.split()
            if len(sylls) != len(word):
                raise ValueError(f"pinyin override {word}:{py} - syllable count != char count")
            for m in re.finditer(re.escape(word), text):
                for k, sy in enumerate(sylls):
                    out[m.start() + k] = to_tone3(sy)
    return out


def render(text: str, idx_map: dict, style: str, forced: set | frozenset = frozenset()) -> str:
    """forced = indices locked by the line itself (pinyin: in the yaml / a word's pinyin) - the author
    heard a wrong reading. Other indices come from the site-wide _lexicon.yaml (preventive)."""
    if not idx_map or style == "none":
        return text
    chars = list(text)
    ctx = None
    for i, sy in sorted(idx_map.items()):
        if style == "cosyvoice3":
            ini, fin = split_initial(sy)
            chars[i] = (f"[{ini}]" if ini else "") + f"[{fin}]"
        elif style == "indextts":
            chars[i] = sy.upper().replace("V", "V")
        elif style in ("azure", "ssml"):
            body, tone = sy[:-1], sy[-1]
            chars[i] = f'<phoneme alphabet="sapi" ph="{body} {tone}">{chars[i]}</phoneme>'
        elif style == "homophone":
            if ctx is None:
                ctx = {k: p for k, _, p in toned_pinyin(text)}
            if not _needs_lock(text[i], sy, i in forced, ctx.get(i)):
                continue  # keep the real char: a substitute could only hurt prosody / word segmentation
            try:
                chars[i] = homophone(sy, avoid=chars[i])
            except KeyError:  # e.g. 大 dà, 卷 juǎn: no single-reading char sounds the same
                if to_tone3(ctx.get(i) or "") != to_tone3(sy):
                    import sys
                    print(f"[pinyin] no monophonic homophone for {sy} ({chars[i]}): lock not applied - "
                          f"rephrase the line or use norm:", file=sys.stderr)
        else:
            raise ValueError(style)
    return "".join(chars)


def _needs_lock(ch: str, sy: str, forced: bool, context_reading: str | None) -> bool:
    """Substitute a homophone only when it can matter:
      * never for a monophonic char (衔 is always xián);
      * always for a lock written on the line itself (the author heard the engine get it wrong);
      * for site-wide lexicon locks, only where a phrase-aware G2P (pypinyin + jieba) would read the
        char differently in this sentence (长大 zhǎng is already right in context -> keep 长)."""
    if not is_polyphone(ch):
        return False
    if forced:
        return True
    return to_tone3(context_reading or "") != to_tone3(sy)


@functools.lru_cache(maxsize=4096)
def is_polyphone(ch: str) -> bool:
    from pypinyin import pinyin, Style
    rs = pinyin(ch, style=Style.TONE3, heteronym=True, neutral_tone_with_five=True)[0]
    return len({r.rstrip("012345") + r[-1:] for r in rs}) > 1


@functools.lru_cache(maxsize=1)
def _homophone_table():
    """tone3 syllable -> most frequent monophonic character (pypinyin dict x jieba char freq)."""
    from pypinyin.pinyin_dict import pinyin_dict
    import jieba
    freq = {}
    with open(os.path.join(os.path.dirname(jieba.__file__), "dict.txt"), encoding="utf-8") as f:
        for line in f:
            p = line.split()
            if len(p) >= 2 and len(p[0]) == 1:
                freq[p[0]] = int(p[1])
    best = {}
    for cp, readings in pinyin_dict.items():
        rs = readings.split(",")
        if len(rs) != 1:
            continue
        ch = chr(cp)
        f = freq.get(ch, 0)
        if f < 500:
            continue
        key = to_tone3(rs[0])
        if f > best.get(key, ("", -1))[1]:
            best[key] = (ch, f)
    return {k: v[0] for k, v in best.items()}


# hand-picked substitutes where the frequency pick is awkward / ambiguous in context
HOMOPHONE_FIXED = {"le5": "了", "liao3": "瞭", "zhang3": "掌", "chang2": "常", "hang2": "航", "xing2": "形",
                   "zhong4": "众", "chong2": "虫", "hai2": "孩", "huan2": "环"}


def homophone(sy: str, avoid: str = "") -> str:
    sy = to_tone3(sy)
    ch = HOMOPHONE_FIXED.get(sy) or _homophone_table().get(sy)
    if not ch:
        raise KeyError(f"no monophonic homophone for {sy}")
    return ch


def toned_pinyin(text: str, idx_map: dict | None = None):
    """Per-character tone3 pinyin for CJK chars of text (pypinyin phrase-aware), overrides applied."""
    from pypinyin import lazy_pinyin, Style
    cjk = [(i, c) for i, c in enumerate(text) if "一" <= c <= "鿿"]
    s = "".join(c for _, c in cjk)
    py = lazy_pinyin(s, style=Style.TONE3, neutral_tone_with_five=True)
    out = []
    for (i, c), p in zip(cjk, py):
        out.append((i, c, (idx_map or {}).get(i, p)))
    return out
