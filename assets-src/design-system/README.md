# 星港设计系统 · Starport Design System v1

The shared look, feel and sound of 爸爸的游戏乐园 / 星港. One tokens file, one CSS kit, a few
framework-free TS helpers, the companion robot 领航员, paper textures, icons, game emblems,
fonts and SFX — built for an **iPad 9 home-screen PWA** (810×1080 / 1080×810 CSS px, DPR 2), both
orientations, no scrolling, touch-first, a 6-year-old reader.

- Style guide: `styleguide/index.html` (all tokens + components, playable SFX)
- In-context screens: `styleguide/screens.html?s=hub|game|map|result` (exact iPad viewport)
- Companion sheet: `styleguide/companion.html?mood=happy`
- Review screenshots: `/Users/ccincd/kid-games-work/shots/design-system/` (`screen-*`, `styleguide-*`, `companion-*`)
- Licences: `LICENSES.md`

Open the pages through any static server rooted at this folder (ES modules + fonts need http), e.g.
`node _pw/shoot.mjs …` already does this in-process; or `npx serve .` / the repo's Vite dev server.

## Art direction in one screen

| Where | Style | Rules |
|---|---|---|
| Hub 星港, start gate, story/lab openers | **Paper-cut night sky** (剪纸夜空): navy paper layers, moonlit cream rims, soft drop shadows, warm lantern dots | Pre-rasterised WebP backdrops (`textures/hub-*.webp`, 50–60 KB), never runtime `feTurbulence` |
| Operation areas (where the child thinks) | **Clean flat vector on warm paper** | Paper surfaces + per-game accent; no decorative animation inside the play area |
| 3D games (月宫 / 玉兔 / 实验室) | Low-poly (Kenney Space Kit) | UI chrome from this kit floats on top |
| Everywhere | Tactile 3D-paper buttons (a solid “thickness” edge you press into), gold reward stars, Baloo numerals, 文楷 reading text | Primary actions ≥ 64 px, everything ≥ 48 px, keypad keys 76 px |

Benchmarks we aimed at: Royal Match (button/modal tactility, star reveal), Toca Boca (warm, non-babyish
colour), Monument Valley (calm paper layers), Funexpected (clean thinking surfaces).

## Folder map

```
tokens.css                 all design tokens (--xg-*)            → repo kit/ui/tokens.css (drop-in superset)
fonts/                     3 woff2 subsets + fonts.css + licences → repo kit/fonts/
ui/kit.css                 component styles (.xg-*)               → repo kit/ui/kit.css
ui/kit.ts                  DOM helpers (press, result, keypad, map, drag, ghost hand…) → repo kit/ui/xg.ts
ui/icons.generated.ts      43 UI icons (32-grid, currentColor)    → repo kit/ui/
ui/emblems.generated.ts    11 game emblems (96-grid SVG)          → repo kit/ui/
ui/sfx.ts                  standalone SFX player (style guide only; the repo uses kit/audio + sfx-bridge)
ui/index.ts                bundle entry for dist/xg-kit.js (style guide only)
companion/companion.ts     the robot (parametric SVG + LED dot matrix) → repo kit/companion/art.ts
kit-adapter/companion/     drop-in kit/companion/index.ts + companion.css (keeps the stub's API)
kit-adapter/ui/skin.css    re-skins the repo's existing .kit-* (back button, start gate, kit-btn, modal, toast, subtitle, stars)
kit-adapter/ui/sfx-bridge.ts  routes kit sounds through kit/audio's single AudioContext
textures/                  paper-light / paper-night / grain-overlay / speckle-overlay / kraft (512² tileable WebP)
                           hub-{portrait,landscape}.webp (hub layout: high horizon), scene-*.webp (full-bleed)
sfx/                       62 × .m4a (mono AAC, loudness-normalised) + manifest.json + licences → repo public/sfx/
icons/                     ui/*.svg, ui-sprite.svg, games/*.svg (sources for other tools)
styleguide/                index.html, screens.html, companion.html, sg.css, thumbs/
_src/                      generators (fonts, textures, icons, emblems, hub scene, sfx, palette check)
_pw/                       Playwright 1.63 + esbuild + tsc, shoot/raster scripts (one browser, always closed)
dist/xg-kit.js             esbuild bundle for the style guide pages
```

## Tokens (tokens.css)

- **Palette**: night ramp (hub sky), paper ramp (all surfaces), ink (warm plum-brown text), brand
  朱砂 cinnabar / 金 gold (rewards) / 玉 jade (primary action), LED cyan for the companion.
