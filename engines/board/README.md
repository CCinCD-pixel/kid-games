# BoardKit (`@engines/board`)

Owner: 棋手学院 agent (chess). Also used by the 陆战棋 rewrite (military chess). Wave: W2.

## Scope
- SVG board renderer (square grids; 陆战棋 board graph with railways/camps/headquarters)
- **input lock** while the AI or an animation is moving (regression-tested: no double moves,
  no moving for the AI, no soft-locks)
- AI in a Worker with a time budget per level; engines stay perft-correct (chess move generator
  is the existing one, moved here, shared by page and tests)
- puzzle player (mate-in-N, tactics) with unique-solution check
- draw rules (repetition, 50-move, insufficient material) / 陆战棋 end rules
- coach bubble (via kit companion) with a measured false-alarm rate
- face-to-face mode (two players on one iPad: the far side's pieces/labels rotate 180°)

## Rules
- Rules engines are pure and deterministic; the page and the validators import the same file.
- Losing never triggers a celebration for the AI; the child's mistakes are shown, not scolded.

## Contract sketch
```ts
interface Rules<S, M> { initial(): S; moves(s: S): M[]; apply(s: S, m: M): S; result(s: S): 'ongoing' | 'win' | 'loss' | 'draw' }
createBoardView(host, { geometry, theme, orientation: 'self' | 'face-to-face' }): BoardView
createAiWorker(rulesModuleUrl: URL, { budgetMs }): { bestMove(s): Promise<M>; terminate(): void }
```
