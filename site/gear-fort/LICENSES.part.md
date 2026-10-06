# 机关守城 (gear-fort) — asset licences

- **Art**: every sprite (units, machines, bosses, board, portraits, icons) is drawn in code at runtime
  (`src/art/parts.ts`, `src/art/rigs.ts`, `src/render/board.ts`, `src/art/icons.ts`) — original work of this project.
- **Sound effects**: synthesized at runtime with Web Audio (`src/audio/sfx.ts`: bronze bells, wood knocks, drums) — original.
  UI sounds come from the kit (`public/audio/sfx/`, licences in that manifest / `assets-src/LICENSES.md`).
- **Fonts**: the kit's subsets (LXGW WenKai, ZCOOL KuaiLe, Baloo 2 — OFL), see the platform ledger.
- **Narration**: `content/gear-fort/narration.yaml` (+ `narration.luban.yaml`) → local TTS per docs/VOICE.md (not generated yet).
- **Data**: levels / waves / bands are exported from the project's own prototype (`~/kid-games-work/specs/lane-defense-tools`).
