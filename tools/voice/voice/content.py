"""Load content/narration/<game>.yaml (the repo's contract, content/narration/README.md).

game: hub
seed: 1234                       # optional, default seed for every line of this file
lines:
  - id: hub.greet.morning        # unique, no whitespace
    role: companion              # narrator | companion | word | dad
    text: 早上好，小步步！         # subtitle text (spoken unless norm/speakText is given)
    norm: ...                    # optional: what the engine reads (alias: speakText)
    pinyin: {还书: huán shū}      # optional polyphone locks (alias: polyphoneLocks); site-wide: _lexicon.yaml
    speed: 0.85                  # optional tempo factor (ffmpeg atempo, pitch kept)
    seed: 7                      # optional: re-roll a bad take
    notes: free text
words:                           # tap-to-read words -> ids "<game>.w.<word>", role word
  - 长大
  - {text: 行, pinyin: háng, id: story.w.hang}
"""
from __future__ import annotations
import re
from dataclasses import dataclass, field
from pathlib import Path

import yaml

from . import config, textnorm
from .pinyin import resolve, to_marked, toned_pinyin

# same rules as tools/check-content.mjs (repo) so a bad line fails here, before any audio is made
TONE_RULES = [
    (r"宝宝真棒|真聪明|天才", "praise the process, not the child"),
    (r"提升智力|开发智力|开发大脑|提高智商", "no 'boosts intelligence' claims"),
    (r"错了|答错|做错|你错|错误", "never show the word 错 to the child"),
    (r"重玩一遍拿满分|拿满分", "never push for perfect scores"),
    (r"难过|伤心|哭了|好想你|想你了|舍不得|别走|不要走|孤单|失望|你去哪了|丢下我", "companion never sounds sad / guilt-trips"),
    (r"快点|来不及|时间到", "no time pressure"),
]


@dataclass
class Item:
    id: str
    role: str
    text: str                 # display text (subtitle)
    spoken: str               # what is read, before engine-specific pinyin rendering
    overrides: dict = field(default_factory=dict)   # {char_index_in_spoken: tone3}
    forced: frozenset = frozenset()                  # override indices written on the line itself (not lexicon)
    seed: int = 1234
    speed: float = 1.0
    kind: str = "line"        # line | word
    word_pinyin: str | None = None
    notes: str | None = None
    templated: bool = False
    base_seed: int | None = None   # seed from the yaml (re-rolls try base_seed+1, +2, ...)
    # filled by build
    rendered: str = ""
    raw_key: str = ""
    key: str = ""
    recording: Path | None = None

    @property
    def hash8(self) -> str:
        return self.key[:8]

    @property
    def stem(self) -> str:
        """File-name stem: the id, with CJK chars spelled in tone3 pinyin (URL/FS-safe; the id itself
        stays the manifest key, e.g. "story-box.w.长大" -> story-box.w.zhang3da4.<hash8>.m4a)."""
        if re.fullmatch(r"[A-Za-z0-9_.:-]+", self.id):
            return self.id
        py = {i: p for i, _, p in toned_pinyin(self.id)}
        return "".join(py.get(i) or (c if re.fullmatch(r"[A-Za-z0-9_.-]", c) else "_") for i, c in enumerate(self.id))

    def expected_pinyin(self) -> list[str]:
        """tone3 per CJK char of `spoken`, overrides applied (for QC)."""
        return [p for _, _, p in toned_pinyin(self.spoken, self.overrides)]


def _lexicon(content_dir: Path) -> dict:
    p = content_dir / "narration" / "_lexicon.yaml"
    if not p.exists():
        return {}
    data = yaml.safe_load(p.read_text("utf-8")) or {}
    return {str(k): str(v) for k, v in data.items()}


def lint(text: str) -> list[str]:
    if "tone-ok" in text:
        return []
    return [f'"{re.search(r, text).group(0)}": {why}' for r, why in TONE_RULES if re.search(r, text)]


def load(game: str, content_dir: Path | None = None) -> tuple[dict, list[Item]]:
    content_dir = Path(content_dir or config.CONTENT)
    path = content_dir / "narration" / f"{game}.yaml"
    if not path.exists():
        raise SystemExit(f"no content file {path}")
    doc = yaml.safe_load(path.read_text("utf-8")) or {}
    if doc.get("game", game) != game:
        raise SystemExit(f"{path}: game: {doc.get('game')} != {game}")
    lex = _lexicon(content_dir)
    base_seed = int(doc.get("seed", 1234))
    overrides_dir = content_dir / "narration" / "overrides"
    items, errors, seen = [], [], set()

    def add(it: Item):
        it.base_seed = it.seed
        if not re.fullmatch(r"\S+", it.id):
            errors.append(f"{it.id!r}: id must not contain whitespace")
        if it.id in seen:
            errors.append(f"{it.id}: duplicate id")
        seen.add(it.id)
        if it.role not in config.ROLES:
            errors.append(f"{it.id}: role {it.role!r} not in {config.ROLES}")
        for p in lint(it.text):
            errors.append(f"{it.id}: tone {p}")
        for ext in ("m4a", "wav", "aiff", "mp3"):
            rec = overrides_dir / f"{it.id}.{ext}"
            if rec.exists():
                it.recording = rec
                break
        items.append(it)

    for ln in doc.get("lines") or []:
        lid, text = str(ln.get("id", "")), str(ln.get("text", "")).strip()
        if not lid or not text:
            errors.append(f"line without id/text: {ln}")
            continue
        norm = ln.get("norm", ln.get("speakText"))
        templated = bool(re.search(r"\{\w+\}", text))
        if templated and not norm:
            errors.append(f"{lid}: templated text needs norm: (what the engine should read)")
            continue
        sp = textnorm.spoken(str(norm) if norm else text)
        locks = ln.get("pinyin", ln.get("polyphoneLocks")) or {}
        try:
            own = resolve(sp, {str(k): str(v) for k, v in locks.items()}, None)
            ov = {**resolve(sp, None, lex), **own}
        except ValueError as e:
            errors.append(f"{lid}: {e}")
            own, ov = {}, {}
        add(Item(id=lid, role=str(ln.get("role", doc.get("role", "narrator"))), text=text, spoken=sp,
                 overrides=ov, forced=frozenset(own), seed=int(ln.get("seed", base_seed)),
                 speed=float(ln.get("speed", 1.0)), notes=ln.get("notes"), templated=templated))

    for w in doc.get("words") or []:
        if isinstance(w, str):
            w = {"text": w}
        text = str(w["text"]).strip()
        py = w.get("pinyin")
        wid = str(w.get("id") or f"{game}.w.{text}")
        try:
            ov = resolve(text, {text: str(py)}, None) if py else resolve(text, None, lex)
        except ValueError as e:
            errors.append(f"{wid}: {e}")
            ov = {}
        it = Item(id=wid, role=str(w.get("role", "word")), text=text, spoken=textnorm.spoken(text), overrides=ov,
                  forced=frozenset(ov) if py else frozenset(),
                  seed=int(w.get("seed", base_seed)), speed=float(w.get("speed", 1.0)), kind="word",
                  notes=w.get("notes"))
        it.word_pinyin = " ".join(to_marked(p) for p in it.expected_pinyin())
        add(it)

    if errors:
        raise SystemExit(f"{path}:\n  " + "\n  ".join(errors))
    return doc, items
