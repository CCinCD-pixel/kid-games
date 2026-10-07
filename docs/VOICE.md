# Voice: narration with a free local TTS (swappable)

Dad's rule 11: narration uses a **free local TTS now** and must be swappable later (a paid voice,
or Dad's own recordings). The game never knows which engine made a clip: it only reads
`public/audio/<game>/audio-manifest.json` (kit/narration.ts).

```
content/narration/<game>.yaml ──► tools/voice (engine → cache → ffmpeg → ASR QC)
                                   ──► public/audio/<game>/<id>.<hash8>.m4a + audio-manifest.json   (committed)
                                   ──► content/narration/_takes/<game>.<engine>.json                  (committed: chosen seeds)
                                   ──► $VOICE_HOME/reports/<game>.<engine>.qc.{md,json}               (local)
```

| where | what | in git? |
|---|---|---|
| `content/narration/<game>.yaml` | every spoken line (format: content/narration/README.md) | yes |
| `content/narration/_lexicon.yaml` | site-wide polyphone locks (`银行: yín háng`) | yes |
| `content/narration/_takes/` | QC-chosen seeds, so rebuilds reproduce the same takes | yes |
| `content/narration/overrides/<id>.m4a\|wav` | Dad's recording for a line — replaces the engine for that id | yes |
| `tools/voice/` | pipeline code (`voice/` Python package), `voice.sh`, `memrun.sh`, `build-repo.sh`, requirements lock, QC calibration set (`eval/`) | yes |
| `public/audio/<game>/` | generated clips + manifest | yes |
| `$VOICE_HOME` (default `~/kid-games-work/voice`) | `.venv/`, model weights (`hf/`, `models/`), synthesis cache, reports, logs | **never** |

## Setup (once per machine, ~3 GB on disk)

```sh
export VOICE_HOME=~/kid-games-work/voice        # the default; persistent, NOT /tmp
mkdir -p $VOICE_HOME && cd $VOICE_HOME
uv venv --python 3.11 .venv
uv pip install --python .venv/bin/python -r ~/github/kid-games/tools/voice/requirements.lock.txt
brew install ffmpeg                             # 8.x; AAC uses AudioToolbox (aac_at)
cd ~/github/kid-games
memory_pressure -Q | tail -1                    # ≥ 25 % free before any model work
HF_HUB_OFFLINE=0 tools/voice/voice.sh setup --engine qwen3   # Qwen3-TTS 0.6B CustomVoice 8-bit @049ef77f (1.9 GB)
HF_HUB_OFFLINE=0 tools/voice/voice.sh setup --engine asr     # Paraformer-zh int8 for QC (217 MB)
HF_HUB_OFFLINE=0 tools/voice/voice.sh setup --engine kokoro  # optional light fallback (208 MB)
tools/voice/voice.sh engines && tools/voice/voice.sh selftest
```
Downloads run one at a time under `memrun.sh`. Builds run with `HF_HUB_OFFLINE=1` and never touch
the network.

## Build narration (everyday)

```sh
memory_pressure -Q | tail -1          # check first; the script also refuses below 25 % free
npm run voice:build -- hub            # one game  → public/audio/hub/ (+ content checks)
npm run voice:build                   # every content/narration/*.yaml (except _* and numbers*)
VOICE_ENGINE=say npm run voice:build -- story-box   # instant robotic preview (macOS Tingting; never ship)
```
Then listen (the QC is automatic, the ear review is not): open the clips, or
`tools/voice/voice.sh compare` → `$VOICE_HOME/compare.html` with every engine side by side. Read
`$VOICE_HOME/reports/<game>.qwen3.qc.md` for flagged lines. Commit the m4a files, the manifest
and `_takes/`.

Measured on the 16 GB build Mac (2026-10-05, hub = 23 lines): 61 s wall including QC and one
automatic re-roll; Qwen3 worker peak ≈ 2.1 GB RSS / 2.8 GB footprint, ASR ≈ 0.85 GB; output
≈ 20 KB per line.

## Memory-safe procedure (mandatory — this machine crashed once from a TTS model run)

The 2026-10-05 crash was a full-precision 1.7B TTS model evaluated alongside other work. The
pipeline is built so that cannot happen again; keep it that way:

1. `memory_pressure -Q | tail -1` before starting; below 25 % free, wait (`sleep 60`) instead.
   Close WeCom / CodexBar / extra browsers before a big batch (e.g. the 1 102-clip numbers file).
2. **One model process at a time.** The build process never loads a model; it starts short-lived
   workers of ≤ 20 lines each, sequentially, in the foreground, through `tools/voice/memrun.sh`:
   waits for ≥ 30 % free memory, refuses to run beside another guarded process, kills the whole
   tree above 4 000 MB RSS/phys_footprint or when the system drops below 12 % free.
   Log: `$VOICE_HOME/logs/memrun.log` (peak memory per run).
3. Qwen3 runs with an MLX memory limit of 2.5 GB, a 128 MB cache cleared after every line and
   streaming decode (without it, one 20-second line reached 5 GB).
4. Only the 0.6B 8-bit model is used. Do not load 1.7B / full-precision models on this machine.
5. Every model process is started by absolute path (`$VOICE_HOME/.venv/bin/python -m voice.worker
   …`), so the machine's watchdog (`~/kid-games-work/tools/memguard.sh`) recognises it.
