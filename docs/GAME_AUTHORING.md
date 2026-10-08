# Game authoring guide (contract for game agents)

Read docs/ARCHITECTURE.md first for the big picture. This file is what you must follow to add or
rebuild a game. Quality bar: **commercial-market quality** (art, UI, animation, audio, validated
level design, real progression) — never demo-like, never babyish. Player: 小步步, 6 y, first grade,
reads simple picture books, math well ahead; loves space, machines/vehicles/building, myths,
history and adventure.

## 0. Rules of engagement

**You may modify only:** `site/<your-id>/`, `engines/<engine you own>/`, `content/<your-id>/`
(and `content/narration/<your-id>.yaml`, `public/audio/<your-id>/`, `public/models/<your-id>/`).
Everything else (kit/, tools/, other games, the hub, configs) belongs to the platform: ask for a
change instead of editing it. Never push; never touch `main`.

**RESOURCE RULES (mandatory — the build machine is a 16 GB Mac that already crashed from memory
exhaustion during this project):**
- Before starting any browser, dev server, build, or Python/ML process run
  `memory_pressure -Q | tail -1`; if free < 25 %, `sleep 60` and re-check instead of starting.
- At most ONE browser instance at a time; always close it (`try/finally browser.close()`).
  Use WebKit for iPad fidelity, Chromium headless shell otherwise; close promptly.
- Never leave background processes running (dev servers, http servers, nohup jobs). Kill what you start.
- Never download or load ML models unless your task explicitly says so.
- A watchdog (`~/kid-games-work/tools/memguard.sh`) kills our processes when memory gets
  critical. If something dies unexpectedly, read `~/kid-games-work/logs/memguard.log` and scale
  down instead of retrying blindly.
- Working files go under `~/kid-games-work/` (persistent). `/private/tmp` is wiped on reboot.

