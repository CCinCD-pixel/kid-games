# 陆战棋 — asset sources (to merge into `assets-src/LICENSES.md` and `/credits/`: platform request, spec §8.12 #2)

| Asset | Source | Licence | Processing |
|---|---|---|---|
| Board frame wood texture `assets/wood-512.webp` (512×512, 22 KB, seamless) | Procedurally generated for this game by `tools/military-chess/wood.py` (fBm-warped ring field, integer frequencies so it tiles) | Project's own (CC0 1.0) | WebP; no third-party input |
| Board, railways, camps, mountains, HQs, the 12 piece kinds (front/back, wide/tall), rank badges, shoulder-board insignia, icons, knowledge-card and rule-card art, companion hats, promotion ceremony (`src/view/*`: `board-svg.ts`, `pieces-svg.ts`, `insignia.ts`, `icons.ts`, `cards-art.ts`, `knowledge-art.ts`, `rule-art.ts`, `hats.ts`, `promo.ts`) | Drawn in code for this game (inline SVG) | Project's own (CC0 1.0) | Built at runtime; no image files besides the wood texture are shipped |
| 10 game-specific sound effects (`mc.flip`, `mc.clash`, `mc.mine`, `mc.bomb`, `mc.flag`, `mc.rail`, `mc.handoff`, …) | Synthesised at runtime with Web Audio by `src/audio/synth.ts` (oscillators, filtered noise, envelopes) | Project's own (CC0 1.0) | No audio files; generated on the device |
| Camp ambience (16 bars, hand-written score) | `src/audio/ambience.ts`, composed for this game and played with Web Audio instruments | Project's own (CC0 1.0) | No audio files |
| Narration `public/audio/military-chess/*.m4a` (342 clips, 5.0–5.7 MB) + `audio-manifest.json` | Generated locally with `tools/voice` (docs/VOICE.md): Qwen3-TTS-12Hz 0.6B CustomVoice, mlx-community 8-bit conversion — narrator voice "Serena", companion 领航员 voice "Vivian" + robot fx (comb echo, light bit-crush, +3 % pitch); takes/seeds in `content/military-chess/_takes/military-chess.qwen3.json`, QC'd by local ASR (CER 0.0645, polyphone mismatches 0) | Apache-2.0 (model); the rendered audio is project-owned | AAC-LC mono 44.1 kHz 40 kbps `.m4a` (faststart), loudness per docs/VOICE.md; manifest texts = `content/military-chess/lines.json`; batch 2026-10-06 (voice step) |
| The 62 design-system sound effects, UI sounds, companion robot, fonts (subsets), kit icons and emblems | kit / 星港 design system | See `assets-src/LICENSES.md` | Unchanged |

No third-party image, music or sound file is shipped by this game. Rules content follows the public 陆战棋 rules
(spec Appendix A); every lesson, endgame and reply book is generated / verified by the game's own tools.
Knowledge-card facts: written for this game (`content/military-chess/cards.json`; Dad checks and signs, spec §9.7).