- **Semantic** `--xg-ok/try/info/danger-*`: “not yet” is amber, never red; every state also carries a
  shape (✓ badge, bulb, dashed outline). Red is reserved for the parent area.
- **Per-game accents** `--xg-<game>`, `-deep`, `-soft`, `-hi`, `-on` (text colour on the accent; dark ink
  for 搬运工/贪吃蛇 where white < 3:1). Set `data-xg-game="<id>"` on `<body>` (or any subtree) and every
  `--xg-accent*` role follows. Ids: `mars` 火星基地 · `moon` 月宫建造师 · `rabbit` 玉兔编程 · `story` 山海故事匣 ·
  `lab` 天宫实验室 · `porter` 星港搬运工 · `chess` 棋手学院 · `army` 陆战棋 · `snake` 贪吃蛇 · `match` 消消乐 ·
  `defense` 塔防（主题待定）.
- **Colour-blind check** (`_src/check_palette.py`, Machado 2009 severity 1.0, CIEDE2000): closest accent
  pair is ΔE 11.3 (normal), 7.6 (protan), 7.6 (deutan), 6.1 (tritan) — chosen by `_src/opt_palette.py`
  in OKLCH with each game's hue held. (The first draft collapsed to ΔE 1.6.)
- **Type**: `--xg-font-ui` (PingFang, 0 bytes), `--xg-font-read` (霞鹜文楷 GB Medium, stories /
  instructions / companion), `--xg-font-title` (站酷快乐体, big titles only — never Latin-heavy text),
  `--xg-font-num` (Baloo 2, tabular). Scale 13 → 72 px; body ≥ 20 px; reading 26 px / 1.8 (room for pinyin).
- **Space** 4-px grid, `--xg-gutter` 24; **hit sizes** `--xg-hit-min` 48 / `-primary` 64 / `-key` 76 / `-back` 56.
- **Radius** 8 → 34 + pill. **Depth** `--xg-sh-1…4` = crisp paper-thickness offset + soft ambient;
  `[data-xg-theme="night"]` re-declares the whole shadow scale (custom properties resolve `var()` where
  declared, so overriding only `--xg-shadow-color` would not reach them — fixed bug from the draft).
- **Motion**: press 110 ms squash → release 320 ms spring; panels 420 ms `--xg-ease-spring` (real
  `linear()` spring, Safari 17.2+); stars 520 ms `--xg-ease-pop`; stagger 90 ms. `prefers-reduced-motion`
  zeroes all durations. **z-index** scale for HUD / drag / companion / toast / modal.

## Components (ui/kit.css + ui/kit.ts)

| Component | Markup / helper | Notes |
|---|---|---|
| Buttons | `.xg-btn` + `--primary/--accent/--gold/--secondary/--night/--ghost`, `--lg` 76 · md 60 · `--sm` 48 | Paper edge depth; `bindPress()` adds press/squash/spring + SFX on iOS |
| Icon buttons | `.xg-iconbtn` (`--lg` 64 / 56 / `--sm` 48), `--night/--accent/--primary/--gold`, `.is-off` | |
| 再听一遍 | `replayButton()`, `setPlaying(btn, on)` (icon → live sound bars) | |
| Hint | `.xg-iconbtn.xg-hint` + `setHintReady(btn, true)` → two expanding rings + bulb wobble | H0 trigger |
| Game card | `.xg-card` (+ `__tag`, `__tag--new`, `--tile`) with `emblem(id)` and `progress(v)` | “幻想里的动作 + 进度”, no skill labels |
| HUD | `.xg-hud` (`__left/__center/__right`, `__title`, `__badge`), `.xg-chip` (`.is-bump`) | safe-area aware |
| Progress | `progress(v)`, `setProgress(el, v)`, `.xg-pips` (chapter dots) | zero hides the fill |
| Segmented | `segmented(el, { options, value, night, onChange })` | sliding thumb (spring) |
| Toggle | `<label class="xg-toggle"><input type=checkbox>…` | position + ✓/✕ glyph, not colour alone |
| Toast / bubble / caption | `toast(text, {tone})`, `.xg-bubble[data-tail]`, `.xg-caption` | toasts at the top |
| Modal / result | `showResult({ ribbon, stars, title, text, stats, actions, onOpen })` → Promise<actionId> | stars land one by one with rising pitch, 3★ confetti, **never auto-advances** |
| Star rating | `starRating(n, of)`, `starSvg('gold'|'slot'|'flat')` | |
| Level map | `nodeMap(el, nodes, { marker, onPick })` | nodes at equal arc length on a winding road (landscape wave / portrait zig-zag); states done ★ / current (ring + companion head) / open / locked / boss |
| Numeric keypad | `mountKeypad(el, { maxLength, onSubmit, display })` | 76 px keys, keys climb the pentatonic scale, wrong answer = gentle nudge, never “错” |
| Drag ghost | `startDrag(src, ev, targets)` → `{ move, drop }`; `.xg-drop`, `.is-over`, `.xg-selected` (tap-to-select alternative) | snap spring / fly-home |
| Ghost hand | `ghostTap(el)`, `ghostDrag(from, to)` | ≤ 3 s demos (plan §3.0) |
| Start button | `.xg-start__btn` / skinned `.kit-start__go` | the tap that unlocks iOS audio |
| Confetti | `confetti(n)` | paper pieces, milestones only |

