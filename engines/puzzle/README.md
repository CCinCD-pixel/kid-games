# PuzzleKit (`@engines/puzzle`)

Owner: 星港搬运工 agent (rebuilt sokoban). Pure TypeScript, no DOM: the page, the Worker and the
validators run the same code (engines rule 2). Spec: docs/specs/sokoban.md §8.2.

## Modules (`src/`)

| file | provides |
|---|---|
| `types.ts` | `Dir` (0 up · 1 down · 2 left · 3 right — prototype order), `Level`, `State`, `Push`, `DeadType` |
| `level.ts` | `parseLevel(rows, id?)` (XSB + colour letters `A–D`/`a–d`/`1–4`; throws `LevelError` on G1 violations), `serialize`, simple dead squares per colour, `mirrorRows` / `flipRows` / `rot180Rows` / `transposeRows`, `twinOf(rows)` (first of mirror/flip/rot180 that is a *different puzzle*: static picture without the robot + normalised robot cell), `transformRows`, `canonicalHash(rows)` (min FNV over 8 symmetries) |
| `rules.ts` | `canon`, `boxMap`, `isSolved`, `walkDist`, `minReach`, `normalize`, `legalPushes(l, s, pruneDead?)`, `applyPush`, `stateKey`, `replayLurd(l, lurd)` |
| `path.ts` | `walkPath(l, s, to, heading?)` — fewest cells, then fewest turns, then up→right→down→left; `canReach`, `stepDir` |
| `deadlock.ts` | the four visible rules: `detectAll(l, boxes)` → every flagged crate `{cell, type}` (dead squares first: corner/wall; then frozen 2×2: pair/square); `detectDeadlock` (prototype `detect()` first hit, parity); `onDeadSquare`; `DEAD_PRIORITY` |
| `stategraph.ts` | `StateGraph.build(l, {maxStates, maxMs, signal?, keepEdges?})` (async, yields every 5 000 states) / `buildSync`; `togo(state)` ≥0 pushes left · −1 cannot finish (dead square: no lookup) · −2 unknown; `indexOf`, `stateAt`, `togoAt`, `successors` (keepEdges), `size`, `bytes` |
| `solver.ts` | `solvePushOptimal(l, from, {nodes, ms})` — push-optimal A* (sum of single-crate push distances, admissible + consistent; dead squares pruned) → `{pushes}` · `{dead}` · `{unknown}`; `solveOptimal(l, 'push'|'move', {maxStates, from})` — exact offline optimum (faithful port of the prototype, reproduces its LURD lines); `pushDistances`, `lurdForPush` |
| `hint.ts` | `nextPush(l, s, {graph?, reference?, refKeys?})` → `{push, kind: normal/unlock/park, togo}` · `{rewind}` · null; `referenceKeys`, `normalKey`, `hintKind` |
| `analyze.ts` | validators/tools only (never bundled by a page): `analyzeLevel` (opt, D, trapFirst, risk, switches/turns, greedy, sequential, false positives), `sequential`, `greedy`, `depthScan`, `within`, `switchesOf`, `replayStates`, `difficulty`, `levelDigest` (parity digest), `exploreGraph` |
| `fnv.ts` | `fnv1a32` |
| `kid.ts` | validators/tools only (re-exported by `analyze.ts`): the kid models of the full validator — `kidRates` (naive kid k1/k3, seed 11), `kidColorBlind` (cb), `learnerRate` (L1, q = 0.6, seed 13), `mulberry32`; a 1:1 port of the spec prototype (same RNG call order → the spec's numbers) |
| `index.ts` | the public API above (minus `analyze`) |

## Semantics (identical to the spec prototype `sokoban.mjs`)
- Push-states normalise the robot to the smallest cell of its reachable area; crates of one colour
  are interchangeable (sorted inside each colour group).
- The graph expands every state reachable from the start, including terminal states with an off-pad
  crate on a simple dead square (togo −1); a reverse BFS from solved states gives `togo`.
- Typed arrays only: open-addressing Int32 hash (load ≤ 0.6) over packed Uint16 keys, forward CSR
  while building, reverse CSR for the BFS, Int16 togo; edges are dropped after the build unless
  `keepEdges`. Measured (Node, 2026-10-06): C10 173 512 states, 2.65 s, 4.4 MB retained; every
  main level ≤ 260 states / ≤ 3 ms.

## Tests (`tests/`, vitest)
- `parity.test.ts` — every shipped push level equals the committed prototype fixture
  (`fixtures/sokoban-v1.json` = `node fixtures.mjs`): states, start togo, dead count, detector type
  counts, FNV digest over all states (C10 with `SOK_FULL=1`).
- `engine.test.ts` — parsing/G1, walking, the four rules (G6 zero false positives on every reachable
  state), graph togo(start) = optimum, A* = optimum, `nextPush` walks an optimal line, the exact
  solver reproduces the reference LURD lines, twins and canonical hashes.

## Not yet (build stage 2 of 星港搬运工)
`generator.ts` (`generatePuzzle(tier, seed, rooms, {colors, avoid})`, counted budgets only) and the
kid models of the full validator (k1/L1/cb) — the data formats and Worker protocol already allow them.
