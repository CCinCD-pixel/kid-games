# engines/

Reusable game engines shared by several games. A game imports them with the `@engines/<name>`
alias (`import { … } from '@engines/puzzle/grid'`). Platform services (audio, narration, saving,
input, logging, UI) live in `kit/`, not here.

| Engine | Folder | Provides | First user | Wave |
|---|---|---|---|---|
| StoryKit | `story/` | page JSON, pre-rasterised layers, per-character grid + pinyin, read modes, branching, word box, recording, coverage report | 山海故事匣 | W1 (lite) |
| ManipKit | `manip/` | number manipulatives: crystals/rods/boxes, number line, arrays, balance, bar model, coins | 火星基地 | W2 |
| BoardKit | `board/` | SVG board, input lock, AI in a Worker, puzzle player, draw rules, coach bubble, face-to-face mode | 棋手学院, 陆战棋 | W2 |
| VoxelKit | `voxel/` | low-poly three.js scenes, column-height grids, 90° snapped camera, raycast picking, render-on-change, context-loss handling | 月宫建造师, 玉兔编程 | W1 spike → W3 |
| PuzzleKit | `puzzle/` | grid model, undo/redo, budgeted Worker solver, hint protocol, level schema, `check-levels` validator | 星港搬运工 | W4 |

## Rules for every engine

1. **One owner.** The game agent that is the engine's first user owns the folder (listed above);
   other agents propose changes to the owner instead of editing it.
2. **Pure core, thin view.** Rules/state/solvers are plain TypeScript with no DOM access, so
   validators and vitest run the *same code* the page runs (plan §6.4: validators never use copies).
   Rendering lives in separate files (`view-*.ts`).
3. **No game content.** Levels, texts and art belong to the game (`content/<id>/`, `site/<id>/`).
4. **Deterministic.** Randomness only through `createRng()` from `@kit/rng`, seeded.
5. **Heavy work off the main thread.** Solvers/AI run in a Worker with a time/node budget and must
   never block input for more than one frame.
6. **Tests next to code:** `engines/<name>/*.test.ts` (picked up by `npm test`).
7. **Budgets (iPad 9th gen, A13, 3 GB):** see docs/GAME_AUTHORING.md §Budgets. An engine's share of
   a game's JS budget is counted against that game.

Each engine folder has a README with its API contract. Until code lands, the README is the spec.