## Companion 领航员 (companion/companion.ts)

```ts
import { mount } from './companion/companion';
const bot = mount(el, { size: 160 /* or '12vh' */, mood: 'idle', bubble: 'auto', accent, led, antenna: 'star'|'orb', variant: 'full'|'head', sfx });
bot.setMood('happy');                       // idle | happy | thinking | surprised | encouraging | celebrating | sleepy
await bot.say('推之前想一想…', { mood: 'thinking', speak: (t) => narrator.say(id), hold: 1800, accessory: replayBtn });
bot.react('hop'); bot.lookAt(x, y); bot.hush(); bot.destroy();
```
- 15×9 LED dot-matrix face generated in code; idle blinks (random, sometimes double), thinking glances
  around, talking animates the mouth rows until `speak()` resolves; gentle bob, antenna twinkle, ear LEDs.
- Aliases accepted: `think`, `cheer`, `encourage`, `blink` (idle + an immediate blink).
- **There is no sad mood** — unknown moods throw. `sleepy` is drowsy-content, never disappointed.
- Customisation hooks for chapter unlocks: `accent`, `led`, `shell`, `antenna`. Three 设定稿 (北斗 / 阿星 /
  小舟) are in the style guide for the child to pick name + colour (plan §4.4).

## SFX (sfx/)

62 semantic sounds in 6 categories (ui · ui-soft · feedback · game · companion · jingle), each normalised
to a category loudness target (short-term K-weighted max: taps −25/−21, game −18, feedback/jingles −16
LUFS), peak ≤ −1 dBFS. Feedback is all pentatonic (C D E G A) so any sequence is consonant;
`try-again` is a soft wooden 咚, never a buzzer. `chime` + `pentatonic(step)` builds combo ladders
(贪吃蛇 eat chains, 消消乐 cascades); `eat` is a short juicy bloop designed to be pitch-laddered.
Names the kit plays by default: `ui-tap ui-press ui-key ui-key-delete ui-select ui-locked ui-pop ui-open
ui-close ui-notify ui-tick ui-pick ui-snap whoosh-down star-1 star-2 star-3 level-complete`, companion
`blip-*`. Full list with Chinese descriptions + source file per sound: `sfx/manifest.json`.

## Integrating into the repo (kit/ui, kit/companion)

