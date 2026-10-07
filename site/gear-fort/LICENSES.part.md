# 机关守城 (gear-fort) — asset licences

- **Art**: every sprite (units, machines, bosses, board, portraits, icons) is drawn in code at runtime
  (`src/art/parts.ts`, `src/art/rigs.ts`, `src/render/board.ts`, `src/art/icons.ts`) — original work of this project.
- **Sound effects**: synthesized at runtime with Web Audio (`src/audio/sfx.ts`: bronze bells, wood knocks, drums) — original.
  UI sounds come from the kit (`public/audio/sfx/`, licences in that manifest / `assets-src/LICENSES.md`).
- **Fonts**: the kit's subsets (LXGW WenKai, ZCOOL KuaiLe, Baloo 2 — OFL), see the platform ledger.
- **Narration**: `content/gear-fort/narration.yaml` → `public/audio/gear-fort/` (555 clips + `audio-manifest.json`, AAC 40 kbps mono), generated locally per docs/VOICE.md with the `qwen3` engine = Qwen3-TTS-12Hz 0.6B CustomVoice, mlx-community 8-bit (**Apache-2.0**); voice presets: 墨子 = `dad` role (Uncle_Fu), 鲁班 = `luban` role (Dylan, pitch 0.96 + warm EQ), narrator = Serena, companion = Vivian + robot fx; QC by the pipeline's local ASR. Generated 2026-10-07 (457 clips) and 2026-10-07 fix round 1 (+50: 鲁班说 narrator fallback lines, 附加题 lines). Seeds in `content/gear-fort/_takes/`. Output: our own recordings, no third-party audio. `narration.luban.yaml` (鲁班, 48 lines) generated 2026-10-08 with his own `luban` role (555 clips in total). Platform ledger: docs/VOICE.md (engines table).
- **Data**: levels / waves / bands are exported from the project's own prototype (`~/kid-games-work/specs/lane-defense-tools`).
- `site/gear-fort/src/fonts/gf-wenkai-extra.woff2` (28 glyphs, 11 KB) and `gf-kuaile-extra.woff2` (25 glyphs, 5 KB) — subsets of
  LXGW WenKai GB Medium and ZCOOL KuaiLe (SIL OFL 1.1, same sources and licences as the kit fonts: public/fonts/licenses/),
  built with pyftsubset for the characters the kit's 3500-character subsets lack (弩 蒺 藜 礌 檑 牒 枭 鸢 驿 橐 …). K4 stopgap:
  remove when the kit subsets include them.
