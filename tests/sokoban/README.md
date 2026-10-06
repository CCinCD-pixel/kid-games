# tests/sokoban — dev-server tooling for 星港搬运工

The game's own browser tests live in `site/sokoban/tests/*.spec.ts` (picked up by `npm run test:smoke`
on the built site). These helpers run them, or take review screenshots, against a dev server — no build:

```sh
memory_pressure -Q | tail -1                       # ≥ 25 % free first
npx vite --port 5301 --strictPort                  # in another shell; stop it afterwards
npx playwright test -c tests/sokoban/playwright.dev.config.ts [-g <pattern>] [--project=portrait-810x1080]
node tests/sokoban/shoot.mjs name=/sokoban/?test=1\&level=2-5 [--full] [--only=portrait] [--click=<sel>] [--js=<expr>]
node tests/sokoban/firstrun.mjs [--landscape]      # start gate → opening → 0-1 by taps → result → 0-2, real time
node tests/sokoban/frames.mjs <level> enter        # entrance animation frames
node tests/sokoban/smokecheck.mjs                  # the platform smoke checks for /sokoban/ (errors, overflow, back button, AudioContexts)
node tests/sokoban/probe.mjs <steps.mjs> [--only=portrait|landscape]   # scripted QA: run a step file, take the shots it asks for
node tests/sokoban/size.mjs                         # build only /sokoban/ into ~/kid-games-work/size/sokoban, report gzip sizes vs budgets
node tests/sokoban/fix-r1-shots.mjs [--only=portrait] [--steps=undo,captions,meta,ghost]   # QA r1 fix shots + 0-1 ghost-hand timing → ~/kid-games-work/shots/sokoban/fix-r1/
```

Dev-only query flags (also with `?test=1`): `slowmo=N` (board animations N× slower, for frame-by-frame review),
`anim=real` (with `test=1`: real-time animation instead of instant), `dev=styleboard[&swatches=1]`.

Screenshots go to `~/kid-games-work/shots/sokoban/<project>/`. Pages are silent under automation
(kit/automute.ts). One browser at a time; every script closes it.
- `fix-r2-shots.mjs` — QA r2 fix screenshots (result-card sentences, portrait launch caption, hangar, order delivery beat, finale panorama, 维修中 node) → `~/kid-games-work/shots/sokoban/fix-r2/`. QA r2 regressions live in `site/sokoban/tests/r2.spec.ts` (undo/restart mid-push race, 维修中) and `stage2.spec.ts` ("voice (QA r2)").
