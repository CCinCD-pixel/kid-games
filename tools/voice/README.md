# tools/voice — local narration pipeline

`content/narration/<game>.yaml` → engine → cache → ffmpeg → `public/audio/<game>/<stem>.<hash8>.m4a`
+ `audio-manifest.json` (the only thing the game reads, see the repo's `kit/narration.ts`) → ASR QC
report. Swapping the engine changes the files and nothing else.

Setup, everyday use and the memory-safe procedure: **docs/VOICE.md** (repo root). This file is
the technical reference for the pipeline code in `tools/voice/voice/`.

Layout: code in the repo (`tools/voice/`: `voice/` package, `voice.sh`, `memrun.sh`,
`build-repo.sh`, `requirements.lock.txt`, `eval/` QC calibration set); everything machine-local
under `$VOICE_HOME` (default `~/kid-games-work/voice`: `.venv/`, `hf/` + `models/` weights,
`cache/`, `reports/`, `logs/`, `out/`) — never in git, never in /tmp.

CLI (`tools/voice/voice.sh …` = `python -m voice …` with the venv, `HF_HOME` and offline mode set):
`build --game <id> [--engine qwen3|kokoro|say] [--content DIR] [--out DIR] [--only 'id*'] [--no-qc]
[--reroll N] [--batch N ≤ 20] [--prune]`, `engines`, `selftest`, `setup --engine qwen3|kokoro|asr`,
`numbers --game numbers --max 1000`, `compare`.

## Engines (`voice/engines/`)

| name | what | when |
|---|---|---|
| `qwen3` (default) | Qwen3-TTS 0.6B CustomVoice 8-bit, MLX/Metal. narrator = Serena, companion = Vivian | product voice |
| `kokoro` | Kokoro-82M v1.1-zh int8, sherpa-onnx CPU | light fallback, sentences only |
| `say` | macOS `say` Tingting | instant previews; robotic |
| `cloud` | stub (SSML phoneme locks ready) | the seam for a paid voice |

Adding or swapping an engine means writing one class (`load`, `synth(text, role, seed) → (float32, sr)`,
`voices` presets, `version`) and registering it in `engines/__init__.py`. Each role preset has two
halves. `synth` holds the engine's own voice parameters and goes into the raw cache key. `post`
holds the ffmpeg tempo, pitch and fx and only changes the final key, so retuning the robot effect
never reruns the model. The companion robot is Vivian with +3 % pitch, 0.97 tempo and `fx.ROBOT`
(7/11 ms comb echo, 10 % log bit-crush, +2 dB at 3 kHz).

## What happens in a build

1. **plan**: render the text per engine. A polyphone lock becomes a homophone (`还书` → `环书`)
   only when it can matter (a polyphonic char, and either a line lock or a context G2P that
   disagrees). Keys:
   `raw = sha1(engine, version, voice, seed, text)`, `key = sha1(raw, role, post, speed, pipeline v3, loudness, codec)`.
2. **synthesise**: missing raw wavs only. The work runs in separate worker processes of ≤ 20
   lines each, one at a time, in the foreground under `memrun.sh` (waits until ≥ 30 % memory is
   free, kills above 4000 MB RSS/phys_footprint). Qwen3 runs with `mx.set_memory_limit(2.5 GB)`,
   `set_cache_limit(128 MB)`, `clear_cache()` per line and streaming decode.
3. **post**: high-pass, trim silence, preset shaping, 50 ms lead and 200 ms tail, and R128 static
   gain to −16 LUFS with a peak limiter so the AAC true peak stays ≤ −1.5 dBTP. Then `-ar 44100`,
   AAC-LC mono 40 kbps `.m4a` with faststart.
4. **QC**: Paraformer-zh int8 ASR round-trip (~0.85 GB, 2 s per 10 clips). It produces a CER,
   syllable errors on fuzzy toneless pinyin (in/ing, 啦/了 merged; same-char = not an error),
   polyphone status, speech-structure checks (pace = articulation rate / chars per second, a
   duration window for words and numbers, long internal pauses) and flags. Hard flags (`cer
   polyphone pace dur pause empty`) re-roll the seed up to 3 times on stochastic engines, and the
   best `qc.score` wins. Winning seeds go to `content/narration/_takes/<game>.<engine>.json`.
5. **manifest + report**: `words` timings come from `timing.estimate`, which splits the text into
   punctuation phrases, matches them to detected pauses, and spreads time inside each phrase by
   syllable count. The ASR path (`timing.from_asr`) is wired up, but this Paraformer export returns
   no token timestamps, so every clip uses `estimate` and the report says so per clip. Reports go
   to `reports/<game>.<engine>.qc.{json,md}`.

## Known limits

* Qwen3 0.6B samples, so roughly 1 line in 4 needs a re-roll: a mumbled preamble, a repeated
  word, a stall, or a mis-said rare word (星港 sometimes comes out as 香港). QC catches these. A
  clip that is still hard-flagged after 4 seeds needs a person to listen to it.
* The ASR cannot hear which reading a char got when it writes the same char back (长大 → 长), so
  most polyphones stay "unverified". A MISMATCH is only reported when it writes a different
  char.
* The Kokoro int8 model returns NaN or garbage for 1–2 syllable inputs, and does so
  nondeterministically: words and numbers come out empty or flagged. Its own speed must stay at
  1.0 (slower settings add a "了" after commas). It reads 卷走 as quán.
* macOS `say` is not licensed as a product voice. Keep it for previews.
