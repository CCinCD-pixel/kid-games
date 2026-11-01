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

## Built so far (火星基地 round, 2026-10)
| file | model | invariants (fuzzed in `models.test.ts`, V14) |
|---|---|---|
| `tray.ts` | crystal tray: carts → 箱/棒/颗 (9 + machine entry) → press/pack, cut rod / **cut box** (`cutBox`, `openBoxBundle`, `moveStagedRod`), staging, ship, undo log, `fromValue` (K1.7 "库存车"), `normalizeTray` | total value conserved; rejected action = `null`, state untouched; undo/reset restore exactly; JSON round trip |
| `numberline.ts` | `renderNumberLine` (pure) + binder; no reading leak (V6 gate + frozen F1 mutant in `__fixtures__`) | exposed numerals ⊆ anchors, independent of the flag |
| `models.ts` | `counter` (3 rods + 仓灯), `pods` (equal groups), `array` (area, 转一转), `hop` (skip counting), `belt` (order cards) | value / area / card conservation; digits ≤ 9; 1000 only via the lamp |
Views live with the game (`site/mars-base/src/stages/*`): the models stay DOM-free so Node tests and bots drive exactly the code the child uses.

## numberline.ts — changes of QA fix-mars-r1
- **Geometry**: `trackY(h)` = `h - 52` on a short stage (< 330 px; the magnifier needs 190 px above the finger) and `70 %` of the height on a tall one; `scaleOf(w, h)` (1 … 1.7) scales everything drawn (the SVG viewBox is `w/k × h/k`, all constants stay in design px). Never compute the track from `height - 52` in tests: with `?test=1` the live control is `window.__nlCtl` (`flagToClientX(v)`, `trackClientY()`).
- **◀▶ nudges** sit above the flag (clamped to the stage), never over the numeral row; hidden in the feedback phase. Feedback labels (`差 N`, the target) are drawn above the ghost flag.
- **pointercancel / lostpointercapture** restore the flag to where it was before the touch and never call `onPlace` (iOS reports 0 / stale coordinates for a system-gesture cancel).
- **Demo** (`demoPlace(v, {delay, ms})`, `stopDemo()`): carries the flag from the left end to `v` with the magnifier up, never counts as a placement; any real touch stops it.
