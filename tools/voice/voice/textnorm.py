"""Text normalisation for TTS input and for ASR scoring.

spoken(text): what the engine reads — Arabic numerals become Chinese numerals, with 两 before a
measure word ("2个" -> 两个, "200块" -> 两百块), years read digit by digit ("2019年" -> 二零一九年),
decimals with 点. Content authors can always bypass this with `norm:` in the YAML.
"""
from __future__ import annotations
import re

MEASURE = set("个只块根条张头匹辆次步颗位名本棵朵双件枚粒层台架艘把支杯页关颗片座栋间瓶盒袋份道题行列格天年岁米分秒")
DIGITS = "零一二三四五六七八九"
CJK = re.compile(r"[㐀-鿿]")
PUNCT_BREAK = set("，。！？；：、…—,.!?;:")
FULLWIDTH_DIGITS = str.maketrans("０１２３４５６７８９．", "0123456789.")


def int2cn(n: int) -> str:
    import cn2an
    return cn2an.an2cn(str(n), "low")


def _num(m: re.Match, s: str) -> str:
    raw = m.group(0)
    nxt = s[m.end():m.end() + 1]
    if "." in raw:
        a, b = raw.split(".", 1)
        return int2cn(int(a)) + "点" + "".join(DIGITS[int(d)] for d in b)
    if nxt == "年" and len(raw) == 4:
        return "".join(DIGITS[int(d)] for d in raw)
    if len(raw) > 1 and raw.startswith("0"):
        return "".join(DIGITS[int(d)] for d in raw)
    n = int(raw)
    cn = int2cn(n)
    if nxt in MEASURE and cn.startswith("二") and (n == 2 or cn[1:2] in ("百", "千", "万")):
        cn = "两" + cn[1:]
    return cn


def spoken(text: str) -> str:
    s = text.translate(FULLWIDTH_DIGITS)
    return re.sub(r"\d+(?:\.\d+)?", lambda m: _num(m, s), s)


def for_scoring(text: str) -> str:
    """CJK + latin letters only, numerals spelled out — used for CER."""
    s = spoken(text)
    return "".join(ch for ch in s if CJK.match(ch) or ch.isalpha())
