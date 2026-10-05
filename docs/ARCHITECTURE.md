# Architecture

爸爸的游戏乐园 is a static, offline-capable web game hall for one child, played as a home-screen
app on an iPad 9th gen (iPadOS 26 Safari, 810×1080 CSS px portrait / 1080×810 landscape, DPR 2).
GitHub → Netlify (free plan, `main` = production, so production deploys are scarce: batch changes,
never push work branches to `main` casually).

How to add or change a game: **docs/GAME_AUTHORING.md** (the contract for game agents).

## 1. Repository layout

```
kid-games/
├─ package.json, package-lock.json   one root project (Vite 8, TypeScript 5, three, vitest, Playwright 1.63.0)
├─ vite.config.ts                    multi-page build: root site/ → dist/; registry/SW/headers/redirects plugins
├─ netlify.toml                      npm ci && npm run build; publish dist; Node 20
├─ site/                             DIRECTORY = URL. site/<id>/index.html is served at /<id>/
│  ├─ index.html                     星港 hub; card panels rendered at build time from the registry
│  ├─ <id>/game.json                 registry entry for game <id> (validated by tools/registry.mjs)
│  ├─ <id>/index.html, src/ …        the game (owned by its game agent); wip titles start on the
│  │                                 shared 建造中 screen (site/_shared/building.ts)
│  ├─ _hub/, _shared/                shared page code ("_" folders are never games)
│  ├─ parent/, credits/              platform pages: 家长中心 (/parent/) and 素材与致谢 (/credits/)
│  ├─ dev/kit/                       kit playground (/dev/kit/): built, not listed, not precached
│  └─ redirects.json                 retired URLs (→ dist/_redirects)
├─ kit/                              platform runtime every page uses (§3); kit/textures = paper/sky art
├─ engines/                          shared game engines: story, manip, voxel, board, puzzle (READMEs = contracts)
├─ content/                          levels, banks, scripts, narration yaml — what a parent can review
├─ public/                           copied verbatim: manifest, icons/ (+ icons/games/<id>.svg emblems),
│                                    audio/<game>/ (narration), audio/sfx/ (62 kit sounds), fonts/ (OFL
│                                    subsets + licences), models/, _headers, legacy sprites
├─ assets-src/                       source art, design-system generators + LICENSES.md ledger (never published)
├─ tools/                            build/validation scripts (registry, sw, content checks, icons);
│                                    tools/voice = the narration pipeline (docs/VOICE.md)
├─ tests/unit, tests/smoke           vitest (Node) and Playwright WebKit smoke tests
├─ types/                            ambient declarations (virtual:kg-registry)
└─ docs/                             this file, GAME_AUTHORING.md, VOICE.md, specs/ (per-game build
                                     specs), plan-2026-10.md (master plan)
```

Aliases: `@kit/*` → `kit/*`, `@engines/*` → `engines/*` (vite.config.ts, tsconfig.json, vitest.config.ts).

## 2. Build pipeline (`npm run build`)

1. `tools/check-registry.mjs` — every top-level `site/<id>/` with an `index.html` must have a valid
   `game.json`; ids are kebab-case and equal the folder; retired URLs must not still exist as
   folders; icons exist.
2. `tools/check-content.mjs` — narration manifests valid and complete; tone lint on child-facing text.
3. `tsc --noEmit` — strict typecheck of site, kit, engines, tests.
4. `vite build` — every `site/**/index.html` is an entry (no hand-maintained list), target
   `safari16`, hashed bundles in `dist/assets/`. Plugins in vite.config.ts:
   - `kg-registry`: `virtual:kg-registry` module (hub entries) and the hub's `<!-- kg:hub -->`
     placeholder → static card markup (`renderHub`). `game.json` edits hot-reload in `npm run dev`.
   - `kg-sw-and-redirects` (after bundling): writes `dist/sw.js` (tools/sw/build-sw.mjs),
     `dist/_redirects` (site/redirects.json + `redirectFrom`) and appends generated no-cache rules
     for every page to `dist/_headers`.

The registry (`site/<id>/game.json`) is the single source of truth for: hub cards, SW precache
pages, the smoke-test matrix, `_redirects`, and the parent page later.

### Game registry fields

