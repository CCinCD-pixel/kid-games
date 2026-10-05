# 星港设计系统 · 素材许可台账

Everything shipped from this folder is either **SIL OFL 1.1** (fonts), **CC0** (Kenney audio), or
**original work made for this project** (icons, emblems, companion, textures, scenes, synth SFX, code).
No NC / BY-SA / unclear-licence material is used. Merge this table into the repo's `assets-src/LICENSES.md`
and the in-app CREDITS page (plan §5.1).

## Fonts (`fonts/`, licence texts in `fonts/licenses/`)

| File | Source | Licence | Notes |
|---|---|---|---|
| `wenkai-gb-medium-3500.woff2` | 霞鹜文楷 GB / LXGW WenKai GB **v1.522** Medium — github.com/lxgw/LxgwWenkaiGB | SIL OFL 1.1, RFN “霞鹜 / 落霞孤鹜 / LXGW” **with the author's additional permission**: subsetted / WOFF2 web-delivery versions may keep the name as long as they are not offered as installable desktop fonts | Subset = 3500 一级字 + 68 extra (myth / space names) + ASCII, CJK punctuation, pinyin tone letters, maths signs. We additionally register it under the CSS family name “XG WenKai”. Never offer the woff2 for download as a desktop font. |
| `zcool-kuaile-3500.woff2` | 站酷快乐体 ZCOOL KuaiLe Regular — github.com/google/fonts `ofl/zcoolkuaile` | SIL OFL 1.1 (no Reserved Font Name) | Same CJK set. Titles only. Free for commercial use. |
| `baloo2-vf-latin.woff2` | Baloo 2 variable (wght 400–800) — github.com/google/fonts `ofl/baloo2` | SIL OFL 1.1 (no RFN) | Digits, Latin, maths operators only. |
| charset list | 《通用规范汉字表》(2013) 一级字表 3500 — data file from github.com/shengdoushi/common-standard-chinese-characters-table | Government standard (public); the list is used as data only, not shipped | `_src/fonts-src/level-1.txt` |

OFL obligations met: licence text shipped next to the fonts; the fonts are never sold on their own;
subsets are “Modified Versions” and carry the original copyright/licence name records (fontTools
`name_IDs=['*']`).

## Sound effects (`sfx/*.m4a`, licence texts in `sfx/licenses/`)

62 sounds, 442 KB total, mono AAC-LC 44.1 kHz, loudness-normalised per category (see `sfx/manifest.json`,
which records the exact source file of every sound).

| Source | Count | Licence |
|---|---|---|
| Kenney **Interface Sounds** 1.0 (kenney.nl/assets/interface-sounds) | 17 | CC0 1.0 |
| Kenney **Impact Sounds** (kenney.nl/assets/impact-sounds) | 9 | CC0 1.0 |
| Kenney **Casino Audio** (kenney.nl/assets/casino-audio) | 4 | CC0 1.0 |
| Kenney **Digital Audio** (kenney.nl/assets/digital-audio) | 3 | CC0 1.0 |
| Kenney **Music Jingles** (kenney.nl/assets/music-jingles) | 4 | CC0 1.0 |
| Original synthesis (`_src/sfx_synth.py`: pentatonic marimba/bell feedback, companion blips, whooshes, launch, eat/pick) | 25 | Project-owned; dedicated CC0 |

Kenney UI Audio was downloaded and evaluated but nothing from it is shipped. Crediting Kenney is
optional under CC0 — we credit anyway on the CREDITS page.

## Original artwork (project-owned)

| Asset | Made with |
|---|---|
| `icons/ui/*.svg`, `icons/ui-sprite.svg`, `ui/icons.generated.ts` (43 UI icons) | `_src/build_ui_icons.mjs` (hand-written paths) |
| `icons/games/*.svg`, `ui/emblems.generated.ts` (11 game emblems) | `_src/build_game_icons.mjs` |
| Companion robot 领航员 (`companion/companion.ts`) | parametric SVG + LED dot-matrix faces in code |
| `textures/paper-*.webp`, `grain-overlay`, `speckle-overlay`, `kraft` | `_src/build_textures.py` (FFT noise + drawn fibres) |
| `textures/hub-*.webp`, `scene-*.webp` (paper-cut star port) | `_src/hub_scene.mjs`, rasterised offline by `_pw/raster.mjs` |

No third-party images, no emoji art, no NASA/agency photos are embedded in this folder.
