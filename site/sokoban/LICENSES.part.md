# 星港搬运工 — asset sources (to merge into `assets-src/LICENSES.md` and `/credits/`: platform request §8.12 #6)

| Asset | Source | Licence | Processing |
|---|---|---|---|
| Board tiles, crates, pads, cargo halls (天宫 / 月宫 / 火星 / 经典), robot 小推 and its 6 animation sets, rockets + launch scenes, cargo map, emblems, knowledge-card paper cuts, certificate, hangar cosmetics, icons (`src/render/*`, `src/art/*`) | Drawn in code for this game (Canvas 2D / inline SVG) | Project's own | Rasterised at runtime (`src/render/canvasPool.ts`); no image files are shipped |
| `assets/sfx/sok-land.m4a` (0.12 s) | Kenney *Impact Sounds* — `impactWood_medium_002.ogg` (pack already on disk: `~/kid-games-work/design-system/_src/sfx/`) | CC0 1.0 (kenney.nl) | `tools/sokoban/audio/build_sfx.py`: first 120 ms, low-pass 1.4 kHz, mono 44.1 kHz, −18 LUFS short-term, peak −1 dBFS, AAC-LC 64 kbps |
| `assets/sfx/sok-unlatch.m4a` (0.21 s) | Kenney *Interface Sounds* — `switch_003.ogg` | CC0 1.0 (kenney.nl) | reversed, high-pass 900 Hz; same loudness / encode chain |
| `assets/sfx/sok-lockchime.m4a` (0.55 s) | Original synthesis (`build_sfx.py`: sine 2 kHz + 3 kHz partials, 400 ms decay, light reverb) | Project's own (CC0 1.0) | pitched up per lock-in at runtime (`src/audio/sfx.ts`) |
| `assets/sfx/sok-rewind.m4a` (0.28 s) | Original synthesis (design-system whoosh-down from `sfx_synth.py`, reversed, ×1.35 pitch, 22 Hz flutter) | Project's own (CC0 1.0) | same chain |
| `assets/sfx/sok-ignite.m4a` (1.26 s) | Original synthesis (noise through a falling low-pass sweep + rumble + crackle) | Project's own (CC0 1.0) | same chain |
| `assets/sfx/sok-conveyor.m4a` (1.17 s loop) | Original synthesis (roller pulses + gear clicks + belt hum) | Project's own (CC0 1.0) | −20 LUFS, seamless loop |
| Menu music 星港夜班 `assets/music/night-shift.m4a` (68.6 s loop, ♩ = 84, C major pentatonic) | Composed and synthesised for this game by `tools/sokoban/audio/build_music.py` (marimba melody, triangle pad, sine bass, brushes; instruments from `sfx_synth.py`) | Project's own (CC0 1.0) | rendered twice (reverb tail wraps into the start), integrated −23 LUFS, peak −9.3 dBFS, AAC-LC stereo 80 kbps (report: `tools/sokoban/audio/music-report.json`) |
| `tools/sokoban/audio/sfx_synth.py` | Verbatim copy of the 星港 design system's `_src/sfx_synth.py` (original synthesis code) | Project's own (CC0 1.0) | not shipped to the page; build tool only |
| The other 62 game sounds, UI sounds, companion robot, fonts, emblems/icons from the kit | kit / 星港 design system | See `assets-src/LICENSES.md` | Unchanged |
| Narration `public/audio/sokoban/*.m4a` (167 clips, 2.6 MB) + `audio-manifest.json` | Generated locally with `tools/voice` (docs/VOICE.md): Qwen3-TTS-12Hz 0.6B CustomVoice, mlx-community 8-bit conversion @049ef77f — narrator voice "Serena", companion 领航员 voice "Vivian" + robot fx (comb echo, light bit-crush, +3 % pitch); takes/seeds in `content/sokoban/_takes/sokoban.qwen3.json`, QC'd by local ASR | Apache-2.0 (model); the rendered audio is project-owned | loudness −16 LUFS, AAC-LC mono 44.1 kHz 40 kbps `.m4a` (faststart); manifest texts = `content/sokoban/lines.json`; batch 2026-10-06 (voice step) |

No third-party image or music file is shipped by this game. Narration is locally generated TTS (row above;
`content/sokoban/voice.json` = `{ "clips": true }`); without clips the game falls back to subtitles + the system voice.
Knowledge-card facts: sources listed per card in `content/sokoban/cards.json` (Dad checks and signs, Release DoD 3).
