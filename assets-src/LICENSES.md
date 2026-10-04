# Asset licence ledger

Every third-party or generated asset that ships in `public/` or is bundled from `site/` must have a
row here **before** it is committed (plan §6.8 DoD 7). Source files (PSD, Blender, raw recordings,
fonts before subsetting) live in `assets-src/` and are never published.

| Asset (path in repo) | Source / author | Licence | Modified? | Added by / date |
|---|---|---|---|---|
| public/sokoban/assets/** (block_01, crate_01, player_01) | Kenney "Sokoban Pack" (kenney.nl) — see public/sokoban/assets/License.txt | CC0 1.0 | no | Phase 0, 2026-10 |
| public/icons/icon.svg + PNG renders | own work (Dad / project) | project | rendered by tools/generate-icons.mjs | 2026-10 |
| public/dev/kit/audio/*.m4a | macOS `say` (voice Tingting), demo/test clips only | Apple system voice output, internal testing only — not shipped as game content | AAC re-encode | foundation, 2026-10-05 |

Rules
- Allowed: CC0, CC-BY (credit in the parent page "关于"), OFL for fonts, our own work,
  output of local TTS models whose licence allows it (record model + licence per batch).
- Not allowed: anything "free for personal use" without a written licence, ripped game assets,
  emoji used as characters (plan DoD 7).
- Fonts: record the subset (character list) and the original file's licence.
