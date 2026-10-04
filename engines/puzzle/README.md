# PuzzleKit (`@engines/puzzle`)

Owner: 星港搬运工 agent (rebuilt sokoban). Wave: W4 (the rebuild may start it earlier).

## Scope
- grid model (walls, floor, goals, movable objects, actors) with stable serialisation
- undo / redo / restart that always works in one tap
- solver in a Worker with a node/time budget: full-state BFS and push-level BFS, deadlock
  detection; returns optimal push/move counts for the star thresholds
- hint protocol: H1 direction, H2 partial demo, H3 full demo + a twin level
- level schema (`content/<game>/levels/*.yaml|json`) with "这关教什么" (teaches) required
- `check-levels` validator: every level solvable within budget, optimal counts recorded, adjacent
  difficulty step ≤30 %, new elements only at chapter start (plan §3.0)

## Rules
- The validator parses the same level files and runs the same solver code the page uses.
- No lives, timers or game-over in learning mode; failure shows *why*, never the word 错.

## Contract sketch
```ts
parseLevel(src: string): Level
interface PuzzleState { apply(move: Dir): PuzzleState | null; isSolved(): boolean; key(): string }
solve(level: Level, budget: { nodes: number; ms: number }): Promise<{ moves: Dir[]; pushes: number } | null>
```