| field | meaning |
|---|---|
| `id` | folder name = URL segment, kebab-case |
| `title`, `subtitle` | child-facing name and a fantasy-action line (not a skill label) |
| `place` | `base` (基地, learning) · `playground` (游乐场, rest area) · `classic` (经典角, legacy) |
| `order` | sort key within the place |
| `status` | `live` (on the hub) · `wip` (on the hub as a 建造中 card that answers but does not navigate; `/?dev` makes it a link) · `hidden` (URL only) |
| `accent`, `icon` | CSS colour or `--xg-*` token; `/icons/games/<id>.svg` (the 星港 emblem, placed by the platform) |
| `theme` | 星港 colour theme → `data-xg-game` (`mars moon rabbit story lab porter chess army snake match defense`) |
| `newContent` | `{ id, label? }` on a live game: a real content drop; the hub shows NEW until the child opens the game once |
| `domains[]` | parent-facing ability tags (tools/registry.mjs DOMAINS) |
| `parentNote` | one sentence for the parent page |
| `redirectFrom[]` | old paths that should 301 here (e.g. `/number-adventure` → `/mars-base/`) |
| `orientation` | `any` (default) · `landscape` · `portrait` (a hint; games must still work in both) |
| `smoke` | `{ waitFor?: selector, skip?: boolean }` hints for the smoke test |

## 3. Runtime: the kit (`kit/`)

Every page calls `initShell()` once (legacy pages do it through `site/_shared/legacy-shell.ts`).
Full API with examples: docs/GAME_AUTHORING.md §4.

| module | responsibility |
|---|---|
| `shell` | start gate (unlocks audio inside the tap; `shell.ready`), 🏠 back button ≥56 px with safe areas that awaits autosave, zoom/double-tap/callout/selection/overscroll guards (zero-specificity CSS, page rules win), pause/resume on `visibilitychange`, layout hook on resize/rotation (`--kit-vw/--kit-vh`, `data-orientation`), session log, SW registration, `storage.persist()` |
| `audio` | one AudioContext per page, buses master→{sfx, voice, music}, `audioSession.type='playback'`, suspend while hidden / resume on return, next tap or bfcache restore; decoded AAC sfx bank with voice pooling; streamed `<audio>` music through a GainNode with fades and ducking; synth tones |
| `narration` | audio-manifest runtime: queue, interrupt, subtitles + word timing callbacks, replay (再听一遍), prefetch; clip backend first, speechSynthesis zh-CN only for missing clips, text-only pacing as the last resort; waits for the audio unlock |
| `progress` | versioned per-game saves `kg:v1:<game>` with migrations, legacy-key import, export/import, legacy snapshot |
| `log` | play sessions `kg:log:v1`: heartbeat, hidden-timeout split, crash recovery, launch source, marks |
| `input` | primary-pointer gate, tap vs drag threshold, swipe, drag + snap, hit slop, geometry helpers |
| `rng`, `tween`, `particles` | seeded mulberry32; easing/tween/WAAPI; canvas particle overlay |
| `ui` | the 星港 design system: tokens (`--xg-*`), fonts (XG WenKai / KuaiLe / Baloo, `/fonts/`), `.xg-*` components (tactile buttons, cards, result panel, level map, keypad, segmented, toggle, drag ghost, ghost hand, confetti), 43 icons, 13 emblems; `skin.css` restyles the base `.kit-*` components; `sfx-bridge` plays the 62 kit sounds (`/audio/sfx/`) through `audio` |
| `companion` | the robot 领航员 (parametric SVG + 15×9 LED dot-matrix face, 7 moods, no sad mood), `mount` / `sayLine` |
| `settings` | family settings from the parent page (display name, narration, pinyin, hidden games) and the parent PIN |

### Local data (never leaves the device)

| key | owner | content |
|---|---|---|
| `kg:v1:<game>` | `createStore` | `{ v, updatedAt, data }` envelope per game |
| `kg:v1:legacy-<game>` | hub (`snapshotLegacyProgress`) | copy of old saves for the rebuilt games |
| `kg:log:v1` | `kit/log` | ≤600 session records |
| `kg:launch` (sessionStorage) | hub → game | launch source hint |
| `kg:settings:audio-muted` | `kit/audio` | mute switch |
| `kg:settings:v1` | `kit/settings` | display name, narration, pinyin, hidden games |
| `kg:parent:pin` | `kit/settings` | salted hash of the parent PIN (soft gate) |
| `kg:hub:v1` | `setHubProgress` | one progress line per game card (`{ label, value? }`) |
| `kg:hub:seen` | hub | NEW content ids already opened |
| `kg:hub:tab`, `kg:hub:visited`, `kg:parent:unlocked`, `kg:parent:tab` (sessionStorage) | hub / parent | last tab, 欢迎回来 greeting, 30-min parent unlock |
| `sokoban_save`, `kid_games_memory_matrix_v2`, `kid_games_emoji_match_v1` | legacy games | never deleted; exported with progress |

Big blobs (recordings, drawings) go to IndexedDB, not localStorage.

## 4. Offline: service worker (`/sw.js`)

Generated per build from the dist file list (tools/sw/sw-template.js → dist/sw.js):

- `kg-shell-<version>`: versioned precache of HTML/JS/CSS/images/manifest/icons; pages are keyed by
  their directory URL (`/chess/`). Version = hash of all precached content.