**SILENCE RULE (mandatory — test audio through the Mac's speakers woke the family at night):**
- Never produce audible sound on the build machine: no `afplay`, no `say` without `-o <file>`,
  never change the system volume or mute state.
- Pages that load the kit are silent under Playwright automatically (`kit/automute.ts`:
  `navigator.webdriver` → every Web Audio destination goes through a zero-gain node, media
  elements muted, speech volume 0). Route all game audio through `@kit/audio` anyway.
- Pages that do not load the kit: `context.addInitScript({ path: 'tools/qa/mute-audio.js' })`;
  Chromium: launch with `args: ['--mute-audio']`. Manual silent preview: add `?mute` to the URL.
- Check audio by inspecting files (ffprobe, durations, ASR) or Web Audio events, never by listening.

## 1. Add a game in five steps

```
site/mars-base/
├─ game.json          registry entry (§2)
├─ index.html         page shell (§3)
├─ src/main.ts        entry: initShell + your game
├─ src/**             your code (pure logic separate from view)
└─ tests/*.spec.ts    your Playwright tests (optional but expected); *.test.ts = vitest
content/mars-base/    levels/banks (yaml/json) read by game AND validators
content/narration/mars-base.yaml   every spoken line (§5)
```

1. Create the folder and `game.json` with `"status": "wip"` (the hub shows a 建造中 card that does
   not navigate; `/?dev` makes it a link). The six new titles already have this plus a placeholder
   `src/main.ts` (shared 建造中 screen) — replace that file with your game.
2. Write `index.html` + `src/main.ts` from the templates below. Your spec is in `docs/specs/<id>.md`.
3. `npm run dev` → http://localhost:5173/mars-base/ (check memory first; stop the server after).
4. `npm run check` and `npm run test:smoke` until green; review the screenshots of **both
   orientations** in `~/kid-games-work/shots/foundation/` (and your own shots).
5. When the DoD (§9) is met, the platform flips `status` to `live`.

Replacing an old URL: rebuild in place (same folder, e.g. `sokoban/` → 星港搬运工), or create a new
folder and add `"redirectFrom": ["/number-adventure"]` — the build refuses this while the old folder
still exists, so delete it in the same change.

## 2. `game.json`

```json
{
  "id": "mars-base",
  "title": "火星基地",
  "subtitle": "给火星基地造发射塔",
  "place": "base",
  "order": 10,
  "status": "wip",
  "accent": "--xg-mars",
  "theme": "mars",
  "icon": "/icons/games/mars-base.svg",
  "domains": ["number", "measurement"],
  "parentNote": "数学主力：100 以内加减、乘法启蒙，自适应出题。",
  "redirectFrom": ["/number-adventure"],
  "smoke": { "waitFor": "#app[data-ready]" }
}
```

`subtitle` is a fantasy action, never a skill label ("练数感" is wrong). Domains and parent notes are
parent-facing only. `icon` is your 星港 emblem at `/icons/games/<id>.svg` (the platform makes it;
ask for a redraw instead of shipping emoji). `theme` picks your design-system accent
(`data-xg-game`). When you ship a real content drop (a new chapter), add
`"newContent": { "id": "2026-11-ch3", "label": "新章节" }` and the hub shows NEW until the child
opens your game once. Allowed `domains`: number, literacy, spatial, planning, coding, science,
engineering, strategy, social, measurement, creativity, memory, reflex, relax.

## 3. Page template

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <title>火星基地</title>
  <link rel="manifest" href="/manifest.json">
  <link rel="apple-touch-icon" href="/icons/apple-touch-icon-180.png">
  <script type="module" src="./src/main.ts"></script>
</head>
<body data-xg-game="mars">
  <div id="app"></div>
</body>
</html>
```

```ts
// site/mars-base/src/main.ts
import { initShell } from '@kit/shell';
import { createStore } from '@kit/progress';
import { Narrator } from '@kit/narration';
import { createSubtitleBar } from '@kit/ui';
import { sfx } from '@kit/audio';
import './styles.css';

interface Save { chapter: number; stars: Record<string, number> }
const store = createStore<Save>('mars-base', { version: 1, defaults: () => ({ chapter: 1, stars: {} }) });
let save = store.load();

const sub = createSubtitleBar();
const narrator = new Narrator({ manifestUrl: '/audio/mars-base/audio-manifest.json', onCue: sub.onCue, onWord: sub.onWord });
sub.attach(narrator);

const shell = initShell({
  game: 'mars-base',
  startGate: { title: '火星基地', subtitle: '今天去建发射塔' },
  onBeforeLeave: () => { store.save(save); },
  onPause: () => game.pause(),
  onResume: () => game.resume(),
  onLayout: (l) => game.resize(l.width, l.height, l.safe),
});

void sfx.loadAll({ tap: '/audio/mars-base/sfx/tap.m4a', ok: '/audio/mars-base/sfx/ok.m4a' });
await shell.ready;                 // the 开始 tap unlocked audio
narrator.say('mars.intro.1');
```

Layout: both orientations, **no scrolling**, everything inside the safe area. Use the shell's
`onLayout` (or CSS on `html[data-orientation]`, `--kit-vw`, `--kit-vh`). The 🏠 button occupies the
top-left 56×56 (+12 px margin + safe area): keep that corner free. During an intro / cutscene /
tutorial the top-right corner (same size) belongs to the kit's 跳过 (see §4 ui).

Phones (Dad plays on his phone too, 2026-10-08): besides the iPad (810×1080 / 1080×810) a page
must work in phone portrait (390×664 iPhone 13 Safari, 320×568 iPhone SE) and phone landscape
(844×390) — no truncated titles, no overlapping text, tap targets ≥ 44 px. "Phone" = the shorter
side is < 600 px: `@media (orientation: portrait) and (max-width: 599px)` /
`(orientation: landscape) and (max-height: 599px)` (the hub and the parent page use exactly these).
A game that cannot be played in phone portrait shows a full-screen "把手机横过来玩" prompt there
instead, and must be fully playable in phone landscape.

## 4. Kit API (import from `@kit/<module>`)

### shell
```ts
initShell(opts: {
  game: string;                                  // registry id (logging)
  startGate?: { title?; subtitle?; buttonLabel? } | false;   // default: shown
  back?: { href?; label?; compact?; adopt? } | false;         // default: 🏠 返回 → "/"
  onBeforeLeave?: () => void | Promise<void>;    // awaited ≤400 ms before navigating away
  onPause?, onResume?: () => void;               // visibilitychange
  onLayout?: (l: LayoutInfo) => void;            // { width, height, orientation, safe, dpr }; rAF-throttled
  guards?: boolean;                              // zoom/callout/selection/overscroll guards (default true)
  lockScroll?: boolean;                          // fixed full-viewport body (default true)
  log?: boolean; serviceWorker?: boolean; audio?: boolean;   // defaults true
}): Shell
shell.ready: Promise<void>          // after the start-gate tap
shell.on('pause' | 'resume' | 'beforeleave', cb) / shell.on('layout', (l) => …)  → unsubscribe
shell.leave(href?)                  // save + navigate (default hub)
shell.session?.mark('level-complete', { level: 3, stars: 2 })   // goes to the play log
```

### audio
```ts
unlockAudio()                 // only inside a gesture; the start gate does it for you
whenAudioUnlocked(): Promise<void>; isAudioUnlocked(): boolean
await sfx.loadAll({ pop: '/audio/x/pop.m4a' }, maxVoices = 4)   // → ids that failed
sfx.play('pop', { volume: 0.8, rate: 1.06, pan: -0.3, delay: 0 })  // skipped if not decoded yet
music.play('/audio/x/menu.m4a', { volume: 0.5, fadeMs: 600 }); music.stop(400)   // menus/celebrations only
playSuccess(step) ; playSoftMiss() ; playTone(freq, sec, opts) ; PENTATONIC
setMuted(bool); setBusVolume('music', 0.4); getBus('sfx') // connect your own nodes to a bus, never to destination
```
Never create your own AudioContext (the smoke test fails on >1). Never play anything before the
first tap. Feedback must be immediate (<100 ms): preload during the start gate.

### narration
```ts
const n = new Narrator({ manifestUrl, onCue, onWord, speechFallback = true, duckMusic = true });
await n.ready();
n.say('mars.hint.2')                         // queued → 'done' | 'interrupted' | 'skipped'
n.say('mars.hint.2', { interrupt: true })
n.say('mars.count', { vars: { n: 5 } })      // fills {n} in the subtitle text
n.replay()                                   // 再听一遍
n.prefetch(['mars.l2.intro', 'mars.l2.hint']) ; n.stop() ; n.has(id) ; n.text(id)
```
Every instruction has voice + a ≤15-character subtitle + 再听一遍 (`createSubtitleBar` does both).
Unknown ascii ids are skipped with a warning; Chinese literal text is spoken by the speech fallback (fine for prototyping; ship real clips).

### progress
```ts
const store = createStore<T>('mars-base', { version: 2, defaults, migrate: (old, from) => …, legacy: [{ key, read }] });
store.load(); store.save(data); store.update((s) => { s.x = 1; }); store.reset();
requestPersistence(); exportProgress(); importProgress(bundle, { overwrite }); downloadProgress()
readLegacySokoban / readLegacyLadders  // old saves; snapshots also live in kg:v1:legacy-<game>
```
Bump `version` and add a migration whenever the shape changes. Never delete a legacy key.

### log
`startSession` is done by the shell. Use `shell.session?.mark(name, data)` for milestones
(level start/complete, hint level used, unit end). `summarize(days)` feeds the parent page.

### input
```ts
onTap(el, (e) => …, { slop: 10, maxMs: 600 })        // no 300 ms delay; ignores drags and 2nd fingers
onSwipe(el, (dir) => …, 30)
makeDraggable<Slot>(el, { snap: (p) => nearest(p, slots, 60), onDrop: (slot) => …, onTap, enabled: () => !locked })
hitSlop(el, 12) ; nearest ; snapToGrid ; pointInRect(p, rect, slop) ; classifyGesture ; PrimaryPointer
```
Targets ≥48 px, primary actions ≥64 px; every drag also has a tap-to-select alternative.

### rng / tween / particles
```ts
const rng = createRng('mars-base:ch1:42'); rng.int(1, 6); rng.pick(xs); rng.shuffle(xs); rng.fork('enemies')
tween({ from, to, duration, ease: ease.outBack, onUpdate }); await animate(el, keyframes, 300); sleep(ms)
const fx = createParticles(); fx.burstAt(el); fx.confetti(); fx.sparkle(x, y)
```
Math.random() is not allowed for anything a validator or replay must reproduce.

### ui / companion (the 星港 design system)
```ts
import { installKitSfx, chime } from '@kit/ui/sfx-bridge';
await shell.ready; await installKitSfx();               // 62 kit sounds via kit/audio (or { only: [...] })
bindPress(document);                                    // press/squash + sounds on .xg-btn/.xg-card/.xg-key…
h('button', { class: 'xg-btn xg-btn--primary xg-btn--lg', onclick }, '下一关')   // or the base kit-btn
const id = await showResult({ ribbon: '过关啦', stars: 2, title: '…', actions: [{ id: 'next', label: '下一关', kind: 'primary' }] })
nodeMap(el, nodes, { onPick }) ; mountKeypad(el, { maxLength: 3, onSubmit }) ; segmented(el, { options, onChange })
ghostTap(el) ; ghostDrag(from, to) ; startDrag(src, ev, targets) ; confetti() ; icon('hint') ; emblem('mars')
replayButton() ; setPlaying(btn, true) ; setHintReady(btn, true) ; xgToast('已保存', { tone: 'ok' })
const unmount = mountSkipButton(container, onSkip, { delayMs: 1500, label: '跳过' }) ; shouldAutoSkip()   // see below
await showModal({ … }) ; toast(…) ; createSubtitleBar() ; starRow(2, 3)                 // base components
const bot = mount(hostEl, { size: 140, bubble: 'right', sfx: (n) => sfx.play(n) }); bot.setMood('thinking'); bot.react('hop')
await sayLine(bot, narrator, 'mars.hint.1', { mood: 'encouraging' })
chime(combo)                                            // pentatonic ladder for chains (eat, cascade)
```
Style with `--xg-*` tokens and `.xg-*` / `.kit-*` classes; don't depend on kit DOM internals.

**跳过 — every intro, cutscene, onboarding and tutorial must be skippable** (Dad, 2026-10-08):
```ts
import { mountSkipButton, shouldAutoSkip } from '@kit/ui';

async function runIntro() {
  const finish = () => { save.introSeen = true; store.save(save); startPlaying(); };   // skipped = seen
  if (save.introSeen) return startPlaying();
  if (shouldAutoSkip()) return finish();                            // parent switch 跳过开场和教学
  let skipped = false;
  const unmount = mountSkipButton(document.body, () => {            // the child (or Dad) tapped 跳过
    skipped = true; narrator.stop(); cutscene.stop(); finish();
  });
  await cutscene.play();                                            // …or the intro ended by itself
  if (skipped) return;
  unmount(); finish();
}
```
- `mountSkipButton(container, onSkip, { delayMs = 1500, label = '跳过', theme?: 'auto' | 'paper' | 'night', className? })`
  returns a disposer. The pill sits top-right (safe-area aware, 56 px tall like the 🏠 button, night
  pill inside `[data-xg-theme="night"]`), appears after `delayMs` so a child tapping through the scene
  does not hit it by accident (invisible and untappable until then), calls `onSkip` **once**, then
  leaves. Its taps do not reach the page under it (a "tap anywhere to continue" scene does not also
  advance). The disposer is idempotent and safe after a skip. If the 🏠 button would touch it, it
  drops below it. Move it with `--xg-skip-top` / `--xg-skip-right` if your HUD needs the corner.
- `shouldAutoSkip()` is the parent page's 跳过开场和教学 (`getSettings().skipIntros`, default off). Check it
  when the intro would start (not once at load) and skip exactly as if 跳过 had been tapped — mark it
  seen, start playing. The button never auto-skips by itself.
- Skipping marks the intro/tutorial as seen; tutorials stay replayable from the game's menu / help.
- Games that draw their own control can use `createSkipController(onSkip, { delayMs, onShow })`
  (the same timing / once-only logic, DOM-free).

Fonts: `--xg-font-read` (霞鹜文楷, reading/instructions), `--xg-font-title` (站酷快乐体, big titles
only), `--xg-font-num` (Baloo 2, numbers). The subsets hold 3500 common characters + extras; if your
text needs a rarer character, ask the platform to re-run the subsetter. The companion has no sad
mood and never guilt-trips (lint-enforced). Catalogue: /dev/kit/ and assets-src/design-system/README.md.

### settings / hub progress
```ts
import { getSettings, onSettingsChange, skipIntros } from '@kit/settings';
const { displayName, pinyin } = getSettings();          // parent page; narration on/off is applied by kit/narration
skipIntros()                                            // 跳过开场和教学 (games call shouldAutoSkip() from @kit/ui)
import { setHubProgress } from '@kit/progress';
setHubProgress('mars-base', { label: '第 2 章', value: 0.45 });   // the line under your hub card (a place in the story, never a score)
```

Live examples of all of the above: `/dev/kit/` (site/dev/kit/main.ts).

## 5. Narration content

`content/narration/<game>.yaml` → `npm run voice:build -- <game>` (free local TTS, swappable;
memory-safe procedure in docs/VOICE.md — check memory first, one model process at a time) →
`public/audio/<game>/<id>.<hash8>.m4a` + `public/audio/<game>/audio-manifest.json`
`{ id: { src, text, durationMs, words?, role? } }`. Format details: content/narration/README.md.
Ids: `<short-game>.<scene>.<n>`, no spaces. `npm run build` fails on a manifest that points at a
missing file or breaks the tone rules (tools/check-content.mjs TONE_RULES): process praise only, no
"宝宝真棒", never the word 错, no IQ claims, no time pressure, a companion that is never sad.

## 6. Assets and licences

- Record every third-party or generated asset in `assets-src/LICENSES.md` **before** committing it.
  Allowed: CC0, CC-BY (credited), OFL fonts, own work, local-TTS output whose model licence allows it.
- No emoji as characters (fine as placeholders in `wip`).
- Source files in `assets-src/<id>/`; shipped files in `public/<id>/…` or imported from `site/<id>/`
  (imported files get hashed names). Audio: AAC `.m4a`; images: WebP/PNG/SVG sized for DPR 2;
  3D: glTF/GLB (Draco/meshopt optional), textures ≤1024².

## 7. Budgets (iPad 9th gen: A13, 3 GB RAM)

| budget | limit |
|---|---|
| JS per game | ≤300 KB gzip, excluding three.js (tree-shaken) |
| 3D scene | ≤60 k triangles on screen; DPR capped at 1.5 for WebGL (DOM/2D canvas: DPR ≤2) |
| page memory | ≤350 MB |
| frame rate | 60 fps for action games; no idle rAF loops (render on change) |
| input latency | visual + audio feedback ≤100 ms |
| first load | playable within 3 s on Wi-Fi; offline after the first visit (SW) |
| session | natural stop point every 10–15 min; no hard time limits/locks (Dad's rule) |

## 8. Validators and tests (required)

- Every game ships validators that read the **same** level/bank files and run the **same** logic
  the page uses (no copies): solvability, uniqueness, difficulty steps, coverage — see the plan for
  your game. Put them in `site/<id>/*.test.ts` (vitest) or engine tests; heavy ones as tools
  scripts under `site/<id>/tools/` that write to `~/kid-games-work/`.
- Browser tests: `site/<id>/tests/*.spec.ts`, picked up by `npm run test:smoke`. Use
  `tests/smoke/helpers.ts` (`instrument`, `watch`, `probe`, `shot`). Play through level 1 at least.
- The platform smoke test already checks your page loads cleanly in WebKit at 810×1080 and
  1080×810 with no console errors, no horizontal overflow, a ≥56 px back button and ≤1 AudioContext.
- Screenshot review: look at your screens in **both orientations** before saying "done" — on the iPad
  (810×1080, 1080×810) and on phones (Playwright WebKit `devices['iPhone 13']`, `devices['iPhone SE']`,
  and an 844×390 `isMobile`/`hasTouch` landscape context).

## 9. Definition of done (abridged from plan §6.8)

1. One-sentence training goal, curriculum anchor, evidence level (parent note).
2. Progression table: new concepts only at chapter start; review levels; "这关教什么" per level.
3. Automated validators on the real code, green.
4. First 3 levels learnable without reading; start gate; every instruction voiced; subtitles + 再听一遍.
5. Three hint levels (direction → partial demo → full demo + twin); one-tap undo/restart; no lives,
   timers or game-over in learning mode; mistakes show *why*.
6. Smoke + own tests green; screenshots reviewed in both orientations.
7. Licences recorded; no emoji characters; style matches the 星港 design system.
8. Natural stop point within 10–15 min; ≤3 parent metrics declared (via `session.mark`).