6. Nothing runs in the background; nothing is left running after a build.

## Engines and swapping

| engine | model | licence | role |
|---|---|---|---|
| `qwen3` (default) | Qwen3-TTS-12Hz 0.6B CustomVoice, mlx-community 8-bit | Apache-2.0 | product voice: narrator = Serena, companion = Vivian + robot fx (comb echo, light bit-crush, +3 % pitch), dad = Uncle_Fu, luban = Dylan (see below) |
| `kokoro` | Kokoro-82M v1.1-zh int8 (sherpa-onnx, CPU) | Apache-2.0 | light fallback, sentences only (fails on 1–2 syllable words) |
| `say` | macOS Tingting | Apple system voice | previews only, not a product voice |
| `cloud` | stub with SSML phoneme locks | — | the seam for a paid voice |

### Roles

`role:` on a line picks the voice preset (`tools/voice/voice/config.py` `ROLES`; every engine has a preset per role):

| role | who | qwen3 preset |
|---|---|---|
| `narrator` | story narrator, tap-to-read sentences | Serena, tempo 0.9 |
| `companion` | the robot companion | Vivian + `ROBOT` fx, pitch 1.03, tempo 0.97 |
| `word` | tap-to-read words | Serena, tempo 0.9 |
| `dad` | 墨子 / Dad's lines until his recordings exist (`overrides/`) | Uncle_Fu (older, low, mellow) |
| `luban` | 鲁班, gear-fort's respected rival master-craftsman | Dylan, pitch 0.96 + `WARM` fx (150 Hz chest warmth +2.5 dB, 2.5 kHz presence +1.5 dB) |

`luban` was chosen on 2026-10-08 by an ASR + pace audition of the four male speakers on 鲁班 lines (Uncle_Fu as
reference): Dylan in his own Beijing codec read 8/9 lines with no wrong syllable (the ninth = the 铜犀 ASR bias in Known limits); Dylan forced to 普通话, Eric (Sichuan,
forced to 普通话) and Ryan (English native, accent: 沙盘→傻胖) each misread or babbled at least one. Dylan is a young,
confident voice; −4 % pitch and the warm EQ make him a mature, cheerful master, clearly not 墨子. A preset may set
`"dialect": False` (qwen3 only) to keep a dialect speaker's timbre but ask the model for standard Mandarin.
His Beijing flavour stays light on these lines (no added 儿 in any ASR transcript of the 48 clips), so `luban` keeps it.

Part files: `<game>.<part>.yaml` next to `<game>.yaml` (same `game:`) are merged into that game's build and manifest —
gear-fort keeps 鲁班 in `content/gear-fort/narration.luban.yaml`, staged as `narration/gear-fort.luban.yaml` beside
`gear-fort.yaml` (gear-fort's content lives in its own folder; its build uses a staging dir of symlinks:
`~/kid-games-work/voice-stage/gear-fort/narration/{gear-fort.yaml,gear-fort.luban.yaml,_takes,_lexicon.yaml,overrides}`
→ `voice.sh build --game gear-fort --content ~/kid-games-work/voice-stage/gear-fort --out <repo> --prune`).
`build-repo.sh` skips part files when it lists games.

Swap = one class in `tools/voice/voice/engines/` (`load`, `synth(text, role, seed)`, voice presets,
version) + `--engine <name>`. File names are content-addressed (text, role, engine, version,
voice, seed, post chain), so a swap rewrites the files and the manifest and nothing else; the
service worker's media cache drops stale clips by hash.

Quality gates in every build: ASR round-trip (character error rate, toneless-pinyin syllable
errors, polyphone check), pace / duration / long-pause checks; hard-flagged lines are re-rolled
with new seeds (≤ 3) and the best take wins. A line still flagged after that is left out of the
manifest (the game falls back to the browser voice + subtitle) and listed in the report.

## Output format

AAC-LC mono 44.1 kHz **40 kbps** `.m4a` with faststart, loudness −16 LUFS (measured gain +
peak limiter, true peak ≤ −1.5 dBTP), 50 ms lead / 200 ms tail. Word timings in the manifest are
estimated from pauses and syllable counts (the bundled ASR returns no timestamps).

## Known limits

- Qwen3 0.6B samples: ~1 line in 4 needs a re-roll (mumbled lead-in, repeated word, 星港 heard
  as 香港). QC catches these; still listen to new lines once.
- Rare characters: the 0.6B model may misread a rare character; give the line a `norm:` with a same-sound common
  character (gear-fort: 檑木 → 雷木, 铜犀 → 铜溪/铜锡); the subtitle keeps the real text.
- ASR language-model bias can flag a correct take: 「我的铜犀冲车……」 is always heard as 「我的同期……」 (a common
  word), yet the same audio cut after 我的 is heard 同西 — checked by segment ASR on 2026-10-08. Such a line stays
  hard-flagged in the report with its best take shipped; check it by ear once.
- The ASR cannot confirm which reading a polyphone got when it writes the same character back;
  lock tricky words in `_lexicon.yaml` or with `pinyin:` on the line.
- Lines containing the child's name use the default 小步步. Content that addresses the child by
  name provides a `.plain` variant without the name (the hub does this) for when the parent page
  sets another display name.
