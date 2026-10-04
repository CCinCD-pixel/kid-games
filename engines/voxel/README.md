# VoxelKit (`@engines/voxel`)

Owner: 月宫建造师 agent. Users: `site/moon-builder/`, later `site/rover-code/`. Wave: W1 spike, W3 live.

## Scope
- three.js scene setup with low-poly, flat-shaded materials (one shared material palette)
- column-height grid model (pure) + mesh builder with instancing / merged geometry
- camera that snaps between four 90° views (+ top view), gesture rotate with snap
- raycast picking of faces/cells with generous hit slop
- **render on change only** (no idle rAF loop); pause on `shell` pause
- WebGL context loss/restore handling (iPad evicts contexts under memory pressure)
- moon-surface theme (regolith ground, earth-rise sky) as default scene

## Budgets (hard)
≤60k triangles on screen, DPR capped at 1.5, ≤350 MB page memory, three.js not counted in the
300 KB gz game JS budget but tree-shaken (`import { … } from 'three'`, no `three/examples` barrels).

## Contract sketch
```ts
createVoxelView(canvas: HTMLCanvasElement, opts: { dprCap?: number; theme?: 'moon' }): VoxelView
interface VoxelView { setGrid(g: HeightGrid): void; snapTo(view: 0|1|2|3|'top'): Promise<void>; pick(x: number, y: number): Cell | null; render(): void; dispose(): void }
```
