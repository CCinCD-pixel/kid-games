# Asset licence ledger

Every third-party or generated asset that ships in `public/` or is bundled from `site/` must have a
row here **before** it is committed (plan §6.8 DoD 7). Source files (PSD, Blender, raw recordings,
fonts before subsetting) live in `assets-src/` and are never published.

| Asset (path in repo) | Source / author | Licence | Modified? | Added by / date |
|---|---|---|---|---|
| public/sokoban/assets/** (block_01, crate_01, player_01) | Kenney "Sokoban Pack" (kenney.nl) — see public/sokoban/assets/License.txt | CC0 1.0 | no | Phase 0, 2026-10 |
| public/icons/icon.svg + PNG renders | own work (Dad / project) | project | rendered by tools/generate-icons.mjs | 2026-10 |
| public/dev/kit/audio/*.m4a | macOS `say` (voice Tingting), demo/test clips only | Apple system voice output, internal testing only — not shipped as game content | AAC re-encode | foundation, 2026-10-05 |
| public/fonts/wenkai-gb-medium-3500.woff2 | 霞鹜文楷 GB v1.522 Medium (LXGW, github.com/lxgw/LxgwWenkaiGB) | SIL OFL 1.1 (RFN 霞鹜/落霞孤鹜/LXGW; the author additionally allows subset/WOFF2 web versions to keep the name). Licence text: public/fonts/licenses/LXGW-WenKai-GB-OFL.txt | subset: 3500 一级字 (《通用规范汉字表》) + 68 myth/space extras + ASCII, CJK punctuation, pinyin tone letters, maths signs; registered as CSS family "XG WenKai"; never offered as a desktop download | design system, 2026-10-05 |
| public/fonts/zcool-kuaile-3500.woff2 | 站酷快乐体 ZCOOL KuaiLe Regular (github.com/google/fonts ofl/zcoolkuaile) | SIL OFL 1.1 (no RFN). public/fonts/licenses/ZCOOL-KuaiLe-OFL.txt | same subset; titles only ("XG KuaiLe") | design system, 2026-10-05 |
| public/fonts/baloo2-vf-latin.woff2 | Baloo 2 variable wght 400–800 (github.com/google/fonts ofl/baloo2) | SIL OFL 1.1 (no RFN). public/fonts/licenses/Baloo2-OFL.txt | Latin, digits, maths operators only ("XG Baloo") | design system, 2026-10-05 |
| public/audio/sfx/*.m4a (37 files; exact source file per sound in public/audio/sfx/manifest.json `source`) | Kenney Interface Sounds (17), Impact Sounds (9), Casino Audio (4), Music Jingles (4), Digital Audio (3) — kenney.nl | CC0 1.0 (licence texts: assets-src/design-system/licenses/kenney_*-License.txt) | trimmed, mono AAC 44.1 kHz, loudness-normalised per category | design system, 2026-10-05 |
| public/audio/sfx/*.m4a (25 files, `source: original synth`) | own work: assets-src/design-system/_src/sfx_synth.py (pentatonic marimba/bell feedback, companion blips, whooshes, launch, eat/pick) | project-owned, dedicated CC0 | — | design system, 2026-10-05 |
| kit/companion/art.ts (companion robot 领航员: parametric SVG + LED dot-matrix faces) | own work (design system) | project | — | design system, 2026-10-05 |
| kit/ui/icons.generated.ts (43 UI icons), assets-src/design-system/icons/ui/*.svg | own work: assets-src/design-system/_src/build_ui_icons.mjs | project | — | design system, 2026-10-05 |
| kit/ui/emblems.generated.ts, public/icons/games/*.svg (13 game emblems) | own work: assets-src/design-system/_src/build_game_icons.mjs (memory, numbers and the 机关守城 defense emblem added at integration) | project | — | design system 2026-10-05; integration 2026-10-05 |
| kit/textures/paper-light, paper-night, grain-overlay, speckle-overlay, kraft (.webp) | own work: assets-src/design-system/_src/build_textures.py (FFT noise + drawn fibres) | project | — | design system, 2026-10-05 |
| kit/textures/hub-{portrait,landscape}.webp, scene-{portrait,landscape}.webp (paper-cut 星港 night port) | own work: assets-src/design-system/_src/hub_scene.mjs, rasterised offline (build_scenes.sh); hub backdrops rendered without a moon (the hub draws today's phase live) | project | — | design system, 2026-10-05 |
| public/audio/hub/*.m4a (hub + companion greetings) | local TTS: Qwen3-TTS-12Hz 0.6B CustomVoice, mlx-community 8-bit conversion @049ef77f (voice "Vivian" + robot fx), built by tools/voice | Apache-2.0 (model); output project-owned | loudness-normalised, AAC 40 kbps mono | integration, 2026-10-05 |
| charset list for the font subsets (not shipped) | 《通用规范汉字表》(2013) 一级字表, data file from github.com/shengdoushi/common-standard-chinese-characters-table | government standard (public); used as data only | — | design system, 2026-10-05 |

Rules
- Allowed: CC0, CC-BY (credited on the CREDITS page /credits/ — keep site/credits/ in sync with this table), OFL for fonts, our own work,
  output of local TTS models whose licence allows it (record model + licence per batch).
- Not allowed: anything "free for personal use" without a written licence, ripped game assets,
  emoji used as characters (plan DoD 7).
- Fonts: record the subset (character list) and the original file's licence.