- `kg-media-v1`: `/audio/**`, `/models/**`, `/fonts/**` cached lazily, content-addressed (sha1 in the
  SW manifest; `x-kg-hash` on the cached response). Survives deploys; stale entries are pruned on
  activate. Range requests (music) are answered from cache with 206.
- Navigations: network-first with a 3 s timeout, then the cached page, then the hub.
- Never caches or replays a redirected response (Safari rejects them for navigations).
- A new version installs in the background and **waits**; only the hub sends `SKIP_WAITING`, so a
  game is never swapped mid-play. `/sw.js` itself is `no-store`.
- Skipped: source maps, `.md/.txt`, dotfiles, `/dev/**`.

## 5. Hosting (Netlify)

- `netlify.toml`: `npm ci && npm run build`, publish `dist`, `NODE_VERSION=20`,
  `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`.
- `dist/_headers` = `public/_headers` (security headers, `/assets/*` immutable, `/sw.js` no-store) +
  generated `Cache-Control: no-cache` for each page and the manifest (explicit paths: Netlify merges
  values of overlapping wildcard rules).
- `dist/_redirects`: retired `/checkers` and `/star-catcher` (and `/*` below them) → `/` with a
  forced `302!`; `redirectFrom` entries → 301 to the new game.
- Local preview identical to Netlify's build: `./play.sh` (builds, serves dist on the LAN for the iPad).

## 6. Quality gates

| command | what |
|---|---|
| `npm run check` | registry + content checks, typecheck, vitest |
| `npm test` | vitest unit tests (Node; kit logic, tools, SW builder, tone lint, hub state, moon phase, parent stats, settings) |
| `npm run voice:build [-- <game>]` | narration clips from content/narration (docs/VOICE.md; not part of the build — clips are committed) |
| `npm run test:smoke` | build, then Playwright **WebKit** at 810×1080 and 1080×810 (DPR 2, touch, one worker) over hub + every registered game + /parent/ + /credits/ + /dev/kit/: 200, 0 console errors, 0 failed requests, no horizontal overflow, ≥56 px back button, ≤1 AudioContext, screenshots to `~/kid-games-work/shots/foundation/<project>/`; plus kit/hub/parent behaviour tests (place tabs = registry, 建造中 cards, launch source, 3 s hold → PIN → hide a game). Games add their own `site/<id>/tests/*.spec.ts`. |

Not covered locally (needs the real device or the iPadOS simulator, plan §6.7): mute switch,
home-screen icon/standalone mode, safe-area insets with real values, real fonts (PingFang,
Apple Color Emoji), audio interruption by calls, memory pressure on a 3 GB device.

## 7. Hub, parent page, design system, voice (landed 2026-10-05)

- **Design system** (kit/ui, kit/companion, kit/textures, public/fonts, public/audio/sfx,
  public/icons/games; sources in assets-src/design-system/): every page gets tokens, fonts, the
  `.xg-*` kit and the re-skinned `.kit-*` components through the shell. Games set
  `<body data-xg-game="<theme>">`; night scenes add `data-xg-theme="night"`.
- **Hub** (site/index.html, site/_hub/): paper-cut night port (`kit/textures/hub-*.webp`, drawn in
  a "stage" box that reproduces cover so the live moon sits where the sky leaves room), today's
  moon phase computed on the device (`_hub/moon.ts`, Meeus ch. 48), the companion with a
  time-of-day greeting (bubble on arrival, voice on the first tap — iOS rule), place tabs
  基地 / 游乐场 / 经典角, cards with fantasy action + progress (`setHubProgress`, legacy saves,
  play count), at most one 继续 + one 推荐 + NEW for declared content, 建造中 cards for `wip`.
  Card grid buckets by count (1–9) for both orientations; never scrolls. Pure logic in
  `_hub/state.ts` (unit-tested).
- **Parent page** (site/parent/): hold the hub's 家长 button or the 星港 title 3 s → PIN (set on
  first use) → 概览 / 进度 / 设置 / 备份. Reads `kit/log` sessions, registry
  `domains`/`parentNote`, `kg:hub:v1` and legacy saves; writes `kit/settings`; export via the
  share sheet (iPad home-screen apps cannot download blobs reliably) or download; import with
  confirmation. No time budgets, timers or locks (Dad's rule 10).
- **Voice**: `npm run voice:build -- <game>` (docs/VOICE.md) produces `public/audio/<game>/` from
  `content/narration/<game>.yaml`; the runtime only reads `audio-manifest.json`, so engines can be
  swapped without code changes. The parent 旁白 switch is applied inside `kit/narration`.
- **Credits** (site/credits/): human-readable mirror of assets-src/LICENSES.md.
