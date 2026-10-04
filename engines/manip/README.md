# ManipKit (`@engines/manip`)

Owner: 火星基地 agent. First user: `site/mars-base/`. Wave: W2.

## Scope
Virtual manipulatives for number sense and early arithmetic, all drag-with-snap and tap-to-place
(kit/input), each with a pure model and a DOM/SVG view:
- 能量晶体 crystals (ones), 晶棒 rods (tens), 晶箱 boxes (hundreds) — compose/decompose, trade 10↔1
- number line with a magnifier flag (place, jump, compare)
- arrays (rows × columns; early multiplication)
- balance (equality, missing addend)
- bar model (part–whole, comparison)
- coins (RMB 1/5/10 角 and 元)

## Rules
- Models are serialisable (save/restore through `@kit/progress`) and validate their own invariants.
- Every manipulative supports "show why" playback (hint level H2/H3: partial / full demonstration).
- Hit targets ≥48 px, primary actions ≥64 px; works in both orientations without scrolling.

## Contract sketch
```ts
createCrystalTray(host, { value, max, onChange }): Manip<number>
createNumberLine(host, { min, max, step, marks }): Manip<number>
interface Manip<T> { value: T; set(v: T, animate?: boolean): void; demo(steps: DemoStep[]): Promise<void>; destroy(): void }
```
