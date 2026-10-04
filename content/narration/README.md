# content/narration/

One YAML file per game: `content/narration/<game>.yaml`. The voice pipeline (free local TTS today,
swappable later — it lives outside this repo under ~/kid-games-work/voice) turns it into
`public/audio/<game>/<id>.<hash8>.m4a` plus `public/audio/<game>/audio-manifest.json`, which is
the only thing the game reads at runtime (kit/narration.ts).

```yaml
# content/narration/mars-base.yaml
game: mars-base
lines:
  - id: mars.intro.1          # unique, no spaces; prefix with the game's short name
    role: narrator            # narrator | companion | word | dad  (voice preset in the pipeline)
    text: 欢迎来到火星基地！    # shown as subtitle, spoken unless `norm` is given
  - id: mars.count.result
    role: companion
    text: 一共有 {n} 块晶体。   # {n}: filled at runtime in the subtitle (narrator.say(id, {vars}))
    norm: 一共有好多块晶体。    # optional: what the TTS actually reads (digits spelled out, etc.)
    pinyin: { 还书: huán shū }  # optional polyphone locks for this line (site-wide: _lexicon.yaml)
words:                        # optional: tap-to-read words (StoryKit) → ids "<game>.w.<word>"
  - 长大
  - 银行
```

Generated manifest (do not edit by hand):

```json
{
  "mars.intro.1": { "src": "/audio/mars-base/mars.intro.1.3f9a2c1d.m4a", "text": "欢迎来到火星基地！",
                    "durationMs": 1830, "role": "narrator",
                    "words": [{ "ch": "欢", "t0": 0, "t1": 180 }] }
}
```

- Audio: AAC in .m4a, mono, 22.05–44.1 kHz, ~48–64 kbps; loudness-normalised by the pipeline.
- File names are content-addressed (hash of text + voice + engine version + seed), so the
  service worker's media cache keeps unchanged clips across deploys.
- A line without a clip still works: the runtime falls back to speechSynthesis (zh-CN) and always
  shows the subtitle. `npm run build` fails if a manifest points at a missing file.
