# tools/sokoban — content tools for 星港搬运工

Plain Node (no TypeScript, no dependencies). The game and its validators read the same JSON files.

| tool | what it does |
|---|---|
| `check-levels.mjs [--full]` | Validates every shipped level with the game's own engine (`@engines/puzzle`, run through vitest because Node cannot import TS): G1–G10, the lesson assertions, the chapter curve, prototype parity (metrics, deadlock depths, state digests), palette gates. Writes `~/kid-games-work/reports/sokoban/levels-fast.txt` and `palette.txt`. `--full` adds the env-gated heavy checks (`SOK_FULL=1`: C10 graph, benches). |
| `SOK_FULL=1 npx vitest run site/sokoban/tools/check-levels.full.test.ts` | The FULL validator (spec §9.1/§9.2): kid models k1/k3 (seed 11), L1 (seed 13), cb — 400 runs each, ported 1:1 from the prototype (`engines/puzzle/src/kid.ts`) and asserted equal to the shipped `metrics` (±0.005); N1, N2, `naiveMax`, B1 role bands, B2, C4, C6 + the spec chapter means; G7 solves every 镜子仓库 twin (C10 too); C10 G2/G6/memory. Report: `~/kid-games-work/reports/sokoban/check-v1.txt`. |
| `SOK_FULL=1 npx vitest run site/sokoban/tools/hint-bench.full.test.ts` | Hint fallback bench (§9.3): 150 reachable states per level (40 per fallback-pool order), A* nodes p95 ≤ 15 000 / max ≤ 20 000. Report: `hint-bench.txt`. |
| `SOK_FULL=1 npx vitest run site/sokoban/tools/graph-bench.full.test.ts` | Full-graph pre-solve bench (§9.3): main ≤ 50 000 states / 0.8 s; C10 ≤ 200 000 / 5 s / 15 MB. Report: `graph-bench.txt`. |
| `SOK_GEN=1 npx vitest run site/sokoban/tools/gen-pools.full.test.ts` | Regenerates `content/sokoban/random-fallback.json` with the game's own generator (T1–T3 × 40, seeds 5000/6000/7000+), every order through G1–G9 + R. |
| `export-levels.mjs [--only=0,1,2,classic]` | Exports `content/sokoban/levels.json` / `classic.json` from the spec's prototype tools (`~/kid-games-work/specs/sokoban-tools/`, never modified). Default = the build-stage-1 set; stage 2 adds `3,4,cert`. |
| `narration-json.mjs [--check]` | `content/sokoban/narration.yaml` → `content/sokoban/lines.json` (the bundled text manifest: subtitles + system voice before the voice step makes clips). `--check` fails when out of date. |

After editing levels: `node tools/sokoban/export-levels.mjs && node tools/sokoban/check-levels.mjs`.
After editing narration: `node tools/sokoban/narration-json.mjs` (the voice step later builds the clips).

## v2 backlog (spec §11 — not in the first release; the data formats are ready)

Everything below is "add data + run the validators"; no engine change is needed (spec §11 last line):

- **第 5 章 彩色货单 / 第 6 章 总调度** — levels go into `levels.json` with `release: "v2"` (the page loads only
  `release: "v1"`; `src/data.ts`), chapters into `chapters.json` (same `release` filter). Colours already parse
  (`A–D/a–d`), render (5 crate colours + symbols on the style board) and pass the palette gates. Fix list per
  chapter (5-5 C1/C5, 6-3 C5, 6-7 and 6-5 B2) is in spec §11 #1–2; the "总调度员" finale hangs off 6-7.
- **大师塔 12 层** — `track: "tower"` / `role: "tower"` are in the level schema (`src/data.ts`); needs ≥ 6 distinct
  shells, L1-ordered floors (`check-levels.full.test.ts` already computes L1 for any level), a map tab.
- **随机 T4 特大货单 + 400-order pool** — `TIERS[4]` is in `engines/puzzle/src/generator.ts`; needs the larger
  rooms and an offline pool (`gen-pools.full.test.ts` with seeds 4000–4399), unlocked at 70 % of chapter 6.
- **Colours in 随机新仓库** — generator `colors` option exists; enable after chapter 5 (R10 decoy + N2).
- **v2 collection** — 4 cosmetics and 3 knowledge cards are already in `cosmetics.json` / `cards.json` with
  `release: "v2"` (never awarded in v1); 49 more narration lines (spec §7.3 end).
- **Platform switches** (spec §8.12): parent-page metrics, the voice pipeline reading `content/sokoban/`,
  music under `/audio/sokoban/music/`.