The repo's `kit/` already has placeholder `ui/tokens.css`, `ui/base.css`, `ui/index.ts` and a
`companion/index.ts` stub. Everything below keeps their public APIs; it was type-checked against the
repo's own `kit/narration.ts` + `kit/audio.ts` with the repo's compiler flags (`strict`,
`noUnused*`, `isolatedModules`), and the companion adapter was run in a browser (all 7 kit moods,
`'sad'` rejected, `say()` resolves with the narrator's `SayResult`).

1. **Copy files**
   | from design-system | to repo |
   |---|---|
   | `tokens.css` | `kit/ui/tokens.css` (replace; superset — all 77 `--xg-*` names used in `kit/` and `site/` exist) |
   | `ui/kit.css` | `kit/ui/kit.css` |
   | `kit-adapter/ui/skin.css` | `kit/ui/skin.css` |
   | `ui/kit.ts` | `kit/ui/xg.ts` |
   | `ui/icons.generated.ts`, `ui/emblems.generated.ts` | `kit/ui/` |
   | `kit-adapter/ui/sfx-bridge.ts` | `kit/ui/sfx-bridge.ts` (then change its import to `'./xg'`) |
   | `companion/companion.ts` | `kit/companion/art.ts` |
   | `kit-adapter/companion/index.ts`, `companion.css` | `kit/companion/` (replace the stub) |
   | `fonts/*.woff2`, `fonts/fonts.css`, `fonts/licenses/` | `kit/fonts/` |
   | `textures/*.webp` | `kit/textures/` (kit.css / skin.css reference `../textures/…`; Vite fingerprints them) |
   | `sfx/*.m4a`, `sfx/manifest.json`, `sfx/licenses/` | `public/sfx/` (fetched at runtime by the manifest) |
   | `LICENSES.md` rows | `assets-src/LICENSES.md` + CREDITS page |
2. **kit/ui/index.ts** — append (exact block verified to compile next to the existing `toast`):
   ```ts
   import '../fonts/fonts.css';
   import './skin.css';
   import './kit.css';
   export {
     bindPress, showResult, mountKeypad, segmented, progress, setProgress, nodeMap, startDrag, ghostTap, ghostDrag,
     confetti, icon, emblem, starSvg, starRating, replayButton, setPlaying, setHintReady, setSfx, sound,
     toast as xgToast, UI_ICONS, GAME_EMBLEMS,
   } from './xg';
   export type { UiIconName, GameEmblemId, MapNode, ResultOptions, ResultAction, KeypadOptions, NodeMapOptions } from './xg';
   ```
3. **Audio**: in the shell's start-gate tap (after `unlockAudio()`), call `await installKitSfx()` (or
   `installKitSfx({ only: [...] })` per page) from `@kit/ui/sfx-bridge`; then call `bindPress(document)`
   once per page. Pass `sfx: (n) => sfx.play(n)` to `mountCompanion` for the robot's blips.
4. **Pages**: `<body data-xg-game="porter">` on every game page; `data-xg-theme="night"` on the hub /
   start gate / space scenes. The hub layout (backdrop `<picture>` with `hub-portrait/landscape.webp`,
   2×4 cards portrait, 4×2 landscape, companion on the skyline) is in `styleguide/screens.html` → copy the
   `.hub*` rules.
5. **Service worker**: precache the three woff2 (~1.3 MB), `paper-light/night.webp`, `grain-overlay.webp`
   and the hub backdrop for the current orientation; SFX are small (≤ 49 KB each) and can be cached on first use.
6. **Fonts for new text**: the 文楷/快乐体 subsets carry 3500 一级字 + 68 extras. When game text grows,
   re-run `_src/build_fonts.py --extra <file with all displayed text>` (or the plan's harfbuzzjs step in CI)
   so no glyph ever falls back mid-word. Fallbacks are Kaiti SC / PingFang, so a miss is ugly but never blank.

## Rebuilding

```bash
cd /Users/ccincd/kid-games-work/design-system
.venv-ds/bin/python _src/build_fonts.py        # fonts/*.woff2 + fonts.json (≈30 s, <600 MB)
.venv-ds/bin/python _src/build_textures.py     # textures/paper-*, grain, speckle, kraft
_src/build_scenes.sh                           # hub/scene SVG → 2x PNG → WebP
node _src/build_ui_icons.mjs && node _src/build_game_icons.mjs
.venv-ds/bin/python _src/build_sfx.py          # sfx/*.m4a + manifest.json (needs ffmpeg with aac_at)
.venv-ds/bin/python _src/check_palette.py      # CVD + contrast report
node _src/build_kit.mjs && _pw/node_modules/.bin/tsc -p tsconfig.json
(cd _pw && node shoot_all.mjs)                 # all review screenshots, one WebKit, closed after
```
The venv (`.venv-ds`: fonttools, brotli, numpy, scipy, pillow) and `_pw/node_modules` are local to this
folder. No ML models are used anywhere.

## Open items (for later passes)

- Companion: the child picks the name and one of the three colourways; a low-poly 3D twin for the 3D
  games is still to be made from the same proportions.
- Hub sky shows a full moon; the plan's real (offline-computed) moon phase needs a phase mask over
  `textures/hub-*.webp` (a circle-pair clip on a separate moon layer).
- 「游乐场」 tab content (贪吃蛇 / 消消乐 / 塔防 tiles) uses `.xg-card--tile`; the lane-defense emblem is a
  placeholder (shield + sprout) until its theme is chosen.
- SFX were curated by name, spectrum and loudness analysis — give them one listening pass on the iPad
  speaker (style guide → 音效) and swap any that feel off; `build_sfx.py` makes that a one-line change.
